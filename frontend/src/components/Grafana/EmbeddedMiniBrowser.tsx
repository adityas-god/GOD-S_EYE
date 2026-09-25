import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, 
  RefreshCw, 
  ExternalLink, 
  Copy, 
  Check, 
  ArrowRight, 
  Maximize2, 
  Minimize2,
  ZoomIn,
  ZoomOut,
  Layers,
  Sparkles,
  Globe,
  ShieldCheck
} from 'lucide-react';
import { normalizeGrafanaUrl, toProxyUrl } from '../../utils/proxyUrl';
import { openGrafanaMiniBrowser } from '../../utils/openMiniBrowser';

export interface EmbeddedMiniBrowserProps {
  initialUrl: string;
  title?: string;
  metricLabel?: string;
  accentColor?: string;
  compact?: boolean;
  onUrlChange?: (newUrl: string) => void;
  onClose?: () => void;
  height?: string | number;
}

const DASHBOARD_PRESETS = [
  {
    name: 'CloudOps Threads',
    url: 'https://cloudwatch.greymatter.greyorange.com/d-solo/CloudOps-dashboard/cloudops-dashboard?var-inter=1s&orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=apotekprod-prod&var-Host=$__all&var-path=%2F&var-cpu=$__all&var-disk=$__all&var-interface=$__all&panelId=panel-120&__feature.dashboardSceneSolo=true'
  },
  {
    name: 'Influx Stats',
    url: 'https://cloudwatch.greymatter.greyorange.com/d-solo/influx-stats/influx-stats?orgId=1&from=now-30m&to=now&timezone=browser&var-SiteDB=adamsprod-prod&panelId=panel-4&__feature.dashboardSceneSolo=true'
  },
  {
    name: 'Process Metrics',
    url: 'https://cloudwatch.greymatter.greyorange.com/d-solo/LyR7MASDk/process-service-metrics-dashboard-v1?orgId=1&from=now-30m&to=now&timezone=browser&var-endpoint=$__all&var-http_method=$__all&var-tenant_id=$__all&var-datasource=adamsprod-prod&panelId=panel-160&__feature.dashboardSceneSolo=true'
  }
];

