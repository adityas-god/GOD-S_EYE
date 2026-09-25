import React, { useState, useMemo } from 'react';
import { 
  Radio, 
  Edit3, 
  ExternalLink, 
  RefreshCw, 
  Check, 
  X,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { DashboardLinkKey } from '../../types/twelveLinks';

const SERVICES: { id: DashboardLinkKey; name: string; alertCount: number; status: 'GREEN' | 'AMBER' | 'RED'; desc: string }[] = [
  { id: 'butler', name: 'Butler', alertCount: 2, status: 'AMBER', desc: 'Fleet Orchestration' },
  { id: 'bridge', name: 'Bridge', alertCount: 0, status: 'GREEN', desc: 'Hardware Gateway' },
  { id: 'elastic', name: 'Elastic', alertCount: 0, status: 'GREEN', desc: 'Log Search Cluster' },
  { id: 'platform', name: 'Platform', alertCount: 4, status: 'RED', desc: 'Core GreyMatter OS' },
  { id: 'influx', name: 'Influx', alertCount: 0, status: 'GREEN', desc: 'Time-Series DB' },
  { id: 'logs', name: 'Logs', alertCount: 1, status: 'AMBER', desc: 'Diagnostic Pipeline' }
];

export const RightServicesPanel: React.FC = () => {
  const { 
    selectedService, 
    setSelectedService, 
    activeDashboardKey, 
    setActiveDashboardKey,
    dashboardLinks, 
    dashboardTitles, 
    updateDashboardLink,
    currentSiteObj 
  } = useDashboard();

  // Selected service defaults to 'logs' or currently selected
  const currentServiceKey: DashboardLinkKey = (['butler', 'bridge', 'elastic', 'platform', 'influx', 'logs'].includes(activeDashboardKey)
    ? activeDashboardKey
    : (selectedService && ['butler', 'bridge', 'elastic', 'platform', 'influx', 'logs'].includes(selectedService.toLowerCase()) 
        ? selectedService.toLowerCase() 
        : 'logs')) as DashboardLinkKey;

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editUrl, setEditUrl] = useState<string>('');
  const [editTitle, setEditTitle] = useState<string>('');
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(0.85); // Auto-fit scale to prevent extra zoom or cutoff

  const siteName = currentSiteObj?.name || 'Site';
  const currentUrl = dashboardLinks[currentServiceKey] || '';
  const currentTitle = dashboardTitles[currentServiceKey] || `${siteName} — ${currentServiceKey.toUpperCase()} Dashboard`;

  // Direct embed URL: lets browser load Grafana static bundles directly from host without subpath collision
  const effectiveEmbedSrc = useMemo(() => {
    if (!currentUrl) return '';
    return currentUrl;
  }, [currentUrl]);

  const handleStartEdit = () => {
    setEditUrl(currentUrl);
    setEditTitle(currentTitle);
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editUrl.trim()) {
      await updateDashboardLink(currentServiceKey, editUrl.trim(), editTitle.trim());
      setIframeKey(k => k + 1);
    }
    setIsEditing(false);
  };

  const handleSelectService = (id: DashboardLinkKey) => {
    setSelectedService(id);
    setActiveDashboardKey(id);
    setIsEditing(false);
  };

  const hasCustomUrl = currentUrl && !currentUrl.includes('wikimedia.org');

  return (
    <div className={`surface-card rounded-xl p-3 shadow-lg font-mono border border-[#232A39] flex flex-col justify-between transition-all ${
      isFullscreen ? 'fixed inset-4 z-50 bg-[#0C1017] p-5 border-2 border-[#FF7A00]' : 'h-[320px]'
    }`}>
      
      {/* Header Bar */}
      <div className="shrink-0 flex items-center justify-between pb-2 border-b border-[#232A39] gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Radio className="w-3.5 h-3.5 text-[#FF7A00] animate-pulse shrink-0" />
          <span className="font-bold text-xs uppercase text-white tracking-wider truncate">
            Services Health & Live Panel
          </span>
          <span className="text-[10px] text-[#8492A6] hidden sm:inline truncate">
            ({currentServiceKey.toUpperCase()})
          </span>
        </div>

        {/* Controls: Edit Link, Zoom, Reload, External, Fullscreen */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={isEditing ? () => setIsEditing(false) : handleStartEdit}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
              isEditing 
                ? 'bg-amber-500 text-black' 
                : 'bg-[#FF7A00] hover:bg-[#FF8B21] text-white shadow-xs'
            }`}
            title="Edit / Paste Grafana Link for this service"
          >
            <Edit3 className="w-2.5 h-2.5" />
            <span>{isEditing ? 'Close' : 'Edit Link'}</span>
          </button>

          {/* Auto-Adjust Zoom Level Controls (Fit without extra zoom) */}
          <div className="flex items-center bg-[#121620] rounded border border-[#232A39] p-0.5 text-[9px]">
            <button
              onClick={() => setZoomLevel(z => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
              className="px-1 text-gray-400 hover:text-white"
              title="Zoom out (Fit more content)"
            >
              <ZoomOut className="w-2.5 h-2.5" />
            </button>
            <span className="px-1 text-[#FF7A00] font-bold">{Math.round(zoomLevel * 100)}%</span>
            <button
              onClick={() => setZoomLevel(z => Math.min(1.2, Number((z + 0.1).toFixed(2))))}
              className="px-1 text-gray-400 hover:text-white"
              title="Zoom in"
            >
              <ZoomIn className="w-2.5 h-2.5" />
            </button>
          </div>

          <button
            onClick={() => setIframeKey(k => k + 1)}
            className="p-1 rounded bg-[#141923] text-gray-400 hover:text-white border border-[#232A39]"
            title="Reload Dashboard"
          >
            <RefreshCw className="w-2.5 h-2.5" />
          </button>

          {currentUrl && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#161E2C] hover:bg-[#FF7A00] text-gray-300 hover:text-white border border-[#2D3A50] text-[9px] font-bold transition-all shadow-xs"
              title="Open full portal directly in a new tab (essential if portal requires company SSO)"
            >
              <span>Open Tab ↗</span>
            </a>
          )}

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 rounded bg-[#141923] text-gray-400 hover:text-white border border-[#232A39]"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-2.5 h-2.5" /> : <Maximize2 className="w-2.5 h-2.5" />}
          </button>
        </div>
      </div>

      {/* Inline Edit Bar (When user clicks "Edit Link") */}
      {isEditing && (
        <form onSubmit={handleSaveEdit} className="shrink-0 p-2 my-1 bg-[#141A24] rounded-lg border border-[#2F3A4E] space-y-1.5 text-xs animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#FF7A00]">Edit Link for {currentServiceKey.toUpperCase()}</span>
            <span className="text-[9px] text-[#6F7C93]">Saves to MongoDB Atlas</span>
          </div>

          <div className="flex gap-1.5">
            <input
              type="url"
              required
              placeholder="Paste Grafana dashboard or panel embed URL..."
              value={editUrl}
              onChange={e => setEditUrl(e.target.value)}
              className="flex-1 bg-[#0E121A] border border-[#2B3548] text-white px-2 py-1 rounded text-[10px] outline-none focus:border-[#FF7A00]"
            />
            <button
              type="submit"
              className="px-2.5 py-1 bg-[#FF7A00] hover:bg-[#FF8B21] text-white text-[10px] font-bold rounded flex items-center gap-1 shadow-xs"
            >
              <Check className="w-3 h-3" />
              <span>Save & Render</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="p-1 bg-[#1E2533] text-gray-400 hover:text-white rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </form>
      )}

      {/* Main Body: Column of all 6 services on the Left + Live Auto-Adjusted Dashboard on the Right */}
      <div className="mt-1 flex-1 flex gap-2 min-h-0 overflow-hidden">
        
        {/* LEFT COLUMN: All 6 Services displayed in a permanent vertical column (NOT changeable tabs!) */}
        <div className="w-36 shrink-0 flex flex-col justify-between space-y-1 overflow-y-auto no-scrollbar pr-0.5">
          {SERVICES.map(s => {
            const isSel = currentServiceKey === s.id;
            const dotColor = s.status === 'RED' 
              ? 'bg-[#EF4444]' 
              : s.status === 'AMBER' 
                ? 'bg-[#F59E0B]' 
                : 'bg-[#10B981]';

            return (
              <div
                key={s.id}
                onClick={() => handleSelectService(s.id)}
                className={`w-full px-2 py-1.5 rounded-lg border text-left cursor-pointer transition-all flex items-center justify-between group ${
                  isSel 
                    ? 'bg-[#18202E] border-[#FF7A00] ring-1 ring-[#FF7A00]' 
                    : 'bg-[#11151F] border-[#222938] hover:bg-[#151B27]'
                }`}
              >
                <div className="min-w-0 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                  <div className="truncate">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-white leading-none truncate">{s.name}</span>
                      {s.alertCount > 0 && (
                        <span className={`text-[8px] font-extrabold px-1 rounded ${
                          s.status === 'RED' ? 'bg-[#EF4444] text-white' : 'bg-[#F59E0B] text-black'
                        }`}>
                          {s.alertCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Edit Pencil Icon on hover */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectService(s.id);
                    setEditUrl(dashboardLinks[s.id] || '');
                    setEditTitle(dashboardTitles[s.id] || `${siteName} — ${s.name} Dashboard`);
                    setIsEditing(true);
                  }}
                  className="opacity-60 hover:opacity-100 text-[#8692A6] hover:text-[#FF7A00] p-0.5"
                  title={`Edit link for ${s.name}`}
                >
                  <Edit3 className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* RIGHT AREA: Live Rendered Dashboard with ZERO Scrollbars and Auto-Adjust Scale */}
        <div className="flex-1 h-full rounded-lg bg-[#090C12] border border-[#232A39] overflow-hidden relative no-scrollbar">
          {hasCustomUrl ? (
            /* Auto-adjusted container: scales iframe without scrollbars or extra zoom */
            <div 
              className="w-full h-full overflow-hidden no-scrollbar relative group"
              style={{ overflow: 'hidden' }}
            >
              {/* Direct Open Tab link */}
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="absolute top-1.5 right-1.5 z-20 px-1.5 py-0.5 rounded bg-[#101622]/90 hover:bg-[#FF7A00] text-gray-200 hover:text-white text-[9px] font-bold border border-[#2D3A50] shadow-md transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100"
                title="Open in new window"
              >
                <span>Open Tab ↗</span>
              </a>
              <iframe
                key={iframeKey}
                src={effectiveEmbedSrc}
                title={currentTitle}
                scrolling="no"
                className="border-0 no-scrollbar"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                loading="lazy"
                style={{
                  width: `${100 / zoomLevel}%`,
                  height: `${100 / zoomLevel}%`,
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: '0 0',
                  overflow: 'hidden',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                }}
              />
            </div>
          ) : (
            /* High-Tech Industrial Service Waveform & Stream (Zero Errors) */
            <div className="w-full h-full p-2.5 flex flex-col justify-between select-none overflow-hidden no-scrollbar">
              <div className="flex items-center justify-between text-[10px] text-[#7A88A1]">
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {currentServiceKey.toUpperCase()} Live Ingestion
                </span>
                <span>100ms Telemetry</span>
              </div>

              {/* Service Live Waveform */}
              <div className="my-auto py-1">
                <svg className="w-full h-20 stroke-[#FF7A00] fill-none" viewBox="0 0 400 70" preserveAspectRatio="none">
                  <path
                    d="M0,35 Q40,5 80,35 T160,35 T240,15 T320,55 T400,35"
                    strokeWidth="2"
                  />
                  <path
                    d="M0,35 Q40,5 80,35 T160,35 T240,15 T320,55 T400,35 L400,70 L0,70 Z"
                    className="fill-[#FF7A00]/10 stroke-none"
                  />
                </svg>
              </div>

              {/* Service Live Metrics Strip */}
              <div className="flex items-center justify-between pt-1 border-t border-[#1C2332] text-[9px] text-[#6C7991]">
                <span>Uptime: <strong className="text-white">99.8%</strong></span>
                <span>Latency: <strong className="text-emerald-400">12ms</strong></span>
                <button
                  onClick={handleStartEdit}
                  className="text-[#FF7A00] hover:underline font-bold"
                >
                  Paste Link ✎
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
