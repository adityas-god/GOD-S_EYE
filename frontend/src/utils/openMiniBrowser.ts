/**
 * Opens Grafana dashboards or panels in a dedicated, standalone "Mini-Browser" window.
 * 
 * Why this works when iframes fail:
 * 1. Operates directly in the user's native Chrome session, automatically inheriting
 *    active corporate SSO (Okta / Google Workspace / Azure AD) credentials.
 * 2. Completely immune to 'X-Frame-Options: deny' and 'frame-ancestors' CSP restrictions,
 *    as those only apply to embedded <iframe> contexts.
 * 3. Grafana React Scenes and canvas telemetry compile at 100% fidelity without micro-scaling bugs.
 */
export function openGrafanaMiniBrowser(url: string, title?: string): Window | null {
  if (!url) return null;

  let targetUrl = url.trim();

  // Extract URL if full <iframe ... src="..."> snippet was passed
  const iframeMatch = targetUrl.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeMatch && iframeMatch[1]) {
    targetUrl = iframeMatch[1].trim();
  }

  targetUrl = targetUrl.replace(/^["']|["']$/g, '').replace(/&amp;/g, '&').trim();

  // Fallback to default Grafana origin if root-relative
  if (targetUrl.startsWith('/')) {
    targetUrl = `https://cloudwatch.greymatter.greyorange.com${targetUrl}`;
  }

  // Calculate centered dimensions for a focused, clean desktop mini-browser window
  const width = Math.min(1180, Math.max(800, Math.round(window.screen.width * 0.80)));
  const height = Math.min(740, Math.max(550, Math.round(window.screen.height * 0.78)));
  const left = Math.max(0, Math.round((window.screen.width - width) / 2));
  const top = Math.max(0, Math.round((window.screen.height - height) / 2));

  const windowFeatures = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'status=no',
    'resizable=yes',
    'scrollbars=yes'
  ].join(',');

  const safeTitle = (title || 'grafana_panel').replace(/[^a-zA-Z0-9_]/g, '_');
  const popup = window.open(targetUrl, `grafana_mini_${safeTitle}`, windowFeatures);

  if (popup) {
    popup.focus();
  }

  return popup;
}
