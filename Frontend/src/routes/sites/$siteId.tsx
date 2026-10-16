import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUpRight,
  Building2,
  Radio,
  Cloud,
  Search,
  RefreshCw,
  PlugZap,
  Pencil,
  Shield,
  AlertTriangle,
  ExternalLink,
  X,
  MapPin,
  Clock,
  Layers,
  User,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DashboardShell } from '@/components/dashboard-shell';
import { ConnectionsDialog, SiteEditor, SignInDialog } from '@/components/dashboard-dialogs';
import { sitesQueryOptions } from '@/lib/sites';
import { useAuth } from '@/components/auth-context';
import { sfFetchCasesForSite, isAlertCase, detectSeverity, isImTicket, isDirTicket, type SFCase } from '@/integrations/salesforce/client';
import { SiteRunbookPanel, type RunbookTabKey } from '@/components/site-runbook-panel';
import { fetchSiteRunbook, defaultRunbook, type SiteRunbook } from '@/lib/runbook';

function resolveSite(sites: Site[] | undefined, idOrName: string): Site | undefined {
  if (!sites || !idOrName) return undefined;
  const decoded = decodeURIComponent(idOrName).trim().toLowerCase();
  const slug = decoded.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return sites.find(s => {
    if (s.id === idOrName || s.id.toLowerCase() === decoded) return true;
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
  const [activeBucket, setActiveBucket] = useState<'cases' | 'alerts'>('cases');

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

  // Extract open cases and alerts (opened + closed today)
  const allCases: SFCase[] = sfData?.records ?? [];
  const allAlerts: SFCase[] = sfData?.alerts ?? [];
  const activeItems: SFCase[] = activeBucket === 'cases' ? allCases : allAlerts;

  const siteProductType = site?.product_line || 'RMS';

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
    for (const c of activeItems) {
      const prod = String(c.Product_Type__c || c.product_line || c.Parent_Product_Type__c || siteProductType).trim();
      if (prod) set.add(prod);
    }
    return Array.from(set).sort();
  }, [activeItems, siteProductType]);

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
      const q = caseSearch.toLowerCase();
      const matchSearch =
        !q ||
        c.CaseNumber.toLowerCase().includes(q) ||
        (c.Subject || '').toLowerCase().includes(q) ||
        (c.Description || '').toLowerCase().includes(q) ||
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

      const prodStr = String(c.Product_Type__c || c.product_line || c.Parent_Product_Type__c || siteProductType).trim();
      const matchProduct = productFilter === 'All' || prodStr.toLowerCase() === productFilter.toLowerCase();

      const catStr = String(c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support').trim();
      const matchCategory = categoryFilter === 'All' || catStr.toLowerCase() === categoryFilter.toLowerCase();

      return matchSearch && matchStatus && matchSeverity && matchProduct && matchCategory;
    });
  }, [activeItems, caseSearch, statusFilter, severityFilter, productFilter, categoryFilter, siteProductType]);

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
        <Link to="/" className="back-link">
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
            <p className="detail-subtitle">
              {siteProductType && siteProductType !== 'Unassigned' && (
                <>
                  <Building2 />
                  {siteProductType}
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
            <Button variant="outline" onClick={() => setConnections(true)}>
              <PlugZap />
              Connections
            </Button>
          </div>
        </div>

        {activeTab !== 'monitoring' ? (
          <SiteRunbookPanel
            siteId={site.id}
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
            <Radio />
            <span>Opsgenie alerts</span>
            <strong>—</strong>
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

        {/* Panel 1: Salesforce Live Cases / Alerts Panel */}
        <section className="data-panel" id="salesforce">
          <div className="data-panel-heading">
            <div className="provider-symbol salesforce-symbol" style={{ background: activeBucket === 'alerts' ? 'oklch(0.63 0.24 29 / 0.15)' : undefined }}>
              {activeBucket === 'alerts' ? <Radio style={{ color: '#ef4444' }} /> : <Cloud />}
            </div>
            <div>
              <span className="eyebrow">{activeBucket === 'cases' ? 'CUSTOMER SUPPORT' : 'LIVE MONITORING & ALERTS'}</span>
              <h2>{activeBucket === 'cases' ? 'Salesforce cases' : 'Site alerts'}</h2>
            </div>

            {/* Live Status Pill */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="live-badge">
                <span className="live-pulse-dot" style={{ background: activeBucket === 'alerts' ? '#ef4444' : undefined }} />
                {activeBucket === 'cases' ? 'Live Cases' : 'Live Alerts'}
              </span>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'stretch',
                  borderRadius: 9999,
                  overflow: 'hidden',
                  background: '#18191e',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: 10.5,
                  lineHeight: 1,
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
                }}
              >
                <span
                  style={{
                    background: '#dc2626',
                    color: '#ffffff',
                    fontWeight: 700,
                    padding: '2.5px 7px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 16,
                  }}
                >
                  {sfLoading ? '…' : activeItems.length}
                </span>
                <span
                  style={{
                    background: '#18191e',
                    color: '#ffffff',
                    fontWeight: 600,
                    padding: '2.5px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textTransform: 'capitalize',
                  }}
                >
                  {activeBucket}
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
              <RefreshCw className={sfFetching ? 'animate-spin' : ''} />
            </Button>
          </div>

          {/* Filter and Search Toolbar */}
          <div className="data-panel-toolbar">
            <div className="panel-search">
              <Search />
              <Input
                placeholder={activeBucket === 'cases' ? "Search cases by #, subject, location…" : "Search alerts by #, subject, location…"}
                aria-label="Search items"
                value={caseSearch}
                onChange={e => setCaseSearch(e.target.value)}
              />
            </div>

            {/* Shift Bucket Button (Shifts between Cases and Alerts) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                  background: '#18191e',
                  border: activeBucket === 'cases' ? '1px solid #dc2626' : '1px solid rgba(255, 255, 255, 0.12)',
                  boxShadow: activeBucket === 'cases' ? '0 0 0 2px rgba(220, 38, 38, 0.35)' : '0 1px 2px rgba(0,0,0,0.3)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 11,
                  lineHeight: 1,
                  transition: 'all 0.15s ease',
                  opacity: activeBucket === 'cases' ? 1 : 0.65,
                }}
                title="View support cases"
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
                    background: '#18191e',
                    color: '#ffffff',
                    fontWeight: 600,
                    padding: '3px 9px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    letterSpacing: '0.01em',
                  }}
                >
                  <Cloud style={{ width: 11, height: 11 }} />
                  Cases
                </span>
              </button>

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
                  background: '#18191e',
                  border: activeBucket === 'alerts' ? '1px solid #dc2626' : '1px solid rgba(255, 255, 255, 0.12)',
                  boxShadow: activeBucket === 'alerts' ? '0 0 0 2px rgba(220, 38, 38, 0.35)' : '0 1px 2px rgba(0,0,0,0.3)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 11,
                  lineHeight: 1,
                  transition: 'all 0.15s ease',
                  opacity: activeBucket === 'alerts' ? 1 : 0.65,
                }}
                title="Shift to Alerts bucket (Showing opened alerts and closed alerts of today's date)"
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
                  {allAlerts.length}
                </span>
                <span
                  style={{
                    background: '#18191e',
                    color: '#ffffff',
                    fontWeight: 600,
                    padding: '3px 9px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    letterSpacing: '0.01em',
                  }}
                >
                  <Radio style={{ width: 11, height: 11 }} />
                  Alerts
                </span>
              </button>
            </div>


            {/* Reset All Filters Button */}
            {(severityFilter !== 'All' || productFilter !== 'All' || categoryFilter !== 'All' || statusFilter !== 'All' || caseSearch.trim().length > 0) && (
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
                ? 'Live Open Tickets (Excludes Alerts & Solved/On Hold)'
                : "Active Alerts Bucket (Opened & Closed Alerts of Today's Date)"}
            </span>
          </div>

          {/* Table Header with interactive filters for Severity, Product, Category */}
          <div className="sf-panel-table-head">
            <span>CASE & SUBJECT</span>

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

            {/* Category Filter Header */}
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

            <span>SITE / LOCATION</span>
            <span>LAST MODIFIED</span>
          </div>

          {/* Table Body / Scroll Area */}
          <div className="panel-scroll" tabIndex={0} aria-label="Salesforce cases scrollable panel">
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
                    : c.Highest_Severity__c || c.Priority || 'Severity 3';

                  const productDisplay = String(c.Product_Type__c || c.product_line || c.Parent_Product_Type__c || siteProductType);
                  const categoryDisplay = String(c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support');
                  const assignedDisplay = String(c.Dev_Case_Assignee__c || c.Owner?.Name || 'GreyOrange Queue');

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
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="source-empty">
                <div className="empty-source-art cloud-art">
                  {activeBucket === 'alerts' ? <Radio style={{ color: '#ef4444' }} /> : <Cloud />}
                  <span />
                  <span />
                </div>
                <h3>
                  {caseSearch || statusFilter !== 'All' || severityFilter !== 'All' || productFilter !== 'All' || categoryFilter !== 'All'
                    ? `No matching ${activeBucket === 'cases' ? 'cases' : 'alerts'} found`
                    : activeBucket === 'cases'
                    ? `No live open tickets for ${site.name}`
                    : `No active or today's closed alerts for ${site.name}`}
                </h3>
                <p>
                  {caseSearch || statusFilter !== 'All' || severityFilter !== 'All' || productFilter !== 'All' || categoryFilter !== 'All'
                    ? 'Try adjusting your search query or column filters.'
                    : activeBucket === 'cases'
                    ? `All support tickets for ${site.name} are resolved. Excludes alerts and on-hold cases.`
                    : `No open alerts or alerts closed today for ${site.name}. All systems clear.`}
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

          {/* Panel Footer */}
          <div className="panel-footer">
            <span>
              {filteredCases.length} of {activeItems.length} {activeBucket === 'cases' ? 'open cases' : 'alerts (opened + closed today)'} displayed
            </span>
            <span>Source: Salesforce Org (Live)</span>
          </div>
        </section>

        {/* Jump link to Opsgenie */}
        <a className="next-panel" href="#opsgenie">
          Opsgenie alert pool
          <ArrowDown />
        </a>

        {/* Panel 2: Opsgenie Alert Pool */}
        <section className="data-panel" id="opsgenie">
          <div className="data-panel-heading">
            <div className="provider-symbol">
              <Radio />
            </div>
            <div>
              <span className="eyebrow">ALERT MANAGEMENT</span>
              <h2>Opsgenie alert pool</h2>
            </div>
            <span className="pill">Not connected</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh Opsgenie alerts"
              title="Refresh Opsgenie alerts"
              onClick={() => setConnections(true)}
            >
              <RefreshCw />
            </Button>
          </div>
          <div className="data-panel-toolbar">
            <div className="panel-search">
              <Search />
              <Input placeholder="Search alerts…" aria-label="Search alerts" disabled />
            </div>
            <span>All priorities</span>
            <span>All statuses</span>
          </div>
          <div className="panel-table-head">
            <span>ALERT</span>
            <span>PRIORITY</span>
            <span>STATUS</span>
            <span>CREATED</span>
          </div>
          <div className="panel-scroll" tabIndex={0} aria-label="Opsgenie alerts scrollable panel">
            <div className="source-empty">
              <div className="empty-source-art">
                <Radio />
                <span />
                <span />
              </div>
              <h3>Your alerts will appear here</h3>
              <p>
                {!user
                  ? 'Sign in and connect Opsgenie to view this site’s alert pool.'
                  : 'An Opsgenie API key and site tag are needed to load alerts.'}
              </p>
              <Button variant="outline" onClick={() => (!user ? setLogin(true) : setConnections(true))}>
                {!user ? 'Sign in' : 'View connection details'}
                <ArrowUpRight />
              </Button>
            </div>
          </div>
          <div className="panel-footer">
            <span>0 alerts loaded</span>
            <span>Source: Opsgenie</span>
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
                  {selectedCase.Product_Type__c || selectedCase.product_line || selectedCase.Parent_Product_Type__c || siteProductType}
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