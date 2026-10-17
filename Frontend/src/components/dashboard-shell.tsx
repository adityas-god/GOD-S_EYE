import { useState, useEffect, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutGrid,
  PlugZap,
  ArrowUpRight,
  Bell,
  ChevronDown,
  Radio,
  Cloud,
  LogOut,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';

import { useAuth } from './auth-context';
import { ConnectionsDialog, SignInDialog } from './dashboard-dialogs';
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

  const { data: sites } = useQuery(sitesQueryOptions());
  const actualSitesCount = sites?.length ?? 78;

  const { data: redZoneOverview } = useQuery({
    queryKey: ['salesforce-red-zone'],
    queryFn: () => sfFetchRedZoneSites(),
    staleTime: 45_000,
    refetchInterval: 60_000,
  });
  const redZoneCount = redZoneOverview?.totalRedZoneSites ?? 0;

  const [login, setLogin] = useState(false);
  const [connections, setConnections] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, admin, signOut } = useAuth();

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
          <Button variant="nav" asChild className={!detail && !isRedZoneActive && activeTab === 'all' ? 'active' : ''}>
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
      <div className="main-column">
        <header className="topbar">
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
            <span>{detail ? 'Site details' : isRedZoneActive ? 'RED zone sites' : 'Site overview'}</span>
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
            <Button
              variant="ghost"
              className="account-button"
              onClick={() => setLogin(true)}
            >
              <span className="avatar">{user ? user.email?.slice(0, 2).toUpperCase() : 'OP'}</span>
              <span>
                {user ? (admin ? 'Administrator' : 'Viewer') : 'Sign in'}
                <small>{user ? 'Operations workspace' : 'Admin access'}</small>
              </span>
              <ChevronDown />
            </Button>
            {user && (
              <Button
                variant="ghost"
                size="icon"
                title="Sign out"
                aria-label="Sign out"
                onClick={signOut}
              >
                <LogOut />
              </Button>
            )}
          </div>
        </header>
        <main>{children}</main>
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
      </div>
      <SignInDialog open={login} onOpenChange={setLogin} />
      <ConnectionsDialog open={connections} onOpenChange={setConnections} />
    </div>
  );
}