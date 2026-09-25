import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Link, 
  ExternalLink, 
  RefreshCw, 
  Sparkles, 
  Check, 
  Maximize2, 
  ZoomIn, 
  ZoomOut, 
  Eye, 
  Layers, 
  ShieldAlert,
  Cpu,
  Database,
  HardDrive,
  Radio,
  Server
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { DashboardLinkKey, DEFAULT_12_LINKS } from '../../types/twelveLinks';
import { normalizeGrafanaUrl, toProxyUrl, isRealDashboardUrl } from '../../utils/proxyUrl';
import { MiniBrowserModal } from './MiniBrowserModal';
import { TotalCpusStatPanel } from '../Influx/TotalCpusStatPanel';

interface MetricItem {
  id: DashboardLinkKey;
  label: string;
  category: string;
  type: 'service' | 'metric';
  value: string;
  unit: string;
  change: string;
  rate: string;
  latency: string;
  peak: string;
  color: string;
  threads: { name: string; count: number; pct: number }[];
}


const ALL_12_ITEMS: MetricItem[] = [
  // 6 Services
  {
    id: 'butler',
    label: 'Butler',
    category: 'Fleet Core',
    type: 'service',
    value: '564',
    unit: 'threads',
    change: '+3.1%',
    rate: '564 th/s',
    latency: '16ms',
    peak: '620 th max',
    color: '#FF7A00',
    threads: [
      { name: 'agv-scheduler', count: 280, pct: 75 },
      { name: 'path-planner', count: 184, pct: 60 },
      { name: 'fleet-alloc', count: 100, pct: 45 }
    ]
  },
  {
    id: 'bridge',
    label: 'Bridge',
    category: 'Gateway',
    type: 'service',
    value: '1,065/s',
    unit: 'rate',
    change: '+1.4%',
    rate: '1,065 msg/s',
    latency: '4ms',
    peak: '1,240 msg/s',
    color: '#10B981',
    threads: [
      { name: 'plc-bus-01', count: 640, pct: 85 },
      { name: 'rfid-ingress', count: 285, pct: 60 },
      { name: 'io-ack-loop', count: 140, pct: 40 }
    ]
  },
  {
    id: 'elastic',
    label: 'Elastic',
    category: 'Search & Log',
    type: 'service',
    value: '451',
    unit: 'shards',
    change: 'Normal',
    rate: '14.2k docs/s',
    latency: '8ms',
    peak: '2.4 TB',
    color: '#3B82F6',
    threads: [
      { name: 'ingest-pool-a', count: 210, pct: 70 },
      { name: 'search-indices', count: 145, pct: 55 },
      { name: 'replica-sync', count: 96, pct: 35 }
    ]
  },
  {
    id: 'platform',
    label: 'Platform',
    category: 'Core OS',
    type: 'service',
    value: '320/s',
    unit: 'ops',
    change: 'High Load',
    rate: '320 ops/s',
    latency: '24ms',
    peak: '480 ops max',
    color: '#EF4444',
    threads: [
      { name: 'tx-router', count: 160, pct: 90 },
      { name: 'auth-session', count: 100, pct: 65 },
      { name: 'audit-stream', count: 60, pct: 40 }
    ]
  },
  {
    id: 'influx',
    label: 'Influx',
    category: 'Time-Series',
    type: 'service',
    value: '568/s',
    unit: 'writes',
    change: '+4.8%',
    rate: '568 wr/s',
    latency: '3.8ms',
    peak: '720 wr max',
    color: '#14B8A6',
    threads: [
      { name: 'sensor-vibe', count: 320, pct: 80 },
      { name: 'thermal-grid', count: 148, pct: 50 },
      { name: 'retention-job', count: 100, pct: 30 }
    ]
  },
  {
    id: 'logs',
    label: 'Logs',
    category: 'Kafka Stream',
    type: 'service',
    value: '754/s',
    unit: 'events',
    change: 'Warn',
    rate: '754 ev/s',
    latency: '12ms',
    peak: '18 MB/s',
    color: '#F59E0B',
    threads: [
      { name: 'kafka-tail', count: 420, pct: 75 },
      { name: 'error-sink', count: 214, pct: 55 },
      { name: 'buffer-flush', count: 120, pct: 35 }
    ]
  },

  // 6 Metrics
  { 
    id: 'UPH', 
    label: 'UPH', 
    category: 'Throughput',
    type: 'metric',
    value: '1,420', 
    unit: 'units/h', 
    change: '+5.4%',
    rate: '1,420 u/h',
    latency: '18ms',
    peak: '1,680 u/h',
    color: '#FF7A00',
    threads: [
      { name: 'bridge-01', count: 1065, pct: 85 },
      { name: 'butler-core', count: 564, pct: 60 },
      { name: 'influx', count: 568, pct: 62 },
      { name: 'kafka', count: 754, pct: 75 }
    ]
  },
  { 
    id: 'PPR', 
    label: 'PPR', 
    category: 'Productivity',
    type: 'metric',
    value: '384', 
    unit: 'picks/h', 
    change: '+2.1%',
    rate: '384 p/h',
    latency: '14ms',
    peak: '420 p/h',
    color: '#10B981',
    threads: [
      { name: 'station-alpha', count: 124, pct: 80 },
      { name: 'station-bravo', count: 98, pct: 65 },
      { name: 'station-charlie', count: 162, pct: 90 }
    ]
  },
  { 
    id: 'R2R', 
    label: 'R2R', 
    category: 'Robotics',
    type: 'metric',
    value: '42.8s', 
    unit: 'transit', 
    change: '-1.4s',
    rate: '42.8s avg',
    latency: '8ms',
    peak: '58.2s max',
    color: '#3B82F6',
    threads: [
      { name: 'agv-fleet-a', count: 48, pct: 72 },
      { name: 'agv-fleet-b', count: 36, pct: 54 },
      { name: 'charging-grid', count: 12, pct: 30 }
    ]
  },
  { 
    id: 'KPI', 
    label: 'KPI', 
    category: 'SLA Target',
    type: 'metric',
    value: '99.4%', 
    unit: 'SLA', 
    change: '+0.2%',
    rate: '99.42% SLA',
    latency: '2ms',
    peak: '99.8% 24h',
    color: '#10B981',
    threads: [
      { name: 'order-dispatch', count: 840, pct: 95 },
      { name: 'routing-sla', count: 994, pct: 99 },
      { name: 'pallet-verify', count: 620, pct: 88 }
    ]
  },
  { 
    id: 'DISK', 
    label: 'Disk', 
    category: 'Storage',
    type: 'metric',
    value: '64%', 
    unit: '1.8 TB', 
    change: 'Normal',
    rate: '240 MB/s I/O',
    latency: '4ms',
    peak: '1.8 TB / 3.0 TB',
    color: '#F59E0B',
    threads: [
      { name: 'elasticsearch-md', count: 451, pct: 64 },
      { name: 'influx-tsdb', count: 280, pct: 45 },
      { name: 'postgres-wal', count: 140, pct: 28 }
    ]
  },
  { 
    id: 'MEM', 
    label: 'Mem', 
    category: 'Allocation',
    type: 'metric',
    value: '78%', 
    unit: '24.9 GB', 
    change: 'Normal',
    rate: '24.9 GB / 32 GB',
    latency: '1.2ms',
    peak: '28.4 GB max',
    color: '#A855F7',
    threads: [
      { name: 'jvm-heap', count: 16400, pct: 78 },
      { name: 'os-cache', count: 6200, pct: 55 },
      { name: 'buffer-pool', count: 2300, pct: 35 }
    ]
  }
];

