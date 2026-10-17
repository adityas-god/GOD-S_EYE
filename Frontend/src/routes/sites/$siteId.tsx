import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Radio,
  Cloud,
  Search,
  RefreshCw,
  PlugZap,
  Pencil,
  Shield,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  X,
  MapPin,
  Clock,
  Layers,
  User,
  Terminal,
  BarChart3,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DashboardShell } from '@/components/dashboard-shell';
import { ConnectionsDialog, SiteEditor, SignInDialog } from '@/components/dashboard-dialogs';
import { sitesQueryOptions } from '@/lib/sites';
import { useAuth } from '@/components/auth-context';
import {
  sfFetchCasesForSite,
  sfFetchAlertAnalytics,
  sfFetchRedZoneSites,
  isAlertCase,
  detectSeverity,
  isImTicket,
  isDirTicket,
  hasTicketEndTime,
  isLiveOpenCase,
  isClosedToday,
  getTicketEndTime,
  isOpenAlert,
  isClosedAlert,
  calculateAlertDuration,
  type SFCase,
} from '@/integrations/salesforce/client';
import { SiteRunbookPanel, type RunbookTabKey } from '@/components/site-runbook-panel';
import { fetchSiteRunbook, defaultRunbook, type SiteRunbook } from '@/lib/runbook';
import { AlertAnalyticsPanel, type TimeRangeKey } from '@/components/alert-analytics-panel';

