import { useState, useMemo, useEffect } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
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
      staleTime: 120_000,
    });
  },
  component: RedZonePage,
});

export type RedZoneTimeframe = '7d' | '14d' | '21d' | '30d';

export const TIMEFRAME_CONFIG: Record<
  RedZoneTimeframe,
  { label: string; days: number; hours: number; subLabel: string }
> = {
  '7d': { label: '7 days', days: 7, hours: 168, subLabel: '7-Day' },
  '14d': { label: '14 days', days: 14, hours: 336, subLabel: '14-Day' },
  '21d': { label: '21 days', days: 21, hours: 504, subLabel: '21-Day' },
  '30d': { label: '30 days', days: 30, hours: 720, subLabel: '30-Day' },
};

/**
 * Accurately compute single incident downtime duration:
 * Calculates outage duration strictly from Start Time and End Time difference only
 * for qualifying Sev 1 & Sev 2 urgent incidents (not High / Sev 3 / Sev 4).
 */
function computeSingleIncidentDowntime(i: {
  durationHours?: number | null;
  createdTime?: number;
  createdDate?: string | null;
  endTime?: string | null;
  closedDate?: string | null;
  actualEndTime?: string | null;
  severity?: string;
}): number {
  // Only Sev 1 and Sev 2 urgent incidents qualify for outage duration (not High / Sev 3 / Sev 4)
  const sev = String(i.severity || '').toLowerCase();
  const isSev12Urgent = sev === 'sev1' || sev === 'sev2';
  if (!isSev12Urgent) return 0;

  // Strict Start Time and End Time difference only
  const created = i.createdTime || (i.createdDate ? new Date(i.createdDate).getTime() : 0);
  const endStr = i.actualEndTime || i.endTime || i.closedDate;
  if (endStr && created > 0) {
    const endMs = new Date(endStr).getTime();
    if (endMs > created) {
      const diffHours = (endMs - created) / (3600 * 1000);
      return Math.round(diffHours * 10) / 10;
    }
  }

  // Fallback to pre-computed durationHours from backend if explicit start/end timestamp string is absent
  if (typeof i.durationHours === 'number' && i.durationHours > 0) {
    return Math.round(i.durationHours * 10) / 10;
  }

  return 0;
}

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
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketFilter, setTicketFilter] = useState<'all' | 'window' | 'sev1' | 'sev2' | 'down' | 'active'>('all');
  const [timeframe, setTimeframe] = useState<RedZoneTimeframe>('21d');
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  const { data: baseSites = [] } = useQuery(sitesQueryOptions());

  const {
    data: redZoneData,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['salesforce-red-zone'],
    queryFn: () => sfFetchRedZoneSites(),
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  // Dedicated 30-day deep history query for selected site
  const {
    data: selectedSiteDetailData,
    refetch: refetchSiteDetail,
    isFetching: isDetailFetching,
  } = useQuery({
    queryKey: ['salesforce-red-zone-site', selectedSiteName],
    queryFn: () => sfFetchRedZoneSites(false, selectedSiteName!),
    enabled: Boolean(selectedSiteName),
    staleTime: 120_000,
  });

  const handleRefresh = async () => {
    if (selectedSiteName) {
      await Promise.allSettled([
        sfFetchRedZoneSites(true, selectedSiteName),
        refetchSiteDetail(),
        refetch(),
      ]);
    } else {
      await Promise.allSettled([
        sfFetchRedZoneSites(true),
        refetch(),
      ]);
    }
  };

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
    const nameLower = selectedSiteName.toLowerCase().trim();
    if (selectedSiteDetailData?.redZoneSites?.length) {
      const matched = selectedSiteDetailData.redZoneSites.find(
        s =>
          s.siteName.toLowerCase().trim() === nameLower ||
          s.siteId.toLowerCase().trim() === nameLower ||
          s.siteName.toLowerCase().includes(nameLower) ||
          nameLower.includes(s.siteName.toLowerCase())
      );
      if (matched) return matched;
      if (selectedSiteDetailData.redZoneSites.length === 1) {
        return selectedSiteDetailData.redZoneSites[0];
      }
    }
    return (
      enrichedRedZoneSites.find(
        s =>
          s.siteName.toLowerCase().trim() === nameLower ||
          s.siteId.toLowerCase().trim() === nameLower ||
          s.siteName.toLowerCase().includes(nameLower) ||
          nameLower.includes(s.siteName.toLowerCase())
      ) || null
    );
  }, [selectedSiteName, selectedSiteDetailData, enrichedRedZoneSites]);

  // Daily metrics for selected site timeline graph (calculated over selected timeframe)
  const siteDailyMetrics: RedZoneDailyMetric[] = useMemo(() => {
    if (!currentSite) return [];
    const incidents = currentSite.qualifyingIncidents || [];
    const cfg = TIMEFRAME_CONFIG[timeframe];
    const numDays = cfg.days;

    const DAY_MS = 24 * 60 * 60 * 1000;
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const todayStartMs = todayMidnight.getTime();
    const metrics: RedZoneDailyMetric[] = [];

    for (let dayOffset = numDays - 1; dayOffset >= 0; dayOffset--) {
      const dayStart = todayStartMs - dayOffset * DAY_MS;
      const dayEnd = dayStart + DAY_MS;
      const d = new Date(dayStart);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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

      // Calculate true non-overlapping outage duration for Sev 1 & Sev 2 urgent incidents on this day
      const daySev12 = dayIncidents.filter(i => {
        const sev = String(i.severity || '').toLowerCase();
        return (sev === 'sev1' || sev === 'sev2') && (i.endTime || i.closedDate);
      });
      const dayIntervals: Array<[number, number]> = [];
      for (const inc of daySev12) {
        const start = inc.createdTime || (inc.createdDate ? new Date(inc.createdDate).getTime() : 0);
        const endStr = inc.actualEndTime || inc.endTime || inc.closedDate;
        const end = endStr ? new Date(endStr).getTime() : 0;
        if (start > 0 && end > start) {
          const s = Math.max(dayStart, start);
          const e = Math.min(dayEnd, end);
          if (e > s) dayIntervals.push([s, e]);
        }
      }
      dayIntervals.sort((a, b) => a[0] - b[0]);
      let dayDowntimeMs = 0;
      let curStart = -1;
      let curEnd = -1;
      for (const [s, e] of dayIntervals) {
        if (curStart === -1) {
          curStart = s;
          curEnd = e;
        } else if (s <= curEnd) {
          curEnd = Math.max(curEnd, e);
        } else {
          dayDowntimeMs += (curEnd - curStart);
          curStart = s;
          curEnd = e;
        }
      }
      if (curStart !== -1) {
        dayDowntimeMs += (curEnd - curStart);
      }
      const downtimeOnDay = Math.round((dayDowntimeMs / (3600 * 1000)) * 10) / 10;

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
  }, [currentSite, timeframe]);

  // Total qualifying incidents within the selected timeframe
  const timeframeTotalIncidents = useMemo(() => {
    return siteDailyMetrics.reduce((sum, m) => sum + m.totalIncidents, 0);
  }, [siteDailyMetrics]);

  // Minimalist Daily Incident Bar Chart Calculations
  const chartW = 1000;
  const chartH = 160;
  const padL = 44;
  const padR = 24;
  const padT = 24;
  const baseH = 125;
  const usableW = chartW - padL - padR;
  const usableH = baseH - padT;

  const maxChartIncident = useMemo(() => {
    const maxVal = Math.max(0, ...siteDailyMetrics.map(m => m.totalIncidents));
    return Math.max(3, maxVal);
  }, [siteDailyMetrics]);

  const barChartYSteps = useMemo(() => {
    return [0, 0.5, 1].map(ratio => {
      const y = baseH - ratio * usableH;
      const val = Math.round(ratio * maxChartIncident);
      return { y, val };
    });
  }, [maxChartIncident, baseH, usableH]);

  // Rich management insights calculations (Strictly selected timeframe, Sev 1 & Sev 2 urgent cases only, End Time calculation)
  const managementInsights = useMemo(() => {
    if (!currentSite) return null;
    const incidents = currentSite.qualifyingIncidents || [];
    const now = Date.now();
    const cfg = TIMEFRAME_CONFIG[timeframe];
    const timeframeWindowMs = cfg.hours * 60 * 60 * 1000;
    const timeframeStart = now - timeframeWindowMs;
    const baselineHours = cfg.hours;

    // Filter strictly for selected timeframe only, and Sev 1 & Sev 2 urgent cases only
    const qualifyingSev12 = incidents.filter(inc => {
      const created = inc.createdTime || (inc.createdDate ? new Date(inc.createdDate).getTime() : 0);
      // Strictly within selected window (from window start up to now)
      const isWithinWindow = created >= timeframeStart && created <= (now + 3600000);
      // Strictly Sev-1 or Sev-2 urgent cases
      const isSev12Urgent = inc.severity === 'sev1' || inc.severity === 'sev2';
      return isWithinWindow && isSev12Urgent;
    });

    // Outage calculation strictly based on End Time:
    // Only tickets with a recorded End Time / closedDate are completed outages
    // Calculate non-overlapping wall-clock outage time via Interval Union
    const windowIntervals: Array<[number, number]> = [];
    const outageIncidents: Array<RedZoneQualifyingIncident & { durationHours: number }> = [];

    for (const inc of qualifyingSev12) {
      const created = inc.createdTime || (inc.createdDate ? new Date(inc.createdDate).getTime() : 0);
      const endStr = inc.actualEndTime || inc.endTime || inc.closedDate;
      const endMs = endStr ? new Date(endStr).getTime() : 0;
      if (created > 0 && endMs > created) {
        const singleDiffHours = Math.round(((endMs - created) / (3600 * 1000)) * 10) / 10;
        outageIncidents.push({
          ...inc,
          durationHours: singleDiffHours,
        });

        // Clip to timeframe window
        const s = Math.max(timeframeStart, created);
        const e = Math.min(now, endMs);
        if (e > s) {
          windowIntervals.push([s, e]);
        }
      }
    }

    // Merge overlapping intervals to determine true wall-clock facility downtime
    windowIntervals.sort((a, b) => a[0] - b[0]);
    let totalDowntimeMs = 0;
    let curStart = -1;
    let curEnd = -1;
    for (const [s, e] of windowIntervals) {
      if (curStart === -1) {
        curStart = s;
        curEnd = e;
      } else if (s <= curEnd) {
        curEnd = Math.max(curEnd, e);
      } else {
        totalDowntimeMs += (curEnd - curStart);
        curStart = s;
        curEnd = e;
      }
    }
    if (curStart !== -1) {
      totalDowntimeMs += (curEnd - curStart);
    }

    const totalDowntimeHours = Math.min(
      baselineHours,
      Math.round((totalDowntimeMs / (3600 * 1000)) * 10) / 10
    );

    let longestOutageIncident: (RedZoneQualifyingIncident & { durationHours: number }) | null = null;
    let maxDuration = 0;
    for (const inc of outageIncidents) {
      if (inc.durationHours > maxDuration) {
        maxDuration = inc.durationHours;
        longestOutageIncident = inc;
      }
    }

    // Availability estimate over operating baseline (baselineHours operating hours)
    // Formula: (baselineHours - totalDowntimeHours) / baselineHours * 100%
    const operationalAvailabilityPct = totalDowntimeHours >= baselineHours
      ? 0
      : Math.max(0, Math.min(100, Math.round(((baselineHours - totalDowntimeHours) / baselineHours) * 1000) / 10));

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
      totalDowntimeHours7d: totalDowntimeHours,
      longestOutageIncident,
      longestOutageIncident7d: longestOutageIncident,
      operationalAvailabilityPct,
      operationalAvailabilityPct7d: operationalAvailabilityPct,
      catCounts,
      dominantCategory,
      mtbfDeficitPct,
      failureCadenceHours,
      qualifyingSev12Count: qualifyingSev12.length,
      qualifying7dCount: qualifyingSev12.length,
      outageTicketsCount: outageIncidents.length,
    };
  }, [currentSite, timeframe]);

  // Filter qualifying incidents for table
  const filteredIncidents = useMemo(() => {
    if (!currentSite) return [];
    let list = currentSite.qualifyingIncidents || [];
    const cfg = TIMEFRAME_CONFIG[timeframe];
    const timeframeWindowMs = cfg.hours * 60 * 60 * 1000;
    const timeframeStart = Date.now() - timeframeWindowMs;

    if (ticketFilter === 'window') {
      list = list.filter(i => {
        const t = i.createdTime || (i.createdDate ? new Date(i.createdDate).getTime() : 0);
        return t >= timeframeStart;
      });
    } else if (ticketFilter === 'sev1') {
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
  }, [currentSite, ticketFilter, ticketSearch, timeframe]);

  const allSiteIncidents = currentSite?.qualifyingIncidents || [];
  const windowIncidentsCount = useMemo(() => {
    const timeframeWindowMs = TIMEFRAME_CONFIG[timeframe].hours * 60 * 60 * 1000;
    const timeframeStart = Date.now() - timeframeWindowMs;
    return allSiteIncidents.filter(i => {
      const t = i.createdTime || (i.createdDate ? new Date(i.createdDate).getTime() : 0);
      return t >= timeframeStart;
    }).length;
  }, [allSiteIncidents, timeframe]);
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
                  <span />
                  OPERATIONAL RELIABILITY AUDIT
                </div>
                <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 37, fontWeight: 500, margin: '12px 0 8px' }}>
                  {currentSite.siteName}
                  <span className="heading-dot">.</span>
                </h1>
                <div
                  className="detail-subtitle"
                  style={{ flexWrap: 'wrap', gap: 10, fontSize: 12, fontFamily: 'var(--font-sans)', alignItems: 'center' }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: '#dc2626',
                      color: '#ffffff',
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: '2.5px 7px',
                      borderRadius: 4,
                      letterSpacing: '0.04em',
                      lineHeight: 1,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    RED ZONE
                  </span>

                  <span
                    className={`rz-badge-pill ${isBreach ? 'rz-badge-breach' : 'rz-badge-cooling'}`}
                    style={{ fontSize: 9.5, padding: '2.5px 7px' }}
                  >
                    {isBreach ? (
                      <>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: '#ef4444',
                          }}
                        />
                        ACTIVE CRITERIA BREACH
                      </>
                    ) : (
                      <>
                        <Clock style={{ width: 10, height: 10 }} />
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

                  <span style={{ color: 'var(--muted-foreground)' }}>
                    {currentSite.reasons[0] || 'Reliability Threshold Breached'}
                  </span>
                </div>
              </div>

              {/* Action Buttons on Top Right */}
              <div className="detail-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Button
                  variant="outline"
                  onClick={() => void handleRefresh()}
                  disabled={isFetching || isDetailFetching}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    height: 38,
                    fontSize: 12,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <RefreshCw className={isFetching || isDetailFetching ? 'animate-spin' : ''} style={{ width: 14, height: 14 }} />
                  <span>{isFetching || isDetailFetching ? 'Refreshing…' : 'Refresh Telemetry'}</span>
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

            {/* Reliability Breach Context Banner */}
            <div className="connection-banner" style={{ marginTop: 22, marginBottom: 26 }}>
              <div className="banner-symbol">
                <Flame />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <strong style={{ fontSize: 13, color: 'var(--foreground)' }}>
                  {currentSite.reasons.join(' • ') || 'Reliability Threshold Breached'}
                </strong>
                <p style={{ color: 'var(--muted-foreground)', fontSize: 11, marginTop: 4 }}>
                  Active operational reliability audit — monitoring qualifying failure incidents across the 21-day evaluation cycle.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontFamily: 'var(--font-mono)' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>7d Tickets Received</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                    {currentSite.criteria1.sev1Count7d + currentSite.criteria1.sev2Count7d} total
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--muted-foreground)' }}>
                    ({currentSite.criteria1.sev2Count7d} Sev-2, {currentSite.criteria1.sev1Count7d} Sev-1)
                  </div>
                </div>
                <div style={{ height: 28, width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>14d Failure Count</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                    {currentSite.criteria3.incidentCount14d} tickets
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--muted-foreground)' }}>
                    {managementInsights?.totalDowntimeHours || 0}h total outage
                  </div>
                </div>
              </div>
            </div>

            {/* Standard 4-Column Overview Metrics Grid */}
            <div className="overview-metrics" style={{ marginTop: 0, marginBottom: 28 }}>
              {/* Metric 1: 7-Day Incidents */}
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <Flame />
                  7-Day Incident Load
                </span>
                <div>
                  <strong>
                    {currentSite.criteria1.sev1Count7d + currentSite.criteria1.sev2Count7d}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {currentSite.criteria1.sev2Count7d} Sev-2 • {currentSite.criteria1.sev1Count7d} Sev-1
                  </span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span className="source-dot" style={{ background: currentSite.criteria1.sev2Count7d >= 5 || currentSite.criteria1.sev1Count7d >= 3 ? 'var(--primary)' : 'var(--muted-foreground)' }} />
                  Threshold: &lt; 5 Sev-2, &lt; 3 Sev-1
                </div>
              </div>

              {/* Metric 2: 14-Day Site MTBF */}
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <Clock />
                  14-Day Site MTBF
                </span>
                <div>
                  <strong>
                    {currentSite.criteria3.mtbfHours !== null ? `${currentSite.criteria3.mtbfHours}h` : 'Healthy'}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    1 failure / {managementInsights?.failureCadenceHours || 36}h pace
                  </span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span className="source-dot" style={{ background: currentSite.criteria3.met ? 'var(--primary)' : 'var(--muted-foreground)' }} />
                  Benchmark target &ge; 36.0h
                </div>
              </div>

              {/* Metric 3: Cumulative Downtime (Selected Timeframe, Sev-1 & Sev-2 with End Time) */}
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <Timer />
                  Cumulative Outage ({TIMEFRAME_CONFIG[timeframe].label})
                </span>
                <div>
                  <strong>
                    {managementInsights?.totalDowntimeHours ?? 0} hrs
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {managementInsights?.operationalAvailabilityPct ?? 100}% est. availability
                  </span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span className="source-dot" />
                  Peak single: {managementInsights?.longestOutageIncident ? `${managementInsights.longestOutageIncident.durationHours}h` : 'None'}
                </div>
              </div>

              {/* Metric 4: 21-Day Trajectory */}
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <Activity />
                  21-Day Trajectory
                </span>
                <div>
                  <strong>
                    {currentSite.daysSinceBreach} / 21d
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {isBreach ? 'Active breach detected' : `${currentSite.daysRemainingToExit} days remaining to exit`}
                  </span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span className="source-dot" style={{ background: isBreach ? 'var(--primary)' : 'var(--success)' }} />
                  {isBreach ? 'Criteria breach active' : 'Probation cooling in progress'}
                </div>
              </div>
            </div>

            {/* Incident Frequency Bar Graph with Timeframe Selector */}
            <section className="data-panel" style={{ marginBottom: 28 }}>
              <div className="data-panel-heading">
                <div className="provider-symbol">
                  <BarChart3 />
                </div>
                <div>
                  <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                    OPERATIONAL RELIABILITY TELEMETRY
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 18, fontWeight: 600 }}>
                    {TIMEFRAME_CONFIG[timeframe].subLabel} Daily Incident Frequency
                  </h2>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {/* Interactive Timeframe Filter Buttons: 48 hrs | 7 days | 15 days | 30 days */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'var(--secondary)',
                      padding: 3,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      gap: 2,
                    }}
                  >
                    {(['7d', '14d', '21d', '30d'] as RedZoneTimeframe[]).map((tf) => {
                      const isSelected = timeframe === tf;
                      return (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => setTimeframe(tf)}
                          style={{
                            background: isSelected ? 'var(--primary)' : 'transparent',
                            color: isSelected ? '#ffffff' : 'var(--muted-foreground)',
                            border: 'none',
                            borderRadius: 5,
                            padding: '4px 11px',
                            fontSize: 11,
                            fontWeight: isSelected ? 600 : 500,
                            fontFamily: 'var(--font-mono)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {TIMEFRAME_CONFIG[tf].label}
                        </button>
                      );
                    })}
                  </div>

                  {hoveredDayIdx !== null && siteDailyMetrics[hoveredDayIdx] && (
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
                      <span style={{ color: 'var(--foreground)' }}>
                        {siteDailyMetrics[hoveredDayIdx].totalIncidents} tickets
                      </span>
                      <span style={{ color: 'var(--muted-foreground)' }}>
                        ({siteDailyMetrics[hoveredDayIdx].sev2Count} Sev-2, {siteDailyMetrics[hoveredDayIdx].sev1Count} Sev-1)
                      </span>
                      {siteDailyMetrics[hoveredDayIdx].downtimeHours > 0 && (
                        <>
                          <span>•</span>
                          <span style={{ color: 'var(--primary)' }}>
                            {siteDailyMetrics[hoveredDayIdx].downtimeHours}h downtime
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  <span className="pill" style={{ fontFamily: 'var(--font-mono)' }}>
                    {timeframeTotalIncidents} Qualifying Incidents
                  </span>
                </div>
              </div>

              <div style={{ padding: '20px 24px 14px' }}>
                <div style={{ width: '100%', height: 160, position: 'relative' }}>
                  <svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${chartW} ${chartH}`}
                    preserveAspectRatio="none"
                    style={{ overflow: 'visible', display: 'block' }}
                    onMouseLeave={() => setHoveredDayIdx(null)}
                  >
                    {/* Horizontal dashed grid lines with Y-axis count labels */}
                    {barChartYSteps.map((step, i) => (
                      <g key={i}>
                        <line
                          x1={padL}
                          y1={step.y}
                          x2={chartW - padR}
                          y2={step.y}
                          stroke="var(--border)"
                          strokeDasharray="3 3"
                          strokeWidth="1"
                        />
                        <text
                          x={padL - 10}
                          y={step.y + 3.5}
                          textAnchor="end"
                          fill="var(--muted-foreground)"
                          fontSize="9"
                          fontFamily="var(--font-mono)"
                        >
                          {step.val}
                        </text>
                      </g>
                    ))}

                    {/* Minimalist Bar Columns */}
                    {siteDailyMetrics.map((m, idx) => {
                      const totalDays = siteDailyMetrics.length;
                      const slotW = usableW / totalDays;
                      const barW = Math.max(14, Math.min(32, slotW * 0.55));
                      const x = padL + idx * slotW + (slotW - barW) / 2;
                      const barH = m.totalIncidents > 0 ? Math.max(4, (m.totalIncidents / maxChartIncident) * usableH) : 0;
                      const y = baseH - barH;
                      const isHovered = hoveredDayIdx === idx;
                      const showLabel =
                        totalDays <= 7
                          ? true
                          : totalDays <= 15
                          ? idx % 2 === 0 || idx === totalDays - 1 || isHovered
                          : idx % 3 === 0 || idx === totalDays - 1 || isHovered;

                      return (
                        <g
                          key={m.date}
                          onMouseEnter={() => setHoveredDayIdx(idx)}
                          style={{ cursor: 'pointer' }}
                        >
                          {/* Invisible wider hover hit-area */}
                          <rect
                            x={padL + idx * slotW}
                            y={padT - 10}
                            width={slotW}
                            height={usableH + 20}
                            fill="transparent"
                          />

                          {/* Baseline indicator for 0-incident days */}
                          {m.totalIncidents === 0 ? (
                            <line
                              x1={x}
                              y1={baseH}
                              x2={x + barW}
                              y2={baseH}
                              stroke="var(--border)"
                              strokeWidth="2"
                              opacity={isHovered ? 1 : 0.6}
                            />
                          ) : (
                            <>
                              {/* Clean Minimalist Bar with rounded top */}
                              <rect
                                x={x}
                                y={y}
                                width={barW}
                                height={barH}
                                rx={3}
                                fill={isHovered ? 'var(--soft-orange)' : 'var(--primary)'}
                                opacity={isHovered ? 1 : 0.9}
                              />

                              {/* Incident count text on top of bar */}
                              <text
                                x={x + barW / 2}
                                y={y - 5}
                                textAnchor="middle"
                                fill={isHovered ? 'var(--foreground)' : 'var(--muted-foreground)'}
                                fontSize="9.5"
                                fontFamily="var(--font-mono)"
                                fontWeight={isHovered ? '700' : '500'}
                              >
                                {m.totalIncidents}
                              </text>
                            </>
                          )}

                          {/* X-Axis Date Label */}
                          {showLabel && (
                            <text
                              x={x + barW / 2}
                              y={baseH + 16}
                              textAnchor="middle"
                              fill={isHovered ? 'var(--foreground)' : 'var(--muted-foreground)'}
                              fontSize="9"
                              fontFamily="var(--font-mono)"
                              fontWeight={isHovered ? '700' : '400'}
                            >
                              {m.dayLabel}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Minimalist Legend Footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 14,
                    marginTop: 10,
                    borderTop: '1px solid var(--border)',
                    fontSize: 9.5,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--primary)' }} />
                    Daily Incident Volume (Sev-1, Sev-2, Sev-3)
                  </span>
                  <span>
                    Audit thresholds: &lt; 5 Sev-2 / 7d • &lt; 3 Sev-1 / 7d • MTBF &ge; 36.0h
                  </span>
                </div>
              </div>
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
                    className={`rz-pill-tab ${ticketFilter === 'window' ? 'active' : ''}`}
                    onClick={() => setTicketFilter('window')}
                    style={{
                      borderColor: ticketFilter === 'window' ? 'var(--primary)' : undefined,
                      color: ticketFilter === 'window' ? 'var(--primary)' : undefined,
                    }}
                  >
                    Last {TIMEFRAME_CONFIG[timeframe].label} ({windowIncidentsCount})
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
                              <span className="case-priority-badge p-p1">
                                <Flame style={{ width: 10, height: 10 }} />
                                SEV 1
                              </span>
                            ) : isSev2 ? (
                              <span className="case-priority-badge p-p2">
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
                              <span className="case-status-badge">
                                <CheckCircle2 style={{ width: 10, height: 10, marginRight: 4 }} />
                                Closed
                              </span>
                            ) : (
                              <span className="case-status-badge status-new">
                                <span className="source-dot" style={{ background: 'var(--primary)', marginRight: 4 }} />
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
                                <span style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                                  Resolved
                                </span>
                              </>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color: 'var(--soft-orange)',
                                  fontSize: 9.5,
                                  fontWeight: 600,
                                  fontFamily: 'var(--font-mono)',
                                  background: 'var(--orange-surface)',
                                  padding: '2px 7px',
                                  borderRadius: 4,
                                  border: '1px solid var(--border)',
                                  width: 'fit-content',
                                }}
                              >
                                <Clock style={{ width: 10, height: 10 }} />
                                ACTIVE
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
                                <span className="rz-meta-value" style={{ color: inc.isSiteDown ? 'var(--primary)' : 'var(--foreground)' }}>
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
              onClick={() => void handleRefresh()}
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
                    className="site-card"
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
                          {!isBreach && (
                            <span
                              className="rz-badge-pill rz-badge-cooling"
                              style={{ fontSize: 9.5 }}
                            >
                              <Clock style={{ width: 10, height: 10 }} />
                              {site.daysRemainingToExit}d TO EXIT
                            </span>
                          )}
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
                              color: 'var(--muted-foreground)',
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {site.location || 'Operational Site'}
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

                        <span title="Consecutive Clean Streak (Exit Target: 21 days)">
                          <CheckCircle2
                            style={{
                              width: 11,
                              height: 11,
                              color: site.daysSinceBreach >= 21 ? 'var(--success)' : 'var(--muted-foreground)',
                            }}
                          />
                          <span>Clean Streak</span>
                          <b style={{ color: 'var(--foreground)' }}>
                            {site.daysSinceBreach} / 21d
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