export const ActiveDashboardViewer: React.FC = () => {
  const { 
    activeDashboardKey, 
    setActiveDashboardKey, 
    currentSiteObj,
    dashboardLinks,
    dashboardTitles,
    updateDashboardLink
  } = useDashboard();

  const currentKey: DashboardLinkKey = ALL_12_ITEMS.some(i => i.id === activeDashboardKey)
    ? activeDashboardKey
    : 'butler';

  const currentConfig = ALL_12_ITEMS.find(m => m.id === currentKey) || ALL_12_ITEMS[0];
  const siteName = currentSiteObj?.name || 'Facility';

  const currentUrl = dashboardLinks[currentKey] || '';
  const currentTitle = dashboardTitles[currentKey] || `${siteName} — ${currentConfig.label} Telemetry`;
  const hasUrl = isRealDashboardUrl(currentUrl);

  const [urlInput, setUrlInput] = useState<string>(currentUrl);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [isLoadingIframe, setIsLoadingIframe] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'live' | 'matrix' | 'influx-test'>('live');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    setUrlInput(currentUrl);
    setIsLoadingIframe(true);
    setIframeKey(k => k + 1);
    if (currentKey === 'influx' && !hasUrl) {
      setViewMode('influx-test');
    } else if (viewMode === 'influx-test' && currentKey !== 'influx') {
      setViewMode('live');
    }
  }, [currentKey, currentUrl]);

  const handleSaveUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!urlInput.trim()) return;

    setIsSaving(true);
    await updateDashboardLink(currentKey, urlInput.trim());
    setIsSaving(false);
    setIsLoadingIframe(true);
    setIframeKey(k => k + 1);
    setViewMode('live');
  };

  const proxiedUrl = toProxyUrl(currentUrl);

  return (
    <div className="surface-card rounded-xl p-2.5 sm:p-3 shadow-lg font-mono border border-[#232A39] flex flex-col justify-between h-[360px] select-none">
      
      {/* Top Header Bar & URL Address Bar */}
      <div className="shrink-0 flex flex-col gap-1.5 pb-2 border-b border-[#232A39]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="w-3.5 h-3.5 text-[#FF7A00] animate-pulse shrink-0" />
            <span className="font-bold text-xs uppercase text-white tracking-wider truncate">
              {siteName} — {currentConfig.label} ({currentConfig.category}) Live Panel
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-600/30 font-bold hidden sm:inline">
              LIVE RENDER
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px]">
            {/* InfluxDB Total CPUs Test Toggle */}
            {currentKey === 'influx' && (
              <button
                onClick={() => setViewMode(v => v === 'influx-test' ? 'live' : 'influx-test')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9.5px] font-bold border transition-all ${
                  viewMode === 'influx-test'
                    ? 'bg-amber-950/90 text-amber-300 border-amber-500/60 shadow-sm'
                    : 'bg-[#151D2A] text-gray-300 border-[#263347] hover:text-white'
                }`}
                title="Test Total CPUs InfluxQL query against http://il-influxdb2:80"
              >
                <Cpu className="w-2.5 h-2.5 text-amber-400" />
                <span>Total CPUs (InfluxQL)</span>
              </button>
            )}

            {/* View Mode Toggle */}
            <button
              onClick={() => setViewMode(v => v === 'live' ? 'matrix' : 'live')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9.5px] font-bold border transition-all ${
                viewMode === 'live'
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-600/40'
                  : 'bg-[#151D2A] text-gray-300 border-[#263347] hover:text-white'
              }`}
            >
              <Eye className="w-2.5 h-2.5" />
              <span>{viewMode === 'live' ? 'Live Embed' : 'Telemetry Matrix'}</span>
            </button>


            {/* Zoom Controls (for live mode) */}
            {viewMode === 'live' && hasUrl && (
              <div className="flex items-center bg-[#111722] rounded border border-[#232E40] p-0.5 text-[8.5px]">
                <button
                  onClick={() => setZoomLevel(z => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
                  className="px-1 text-gray-400 hover:text-white"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-2.5 h-2.5" />
                </button>
                <span className="px-1 text-[#FF7A00] font-bold">{Math.round(zoomLevel * 100)}%</span>
                <button
                  onClick={() => setZoomLevel(z => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
                  className="px-1 text-gray-400 hover:text-white"
                  title="Zoom In"
                >
                  <ZoomIn className="w-2.5 h-2.5" />
                </button>
              </div>
            )}

            {/* Reload button */}
            <button
              onClick={() => {
                setIsLoadingIframe(true);
                setIframeKey(k => k + 1);
              }}
              className="p-1 rounded bg-[#141A25] hover:bg-[#20293A] text-gray-300 border border-[#232E40]"
              title="Reload Panel"
            >
              <RefreshCw className="w-2.5 h-2.5" />
            </button>

            {/* Expand Fullscreen */}
            <button
              onClick={() => setIsExpanded(true)}
              className="p-1 rounded bg-[#141A25] hover:bg-[#20293A] text-gray-300 border border-[#232E40]"
              title="Expand Full HD View"
            >
              <Maximize2 className="w-2.5 h-2.5" />
            </button>

            {/* Open Tab */}
            {hasUrl && (
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1 rounded bg-[#141A25] hover:bg-[#FF7A00] text-gray-300 hover:text-white border border-[#232E40]"
                title="Open in new browser tab"
              >
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>

        {/* Interactive Link Address Bar */}
        <form onSubmit={handleSaveUrl} className="flex items-center gap-1.5 bg-[#0A0D14] p-1 rounded-lg border border-[#21293A]">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#131924] text-[#FF7A00] text-[9.5px] font-bold uppercase shrink-0">
            <Link className="w-3 h-3" />
            <span>{currentConfig.label} Link:</span>
          </div>

          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste Grafana solo panel URL (/d-solo/...) or <iframe src=...> tag..."
            className="flex-1 bg-transparent text-white text-[10px] px-2 py-0.5 outline-none font-mono placeholder:text-gray-600"
          />

          <button
            type="submit"
            disabled={isSaving || !urlInput.trim()}
            className="px-3 py-1 bg-[#FF7A00] hover:bg-[#FF8B21] text-white text-[9.5px] font-bold rounded flex items-center gap-1 shadow-xs transition-all disabled:opacity-50 shrink-0"
          >
            <Sparkles className="w-3 h-3" />
            <span>{isSaving ? 'Saving...' : 'Save & Render'}</span>
          </button>
        </form>
      </div>

      {/* Main Body */}
      <div className="mt-2 flex-1 flex gap-2.5 min-h-0 overflow-hidden">
        
        {/* Left Column: All 12 Panel Switchers (6 Services + 6 Metrics) */}
        <div className="w-40 shrink-0 flex flex-col gap-1 overflow-y-auto no-scrollbar pr-0.5">
          <div className="text-[8.5px] text-[#616E85] font-extrabold uppercase px-1">Services (6)</div>
          <div className="grid grid-cols-2 gap-1 mb-1">
            {ALL_12_ITEMS.filter(i => i.type === 'service').map(m => {
              const isSel = currentKey === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveDashboardKey(m.id)}
                  className={`px-1.5 py-1 rounded text-left transition-all border flex items-center justify-between ${
                    isSel 
                      ? 'bg-[#18202E] border-[#FF7A00] ring-1 ring-[#FF7A00]' 
                      : 'bg-[#10141E] border-[#202736] hover:bg-[#141A26]'
                  }`}
                >
                  <span className={`text-[9.5px] font-bold ${isSel ? 'text-[#FF7A00]' : 'text-gray-200'} flex items-center gap-1`}>
                    <span>{m.label}</span>
                    {m.id === 'influx' && (
                      <span className="text-[7.5px] font-mono px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        CPUs
                      </span>
                    )}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                </button>
              );
            })}
          </div>

          <div className="text-[8.5px] text-[#616E85] font-extrabold uppercase px-1">Metrics (6)</div>
          <div className="grid grid-cols-2 gap-1">
            {ALL_12_ITEMS.filter(i => i.type === 'metric').map(m => {
              const isSel = currentKey === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveDashboardKey(m.id)}
                  className={`px-1.5 py-1 rounded text-left transition-all border flex items-center justify-between ${
                    isSel 
                      ? 'bg-[#18202E] border-[#FF7A00] ring-1 ring-[#FF7A00]' 
                      : 'bg-[#10141E] border-[#202736] hover:bg-[#141A26]'
                  }`}
                >
                  <span className={`text-[9.5px] font-bold ${isSel ? 'text-[#FF7A00]' : 'text-gray-200'}`}>
                    {m.label}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Area: INFLUXQL TESTER OR LIVE RENDERED PANEL OR WAVEFORM MATRIX */}
        <div className="flex-1 h-full rounded-lg bg-[#070A10] border border-[#232A39] overflow-hidden relative flex flex-col justify-between">
          {viewMode === 'influx-test' ? (
            /* DIRECT INFLUXQL TOTAL CPUS TEST PANEL */
            <div className="w-full h-full overflow-y-auto no-scrollbar p-1">
              <TotalCpusStatPanel 
                initialHost="http://il-influxdb2:80" 
                onClose={() => setViewMode('live')}
              />
            </div>
          ) : viewMode === 'live' && hasUrl ? (
            /* LIVE GRAFANA IFRAME RENDER */
            <div className="w-full h-full relative overflow-hidden bg-[#070A10]">
              {isLoadingIframe && (
                <div className="absolute inset-0 z-20 bg-[#070A10] flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 text-[#FF7A00] animate-spin" />
                  <span className="text-[10px] text-gray-400">Loading {currentConfig.label} Live Panel...</span>
                </div>
              )}


              <iframe
                key={iframeKey}
                src={proxiedUrl}
                title={currentTitle}
                scrolling="no"
                className="w-full h-full border-none no-scrollbar"
                style={{
                  width: `${100 / zoomLevel}%`,
                  height: `${100 / zoomLevel}%`,
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: '0 0',
                }}
                onLoad={() => setIsLoadingIframe(false)}
              />
            </div>
          ) : (
            /* TELEMETRY MATRIX WAVEFORM & THREAD BREAKDOWN */
            <div className="w-full h-full p-3 flex flex-col justify-between">
              {/* Quick Stats Strip */}
              <div className="flex items-center justify-between text-[10px] text-gray-400 pb-1 border-b border-[#18202F]">
                <div className="flex items-center gap-3">
                  <span>Latency: <strong className="text-emerald-400">{currentConfig.latency}</strong></span>
                  <span>Peak: <strong className="text-white">{currentConfig.peak}</strong></span>
                  <span>Rate: <strong className="text-[#FF7A00]">{currentConfig.rate}</strong></span>
                </div>
                <button
                  onClick={() => setViewMode('live')}
                  className="text-[#FF7A00] font-bold text-[9.5px] hover:underline"
                >
                  {hasUrl ? 'Switch to Live Embed →' : 'Paste Link to Render →'}
                </button>
              </div>

              {/* Central Waveform */}
              <div className="my-auto py-1">
                <svg className="w-full h-20 stroke-[#FF7A00] fill-none" viewBox="0 0 600 80" preserveAspectRatio="none">
                  <path
                    d="M0,40 L40,40 L50,15 L65,65 L80,30 L95,50 L110,40 L220,40 L235,10 L250,75 L265,35 L280,45 L295,40 L420,40 L435,20 L450,60 L465,30 L480,50 L495,40 L600,40"
                    strokeWidth="2.2"
                    style={{ stroke: currentConfig.color }}
                  />
                  <path
                    d="M0,40 L40,40 L50,15 L65,65 L80,30 L95,50 L110,40 L220,40 L235,10 L250,75 L265,35 L280,45 L295,40 L420,40 L435,20 L450,60 L465,30 L480,50 L495,40 L600,40 L600,80 L0,80 Z"
                    className="stroke-none"
                    style={{ fill: `${currentConfig.color}18` }}
                  />
                </svg>
              </div>

              {/* Thread Breakdown */}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#18202F]">
                {currentConfig.threads.map(t => (
                  <div key={t.name} className="flex flex-col bg-[#0E131D] p-1.5 rounded border border-[#1C2536]">
                    <div className="flex items-center justify-between text-[8.5px] text-gray-400">
                      <span className="truncate">{t.name}</span>
                      <span className="font-bold text-white font-mono">{t.count}</span>
                    </div>
                    <div className="w-full bg-[#182030] h-1 rounded-full mt-1 overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${t.pct}%`, backgroundColor: currentConfig.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Expanded Modal */}
      {isExpanded && (
        <MiniBrowserModal
          isOpen={isExpanded}
          onClose={() => setIsExpanded(false)}
          title={currentTitle}
          metricLabel={currentConfig.label}
          initialUrl={currentUrl}
          siteName={siteName}
          onUpdateUrl={async (newUrl) => {
            await updateDashboardLink(currentKey, newUrl);
            setIframeKey(k => k + 1);
          }}
        />
      )}
    </div>
  );
};
