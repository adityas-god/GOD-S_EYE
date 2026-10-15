import { useState, useEffect, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
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
  CircleHelp,
  PanelLeftClose,
  Sun,
  Moon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

import { useAuth } from './auth-context';
import { ConnectionsDialog, SignInDialog } from './dashboard-dialogs';
import { useQuery } from '@tanstack/react-query';
import { sitesQueryOptions } from '@/lib/sites';

export function DashboardShell({ children, detail = false }: { children: ReactNode; detail?: boolean }) {
  const { data: sites } = useQuery(sitesQueryOptions());
  const actualSitesCount = sites?.length ?? 78;
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
          <span className="workspace-icon">S</span>
          <div>
            <strong>Operations workspace</strong>
            <small>Site monitoring</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <Button variant="nav" asChild className={!detail ? 'active' : ''}>
            <Link to="/">
              <LayoutGrid />
              Site overview
              <span className="nav-count">{actualSitesCount}</span>
            </Link>
          </Button>
          <Button variant="nav" onClick={() => setConnections(true)}>
            <PlugZap />
            Connections
            <span className="connection-dot" />
          </Button>
        </nav>
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
            <p>Awaiting connection</p>
          </div>
          <Button variant="nav" onClick={() => setConnections(true)}>
            <CircleHelp />
            Connection details
            <ArrowUpRight />
          </Button>
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
            <span>{detail ? 'Site details' : 'Site overview'}</span>
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