import { useState, useMemo, useEffect } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Building2,
  Plus,
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Radio,
  Cloud,
  Trash2,
  Layers,
  ChevronDown,
  ChevronUp,
  PlugZap,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  Bell,
  MapPin,
  ExternalLink,
  User,
  X,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DashboardShell } from '@/components/dashboard-shell';
import { ConnectionsDialog, DeleteSiteDialog, SiteEditor, SignInDialog } from '@/components/dashboard-dialogs';
import { useAuth } from '@/components/auth-context';
import { sitesQueryOptions, type Site } from '@/lib/sites';
import { sfSyncOrgSites, sfFetchLiveCasesOverview, type SFCase, isAlertCase } from '@/integrations/salesforce/client';
import { toast } from 'sonner';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Site overview — Sitepulse' },
      { name: 'description', content: 'Monitor and manage your operational sites with Opsgenie alerts and Salesforce cases.' },
      { property: 'og:title', content: 'Site overview — Sitepulse' },
      { property: 'og:description', content: 'All your operational sites in one focused workspace.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  loader: async ({ context }) => {
    // Ensure base sites are cached immediately
    void context.queryClient.ensureQueryData(sitesQueryOptions());
    // Non-blocking prefetch of live Salesforce data so dashboard opens immediately without delay
    void context.queryClient.prefetchQuery({
      queryKey: ['salesforce-overview'],
      queryFn: () => sfFetchLiveCasesOverview(),
      staleTime: 30_000,
    });
  },
  component: Index,
});

interface EnrichedSite extends Site {
  open_cases_count?: number;
  open_alerts_count?: number;
  is_down?: boolean;
  case_numbers?: string[];
  sev1_count?: number;
  sev2_count?: number;
  sev3_count?: number;
}