export const EmbeddedMiniBrowser: React.FC<EmbeddedMiniBrowserProps> = ({
  initialUrl,
  title = 'Telemetry Mini-Browser',
  metricLabel = 'LIVE',
  accentColor = '#FF7A00',
  compact = false,
  onUrlChange,
  onClose,
  height = '100%'
}) => {
  const [currentUrl, setCurrentUrl] = useState<string>(initialUrl);
  const [inputUrl, setInputUrl] = useState<string>(initialUrl);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // Default 1.0x native responsive
  
  // Default to Direct SSO mode so it inherits user's active Chrome login session
  const [useDirect, setUseDirect] = useState<boolean>(() => {
    return localStorage.getItem('grafana_embed_mode') !== 'proxy';
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (initialUrl) {
      setCurrentUrl(initialUrl);
      setInputUrl(initialUrl);
      setIsLoading(true);
      setIframeKey(k => k + 1);
    }
  }, [initialUrl]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputUrl.trim()) return;
    
    let formatted = inputUrl.trim();
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      formatted = `https://${formatted}`;
    }
    const clean = normalizeGrafanaUrl(formatted) || formatted;
    setCurrentUrl(clean);
    setInputUrl(clean);
    setIsLoading(true);
    setIframeKey(k => k + 1);
    if (onUrlChange) {
      onUrlChange(clean);
    }
  };

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey(k => k + 1);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleDirectMode = () => {
    setUseDirect(prev => {
      const next = !prev;
      localStorage.setItem('grafana_embed_mode', next ? 'direct' : 'proxy');
      return next;
    });
    setIsLoading(true);
    setIframeKey(k => k + 1);
  };

  const handlePopout = () => {
    openGrafanaMiniBrowser(currentUrl, metricLabel);
  };

  const normalizedUrl = normalizeGrafanaUrl(currentUrl) || currentUrl;
  const proxiedUrl = toProxyUrl(normalizedUrl);
  // Direct mode loads native URL; Proxy mode routes through backend
  const effectiveEmbedSrc = useDirect ? normalizedUrl : proxiedUrl;

  return (
    <div 
      className="flex flex-col w-full h-full bg-[#070A0F] rounded-xl border border-[#232A39] overflow-hidden font-mono shadow-xl relative select-none"
      style={{ borderColor: `${accentColor}33` }}
    >
      {/* ── TOP ADDRESS BAR & BROWSER TOOLBAR ── */}
      <div className={`bg-[#0F141F] border-b border-[#1C2436] flex items-center justify-between gap-2 shrink-0 ${compact ? 'px-2 py-1' : 'px-3 py-1.5'}`}>
        
        {/* Left: Window Dots / Status & Title */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            <span 
              className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] inline-block cursor-pointer hover:opacity-80" 
              onClick={onClose} 
              title="Close panel" 
            />
            <span 
              className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] inline-block cursor-pointer hover:opacity-80" 
              onClick={handleReload} 
              title="Reload frame" 
            />
            <span 
              className="w-2.5 h-2.5 rounded-full bg-[#27C93F] inline-block cursor-pointer hover:opacity-80" 
              onClick={handlePopout} 
              title="Popout as Standalone Window" 
            />
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            <span 
              className="text-[9px] font-black px-1.5 py-0.2 rounded uppercase shrink-0"
              style={{ backgroundColor: `${accentColor}25`, color: accentColor, border: `1px solid ${accentColor}55` }}
            >
              {metricLabel}
            </span>
            {!compact && (
              <span className="text-[11px] font-bold text-gray-200 truncate hidden sm:inline">
                {title}
              </span>
            )}
          </div>
        </div>

        {/* Center: Address Bar with URL Input & Go Button */}
        <form 
          onSubmit={handleSearch} 
          className="flex-1 max-w-xl flex items-center gap-1 bg-[#090D14] border border-[#232C3E] focus-within:border-[#FF7A00] rounded-lg px-2 py-0.5 transition-colors text-xs"
        >
          <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
          <input 
            type="text"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder="Paste Grafana dashboard or panel URL..."
            className="flex-1 bg-transparent text-gray-200 text-[10px] font-mono outline-none placeholder-gray-600 truncate"
          />
          <button 
            type="submit" 
            className="p-0.5 text-gray-400 hover:text-white transition-colors"
            title="Navigate to URL"
          >
            <ArrowRight className="w-3 h-3 text-[#FF7A00]" />
          </button>
          <button 
            type="button" 
            onClick={handleCopy} 
            className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
            title="Copy URL"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
        </form>

        {/* Right: Controls (Reload, Zoom, Direct/Proxy, Popout) */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Zoom Selector */}
          <div className="hidden md:flex items-center bg-[#131926] rounded border border-[#222C3E] p-0.5 text-[9px]">
            <button
              type="button"
              onClick={() => setZoomLevel(z => Math.max(0.33, Number((z - 0.15).toFixed(2))))}
              className="px-1 text-gray-400 hover:text-white"
              title="Zoom out"
            >
              <ZoomOut className="w-2.5 h-2.5" />
            </button>
            <span className="px-1 text-[#FF7A00] font-bold">{Math.round(zoomLevel * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel(z => Math.min(1.5, Number((z + 0.15).toFixed(2))))}
              className="px-1 text-gray-400 hover:text-white"
              title="Zoom in"
            >
              <ZoomIn className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Mode Toggle: Direct SSO vs Proxy */}
          <button
            type="button"
            onClick={toggleDirectMode}
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors flex items-center gap-1 ${
              useDirect
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25'
                : 'bg-[#FF7A00]/15 text-[#FF7A00] border-[#FF7A00]/40 hover:bg-[#FF7A00]/25'
            }`}
            title={useDirect ? 'Mode: Direct (using active Chrome SSO session)' : 'Mode: Backend Proxy Layer'}
          >
            <ShieldCheck className="w-2.5 h-2.5" />
            <span>{useDirect ? '⚡ Direct' : '🛡️ Proxy'}</span>
          </button>

          {/* Reload button */}
          <button
            type="button"
            onClick={handleReload}
            className="p-1 rounded bg-[#161D2B] text-gray-400 hover:text-white transition-colors"
            title="Reload container"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-[#FF7A00]' : ''}`} />
          </button>

          {/* Launch Standalone Popup Window */}
          <button
            type="button"
            onClick={handlePopout}
            className="px-2 py-0.5 rounded bg-gradient-to-r from-[#FF7A00] to-[#FF932E] hover:brightness-110 text-white text-[9.5px] font-bold flex items-center gap-1 shadow-xs transition-all"
            title="Pop out into a standalone window"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            <span className="hidden sm:inline">Popout</span>
          </button>
        </div>
      </div>

      {/* ── OPTIONAL PRESET BOOKMARK TABS (Non-compact mode) ── */}
      {!compact && (
        <div className="bg-[#0B0F17] px-3 py-1 border-b border-[#182030] flex items-center justify-between text-[9px] text-gray-400 overflow-x-auto no-scrollbar gap-2 shrink-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[8.5px] uppercase font-bold text-gray-500">Presets:</span>
            {DASHBOARD_PRESETS.map(p => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setInputUrl(p.url);
                  setCurrentUrl(p.url);
                  setIsLoading(true);
                  setIframeKey(k => k + 1);
                  if (onUrlChange) onUrlChange(p.url);
                }}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  currentUrl.includes(p.name.toLowerCase().split(' ')[0])
                    ? 'bg-[#FF7A00]/20 text-[#FF7A00] border-[#FF7A00]/40 font-bold'
                    : 'bg-[#111722] text-gray-400 border-[#1F293A] hover:text-white hover:border-gray-500'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 text-[8.5px] text-emerald-400 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Native Chrome SSO Active</span>
          </div>
        </div>
      )}

      {/* ── EMBEDDED WEB CONTAINER (IFRAME VIEWPORT) ── */}
      <div className="flex-1 w-full relative overflow-hidden bg-[#070A0F]">
        {isLoading && (
          <div className="absolute inset-0 z-10 bg-[#070A0F]/85 flex flex-col items-center justify-center gap-2 select-none">
            <RefreshCw className="w-5 h-5 animate-spin text-[#FF7A00]" />
            <span className="text-[10px] text-gray-400">Loading {metricLabel} container...</span>
          </div>
        )}

        {effectiveEmbedSrc ? (
          <div 
            className="w-full h-full overflow-hidden no-scrollbar"
            style={{
              width: `${100 / zoomLevel}%`,
              height: `${100 / zoomLevel}%`,
              transform: `scale(${zoomLevel})`,
              transformOrigin: '0 0'
            }}
          >
            <iframe
              ref={iframeRef}
              key={`${iframeKey}-${useDirect ? 'direct' : 'proxy'}`}
              src={effectiveEmbedSrc}
              title={`${metricLabel} Mini-Browser Container`}
              onLoad={() => setIsLoading(false)}
              onError={() => setIsLoading(false)}
              className="w-full h-full border-0 no-scrollbar"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              loading="lazy"
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#070A0F',
              }}
            />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center p-4">
            <Globe className="w-8 h-8 text-gray-600" />
            <p className="text-gray-300 text-xs font-bold">No Panel URL Loaded</p>
            <p className="text-gray-500 text-[10px] max-w-sm">
              Enter a Grafana solo panel URL or select one of the presets above.
            </p>
          </div>
        )}
      </div>

      {/* ── BOTTOM INFO BAR ── */}
      <div className="bg-[#0B0F17] px-3 py-1 border-t border-[#182030] flex items-center justify-between text-[8.5px] text-gray-500 shrink-0">
        <span className="truncate max-w-md">
          Loaded: <strong className="text-gray-400 font-mono">{currentUrl}</strong>
        </span>
        <div className="flex items-center gap-2">
          <span>Mode: <strong className={useDirect ? 'text-emerald-400' : 'text-[#FF7A00]'}>{useDirect ? 'Direct Chrome SSO' : 'Reverse Proxy'}</strong></span>
        </div>
      </div>
    </div>
  );
};
