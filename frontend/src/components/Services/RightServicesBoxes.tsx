import React, { useState } from 'react';
import { 
  Activity, 
  Server, 
  Cpu, 
  Database, 
  HardDrive, 
  Radio, 
  ShieldAlert,
  Link,
  Edit3,
  ExternalLink,
  Maximize2,
  Sparkles,
  Check,
  X,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { DashboardLinkKey } from '../../types/twelveLinks';
import { normalizeGrafanaUrl, toProxyUrl, isRealDashboardUrl } from '../../utils/proxyUrl';
import { MiniBrowserModal } from '../Grafana/MiniBrowserModal';

interface ServiceItem {
  id: DashboardLinkKey;
  name: string;
  clusterTag: string;
  threads: number;
  metricLabel: string;
  metricValue: string;
  subValue: string;
  status: 'GREEN' | 'AMBER' | 'RED';
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  data: number[];
}

const SIX_SERVICES: ServiceItem[] = [
  { 
    id: 'butler',   
    name: 'Butler',   
    clusterTag: 'butler-core', 
    threads: 564, 
    metricLabel: 'Threads', 
    metricValue: '564', 
    subValue: '99.4% SLA', 
    status: 'GREEN',
    icon: Cpu,
    data: [72, 85, 91, 78, 64, 82, 88, 79, 92, 86, 74, 83] 
  },
  { 
    id: 'bridge',   
    name: 'Bridge',   
    clusterTag: 'bridge-01', 
    threads: 1065, 
    metricLabel: 'Rate', 
    metricValue: '1,065/s', 
    subValue: '12ms Ping', 
    status: 'GREEN',
    icon: Radio,
    data: [55, 60, 52, 58, 55, 53, 56, 58, 52, 55, 58, 54] 
  },
  { 
    id: 'elastic',  
    name: 'Elastic',  
    clusterTag: 'elasticsearch-md', 
    threads: 451, 
    metricLabel: 'Shards', 
    metricValue: '451', 
    subValue: '2.4 TB', 
    status: 'GREEN',
    icon: Database,
    data: [68, 74, 71, 80, 85, 78, 82, 89, 76, 84, 90, 87] 
  },
  { 
    id: 'platform', 
    name: 'Platform', 
    clusterTag: 'prod-opc', 
    threads: 320, 
    metricLabel: 'Ops', 
    metricValue: '320/s', 
    subValue: 'High Load', 
    status: 'RED',
    icon: ShieldAlert,
    data: [82, 75, 90, 42, 28, 65, 88, 30, 22, 58, 85, 34] 
  },
  { 
    id: 'influx',   
    name: 'Influx',   
    clusterTag: 'influx', 
    threads: 568, 
    metricLabel: 'Writes', 
    metricValue: '568/s', 
    subValue: '3.8ms Lat', 
    status: 'GREEN',
    icon: HardDrive,
    data: [70, 82, 65, 88, 75, 90, 68, 85, 78, 92, 80, 86] 
  },
  { 
    id: 'logs',     
    name: 'Kafka Logs', 
    clusterTag: 'kafka', 
    threads: 754, 
    metricLabel: 'Events', 
    metricValue: '754/s', 
    subValue: '18 MB/s', 
    status: 'AMBER',
    icon: Server,
    data: [25, 30, 20, 45, 60, 35, 25, 40, 55, 30, 20, 38] 
  },
];

function buildPath(data: number[], W: number, H: number) {
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - (v / 100) * H * 0.75 - H * 0.12,
  }));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i], cx = (p.x + c.x) / 2;
    d += ` C ${cx.toFixed(1)} ${p.y.toFixed(1)}, ${cx.toFixed(1)} ${c.y.toFixed(1)}, ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
  }
  return d;
}

export const RightServicesBoxes: React.FC = () => {
  const { 
    selectedService, 
    setSelectedService, 
    activeDashboardKey, 
    setActiveDashboardKey,
    dashboardLinks,
    dashboardTitles,
    updateDashboardLink,
    setEditingLinkKey,
    currentSiteObj
  } = useDashboard();

  // Inline paste modal per service
  const [pastingId, setPastingId] = useState<DashboardLinkKey | null>(null);
  const [pasteInput, setPasteInput] = useState<string>('');

  // Per-panel view mode: 'live' (render live Grafana embed) vs 'waveform' (render sparkline)
  const [renderModes, setRenderModes] = useState<Record<DashboardLinkKey, 'live' | 'waveform'>>({
    butler: 'live',
    bridge: 'live',
    elastic: 'live',
    platform: 'live',
    influx: 'live',
    logs: 'live',
    UPH: 'live',
    PPR: 'live',
    R2R: 'live',
    KPI: 'live',
    DISK: 'live',
    MEM: 'live'
  });

  // Track iframe loading states
  const [loadingIframes, setLoadingIframes] = useState<Record<string, boolean>>({});
  const [iframeReloadKeys, setIframeReloadKeys] = useState<Record<string, number>>({});

  // Fullscreen expanded modal key
  const [expandedKey, setExpandedKey] = useState<DashboardLinkKey | null>(null);

  const siteName = currentSiteObj?.name || 'Facility';

  const handleOpenPaste = (e: React.MouseEvent, id: DashboardLinkKey) => {
    e.stopPropagation();
    setPastingId(id);
    setPasteInput(dashboardLinks[id] || '');
  };

  const handleSaveInline = async (e: React.FormEvent, id: DashboardLinkKey) => {
    e.preventDefault();
    if (!pasteInput.trim()) return;

    await updateDashboardLink(id, pasteInput.trim());
    setRenderModes(prev => ({ ...prev, [id]: 'live' }));
    setLoadingIframes(prev => ({ ...prev, [id]: true }));
    setIframeReloadKeys(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setPastingId(null);
    setActiveDashboardKey(id);
    setSelectedService(id);
  };

  const toggleRenderMode = (e: React.MouseEvent, id: DashboardLinkKey) => {
    e.stopPropagation();
    setRenderModes(prev => ({
      ...prev,
      [id]: prev[id] === 'live' ? 'waveform' : 'live'
    }));
  };

  const handleExpand = (e: React.MouseEvent, id: DashboardLinkKey) => {
    e.stopPropagation();
    setActiveDashboardKey(id);
    setSelectedService(id);
    setExpandedKey(id);
  };

  return (
    <div className="flex flex-col gap-1 font-mono select-none h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-[#0F131C] border border-[#1E2535] shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#FF7A00] animate-pulse" />
          <span className="font-extrabold text-[10px] uppercase tracking-wider text-white">Cluster Telemetry</span>
          <span className="text-[8px] px-1 py-0.2 rounded bg-[#151D2B] text-emerald-400 border border-emerald-500/30 font-bold">
            6 Panels
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[8px] text-emerald-400 font-bold">LIVE</span>
        </div>
      </div>

      {/* 6 Services in a clean vertical column */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0">
        {SIX_SERVICES.map(s => {
          const isSelected = selectedService === s.id || activeDashboardKey === s.id;
          const stroke = s.status === 'RED' ? '#EF4444' : s.status === 'AMBER' ? '#F59E0B' : '#10B981';
          const dot = s.status === 'RED' ? 'bg-red-400 animate-ping' : s.status === 'AMBER' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400';
          const ring = isSelected
            ? 'border-[#FF7A00] ring-1 ring-[#FF7A00]/60 shadow-[0_0_12px_rgba(255,122,0,0.25)] bg-[#121824]'
            : 'border-[#1D2535] hover:border-[#2E3D56] bg-[#0D1119] hover:bg-[#111722]';

          const currentUrl = dashboardLinks[s.id] || '';
          const hasUrl = isRealDashboardUrl(currentUrl);
          const isPasting = pastingId === s.id;
          const isLiveMode = renderModes[s.id] === 'live' && hasUrl;
          const panelTitle = dashboardTitles[s.id] || `${siteName} — ${s.name} Panel`;
          const proxiedUrl = toProxyUrl(currentUrl);

          const IconComponent = s.icon;
          const W = 220, H = 55;
          const pathD = buildPath(s.data, W, H);
          const areaD = `${pathD} L ${W} ${H} L 0 ${H} Z`;
          const lx = W - 3;
          const ly = H - (s.data[s.data.length - 1] / 100) * H * 0.75 - H * 0.12;

          return (
            <div
              key={s.id}
              onClick={() => {
                setSelectedService(s.id);
                setActiveDashboardKey(s.id);
              }}
              className={`flex-1 min-h-0 rounded-xl border transition-all duration-150 cursor-pointer overflow-hidden flex flex-col p-1.5 justify-between relative group ${ring}`}
            >
              {/* Top Accent Shimmer */}
              <div 
                className="absolute top-0 left-0 right-0 h-[2px] opacity-70 transition-opacity group-hover:opacity-100" 
                style={{ background: `linear-gradient(90deg, transparent, ${stroke}, transparent)` }}
              />

              {/* Title row */}
              <div className="flex items-center justify-between z-10 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                  <IconComponent className="w-3 h-3 shrink-0" style={{ color: stroke }} />
                  <span className="text-[10px] font-extrabold text-white truncate">{s.name}</span>
                </div>

                {/* Top Action Toolbar */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* For Influx: Quick InfluxQL Test button */}
                  {s.id === 'influx' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDashboardKey('influx');
                        setSelectedService('influx');
                      }}
                      className="p-1 rounded bg-amber-950/80 hover:bg-amber-800 text-amber-300 border border-amber-500/40 transition-colors"
                      title="Test Total CPUs InfluxQL on il-influxdb2:80"
                    >
                      <Cpu className="w-2.5 h-2.5 text-amber-400" />
                    </button>
                  )}

                  {/* Paste / Edit Link Button */}
                  <button
                    type="button"
                    onClick={(e) => handleOpenPaste(e, s.id)}
                    className="p-1 rounded bg-[#161D2B] hover:bg-[#FF7A00] text-gray-300 hover:text-white transition-colors"
                    title="Paste / Edit Grafana Link"
                  >
                    <Link className="w-2.5 h-2.5" />
                  </button>

                  {/* Toggle Live Render vs Waveform (if URL is set) */}
                  {hasUrl && (
                    <button
                      type="button"
                      onClick={(e) => toggleRenderMode(e, s.id)}
                      className={`p-1 rounded transition-colors ${
                        isLiveMode
                          ? 'bg-emerald-950/80 text-emerald-400 hover:bg-emerald-900 border border-emerald-600/40'
                          : 'bg-[#161D2B] text-gray-400 hover:text-white'
                      }`}
                      title={isLiveMode ? "Viewing Live Panel (Click for Waveform)" : "Viewing Waveform (Click for Live Panel)"}
                    >
                      {isLiveMode ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                    </button>
                  )}

                  {/* Expand to Full HD Modal */}
                  {hasUrl && (
                    <button
                      type="button"
                      onClick={(e) => handleExpand(e, s.id)}
                      className="p-1 rounded bg-[#161D2B] hover:bg-[#28354D] text-gray-300 hover:text-white transition-colors"
                      title="Expand to Fullscreen HD Browser"
                    >
                      <Maximize2 className="w-2.5 h-2.5" />
                    </button>
                  )}

                  {/* Direct New Tab */}
                  {hasUrl && (
                    <a
                      href={currentUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded bg-[#161D2B] hover:bg-[#28354D] text-gray-400 hover:text-white transition-colors"
                      title="Open in new browser tab"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>

              {/* INLINE PASTE FORM OVERLAY */}
              {isPasting ? (
                <form 
                  onSubmit={(e) => handleSaveInline(e, s.id)} 
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-0 z-30 bg-[#0C1019] border border-[#FF7A00] rounded-xl p-2 flex flex-col justify-between shadow-2xl animate-in fade-in"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] font-extrabold text-[#FF7A00] uppercase tracking-wider flex items-center gap-1">
                      <Link className="w-3 h-3" />
                      <span>Paste Link — {s.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPastingId(null)}
                      className="text-gray-400 hover:text-white p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={pasteInput}
                    onChange={(e) => setPasteInput(e.target.value)}
                    placeholder="Paste Grafana URL or <iframe...>"
                    className="w-full bg-[#06080D] border border-[#232C3D] focus:border-[#FF7A00] text-white text-[10px] rounded px-2 py-1 outline-none font-mono placeholder:text-gray-600"
                    autoFocus
                  />

                  <div className="flex items-center justify-between pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPastingId(null);
                        setEditingLinkKey(s.id);
                      }}
                      className="text-[8px] text-gray-400 hover:text-gray-200 underline"
                    >
                      More options...
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPastingId(null)}
                        className="px-2 py-0.5 rounded bg-[#161D2B] text-gray-300 hover:text-white text-[9px] font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!pasteInput.trim()}
                        className="px-2.5 py-0.5 rounded bg-[#FF7A00] hover:bg-[#FF8B21] text-white text-[9px] font-bold flex items-center gap-1 shadow-sm disabled:opacity-50"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Render</span>
                      </button>
                    </div>
                  </div>
                </form>
              ) : isLiveMode ? (
                /* LIVE RENDERED GRAFANA PANEL */
                <div className="w-full flex-1 my-1 relative overflow-hidden rounded bg-[#060910] border border-[#1A2333] min-h-[45px]">
                  {loadingIframes[s.id] && (
                    <div className="absolute inset-0 z-10 bg-[#060910] flex items-center justify-center gap-1.5">
                      <RefreshCw className="w-3 h-3 text-[#FF7A00] animate-spin" />
                      <span className="text-[8px] text-gray-400">Rendering live panel...</span>
                    </div>
                  )}

                  <iframe
                    key={`${s.id}-${iframeReloadKeys[s.id] || 0}`}
                    src={proxiedUrl}
                    title={panelTitle}
                    scrolling="no"
                    className="border-none w-full h-full no-scrollbar pointer-events-none"
                    style={{
                      width: '180%',
                      height: '180%',
                      transform: 'scale(0.55)',
                      transformOrigin: '0 0',
                    }}
                    onLoad={() => {
                      setLoadingIframes(prev => ({ ...prev, [s.id]: false }));
                    }}
                  />

                  {/* Live Stream indicator badge */}
                  <div className="absolute bottom-0.5 right-0.5 z-20 flex items-center gap-1 bg-[#0E131E]/90 px-1 py-0.2 rounded border border-[#222D3E] opacity-75 group-hover:opacity-100">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[7px] text-emerald-400 font-bold">LIVE EMBED</span>
                  </div>
                </div>
              ) : (
                /* WAVEFORM CANVAS */
                <div className="w-full h-8 relative my-0.5 overflow-hidden">
                  <svg className="w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                    <defs>
                      <linearGradient id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={stroke} stopOpacity="0.01" />
                      </linearGradient>
                    </defs>
                    <path d={areaD} fill={`url(#grad-${s.id})`} />
                    <path d={pathD} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx={lx} cy={ly} r="2.5" fill={stroke} />
                  </svg>
                </div>
              )}

              {/* Bottom stats row */}
              <div className="flex items-center justify-between text-[8px] text-gray-500 pt-0.5 border-t border-[#18202D] z-10 shrink-0">
                <span className="text-gray-400 font-mono truncate">{s.clusterTag}</span>
                {hasUrl ? (
                  <span 
                    onClick={(e) => handleOpenPaste(e, s.id)}
                    className="text-[#FF7A00] font-bold hover:underline cursor-pointer"
                  >
                    {isLiveMode ? 'Live Rendered' : 'Paste Link ✎'}
                  </span>
                ) : (
                  <span 
                    onClick={(e) => handleOpenPaste(e, s.id)}
                    className="text-amber-400 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    <span>Paste Link ✎</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Legend */}
      <div className="shrink-0 flex items-center justify-around px-2 py-1 rounded-lg bg-[#0E121A] border border-[#1E2533] text-[7.5px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />Healthy</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Warning</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Critical</span>
      </div>

      {/* Expanded Fullscreen High-Resolution Browser Modal */}
      {expandedKey && (
        <MiniBrowserModal
          isOpen={!!expandedKey}
          onClose={() => setExpandedKey(null)}
          title={dashboardTitles[expandedKey] || `${siteName} — ${expandedKey.toUpperCase()} Live Dashboard`}
          metricLabel={expandedKey.toUpperCase()}
          initialUrl={dashboardLinks[expandedKey] || ''}
          siteName={siteName}
          onUpdateUrl={async (newUrl) => {
            await updateDashboardLink(expandedKey, newUrl);
            setIframeReloadKeys(prev => ({ ...prev, [expandedKey]: (prev[expandedKey] || 0) + 1 }));
          }}
        />
      )}
    </div>
  );
};
