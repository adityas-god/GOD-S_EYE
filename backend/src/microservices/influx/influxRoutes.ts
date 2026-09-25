import { Router, Request, Response } from 'express';

const router = Router();

const DEFAULT_INFLUX_HOST = process.env.INFLUX_HOST || 'http://il-influxdb2:80';

/**
 * Replaces Grafana template variables in raw queries with light, sensible defaults:
 * - $Host, /^$Host$/, $host -> .*
 * - $timeFilter -> time > now() - 1h
 * - $interval, $__interval -> 1m
 * - fill(null)
 */
export function resolveGrafanaQuery(query: string, options?: { host?: string; timeWindow?: string; interval?: string }): string {
  let q = query;
  const hostPattern = options?.host || '.*';
  const timeWindow = options?.timeWindow || 'time > now() - 1h';
  const interval = options?.interval || '1m';

  // Replace Grafana regex host filter: ("host" =~ /^$Host$/) or ("host" =~ /$Host/) or host = '$Host'
  q = q.replace(/\("host"\s*=~\s*\/\^\$Host\$\/\)/gi, `("host" =~ /${hostPattern}/)`);
  q = q.replace(/\("host"\s*=~\s*\/[^/]*\$Host[^/]*\/\)/gi, `("host" =~ /${hostPattern}/)`);
  q = q.replace(/\$Host/g, hostPattern);

  // Replace $timeFilter
  q = q.replace(/\$timeFilter/gi, timeWindow);

  // Replace $interval, $__interval
  q = q.replace(/\$__interval/gi, interval);
  q = q.replace(/\$interval/gi, interval);

  return q.trim();
}

/**
 * Executes an InfluxQL query against InfluxDB v1 / v2 compatibility API.
 */
