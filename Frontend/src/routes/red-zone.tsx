import { useState, useMemo, useEffect } from 'react';
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
  ChevronUp,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Radio,
  CheckCircle2,
  Flame,
  TrendingUp,
  ExternalLink,
  MapPin,
  Timer,
  FileText,
  Layers,
  Cloud,
  Zap,
  Activity,
  AlertCircle,
  BarChart3,
  Cpu,
  Server,
  Workflow,
} from 'lucide-react';
import { DashboardShell } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  sfFetchRedZoneSites,
  type RedZoneSiteInfo,
  type RedZoneQualifyingIncident,
  type RedZoneDailyMetric,
} from '@/integrations/salesforce/client';
import { sitesQueryOptions } from '@/lib/sites';

export const Route = createFileRoute('/red-zone')({
  head: () => ({
    meta: [
      { title: 'RED Zone Sites & Reliability Audit — Sitepulse' },
      {
        name: 'description',
        content: 'Operational RED zone management audit, individual MTBF metrics, incident timelines, and subsystem root-cause insights.',
      },
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

type EnrichedRedZoneSite = RedZoneSiteInfo & {
  targetSiteId: string;
  location?: string | null;
  position: number;
};

function formatTimestamp(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(dateStr);
  }
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const ms = Date.now() - new Date(dateStr).getTime();
    if (isNaN(ms)) return '';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

function createSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function createSmoothAreaPath(points: Array<{ x: number; y: number }>, baselineY: number): string {
  if (points.length === 0) return '';
  const curve = createSmoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${curve} L ${last.x.toFixed(1)} ${baselineY} L ${first.x.toFixed(1)} ${baselineY} Z`;
}

function categorizeSubsystem(subject: string, desc?: string | null): 'Robotics & Hardware' | 'Software & Database' | 'Workflow & Picking' | 'System Outage' {
  const text = `${subject} ${desc || ''}`.toLowerCase();
  if (/(?:100%|site down|system stopped|deadlock|power outage|blackout)/i.test(text)) {
    return 'System Outage';
  }
  if (/(?:bot|bots|charger|chassis|drive|wheel|motor|dock|lidar|laser)/i.test(text)) {
    return 'Robotics & Hardware';
  }
  if (/(?:postgres|mnesia|rabbitmq|redis|kafka|database|db|gor|api|timeout|500|exception|latency)/i.test(text)) {
    return 'Software & Database';
  }
  return 'Workflow & Picking';
}

function RedZonePage() {
  // Sync selected site with URL search params so browser back/forward and bookmarks work
  const [selectedSiteName, setSelectedSiteName] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('site');
      return p ? decodeURIComponent(p).trim() : null;
    }
    return null;
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'breach' | 'cooling'>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  // Site detail page states
  const [chartMode, setChartMode] = useState<'timeline' | 'trend'>('timeline');
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketFilter, setTicketFilter] = useState<'all' | 'sev1' | 'sev2' | 'down' | 'active'>('all');
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

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

  // Match RedZone sites with baseSites to get route ID & canonical location
  const enrichedRedZoneSites: EnrichedRedZoneSite[] = useMemo(() => {
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

  // Handle URL history state for deep-linking
  const selectSite = (siteName: string | null) => {
    setSelectedSiteName(siteName);
    setExpandedTicketId(null);
    setTicketSearch('');
    setTicketFilter('all');

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (siteName) {
        url.searchParams.set('site', siteName);
      } else {
        url.searchParams.delete('site');
      }
      window.history.pushState(null, '', url.toString());
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const p = new URLSearchParams(window.location.search).get('site');
      setSelectedSiteName(p ? decodeURIComponent(p).trim() : null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Filtered sites for directory view
  const filteredSites = useMemo(() => {
    let list = enrichedRedZoneSites;

    if (statusFilter === 'breach') {
      list = list.filter(s => s.status === 'ACTIVE_BREACH');
    } else if (statusFilter === 'cooling') {
      list = list.filter(s => s.status === 'EXIT_PENDING');
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        s =>
          s.siteName.toLowerCase().includes(q) ||
          s.reasons.some(r => r.toLowerCase().includes(q))
      );
    }

    return list;
  }, [enrichedRedZoneSites, statusFilter, search]);

  const totalCount = redZoneData?.totalRedZoneSites ?? 0;
  const activeBreachesCount = redZoneData?.activeBreachesCount ?? 0;
  const exitPendingCount = redZoneData?.exitPendingCount ?? 0;

  // Currently selected site for dedicated page view
  const currentSite = useMemo(() => {
    if (!selectedSiteName) return null;
    const nameLower = selectedSiteName.toLowerCase();
    return enrichedRedZoneSites.find(
      s => s.siteName.toLowerCase() === nameLower || s.siteId.toLowerCase() === nameLower
    ) || null;
  }, [selectedSiteName, enrichedRedZoneSites]);

  // Daily metrics for selected site timeline graph (calculated over 21-day Red Zone cycle)
  const siteDailyMetrics: RedZoneDailyMetric[] = useMemo(() => {
    if (!currentSite) return [];
    const incidents = currentSite.qualifyingIncidents || [];

    // Always compute accurate 21-day rolling metrics directly from site qualifying incidents
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const metrics: RedZoneDailyMetric[] = [];

    for (let dayOffset = 20; dayOffset >= 0; dayOffset--) {
      const d = new Date(now - dayOffset * DAY_MS);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + DAY_MS;

      const dayIncidents = incidents.filter(i => {
        const t = i.createdTime || (i.createdDate ? new Date(i.createdDate).getTime() : 0);
        return t >= dayStart && t < dayEnd;
      });

      const sev1OnDay = dayIncidents.filter(i => i.severity === 'sev1').length;
      const sev2OnDay = dayIncidents.filter(i => i.severity === 'sev2').length;
      const resolvedOnDay = incidents.filter(i => {
        const eStr = i.endTime || i.closedDate;
        if (!eStr) return false;
        const eTime = new Date(eStr).getTime();
        return eTime >= dayStart && eTime < dayEnd;
      }).length;
      const downtimeOnDay =
        Math.round(
          dayIncidents.reduce((acc, curr) => acc + (curr.durationHours || 0), 0) * 10
        ) / 10;

      metrics.push({
        date: dateStr,
        dayLabel,
        sev1Count: sev1OnDay,
        sev2Count: sev2OnDay,
        totalIncidents: dayIncidents.length,
        resolvedCount: resolvedOnDay,
        downtimeHours: downtimeOnDay,
      });
    }
    return metrics;
  }, [currentSite]);

  // Chart coordinates & multi-series metrics
  const chartW = 1000;
  const chartH = 160;
  const padL = 48;
  const padR = 48;
  const padT = 20;
  const baseH = 125;
  const usableW = chartW - padL - padR;
  const usableH = baseH - padT;

  const maxChartIncident = useMemo(() => {
    const maxVal = Math.max(
      0,
      ...siteDailyMetrics.map(m => Math.max(m.totalIncidents, m.sev1Count, m.sev2Count, m.resolvedCount))
    );
    return Math.max(2, maxVal);
  }, [siteDailyMetrics]);

  const maxChartDowntime = useMemo(() => {
    const maxDt = Math.max(0, ...siteDailyMetrics.map(m => m.downtimeHours || 0));
    return Math.max(4, Math.ceil(maxDt));
  }, [siteDailyMetrics]);

  const chartYSteps = useMemo(() => {
    return [0, 1, 2, 3].map(step => {
      const ratio = step / 3;
      const y = baseH - ratio * usableH;
      const val = Math.round(ratio * maxChartIncident);
      const dtVal = Math.round(ratio * maxChartDowntime * 10) / 10;
      return { y, val, dtVal };
    });
  }, [maxChartIncident, maxChartDowntime, baseH, usableH]);

  const { totalPoints, sev1Points, sev2Points, resolvedPoints, dayCoords, downtimeBars } = useMemo(() => {
    if (siteDailyMetrics.length === 0) {
      return { totalPoints: [], sev1Points: [], sev2Points: [], resolvedPoints: [], dayCoords: [], downtimeBars: [] };
    }
    const tPts: Array<{ x: number; y: number }> = [];
    const s1Pts: Array<{ x: number; y: number }> = [];
    const s2Pts: Array<{ x: number; y: number }> = [];
    const resPts: Array<{ x: number; y: number }> = [];
    const coords: Array<{ x: number; metric: RedZoneDailyMetric }> = [];
    const bars: Array<{ x: number; y: number; width: number; height: number; hours: number; metric: RedZoneDailyMetric }> = [];

    const barW = Math.max(10, (usableW / siteDailyMetrics.length) * 0.45);

    siteDailyMetrics.forEach((m, idx) => {
      const x = padL + (idx / Math.max(1, siteDailyMetrics.length - 1)) * usableW;
      const yTotal = baseH - (m.totalIncidents / maxChartIncident) * usableH;
      const ySev1 = baseH - (m.sev1Count / maxChartIncident) * usableH;
      const ySev2 = baseH - (m.sev2Count / maxChartIncident) * usableH;
      const yResolved = baseH - (m.resolvedCount / maxChartIncident) * usableH;

      tPts.push({ x, y: yTotal });
      s1Pts.push({ x, y: ySev1 });
      s2Pts.push({ x, y: ySev2 });
      resPts.push({ x, y: yResolved });
      coords.push({ x, metric: m });

      if (m.downtimeHours > 0) {
        const barH = (m.downtimeHours / maxChartDowntime) * (usableH * 0.9);
        bars.push({
          x: x - barW / 2,
          y: baseH - barH,
          width: barW,
          height: barH,
          hours: m.downtimeHours,
          metric: m,
        });
      }
    });

    return { totalPoints: tPts, sev1Points: s1Pts, sev2Points: s2Pts, resolvedPoints: resPts, dayCoords: coords, downtimeBars: bars };
  }, [siteDailyMetrics, maxChartIncident, maxChartDowntime, baseH, usableH, usableW]);

  const totalLinePath = useMemo(() => createSmoothPath(totalPoints), [totalPoints]);
  const totalAreaPath = useMemo(() => createSmoothAreaPath(totalPoints, baseH), [totalPoints, baseH]);
  const sev1LinePath = useMemo(() => createSmoothPath(sev1Points), [sev1Points]);
  const sev2LinePath = useMemo(() => createSmoothPath(sev2Points), [sev2Points]);
  const resolvedLinePath = useMemo(() => createSmoothPath(resolvedPoints), [resolvedPoints]);

  // Rich management insights calculations
  const managementInsights = useMemo(() => {
    if (!currentSite) return null;
    const incidents = currentSite.qualifyingIncidents || [];
    const totalDowntimeHours =
      Math.round(
        incidents.reduce((acc, curr) => acc + (curr.durationHours || 0), 0) * 10
      ) / 10;

    let longestOutageIncident: RedZoneQualifyingIncident | null = null;
    let maxDuration = 0;
    for (const inc of incidents) {
      if (typeof inc.durationHours === 'number' && inc.durationHours > maxDuration) {
        maxDuration = inc.durationHours;
        longestOutageIncident = inc;
      }
    }

    // Availability estimate over 336 operating hours
    const operationalAvailabilityPct = Math.max(
      85,
      Math.min(99.9, Math.round(((336 - totalDowntimeHours) / 336) * 1000) / 10)
    );

    // Subsystem categorization
    const catCounts = {
      'Robotics & Hardware': 0,
      'Software & Database': 0,
      'Workflow & Picking': 0,
      'System Outage': 0,
    };
    for (const inc of incidents) {
      const cat = categorizeSubsystem(inc.subject, inc.description);
      catCounts[cat]++;
    }

    const dominantCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Operational Support';

    // MTBF target deficit
    const mtbf = currentSite.criteria3.mtbfHours;
    const mtbfDeficitPct = mtbf && mtbf < 36 ? Math.round(((36 - mtbf) / 36) * 100) : 0;

    // Failure velocity (average hours between failures)
    const failureCount = currentSite.criteria3.incidentCount14d || incidents.length || 1;
    const failureCadenceHours = Math.round(336 / Math.max(1, failureCount));

    return {
      totalDowntimeHours,
      longestOutageIncident,
      operationalAvailabilityPct,
      catCounts,
      dominantCategory,
      mtbfDeficitPct,
      failureCadenceHours,
    };
  }, [currentSite]);

  // Filter qualifying incidents for table
  const filteredIncidents = useMemo(() => {
    if (!currentSite) return [];
    let list = currentSite.qualifyingIncidents || [];

    if (ticketFilter === 'sev1') {
      list = list.filter(i => i.severity === 'sev1');
    } else if (ticketFilter === 'sev2') {
      list = list.filter(i => i.severity === 'sev2');
    } else if (ticketFilter === 'down') {
      list = list.filter(i => Boolean(i.isSiteDown));
    } else if (ticketFilter === 'active') {
      list = list.filter(
        i =>
          !i.status?.toLowerCase().includes('closed') &&
          !i.status?.toLowerCase().includes('resolved') &&
          !i.closedDate &&
          !i.endTime
      );
    }

    if (ticketSearch.trim()) {
      const q = ticketSearch.toLowerCase().trim();
      list = list.filter(
        i =>
          i.caseNumber.toLowerCase().includes(q) ||
          i.subject.toLowerCase().includes(q) ||
          (i.description && i.description.toLowerCase().includes(q))
      );
    }

    return list;
  }, [currentSite, ticketFilter, ticketSearch]);

  const allSiteIncidents = currentSite?.qualifyingIncidents || [];
  const sev1Count = allSiteIncidents.filter(i => i.severity === 'sev1').length;
  const sev2Count = allSiteIncidents.filter(i => i.severity === 'sev2').length;
  const downCount = allSiteIncidents.filter(i => Boolean(i.isSiteDown)).length;
  const activeCount = allSiteIncidents.filter(
    i =>
      !i.status?.toLowerCase().includes('closed') &&
      !i.status?.toLowerCase().includes('resolved') &&
      !i.closedDate &&
      !i.endTime
  ).length;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Dedicated Site Operational Reliability Page View
  // ─────────────────────────────────────────────────────────────────────────────
  if (currentSite) {
    const isBreach = currentSite.status === 'ACTIVE_BREACH';

    return (
      <DashboardShell>
        <div className="page-wrap">
          <div className="detail-wrap">
            {/* Top Back Link matching Sitepulse style */}
            <button
              type="button"
              onClick={() => selectSite(null)}
              className="back-link"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
              Back to RED zone sites
            </button>

            {/* Page Heading matching site page */}
            <div className="page-heading">
              <div>
                <div className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span style={{ background: isBreach ? '#ef4444' : '#f59e0b' }} />
                  OPERATIONAL RELIABILITY AUDIT &amp; INCIDENT ROOT CAUSE
                </div>
                <h1
                  style={{
                    fontSize: 40,
                    fontWeight: 700,
                    letterSpacing: '-0.025em',
                    margin: '12px 0 8px',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {currentSite.siteName}
                  <span className="heading-dot" style={{ color: isBreach ? '#ef4444' : '#f59e0b' }}>
                    .
                  </span>
                </h1>
                <div
                  className="detail-subtitle"
                  style={{ flexWrap: 'wrap', gap: 10, fontSize: 12.5, fontFamily: 'var(--font-sans)' }}
                >
                  <span
                    className={`rz-badge-pill ${isBreach ? 'rz-badge-breach' : 'rz-badge-cooling'}`}
                    style={{ fontSize: 9.5, padding: '3px 8px' }}
                  >
                    {isBreach ? (
                      <>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: '#ef4444',
                            boxShadow: '0 0 6px #ef4444',
                          }}
                        />
                        ACTIVE CRITERIA BREACH
                      </>
                    ) : (
                      <>
                        <Clock style={{ width: 11, height: 11 }} />
                        {currentSite.daysRemainingToExit}d TO EXIT PROBATION
                      </>
                    )}
                  </span>

                  {currentSite.location && (
                    <>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted-foreground)' }}>
                        <MapPin style={{ width: 13, height: 13 }} />
                        {currentSite.location}
                      </span>
                      <span style={{ color: 'var(--border)' }}>•</span>
                    </>
                  )}

                  <span style={{ color: isBreach ? '#ef4444' : '#f59e0b', fontWeight: 500 }}>
                    {currentSite.reasons[0] || 'Reliability Threshold Breached'}
                  </span>
                </div>
              </div>

              {/* Action Buttons on Top Right */}
              <div className="detail-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Button
                  variant="outline"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    height: 38,
                    fontSize: 12,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <RefreshCw className={isFetching ? 'animate-spin' : ''} style={{ width: 14, height: 14 }} />
                  <span>{isFetching ? 'Refreshing…' : 'Refresh Telemetry'}</span>
                </Button>

                <Button
                  asChild
                  variant="default"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    height: 38,
                    fontSize: 12,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <Link to="/sites/$siteId" params={{ siteId: currentSite.targetSiteId }}>
                    <span>Open Site Workspace</span>
                    <ArrowUpRight style={{ width: 14, height: 14 }} />
                  </Link>
                </Button>
              </div>
            </div>

            {/* 4-Pillar Detail Summary Ribbon */}
            <div className="detail-summary" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div>
                <Flame
                  style={{
                    color: currentSite.criteria1.sev1Count7d >= 3 ? '#ef4444' : 'var(--muted-foreground)',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 9.5, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    7-Day Sev-1 Incidents
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>
                    Threshold: 3 incidents
                  </span>
                </div>
                <strong
                  style={{
                    color: currentSite.criteria1.sev1Count7d >= 3 ? '#ef4444' : 'var(--foreground)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 16,
                  }}
                >
                  {currentSite.criteria1.sev1Count7d}{' '}
                  {currentSite.criteria1.sev1Count7d >= 3 ? '(BREACH)' : '(OK)'}
                </strong>
              </div>

              <div>
                <AlertTriangle
                  style={{
                    color: currentSite.criteria1.sev2Count7d >= 5 ? '#f59e0b' : 'var(--muted-foreground)',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 9.5, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    7-Day Sev-2 Incidents
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>
                    Threshold: 5 incidents
                  </span>
                </div>
                <strong
                  style={{
                    color: currentSite.criteria1.sev2Count7d >= 5 ? '#f59e0b' : 'var(--foreground)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 16,
                  }}
                >
                  {currentSite.criteria1.sev2Count7d}{' '}
                  {currentSite.criteria1.sev2Count7d >= 5 ? '(BREACH)' : '(OK)'}
                </strong>
              </div>

              <div>
                <Clock
                  style={{
                    color: currentSite.criteria3.met ? '#ef4444' : 'var(--muted-foreground)',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 9.5, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    14-Day Site MTBF
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>
                    Target: &ge; 36.0 hours
                  </span>
                </div>
                <strong
                  style={{
                    color: currentSite.criteria3.met ? '#ef4444' : 'var(--foreground)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 16,
                  }}
                >
                  {currentSite.criteria3.mtbfHours !== null ? `${currentSite.criteria3.mtbfHours}h` : 'Healthy'}
                </strong>
              </div>

              <div>
                <Timer style={{ color: 'var(--blue)' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 9.5, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    Mean Resolution (MTTR)
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>
                    Average closing time
                  </span>
                </div>
                <strong style={{ color: 'var(--foreground)', fontFamily: 'var(--font-mono)', fontSize: 16 }}>
                  {currentSite.meanTimeToResolveHours !== null &&
                  currentSite.meanTimeToResolveHours !== undefined
                    ? `${currentSite.meanTimeToResolveHours}h`
                    : 'Active'}
                </strong>
              </div>
            </div>

            {/* ─── Executive Intelligence & Management Insights Grid ─── */}
            <div className="rz-insights-grid">
              {/* Card 1: Failure Cadence & Recurrence Velocity */}
              <div className={`rz-insight-card ${isBreach ? 'alert-breach' : 'cooling-probation'}`}>
                <div className="rz-insight-card-header">
                  <span className="rz-insight-title">
                    <Activity style={{ width: 13, height: 13, color: isBreach ? '#ef4444' : '#f59e0b' }} />
                    Failure Cadence &amp; Pace
                  </span>
                  <span
                    className="rz-insight-metric-tag"
                    style={{
                      background: isBreach ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: isBreach ? '#ef4444' : '#f59e0b',
                      border: `1px solid ${isBreach ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                    }}
                  >
                    {managementInsights?.mtbfDeficitPct ? `-${managementInsights.mtbfDeficitPct}% Deficit` : 'Within Target'}
                  </span>
                </div>
                <div>
                  <div className="rz-insight-kpi">
                    1 failure / {managementInsights?.failureCadenceHours || 36}h
                  </div>
                  <p className="rz-insight-sub" style={{ marginTop: 6 }}>
                    Operating interval pace across {currentSite.criteria3.incidentCount14d} failure incidents in the last 14 days. MTBF benchmark target is &ge; 36.0h.
                  </p>
                </div>
              </div>

              {/* Card 2: Cumulative Downtime & Availability Loss */}
              <div className="rz-insight-card">
                <div className="rz-insight-card-header">
                  <span className="rz-insight-title">
                    <Timer style={{ width: 13, height: 13, color: 'var(--blue)' }} />
                    Cumulative Downtime
                  </span>
                  <span
                    className="rz-insight-metric-tag"
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                    }}
                  >
                    {managementInsights?.operationalAvailabilityPct}% Availability
                  </span>
                </div>
                <div>
                  <div className="rz-insight-kpi">
                    {managementInsights?.totalDowntimeHours || 0} hrs
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted-foreground)' }}>
                      total outage
                    </span>
                  </div>
                  <p className="rz-insight-sub" style={{ marginTop: 6 }}>
                    {managementInsights?.longestOutageIncident ? (
                      <>
                        Peak single downtime: <strong style={{ color: 'var(--foreground)' }}>{managementInsights.longestOutageIncident.durationHours}h</strong> on Case #{managementInsights.longestOutageIncident.caseNumber}.
                      </>
                    ) : (
                      'No significant extended outages recorded during this cycle.'
                    )}
                  </p>
                </div>
              </div>

              {/* Card 3: Subsystem Domain Breakdown */}
              <div className="rz-insight-card">
                <div className="rz-insight-card-header">
                  <span className="rz-insight-title">
                    <Layers style={{ width: 13, height: 13, color: 'var(--foreground)' }} />
                    Subsystem Impact Area
                  </span>
                  <span
                    className="rz-insight-metric-tag"
                    style={{
                      background: 'var(--secondary)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Primary: {managementInsights?.dominantCategory || 'Fleet'}
                  </span>
                </div>
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Cpu style={{ width: 12, height: 12, color: 'var(--blue)' }} />
                        Robotics &amp; Fleet:
                      </span>
                      <strong>{managementInsights?.catCounts['Robotics & Hardware'] || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Server style={{ width: 12, height: 12, color: '#a855f7' }} />
                        Software &amp; DB:
                      </span>
                      <strong>{managementInsights?.catCounts['Software & Database'] || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle style={{ width: 12, height: 12, color: '#ef4444' }} />
                        System Outage:
                      </span>
                      <strong style={{ color: (managementInsights?.catCounts['System Outage'] || 0) > 0 ? '#ef4444' : undefined }}>
                        {managementInsights?.catCounts['System Outage'] || 0}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 4: Management Exit Trajectory & Action Plan */}
              <div className="rz-insight-card">
                <div className="rz-insight-card-header">
                  <span className="rz-insight-title">
                    <CheckCircle2 style={{ width: 13, height: 13, color: '#22c55e' }} />
                    21-Day Exit Trajectory
                  </span>
                  <span
                    className="rz-insight-metric-tag"
                    style={{
                      background: 'rgba(34, 197, 94, 0.12)',
                      color: '#22c55e',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  >
                    {currentSite.daysRemainingToExit}d Remaining
                  </span>
                </div>
                <div>
                  <div className="rz-insight-kpi">
                    {currentSite.daysSinceBreach} / 21d
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted-foreground)' }}>
                      clean streak
                    </span>
                  </div>
                  <p className="rz-insight-sub" style={{ marginTop: 6 }}>
                    {isBreach
                      ? 'Action Required: Active breach detected. Complete on-site diagnostics and resolve active tickets.'
                      : `Cooling Phase: Maintain zero Sev-1 and < 5 Sev-2 incidents for ${currentSite.daysRemainingToExit} more consecutive days to automatically exit.`}
                  </p>
                </div>
              </div>
            </div>

            {/* ─── Panel 1: Dual-Mode Telemetry & Ticket Lifespan Visualization ─── */}
            <section className="data-panel" style={{ marginBottom: 28 }}>
              <div className="data-panel-heading">
                <div className="provider-symbol salesforce-symbol" style={{ background: 'oklch(0.66 0.22 34 / 0.15)', color: '#ef4444' }}>
                  {chartMode === 'timeline' ? <Clock style={{ color: '#ef4444' }} /> : <TrendingUp style={{ color: '#ef4444' }} />}
                </div>
                <div>
                  <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                    {chartMode === 'timeline' ? 'AUDITED INCIDENT LIFECYCLES' : '21-DAY INCIDENT FREQUENCY & TELEMETRY'}
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 18, fontWeight: 600 }}>
                    {chartMode === 'timeline'
                      ? 'Ticket Lifespan, Arrival & Closing Times'
                      : '21-Day Red Zone Incident Trend & Downtime Volume'}
                  </h2>
                </div>

                {/* Mode Switcher Tabs */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 4, background: 'var(--secondary)', padding: 3, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      className={`rz-pill-tab ${chartMode === 'timeline' ? 'active' : ''}`}
                      onClick={() => setChartMode('timeline')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      <Clock style={{ width: 11, height: 11 }} />
                      Ticket Lifespan
                    </button>
                    <button
                      type="button"
                      className={`rz-pill-tab ${chartMode === 'trend' ? 'active' : ''}`}
                      onClick={() => setChartMode('trend')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      <TrendingUp style={{ width: 11, height: 11 }} />
                      21-Day Trend
                    </button>
                  </div>

                  {chartMode === 'trend' && hoveredDayIdx !== null && siteDailyMetrics[hoveredDayIdx] && (
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--foreground)',
                        background: 'var(--secondary)',
                        padding: '4px 11px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <strong>{siteDailyMetrics[hoveredDayIdx].dayLabel}</strong>
                      <span>•</span>
                      <span style={{ color: '#ef4444' }}>
                        {siteDailyMetrics[hoveredDayIdx].sev1Count} Sev-1
                      </span>
                      <span>•</span>
                      <span style={{ color: '#f59e0b' }}>
                        {siteDailyMetrics[hoveredDayIdx].sev2Count} Sev-2
                      </span>
                      <span>•</span>
                      <span style={{ color: '#10b981' }}>{siteDailyMetrics[hoveredDayIdx].resolvedCount} Resolved</span>
                      <span>•</span>
                      <span style={{ color: '#a855f7' }}>{siteDailyMetrics[hoveredDayIdx].downtimeHours}h Outage</span>
                    </div>
                  )}

                  <span className="live-badge" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span className="live-pulse-dot" style={{ background: chartMode === 'timeline' ? '#22c55e' : '#ef4444' }} />
                    {chartMode === 'timeline' ? `${allSiteIncidents.length} Monitored Lifecycles` : '21-Day Red Zone Cycle'}
                  </span>
                </div>
              </div>

              {/* View 1: Ticket Lifespan & Timeline (When It Came, Outage Duration, Closing Time, Actions) */}
              {chartMode === 'timeline' ? (
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {allSiteIncidents.length > 0 ? (
                    allSiteIncidents.map(inc => {
                      const isExpanded = expandedTicketId === inc.id;
                      const isSev1 = inc.severity === 'sev1';
                      const isSev2 = inc.severity === 'sev2';
                      const isClosed =
                        inc.status?.toLowerCase().includes('closed') ||
                        inc.status?.toLowerCase().includes('resolved') ||
                        Boolean(inc.closedDate || inc.endTime);

                      return (
                        <div
                          key={`lifespan-${inc.id || inc.caseNumber}`}
                          style={{
                            background: 'var(--card)',
                            border: isExpanded ? '1px solid var(--foreground)' : '1px solid var(--border)',
                            borderRadius: 8,
                            padding: '14px 16px',
                            transition: 'border-color 0.15s ease, background 0.15s ease',
                          }}
                        >
                          {/* Top row: Ticket identity & Badges */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <a
                                href={`https://greyorangeorg.my.salesforce.com/${inc.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="case-number-tag"
                                title={`Open Case ${inc.caseNumber} in Salesforce`}
                                style={{ fontSize: 11, fontWeight: 700 }}
                              >
                                Case #{inc.caseNumber}
                                <ExternalLink style={{ width: 10, height: 10 }} />
                              </a>

                              {isSev1 ? (
                                <span
                                  className="case-priority-badge p-p1"
                                  style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #ef4444' }}
                                >
                                  <Flame style={{ width: 10, height: 10 }} />
                                  SEV 1
                                </span>
                              ) : isSev2 ? (
                                <span
                                  className="case-priority-badge p-p2"
                                  style={{ background: '#78350f', color: '#fcd34d', border: '1px solid #f59e0b' }}
                                >
                                  <AlertTriangle style={{ width: 10, height: 10 }} />
                                  SEV 2
                                </span>
                              ) : (
                                <span className="case-priority-badge p-p3">
                                  {inc.severity.toUpperCase()}
                                </span>
                              )}

                              {inc.isSiteDown && (
                                <span className="case-down-badge" style={{ fontSize: 9 }}>
                                  100% SITE DOWN
                                </span>
                              )}

                              {inc.productType && (
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    fontFamily: 'var(--font-mono)',
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    background: 'var(--secondary)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--muted-foreground)',
                                  }}
                                >
                                  {inc.productType}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {isClosed ? (
                                <span
                                  className="case-status-badge"
                                  style={{
                                    background: 'rgba(34, 197, 94, 0.12)',
                                    color: '#22c55e',
                                    borderColor: 'rgba(34, 197, 94, 0.35)',
                                  }}
                                >
                                  <CheckCircle2 style={{ width: 11, height: 11, marginRight: 4 }} />
                                  Resolved &amp; Closed
                                </span>
                              ) : (
                                <span
                                  className="case-status-badge status-new"
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    color: '#ef4444',
                                    borderColor: 'rgba(239, 68, 68, 0.4)',
                                  }}
                                >
                                  <span className="live-pulse-dot" style={{ marginRight: 4 }} />
                                  {inc.status || 'Active Outage'}
                                </span>
                              )}

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setExpandedTicketId(isExpanded ? null : inc.id)}
                                style={{ height: 26, padding: '0 8px', fontSize: 10.5, gap: 4, fontFamily: 'var(--font-sans)' }}
                              >
                                <span>{isExpanded ? 'Hide Narrative' : 'Actions & RCA'}</span>
                                {isExpanded ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
                              </Button>
                            </div>
                          </div>

                          {/* Subject */}
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12, fontFamily: 'var(--font-sans)' }}>
                            {inc.subject}
                          </div>

                          {/* The Visual Lifespan Journey Bar (When It Came -> Duration / Outage -> Closing Time) */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(180px, 1fr) auto minmax(180px, 1fr)',
                              alignItems: 'center',
                              gap: 12,
                              background: 'var(--secondary)',
                              padding: '10px 14px',
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                            }}
                          >
                            {/* Left: When It Came */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 9.5, textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Clock style={{ width: 10, height: 10, color: isSev1 ? '#ef4444' : '#f59e0b' }} />
                                When It Came (Arrival)
                              </span>
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
                                {formatTimestamp(inc.createdDate)}
                              </span>
                              <span style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                                {formatRelativeTime(inc.createdDate)}
                              </span>
                            </div>

                            {/* Center: Outage Span & Duration */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 160 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                  color: inc.durationHours && inc.durationHours > 2 ? '#ef4444' : 'var(--foreground)',
                                  background: 'var(--card)',
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  border: '1px solid var(--border)',
                                }}
                              >
                                <Timer style={{ width: 10, height: 10, display: 'inline', marginRight: 4, color: 'var(--blue)' }} />
                                {inc.durationHours !== null && inc.durationHours !== undefined
                                  ? `${inc.durationHours} hrs outage`
                                  : 'Ongoing Active Outage'}
                              </span>
                              {/* Visual connector line */}
                              <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isSev1 ? '#ef4444' : '#f59e0b' }} />
                                <div style={{ flex: 1, height: 2, background: isClosed ? 'var(--border)' : 'linear-gradient(90deg, #ef4444, #f59e0b)' }} />
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isClosed ? '#22c55e' : '#ef4444' }} />
                              </div>
                            </div>

                            {/* Right: Closing Time */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', textAlign: 'right' }}>
                              <span style={{ fontSize: 9.5, textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle2 style={{ width: 10, height: 10, color: isClosed ? '#22c55e' : 'var(--muted-foreground)' }} />
                                Closing Time
                              </span>
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: isClosed ? 'var(--foreground)' : '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                                {inc.closedDate || inc.endTime ? formatTimestamp(inc.closedDate || inc.endTime) : 'Still Active / In Progress'}
                              </span>
                              <span style={{ fontSize: 9.5, color: isClosed ? '#22c55e' : '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                                {isClosed ? 'Resolved & Restored' : 'Resolution Pending'}
                              </span>
                            </div>
                          </div>

                          {/* Inline Expanded Actions & RCA */}
                          {isExpanded && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                  color: 'var(--muted-foreground)',
                                  fontFamily: 'var(--font-mono)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                <FileText style={{ width: 11, height: 11 }} />
                                Actions Taken &amp; Narrative Root Cause (Salesforce)
                              </span>
                              <div className="rz-desc-box">
                                {inc.description || 'No detailed actions or narrative notes entered in Salesforce for this ticket.'}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                      No qualifying incidents recorded for this site.
                    </div>
                  )}
                </div>
              ) : (
                /* View 2: Multi-Series 21-Day Incident Trend & Downtime Volume Graph */
                <div style={{ padding: '18px 24px 12px' }}>
                  <div style={{ width: '100%', height: chartH, position: 'relative' }}>
                    <svg
                      width="100%"
                      height="100%"
                      viewBox={`0 0 ${chartW} ${chartH}`}
                      preserveAspectRatio="none"
                      onMouseMove={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const relX = (e.clientX - rect.left) / rect.width;
                        const idx = Math.min(
                          siteDailyMetrics.length - 1,
                          Math.max(0, Math.round(relX * (siteDailyMetrics.length - 1)))
                        );
                        setHoveredDayIdx(idx);
                      }}
                      onMouseLeave={() => setHoveredDayIdx(null)}
                      style={{ overflow: 'visible', cursor: 'crosshair', display: 'block' }}
                    >
                      <defs>
                        <linearGradient id="rzSiteSev1Grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
                          <stop offset="90%" stopColor="#ef4444" stopOpacity="0.02" />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Grid with Dual Y-Axis Labels */}
                      {chartYSteps.map((step, idx) => (
                        <g key={idx}>
                          <line
                            x1={padL}
                            y1={step.y}
                            x2={chartW - padR}
                            y2={step.y}
                            stroke="var(--border)"
                            strokeDasharray="3 3"
                            strokeWidth="1"
                            opacity={step.val === 0 ? 0.9 : 0.45}
                          />
                          {/* Left Y-axis label: Incident count */}
                          <text
                            x={padL - 10}
                            y={step.y + 3.5}
                            textAnchor="end"
                            fill="var(--muted-foreground)"
                            fontSize="9.5"
                            fontFamily="var(--font-mono)"
                          >
                            {step.val}
                          </text>
                          {/* Right Y-axis label: Outage Downtime hours */}
                          <text
                            x={chartW - padR + 10}
                            y={step.y + 3.5}
                            textAnchor="start"
                            fill="#a855f7"
                            fontSize="9"
                            fontFamily="var(--font-mono)"
                          >
                            {step.dtVal}h
                          </text>
                        </g>
                      ))}

                      {/* Vertical Day Lines & X-Axis Labels */}
                      {dayCoords.map((c, idx) => {
                        const showLabel = idx % 2 === 0 || idx === dayCoords.length - 1 || hoveredDayIdx === idx;
                        return (
                          <g key={idx}>
                            <line
                              x1={c.x}
                              y1={padT}
                              x2={c.x}
                              y2={baseH}
                              stroke="var(--border)"
                              strokeDasharray="2 3"
                              strokeWidth="1"
                              opacity={hoveredDayIdx === idx ? 0.8 : 0.25}
                            />
                            {showLabel && (
                              <text
                                x={c.x}
                                y={baseH + 16}
                                textAnchor="middle"
                                fill={hoveredDayIdx === idx ? 'var(--foreground)' : 'var(--muted-foreground)'}
                                fontSize="9"
                                fontFamily="var(--font-mono)"
                                fontWeight={hoveredDayIdx === idx ? 'bold' : 'normal'}
                              >
                                {c.metric.dayLabel}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Downtime Volume Bars */}
                      {downtimeBars.map((bar, idx) => (
                        <rect
                          key={`bar-${idx}`}
                          x={bar.x}
                          y={bar.y}
                          width={bar.width}
                          height={bar.height}
                          rx={3}
                          fill="rgba(168, 85, 247, 0.28)"
                          stroke="#a855f7"
                          strokeWidth="1"
                          opacity={hoveredDayIdx !== null && dayCoords[hoveredDayIdx]?.x === bar.x + bar.width / 2 ? 1 : 0.8}
                        />
                      ))}

                      {/* Sev-1 Area Gradient */}
                      {sev1LinePath && <path d={createSmoothAreaPath(sev1Points, baseH)} fill="url(#rzSiteSev1Grad)" />}

                      {/* Resolved Incidents Curve (Emerald) */}
                      {resolvedLinePath && (
                        <path
                          d={resolvedLinePath}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="2.0"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity="0.85"
                        />
                      )}

                      {/* Sev-2 Incidents Curve (Amber Dashed) */}
                      {sev2LinePath && (
                        <path
                          d={sev2LinePath}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="2.2"
                          strokeDasharray="4 2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}

                      {/* Sev-1 Incidents Curve (Crimson Solid) */}
                      {sev1LinePath && (
                        <path
                          d={sev1LinePath}
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}

                      {/* Data Point Markers on Lines */}
                      {dayCoords.map((c, idx) => {
                        const m = c.metric;
                        const ySev1 = baseH - (m.sev1Count / maxChartIncident) * usableH;
                        const ySev2 = baseH - (m.sev2Count / maxChartIncident) * usableH;
                        const yRes = baseH - (m.resolvedCount / maxChartIncident) * usableH;

                        return (
                          <g key={`markers-${idx}`}>
                            {m.resolvedCount > 0 && (
                              <circle
                                cx={c.x}
                                cy={yRes}
                                r={hoveredDayIdx === idx ? 5 : 3.5}
                                fill="#10b981"
                                stroke="var(--card)"
                                strokeWidth="1.5"
                              />
                            )}
                            {m.sev2Count > 0 && (
                              <circle
                                cx={c.x}
                                cy={ySev2}
                                r={hoveredDayIdx === idx ? 5.5 : 3.5}
                                fill="#f59e0b"
                                stroke="var(--card)"
                                strokeWidth="1.5"
                              />
                            )}
                            {m.sev1Count > 0 && (
                              <g>
                                <circle
                                  cx={c.x}
                                  cy={ySev1}
                                  r={hoveredDayIdx === idx ? 6 : 4}
                                  fill="#ef4444"
                                  stroke="var(--card)"
                                  strokeWidth="2"
                                />
                                <circle
                                  cx={c.x}
                                  cy={ySev1}
                                  r={8.5}
                                  fill="none"
                                  stroke="#ef4444"
                                  strokeWidth="1.2"
                                  strokeDasharray="2 2"
                                  opacity="0.85"
                                />
                              </g>
                            )}
                          </g>
                        );
                      })}

                      {/* Crosshair on Hover */}
                      {hoveredDayIdx !== null && dayCoords[hoveredDayIdx] && (
                        <line
                          x1={dayCoords[hoveredDayIdx].x}
                          y1={padT}
                          x2={dayCoords[hoveredDayIdx].x}
                          y2={baseH}
                          stroke="var(--foreground)"
                          strokeWidth="1.2"
                          strokeDasharray="3 3"
                          opacity="0.8"
                        />
                      )}
                    </svg>
                  </div>

                  {/* Multi-Metric Legend with Left & Right Axis Keys */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--muted-foreground)',
                      padding: '12px 0 6px',
                      flexWrap: 'wrap',
                      borderTop: '1px solid var(--border)',
                      marginTop: 14,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                        Sev-1 Incidents (&ge; 3 enters Red Zone)
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                        Sev-2 Incidents (&ge; 5 enters Red Zone)
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                        Resolved Cases
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 10, height: 8, borderRadius: 2, background: 'rgba(168, 85, 247, 0.4)', border: '1px solid #a855f7' }} />
                        Outage Downtime Bars (Right Axis)
                      </span>
                    </div>

                    <span style={{ fontSize: 9.5, color: 'var(--muted-foreground)' }}>
                      Left Axis = Incident Counts • Right Axis = Outage Hours
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* ─── Panel 2: Qualifying Salesforce Incidents Table ─── */}
            <section className="data-panel">
              <div className="data-panel-heading">
                <div className="provider-symbol salesforce-symbol" style={{ background: 'var(--blue-surface)', color: 'var(--blue)' }}>
                  <Cloud />
                </div>
                <div>
                  <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                    SALESFORCE INCIDENT AUDIT TRAIL
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 18, fontWeight: 600 }}>
                    Qualifying incident tickets causing Red Zone ({filteredIncidents.length})
                  </h2>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="live-badge" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span className="live-pulse-dot" style={{ background: '#22c55e' }} />
                    Audited Salesforce Records
                  </span>
                </div>
              </div>

              {/* Table Toolbar */}
              <div className="data-panel-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: 4, background: 'var(--secondary)', padding: 3, borderRadius: 6, border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    className={`rz-pill-tab ${ticketFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setTicketFilter('all')}
                  >
                    All ({allSiteIncidents.length})
                  </button>
                  <button
                    type="button"
                    className={`rz-pill-tab ${ticketFilter === 'sev1' ? 'active' : ''}`}
                    onClick={() => setTicketFilter('sev1')}
                    style={{ color: ticketFilter === 'sev1' ? '#ef4444' : undefined }}
                  >
                    Sev-1 ({sev1Count})
                  </button>
                  <button
                    type="button"
                    className={`rz-pill-tab ${ticketFilter === 'sev2' ? 'active' : ''}`}
                    onClick={() => setTicketFilter('sev2')}
                    style={{ color: ticketFilter === 'sev2' ? '#f59e0b' : undefined }}
                  >
                    Sev-2 ({sev2Count})
                  </button>
                  {downCount > 0 && (
                    <button
                      type="button"
                      className={`rz-pill-tab ${ticketFilter === 'down' ? 'active' : ''}`}
                      onClick={() => setTicketFilter('down')}
                    >
                      Site Down ({downCount})
                    </button>
                  )}
                  {activeCount > 0 && (
                    <button
                      type="button"
                      className={`rz-pill-tab ${ticketFilter === 'active' ? 'active' : ''}`}
                      onClick={() => setTicketFilter('active')}
                    >
                      Active / Open ({activeCount})
                    </button>
                  )}
                </div>

                {/* Instant Search */}
                <div style={{ position: 'relative', width: 240 }}>
                  <Search
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 13,
                      height: 13,
                      color: 'var(--muted-foreground)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Search incident number, subject, actions…"
                    value={ticketSearch}
                    onChange={e => setTicketSearch(e.target.value)}
                    style={{
                      width: '100%',
                      height: 32,
                      fontSize: 11.5,
                      fontFamily: 'var(--font-sans)',
                      paddingLeft: 30,
                      paddingRight: 10,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--foreground)',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Table Rows */}
              <div style={{ overflowX: 'auto' }}>
                <div className="rz-panel-table-head">
                  <span>Case #</span>
                  <span>Severity</span>
                  <span>Status</span>
                  <span>When It Came</span>
                  <span>Closing Time</span>
                  <span>Duration</span>
                  <span>Subject &amp; Root Cause</span>
                  <span>Actions</span>
                </div>

                {filteredIncidents.length > 0 ? (
                  filteredIncidents.map(inc => {
                    const isExpanded = expandedTicketId === inc.id;
                    const isSev1 = inc.severity === 'sev1';
                    const isSev2 = inc.severity === 'sev2';
                    const isClosed =
                      inc.status?.toLowerCase().includes('closed') ||
                      inc.status?.toLowerCase().includes('resolved') ||
                      Boolean(inc.closedDate || inc.endTime);

                    return (
                      <div key={inc.id || inc.caseNumber}>
                        <div
                          className={`rz-panel-table-row ${isExpanded ? 'row-expanded' : ''}`}
                          onClick={() => setExpandedTicketId(isExpanded ? null : inc.id)}
                          title="Click to expand full incident actions, RCA narrative, and timestamps"
                        >
                          {/* Case # (Salesforce Link) */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <a
                              href={`https://greyorangeorg.my.salesforce.com/${inc.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="case-number-tag"
                              title={`Open Case ${inc.caseNumber} in Salesforce`}
                              onClick={e => e.stopPropagation()}
                            >
                              {inc.caseNumber}
                              <ExternalLink style={{ width: 10, height: 10 }} />
                            </a>
                            {inc.isSiteDown && (
                              <span className="case-down-badge" style={{ fontSize: 8 }}>
                                DOWN
                              </span>
                            )}
                          </div>

                          {/* Severity Badge */}
                          <div>
                            {isSev1 ? (
                              <span
                                className="case-priority-badge p-p1"
                                style={{
                                  background: '#7f1d1d',
                                  color: '#fca5a5',
                                  border: '1px solid #ef4444',
                                }}
                              >
                                <Flame style={{ width: 10, height: 10 }} />
                                SEV 1
                              </span>
                            ) : isSev2 ? (
                              <span
                                className="case-priority-badge p-p2"
                                style={{
                                  background: '#78350f',
                                  color: '#fcd34d',
                                  border: '1px solid #f59e0b',
                                }}
                              >
                                <AlertTriangle style={{ width: 10, height: 10 }} />
                                SEV 2
                              </span>
                            ) : (
                              <span className="case-priority-badge p-p3">
                                {inc.severity.toUpperCase()}
                              </span>
                            )}
                          </div>

                          {/* Status Badge */}
                          <div>
                            {isClosed ? (
                              <span
                                className="case-status-badge"
                                style={{
                                  background: 'rgba(34, 197, 94, 0.15)',
                                  color: '#22c55e',
                                  borderColor: 'rgba(34, 197, 94, 0.4)',
                                }}
                              >
                                <CheckCircle2 style={{ width: 10, height: 10, marginRight: 4 }} />
                                Closed
                              </span>
                            ) : (
                              <span
                                className="case-status-badge status-new"
                                style={{
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#ef4444',
                                  borderColor: 'rgba(239, 68, 68, 0.4)',
                                }}
                              >
                                <span className="live-pulse-dot" style={{ marginRight: 4 }} />
                                {inc.status || 'Active'}
                              </span>
                            )}
                          </div>

                          {/* When It Came */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontWeight: 600, color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
                              {formatTimestamp(inc.createdDate)}
                            </span>
                            <span style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                              {formatRelativeTime(inc.createdDate)}
                            </span>
                          </div>

                          {/* Closing Time */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {inc.closedDate || inc.endTime ? (
                              <>
                                <span style={{ fontWeight: 600, color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
                                  {formatTimestamp(inc.closedDate || inc.endTime)}
                                </span>
                                <span style={{ fontSize: 9.5, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                                  Resolved
                                </span>
                              </>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color: '#f59e0b',
                                  fontSize: 9.5,
                                  fontWeight: 600,
                                  fontFamily: 'var(--font-mono)',
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  padding: '2px 7px',
                                  borderRadius: 4,
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  width: 'fit-content',
                                }}
                              >
                                <Clock style={{ width: 10, height: 10 }} />
                                ACTIVE / OPEN
                              </span>
                            )}
                          </div>

                          {/* Duration / Downtime */}
                          <div>
                            {inc.durationHours !== null && inc.durationHours !== undefined ? (
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 600,
                                  color: inc.durationHours > 2 ? '#ef4444' : 'var(--foreground)',
                                }}
                              >
                                {inc.durationHours} hrs
                              </span>
                            ) : (
                              <span style={{ color: 'var(--muted-foreground)', fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
                                Ongoing
                              </span>
                            )}
                          </div>

                          {/* Subject & Description Snippet */}
                          <div style={{ minWidth: 0, paddingRight: 8 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: 'var(--foreground)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontFamily: 'var(--font-sans)',
                              }}
                              title={inc.subject}
                            >
                              {inc.subject}
                            </div>
                            {inc.description && (
                              <div
                                style={{
                                  fontSize: 10.5,
                                  color: 'var(--muted-foreground)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  marginTop: 2,
                                  fontFamily: 'var(--font-sans)',
                                }}
                              >
                                {inc.description}
                              </div>
                            )}
                          </div>

                          {/* Expand Toggle */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={e => {
                                e.stopPropagation();
                                setExpandedTicketId(isExpanded ? null : inc.id);
                              }}
                              style={{ height: 26, padding: '0 8px', fontSize: 10.5, gap: 4, fontFamily: 'var(--font-sans)' }}
                            >
                              <span>{isExpanded ? 'Hide' : 'Details'}</span>
                              {isExpanded ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
                            </Button>
                          </div>
                        </div>

                        {/* Inline Expandable Details Box */}
                        {isExpanded && (
                          <div className="rz-ticket-inline-details">
                            <div className="rz-detail-meta-grid">
                              <div className="rz-meta-item">
                                <span className="rz-meta-label">When It Came (Created)</span>
                                <span className="rz-meta-value">{formatTimestamp(inc.createdDate)}</span>
                              </div>
                              <div className="rz-meta-item">
                                <span className="rz-meta-label">Closing / End Time</span>
                                <span className="rz-meta-value">
                                  {inc.closedDate || inc.endTime ? formatTimestamp(inc.closedDate || inc.endTime) : 'Still Active / Ongoing'}
                                </span>
                              </div>
                              <div className="rz-meta-item">
                                <span className="rz-meta-label">Total Outage Downtime</span>
                                <span className="rz-meta-value">
                                  {inc.durationHours !== null && inc.durationHours !== undefined
                                    ? `${inc.durationHours} hours`
                                    : 'Ongoing Active Incident'}
                                </span>
                              </div>
                              <div className="rz-meta-item">
                                <span className="rz-meta-label">Site Status Impact</span>
                                <span className="rz-meta-value" style={{ color: inc.isSiteDown ? '#ef4444' : '#22c55e' }}>
                                  {inc.isSiteDown ? '100% Site Down' : 'Partial / Degraded Operations'}
                                </span>
                              </div>
                            </div>

                            {/* Full Actions, RCA & Narrative Box */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  color: 'var(--muted-foreground)',
                                  fontFamily: 'var(--font-mono)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                <FileText style={{ width: 12, height: 12 }} />
                                Full Incident Narrative, Actions &amp; Root Cause (Salesforce)
                              </span>
                              <div className="rz-desc-box">
                                {inc.description || 'No detailed narrative notes or actions recorded in Salesforce for this incident.'}
                              </div>
                            </div>

                            {/* Actions bar */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                              <a
                                href={`https://greyorangeorg.my.salesforce.com/${inc.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="case-number-tag"
                                style={{ height: 30, padding: '0 12px', fontSize: 11 }}
                              >
                                Open Ticket in Salesforce CRM
                                <ExternalLink style={{ width: 12, height: 12 }} />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
                    No qualifying incident tickets match your current filters.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </DashboardShell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: RED Zone Sites Main Directory (when no site is selected)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <DashboardShell>
      <div className="page-wrap">
        {/* Page Heading matching Sitepulse directory */}
        <div className="page-heading">
          <div>
            <div className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
              <span style={{ background: '#ef4444' }} />
              OPERATIONAL RISK &amp; RELIABILITY REGISTRY
            </div>
            <h1 style={{ fontFamily: 'var(--font-sans)' }}>
              RED zone sites<span className="heading-dot" style={{ color: '#ef4444' }}>.</span>
            </h1>
            <p style={{ fontFamily: 'var(--font-sans)' }}>
              Sites automatically classified under Red Zone based on incident frequency and individual MTBF.
              Select any site to view its dedicated operational analytics page, metrics graph, and qualifying incident audit.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, fontFamily: 'var(--font-sans)' }}
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, fontFamily: 'var(--font-sans)' }}
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
            <span className="metric-label" style={{ fontFamily: 'var(--font-mono)' }}>
              <ShieldAlert style={{ color: '#ef4444' }} />
              RED zone sites
            </span>
            <div>
              <strong style={{ color: totalCount > 0 ? '#ef4444' : undefined, fontFamily: 'var(--font-mono)' }}>
                {totalCount}
              </strong>
              <span style={{ fontFamily: 'var(--font-sans)' }}>requiring active operations focus</span>
            </div>
            <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)' }}>
              <span
                className="source-dot"
                style={{ background: totalCount > 0 ? '#ef4444' : '#22c55e' }}
              />
              {totalCount > 0
                ? `${totalCount} ${totalCount === 1 ? 'site' : 'sites'} under monitoring`
                : 'All sites healthy'}
            </div>
          </div>

          <div className="metric">
            <span className="metric-label" style={{ fontFamily: 'var(--font-mono)' }}>
              <AlertTriangle style={{ color: '#ef4444' }} />
              Active breaches
            </span>
            <div>
              <strong style={{ color: activeBreachesCount > 0 ? '#ef4444' : undefined, fontFamily: 'var(--font-mono)' }}>
                {activeBreachesCount}
              </strong>
              <span style={{ fontFamily: 'var(--font-sans)' }}>meeting entry criteria today</span>
            </div>
            <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)' }}>
              <span
                className="source-dot"
                style={{ background: activeBreachesCount > 0 ? '#ef4444' : '#22c55e' }}
              />
              Sev-1 &ge; 3, Sev-2 &ge; 5, or MTBF &lt; 36h
            </div>
          </div>

          <div className="metric">
            <span className="metric-label" style={{ fontFamily: 'var(--font-mono)' }}>
              <Clock style={{ color: '#f59e0b' }} />
              21-Day probation
            </span>
            <div>
              <strong style={{ color: exitPendingCount > 0 ? '#f59e0b' : undefined, fontFamily: 'var(--font-mono)' }}>
                {exitPendingCount}
              </strong>
              <span style={{ fontFamily: 'var(--font-sans)' }}>cooling down to exit Red Zone</span>
            </div>
            <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)' }}>
              <span
                className="source-dot"
                style={{
                  background: exitPendingCount > 0 ? '#f59e0b' : 'var(--muted-foreground)',
                }}
              />
              Exits after 21 continuous clean days
            </div>
          </div>

          <div className="metric">
            <span className="metric-label" style={{ fontFamily: 'var(--font-mono)' }}>
              <Radio />
              Calculation mode
            </span>
            <div>
              <strong style={{ fontSize: 24, lineHeight: 1.25, fontFamily: 'var(--font-mono)' }}>Per site</strong>
              <span style={{ fontFamily: 'var(--font-sans)' }}>individual site MTBF</span>
            </div>
            <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)' }}>
              <span className="neutral-dot" />
              Not fleet averaged
            </div>
          </div>
        </div>

        {/* Directory Section */}
        <section className="directory">
          <div className="section-title">
            <h2 style={{ fontFamily: 'var(--font-sans)' }}>
              RED zone sites <span>{filteredSites.length}</span>
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="directory-note" style={{ fontFamily: 'var(--font-mono)' }}>
                <Flame style={{ width: 11, height: 11, color: '#ef4444' }} />
                AUTOMATED SF INCIDENT MONITOR
              </span>
              <span className="directory-note" style={{ fontFamily: 'var(--font-mono)' }}>
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
                style={{ fontFamily: 'var(--font-sans)' }}
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
                  style={{ fontFamily: 'var(--font-sans)' }}
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
                    style={{ position: 'relative' }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      className="site-button"
                      onClick={() => selectSite(site.siteName)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectSite(site.siteName);
                        }
                      }}
                      style={{ cursor: 'pointer', textAlign: 'left', width: '100%', outline: 'none' }}
                      title="Click to open dedicated operational audit page and metrics"
                    >
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
                        <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', fontFamily: 'var(--font-sans)' }}>
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
                          fontFamily: 'var(--font-sans)',
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
                      <div className="site-card-bottom" style={{ fontFamily: 'var(--font-mono)' }}>
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
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-directory" style={{ minHeight: 320, padding: '48px 20px' }}>
              <div className="site-emblem emblem-2" style={{ width: 44, height: 44, marginBottom: 8 }}>
                <CheckCircle2 style={{ width: 22, height: 22, color: 'var(--success)' }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--foreground)', margin: '0 0 6px', fontFamily: 'var(--font-sans)' }}>
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
                  fontFamily: 'var(--font-sans)',
                }}
              >
                No sites currently meet the RED zone criteria. All monitored operational sites are
                healthy and within MTBF thresholds.
              </p>
              <Button variant="outline" size="sm" asChild style={{ marginTop: 16, fontFamily: 'var(--font-sans)' }}>
                <Link to="/">
                  <span>Return to All sites</span>
                  <ArrowRight style={{ width: 13, height: 13, marginLeft: 6 }} />
                </Link>
              </Button>
            </div>
          )}

          {/* Directory Footer */}
          <div className="directory-footer" style={{ fontFamily: 'var(--font-mono)' }}>
            <span>
              Showing {filteredSites.length} of {totalCount} RED zone sites
            </span>
            <span>Calculation basis: Individual Site MTBF &amp; Incident Volume</span>
          </div>
        </section>

        {/* Main Footer */}
        <div className="main-footer" style={{ margin: '32px 0 0', fontFamily: 'var(--font-mono)' }}>
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
