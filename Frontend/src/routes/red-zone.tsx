import { useState, useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Building2,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  Radio,
  Cloud,
  CheckCircle2,
  Flame,
  TrendingUp,
} from 'lucide-react';
import { DashboardShell } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  sfFetchRedZoneSites,
  type RedZoneSiteInfo,
} from '@/integrations/salesforce/client';
import { sitesQueryOptions } from '@/lib/sites';

export const Route = createFileRoute('/red-zone')({
  head: () => ({
    meta: [
      { title: 'RED Zone Sites — Sitepulse' },
      { name: 'description', content: 'Sites classified under RED zone based on Salesforce incident volume and individual MTBF.' },
    ],
  }),
  loader: async ({ context }) => {
    void context.queryClient.ensureQueryData(sitesQueryOptions());
    void context.queryClient.prefetchQuery({
      queryKey: ['salesforce-red-zone'],
      queryFn: () => sfFetchRedZoneSites(),
      staleTime: 45_000,
    });
  },
  component: RedZonePage,
});

function RedZonePage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'breach' | 'cooling'>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const { data: baseSites = [] } = useQuery(sitesQueryOptions());

  const {
    data: redZoneData,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['salesforce-red-zone'],
    queryFn: () => sfFetchRedZoneSites(),
    staleTime: 45_000,
    refetchInterval: 60_000,
  });

  const allRedZoneSites = redZoneData?.redZoneSites || [];

  // Match RedZone sites with baseSites to get route ID
  const enrichedRedZoneSites = useMemo(() => {
    return allRedZoneSites.map((rz, idx) => {
      const matched = baseSites.find(
        s => s.name?.toLowerCase().trim() === rz.siteName?.toLowerCase().trim()
      );
      return {
        ...rz,
        targetSiteId: matched?.id || rz.siteId,
        location: matched?.location || rz.location,
        position: matched?.position ?? idx,
      };
    });
  }, [allRedZoneSites, baseSites]);

  const filteredSites = useMemo(() => {
    let list = enrichedRedZoneSites;

    if (statusFilter === 'breach') {
      list = list.filter(s => s.status === 'ACTIVE_BREACH');
    } else if (statusFilter === 'cooling') {
      list = list.filter(s => s.status === 'EXIT_PENDING');
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(s =>
        s.siteName.toLowerCase().includes(q) ||
        s.reasons.some(r => r.toLowerCase().includes(q))
      );
    }

    return list;
  }, [enrichedRedZoneSites, statusFilter, search]);

  const totalCount = redZoneData?.totalRedZoneSites ?? 0;
  const activeBreachesCount = redZoneData?.activeBreachesCount ?? 0;
  const exitPendingCount = redZoneData?.exitPendingCount ?? 0;

  return (
    <DashboardShell>
      <div className="page-wrap">
        {/* Page Heading - exact match to Sitepulse header */}
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <span style={{ background: '#ef4444' }} />
              OPERATIONAL RISK &amp; RELIABILITY REGISTRY
            </div>
            <h1>
              RED zone sites<span className="heading-dot" style={{ color: '#ef4444' }}>.</span>
            </h1>
            <p>
              Sites automatically classified under Red Zone based on incident frequency and individual MTBF.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40 }}
            >
              <RefreshCw
                className={isFetching ? 'animate-spin' : ''}
                style={{ width: 14, height: 14 }}
              />
              <span>{isFetching ? 'Refreshing…' : 'Refresh'}</span>
            </Button>
            <Button
              variant="outline"
              asChild
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40 }}
            >
              <Link to="/">
                <span>All sites</span>
                <ArrowRight style={{ width: 14, height: 14 }} />
              </Link>
            </Button>
          </div>
        </div>

        {/* Overview Metrics - exactly matching Sitepulse 4-metric strip */}
        <div className="overview-metrics">
          <div className="metric">
            <span className="metric-label">
              <ShieldAlert style={{ color: '#ef4444' }} />
              RED zone sites
            </span>
            <div>
              <strong style={{ color: totalCount > 0 ? '#ef4444' : undefined }}>
                {totalCount}
              </strong>
              <span>requiring active operations focus</span>
            </div>
            <div className="metric-foot">
              <span
                className="source-dot"
                style={{ background: totalCount > 0 ? '#ef4444' : '#22c55e' }}
              />
              {totalCount > 0 ? `${totalCount} ${totalCount === 1 ? 'site' : 'sites'} under monitoring` : 'All sites healthy'}
            </div>
          </div>

          <div className="metric">
            <span className="metric-label">
              <AlertTriangle style={{ color: '#ef4444' }} />
              Active breaches
            </span>
            <div>
              <strong style={{ color: activeBreachesCount > 0 ? '#ef4444' : undefined }}>
                {activeBreachesCount}
              </strong>
              <span>meeting entry criteria today</span>
            </div>
            <div className="metric-foot">
              <span
                className="source-dot"
                style={{ background: activeBreachesCount > 0 ? '#ef4444' : '#22c55e' }}
              />
              Sev-1 &ge; 3, Sev-2 &ge; 5, or MTBF &lt; 36h
            </div>
          </div>

          <div className="metric">
            <span className="metric-label">
              <Clock style={{ color: '#f59e0b' }} />
              21-Day probation
            </span>
            <div>
              <strong style={{ color: exitPendingCount > 0 ? '#f59e0b' : undefined }}>
                {exitPendingCount}
              </strong>
              <span>cooling down to exit Red Zone</span>
            </div>
            <div className="metric-foot">
              <span
                className="source-dot"
                style={{ background: exitPendingCount > 0 ? '#f59e0b' : 'var(--muted-foreground)' }}
              />
              Exits after 21 continuous clean days
            </div>
          </div>

          <div className="metric">
            <span className="metric-label">
              <Radio />
              Calculation mode
            </span>
            <div>
              <strong style={{ fontSize: 24, lineHeight: 1.25 }}>Per site</strong>
              <span>individual site MTBF</span>
            </div>
            <div className="metric-foot">
              <span className="neutral-dot" />
              Not fleet averaged
            </div>
          </div>
        </div>

        {/* Directory Section - exact match to Sitepulse tools, search, filter, and grid */}
        <section className="directory">
          <div className="section-title">
            <h2>
              RED zone sites <span>{filteredSites.length}</span>
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="directory-note">
                <Flame style={{ width: 11, height: 11, color: '#ef4444' }} />
                AUTOMATED SF INCIDENT MONITOR
              </span>
              <span className="directory-note">
                <span className="neutral-dot" />
                LIVE (60s)
              </span>
            </div>
          </div>

          <div className="directory-tools">
            <div className="site-search">
              <Search />
              <Input
                aria-label="Search RED zone sites"
                placeholder="Search RED zone sites…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <kbd>⌕</kbd>
            </div>

            <div className="filter-tools">
              {/* Status filter */}
              <div className="filter-select">
                <SlidersHorizontal />
                <select
                  aria-label="Filter status"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                >
                  <option value="all">All statuses ({totalCount})</option>
                  <option value="breach">Active breach ({activeBreachesCount})</option>
                  <option value="cooling">21-Day probation ({exitPendingCount})</option>
                </select>
                <ChevronDown />
              </div>

              {/* View Toggle */}
              <div className="view-toggle">
                <button
                  type="button"
                  className={view === 'grid' ? 'selected' : ''}
                  onClick={() => setView('grid')}
                  title="Grid view"
                >
                  <LayoutGrid />
                </button>
                <button
                  type="button"
                  className={view === 'list' ? 'selected' : ''}
                  onClick={() => setView('list')}
                  title="List view"
                >
                  <List />
                </button>
              </div>
            </div>
          </div>

          {/* Sites Grid / List */}
          {filteredSites.length > 0 ? (
            <div className={`site-grid ${view === 'list' ? 'list-view' : ''}`}>
              {filteredSites.map((site, i) => {
                const isBreach = site.status === 'ACTIVE_BREACH';
                const sev1Breached = site.criteria1.sev1Count7d >= 3;
                const sev2Breached = site.criteria1.sev2Count7d >= 5;
                const mtbfBreached = site.criteria3.met;

                return (
                  <article
                    className={`site-card ${isBreach ? 'site-card-paper site-card-highlight-red' : 'site-card-paper site-card-highlight-yellow'}`}
                    key={site.siteName}
                  >
                    <Button asChild variant="site">
                      <Link to="/sites/$siteId" params={{ siteId: site.targetSiteId }} preload={false}>
                        <div className="site-card-top">
                          <span className={`site-emblem emblem-${(site.position ?? i) % 4}`}>
                            <Building2 />
                          </span>

                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span
                              className={`rz-badge-pill ${isBreach ? 'rz-badge-breach' : 'rz-badge-cooling'}`}
                              title={isBreach ? 'Active entry criteria breach' : 'In 21-day clean exit streak'}
                            >
                              {isBreach ? (
                                <>
                                  <span
                                    style={{
                                      width: 5,
                                      height: 5,
                                      borderRadius: '50%',
                                      background: '#ef4444',
                                    }}
                                  />
                                  ACTIVE BREACH
                                </>
                              ) : (
                                <>
                                  <Clock style={{ width: 10, height: 10 }} />
                                  {site.daysRemainingToExit}d TO EXIT
                                </>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="site-card-title">
                          <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em' }}>
                            {site.siteName}
                          </h3>
                          <ArrowUpRight />
                        </div>

                        <div
                          className="site-card-subtitle"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <span
                              className="source-dot"
                              style={{ background: isBreach ? '#ef4444' : '#f59e0b' }}
                            />
                            <span
                              style={{
                                color: isBreach ? '#ef4444' : '#f59e0b',
                                fontWeight: 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={site.reasons[0] || 'Reliability threshold breached'}
                            >
                              {site.reasons[0] || 'Reliability threshold breached'}
                            </span>
                          </div>

                          <span
                            style={{
                              fontSize: 9,
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--muted-foreground)',
                              flexShrink: 0,
                            }}
                          >
                            {site.daysSinceBreach} / 21d clean
                          </span>
                        </div>

                        {/* Metric stats row matching Sitepulse card bottom */}
                        <div className="site-card-bottom">
                          <span title="Sev-1 Incidents in last 7 days (Threshold: 3)">
                            <Flame
                              style={{
                                width: 11,
                                height: 11,
                                color: sev1Breached ? '#ef4444' : 'var(--muted-foreground)',
                              }}
                            />
                            <span>7d Sev-1</span>
                            <b style={{ color: sev1Breached ? '#ef4444' : 'var(--foreground)' }}>
                              {site.criteria1.sev1Count7d}
                            </b>
                          </span>

                          <span title="Sev-2 Incidents in last 7 days (Threshold: 5)">
                            <Flame
                              style={{
                                width: 11,
                                height: 11,
                                color: sev2Breached ? '#ef4444' : 'var(--muted-foreground)',
                              }}
                            />
                            <span>7d Sev-2</span>
                            <b style={{ color: sev2Breached ? '#ef4444' : 'var(--foreground)' }}>
                              {site.criteria1.sev2Count7d}
                            </b>
                          </span>

                          <span title="Individual Site MTBF in last 14 days (Threshold: < 36h)">
                            <Clock
                              style={{
                                width: 11,
                                height: 11,
                                color: mtbfBreached ? '#ef4444' : 'var(--muted-foreground)',
                              }}
                            />
                            <span>MTBF</span>
                            <b style={{ color: mtbfBreached ? '#ef4444' : 'var(--foreground)' }}>
                              {site.criteria3.mtbfHours !== null ? `${site.criteria3.mtbfHours}h` : '—'}
                            </b>
                          </span>

                          <ArrowRight className="card-arrow" />
                        </div>
                      </Link>
                    </Button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-directory" style={{ minHeight: 320, padding: '48px 20px' }}>
              <div className="site-emblem emblem-2" style={{ width: 44, height: 44, marginBottom: 8 }}>
                <CheckCircle2 style={{ width: 22, height: 22, color: 'var(--success)' }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--foreground)', margin: '0 0 6px' }}>
                All sites operating normally
              </h3>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                  maxWidth: 420,
                  textAlign: 'center',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                No sites currently meet the RED zone criteria. All monitored operational sites are
                healthy and within MTBF thresholds.
              </p>
              <Button variant="outline" size="sm" asChild style={{ marginTop: 16 }}>
                <Link to="/">
                  <span>Return to All sites</span>
                  <ArrowRight style={{ width: 13, height: 13, marginLeft: 6 }} />
                </Link>
              </Button>
            </div>
          )}

          {/* Directory Footer */}
          <div className="directory-footer">
            <span>
              Showing {filteredSites.length} of {totalCount} RED zone sites
            </span>
            <span>Calculation basis: Individual Site MTBF &amp; Incident Volume</span>
          </div>
        </section>

        {/* Main Footer */}
        <div className="main-footer" style={{ margin: '32px 0 0' }}>
          <span>
            <span className="footer-dot" />
            Live Salesforce telemetry
            <span className="footer-separator">•</span>
            Dynamic Red Zone evaluation
          </span>
          <span>Sitepulse Operational Monitoring</span>
        </div>
      </div>
    </DashboardShell>
  );
}