async function queryInfluxDB(host: string, query: string, db?: string, timeoutMs: number = 5000): Promise<{
  status: number;
  ok: boolean;
  data?: any;
  rawText?: string;
  error?: string;
  host: string;
  durationMs: number;
}> {
  const targetHost = host.replace(/\/+$/, '');
  const urlObj = new URL(`${targetHost}/query`);
  urlObj.searchParams.set('q', query);
  if (db) {
    urlObj.searchParams.set('db', db);
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(urlObj.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Operations-Dashboard-Influx-Client/1.0'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;
    const text = await res.text();

    try {
      const parsed = JSON.parse(text);
      return { 
        status: res.status, 
        ok: res.ok, 
        data: parsed, 
        host: targetHost, 
        durationMs 
      };
    } catch {
      return { 
        status: res.status, 
        ok: res.ok, 
        rawText: text, 
        host: targetHost, 
        durationMs 
      };
    }
  } catch (err: any) {
    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');
    const causeStr = err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : '';
    return {
      status: 502,
      ok: false,
      error: isTimeout 
        ? `Connection timed out to ${targetHost} after ${timeoutMs}ms. Verify VPN or host reachability.` 
        : `Network error connecting to ${targetHost}: ${err.message}${causeStr}`,
      host: targetHost,
      durationMs
    };
  }

}

/**
 * 1. Health check & Ping InfluxDB
 * GET /api/influx/ping?host=http://il-influxdb2:80
 */
router.get('/ping', async (req: Request, res: Response) => {
  const host = (req.query.host as string) || DEFAULT_INFLUX_HOST;
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const r = await fetch(`${host.replace(/\/+$/, '')}/ping`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;

    return res.json({
      success: true,
      online: r.status === 204 || r.status === 200,
      statusCode: r.status,
      host,
      durationMs,
      influxVersion: r.headers.get('x-influxdb-version') || '1.x'
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return res.json({
      success: false,
      online: false,
      host,
      durationMs,
      error: `${err.message}${err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : ''}`
    });
  }
});


/**
 * 2. Discover available databases
 * GET /api/influx/databases?host=http://il-influxdb2:80
 */
router.get('/databases', async (req: Request, res: Response) => {
  const host = (req.query.host as string) || DEFAULT_INFLUX_HOST;
  const result = await queryInfluxDB(host, 'SHOW DATABASES');

  if (result.ok && result.data?.results?.[0]?.series?.[0]?.values) {
    const allDbs: string[] = result.data.results[0].series[0].values.map((v: any[]) => v[0]);
    const userDbs = allDbs.filter(d => d !== '_internal');
    return res.json({ 
      success: true, 
      host, 
      databases: allDbs, 
      recommendedDb: userDbs[0] || allDbs[0] || 'apotekprod-prod',
      durationMs: result.durationMs 
    });
  }

  return res.json({
    success: false,
    host,
    error: result.error || 'Could not fetch databases',
    durationMs: result.durationMs,
    details: result
  });
});

/**
 * 3. Discover measurements in a database
 * GET /api/influx/measurements?host=http://il-influxdb2:80&db=apotekprod-prod
 */
router.get('/measurements', async (req: Request, res: Response) => {
  const host = (req.query.host as string) || DEFAULT_INFLUX_HOST;
  const db = (req.query.db as string) || 'apotekprod-prod';
  const result = await queryInfluxDB(host, 'SHOW MEASUREMENTS', db);

  if (result.ok && result.data?.results?.[0]?.series?.[0]?.values) {
    const measurements: string[] = result.data.results[0].series[0].values.map((v: any[]) => v[0]);
    return res.json({ success: true, host, db, measurements, durationMs: result.durationMs });
  }

  return res.json({
    success: false,
    host,
    db,
    error: result.error || 'Could not fetch measurements',
    durationMs: result.durationMs
  });
});

/**
 * 4. Test the "Total CPUs" light query from the user's panel definition
 * GET /api/influx/test-cpus
 * 
 * Target Panel:
 * id: 84, title: "Total CPUs", type: "stat"
 * Measurement: "system", Field: "n_cpus"
 */
router.get('/test-cpus', async (req: Request, res: Response) => {
  const host = (req.query.host as string) || DEFAULT_INFLUX_HOST;
  let targetDb = (req.query.db as string) || (req.query.siteDB as string);
  const mode = (req.query.mode as string) || 'instant'; // 'instant' | 'timeseries' | 'raw'
  const customQuery = req.query.query as string;

  // 1. If DB not provided, discover it automatically
  if (!targetDb) {
    const dbCheck = await queryInfluxDB(host, 'SHOW DATABASES', undefined, 3000);
    if (dbCheck.ok && dbCheck.data?.results?.[0]?.series?.[0]?.values) {
      const dbs: string[] = dbCheck.data.results[0].series[0].values.map((v: any[]) => v[0]);
      // Prioritize apotekprod-prod or telegraf or first non-internal
      targetDb = dbs.find(d => d.includes('apotek') || d.includes('prod')) || 
                 dbs.find(d => d !== '_internal') || 
                 dbs[0] || 
                 'apotekprod-prod';
    } else {
      targetDb = 'apotekprod-prod';
    }
  }

  // 2. Formulate very light query
  let lightQuery: string;

  if (customQuery) {
    lightQuery = resolveGrafanaQuery(customQuery, {
      host: (req.query.hostFilter as string) || '.*',
      timeWindow: (req.query.timeWindow as string) || 'time > now() - 1h',
      interval: '1m'
    });
  } else if (mode === 'timeseries') {
    // Light time-series query: recent 15 minutes only, 1m groups, limit 10 points
    lightQuery = 'SELECT mean("n_cpus") AS "mean_n_cpus" FROM "system" WHERE time > now() - 15m GROUP BY time(1m),host fill(null) LIMIT 10';
  } else if (mode === 'raw') {
    // Single row table scan
    lightQuery = 'SELECT "n_cpus" FROM "system" ORDER BY time DESC LIMIT 1';
  } else {
    // 'instant' mode (ULTRA LIGHT): retrieves only the last point grouped by host in <5ms
    lightQuery = 'SELECT last("n_cpus") AS "mean_n_cpus" FROM "system" GROUP BY host';
  }

  const result = await queryInfluxDB(host, lightQuery, targetDb, 5000);

  // 3. Parse and aggregate results according to panel spec
  // (Panel: calcs: ["lastNotNull"], thresholds: green < 80, red >= 80)
  let totalCpuCount = 0;
  let maxCpuHost = '';
  const hostBreakdown: { host: string; cpus: number; time?: string }[] = [];
  const points: { time: string; value: number; host: string }[] = [];

  if (result.ok && result.data?.results?.[0]?.series) {
    const seriesList = result.data.results[0].series;
    
    seriesList.forEach((s: any) => {
      const hostName = s.tags?.host || 'host-01';
      const colIdx = s.columns?.indexOf('mean_n_cpus') ?? 
                     (s.columns?.indexOf('last') ?? 
                     (s.columns?.indexOf('n_cpus') ?? 1));
      
      const values = s.values || [];
      // Get last not null value (as per panel JSON calcs: ["lastNotNull"])
      let lastVal: number | null = null;
      let lastTime: string = '';

      for (let i = values.length - 1; i >= 0; i--) {
        const v = values[i];
        if (v && v[colIdx] !== null && v[colIdx] !== undefined) {
          lastVal = Number(v[colIdx]);
          lastTime = v[0];
          break;
        }
      }

      if (lastVal !== null && !isNaN(lastVal)) {
        hostBreakdown.push({ host: hostName, cpus: lastVal, time: lastTime });
        totalCpuCount += lastVal;
        if (!maxCpuHost) maxCpuHost = hostName;
      }

      values.forEach((v: any[]) => {
        if (v[colIdx] !== null && v[colIdx] !== undefined) {
          points.push({ time: v[0], value: Number(v[colIdx]), host: hostName });
        }
      });
    });
  }

  // If query succeeded but returned 0 series (e.g. empty test measurement),
  // provide nominal diagnostic value
  const finalCpuValue = hostBreakdown.length > 0 ? totalCpuCount : 8;
  const isHealthy = finalCpuValue < 80; // Panel threshold: red >= 80

  return res.json({
    success: result.ok,
    host,
    db: targetDb,
    queryMode: mode,
    query: lightQuery,
    durationMs: result.durationMs,
    panelMeta: {
      id: 84,
      title: 'Total CPUs',
      type: 'stat',
      calcs: ['lastNotNull'],
      colorMode: 'background',
      statusColor: isHealthy ? 'green' : 'red',
      thresholdAlert: finalCpuValue >= 80
    },
    statResult: {
      totalCpus: finalCpuValue,
      unit: 'CPUs',
      hostsCount: hostBreakdown.length,
      hostBreakdown: hostBreakdown.length > 0 ? hostBreakdown : [{ host: 'node-01', cpus: 8 }],
      pointsCount: points.length,
      isSimulated: !result.ok || hostBreakdown.length === 0
    },
    diagnostics: {
      status: result.status,
      ok: result.ok,
      error: result.error,
      seriesFound: result.data?.results?.[0]?.series?.length || 0,
      statementId: result.data?.results?.[0]?.statement_id ?? null
    },
    raw: result.data || result.rawText || null
  });
});

/**
 * 5. Generic InfluxDB query endpoint
 * POST /api/influx/query
 * Body: { host?: string, db?: string, query: string }
 */
router.post('/query', async (req: Request, res: Response) => {
  const { host = DEFAULT_INFLUX_HOST, db, query, hostFilter, timeWindow } = req.body;

  if (!query) {
    return res.status(400).json({ success: false, error: 'Missing query parameter in body' });
  }

  const resolved = resolveGrafanaQuery(query, {
    host: hostFilter,
    timeWindow: timeWindow
  });

  const result = await queryInfluxDB(host, resolved, db);
  return res.status(result.status || 200).json({
    success: result.ok,
    host,
    db,
    originalQuery: query,
    resolvedQuery: resolved,
    durationMs: result.durationMs,
    result: result.data || result.rawText,
    error: result.error
  });
});

export default router;

