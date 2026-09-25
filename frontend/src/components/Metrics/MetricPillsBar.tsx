import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
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

interface MetricConfig {
  key: DashboardLinkKey;
  label: string;
  value: string;
  unit: string;
  change: string;
  isPositive: boolean;
  color: string;
  data: number[];
}

const METRICS: MetricConfig[] = [
  { 
    key: 'UPH',  
    label: 'UPH',  
    value: '1,420', 
    unit: 'Units/hr',  
    change: '+5.4%', 
    isPositive: true, 
    color: '#FF7A00', 
    data: [60, 72, 80, 75, 85, 78, 88, 82, 90, 85, 88, 92] 
  },
  { 
    key: 'PPR',  
    label: 'PPR',  
    value: '384',   
    unit: 'Picks/hr',  
    change: '+2.1%', 
    isPositive: true, 
    color: '#10B981', 
    data: [55, 62, 58, 70, 65, 72, 68, 75, 70, 78, 74, 80] 
  },
  { 
    key: 'R2R',  
    label: 'R2R',  
    value: '18s',   
    unit: 'Transit Latency',   
    change: '-1.4s', 
    isPositive: true, 
    color: '#3B82F6', 
    data: [40, 45, 42, 50, 48, 44, 52, 46, 50, 43, 47, 45] 
  },
  { 
    key: 'KPI',  
    label: 'KPI',  
    value: '99.4%', 
    unit: 'Fulfillment SLA',       
    change: '+0.2%', 
    isPositive: true, 
    color: '#10B981', 
    data: [88, 90, 92, 89, 94, 91, 93, 95, 92, 96, 94, 97] 
  },
  { 
    key: 'DISK', 
    label: 'Disk', 
    value: '34%',   
    unit: 'Storage Used',   
    change: '1.8 TB', 
    isPositive: true, 
    color: '#F59E0B', 
    data: [30, 32, 31, 33, 34, 33, 35, 34, 36, 35, 34, 35] 
  },
  { 
    key: 'MEM',  
    label: 'Mem',  
    value: '62%',   
    unit: 'Allocation Pool',    
    change: '24.9 GB', 
    isPositive: true, 
    color: '#A855F7', 
    data: [55, 58, 60, 62, 61, 63, 62, 64, 63, 65, 62, 64] 
  },
];

