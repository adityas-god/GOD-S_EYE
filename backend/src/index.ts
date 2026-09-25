import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import salesforceRouter from './microservices/salesforce/salesforceRoutes';
import grafanaRouter from './microservices/grafana/grafanaRoutes';
import siteRouter from './microservices/sites/siteRoutes';
import influxRouter from './microservices/influx/influxRoutes';
import mongoose from 'mongoose';
import { ensureDatabaseSeeded } from './seed/seedDatabase';

dotenv.config(); // Reloaded with GRAFANA_COOKIE support

const app = express();
const PORT = process.env.PORT || 5050;

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check (supports /health and /api/health)
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'operations-dashboard-api',
    version: '2.1.0-site-intelligence',
    services: ['Site Intelligence & Notes', 'Grafana Panel Rendering', 'Salesforce Incidents'],
    mongodb: 'Atlas Cluster: cluster0.ef4bjjj.mongodb.net'
  });
});

// --- CORE MICROSERVICES ---

// 1. Grafana Panel Rendering & Embed Microservice (Persist & retrieve Grafana dashboard links from Atlas)
app.use('/api/grafana', grafanaRouter);

// 2. Salesforce Incident & Calendar Microservice (Calendar severity, itemized cases, trends, sync)
app.use('/api/salesforce', salesforceRouter);

// 3. Site Intelligence & Metadata Microservice (VM IPs, CEM, Deployments, Dashboards, Slack & Notes)
app.use('/api/sites', siteRouter);

// 4. InfluxDB Telemetry Microservice (Direct InfluxQL query execution for il-influxdb2:80)
app.use('/api/influx', influxRouter);

// --- BACKWARDS COMPATIBLE LEGACY ROUTES ---
// Calendar
app.get('/api/calendar/:siteId', (req, res, next) => {
  req.url = `/calendar/${req.params.siteId}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  salesforceRouter(req, res, next);
});

// Tickets
app.get('/api/tickets/:siteId', (req, res, next) => {
  req.url = `/tickets/${req.params.siteId}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  salesforceRouter(req, res, next);
});
app.post('/api/tickets/sync', (req, res, next) => {
  req.url = '/sync';
  salesforceRouter(req, res, next);
});

// Trends & KPIs
app.get('/api/analytics/:siteId/trends', (req, res, next) => {
  req.url = `/trends/${req.params.siteId}`;
  salesforceRouter(req, res, next);
});


// ═══════════════════════════════════════════════════════════════════════
// GRAFANA REVERSE PROXY — serves ALL Grafana resources through localhost
// so the browser never makes cross-origin requests that hit CORS/XFO.
// ═══════════════════════════════════════════════════════════════════════

const GRAFANA_ORIGIN = process.env.GRAFANA_BASE_URL || 'https://cloudwatch.greymatter.greyorange.com';

/**
 * Dynamically resolves the target origin for proxied assets and API calls.
 * If the request came from an iframe embedding another host (like http://172.28.76.144:8088/),
 * this extracts that host from the Referer header (?url=...) or query param.
 */
function getTargetOrigin(req: express.Request): string {
  if (req.query?.url && typeof req.query.url === 'string') {
    try {
      const u = new URL(req.query.url);
      return u.origin;
    } catch (_) {}
  }
  if (req.headers['referer']) {
    try {
      const ref = new URL(req.headers['referer']);
      const targetParam = ref.searchParams.get('url');
      if (targetParam) {
        const u = new URL(targetParam);
        return u.origin;
      }
    } catch (_) {}
  }
  return GRAFANA_ORIGIN;
}

const DEFAULT_GRAFANA_COOKIE = 'grafana_session=29f08d8a79298c6261a279c6a3a1041f';

/**
 * Consolidates cookies for Grafana authentication.
 * Prevents stale or unauthenticated browser cookies on localhost from overriding the valid Grafana session.
 */
