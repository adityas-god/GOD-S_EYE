import React, { useState } from 'react';
import { RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import { toProxyUrl, isRealDashboardUrl, normalizeGrafanaUrl } from '../../utils/proxyUrl';

interface GrafanaPanelProps {
  panelUrl: string;
  title?: string;
  height?: string | number;
  width?: string | number;
  interactive?: boolean;
  className?: string;
}

export const GrafanaPanel: React.FC<GrafanaPanelProps> = ({
  panelUrl,
  title = 'Grafana Metric Panel',
  height = '100%',
  width = '100%',
  interactive = true,
  className = '',
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const cleanUrl = normalizeGrafanaUrl(panelUrl);
  const isValid = isRealDashboardUrl(cleanUrl);
  const proxiedSrc = toProxyUrl(cleanUrl);

  const handleIframeLoad = (iframe: HTMLIFrameElement | null) => {
    setIsLoading(false);
    if (!iframe) return;
    try {
      const docTitle = iframe.contentDocument?.title || '';
      const docBody = iframe.contentDocument?.body?.innerText || '';
      const is404 =
        docTitle.toLowerCase().includes('not found') ||
        docBody.toLowerCase().includes('page not found') ||
        docBody.toLowerCase().includes("we're looking but can't");
      if (is404) setHasError(true);
    } catch (_) {
      // Cross-origin fallback (normal in production)
    }
  };

  const handleReload = () => {
    setHasError(false);
    setIsLoading(true);
    setReloadKey(prev => prev + 1);
  };

  if (!isValid) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-4 bg-[#080B10] rounded-xl border border-[#1A2232] text-gray-400 ${className}`}
        style={{ width, height }}
      >
        <AlertCircle className="w-8 h-8 text-gray-500 mb-2" />
        <span className="text-xs font-semibold text-gray-300">No Valid Grafana URL</span>
        <span className="text-[10px] text-gray-500 mt-1">Configure a panel embed URL to render telemetry.</span>
      </div>
    );
  }

  return (
    <div
      className={`relative bg-[#070A0F] rounded-xl overflow-hidden border border-[#1B2333] flex flex-col ${className}`}
      style={{ width, height }}
    >
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 bg-[#070A0F] flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 text-[#FF7A00] animate-spin" />
          <span className="text-[10px] text-gray-400 font-mono tracking-wider">Loading Grafana Panel…</span>
        </div>
      )}

      {/* 404 / Error State */}
      {hasError && (
        <div className="absolute inset-0 z-30 bg-[#080B10] flex flex-col items-center justify-center gap-2 text-center p-4">
          <span className="text-2xl">⚠️</span>
          <span className="text-xs font-bold text-amber-400">Grafana Panel Not Found</span>
          <span className="text-[10px] text-gray-400 max-w-xs">
            The panel ID or dashboard may have changed or requires login.
          </span>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleReload}
              className="px-2.5 py-1 text-[10px] rounded bg-[#1C2433] text-white hover:bg-[#28354A] flex items-center gap-1 font-semibold"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
            <a
              href={cleanUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 text-[10px] rounded bg-[#FF7A00]/20 text-[#FF7A00] border border-[#FF7A00]/40 hover:bg-[#FF7A00]/30 flex items-center gap-1 font-semibold"
            >
              <ExternalLink className="w-3 h-3" /> Open in Grafana
            </a>
          </div>
        </div>
      )}

      {/* Embedded Iframe */}
      <iframe
        key={reloadKey}
        src={proxiedSrc}
        title={title}
        width="100%"
        height="100%"
        scrolling="no"
        frameBorder="0"
        allowFullScreen
        onLoad={e => handleIframeLoad(e.currentTarget)}
        className="w-full h-full border-none"
      />

      {/* Non-interactive overlay shield if interactive is false */}
      {!interactive && <div className="absolute inset-0 z-10 cursor-pointer" />}
    </div>
  );
};

export default GrafanaPanel;
