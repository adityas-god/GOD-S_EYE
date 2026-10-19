import { useState, useEffect, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutGrid,
  PlugZap,
  ArrowUpRight,
  Bell,
  Radio,
  Cloud,
  Shield,
  ShieldAlert,
  CircleHelp,
  PanelLeftClose,
  Sun,
  Moon,
  Link2,
  Video,
  Server,
  MessageSquare,
  History,
  Settings,
  Activity,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

import { ConnectionsDialog } from './dashboard-dialogs';
import { useQuery } from '@tanstack/react-query';
import { sitesQueryOptions } from '@/lib/sites';
import { sfFetchRedZoneSites } from '@/integrations/salesforce/client';
import type { SiteRunbook } from '@/lib/runbook';
import type { RunbookTabKey } from '@/components/site-runbook-panel';

export function DashboardShell({
  children,
  detail = false,
  siteRunbook,
  onOpenRunbookTab,
  activeTab = 'monitoring',
}: {
  children: ReactNode;
  detail?: boolean;
  siteRunbook?: SiteRunbook;
  onOpenRunbookTab?: (tab: 'monitoring' | RunbookTabKey) => void;
  activeTab?: 'monitoring' | RunbookTabKey;
}) {
  const routerState = useRouterState();
  const currentPath = routerState?.location?.pathname ?? '';
  const isRedZoneActive = currentPath === '/red-zone';
  const isAnalyticsActive = currentPath === '/analytics';
  const isPulseAiActive = currentPath === '/pulse-ai' || currentPath.startsWith('/pulse-ai');

  const { data: sites } = useQuery(sitesQueryOptions());
  const actualSitesCount = sites?.length ?? 78;

  const { data: redZoneOverview } = useQuery({
    queryKey: ['salesforce-red-zone'],
    queryFn: () => sfFetchRedZoneSites(),
    staleTime: 45_000,
    refetchInterval: 60_000,
  });
  const redZoneCount = redZoneOverview?.totalRedZoneSites ?? 0;

  const [connections, setConnections] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sitepulse-theme');
      if (stored === 'light' || stored === 'dark') return stored;
      return 'light'; // Default to white version as requested
    }
    return 'light';
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (theme === 'light') {
        root.classList.add('light');
        root.setAttribute('data-theme', 'light');
      } else {
        root.classList.remove('light');
        root.setAttribute('data-theme', 'dark');
      }
      localStorage.setItem('sitepulse-theme', theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
        setTheme(next);
      });
    } else {
      setTheme(next);
    }
  };

  return (
    <div className={`dashboard${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <Link to="/" className="wordmark" aria-label="Sitepulse home">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          sitepulse<span className="brand-period">.</span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">
            {detail && siteRunbook?.name ? siteRunbook.name.charAt(0).toUpperCase() : 'S'}
          </span>
          <div>
            <strong>{detail && siteRunbook?.name ? siteRunbook.name : 'Operations workspace'}</strong>
            <small>{detail && siteRunbook?.name ? 'Site Runbook & War-Room' : 'Site monitoring'}</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <Button variant="nav" asChild className={!detail && !isRedZoneActive && !isAnalyticsActive && activeTab === 'all' ? 'active' : ''}>
            <Link to="/">
              <LayoutGrid />
              All sites
              <span className="nav-count">{actualSitesCount}</span>
            </Link>
          </Button>

          <Button
            variant="nav"
            asChild
            className={isRedZoneActive ? 'active' : ''}
          >
            <Link to="/red-zone">
              <ShieldAlert />
              RED zone sites
              <span className="nav-count">{redZoneCount}</span>
            </Link>
          </Button>

          <Button
            variant="nav"
            asChild
            className={isAnalyticsActive ? 'active' : ''}
          >
            <Link to="/analytics">
              <BarChart3 />
              GO analytics
            </Link>
          </Button>

          <Button
            variant="nav"
            asChild
            className={isPulseAiActive ? 'active' : ''}
          >
            <Link to="/pulse-ai">
              <span>pulse AI</span>
              <span className="nav-ai-badge" style={{
                marginLeft: 'auto',
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #f97316, #ef4444)',
                color: '#fff',
                letterSpacing: '0.5px',
                boxShadow: 'none',
              }}>
                AI
              </span>
            </Link>
          </Button>

          {/* Site Monitoring (The 2 buckets: Salesforce cases & Opsgenie alerts) */}
          {detail && (
            <Button
              variant="nav"
              className={activeTab === 'monitoring' ? 'active' : ''}
              onClick={() => onOpenRunbookTab?.('monitoring')}
            >
              <Activity />
              Site monitoring
            </Button>
          )}
        </nav>

        {/* 6 OPERATIONAL RUNBOOK FEATURES IN SIDEBAR */}
        {detail && siteRunbook && (
          <>
            <div className="nav-label" style={{ marginTop: 22 }}>SITE RUNBOOK</div>
            <nav style={{ gap: 4 }}>
              <Button
                variant="nav"
                className={activeTab === 'links' ? 'active' : ''}
                onClick={() => onOpenRunbookTab?.('links')}
                title="Direct dashboards & telemetry links"
              >
                <Link2 style={{ width: 14, height: 14 }} />
                <span>Monitoring links</span>
                {siteRunbook.monitoring_links.length > 0 && (
                  <span className="nav-count">{siteRunbook.monitoring_links.length}</span>
                )}
              </Button>

              <Button
                variant="nav"
                className={activeTab === 'zoom' ? 'active' : ''}
                onClick={() => onOpenRunbookTab?.('zoom')}
                title="Incident Zoom War-Room Bridge"
                style={{
                  background: siteRunbook.zoom_call?.is_active ? 'rgba(239, 68, 68, 0.12)' : undefined,
                  color: siteRunbook.zoom_call?.is_active ? '#ef4444' : undefined,
                }}
              >
                <Video style={{ width: 14, height: 14 }} />
                <span>Zoom call</span>
                {siteRunbook.zoom_call?.is_active ? (
                  <span
                    style={{
                      marginLeft: 'auto',
                      padding: '1.5px 5px',
                      borderRadius: 3,
                      background: '#ef4444',
                      color: '#ffffff',
                      fontSize: 8.5,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    LIVE
                  </span>
                ) : (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 9,
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    IDLE
                  </span>
                )}
              </Button>

              <Button
                variant="nav"
                className={activeTab === 'vms' ? 'active' : ''}
                onClick={() => onOpenRunbookTab?.('vms')}
                title="VM IPs & SSH Commands"
              >
                <Server style={{ width: 14, height: 14 }} />
                <span>VM IP list</span>
                {siteRunbook.vm_ips.length > 0 && (
                  <span className="nav-count">{siteRunbook.vm_ips.length}</span>
                )}
              </Button>

              <Button
                variant="nav"
                className={activeTab === 'slack' ? 'active' : ''}
                onClick={() => onOpenRunbookTab?.('slack')}
                title="Slack Operations Channel"
              >
                <MessageSquare style={{ width: 14, height: 14 }} />
                <span>Slack channel</span>
                {siteRunbook.slack?.is_configured ? (
                  <span
                    style={{
                      marginLeft: 'auto',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#38bdf8',
                    }}
                    title="Slack connected"
                  />
                ) : null}
              </Button>

              <Button
                variant="nav"
                className={activeTab === 'handovers' ? 'active' : ''}
                onClick={() => onOpenRunbookTab?.('handovers')}
                title="Shift Handovers & Deployments"
              >
                <History style={{ width: 14, height: 14 }} />
                <span>Handovers</span>
                {(siteRunbook.handovers.length + siteRunbook.deployments.length) > 0 && (
                  <span className="nav-count">
                    {siteRunbook.handovers.length + siteRunbook.deployments.length}
                  </span>
                )}
              </Button>

              <Button
                variant="nav"
                className={activeTab === 'configs' ? 'active' : ''}
                onClick={() => onOpenRunbookTab?.('configs')}
                title="Timestamped Site Configs History"
              >
                <Settings style={{ width: 14, height: 14 }} />
                <span>Site configs</span>
                {siteRunbook.site_configs.length > 0 && (
                  <span className="nav-count">{siteRunbook.site_configs.length}</span>
                )}
              </Button>
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="source-health">
            <span className="nav-label">YOUR DATA SOURCES</span>
            <div>
              <Radio />
              <span>Opsgenie</span>
              <span className="source-dot" />
            </div>
            <div>
              <Cloud />
              <span>Salesforce</span>
              <span className="source-dot" />
            </div>
            <p>Live Monitoring</p>
          </div>
          <div className="sidebar-foot">
            <span className="mini-brand">sitepulse.</span>
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div
        className="main-column"
        style={isPulseAiActive ? { height: '100vh', maxHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' } : undefined}
      >
        <header className="topbar" style={isPulseAiActive ? { flexShrink: 0 } : undefined}>
          <div className="breadcrumb">
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed(c => !c)}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <PanelLeftClose className="sidebar-glyph" />
            </button>
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <span>{detail ? 'Site details' : isRedZoneActive ? 'RED zone sites' : isAnalyticsActive ? 'GO analytics' : isPulseAiActive ? 'pulse AI' : 'Site overview'}</span>
          </div>
          <div className="top-actions">
            <span className="workspace-status">
              <span />
              Workspace ready
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'Dark mode' : 'Cream version'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 32,
                fontSize: 11,
                padding: '0 10px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {theme === 'light' ? <Moon style={{ width: 13, height: 13 }} /> : <Sun style={{ width: 13, height: 13 }} />}
              <span>{theme === 'light' ? 'Dark mode' : 'Cream version'}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Connection notifications"
              aria-label="Connection notifications"
              onClick={() => setConnections(true)}
            >
              <Bell />
            </Button>
            <span className="top-divider" />
            <div
              className="greyorange-logo-wrap"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="GreyOrange"
            >
              <img
                src="/greyorange-logo.svg"
                alt="GreyOrange"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: '1.5px solid rgba(245, 130, 32, 0.45)',
                  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.25)',
                  display: 'block',
                  objectFit: 'cover',
                  userSelect: 'none',
                }}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (target.src.endsWith('.svg')) {
                    target.src = '/greyorange-logo.jpg';
                  }
                }}
              />
            </div>
          </div>
        </header>
        <main style={isPulseAiActive ? { flex: 1, height: 'calc(100vh - 77px)', maxHeight: 'calc(100vh - 77px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } : undefined}>
          {children}
        </main>
        {!isPulseAiActive && (
          <footer className="main-footer">
            <span>
              <span className="footer-dot" />
              Operations, in focus.
            </span>
            <span>
              <Shield size={12} /> Secure workspace
              <span className="footer-separator">·</span>
              Sitepulse © 2026
            </span>
          </footer>
        )}
      </div>
      <ConnectionsDialog open={connections} onOpenChange={setConnections} />
    </div>
  );
}