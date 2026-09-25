import React, { useState, useEffect, useCallback } from 'react';
import { 
  Cpu, 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Wifi, 
  WifiOff, 
  Terminal, 
  ChevronDown, 
  ChevronUp, 
  Server, 
  Layers, 
  Database,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';

interface HostCpuData {
  host: string;
  cpus: number;
  time?: string;
}

interface TestCpuResponse {
  success: boolean;
  host: string;
  db: string;
  queryMode: string;
  query: string;
  durationMs: number;
  panelMeta: {
    id: number;
    title: string;
    type: string;
    calcs: string[];
    colorMode: string;
    statusColor: 'green' | 'red';
    thresholdAlert: boolean;
  };
  statResult: {
    totalCpus: number;
    unit: string;
    hostsCount: number;
    hostBreakdown: HostCpuData[];
    pointsCount: number;
    isSimulated: boolean;
  };
  diagnostics: {
    status: number;
    ok: boolean;
    error?: string;
    seriesFound: number;
    statementId: number | null;
  };
  raw: any;
}

interface TotalCpusStatPanelProps {
  initialHost?: string;
  initialDb?: string;
  onClose?: () => void;
}

export const TotalCpusStatPanel: React.FC<TotalCpusStatPanelProps> = ({
  initialHost = 'http://il-influxdb2:80',
  initialDb = 'apotekprod-prod',
  onClose
}) => {
  const [host, setHost] = useState<string>(initialHost);
  const [db, setDb] = useState<string>(initialDb);
  const [availableDbs, setAvailableDbs] = useState<string[]>([]);
  const [queryMode, setQueryMode] = useState<'instant' | 'timeseries' | 'raw' | 'custom'>('instant');
  const [customQuery, setCustomQuery] = useState<string>(
    'SELECT mean("n_cpus") AS "mean_n_cpus" FROM "system" WHERE ("host" =~ /^$Host$/) AND $timeFilter GROUP BY time($interval),host fill(null)'
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [pingLatency, setPingLatency] = useState<number | null>(null);

  const [data, setData] = useState<TestCpuResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [copiedQuery, setCopiedQuery] = useState<boolean>(false);

  // 1. Ping Host to verify network connection
  const checkPing = useCallback(async (targetHost: string) => {
    setIsPinging(true);
    try {
      const res = await fetch(`/api/influx/ping?host=${encodeURIComponent(targetHost)}`);
      const json = await res.json();
      setIsOnline(json.online);
      setPingLatency(json.durationMs);
    } catch {
      setIsOnline(false);
    } finally {
      setIsPinging(false);
    }
  }, []);

  // 2. Discover Databases
  const fetchDatabases = useCallback(async (targetHost: string) => {
    try {
      const res = await fetch(`/api/influx/databases?host=${encodeURIComponent(targetHost)}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.databases)) {
        setAvailableDbs(json.databases);
        if (json.recommendedDb && (!db || db === 'apotekprod-prod')) {
          setDb(json.recommendedDb);
        }
      }
    } catch (_) {}
  }, [db]);

  // 3. Execute the "Total CPUs" light query
  const executeQuery = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      let url = `/api/influx/test-cpus?host=${encodeURIComponent(host)}&db=${encodeURIComponent(db)}&mode=${queryMode}`;
      if (queryMode === 'custom') {
        url += `&query=${encodeURIComponent(customQuery)}`;
      }

      const res = await fetch(url);
      const json: TestCpuResponse = await res.json();

      setData(json);
      if (!json.success && json.diagnostics?.error) {
        setErrorMessage(json.diagnostics.error);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to connect to Influx API route');
    } finally {
      setIsLoading(false);
    }
  }, [host, db, queryMode, customQuery]);

  // Initial load
  useEffect(() => {
    checkPing(host);
    fetchDatabases(host);
    executeQuery();
  }, []);

  const handleCopyQuery = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2000);
  };

  const totalCpus = data?.statResult?.totalCpus ?? 8;
  const isThresholdAlert = totalCpus >= 80;
  const statBg = isThresholdAlert 
    ? 'bg-gradient-to-br from-red-950/80 via-red-900/40 to-black border-red-600/60 shadow-[0_0_20px_rgba(239,68,68,0.25)]' 
    : 'bg-gradient-to-br from-emerald-950/60 via-[#0A1A14] to-black border-emerald-600/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]';

  const statNumberColor = isThresholdAlert ? 'text-red-400' : 'text-emerald-400';

  return (
    <div className="w-full bg-[#0C101A] border border-[#212B3E] rounded-xl p-3 font-mono shadow-2xl flex flex-col gap-2.5 select-none">
      
      {/* Top Header & Actions */}
      <div className="flex items-center justify-between border-b border-[#1E273A] pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-[#162030] text-[#FF7A00]">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white uppercase tracking-wider">
                Panel #84: Total CPUs (InfluxQL Stat)
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/40 font-bold">
                LIGHT QUERY TEST
              </span>
            </div>
            <span className="text-[10px] text-gray-400">
              Host: <code className="text-amber-400">{host}</code> &bull; Measurement: <code className="text-blue-400">system</code> &bull; Field: <code className="text-emerald-400">n_cpus</code>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Online status indicator */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#131A26] border border-[#232F42] text-[10px]">
            {isOnline === true ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 font-bold">Reachable ({pingLatency}ms)</span>
              </>
            ) : isOnline === false ? (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-red-400 font-bold">Host Offline / VPN Required</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-2.5 h-2.5 text-gray-400 animate-spin" />
                <span className="text-gray-400">Pinging...</span>
              </>
            )}
          </div>

          <button
            onClick={() => setShowConfig(!showConfig)}
            className="text-[10px] px-2 py-1 rounded bg-[#162030] hover:bg-[#202E45] text-gray-300 border border-[#24334C] transition-colors"
          >
            {showConfig ? 'Hide Config' : 'Query Settings'}
          </button>

          <button
            onClick={executeQuery}
            disabled={isLoading}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded bg-[#FF7A00] hover:bg-[#FF8C24] text-white font-bold transition-all shadow-sm disabled:opacity-50"
          >
            <Play className={`w-3 h-3 ${isLoading ? 'animate-spin' : 'fill-white'}`} />
            <span>{isLoading ? 'Querying...' : 'Run Query'}</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded bg-[#162030]"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Expandable Configuration Toolbar */}
      {showConfig && (
        <div className="bg-[#090D15] p-2.5 rounded-lg border border-[#1C2538] flex flex-col gap-2 text-[10px] animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="text-gray-400 block mb-0.5 font-bold">Influx Host URL:</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="http://il-influxdb2:80"
                className="w-full bg-[#111722] border border-[#232F42] focus:border-[#FF7A00] text-white px-2 py-1 rounded font-mono outline-none"
              />
            </div>

            <div>
              <label className="text-gray-400 block mb-0.5 font-bold">Target Database ($SiteDB):</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={db}
                  onChange={(e) => setDb(e.target.value)}
                  placeholder="apotekprod-prod"
                  className="flex-1 bg-[#111722] border border-[#232F42] focus:border-[#FF7A00] text-white px-2 py-1 rounded font-mono outline-none"
                />
                {availableDbs.length > 0 && (
                  <select
                    onChange={(e) => setDb(e.target.value)}
                    value={db}
                    className="bg-[#162030] border border-[#232F42] text-gray-300 text-[9px] px-1 rounded outline-none"
                  >
                    {availableDbs.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div>
              <label className="text-gray-400 block mb-0.5 font-bold">Query Strategy:</label>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setQueryMode('instant')}
                  className={`px-1.5 py-1 rounded text-center font-bold border transition-colors ${
                    queryMode === 'instant'
                      ? 'bg-[#FF7A00]/20 border-[#FF7A00] text-[#FF7A00]'
                      : 'bg-[#111722] border-[#232F42] text-gray-400 hover:text-white'
                  }`}
                >
                  ⚡ Ultra-Light
                </button>
                <button
                  type="button"
                  onClick={() => setQueryMode('timeseries')}
                  className={`px-1.5 py-1 rounded text-center font-bold border transition-colors ${
                    queryMode === 'timeseries'
                      ? 'bg-[#FF7A00]/20 border-[#FF7A00] text-[#FF7A00]'
                      : 'bg-[#111722] border-[#232F42] text-gray-400 hover:text-white'
                  }`}
                >
                  ⏱️ 15m Window
                </button>
                <button
                  type="button"
                  onClick={() => setQueryMode('custom')}
                  className={`px-1.5 py-1 rounded text-center font-bold border transition-colors ${
                    queryMode === 'custom'
                      ? 'bg-[#FF7A00]/20 border-[#FF7A00] text-[#FF7A00]'
                      : 'bg-[#111722] border-[#232F42] text-gray-400 hover:text-white'
                  }`}
                >
                  🛠️ Raw SQL
                </button>
              </div>
            </div>
          </div>

          {queryMode === 'custom' && (
            <div>
              <label className="text-gray-400 block mb-0.5 font-bold">Custom InfluxQL Expression:</label>
              <textarea
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                rows={2}
                className="w-full bg-[#111722] border border-[#232F42] focus:border-[#FF7A00] text-amber-300 p-1.5 rounded font-mono text-[9px] outline-none"
              />
            </div>
          )}
        </div>
      )}

      {/* Main Stat Panel & Metrics Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        
        {/* Left Side: The Rendered Grafana Stat Panel (matching Panel #84 specification) */}
        <div className="lg:col-span-5 flex flex-col">
          <div className={`flex-1 rounded-xl border p-4 flex flex-col justify-between transition-all ${statBg}`}>
            
            {/* Top Card Label */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span>Total CPUs</span>
              </span>
              <span className="text-[8.5px] px-2 py-0.5 rounded bg-black/40 border border-white/10 text-gray-300 uppercase font-bold">
                stat &bull; lastNotNull
              </span>
            </div>

            {/* Giant Metric Display (Horizontal Orientation as per spec) */}
            <div className="my-3 flex items-baseline justify-center gap-2">
              <span className={`text-5xl font-black tracking-tight ${statNumberColor}`}>
                {totalCpus}
              </span>
              <span className="text-sm font-bold text-gray-400 uppercase">
                CPUs
              </span>
            </div>

            {/* Threshold Status Bar */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[9px]">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isThresholdAlert ? 'bg-red-500 animate-ping' : 'bg-emerald-400'}`} />
                <span className={isThresholdAlert ? 'text-red-400 font-bold' : 'text-emerald-300 font-semibold'}>
                  {isThresholdAlert ? 'High CPU Pool (Threshold >= 80)' : 'Nominal Capacity (Threshold < 80)'}
                </span>
              </div>
              <span className="text-gray-400">
                {data?.statResult?.hostsCount ? `${data.statResult.hostsCount} Hosts Active` : '1 Host'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Telemetry Breakdown & Query Execution Details */}
        <div className="lg:col-span-7 flex flex-col gap-2 bg-[#080B12] rounded-xl border border-[#1A2233] p-3">
          
          {/* Query Summary & Duration */}
          <div className="flex items-center justify-between text-[10px] border-b border-[#1A2233] pb-1.5">
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-[#FF7A00]" />
              <span className="font-bold text-gray-200">Executed InfluxQL:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Latency:</span>
              <span className="text-emerald-400 font-bold">{data?.durationMs ?? 0}ms</span>
              <button
                onClick={() => handleCopyQuery(data?.query || '')}
                className="text-gray-400 hover:text-white p-1 rounded bg-[#131A26] flex items-center gap-1 text-[8.5px]"
                title="Copy InfluxQL Query"
              >
                {copiedQuery ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                <span>{copiedQuery ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Active Query Code Block */}
          <div className="bg-[#04060A] p-2 rounded border border-[#161E2E] font-mono text-[9px] text-amber-300/90 break-all overflow-x-auto">
            <code>{data?.query || 'Loading query...'}</code>
          </div>

          {/* Hosts Breakdown Table */}
          <div className="flex-1 flex flex-col min-h-[75px]">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Server className="w-3 h-3 text-cyan-400" />
              <span>Host Breakdown ($tag_host):</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 overflow-y-auto max-h-[85px] no-scrollbar">
              {data?.statResult?.hostBreakdown?.map((h, idx) => (
                <div key={idx} className="bg-[#0F1420] border border-[#1F293A] rounded px-2 py-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span className="text-[9.5px] text-gray-200 truncate font-semibold">{h.host}</span>
                  </div>
                  <span className="text-[10px] font-black text-emerald-400 shrink-0">
                    {h.cpus} cpus
                  </span>
                </div>
              )) || (
                <div className="text-gray-500 text-[9px] italic p-1">No host breakdown available</div>
              )}
            </div>
          </div>

          {/* Diagnostics and Troubleshooting */}
          {errorMessage && (
            <div className="bg-amber-950/40 border border-amber-800/60 rounded p-2 text-[9px] text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block">Network Diagnostic:</span>
                <span>{errorMessage}</span>
                <span className="block mt-0.5 text-gray-400">
                  Tip: Ensure your machine is connected to the site VPN so the internal DNS name <code className="text-amber-200">il-influxdb2:80</code> resolves, or enter its numeric IP.
                </span>
              </div>
            </div>
          )}

          {/* Toggle Raw JSON Response */}
          <div className="pt-1 border-t border-[#1A2233] flex items-center justify-between text-[9px]">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-gray-400 hover:text-white flex items-center gap-1 font-bold"
            >
              <span>{showRaw ? 'Hide Raw Influx Response' : 'Inspect Raw Influx JSON'}</span>
              {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <span className="text-gray-500">Database: {data?.db || db}</span>
          </div>

          {showRaw && (
            <pre className="bg-[#020408] border border-[#161D2B] rounded p-2 text-[8px] text-cyan-300 overflow-x-auto max-h-36 no-scrollbar">
              {JSON.stringify(data?.raw || data, null, 2)}
            </pre>
          )}

        </div>
      </div>

    </div>
  );
};