function buildPath(data: number[], W: number, H: number) {
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - (v / 100) * H * 0.78 - H * 0.10,
  }));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i], cx = (p.x + c.x) / 2;
    d += ` C ${cx.toFixed(1)} ${p.y.toFixed(1)}, ${cx.toFixed(1)} ${c.y.toFixed(1)}, ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
  }
  return d;
}

export const MetricPillsBar: React.FC = () => {
  const { 
    activeDashboardKey, 
    setActiveDashboardKey,
    dashboardLinks,
    dashboardTitles,
    updateDashboardLink,
    setEditingLinkKey,
    currentSiteObj
  } = useDashboard();

  const [pastingKey, setPastingKey] = useState<DashboardLinkKey | null>(null);
  const [pasteInput, setPasteInput] = useState<string>('');

  const [renderModes, setRenderModes] = useState<Record<DashboardLinkKey, 'live' | 'sparkline'>>({
    UPH: 'sparkline',
    PPR: 'sparkline',
    R2R: 'sparkline',
    KPI: 'sparkline',
    DISK: 'sparkline',
    MEM: 'sparkline',
    butler: 'sparkline',
    bridge: 'sparkline',
    elastic: 'sparkline',
    platform: 'sparkline',
    influx: 'sparkline',
    logs: 'sparkline'
  });

  const [loadingIframes, setLoadingIframes] = useState<Record<string, boolean>>({});
  const [iframeReloadKeys, setIframeReloadKeys] = useState<Record<string, number>>({});
  const [expandedKey, setExpandedKey] = useState<DashboardLinkKey | null>(null);

  const siteName = currentSiteObj?.name || 'Facility';

  const handleOpenPaste = (e: React.MouseEvent, key: DashboardLinkKey) => {
    e.stopPropagation();
    setPastingKey(key);
    setPasteInput(dashboardLinks[key] || '');
  };

  const handleSaveInline = async (e: React.FormEvent, key: DashboardLinkKey) => {
    e.preventDefault();
    if (!pasteInput.trim()) return;

    await updateDashboardLink(key, pasteInput.trim());
    setRenderModes(prev => ({ ...prev, [key]: 'live' }));
    setLoadingIframes(prev => ({ ...prev, [key]: true }));
    setIframeReloadKeys(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    setPastingKey(null);
    setActiveDashboardKey(key);
  };

  const toggleRenderMode = (e: React.MouseEvent, key: DashboardLinkKey) => {
    e.stopPropagation();
    setRenderModes(prev => ({
      ...prev,
      [key]: prev[key] === 'live' ? 'sparkline' : 'live'
    }));
  };

  const handleExpand = (e: React.MouseEvent, key: DashboardLinkKey) => {
    e.stopPropagation();
    setActiveDashboardKey(key);
    setExpandedKey(key);
  };

  return (
    <div className="w-full flex flex-col gap-1.5 font-mono select-none shrink-0">
      {/* 6 Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {METRICS.map(m => {
          const isSelected = activeDashboardKey === m.key;
          const currentUrl = dashboardLinks[m.key] || '';
          const hasUrl = isRealDashboardUrl(currentUrl);
          const isPasting = pastingKey === m.key;
          const isLiveMode = renderModes[m.key] === 'live' && hasUrl;
          const proxiedUrl = toProxyUrl(currentUrl);
          const panelTitle = dashboardTitles[m.key] || `${siteName} — ${m.label} Metric Panel`;

          const W = 160, H = 50;
          const pathD = buildPath(m.data, W, H);
          const areaD = `${pathD} L ${W} ${H} L 0 ${H} Z`;
          const lx = W - 3;
          const ly = H - (m.data[m.data.length - 1] / 100) * H * 0.78 - H * 0.10;

          const ring = isSelected
            ? 'border-[#FF7A00] ring-1 ring-[#FF7A00]/60 shadow-[0_0_12px_rgba(255,122,0,0.25)] bg-[#121824]'
            : 'border-[#1D2535] hover:border-[#2E3D56] bg-[#0D1119] hover:bg-[#111722]';

          return (
            <div
              key={m.key}
              onClick={() => setActiveDashboardKey(m.key)}
              className={`rounded-xl border transition-all duration-150 cursor-pointer overflow-hidden p-2 flex flex-col justify-between group relative min-h-[118px] ${ring}`}
            >
              {/* Top Accent Shimmer */}
              <div 
                className="absolute top-0 left-0 right-0 h-[2px] opacity-70 transition-opacity group-hover:opacity-100" 
                style={{ background: `linear-gradient(90deg, transparent, ${m.color}, transparent)` }}
              />

              {/* Header: Label Badge + Actions */}
              <div className="flex items-center justify-between z-10 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[9.5px] font-black px-1.5 py-0.2 rounded shrink-0 uppercase tracking-wider"
                    style={{ backgroundColor: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44` }}
                  >
                    {m.label}
                  </span>

                  {!isLiveMode && (
                    <div className="flex items-center gap-0.5 text-[8px]">
                      {m.isPositive ? (
                        <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
                      ) : (
                        <TrendingDown className="w-2.5 h-2.5 text-amber-400" />
                      )}
                      <span className={m.isPositive ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                        {m.change}
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Header Action Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Paste / Edit Link */}
                  <button
                    type="button"
                    onClick={(e) => handleOpenPaste(e, m.key)}
                    className="p-1 rounded bg-[#161D2B] hover:bg-[#FF7A00] text-gray-300 hover:text-white transition-colors"
                    title="Paste / Edit Grafana Link"
                  >
                    <Link className="w-2.5 h-2.5" />
                  </button>

                  {/* Toggle Live / Sparkline */}
                  {hasUrl && (
                    <button
                      type="button"
                      onClick={(e) => toggleRenderMode(e, m.key)}
                      className={`p-1 rounded transition-colors ${
                        isLiveMode
                          ? 'bg-emerald-950/80 text-emerald-400 hover:bg-emerald-900 border border-emerald-600/40'
                          : 'bg-[#161D2B] text-gray-400 hover:text-white'
                      }`}
                      title={isLiveMode ? "View Sparkline" : "View Live Panel"}
                    >
                      {isLiveMode ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                    </button>
                  )}

                  {/* Expand */}
                  {hasUrl && (
                    <button
                      type="button"
                      onClick={(e) => handleExpand(e, m.key)}
                      className="p-1 rounded bg-[#161D2B] hover:bg-[#28354D] text-gray-300 hover:text-white transition-colors"
                      title="Expand full panel view"
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
                  onSubmit={(e) => handleSaveInline(e, m.key)} 
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-0 z-30 bg-[#0C1019] border border-[#FF7A00] rounded-xl p-2 flex flex-col justify-between shadow-2xl animate-in fade-in"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-extrabold text-[#FF7A00] uppercase tracking-wider flex items-center gap-1">
                      <Link className="w-3 h-3" />
                      <span>Paste {m.label} Link</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPastingKey(null)}
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
                    className="w-full bg-[#06080D] border border-[#232C3D] focus:border-[#FF7A00] text-white text-[9.5px] rounded px-2 py-1 outline-none font-mono placeholder:text-gray-600"
                    autoFocus
                  />

                  <div className="flex items-center justify-between pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPastingKey(null);
                        setEditingLinkKey(m.key);
                      }}
                      className="text-[7.5px] text-gray-400 hover:text-gray-200 underline"
                    >
                      More options...
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPastingKey(null)}
                        className="px-2 py-0.5 rounded bg-[#161D2B] text-gray-300 hover:text-white text-[8.5px] font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!pasteInput.trim()}
                        className="px-2.5 py-0.5 rounded bg-[#FF7A00] hover:bg-[#FF8B21] text-white text-[8.5px] font-bold flex items-center gap-1 shadow-sm disabled:opacity-50"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Render</span>
                      </button>
                    </div>
                  </div>
                </form>
              ) : isLiveMode ? (
                /* LIVE EMBEDDED GRAFANA PANEL */
                <div className="w-full flex-1 my-1 relative overflow-hidden rounded bg-[#060910] border border-[#1A2333] min-h-[48px]">
                  {loadingIframes[m.key] && (
                    <div className="absolute inset-0 z-10 bg-[#060910] flex items-center justify-center gap-1">
                      <RefreshCw className="w-3 h-3 text-[#FF7A00] animate-spin" />
                      <span className="text-[7.5px] text-gray-400">Rendering...</span>
                    </div>
                  )}

                  <iframe
                    key={`${m.key}-${iframeReloadKeys[m.key] || 0}`}
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
                      setLoadingIframes(prev => ({ ...prev, [m.key]: false }));
                    }}
                  />

                  {/* Live tag */}
                  <div className="absolute bottom-0.5 right-0.5 z-20 flex items-center gap-1 bg-[#0E131E]/90 px-1 py-0.2 rounded border border-[#222D3E] opacity-80 group-hover:opacity-100">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[6.5px] text-emerald-400 font-bold">LIVE EMBED</span>
                  </div>
                </div>
              ) : (
                /* METRIC VALUE & SPARKLINE */
                <>
                  {/* Value & Unit Display */}
                  <div className="my-0.5 flex items-baseline justify-between">
                    <span className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                      {m.value}
                    </span>
                    <span className="text-[7.5px] text-gray-500 truncate max-w-[65px]">
                      {m.unit}
                    </span>
                  </div>

                  {/* Clean Telemetry SVG Waveform */}
                  <div className="w-full h-7 relative overflow-hidden my-0.5">
                    <svg className="w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                      <defs>
                        <linearGradient id={`spark-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={m.color} stopOpacity="0.40" />
                          <stop offset="100%" stopColor={m.color} stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <path d={areaD} fill={`url(#spark-${m.key})`} />
                      <path d={pathD} fill="none" stroke={m.color} strokeWidth="1.8" strokeLinecap="round" />
                      <circle cx={lx} cy={ly} r="2.5" fill={m.color} />
                    </svg>
                  </div>
                </>
              )}

              {/* Footer status dot */}
              <div className="flex items-center justify-between text-[7.5px] text-gray-500 pt-1 border-t border-[#18202D] shrink-0">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="text-gray-400 font-mono">Telemetry</span>
                </span>
                {hasUrl ? (
                  <span 
                    onClick={(e) => handleOpenPaste(e, m.key)}
                    className="text-[#FF7A00] font-bold hover:underline cursor-pointer"
                  >
                    {isLiveMode ? 'Live Rendered' : 'Paste Link ✎'}
                  </span>
                ) : (
                  <span 
                    onClick={(e) => handleOpenPaste(e, m.key)}
                    className="text-amber-400 font-bold hover:underline cursor-pointer"
                  >
                    Paste Link ✎
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded Fullscreen High-Resolution Browser Modal */}
      {expandedKey && (
        <MiniBrowserModal
          isOpen={!!expandedKey}
          onClose={() => setExpandedKey(null)}
          title={dashboardTitles[expandedKey] || `${siteName} — ${expandedKey} Live Metric Panel`}
          metricLabel={expandedKey}
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
