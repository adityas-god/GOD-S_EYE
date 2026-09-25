/**
 * proxyUrl.ts
 * 
 * Routes Grafana / Cloudwatch iframe URLs through the backend proxy
 * which strips X-Frame-Options: deny and Content-Security-Policy headers.
 * 
 * Backend endpoint: GET /api/proxy-dashboard?url=<encoded>
 */

const BACKEND_BASE = (import.meta as any).env?.VITE_API_URL || '';

/**
 * Normalizes any Grafana URL or embed HTML snippet:
 * 1. If user pastes an <iframe> snippet (from Grafana "Share embed" -> "Embed HTML"),
 *    extracts the src="..." attribute value.
 * 2. Unescapes HTML entities like &amp; -> &.
 * 3. Strips surrounding quotes or whitespace.
 * 4. Converts full dashboard route (/d/UID/slug) to solo panel embed route (/d-solo/UID/slug).
 * 5. Replaces viewPanel=... with panelId=...
 * 6. Ensures __feature.dashboardSceneSolo=true is set on /d-solo/ URLs.
 */
export function normalizeGrafanaUrl(raw: string | undefined | null): string {
  if (!raw) return '';
  let str = raw.trim();

  // If user pasted an entire <iframe ... src="..." ...> tag
  const iframeMatch = str.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeMatch && iframeMatch[1]) {
    str = iframeMatch[1].trim();
  }

  // Strip leading/trailing quotes
  str = str.replace(/^["']|["']$/g, '').trim();

  // Decode common HTML entities (like &amp;)
  str = str.replace(/&amp;/g, '&');

  // If user pasted a domain without protocol (e.g. cloudwatch.greymatter.com/...)
  if (!str.startsWith('http://') && !str.startsWith('https://') && !str.startsWith('/')) {
    str = `https://${str}`;
  }

  try {
    const urlObj = new URL(str);

    // Convert viewPanel= to panelId=
    const viewPanel = urlObj.searchParams.get('viewPanel');
    if (viewPanel) {
      urlObj.searchParams.delete('viewPanel');
      if (!urlObj.searchParams.has('panelId')) {
        urlObj.searchParams.set('panelId', viewPanel);
      }
    }

    // ONLY convert /d/ to /d-solo/ if an explicit panelId is present!
    // Without a panelId, /d-solo/ causes Grafana to throw "Panel not found"!
    if (urlObj.searchParams.has('panelId')) {
      if (urlObj.pathname.match(/^\/d\/[^/]+/)) {
        urlObj.pathname = urlObj.pathname.replace(/^\/d\//, '/d-solo/');
      }
      if (!urlObj.searchParams.has('__feature.dashboardSceneSolo')) {
        urlObj.searchParams.set('__feature.dashboardSceneSolo', 'true');
      }
      if (!urlObj.searchParams.has('theme')) {
        urlObj.searchParams.set('theme', 'dark');
      }
    } else {
      // Full dashboard view: add kiosk=tv so Grafana header/sidebar doesn't clutter the embed
      if (!urlObj.searchParams.has('kiosk')) {
        urlObj.searchParams.set('kiosk', 'tv');
      }
    }

    // Convert frozen millisecond timestamps (from Grafana "Lock time range") to live relative window
    const fromParam = urlObj.searchParams.get('from');
    const toParam = urlObj.searchParams.get('to');
    if (fromParam && /^\d{12,13}$/.test(fromParam)) {
      urlObj.searchParams.set('from', 'now-30m');
    }
    if (toParam && /^\d{12,13}$/.test(toParam)) {
      urlObj.searchParams.set('to', 'now');
    }

    return urlObj.toString();
  } catch (_) {
    return str;
  }
}

/**
 * Returns a proxied URL for embedding in an iframe.
 * If the url is empty or already a local proxy URL, returns it unchanged.
 */
export function toProxyUrl(url: string | undefined | null): string {
  if (!url) return '';
  const normalized = normalizeGrafanaUrl(url);
  if (!normalized) return '';
  // Already proxied — don't double-proxy
  if (
    normalized.startsWith('/api/proxy-dashboard') || 
    normalized.includes('/api/proxy-dashboard') ||
    normalized.startsWith('/d-solo/') ||
    normalized.includes('/d-solo/')
  ) {
    return normalized;
  }

  try {
    const u = new URL(normalized);
    // If it's a /d-solo/ or /d/ route on the primary Grafana host, route directly to matching backend route
    // so Grafana's client-side React router sees the exact pathname without 404
    if ((u.pathname.startsWith('/d-solo/') || u.pathname.startsWith('/d/')) && u.origin.includes('cloudwatch.greymatter.greyorange.com')) {
      return `${BACKEND_BASE}${u.pathname}${u.search}`;
    }
  } catch (_) {}

  return `${BACKEND_BASE}/api/proxy-dashboard?url=${encodeURIComponent(normalized)}`;
}

/**
 * Returns true if the URL is a real Grafana/dashboard URL that should be embedded.
 * Filters out dead Wikimedia placeholders.
 */
export function isRealDashboardUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const normalized = normalizeGrafanaUrl(url);
  return !!normalized && (normalized.includes('http://') || normalized.includes('https://') || normalized.startsWith('/'));
}