function getForwardCookies(req: express.Request): string {
  const configured = (process.env.GRAFANA_COOKIE || DEFAULT_GRAFANA_COOKIE).trim();
  const configuredPairs = configured.split(';').map(s => s.trim()).filter(Boolean);
  
  const cookieMap = new Map<string, string>();

  // Filter incoming browser cookies: do NOT let stale localhost cookies override configured session
  if (req.headers['cookie']) {
    const rawClient = req.headers['cookie'] as string;
    rawClient.split(';').forEach(part => {
      const trimmed = part.trim();
      if (!trimmed) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        const val = trimmed.substring(eqIdx + 1).trim();
        if (key !== 'grafana_session' && key !== 'grafana_session_expiry') {
          cookieMap.set(key, val);
        }
      }
    });
  }

  // Inject valid configured session cookie
  for (const pair of configuredPairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx !== -1) {
      const key = pair.substring(0, eqIdx).trim();
      const val = pair.substring(eqIdx + 1).trim();
      cookieMap.set(key, val);
    } else {
      cookieMap.set('grafana_session', pair);
    }
  }

  return Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

// Check live authentication status against Grafana
app.get('/api/grafana/session-status', async (req, res) => {
  const sessionVal = (process.env.GRAFANA_COOKIE || DEFAULT_GRAFANA_COOKIE).trim();
  const token = process.env.GRAFANA_API_TOKEN || '';
  const cookieStr = sessionVal.includes('=') ? sessionVal : `grafana_session=${sessionVal}`;

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 Chrome/122',
      'Cookie': cookieStr,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const r = await fetch(`${GRAFANA_ORIGIN}/api/login/ping`, { headers });
    return res.json({
      authenticated: r.status === 200,
      status: r.status,
      host: GRAFANA_ORIGIN,
      hasToken: Boolean(token),
      cookieSnippet: sessionVal ? sessionVal.substring(0, 18) + '...' : null
    });
  } catch (err: any) {
    return res.json({ authenticated: false, error: err.message });
  }
});

// Update Grafana session cookie or service account token dynamically
app.post('/api/grafana/update-session', async (req, res) => {
  const { cookie, token } = req.body;
  if (cookie !== undefined) {
    const cleaned = cookie.trim();
    process.env.GRAFANA_COOKIE = cleaned;
    
    // Update .env file
    try {
      const fs = await import('fs');
      const path = await import('path');
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('GRAFANA_COOKIE=')) {
          envContent = envContent.replace(/GRAFANA_COOKIE=.*/g, `GRAFANA_COOKIE=${cleaned}`);
        } else {
          envContent += `\nGRAFANA_COOKIE=${cleaned}`;
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
      }
    } catch (_) {}
  }

  if (token !== undefined) {
    const cleanedToken = token.trim();
    process.env.GRAFANA_API_TOKEN = cleanedToken;
    try {
      const fs = await import('fs');
      const path = await import('path');
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('GRAFANA_API_TOKEN=')) {
          envContent = envContent.replace(/GRAFANA_API_TOKEN=.*/g, `GRAFANA_API_TOKEN=${cleanedToken}`);
        } else {
          envContent += `\nGRAFANA_API_TOKEN=${cleanedToken}`;
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
      }
    } catch (_) {}
  }

  // Verify new credentials immediately
  const sessionVal = (process.env.GRAFANA_COOKIE || DEFAULT_GRAFANA_COOKIE).trim();
  const currentToken = process.env.GRAFANA_API_TOKEN || '';
  const cookieStr = sessionVal.includes('=') ? sessionVal : `grafana_session=${sessionVal}`;

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 Chrome/122',
      'Cookie': cookieStr,
    };
    if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;

    const r = await fetch(`${GRAFANA_ORIGIN}/api/login/ping`, { headers });
    return res.json({
      success: true,
      authenticated: r.status === 200,
      status: r.status,
      message: r.status === 200 ? 'Successfully authenticated with Grafana!' : `Session saved, but Grafana returned status ${r.status}`
    });
  } catch (err: any) {
    return res.json({ success: true, authenticated: false, error: err.message });
  }
});

const WEBPACK_PATCH_SCRIPT = `
<script>
  if (typeof window !== 'undefined') {
    // Intercept clicks on Sign In or login links inside the iframe so they open
    // in a new tab to avoid breaking inside the embedded frame
    document.addEventListener('click', function(e) {
      var el = e.target;
      var a = el && el.closest ? el.closest('a') : null;
      if (a) {
        var href = (a.getAttribute('href') || '').toLowerCase();
        var txt = (a.textContent || '').trim().toLowerCase();
        if (href.includes('/login') || href.includes('login') || txt.includes('sign in') || txt.includes('log in')) {
          e.preventDefault();
          e.stopPropagation();
          window.open('https://cloudwatch.greymatter.greyorange.com/login', '_blank');
        }
      }
    }, true);
  }
</script>`;