function formatPreciseTime(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

function resolveSite(sites: Site[] | undefined, idOrName: string): Site | undefined {
  if (!sites || !idOrName) return undefined;
  const decoded = decodeURIComponent(idOrName).trim().toLowerCase();
  const slug = decoded.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const localMatch = decoded.match(/^local[- ]site[- ]0*(\d+)$/i) || decoded.match(/^(\d+)$/);
  const targetPos = localMatch ? parseInt(localMatch[1], 10) : null;

  return sites.find(s => {
    if (s.id === idOrName || s.id.toLowerCase() === decoded) return true;
    if (targetPos !== null && s.position === targetPos) return true;
    const sNameLower = s.name.trim().toLowerCase();
    if (sNameLower === decoded || sNameLower === idOrName.toLowerCase()) return true;
    const sSlug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (sSlug === slug || s.opsgenie_tag === slug) return true;
    return false;
  });
}

export const Route = createFileRoute('/sites/$siteId')({
  loader: async ({ context, params }) => {
    const sites = await context.queryClient.ensureQueryData(sitesQueryOptions());
    const site = resolveSite(sites, params.siteId);
    if (site) {
      // Non-blocking prefetch so the page opens instantly without freezing
      void context.queryClient.prefetchQuery({
        queryKey: ['site-cases', site.id, site.name, site.salesforce_account_id],
        queryFn: () =>
          sfFetchCasesForSite({
            data: {
              siteName: site.name,
              accountId: site.salesforce_account_id,
            },
          }),
        staleTime: 60_000,
      });
    }
    return sites;
  },
  head: ({ loaderData, params }) => {
    const name = resolveSite(loaderData, params.siteId)?.name ?? 'Site';
    return {
      meta: [
        { title: `${name} — Sitepulse` },
        { name: 'description', content: `Opsgenie alerts and Salesforce cases for ${name}.` },
        { property: 'og:title', content: `${name} — Sitepulse` },
        { property: 'og:description', content: `Site operations and support data for ${name}.` },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
    };
  },
  component: SiteDetail,
});

function SiteDetail() {
  const { siteId } = Route.useParams();
  const { data: sites } = useSuspenseQuery(sitesQueryOptions());
  const site = resolveSite(sites, siteId);
  const { admin, user } = useAuth();

  const [connections, setConnections] = useState(false);
  const [editor, setEditor] = useState(false);
  const [login, setLogin] = useState(false);
  const [caseSearch, setCaseSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedCase, setSelectedCase] = useState<SFCase | null>(null);
  const [activeBucket, setActiveBucket] = useState<'cases' | 'alerts' | 'closed' | 'analytics'>('cases');
  const [analyticsRange, setAnalyticsRange] = useState<TimeRangeKey>('7d');
  const [historicalAlerts, setHistoricalAlerts] = useState<SFCase[]>([]);

  // Fetch deep alert analytics & precise alert records for this site
  const {
    data: analyticsData,
    isFetching: analyticsFetching,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ['alert-analytics', site?.name || 'all', analyticsRange],
    queryFn: () => sfFetchAlertAnalytics(site?.name || '', analyticsRange),
    enabled: Boolean(site?.name),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  // Fetch full operational runbook (monitoring links, zoom, VMs, slack, handovers, configs)
  const { data: runbookData, refetch: refetchRunbook } = useQuery({
    queryKey: ['site-runbook', site?.id || siteId],
    queryFn: () => fetchSiteRunbook(site?.id || siteId),
    enabled: Boolean(site?.id || siteId),
    staleTime: 15_000,
  });

  const [runbook, setRunbook] = useState<SiteRunbook>(defaultRunbook);
  const [activeTab, setActiveTab] = useState<'monitoring' | RunbookTabKey>('monitoring');

  useEffect(() => {
    if (runbookData) {
      setRunbook(runbookData);
    }
  }, [runbookData]);

  // Fetch all open cases & alerts (opened + closed today) for this site
  const {
    data: sfData,
    isFetching: sfFetching,
    refetch: refetchSf,
    error: sfError,
  } = useQuery({
    queryKey: ['site-cases', site?.id, site?.name, site?.salesforce_account_id],
    queryFn: async () => {
      if (!site) return { records: [], alerts: [], totalSize: 0, done: true };
      return sfFetchCasesForSite({
        data: {
          siteName: site.name,
          accountId: site.salesforce_account_id,
        },
      });
    },
    staleTime: 60_000,
    gcTime: 300_000,
    refetchInterval: 30_000, // automatic background refresh every 30 seconds
  });
  const sfLoading = !sfData;

  // Check if site is in Red Zone so dedicated Red Zone solid tag and breach info can be displayed
  const { data: redZoneOverview } = useQuery({
    queryKey: ['salesforce-red-zone'],
    queryFn: () => sfFetchRedZoneSites(),
    staleTime: 60_000,
  });

  const redZoneMatch = useMemo(() => {
    if (!site?.name || !redZoneOverview?.redZoneSites) return null;
    const nameLower = site.name.trim().toLowerCase();
    return redZoneOverview.redZoneSites.find(
      s => s.siteName.toLowerCase() === nameLower || s.siteId.toLowerCase() === nameLower
    ) || null;
  }, [site?.name, redZoneOverview?.redZoneSites]);

  // Real-time synchronization via Server-Sent Events from backend webhook listener
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/webhooks/events');
      eventSource.addEventListener('case_update', () => {
        void refetchSf();
      });
      eventSource.onerror = () => {
        // If backend server on port 5000 is not running, close cleanly to avoid reconnect spam
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
      };
    } catch {
      // Backend SSE unavailable; background refetch interval acts as graceful fallback
    }
    return () => {
      if (eventSource) eventSource.close();
    };
  }, [refetchSf]);

  // Extract open cases, open alerts, and closed tickets
  const rawCases: SFCase[] = sfData?.records ?? [];
  const rawAlerts: SFCase[] = sfData?.alerts ?? [];
  const rawClosed: SFCase[] = (sfData as unknown as { closed?: SFCase[] })?.closed ?? [];

  const isClosedStatus = (status?: string) => {
    const s = String(status || '').toLowerCase();
    return s.includes('closed') || s.includes('solved') || s.includes('resolved') || s.includes('cancel') || s.includes('complete');
  };

  const isTicketClosed = (c: SFCase) => {
    return hasTicketEndTime(c) || Boolean(getTicketEndTime(c)) || isClosedStatus(c.Status) || isClosedToday(c);
  };

  // 1. Live Open Cases: strictly open cases (not closed, no end time, not alerts)
  const allCases = useMemo(() => {
    return rawCases.filter(c => isLiveOpenCase(c) && !hasTicketEndTime(c) && !getTicketEndTime(c));
  }, [rawCases]);

  // 2. Live Open Alerts: strictly open alert tickets (no end time, not closed)
  const openAlerts = useMemo(() => {
    const map = new Map<string, SFCase>();
    for (const a of rawAlerts) {
      if (isAlertCase(a) && !isTicketClosed(a) && a.Id) {
        map.set(a.Id, a);
      }
    }
    for (const c of rawCases) {
      if (isAlertCase(c) && !isTicketClosed(c) && c.Id) {
        map.set(c.Id, c);
      }
    }
    return Array.from(map.values());
  }, [rawAlerts, rawCases]);

  // 3. Closed Alerts: strictly closed alerts (alerts closed today or completed)
  const closedAlerts = useMemo(() => {
    const map = new Map<string, SFCase>();
    // From rawAlerts: alerts from shift bucket that are closed
    for (const a of rawAlerts) {
      if (isAlertCase(a) && isTicketClosed(a) && a.Id) {
        map.set(a.Id, a);
      }
    }
    // From rawClosed: only alert tickets
    for (const c of rawClosed) {
      if (isAlertCase(c) && c.Id) {
        map.set(c.Id, c);
      }
    }
    // From rawCases: if any alert slipped into rawCases that is closed
    for (const c of rawCases) {
      if (isAlertCase(c) && isTicketClosed(c) && c.Id) {
        map.set(c.Id, c);
      }
    }
    return Array.from(map.values());
  }, [rawAlerts, rawClosed, rawCases]);

  // 4. All site alerts (open + closed + deep historical alerts for precise analysis)
  const allSiteAlerts = useMemo(() => {
    const map = new Map<string, SFCase>();
    for (const a of openAlerts) {
      if (a.Id) map.set(a.Id, a);
    }
    for (const a of closedAlerts) {
      if (a.Id) map.set(a.Id, a);
    }
    for (const a of rawAlerts) {
      if (isAlertCase(a) && a.Id) {
        map.set(a.Id, a);
      }
    }
    for (const c of rawClosed) {
      if (isAlertCase(c) && c.Id) {
        map.set(c.Id, c);
      }
    }
    for (const h of historicalAlerts) {
      if (h.Id) map.set(h.Id, h);
    }
    return Array.from(map.values()).sort((a, b) => {
      const ta = a.CreatedDate ? new Date(a.CreatedDate).getTime() : 0;
      const tb = b.CreatedDate ? new Date(b.CreatedDate).getTime() : 0;
      return tb - ta;
    });
  }, [openAlerts, closedAlerts, rawAlerts, rawClosed, historicalAlerts]);

  // When activeBucket is 'analytics', prioritize the exact alerts from analyticsData!
  const analyticsAlerts = useMemo(() => {
    if (analyticsData?.alerts && Array.isArray(analyticsData.alerts) && analyticsData.alerts.length > 0) {
      return analyticsData.alerts.filter(isAlertCase);
    }
    return allSiteAlerts;
  }, [analyticsData?.alerts, allSiteAlerts]);

  const activeItems: SFCase[] =
    activeBucket === 'cases'
      ? allCases
      : activeBucket === 'alerts'
      ? openAlerts
      : activeBucket === 'closed'
      ? closedAlerts
      : analyticsAlerts;

  // Dynamically resolve all product lines for this site from API response, loaded cases, or site config
  const siteProductLines: string[] = useMemo(() => {
    // 1. Check if backend returned product_lines
    const fromSf = (sfData as unknown as { product_lines?: string[] })?.product_lines;
    if (Array.isArray(fromSf) && fromSf.length > 0) {
      return fromSf.filter(Boolean);
    }
    // 2. Check site.product_lines
    if (site?.product_lines && Array.isArray(site.product_lines) && site.product_lines.length > 0) {
      return site.product_lines.filter(Boolean);
    }
    // 3. Dynamically observe from loaded cases & alerts
    const observed = new Set<string>();
    for (const c of [...rawCases, ...rawAlerts]) {
      const p = String(c.Product_Type__c || c.product_line || c.Parent_Product_Type__c || '').trim();
      if (p && !['null', 'undefined', 'all', 'none', 'n/a', 'na'].includes(p.toLowerCase())) {
        observed.add(p);
      }
    }
    if (observed.size > 0) {
      return Array.from(observed);
    }
    // 4. Fallback to comma-separated site.product_line
    if (site?.product_line) {
      return site.product_line.split(',').map((p: string) => p.trim()).filter(Boolean);
    }
    return ['RMS'];
  }, [sfData, site?.product_lines, site?.product_line, rawCases, rawAlerts]);

  const siteProductType = site?.product_line || siteProductLines.join(', ') || 'RMS';

  const uniqueStatuses = useMemo(() => {
    const set = new Set(activeItems.map(c => c.Status).filter(Boolean));
    return Array.from(set);
  }, [activeItems]);

  const uniqueSeverities = useMemo(() => {
    const set = new Set<string>();
    for (const c of activeItems) {
      const p = (c.Highest_Severity__c || c.Priority || '').trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort();
  }, [activeItems]);

  const uniqueProducts = useMemo(() => {
    const set = new Set<string>();
    for (const p of siteProductLines) {
      if (p && !['null', 'undefined', 'all', 'none', 'n/a'].includes(p.toLowerCase())) {
        set.add(p);
      }
    }
    for (const c of activeItems) {
      const prod = String(c.Product_Type__c || c.product_line || c.Parent_Product_Type__c || '').trim();
      if (prod && !['null', 'undefined', 'all', 'none', 'n/a'].includes(prod.toLowerCase())) {
        set.add(prod);
      }
    }
    return Array.from(set).sort();
  }, [activeItems, siteProductLines]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    for (const c of activeItems) {
      const cat = String(c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support').trim();
      if (cat) set.add(cat);
    }
    return Array.from(set).sort();
  }, [activeItems]);

  // Filter items by search, status, severity, product, and category
  const filteredCases = useMemo(() => {
    return activeItems.filter(c => {
      const q = caseSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        String(c.CaseNumber || '').toLowerCase().includes(q) ||
        String(c.Subject || '').toLowerCase().includes(q) ||
        String(c.Description || '').toLowerCase().includes(q) ||
        String(c.Customer_Location__c || '').toLowerCase().includes(q) ||
        String(c.Snow_Sitename__c || '').toLowerCase().includes(q);

      const matchStatus = statusFilter === 'All' || c.Status === statusFilter;

      let matchSeverity = true;
      if (severityFilter === 'SEV 1 URGENT') {
        matchSeverity = !isImTicket(c) && !isDirTicket(c) && detectSeverity(c) === 'sev1';
      } else if (severityFilter === 'SEV 2 URGENT') {
        matchSeverity = !isImTicket(c) && !isDirTicket(c) && detectSeverity(c) === 'sev2';
      } else if (severityFilter !== 'All') {
        const p1 = (c.Highest_Severity__c || '').trim().toLowerCase();
        const p2 = (c.Priority || '').trim().toLowerCase();
        const p3 = (c.Alert_Priority__c || '').trim().toLowerCase();
        const sfLower = severityFilter.toLowerCase();
        matchSeverity = p1 === sfLower || p2 === sfLower || p3 === sfLower;
      }

      const prodStr = String(c.Product_Type__c || c.product_line || c.Parent_Product_Type__c || '').trim();
      const matchProduct =
        activeBucket === 'analytics' ||
        productFilter === 'All' ||
        prodStr.toLowerCase() === productFilter.toLowerCase() ||
        (prodStr === '' && siteProductLines.some(p => p.toLowerCase() === productFilter.toLowerCase()));

      const catStr = String(c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support').trim();
      const matchCategory = activeBucket !== 'cases' || categoryFilter === 'All' || catStr.toLowerCase() === categoryFilter.toLowerCase();

      return matchSearch && matchStatus && matchSeverity && matchProduct && matchCategory;
    });
  }, [activeItems, caseSearch, statusFilter, severityFilter, productFilter, categoryFilter, siteProductLines, activeBucket]);

  if (!site) {
    return (
      <DashboardShell detail>
        <div className="page-wrap">
          <h1>Site not found</h1>
          <Button asChild variant="outline">
            <Link to="/">Back to sites</Link>
          </Button>
        </div>
      </DashboardShell>
    );
  }

  const isCriticalSiteDown = allCases.some(c => Boolean(c.Is_Site_100_Down__c));
  const sev1Count = allCases.filter(c => !isImTicket(c) && !isDirTicket(c) && detectSeverity(c) === 'sev1').length;
  const sev2Count = allCases.filter(c => !isImTicket(c) && !isDirTicket(c) && detectSeverity(c) === 'sev2').length;

  return (
    <DashboardShell
      detail
      siteRunbook={runbook}
      activeTab={activeTab}
      onOpenRunbookTab={(tab) => setActiveTab(tab)}
    >
      <div className="page-wrap detail-wrap">
        <Link to="/" className="back-link" preload="intent">
          <ArrowLeft />
          All sites
        </Link>

        {/* Page Heading */}
        <div className="page-heading">
          <div>
            <div className="eyebrow">SITE WORKSPACE</div>
            <h1 style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.02em', margin: '12px 0 8px' }}>
              {site.name}
              <span className="heading-dot">.</span>
            </h1>
            <p className="detail-subtitle" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              {redZoneMatch && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: '#dc2626',
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 4,
                    letterSpacing: '0.04em',
                    lineHeight: 1,
                    fontFamily: 'var(--font-mono)',
                    boxShadow: '0 1px 3px rgba(220, 38, 38, 0.4)',
                  }}
                >
                  RED ZONE
                </span>
              )}
              {siteProductLines.length > 0 && siteProductLines[0] !== 'Unassigned' && (
                <>
                  <Building2 />
                  <span>{siteProductLines.join(', ')}</span>
                </>
              )}
              <span className="source-dot" style={{ background: isCriticalSiteDown ? '#ef4444' : allCases.length > 0 ? '#f59e0b' : '#22c55e' }} />
              {isCriticalSiteDown ? 'Critical site alert' : allCases.length > 0 ? `${allCases.length} open cases` : 'Operational'}
            </p>
          </div>
          <div className="detail-actions">
            {admin && (
              <Button variant="outline" onClick={() => setEditor(true)}>
                <Pencil />
                Edit site
              </Button>
            )}
          </div>
        </div>

        {activeTab !== 'monitoring' ? (
          <SiteRunbookPanel
            siteId={runbook.id || site.id}
            runbook={runbook}
            activeTab={activeTab}
            onBackToMonitoring={() => setActiveTab('monitoring')}
            onRefresh={(updated) => {
              setRunbook(updated);
              refetchRunbook();
            }}
          />
        ) : (
          <>

        {/* Prominent Red Zone Trigger & Tickets Received Banner */}
        {redZoneMatch && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: '14px 18px',
              marginBottom: 20,
              background: 'color-mix(in srgb, var(--card) 92%, #ef4444 8%)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: 8,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.18)',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Flame style={{ width: 20, height: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Red Zone Trigger &amp; Tickets Received
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', marginTop: 2 }}>
                  {redZoneMatch.reasons?.join(' • ') || 'Reliability Threshold Breached'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: 'var(--font-mono)' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>7d Tickets Received</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>
                  {redZoneMatch.criteria1.sev1Count7d + redZoneMatch.criteria1.sev2Count7d} total ({redZoneMatch.criteria1.sev1Count7d} Sev-1, {redZoneMatch.criteria1.sev2Count7d} Sev-2)
                </div>
              </div>
              <div style={{ height: 28, width: 1, background: 'rgba(239, 68, 68, 0.25)' }} />
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>14d MTBF</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>
                  {redZoneMatch.criteria3.mtbfHours !== null ? `${redZoneMatch.criteria3.mtbfHours}h` : 'Healthy'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary Metric Ribbon */}
        <div className="detail-summary">
          <div>
            <Cloud />
            <span>Salesforce cases</span>
            <strong style={{ color: allCases.length > 0 ? 'var(--soft-orange)' : 'var(--foreground)' }}>
              {sfLoading ? 'Loading…' : `${allCases.length} open`}
            </strong>
          </div>
          <div>
            <Shield />
            <span>Site status</span>
            {sev1Count > 0 || sev2Count > 0 ? (
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
            ) : (
              <strong style={{ color: allCases.length > 0 ? '#fbbf24' : '#4ade80' }}>
                {allCases.length > 0 ? 'Attention Needed' : 'Operational'}
              </strong>
            )}
          </div>
        </div>

        {/* Panel 1: Salesforce Cases Panel */}
        <section className="data-panel" id="salesforce">
          <div className="data-panel-heading">
            <div
              className="provider-symbol salesforce-symbol"
              style={{
                background:
                  activeBucket === 'alerts'
                    ? 'oklch(0.63 0.24 29 / 0.15)'
                    : activeBucket === 'closed'
                    ? 'rgba(16, 185, 129, 0.15)'
                    : activeBucket === 'analytics'
                    ? 'var(--orange-surface)'
                    : undefined,
              }}
            >
              {activeBucket === 'alerts' ? (
                <Radio style={{ color: '#ef4444' }} />
              ) : activeBucket === 'closed' ? (
                <CheckCircle2 style={{ color: '#10b981' }} />
              ) : activeBucket === 'analytics' ? (
                <BarChart3 style={{ color: 'var(--soft-orange)' }} />
              ) : (
                <Cloud />
              )}
            </div>
            <div>
              <span className="eyebrow">
                {activeBucket === 'cases'
                  ? 'CUSTOMER SUPPORT'
                  : activeBucket === 'alerts'
                  ? 'LIVE MONITORING & ALERTS'
                  : activeBucket === 'closed'
                  ? 'RESOLVED & COMPLETED ALERTS'
                  : 'HISTORICAL TELEMETRY & SLA PERFORMANCE'}
              </span>
              <h2>
                {activeBucket === 'cases'
                  ? 'Salesforce cases'
                  : activeBucket === 'alerts'
                  ? 'Site alerts'
                  : activeBucket === 'closed'
                  ? 'Closed alerts'
                  : 'Alert analysis'}
              </h2>
            </div>

            {/* Live Status Pill */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="live-badge">
                <span
                  className="live-pulse-dot"
                  style={{
                    background:
                      activeBucket === 'alerts'
                        ? '#ef4444'
                        : activeBucket === 'closed'
                        ? '#10b981'
                        : activeBucket === 'analytics'
                        ? 'var(--primary)'
                        : undefined,
                  }}
                />
                {activeBucket === 'cases'
                  ? 'Open Cases'
                  : activeBucket === 'alerts'
                  ? 'Open Alerts'
                  : activeBucket === 'closed'
                  ? 'Closed Alerts'
                  : 'Analysis Telemetry'}
              </span>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'stretch',
                  borderRadius: 9999,
                  overflow: 'hidden',
                  background: 'var(--secondary)',
                  border: '1px solid var(--border)',
                  fontSize: 10.5,
                  lineHeight: 1,
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
                }}
              >
                <span
                  style={{
                    background:
                      activeBucket === 'closed'
                        ? '#10b981'
                        : activeBucket === 'analytics'
                        ? 'var(--primary)'
                        : '#dc2626',
                    color: '#ffffff',
                    fontWeight: 700,
                    padding: '2.5px 7px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 16,
                  }}
                >
                  {activeBucket === 'analytics'
                    ? (analyticsFetching ? '…' : (analyticsData?.totalAlerts ?? allSiteAlerts.length))
                    : (sfLoading ? '…' : activeItems.length)}
                </span>
                <span
                  style={{
                    background: 'var(--secondary)',
                    color: 'var(--foreground)',
                    fontWeight: 600,
                    padding: '2.5px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textTransform: 'capitalize',
                  }}
                >
                  {activeBucket === 'cases'
                    ? 'Open Cases'
                    : activeBucket === 'closed'
                    ? 'Closed Alerts'
                    : activeBucket === 'analytics'
                    ? 'Total Alerts'
                    : 'Open Alerts'}
                </span>
              </div>
            </div>

            {/* Refresh Button */}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh Salesforce data"
              title="Refresh Salesforce data"
              onClick={() => void refetchSf()}
            >
              <RefreshCw className={sfFetching || analyticsFetching ? 'animate-spin' : ''} />
            </Button>
          </div>

          {/* Filter and Search Toolbar */}
          <div className="data-panel-toolbar">
            {activeBucket !== 'analytics' && (
              <div className="panel-search">
                <Search />
                <Input
                  placeholder={
                    activeBucket === 'cases'
                      ? "Search open cases by #, subject, location…"
                      : activeBucket === 'alerts'
                      ? "Search open alerts by #, subject, location…"
                      : "Search closed alerts by #, subject, location…"
                  }
                  aria-label="Search items"
                  value={caseSearch}
                  onChange={e => setCaseSearch(e.target.value)}
                />
              </div>
            )}

            {/* Bucket Switcher: Cases vs Alerts vs Closed Alerts vs Alert Analysis */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Button 1: Cases (Open) */}
              <button
                type="button"
                onClick={() => {
                  setActiveBucket('cases');
                  setStatusFilter('All');
                  setSeverityFilter('All');
                  setProductFilter('All');
                  setCategoryFilter('All');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'stretch',
                  borderRadius: 9999,
                  overflow: 'hidden',
                  background: 'var(--secondary)',
                  border: activeBucket === 'cases' ? '1px solid #dc2626' : '1px solid var(--border)',
                  boxShadow: activeBucket === 'cases' ? '0 0 0 2px rgba(220, 38, 38, 0.35)' : '0 1px 2px rgba(0,0,0,0.2)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 11,
                  lineHeight: 1,
                  transition: 'all 0.15s ease',
                  opacity: activeBucket === 'cases' ? 1 : 0.65,
                }}
                title="View live open support cases"
              >
                <span
                  style={{
                    background: '#dc2626',
                    color: '#ffffff',
                    fontWeight: 700,
                    padding: '3px 7px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 18,
                  }}
                >
                  {allCases.length}
                </span>
                <span
                  style={{
                    background: 'var(--secondary)',
                    color: 'var(--foreground)',
                    fontWeight: 600,
                    padding: '3px 9px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    letterSpacing: '0.01em',
                  }}
                >
                  <Cloud style={{ width: 11, height: 11 }} />
                  Open Cases
                </span>
              </button>

              {/* Button 2: Open Alerts (Always visible) */}
              <button
                type="button"
                onClick={() => {
                  setActiveBucket('alerts');
                  setStatusFilter('All');
                  setSeverityFilter('All');
                  setProductFilter('All');
                  setCategoryFilter('All');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'stretch',
                  borderRadius: 9999,
                  overflow: 'hidden',
                  background: 'var(--secondary)',
                  border: activeBucket === 'alerts' ? '1px solid #dc2626' : '1px solid var(--border)',
                  boxShadow: activeBucket === 'alerts' ? '0 0 0 2px rgba(220, 38, 38, 0.35)' : '0 1px 2px rgba(0,0,0,0.2)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 11,
                  lineHeight: 1,
                  transition: 'all 0.15s ease',
                  opacity: activeBucket === 'alerts' ? 1 : 0.65,
                }}
                title="View live open alerts"
              >
                <span
                  style={{
                    background: openAlerts.length > 0 ? '#dc2626' : 'var(--muted)',
                    color: '#ffffff',
                    fontWeight: 700,
                    padding: '3px 7px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 18,
                  }}
                >
                  {openAlerts.length}
                </span>
                <span
                  style={{
                    background: 'var(--secondary)',
                    color: 'var(--foreground)',
                    fontWeight: 600,
                    padding: '3px 9px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    letterSpacing: '0.01em',
                  }}
                >
                  <Radio style={{ width: 11, height: 11 }} />
                  Open Alerts
                </span>
              </button>

              {/* Button 3: Closed Alerts */}
              <button
                type="button"
                onClick={() => {
                  setActiveBucket('closed');
                  setStatusFilter('All');
                  setSeverityFilter('All');
                  setProductFilter('All');
                  setCategoryFilter('All');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'stretch',
                  borderRadius: 9999,
                  overflow: 'hidden',
                  background: 'var(--secondary)',
                  border: activeBucket === 'closed' ? '1px solid #10b981' : '1px solid var(--border)',
                  boxShadow: activeBucket === 'closed' ? '0 0 0 2px rgba(16, 185, 129, 0.35)' : '0 1px 2px rgba(0,0,0,0.2)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 11,
                  lineHeight: 1,
                  transition: 'all 0.15s ease',
                  opacity: activeBucket === 'closed' ? 1 : 0.65,
                }}
                title="View closed alerts from today"
              >
                <span
                  style={{
                    background: '#10b981',
                    color: '#ffffff',
                    fontWeight: 700,
                    padding: '3px 7px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 18,
                  }}
                >
                  {closedAlerts.length}
                </span>
                <span
                  style={{
                    background: 'var(--secondary)',
                    color: 'var(--foreground)',
                    fontWeight: 600,
                    padding: '3px 9px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    letterSpacing: '0.01em',
                  }}
                >
                  <CheckCircle2 style={{ width: 11, height: 11, color: '#10b981' }} />
                  Closed Alerts
                </span>
              </button>

              {/* Button 4: Alert Analysis */}
              <button
                type="button"
                onClick={() => {
                  setActiveBucket('analytics');
                  setStatusFilter('All');
                  setSeverityFilter('All');
                  setProductFilter('All');
                  setCategoryFilter('All');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'stretch',
                  borderRadius: 9999,
                  overflow: 'hidden',
                  background: 'var(--secondary)',
                  border: activeBucket === 'analytics' ? '1px solid var(--primary)' : '1px solid var(--border)',
                  boxShadow: activeBucket === 'analytics' ? '0 0 0 2px color-mix(in oklch, var(--primary) 35%, transparent)' : '0 1px 2px rgba(0,0,0,0.2)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 11,
                  lineHeight: 1,
                  transition: 'all 0.15s ease',
                  opacity: activeBucket === 'analytics' ? 1 : 0.65,
                }}
                title="View deep alert analytics, frequency charts & MTTR"
              >
                <span
                  style={{
                    background: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    fontWeight: 700,
                    padding: '3px 7px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 18,
                  }}
                >
                  {analyticsData?.totalAlerts ?? allSiteAlerts.length}
                </span>
                <span
                  style={{
                    background: 'var(--secondary)',
                    color: 'var(--foreground)',
                    fontWeight: 600,
                    padding: '3px 9px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    letterSpacing: '0.01em',
                  }}
                >
                  <BarChart3 style={{ width: 11, height: 11, color: 'var(--soft-orange)' }} />
                  Alert Analysis
                </span>
              </button>
            </div>

            {/* Reset All Filters Button */}
            {activeBucket !== 'analytics' && (severityFilter !== 'All' || productFilter !== 'All' || categoryFilter !== 'All' || statusFilter !== 'All' || caseSearch.trim().length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSeverityFilter('All');
                  setProductFilter('All');
                  setCategoryFilter('All');
                  setStatusFilter('All');
                  setCaseSearch('');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#ef4444',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 4,
                  padding: '3px 8px',
                  cursor: 'pointer',
                }}
                title="Reset all active filters"
              >
                <X style={{ width: 11, height: 11 }} />
                <span>Reset filters</span>
              </button>
            )}

            <span style={{ marginLeft: 'auto', color: 'var(--muted-foreground)', fontSize: 10 }}>
              {activeBucket === 'cases'
                ? 'Live Open Cases (Excludes Solved, Closed, and Tickets with End Time)'
                : activeBucket === 'alerts'
                ? 'Live Open Alerts (Excludes Closed Alerts)'
                : activeBucket === 'closed'
                ? 'Closed Alerts (Alerts resolved or closed today)'
                : 'Alert Analytics & Telemetry (Created → Ended MTTR & Distribution)'}
            </span>
          </div>

          {/* Alert Analytics & SLA Performance Panel with Line Graph and MTTR */}
          {activeBucket === 'analytics' && (
            <div style={{ padding: '0 16px 8px' }}>
              <AlertAnalyticsPanel
                siteName={site?.name || ''}
                siteId={site?.id}
                openAlerts={openAlerts}
                closedAlerts={closedAlerts}
                isSiteDown={Boolean(site?.is_down)}
                selectedRange={analyticsRange}
                onRangeChange={setAnalyticsRange}
                onAlertsLoaded={setHistoricalAlerts}
                analytics={analyticsData}
                isFetching={analyticsFetching}
              />
            </div>
          )}

          {/* Ticket Table: Only displayed for Open Cases, Open Alerts, and Closed Alerts */}
          {activeBucket !== 'analytics' && (
            <>
              {/* Table Header with interactive filters (Category removed for Alerts, Start & End Time added) */}
              <div
                className="sf-panel-table-head"
                style={
                  activeBucket === 'alerts'
                    ? { gridTemplateColumns: 'minmax(200px, 1.4fr) 85px 85px 125px 95px 125px 120px' }
                    : activeBucket === 'closed'
                    ? { gridTemplateColumns: 'minmax(180px, 1.3fr) 80px 80px 115px 90px 115px 115px 100px' }
                    : undefined
                }
              >
                <span>{activeBucket === 'cases' ? 'CASE & SUBJECT' : 'ALERT & SUBJECT'}</span>

                {/* Severity Filter Header */}
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
                      padding: '2px 3px',
                      fontSize: 8,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      width: '100%',
                      textTransform: 'uppercase',
                      outline: 'none',
                      transition: 'all 0.15s ease',
                    }}
                    title={severityFilter !== 'All' ? `Filtered by Severity: ${severityFilter} (Click to change or reset)` : 'Click to filter by Severity'}
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
                      ● SEV 1 URGENT ({activeItems.filter(c => !isImTicket(c) && !isDirTicket(c) && detectSeverity(c) === 'sev1').length})
                    </option>
                    <option value="SEV 2 URGENT" style={{ background: '#18191e', color: '#f59e0b', fontWeight: 700 }}>
                      ● SEV 2 URGENT ({activeItems.filter(c => !isImTicket(c) && !isDirTicket(c) && detectSeverity(c) === 'sev2').length})
                    </option>
                    {uniqueSeverities
                      .filter(sev => sev !== 'SEV 1 URGENT' && sev !== 'SEV 2 URGENT')
                      .map(sev => (
                        <option key={sev} value={sev} style={{ background: '#18191e', color: '#fff' }}>
                          {sev} ({activeItems.filter(c => (c.Highest_Severity__c === sev || c.Priority === sev)).length})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Product Filter Header */}
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <select
                    aria-label="Filter by Product"
                    value={productFilter}
                    onChange={e => setProductFilter(e.target.value)}
                    style={{
                      background: productFilter !== 'All' ? '#dc2626' : 'transparent',
                      color: productFilter !== 'All' ? '#ffffff' : 'var(--muted-foreground)',
                      border: productFilter !== 'All' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 4,
                      padding: '2px 3px',
                      fontSize: 8,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      width: '100%',
                      textTransform: 'uppercase',
                      outline: 'none',
                      transition: 'all 0.15s ease',
                    }}
                    title={productFilter !== 'All' ? `Filtered by Product: ${productFilter} (Click to change or reset)` : 'Click to filter by Product'}
                  >
                    <option value="All" style={{ background: '#18191e', color: '#fff' }}>
                      {productFilter !== 'All' ? `PROD: ${productFilter}` : 'PRODUCT ▾'}
                    </option>
                    {productFilter !== 'All' && (
                      <option value="All" style={{ background: '#18191e', color: '#f59e0b' }}>
                        ✕ Clear Filter (Show All)
                      </option>
                    )}
                    {uniqueProducts.map(prod => (
                      <option key={prod} value={prod} style={{ background: '#18191e', color: '#fff' }}>
                        {prod}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Filter Header - ONLY shown in Cases view, strictly omitted in Alerts views */}
                {activeBucket === 'cases' && (
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <select
                      aria-label="Filter by Category"
                      value={categoryFilter}
                      onChange={e => setCategoryFilter(e.target.value)}
                      style={{
                        background: categoryFilter !== 'All' ? '#dc2626' : 'transparent',
                        color: categoryFilter !== 'All' ? '#ffffff' : 'var(--muted-foreground)',
                        border: categoryFilter !== 'All' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 4,
                        padding: '2px 3px',
                        fontSize: 8,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        cursor: 'pointer',
                        width: '100%',
                        textTransform: 'uppercase',
                        outline: 'none',
                        transition: 'all 0.15s ease',
                      }}
                      title={categoryFilter !== 'All' ? `Filtered by Category: ${categoryFilter} (Click to change or reset)` : 'Click to filter by Category'}
                    >
                      <option value="All" style={{ background: '#18191e', color: '#fff' }}>
                        {categoryFilter !== 'All' ? `CAT: ${categoryFilter}` : 'CATEGORY ▾'}
                      </option>
                      {categoryFilter !== 'All' && (
                        <option value="All" style={{ background: '#18191e', color: '#f59e0b' }}>
                          ✕ Clear Filter (Show All)
                        </option>
                      )}
                      {uniqueCategories.map(cat => (
                        <option key={cat} value={cat} style={{ background: '#18191e', color: '#fff' }}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <span>ASSIGNED TO</span>

                {/* Status Filter Header */}
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <select
                    aria-label="Filter by Status"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={{
                      background: statusFilter !== 'All' ? '#dc2626' : 'transparent',
                      color: statusFilter !== 'All' ? '#ffffff' : 'var(--muted-foreground)',
                      border: statusFilter !== 'All' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 4,
                      padding: '2px 3px',
                      fontSize: 8,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      width: '100%',
                      textTransform: 'uppercase',
                      outline: 'none',
                      transition: 'all 0.15s ease',
                    }}
                    title={statusFilter !== 'All' ? `Filtered by Status: ${statusFilter} (Click to change or reset)` : 'Click to filter by Status'}
                  >
                    <option value="All" style={{ background: '#18191e', color: '#fff' }}>
                      {statusFilter !== 'All' ? `STATUS: ${statusFilter}` : 'STATUS ▾'}
                    </option>
                    {statusFilter !== 'All' && (
                      <option value="All" style={{ background: '#18191e', color: '#f59e0b' }}>
                        ✕ Clear Filter (Show All)
                      </option>
                    )}
                    {uniqueStatuses.map(st => (
                      <option key={st} value={st} style={{ background: '#18191e', color: '#fff' }}>
                        {st} ({activeItems.filter(c => c.Status === st).length})
                      </option>
                    ))}
                  </select>
                </div>

                {activeBucket === 'closed' ? (
                  <>
                    <span>START TIME</span>
                    <span>END TIME</span>
                    <span>DURATION (MTTR)</span>
                  </>
                ) : activeBucket === 'alerts' ? (
                  <>
                    <span>SITE / LOCATION</span>
                    <span>START TIME</span>
                  </>
                ) : (
                  <>
                    <span>SITE / LOCATION</span>
                    <span>LAST MODIFIED</span>
                  </>
                )}
              </div>

              {/* Table Body / Scroll Area */}
              <div
                className="panel-scroll"
                tabIndex={0}
                aria-label="Salesforce cases scrollable panel"
              >
                {sfLoading && allCases.length === 0 ? (
                  <div className="source-empty">
                    <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--blue)' }} />
                    <h3 style={{ marginTop: 14 }}>Fetching Salesforce cases…</h3>
                    <p>Retrieving active open cases for {site.name} from Salesforce org database.</p>
                  </div>
            ) : filteredCases.length > 0 ? (
              <div>
                {filteredCases.map(c => {
                  const isDown = Boolean(c.Is_Site_100_Down__c);
                  const raw = c as Record<string, unknown>;
                  const alertEndTime = getTicketEndTime(c) || c.ended_at || (raw['ended_at'] as string | undefined) || c.ClosedDate;
                  const hasEndTime = Boolean(alertEndTime);
                  const stLower = (c.Status || '').toLowerCase();
                  const isClosedTodayAlert = hasEndTime || stLower.includes('closed') || stLower.includes('solved') || stLower.includes('resolved');
                  const durationInfo = calculateAlertDuration(
                    c.CreatedDate || c.created_at || (raw['created_at'] as string | undefined),
                    alertEndTime,
                    !isClosedTodayAlert
                  );
                  const statusClass = isClosedTodayAlert
                    ? 'status-resolved'
                    : stLower.includes('new')
                    ? 'status-new'
                    : stLower.includes('progress')
                    ? 'status-progress'
                    : stLower.includes('investigat')
                    ? 'status-investigating'
                    : 'status-other';

                  const sevType = detectSeverity(c);
                  const isSev1Urgent = sevType === 'sev1';
                  const isSev2Urgent = sevType === 'sev2';

                  const priorityClass = isSev1Urgent
                    ? 'p-p1'
                    : isSev2Urgent
                    ? 'p-p2'
                    : 'p-p3';

                    const priorityDisplay = isSev1Urgent
                    ? 'SEV 1 URGENT'
                    : isSev2Urgent
                    ? 'SEV 2 URGENT'
                    : String(c.Highest_Severity__c || c.Priority || 'Severity 3');

                  const productDisplay = String(c.Product_Type__c || c.product_line || c.Parent_Product_Type__c || siteProductType);
                  const categoryDisplay = String(c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support');
                  const assignedDisplay = String(c.Dev_Case_Assignee__c || c.Owner?.Name || 'GreyOrange Queue');

                  return (
                    <div
                      key={c.Id}
                      className="sf-case-row"
                      style={
                        activeBucket === 'alerts'
                          ? { gridTemplateColumns: 'minmax(200px, 1.4fr) 85px 85px 125px 95px 125px 120px' }
                          : activeBucket === 'closed'
                          ? { gridTemplateColumns: 'minmax(180px, 1.3fr) 80px 80px 115px 90px 115px 115px 100px' }
                          : activeBucket === 'analytics'
                          ? { gridTemplateColumns: 'minmax(200px, 1.4fr) 85px 95px 125px 125px 110px 125px' }
                          : undefined
                      }
                      onClick={() => setSelectedCase(c)}
                      title={`Click to view full ${isAlertCase(c) ? 'alert' : 'case'} details`}
                    >
                      {activeBucket === 'analytics' ? (
                        <>
                          {/* Case # and Subject */}
                          <div className="case-subject-cell">
                            <div className="case-number-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <a
                                href={`https://greyorangeorg.my.salesforce.com/${c.Id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="case-number-tag"
                                title={`Open Alert ${c.CaseNumber || c.Id || 'Ticket'} in Salesforce`}
                                onClick={e => e.stopPropagation()}
                              >
                                {c.CaseNumber || c.Id || 'Alert'}
                                <ExternalLink style={{ width: 10, height: 10 }} />
                              </a>
                              {isSev1Urgent && (
                                <span className="case-down-badge" style={{ background: '#dc2626', color: '#fff', fontWeight: 800 }}>
                                  SEV 1 URGENT
                                </span>
                              )}
                              {isSev2Urgent && (
                                <span className="case-down-badge" style={{ background: '#d97706', color: '#fff', fontWeight: 800 }}>
                                  SEV 2 URGENT
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

                          {/* Status */}
                          <div>
                            <span
                              className={`case-status-badge ${statusClass}`}
                              style={
                                isClosedTodayAlert
                                  ? { color: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.4)', background: 'rgba(34, 197, 94, 0.12)' }
                                  : { color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.12)' }
                              }
                            >
                              {isClosedTodayAlert ? 'Resolved' : 'Active Open'}
                            </span>
                          </div>

                          {/* Created Time */}
                          <div className="case-date-cell" style={{ fontSize: 10, color: '#cbd5e1' }}>
                            {formatPreciseTime(c.CreatedDate || c.created_at || (raw['created_at'] as string | undefined))}
                          </div>

                          {/* Ended Time */}
                          <div className="case-date-cell" style={{ fontSize: 10, color: alertEndTime ? '#cbd5e1' : '#ef4444' }}>
                            {alertEndTime ? formatPreciseTime(alertEndTime) : 'Active / Ongoing'}
                          </div>

                          {/* Duration (MTTR) */}
                          <div>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 10,
                                fontWeight: 600,
                                color: durationInfo.isLive ? '#f87171' : '#34d399',
                                background: durationInfo.isLive ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                border: durationInfo.isLive ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Clock style={{ width: 10, height: 10 }} />
                              {durationInfo.text}
                            </span>
                          </div>

                          {/* Assigned To */}
                          <div className="case-assignee-cell" title={assignedDisplay}>
                            <User style={{ width: 11, height: 11 }} />
                            <span>{assignedDisplay}</span>
                          </div>
                        </>
                      ) : activeBucket === 'alerts' ? (
                        <>
                          {/* Alert # and Subject */}
                          <div className="case-subject-cell">
                            <div className="case-number-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <a
                                href={`https://greyorangeorg.my.salesforce.com/${c.Id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="case-number-tag"
                                title={`Open Alert ${c.CaseNumber} in Salesforce`}
                                onClick={e => e.stopPropagation()}
                              >
                                {c.CaseNumber}
                                <ExternalLink style={{ width: 10, height: 10 }} />
                              </a>
                              {isSev1Urgent && (
                                <span className="case-down-badge" style={{ background: '#dc2626', color: '#fff', fontWeight: 800 }}>
                                  SEV 1 URGENT
                                </span>
                              )}
                              {isSev2Urgent && (
                                <span className="case-down-badge" style={{ background: '#d97706', color: '#fff', fontWeight: 800 }}>
                                  SEV 2 URGENT
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

                          {/* Assigned To */}
                          <div className="case-assignee-cell" title={assignedDisplay}>
                            <User style={{ width: 11, height: 11 }} />
                            <span>{assignedDisplay}</span>
                          </div>

                          {/* Status */}
                          <div>
                            <span className={`case-status-badge ${statusClass}`}>
                              {c.Status || 'Active Open'}
                            </span>
                          </div>

                          {/* Site / Location */}
                          <div className="case-site-tag" title={String(c.Snow_Sitename__c || c.Customer_Location__c || site.name)}>
                            <MapPin style={{ width: 11, height: 11, flexShrink: 0 }} />
                            <span>
                              {String(c.Snow_Sitename__c || c.Customer_Location__c || site.name)}
                            </span>
                          </div>

                          {/* Start Time (ONLY start time in open alerts) */}
                          <div className="case-date-cell" style={{ fontSize: 10, color: '#f87171', fontWeight: 600 }}>
                            {formatPreciseTime(c.CreatedDate || c.created_at || (raw['created_at'] as string | undefined))}
                          </div>
                        </>
                      ) : activeBucket === 'closed' ? (
                        <>
                          {/* Alert # and Subject */}
                          <div className="case-subject-cell">
                            <div className="case-number-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <a
                                href={`https://greyorangeorg.my.salesforce.com/${c.Id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="case-number-tag"
                                title={`Open Closed Alert ${c.CaseNumber} in Salesforce`}
                                onClick={e => e.stopPropagation()}
                              >
                                {c.CaseNumber}
                                <ExternalLink style={{ width: 10, height: 10 }} />
                              </a>
                              {isSev1Urgent && (
                                <span className="case-down-badge" style={{ background: '#dc2626', color: '#fff', fontWeight: 800 }}>
                                  SEV 1 URGENT
                                </span>
                              )}
                              {isSev2Urgent && (
                                <span className="case-down-badge" style={{ background: '#d97706', color: '#fff', fontWeight: 800 }}>
                                  SEV 2 URGENT
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

                          {/* Assigned To */}
                          <div className="case-assignee-cell" title={assignedDisplay}>
                            <User style={{ width: 11, height: 11 }} />
                            <span>{assignedDisplay}</span>
                          </div>

                          {/* Status */}
                          <div>
                            <span
                              className={`case-status-badge ${statusClass}`}
                              style={{ color: '#22c55e', borderColor: 'oklch(0.7 0.15 140 / 0.4)', background: 'oklch(0.7 0.15 140 / 0.15)' }}
                            >
                              Closed
                            </span>
                          </div>

                          {/* Start Time */}
                          <div className="case-date-cell" style={{ fontSize: 10, color: '#cbd5e1' }}>
                            {formatPreciseTime(c.CreatedDate || c.created_at || (raw['created_at'] as string | undefined))}
                          </div>

                          {/* End Time */}
                          <div className="case-date-cell" style={{ fontSize: 10, color: '#34d399', fontWeight: 600 }}>
                            {alertEndTime ? formatPreciseTime(alertEndTime) : '—'}
                          </div>

                          {/* Duration (MTTR) */}
                          <div>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 10,
                                fontWeight: 600,
                                color: '#34d399',
                                background: 'rgba(16, 185, 129, 0.12)',
                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Clock style={{ width: 10, height: 10 }} />
                              {durationInfo.text}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
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
                              {isSev1Urgent && (
                                <span className="case-down-badge" style={{ background: '#dc2626', color: '#fff', fontWeight: 800 }}>
                                  SEV 1 URGENT
                                </span>
                              )}
                              {isSev2Urgent && (
                                <span className="case-down-badge" style={{ background: '#d97706', color: '#fff', fontWeight: 800 }}>
                                  SEV 2 URGENT
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

                          {/* Site / Location */}
                          <div className="case-site-tag" title={String(c.Snow_Sitename__c || c.Customer_Location__c || site.name)}>
                            <MapPin style={{ width: 11, height: 11, flexShrink: 0 }} />
                            <span>
                              {String(c.Snow_Sitename__c || c.Customer_Location__c || site.name)}
                            </span>
                          </div>

                          {/* Last Modified */}
                          <div className="case-date-cell">
                            {c.LastModifiedDate
                              ? new Date(c.LastModifiedDate).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : '—'}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="source-empty">
                <div className="empty-source-art cloud-art">
                  {activeBucket === 'alerts' ? (
                    <Radio style={{ color: '#ef4444' }} />
                  ) : activeBucket === 'closed' ? (
                    <CheckCircle2 style={{ color: '#10b981' }} />
                  ) : activeBucket === 'analytics' ? (
                    <BarChart3 style={{ color: '#3b82f6' }} />
                  ) : (
                    <Cloud />
                  )}
                  <span />
                  <span />
                </div>
                <h3>
                  {caseSearch || statusFilter !== 'All' || severityFilter !== 'All' || productFilter !== 'All' || categoryFilter !== 'All'
                    ? `No matching ${activeBucket === 'cases' ? 'cases' : 'alerts'} found`
                    : activeBucket === 'cases'
                    ? `No live open tickets for ${site.name}`
                    : activeBucket === 'alerts'
                    ? `No open alerts currently active for ${site.name}`
                    : activeBucket === 'closed'
                    ? `No closed alerts today for ${site.name}`
                    : `No alert history recorded for ${site.name}`}
                </h3>
                <p>
                  {caseSearch || statusFilter !== 'All' || severityFilter !== 'All' || productFilter !== 'All' || categoryFilter !== 'All'
                    ? 'Try adjusting your search query or column filters.'
                    : activeBucket === 'cases'
                    ? `All support tickets for ${site.name} are resolved. Excludes alerts and on-hold cases.`
                    : activeBucket === 'analytics'
                    ? `No alert records were logged for ${site.name} within this time window.`
                    : `All alerts for ${site.name} are clear.`}
                </p>
                    {(caseSearch || statusFilter !== 'All' || severityFilter !== 'All' || productFilter !== 'All' || categoryFilter !== 'All') && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCaseSearch('');
                          setStatusFilter('All');
                          setSeverityFilter('All');
                          setProductFilter('All');
                          setCategoryFilter('All');
                        }}
                      >
                        Reset filters
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Panel Footer */}
          <div className="panel-footer">
            {activeBucket === 'analytics' ? (
              <>
                <span>
                  {analyticsData?.totalAlerts ?? allSiteAlerts.length} total alerts analyzed in {analyticsData?.rangeLabel || analyticsRange} window
                </span>
                <span>Telemetry Source: Salesforce Org (Live)</span>
              </>
            ) : (
              <>
                <span>
                  {filteredCases.length} of {activeItems.length}{' '}
                  {activeBucket === 'cases'
                    ? 'open cases'
                    : activeBucket === 'alerts'
                    ? 'open alerts'
                    : 'closed alerts'}{' '}
                  displayed
                </span>
                <span>Source: Salesforce Org (Live)</span>
              </>
            )}
          </div>
        </section>
        </>
        )}
      </div>

      {/* Case Details Dialog Modal */}
      {selectedCase && (
        <div className="case-modal-overlay" onClick={() => setSelectedCase(null)}>
          <div className="case-modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <a
                  href={`https://greyorangeorg.my.salesforce.com/${selectedCase.Id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="case-number-tag"
                  style={{ fontSize: 12, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  title="Open this Case in Salesforce"
                >
                  CASE {selectedCase.CaseNumber}
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
                  {String(selectedCase.Product_Type__c || selectedCase.product_line || selectedCase.Parent_Product_Type__c || siteProductType)}
                </p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Category</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>
                  {String(selectedCase.Category__c || selectedCase.Snow_Category__c || selectedCase.Category || selectedCase.Type || 'Technical Support')}
                </p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Assigned To</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>
                  {String(selectedCase.Dev_Case_Assignee__c || selectedCase.Owner?.Name || 'GreyOrange Queue')}
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
                  {String(selectedCase.Snow_Sitename__c || selectedCase.Customer_Location__c || site.name)}
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

      <ConnectionsDialog open={connections} onOpenChange={setConnections} />
      <SiteEditor key={`${site.id}-${editor}`} site={site} open={editor} onOpenChange={setEditor} />
      <SignInDialog open={login} onOpenChange={setLogin} />
    </DashboardShell>
  );
}