function Index() {
  const queryClient = useQueryClient();
  const { data: baseSites } = useSuspenseQuery(sitesQueryOptions());
  const { admin, user } = useAuth();
  const [search, setSearch] = useState('');
  const [product, setProduct] = useState('All products');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [editor, setEditor] = useState(false);
  const [login, setLogin] = useState(false);
  const [connections, setConnections] = useState(false);
  const [deleteSite, setDeleteSite] = useState<Site | null>(null);
  const [syncingOrg, setSyncingOrg] = useState(false);
  const [showAllOperational, setShowAllOperational] = useState(false);
  const [activeBucket, setActiveBucket] = useState<'cases' | 'alerts'>('cases');
  const [selectedCase, setSelectedCase] = useState<SFCase | null>(null);
  const [ticketsCollapsed, setTicketsCollapsed] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('All');

  // Fetch live cases stats across the entire org (excludes alerts & solved/on-hold)
  const {
    data: sfOverview,
    isFetching: sfFetching,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['salesforce-overview'],
    queryFn: () => sfFetchLiveCasesOverview(),
    staleTime: 30_000,
    refetchInterval: 60_000, // automatic background refresh every 60 seconds
  });

  // Real-time synchronization via SSE from backend if available
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/webhooks/events');
      es.addEventListener('case_update', () => {
        void refetchOverview();
        void queryClient.invalidateQueries({ queryKey: ['sites'] });
      });
      es.onerror = () => {
        // If backend server on port 5000 is not running, close cleanly to avoid reconnect spam
        if (es) {
          es.close();
          es = null;
        }
      };
    } catch {
      // Fallback to polling
    }
    return () => {
      if (es) es.close();
    };
  }, [refetchOverview, queryClient]);

  // Dynamic ranking: enrich each site with live open ticket count, alert count & case numbers,
  // then sort descending by most open live tickets/alerts so highest activity sites appear first!
  const sortedAndFilteredSites = useMemo(() => {
    // Deduplicate baseSites by normalized name to guarantee each site card appears exactly once
    const uniqueMap = new Map<string, Site>();
    for (const site of baseSites) {
      if (!site?.name) continue;
      const key = site.name.trim().toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, site);
      } else {
        const existing = uniqueMap.get(key)!;
        if (!existing.salesforce_account_id && site.salesforce_account_id) {
          uniqueMap.set(key, { ...existing, salesforce_account_id: site.salesforce_account_id });
        }
      }
    }
    const uniqueSites = Array.from(uniqueMap.values());

    const enriched: EnrichedSite[] = uniqueSites.map(site => {
      const siteLower = site.name.trim().toLowerCase();
      const canonKey = siteLower.replace(/[^a-z0-9]+/g, ' ').trim();
      let stats = sfOverview?.siteStats?.[siteLower];
      if (!stats && sfOverview?.siteStats) {
        for (const [k, v] of Object.entries(sfOverview.siteStats)) {
          const kCanon = k.replace(/[^a-z0-9]+/g, ' ').trim();
          if (kCanon === canonKey || k.includes(siteLower) || siteLower.includes(k)) {
            stats = v;
            break;
          }
        }
      }

      const openCount = stats ? stats.count : (site.open_cases_count ?? 0);
      const alertCount = stats ? (stats.alertCount ?? 0) : 0;
      const isDown = stats ? stats.isDown : (site.is_down ?? false);
      const caseNumbers = stats?.caseNumbers ?? [];
      const sev1Count = stats ? (stats.sev1Count ?? 0) : 0;
      const sev2Count = stats ? (stats.sev2Count ?? 0) : 0;
      const sev3Count = stats ? (stats.sev3Count ?? 0) : 0;

      return {
        ...site,
        open_cases_count: openCount,
        open_alerts_count: alertCount,
        is_down: isDown,
        case_numbers: caseNumbers,
        sev1_count: sev1Count,
        sev2_count: sev2Count,
        sev3_count: sev3Count,
      };
    });

    // Dynamic sort: Sev 1 (Critical) & Sev 2 (Urgent/High) ranked highest at the top!
    enriched.sort((a, b) => {
      const scoreA = 
        (a.is_down ? 2000 : 0) +
        ((a.sev1_count ?? 0) * 500) +
        ((a.sev2_count ?? 0) * 150) +
        ((a.open_cases_count ?? 0) * 10) +
        (a.open_alerts_count ?? 0);
      const scoreB = 
        (b.is_down ? 2000 : 0) +
        ((b.sev1_count ?? 0) * 500) +
        ((b.sev2_count ?? 0) * 150) +
        ((b.open_cases_count ?? 0) * 10) +
        (b.open_alerts_count ?? 0);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return (a.position ?? 0) - (b.position ?? 0);
    });

    // Filter by search text and normalized product line (supporting all 9 product lines)
    return enriched.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (product === 'All products') return true;
      const normalize = (str?: string | null) => (str || '').toUpperCase().replace(/[\s_-]+/g, '');
      return normalize(s.product_line) === normalize(product);
    });
  }, [baseSites, sfOverview, search, product]);

  async function handleSyncSalesforceOrg() {
    setSyncingOrg(true);
    try {
      const res = await sfSyncOrgSites();
      toast.success(`Synchronized ${res.count} sites from GreyOrange Salesforce org database into MongoDB.`);
      await queryClient.invalidateQueries({ queryKey: ['sites'] });
      await refetchOverview();
    } catch (err) {
      toast.error(`Salesforce sync notice: ${(err as Error).message}`);
    } finally {
      setSyncingOrg(false);
    }
  }

  const totalOpenCases = sfOverview?.totalLiveCases ?? sortedAndFilteredSites.reduce((acc, s) => acc + (s.open_cases_count ?? 0), 0);
  const totalOpenAlerts = sfOverview?.totalLiveAlerts ?? 0;
  const activeSites = useMemo(() => {
    return sortedAndFilteredSites.filter(
      s => (s.open_cases_count ?? 0) > 0 || (s.open_alerts_count ?? 0) > 0 || Boolean(s.is_down)
    );
  }, [sortedAndFilteredSites]);
  const operationalSites = useMemo(() => {
    return sortedAndFilteredSites.filter(
      s => (s.open_cases_count ?? 0) === 0 && (s.open_alerts_count ?? 0) === 0 && !s.is_down
    );
  }, [sortedAndFilteredSites]);
  const sitesWithAlerts = useMemo(() => {
    return sortedAndFilteredSites.filter(s => (s.open_alerts_count ?? 0) > 0);
  }, [sortedAndFilteredSites]);
  const sitesWithActiveTickets = activeSites;

  // Top 4 sites with the most issues (cases, alerts, or down status)
  const top4IssueSiteIds = useMemo(() => {
    const withIssues = sortedAndFilteredSites.filter(
      s => (s.open_cases_count ?? 0) > 0 || (s.open_alerts_count ?? 0) > 0 || Boolean(s.is_down)
    );
    return new Set(withIssues.slice(0, 4).map(s => s.id));
  }, [sortedAndFilteredSites]);

  const isTicketFromToday = (c: SFCase) => {
    const candidates = [c.CreatedDate, (c as Record<string, unknown>).ClosedDate, c.LastModifiedDate].filter(Boolean) as string[];
    if (candidates.length === 0) return false;

    const now = new Date();
    const todayLocal = now.toDateString();
    const todayUTC = now.toISOString().slice(0, 10);

    return candidates.some(dStr => {
      try {
        const d = new Date(dStr);
        if (d.toDateString() === todayLocal) return true;
        if (dStr.slice(0, 10) === todayUTC) return true;
        return false;
      } catch {
        return false;
      }
    });
  };

  const todayCasesCount = useMemo(() => {
    return (sfOverview?.cases ?? []).filter(isTicketFromToday).length;
  }, [sfOverview]);

  const todayAlertsCount = useMemo(() => {
    return (sfOverview?.alerts ?? []).filter(isTicketFromToday).length;
  }, [sfOverview]);

  const uniqueSeverities = useMemo(() => {
    const items = activeBucket === 'cases' ? (sfOverview?.cases ?? []) : (sfOverview?.alerts ?? []);
    const set = new Set<string>();
    for (const c of items) {
      const p = (c.Highest_Severity__c || c.Severity__c || c.Priority || 'P3 - Medium').trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort();
  }, [activeBucket, sfOverview]);

  // Filter tickets with optional severity/priority filter
  const currentOrgTickets: SFCase[] = useMemo(() => {
    const items = activeBucket === 'cases' ? (sfOverview?.cases ?? []) : (sfOverview?.alerts ?? []);
    // For live open cases, all active tickets in the org are included;
    // For alerts, filter to today's alerts unless a specific severity filter is selected
    const candidateTickets = activeBucket === 'alerts' && severityFilter === 'All'
      ? items.filter(isTicketFromToday)
      : items;

    const filtered = candidateTickets.filter(c => {
      if (severityFilter === 'SEV 1 URGENT') {
        return detectSeverity(c) === 'sev1';
      }
      if (severityFilter === 'SEV 2 URGENT') {
        return detectSeverity(c) === 'sev2';
      }
      if (severityFilter !== 'All') {
        const p1 = (c.Priority || 'P3 - Medium').trim();
        const p2 = (c.Highest_Severity__c || '').trim();
        const p3 = (c.Severity__c || '').trim();
        return p1 === severityFilter || p2 === severityFilter || p3 === severityFilter;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const timeA = a.CreatedDate || a.LastModifiedDate ? new Date(a.CreatedDate || a.LastModifiedDate || '').getTime() : 0;
      const timeB = b.CreatedDate || b.LastModifiedDate ? new Date(b.CreatedDate || b.LastModifiedDate || '').getTime() : 0;
      return timeB - timeA;
    });
  }, [activeBucket, sfOverview, severityFilter]);

  const siteNameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of baseSites) {
      map.set(s.name.toLowerCase(), s.id);
    }
    return map;
  }, [baseSites]);

  const renderSiteCard = (site: EnrichedSite, i: number) => {
    const casesCount = site.open_cases_count ?? 0;
    const alertsCount = site.open_alerts_count ?? 0;
    const hasCases = casesCount > 0;
    const hasAlerts = alertsCount > 0;
    const sev1Count = site.sev1_count ?? 0;
    const sev2Count = site.sev2_count ?? 0;
    const sev3Count = site.sev3_count ?? 0;
    const hasSev1 = sev1Count > 0;
    const hasSev2 = sev2Count > 0;
    const hasUrgent = hasSev1 || hasSev2;

    // Any site with Sev 1 Urgent, Sev 2 Urgent, or site down goes RED!
    // Top sites with standard non-urgent issues get subtle yellow tint.
    const isTop4 = top4IssueSiteIds.has(site.id);
    let highlightColor: 'red' | 'orange' | 'yellow' | 'green' | null = null;

    if (sev1Count > 0 || sev2Count > 0 || site.is_down) {
      highlightColor = 'red';
    } else if (isTop4 && (hasAlerts || hasCases)) {
      highlightColor = 'yellow';
    }

    return (
      <article
        className={`site-card ${highlightColor ? `site-card-paper site-card-highlight-${highlightColor}` : ''}`}
        key={site.id}
      >
        <Button asChild variant="site">
          <Link to="/sites/$siteId" params={{ siteId: site.id }} preload="intent">
            <div className="site-card-top">
              <span className={`site-emblem emblem-${(site.position ?? i) % 4}`}>
                <Building2 />
              </span>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {hasCases && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'stretch',
                      borderRadius: 9999,
                      overflow: 'hidden',
                      background: '#18191e',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      fontSize: 10,
                      lineHeight: 1,
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
                    }}
                  >
                    <span
                      style={{
                        background: '#dc2626',
                        color: '#ffffff',
                        fontWeight: 700,
                        padding: '2.5px 6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 16,
                      }}
                    >
                      {casesCount}
                    </span>
                    <span
                      style={{
                        background: '#18191e',
                        color: '#ffffff',
                        fontWeight: 600,
                        padding: '2.5px 7px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        letterSpacing: '0.01em',
                      }}
                    >
                      Cases
                    </span>
                  </div>
                )}
                {/* Alert count split badge on card header */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'stretch',
                    borderRadius: 9999,
                    overflow: 'hidden',
                    background: '#18191e',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontSize: 10,
                    lineHeight: 1,
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
                    opacity: hasAlerts ? 1 : 0.65,
                  }}
                >
                  <span
                    style={{
                      background: hasAlerts ? '#dc2626' : 'rgba(255, 255, 255, 0.12)',
                      color: '#ffffff',
                      fontWeight: 700,
                      padding: '2.5px 6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 16,
                    }}
                  >
                    {alertsCount}
                  </span>
                  <span
                    style={{
                      background: '#18191e',
                      color: '#ffffff',
                      fontWeight: 600,
                      padding: '2.5px 7px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      letterSpacing: '0.01em',
                    }}
                  >
                    Alerts
                  </span>
                </div>
              </div>
            </div>

            <div className="site-card-title">
              <h3 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.015em' }}>{site.name}</h3>
              <ArrowUpRight />
            </div>

            <div className="site-card-subtitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span
                  className="source-dot"
                  style={{
                    background: hasCases ? '#3b82f6' : hasAlerts ? '#ef4444' : '#22c55e',
                  }}
                />
                <span>
                  {hasCases
                    ? `${casesCount} live open ${casesCount === 1 ? 'ticket' : 'tickets'}`
                    : hasAlerts
                    ? `${alertsCount} open ${alertsCount === 1 ? 'alert' : 'alerts'}`
                    : 'Operational'}
                </span>
              </div>

              {/* Display Sev 1 / Sev 2 urgent ongoing tickets on the right in exact 2-line monospace format */}
              {hasUrgent && (
                <div
                  className="urgent-status-badge"
                  title={`SEV 1 URGENT : ${sev1Count}\nSEV 2 URGENT : ${sev2Count}`}
                >
                  <span className={sev1Count > 0 ? 'urgent-active' : 'urgent-zero'}>
                    SEV 1 URGENT : {sev1Count}
                  </span>
                  <span className={sev2Count > 0 ? 'urgent-active' : 'urgent-zero'}>
                    SEV 2 URGENT : {sev2Count}
                  </span>
                </div>
              )}
            </div>

            <div className="site-card-bottom">
              <span>
                <Radio />
                <span>Alerts</span>
                <b style={{ color: hasAlerts ? '#ef4444' : 'var(--foreground)' }}>
                  {alertsCount}
                </b>
              </span>
              <span>
                <Cloud />
                <span>Cases</span>
                <b style={{ color: hasCases ? (hasSev1 ? '#ef4444' : hasSev2 ? '#f59e0b' : '#3b82f6') : 'var(--foreground)' }}>
                  {casesCount}
                </b>
              </span>
              <ArrowRight className="card-arrow" />
            </div>
          </Link>
        </Button>
        {admin && (
          <Button
            variant="ghost"
            size="icon"
            className="delete-site"
            title={`Delete ${site.name}`}
            aria-label={`Delete ${site.name}`}
            onClick={() => setDeleteSite(site)}
          >
            <Trash2 />
          </Button>
        )}
      </article>
    );
  };

  return (
    <DashboardShell>
      <div className="page-wrap">
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <span />
              YOUR OPERATIONS, AT A GLANCE
            </div>
            <h1>
              Site overview<span className="heading-dot">.</span>
            </h1>
            <p>Every site. Every alert. Dynamic ranking by live open tickets.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="outline"
              onClick={() => {
                void refetchOverview();
                void handleSyncSalesforceOrg();
              }}
              disabled={syncingOrg}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40 }}
            >
              <RefreshCw className={syncingOrg || sfFetching ? 'animate-spin' : ''} style={{ width: 14, height: 14 }} />
              <span>{syncingOrg ? 'Syncing Org…' : 'Sync SF Org'}</span>
            </Button>
            <Button
              className="add-button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40 }}
              onClick={() => (admin ? setEditor(true) : user ? setEditor(true) : setLogin(true))}
            >
              <Plus style={{ width: 15, height: 15 }} />
              <span>Add site</span>
            </Button>
          </div>
        </div>

        {/* Overview Metrics */}
        <div className="overview-metrics">
          <div className="metric">
            <span className="metric-label">
              <Building2 />
              Total sites
            </span>
            <div>
              <strong>{baseSites.length}</strong>
              <span>across your workspace</span>
            </div>
            <div className="metric-foot">
              <span className="neutral-dot" />
              All sites registered
            </div>
          </div>
          <div className="metric">
            <span className="metric-label">
              <Bell />
              Salesforce alerts
            </span>
            <div>
              <strong className={totalOpenAlerts > 0 ? '' : 'metric-dash'}>
                {totalOpenAlerts}
              </strong>
              <span>{totalOpenAlerts > 0 ? 'open & today’s closed alerts' : 'all sites clear'}</span>
            </div>
            <div className="metric-foot">
              <span className="source-dot" style={{ background: totalOpenAlerts > 0 ? '#ef4444' : '#22c55e' }} />
              {totalOpenAlerts > 0 ? `${sitesWithAlerts.length} ${sitesWithAlerts.length === 1 ? 'site' : 'sites'} with alerts` : 'All sites alert-free'}
            </div>
          </div>
          <div className="metric">
            <span className="metric-label">
              <Radio />
              Opsgenie alerts
            </span>
            <div>
              <strong className="metric-dash">—</strong>
              <span>awaiting connection</span>
            </div>
            <div className="metric-foot">
              <span className="source-dot" />
              Source not connected
            </div>
          </div>
          <div className="metric">
            <span className="metric-label">
              <Cloud />
              Live Salesforce cases
            </span>
            <div>
              <strong className={totalOpenCases > 0 ? '' : 'metric-dash'}>
                {totalOpenCases}
              </strong>
              <span>{totalOpenCases > 0 ? 'active live open cases (no alerts)' : 'all sites clear'}</span>
            </div>
            <div className="metric-foot">
              <span className="source-dot" style={{ background: '#22c55e' }} />
              {activeSites.length} sites with open tickets
            </div>
          </div>
        </div>

        {/* Connection Banner & Live Org Tickets Panel */}
        <div className="connection-banner-panel">
          {/* Header */}
          <div className="connection-banner-head">
            <span className="banner-symbol">
              <PlugZap />
            </span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <strong style={{ fontSize: 13, fontWeight: 600 }}>All sites live cases</strong>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
                Incoming tickets and active alerts logged on the current day across monitored sites.
              </p>
            </div>

            {/* Pill Toggle for Cases vs Alerts */}
            <div className="sf-bucket-toggle">
              <button
                type="button"
                className={`sf-bucket-btn ${activeBucket === 'cases' ? 'active' : ''}`}
                onClick={() => setActiveBucket('cases')}
                title="Current Day's Open Cases"
              >
                <span className="sf-bucket-count">{todayCasesCount}</span>
                <span className="sf-bucket-label">
                  <Cloud style={{ width: 11, height: 11 }} />
                  Cases
                </span>
              </button>

              <button
                type="button"
                className={`sf-bucket-btn ${activeBucket === 'alerts' ? 'active' : ''}`}
                onClick={() => setActiveBucket('alerts')}
                title="Current Day's Alerts"
              >
                <span className="sf-bucket-count">{todayAlertsCount}</span>
                <span className="sf-bucket-label">
                  <Radio style={{ width: 11, height: 11, color: '#ef4444' }} />
                  Alerts
                </span>
              </button>
            </div>


            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTicketsCollapsed(!ticketsCollapsed)}
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--muted-foreground)' }}
              title={ticketsCollapsed ? 'Expand ticket bucket' : 'Collapse ticket bucket'}
            >
              {ticketsCollapsed ? (
                <>
                  <span>Expand</span>
                  <ChevronDown style={{ width: 14, height: 14 }} />
                </>
              ) : (
                <>
                  <span>Collapse</span>
                  <ChevronUp style={{ width: 14, height: 14 }} />
                </>
              )}
            </Button>
          </div>

          {!ticketsCollapsed && (
            <>
              {/* Table Header with identical columns as in the panels */}
              <div className="sf-panel-table-head" style={{ borderTop: '1px solid var(--border)' }}>
            <span>CASE & SUBJECT</span>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <select
                aria-label="Filter by Severity"
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                style={{
                  background: severityFilter !== 'All' ? '#dc2626' : 'transparent',
                  color: severityFilter !== 'All' ? '#ffffff' : 'var(--muted-foreground)',
                  border: severityFilter !== 'All' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 4,
                  padding: '2px 4px',
                  fontSize: 8.5,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  width: '100%',
                  textTransform: 'uppercase',
                  outline: 'none',
                  transition: 'all 0.15s ease',
                }}
                title={severityFilter !== 'All' ? `Filtered by: ${severityFilter} (Click to change)` : 'Filter by Severity'}
              >
                <option value="All" style={{ background: '#18191e', color: '#fff' }}>
                  {severityFilter !== 'All' ? `SEV: ${severityFilter}` : 'SEVERITY ▾'}
                </option>
                {severityFilter !== 'All' && (
                  <option value="All" style={{ background: '#18191e', color: '#f59e0b' }}>
                    ✕ Clear Filter (Show All)
                  </option>
                )}
                <option value="SEV 1 URGENT" style={{ background: '#18191e', color: '#ef4444', fontWeight: 700 }}>
                  ● SEV 1 URGENT
                </option>
                <option value="SEV 2 URGENT" style={{ background: '#18191e', color: '#f59e0b', fontWeight: 700 }}>
                  ● SEV 2 URGENT
                </option>
                {uniqueSeverities
                  .filter(sev => sev !== 'SEV 1 URGENT' && sev !== 'SEV 2 URGENT')
                  .map(sev => (
                    <option key={sev} value={sev} style={{ background: '#18191e', color: '#fff' }}>
                      {sev}
                    </option>
                  ))}
              </select>
            </div>
            <span>PRODUCT</span>
            <span>CATEGORY</span>
            <span>ASSIGNED TO</span>
            <span>STATUS</span>
            <span>SITE / LOCATION</span>
            <span>CREATED / MODIFIED</span>
          </div>

          {/* Scrollable Rows Container (shows 5 most recent and others in scrollable) */}
          <div
            className="panel-scroll"
            tabIndex={0}
            aria-label="Salesforce tickets scrollable table"
            style={{ maxHeight: 285, overflowY: 'auto' }}
          >
            {currentOrgTickets.length > 0 ? (
              <div>
                {currentOrgTickets.map(c => {
                  const isDown = Boolean(c.Is_Site_100_Down__c);
                  const stLower = (c.Status || '').toLowerCase();
                  const isClosedTodayAlert = stLower.includes('closed') || stLower.includes('solved') || stLower.includes('resolved');
                  const statusClass = isClosedTodayAlert
                    ? 'status-resolved'
                    : stLower.includes('new')
                    ? 'status-new'
                    : stLower.includes('progress')
                    ? 'status-progress'
                    : stLower.includes('investigat')
                    ? 'status-investigating'
                    : 'status-other';

                  const priorityStr = String(c.Priority || 'P3').toUpperCase();
                  const priorityClass = priorityStr.includes('CRITICAL') || priorityStr.includes('P1')
                    ? 'p-p1'
                    : priorityStr.includes('HIGH') || priorityStr.includes('P2')
                    ? 'p-p2'
                    : priorityStr.includes('LOW') || priorityStr.includes('P4')
                    ? 'p-p4'
                    : 'p-p3';
                  const priorityDisplay = c.Priority || 'P3 - Medium';

                  const productDisplay = String(c.Product_Type__c || c.product_line || 'RMS');
                  const categoryDisplay = String(c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support');
                  const assignedDisplay = String(c.Dev_Case_Assignee__c || c.Owner?.Name || 'GreyOrange Queue');
                  const siteDisplay = String(c.Snow_Sitename__c || c.Customer_Location__c || c.Site_Name_Customer_Input__c || c.Account_Name__c || 'GreyOrange Org');
                  const matchedSiteId = siteNameToId.get(siteDisplay.toLowerCase());

                  const fromToday = isTicketFromToday(c);
                  const dateVal = c.CreatedDate || c.LastModifiedDate;

                  return (
                    <div
                      key={c.Id}
                      className="sf-case-row"
                      onClick={() => setSelectedCase(c)}
                      title={`Click to view full ${isAlertCase(c) ? 'alert' : 'case'} details`}
                    >
                      {/* Case # and Subject */}
                      <div className="case-subject-cell">
                        <div className="case-number-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <a
                            href={`https://greyorangeorg.my.salesforce.com/${c.Id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="case-number-tag"
                            title={`Open ${isAlertCase(c) ? 'Alert' : 'Case'} ${c.CaseNumber} in Salesforce`}
                            onClick={e => e.stopPropagation()}
                          >
                            {c.CaseNumber}
                            <ExternalLink style={{ width: 10, height: 10 }} />
                          </a>
                          {isDown && (
                            <span className="case-down-badge">
                              SEV 1 URGENT
                            </span>
                          )}
                          {fromToday && (
                            <span className="case-today-badge">
                              Today
                            </span>
                          )}
                        </div>
                        <div className="case-subject-title">{c.Subject || 'No Subject Provided'}</div>
                        {c.Description && (
                          <div className="case-desc-preview">{c.Description}</div>
                        )}
                      </div>

                      {/* Severity */}
                      <div>
                        <span className={`case-priority-badge ${priorityClass}`}>
                          {priorityDisplay}
                        </span>
                      </div>

                      {/* Product Type */}
                      <div>
                        <span className="case-product-pill">
                          {productDisplay}
                        </span>
                      </div>

                      {/* Category */}
                      <div className="case-category-cell" title={categoryDisplay}>
                        {categoryDisplay}
                      </div>

                      {/* Assigned To */}
                      <div className="case-assignee-cell" title={assignedDisplay}>
                        <User style={{ width: 11, height: 11 }} />
                        <span>{assignedDisplay}</span>
                      </div>

                      {/* Status */}
                      <div>
                        <span
                          className={`case-status-badge ${statusClass}`}
                          style={isClosedTodayAlert ? { color: '#22c55e', borderColor: 'oklch(0.7 0.15 140 / 0.4)', background: 'oklch(0.7 0.15 140 / 0.15)' } : undefined}
                        >
                          {isClosedTodayAlert ? 'Closed (Today)' : c.Status}
                        </span>
                      </div>

                      {/* Site / Location (clickable to site workspace if found) */}
                      <div className="case-site-tag" title={siteDisplay}>
                        <MapPin style={{ width: 11, height: 11, flexShrink: 0 }} />
                        {matchedSiteId ? (
                          <Link
                            to="/sites/$siteId"
                            params={{ siteId: matchedSiteId }}
                            preload="intent"
                            onClick={e => e.stopPropagation()}
                            style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}
                            title={`Go to ${siteDisplay} site workspace`}
                          >
                            {siteDisplay}
                          </Link>
                        ) : (
                          <span>{siteDisplay}</span>
                        )}
                      </div>

                      {/* Created / Modified Date */}
                      <div className="case-date-cell">
                        {fromToday ? (
                          <span style={{ color: '#ffffff', fontWeight: 600 }}>
                            {dateVal ? new Date(dateVal).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Today'}
                          </span>
                        ) : dateVal ? (
                          <span style={{ color: '#ffffff', fontWeight: 500 }}>
                            {new Date(dateVal).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        ) : (
                          '—'
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="source-empty" style={{ padding: '24px 16px' }}>
                <div className="empty-source-art cloud-art">
                  {activeBucket === 'alerts' ? <Radio style={{ color: '#ef4444' }} /> : <Cloud />}
                  <span />
                  <span />
                </div>
                <h4 style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>No {activeBucket} logged for today</h4>
                <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
                  All monitored sites across Salesforce org are clear of {activeBucket} for the current day.
                </p>
              </div>
            )}
          </div>

          {/* Panel Footer */}
          <div
            style={{
              borderTop: '1px solid var(--border)',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 10,
              color: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>
              Showing {currentOrgTickets.length} current day's {activeBucket} {currentOrgTickets.length > 5 ? '• 5 visible, scroll for more' : ''}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock style={{ width: 10, height: 10 }} />
              Today's Live Org Feed
            </span>
          </div>
            </>
          )}
        </div>

        {/* Directory Section */}
        <section className="directory">
          <div className="section-title">
            <h2>
              Your sites <span>{sortedAndFilteredSites.length}</span>
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="directory-note">
                <TrendingUp style={{ width: 11, height: 11, color: '#f59e0b' }} />
                SORTED BY LIVE OPEN TICKETS
              </span>
              <span className="directory-note">
                <span className="neutral-dot" />
                AUTO-SYNC (25s)
              </span>
            </div>
          </div>

          <div className="directory-tools">
            <div className="site-search">
              <Search />
              <Input
                aria-label="Search sites"
                placeholder="Search by site name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <kbd>⌕</kbd>
            </div>
            <div className="filter-tools">
              <div className="filter-select">
                <SlidersHorizontal />
                <select
                  aria-label="Filter by product line"
                  value={product}
                  onChange={e => setProduct(e.target.value)}
                >
                  {[
                    'All products',
                    'TTP',
                    'RTP',
                    'RMS',
                    'RA',
                    'RIL',
                    'CASE PICK',
                    'SHUTTLE',
                    'RELAY',
                    'GSTORE',
                  ].map(p => (
                    <option key={p} value={p}>
                      {p === 'CASE PICK' ? 'Case Pick' : p === 'GSTORE' ? 'gStore' : p}
                    </option>
                  ))}
                </select>
                <ChevronDown />
              </div>
              <div className="view-toggle">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Grid view"
                  aria-pressed={view === 'grid'}
                  className={view === 'grid' ? 'selected' : ''}
                  onClick={() => setView('grid')}
                >
                  <LayoutGrid />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="List view"
                  aria-pressed={view === 'list'}
                  className={view === 'list' ? 'selected' : ''}
                  onClick={() => setView('list')}
                >
                  <List />
                </Button>
              </div>
            </div>
          </div>

          {/* Active Sites Grid (Sites with active tickets / alerts / downtime) */}
          {activeSites.length > 0 ? (
            <div className={`site-grid ${view === 'list' ? 'list-view' : ''}`}>
              {activeSites.map((site, i) => renderSiteCard(site, i))}
            </div>
          ) : (
            search.trim().length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px', background: 'oklch(0.2 0.02 240 / 0.4)', borderRadius: 12, border: '1px solid oklch(0.3 0.03 240 / 0.5)', marginBottom: 20 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#22c55e', fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
                  <span className="source-dot" style={{ background: '#22c55e' }} />
                  All sites operational
                </div>
                <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>
                  No open cases or critical alerts across monitored sites. Sites appear here automatically when tickets are created.
                </p>
              </div>
            )
          )}

          {/* Show More Operational Sites (Tucks sites with 0 cases/alerts under collapsible toggle) */}
          {operationalSites.length > 0 && (
            <>
              <div className="show-more-divider">
                <Button
                  variant="outline"
                  className="show-more-btn"
                  onClick={() => setShowAllOperational(!showAllOperational)}
                >
                  {showAllOperational ? (
                    <>
                      <ChevronUp style={{ width: 14, height: 14 }} />
                      Hide {operationalSites.length} operational sites
                    </>
                  ) : (
                    <>
                      <ChevronDown style={{ width: 14, height: 14 }} />
                      Show more sites ({operationalSites.length} operational — 0 alerts/cases)
                    </>
                  )}
                </Button>
              </div>

              {/* Render operational sites when expanded, or when actively searching */}
              {(showAllOperational || search.trim().length > 0) && (
                <div
                  className={`site-grid ${view === 'list' ? 'list-view' : ''}`}
                  style={{ marginTop: 16 }}
                >
                  {operationalSites.map((site, i) => renderSiteCard(site, activeSites.length + i))}
                </div>
              )}
            </>
          )}

          {sortedAndFilteredSites.length === 0 && (
            <div className="empty-directory">
              <Search />
              <h3>No sites found</h3>
              <p>Try another name or product line.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setProduct('All products');
                }}
              >
                Clear filters
              </Button>
            </div>
          )}

          <div className="directory-footer">
            <span>
              Showing {sortedAndFilteredSites.length} of {baseSites.length} sites
            </span>
            <span>Positioned dynamically by open case volume</span>
          </div>
        </section>
      </div>

      <SiteEditor key={String(editor)} open={editor} onOpenChange={setEditor} />
      <DeleteSiteDialog site={deleteSite} onClose={() => setDeleteSite(null)} />
      <SignInDialog open={login} onOpenChange={setLogin} />
      <ConnectionsDialog open={connections} onOpenChange={setConnections} />

      {/* Case Details Modal */}
      {selectedCase && (
        <div className="case-modal-overlay" onClick={() => setSelectedCase(null)}>
          <div className="case-modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <a
                  href={`https://greyorangeorg.my.salesforce.com/${selectedCase.Id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="case-number-tag"
                  style={{ fontSize: 12, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  title="Open this Case in Salesforce"
                >
                  {isAlertCase(selectedCase) ? 'ALERT' : 'CASE'} {selectedCase.CaseNumber}
                  <ExternalLink style={{ width: 11, height: 11 }} />
                </a>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--foreground)', marginTop: 8 }}>
                  {selectedCase.Subject || 'No Subject'}
                </h3>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedCase(null)}>
                <X style={{ width: 16, height: 16 }} />
              </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16, padding: 12, background: 'var(--muted)', borderRadius: 6 }}>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Severity</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>{selectedCase.Priority || 'P3 - Medium'}</p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Product Type</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>
                  {selectedCase.Product_Type__c || selectedCase.product_line || 'RMS'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Category</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>
                  {selectedCase.Category__c || selectedCase.Snow_Category__c || selectedCase.Category || selectedCase.Type || 'Technical Support'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Assigned To</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>
                  {selectedCase.Dev_Case_Assignee__c || selectedCase.Owner?.Name || 'GreyOrange Queue'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Status</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>{selectedCase.Status}</p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Impact / Down</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500, color: selectedCase.Is_Site_100_Down__c ? '#ef4444' : 'var(--foreground)' }}>
                  {selectedCase.Is_Site_100_Down__c ? '100% DOWN' : 'Normal'}
                </p>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Site / Location</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>
                  {String(selectedCase.Snow_Sitename__c || selectedCase.Customer_Location__c || selectedCase.Site_Name_Customer_Input__c || selectedCase.Account_Name__c || 'GreyOrange Org')}
                </p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Last Updated</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>
                  {selectedCase.LastModifiedDate ? new Date(selectedCase.LastModifiedDate).toLocaleDateString() : '—'}
                </p>
              </div>
            </div>

            {selectedCase.Description && (
              <div style={{ marginTop: 16 }}>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Description
                </span>
                <p style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: 'var(--foreground)', whiteSpace: 'pre-wrap', background: 'var(--background)', padding: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
                  {selectedCase.Description}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 20 }}>
              <Button asChild variant="outline" size="sm" style={{ borderColor: 'var(--blue)', color: 'var(--blue)' }}>
                <a
                  href={`https://greyorangeorg.my.salesforce.com/${selectedCase.Id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ExternalLink style={{ width: 13, height: 13 }} />
                  Open in Salesforce
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedCase(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