/**
 * Generic asset proxy — fetches any path from the resolved target origin server-side
 * and returns it with permissive CORS/frame headers stripped.
 * Used for /public/, /plugins/, /avatar/, /d/, /d-solo/, /error-page/, /login/
 */
async function grafanaAssetProxy(req: express.Request, res: express.Response, pathOverride?: string) {
  const assetPath = pathOverride ?? req.originalUrl;
  const currentOrigin = getTargetOrigin(req);
  const targetUrl = `${currentOrigin}${assetPath}`;

  try {
    const fetchHeaders: Record<string, string> = {
      'User-Agent': (req.headers['user-agent'] as string) || 'Mozilla/5.0 Chrome/122',
      'Accept': (req.headers['accept'] as string) || '*/*',
      'Accept-Encoding': 'identity',
      'Cache-Control': 'no-cache',
    };
    const cookies = getForwardCookies(req);
    if (cookies) fetchHeaders['Cookie'] = cookies;
    if (req.headers['authorization']) {
      fetchHeaders['Authorization'] = req.headers['authorization'] as string;
    } else if (process.env.GRAFANA_API_TOKEN && !cookies) {
      fetchHeaders['Authorization'] = `Bearer ${process.env.GRAFANA_API_TOKEN}`;
    }
    fetchHeaders['Referer'] = `${currentOrigin}/`;
    fetchHeaders['Origin'] = currentOrigin;

    const response = await fetch(targetUrl, { headers: fetchHeaders, redirect: 'follow' });

    // Strip blocking headers, add permissive ones
    res.status(response.status);
    res.removeHeader('X-Frame-Options');
    res.removeHeader('x-frame-options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('content-security-policy');
    res.setHeader('Content-Security-Policy',       'frame-ancestors *;');
    res.setHeader('Access-Control-Allow-Origin',   '*');
    res.setHeader('Access-Control-Allow-Methods',  'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',  'Content-Type, Authorization, Cookie');

    const rawCookies = (response.headers as any).getSetCookie ? (response.headers as any).getSetCookie() : response.headers.get('set-cookie');
    if (rawCookies) {
      const cookieList = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
      const rewritten = cookieList.map((c: string) =>
        c.replace(/;\s*domain=[^;]+/gi, '')
         .replace(/;\s*secure/gi, '')
         .replace(/;\s*samesite=[^;]+/gi, '; SameSite=Lax')
      );
      res.setHeader('Set-Cookie', rewritten);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType) res.setHeader('Content-Type', contentType);

    // Forward Cache-Control so assets are cached by the browser
    const cc = response.headers.get('cache-control');
    if (cc) res.setHeader('Cache-Control', cc);

    if (contentType.includes('text/html')) {
      let html = await response.text();
      html = html.replace(/<meta[^>]+http-equiv=["']?(?:X-Frame-Options|Content-Security-Policy)["']?[^>]*>/gi, '');
      html = html.replace(/if\s*\(\s*(?:window\.top|self|top)\s*!==?\s*(?:window\.self|window|self)\s*\)/gi, 'if (false)');
      const escOrigin = currentOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp(`(src|href)=["']${escOrigin}(/public|/avatar|/plugins|/static)`, 'gi'), '$1="$2');
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${WEBPACK_PATCH_SCRIPT}</head>`);
      } else {
        html = WEBPACK_PATCH_SCRIPT + html;
      }
      return res.send(html);
    }

    const buffer = await response.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.warn(`[Grafana Asset Proxy] Cannot fetch ${targetUrl}:`, err.message);
    res.setHeader('Content-Type', 'text/html');
    return res.status(502).send(`
      <!DOCTYPE html>
      <html>
        <body style="background:#0B0E14;color:#ECEFF4;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:16px;box-sizing:border-box;">
          <div style="text-align:center;max-width:400px;border:1px solid #232A39;border-radius:12px;padding:24px;background:#121722;">
            <p style="color:#FF7A00;font-size:16px;font-weight:bold;margin:0 0 8px;">Proxy Connection Notice</p>
            <p style="color:#94A3B8;font-size:12px;margin:0 0 12px;">Unable to reach target Grafana host.</p>
            <p style="color:#64748B;font-size:10px;word-break:break-all;margin:0;">${targetUrl}</p>
          </div>
        </body>
      </html>
    `);
  }
}

// ── Static asset & navigation routes — Grafana loads these via relative paths ──
app.use('/public',     (req, res) => grafanaAssetProxy(req, res));
app.use('/avatar',     (req, res) => grafanaAssetProxy(req, res));
app.use('/plugins',    (req, res) => grafanaAssetProxy(req, res));
app.use('/static',     (req, res) => grafanaAssetProxy(req, res));
app.use('/error-page', (req, res) => grafanaAssetProxy(req, res));
app.use('/login',      (req, res) => grafanaAssetProxy(req, res));
app.use('/logout',     (req, res) => grafanaAssetProxy(req, res));
app.use('/d',          (req, res) => grafanaAssetProxy(req, res));
app.use('/d-solo',     (req, res) => grafanaAssetProxy(req, res));

// ── HTML proxy — fetches the Grafana panel page and rewrites it for safe embedding ──
app.get('/api/proxy-dashboard', async (req, res) => {
  let targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing ?url= query parameter' });
  }

  // 1. Extract URL if an entire <iframe ...> snippet was passed
  const iframeMatch = targetUrl.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeMatch && iframeMatch[1]) {
    targetUrl = iframeMatch[1].trim();
  }
  targetUrl = targetUrl.replace(/^["']|["']$/g, '').replace(/&amp;/g, '&').trim();

  // 2. Auto-convert /d/ to /d-solo/ ONLY if an explicit panelId is present
  try {
    const parsed = new URL(targetUrl);
    const viewPanel = parsed.searchParams.get('viewPanel');
    if (viewPanel) {
      parsed.searchParams.delete('viewPanel');
      if (!parsed.searchParams.has('panelId')) {
        parsed.searchParams.set('panelId', viewPanel);
      }
    }
    // Only switch to solo panel mode if a specific panel was requested!
    // Full dashboard URLs without panelId must stay as /d/
    if (parsed.searchParams.has('panelId')) {
      if (parsed.pathname.match(/^\/d\/[^/]+/)) {
        parsed.pathname = parsed.pathname.replace(/^\/d\//, '/d-solo/');
      }
      if (!parsed.searchParams.has('__feature.dashboardSceneSolo')) {
        parsed.searchParams.set('__feature.dashboardSceneSolo', 'true');
      }
    } else {
      // For full dashboards, enable kiosk mode to remove outer chrome
      if (!parsed.searchParams.has('kiosk')) {
        parsed.searchParams.set('kiosk', 'tv');
      }
    }
    const fromParam = parsed.searchParams.get('from');
    const toParam = parsed.searchParams.get('to');
    if (fromParam && /^\d{12,13}$/.test(fromParam)) {
      parsed.searchParams.set('from', 'now-6h');
    }
    if (toParam && /^\d{12,13}$/.test(toParam)) {
      parsed.searchParams.set('to', 'now');
    }
    targetUrl = parsed.toString();
  } catch (_) {}

  try {
    const urlObj = new URL(targetUrl);
    const grafanaOriginForPage = urlObj.origin; // e.g. https://cloudwatch.greymatter.greyorange.com

    const fetchHeaders: Record<string, string> = {
      'User-Agent': (req.headers['user-agent'] as string) || 'Mozilla/5.0 Chrome/122',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Cache-Control': 'no-cache',
    };
    const cookies = getForwardCookies(req);
    if (cookies) fetchHeaders['Cookie'] = cookies;
    if (req.headers['authorization']) {
      fetchHeaders['Authorization'] = req.headers['authorization'] as string;
    } else if (process.env.GRAFANA_API_TOKEN && !cookies) {
      fetchHeaders['Authorization'] = `Bearer ${process.env.GRAFANA_API_TOKEN}`;
    }
    fetchHeaders['Referer'] = `${grafanaOriginForPage}/`;
    fetchHeaders['Origin'] = grafanaOriginForPage;

    const response = await fetch(targetUrl, { headers: fetchHeaders, redirect: 'follow' });

    // Strip ALL headers that block iframe embedding
    res.status(response.status);
    res.removeHeader('X-Frame-Options');
    res.removeHeader('x-frame-options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('content-security-policy');
    res.setHeader('Content-Security-Policy',      'frame-ancestors *;');
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');

    // Forward Set-Cookie header with domain stripped so localhost accepts Grafana auth
    const rawCookies = (response.headers as any).getSetCookie ? (response.headers as any).getSetCookie() : response.headers.get('set-cookie');
    if (rawCookies) {
      const cookieList = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
      const rewritten = cookieList.map((c: string) =>
        c.replace(/;\s*domain=[^;]+/gi, '')
         .replace(/;\s*secure/gi, '')
         .replace(/;\s*samesite=[^;]+/gi, '; SameSite=Lax')
      );
      res.setHeader('Set-Cookie', rewritten);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType) res.setHeader('Content-Type', contentType);

    if (!contentType.includes('text/html')) {
      const buffer = await response.arrayBuffer();
      return res.send(Buffer.from(buffer));
    }

    let html = await response.text();

    // ── Step 1: Strip CSP/XFO meta tags ──
    html = html.replace(/<meta[^>]+http-equiv=["']?(?:X-Frame-Options|Content-Security-Policy)["']?[^>]*>/gi, '');

    // ── Step 2: Neutralise frame-busting JS ──
    html = html.replace(/if\s*\(\s*(?:window\.top|self|top)\s*!==?\s*(?:window\.self|window|self)\s*\)/gi, 'if (false)');

    // ── Step 3: NO <base href> — it caused all assets to resolve to the Grafana
    //    origin (cross-origin), which CORS-blocked them. Assets must stay relative
    //    to localhost:5000 so they route through our /public, /plugins, /avatar proxy.

    // ── Step 4: Rewrite absolute Grafana URLs in the HTML to relative paths ──
    //    e.g.  src="https://cloudwatch.../public/build/x.js"  →  src="/public/build/x.js"
    const escOrigin = grafanaOriginForPage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`(src|href)=["']${escOrigin}(/public|/avatar|/plugins|/static)`, 'gi'), '$1="$2');
    // Also rewrite root-relative paths that already start with / (keep as-is — relative to localhost:5000)
    // No rewrite needed; they already route to our proxy routes above.

    // ── Step 5: Inject patch script for history routing, chunk loading and login interception ──
    let historyScript = '';
    try {
      const u = new URL(targetUrl);
      const targetPath = u.pathname + u.search;
      historyScript = `
<script>
  try {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', ${JSON.stringify(targetPath)});
    }
  } catch (e) {}
</script>`;
    } catch (_) {}

    const combinedPatch = historyScript + WEBPACK_PATCH_SCRIPT;
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${combinedPatch}</head>`);
    } else {
      html = combinedPatch + html;
    }

    return res.send(html);
  } catch (err: any) {
    console.warn(`[Proxy] Could not proxy ${targetUrl}:`, err.message);
    return res.status(502).json({
      error: 'Proxy Error', message: err.message, targetUrl,
      hint: 'Backend must be able to reach the Grafana host on the network.'
    });
  }
});

// ── Grafana API pass-through — forwards /api/* and /apis/* calls made by embedded panels ──
// Grafana Scenes and newer Grafana use /apis/dashboard.grafana.app/... to load dashboard schemas.
// We forward these requests with cookies and tokens to the resolved target Grafana host.
app.use(['/api', '/apis'], async (req, res, next) => {
  const knownPrefixes = ['/grafana', '/salesforce', '/proxy-dashboard', '/calendar', '/tickets', '/analytics', '/sites', '/influx'];
  if (req.baseUrl === '/api' && knownPrefixes.some(p => req.url.startsWith(p))) {
    return next();
  }

  const currentOrigin = getTargetOrigin(req);
  const targetUrl = `${currentOrigin}${req.baseUrl}${req.url}`;

  try {
    const forwardHeaders: Record<string, string> = {
      'User-Agent': (req.headers['user-agent'] as string) || 'Mozilla/5.0 Chrome/122',
      'Accept': (req.headers['accept'] as string) || '*/*',
    };
    const cookies = getForwardCookies(req);
    if (cookies) forwardHeaders['Cookie'] = cookies;
    if (req.headers['authorization']) {
      forwardHeaders['Authorization'] = req.headers['authorization'] as string;
    } else if (process.env.GRAFANA_API_TOKEN && !cookies) {
      forwardHeaders['Authorization'] = `Bearer ${process.env.GRAFANA_API_TOKEN}`;
    }
    let orgId = (req.query?.orgId as string) || (req.headers['x-grafana-org-id'] as string);
    if (!orgId && req.headers['referer']) {
      try {
        const ref = new URL(req.headers['referer']);
        orgId = ref.searchParams.get('orgId') || '';
      } catch (_) {}
    }
    forwardHeaders['X-Grafana-Org-Id'] = orgId || '1';
    forwardHeaders['Referer'] = `${currentOrigin}/`;
    forwardHeaders['Origin'] = currentOrigin;

    const fetchOptions: any = { method: req.method, headers: forwardHeaders };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
      forwardHeaders['Content-Type'] = 'application/json';
    }

    const response = await fetch(targetUrl, fetchOptions);
    console.log(`[Grafana API Forwarder] ${req.method} ${targetUrl} -> status: ${response.status}`);
    res.status(response.status);
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Grafana-Org-Id');

    const rawCookies = (response.headers as any).getSetCookie ? (response.headers as any).getSetCookie() : response.headers.get('set-cookie');
    if (rawCookies) {
      const cookieList = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
      const rewritten = cookieList
        .filter((c: string) => !c.includes('grafana_session=deleted'))
        .map((c: string) =>
          c.replace(/;\s*domain=[^;]+/gi, '')
           .replace(/;\s*secure/gi, '')
           .replace(/;\s*samesite=[^;]+/gi, '; SameSite=Lax')
        );
      if (rewritten.length > 0) {
        res.setHeader('Set-Cookie', rewritten);
      }
    }

    const ct = response.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);

    const buffer = await response.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    // Fallback for datasource queries when Grafana is unreachable
    if (req.url.startsWith('/ds/query')) {
      const now = Date.now();
      const tp  = [now-120000, now-90000, now-60000, now-30000, now];
      return res.json({
        results: {
          A: { frames: [{ schema: { fields: [{ name:'time',type:'time' },{ name:'value',type:'number' }] }, data: { values: [tp,[2,2,2,2,2]] } }] }
        }
      });
    }
    return next();
  }
});

// Fallback: If not an internal app route, forward GET requests to Grafana proxy
app.use((req, res) => {
  const isInternalApi = req.originalUrl.startsWith('/api/') && ['/grafana', '/salesforce', '/proxy-dashboard', '/calendar', '/tickets', '/analytics', '/sites', '/influx'].some(p => req.originalUrl.startsWith(`/api${p}`));
  if (req.method === 'GET' && !isInternalApi) {
    return grafanaAssetProxy(req, res);
  }
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.originalUrl} not found` });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server exception:', err);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

const MONGODB_URI = process.env.MONGODB_URI || 
  'mongodb+srv://adityasctr_db_user:ydv9XNaewJtaQjYC@cluster0.ef4bjjj.mongodb.net/operations_db?retryWrites=true&w=majority';

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Operations Dashboard Microservices API running on port ${PORT}`);
  console.log(`🎯 Health Check: http://localhost:${PORT}/health`);
  console.log(`📦 Active Services: Grafana Panel Rendering, Salesforce Incidents`);
  console.log(`📊 Theme: Industrial Grey & Vivid Orange`);
  console.log(`=======================================================`);
  
  // Connect Mongoose to MongoDB Atlas
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✅ Connected to MongoDB Atlas: cluster0.ef4bjjj.mongodb.net/operations_db');
      ensureDatabaseSeeded().catch(err => console.warn('MongoDB Atlas auto-seed notice:', err.message));
    })
    .catch(err => console.warn('MongoDB Atlas connection notice:', err.message));
});

export default app;
