import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Radio,
  ChevronDown,
  ChevronUp,
  Layers,
  Timer,
  TrendingUp,
  Zap,
  RefreshCw,
  ShieldAlert,
  Calendar,
} from 'lucide-react';
import {
  type SFCase,
  sfFetchAlertAnalytics,
  type AlertAnalyticsResult,
  type AlertAnalyticsBucket,
  type TopAlertItem,
  extractAlertSignature,
  getTicketEndTime,
  isOpenAlert,
  isClosedAlert,
} from '@/integrations/salesforce/client';

export type TimeRangeKey = 'all' | '24h' | '48h' | '7d' | '15d' | '1m' | '2m' | '3m' | 'custom';

export interface AlertAnalyticsPanelProps {
  siteName?: string;
  siteId?: string;
  openAlerts?: SFCase[];
  closedAlerts?: SFCase[];
  isSiteDown?: boolean;
  selectedRange?: TimeRangeKey;
  onRangeChange?: (range: TimeRangeKey) => void;
  onAlertsLoaded?: (alerts: SFCase[]) => void;
  analytics?: AlertAnalyticsResult | null;
  isFetching?: boolean;
  customStartDate?: string;
  customStartTime?: string;
  customEndDate?: string;
  customEndTime?: string;
  onCustomRangeChange?: (startDate: string, endDate: string, startTime?: string, endTime?: string) => void;
}

const ALERT_TIME_RANGES: Array<{ key: TimeRangeKey; label: string; hours: number }> = [
  { key: 'all', label: 'All', hours: 2160 },
  { key: '24h', label: '24 Hours', hours: 24 },
  { key: '48h', label: '48 Hours', hours: 48 },
  { key: '7d', label: '7 Days', hours: 168 },
  { key: '15d', label: '15 Days', hours: 360 },
  { key: '1m', label: '1 Month', hours: 720 },
  { key: '2m', label: '2 Months', hours: 1440 },
  { key: '3m', label: '3 Months', hours: 2160 },
  { key: 'custom', label: 'Custom', hours: 0 },
];
const TIME_RANGES = ALERT_TIME_RANGES;

function formatDuration(minutes?: number | null): string {
  if (minutes === null || minutes === undefined || isNaN(minutes) || minutes <= 0) return '0m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const totalM = Math.round(minutes);
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Creates a smooth cubic Bezier path string through an array of {x, y} coordinates.
 */
function createSmoothPath(points: Array<{ x: number; y: number }>): string {
  const valid = points.filter(p => p && typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
  if (valid.length === 0) return '';
  if (valid.length === 1) return `M ${valid[0].x.toFixed(1)} ${valid[0].y.toFixed(1)}`;
  let d = `M ${valid[0].x.toFixed(1)} ${valid[0].y.toFixed(1)}`;
  for (let i = 0; i < valid.length - 1; i++) {
    const p0 = valid[Math.max(0, i - 1)];
    const p1 = valid[i];
    const p2 = valid[i + 1];
    const p3 = valid[Math.min(valid.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Creates a closed area path underneath the smooth curve for gradient fill.
 */
function createSmoothAreaPath(points: Array<{ x: number; y: number }>, baselineY: number): string {
  const valid = points.filter(p => p && typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
  if (valid.length === 0) return '';
  const curve = createSmoothPath(valid);
  if (!curve) return '';
  const first = valid[0];
  const last = valid[valid.length - 1];
  return `${curve} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

export function AlertAnalyticsPanel({
  siteName = '',
  openAlerts = [],
  closedAlerts = [],
  isSiteDown = false,
  selectedRange: controlledRange,
  onRangeChange,
  onAlertsLoaded,
  analytics: controlledAnalytics,
  isFetching: controlledFetching,
  customStartDate: customStartDateProp,
  customStartTime: customStartTimeProp,
  customEndDate: customEndDateProp,
  customEndTime: customEndTimeProp,
  onCustomRangeChange,
}: AlertAnalyticsPanelProps) {
  const [internalRange, setInternalRange] = useState<TimeRangeKey>(controlledRange || 'all');
  const selectedRange = controlledRange ?? internalRange;

  useEffect(() => {
    if (controlledRange) {
      setInternalRange(controlledRange);
    }
  }, [controlledRange]);

  const handleRangeChange = (r: TimeRangeKey) => {
    setInternalRange(r);
    onRangeChange?.(r);
  };
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const [hoveredBucket, setHoveredBucket] = useState<AlertAnalyticsBucket | null>(null);

  const getDefaultStartDate = () => {
    const d = new Date(Date.now() - 7 * 86400000);
    return d.toISOString().slice(0, 10);
  };
  const getDefaultEndDate = () => {
    return new Date().toISOString().slice(0, 10);
  };

  const [localStartDate, setLocalStartDate] = useState(customStartDateProp || getDefaultStartDate());
  const [localStartTime, setLocalStartTime] = useState(customStartTimeProp || '00:00');
  const [localEndDate, setLocalEndDate] = useState(customEndDateProp || getDefaultEndDate());
  const [localEndTime, setLocalEndTime] = useState(customEndTimeProp || '23:59');
  const [appliedCustomRange, setAppliedCustomRange] = useState<{
    startDate: string;
    startTime?: string;
    endDate: string;
    endTime?: string;
  }>({
    startDate: customStartDateProp || getDefaultStartDate(),
    startTime: customStartTimeProp || '00:00',
    endDate: customEndDateProp || getDefaultEndDate(),
    endTime: customEndTimeProp || '23:59',
  });

  const handleApplyCustom = () => {
    if (localStartDate && localEndDate) {
      const fullStart = `${localStartDate}T${localStartTime || '00:00'}`;
      const fullEnd = `${localEndDate}T${localEndTime || '23:59'}`;
      if (fullStart > fullEnd) {
        alert('Start date & time must be before or equal to End date & time');
        return;
      }
      setAppliedCustomRange({
        startDate: localStartDate,
        startTime: localStartTime,
        endDate: localEndDate,
        endTime: localEndTime,
      });
      onCustomRangeChange?.(localStartDate, localEndDate, localStartTime, localEndTime);
    }
  };

  // Fetch deep historical alert analytics from backend SOQL if not provided
  const { data: serverAnalytics, isFetching: queryFetching, refetch } = useQuery({
    queryKey: ['alert-analytics', siteName || 'all', selectedRange, selectedRange === 'custom' ? appliedCustomRange : null],
    queryFn: () => sfFetchAlertAnalytics(siteName, selectedRange, false, selectedRange === 'custom' ? appliedCustomRange : null),
    enabled: !controlledAnalytics,
    staleTime: 60_000,
    refetchInterval: 120_000,
    placeholderData: (prev) => prev,
  });

  const effectiveServerData = (controlledAnalytics && controlledAnalytics.range === selectedRange)
    ? controlledAnalytics
    : (serverAnalytics && serverAnalytics.range === selectedRange ? serverAnalytics : (controlledAnalytics || serverAnalytics));
  const isFetching = controlledFetching ?? queryFetching;

  const prevLoadedAlertsCountRef = useRef<number>(-1);
  useEffect(() => {
    if (effectiveServerData?.alerts && Array.isArray(effectiveServerData.alerts) && onAlertsLoaded) {
      if (prevLoadedAlertsCountRef.current !== effectiveServerData.alerts.length) {
        prevLoadedAlertsCountRef.current = effectiveServerData.alerts.length;
        onAlertsLoaded(effectiveServerData.alerts);
      }
    }
  }, [effectiveServerData?.alerts, onAlertsLoaded]);

  // Client-side fallback calculation from local open & closed alerts
  const localAnalytics: AlertAnalyticsResult = useMemo(() => {
    const rangeObj = ALERT_TIME_RANGES.find(r => r.key === selectedRange) || ALERT_TIME_RANGES[0];
    const now = Date.now();
    const startStr = appliedCustomRange.startDate.includes('T')
      ? appliedCustomRange.startDate
      : `${appliedCustomRange.startDate}T${appliedCustomRange.startTime || '00:00'}:00`;
    const endStr = appliedCustomRange.endDate.includes('T')
      ? appliedCustomRange.endDate
      : `${appliedCustomRange.endDate}T${appliedCustomRange.endTime || '23:59'}:59.999`;

    const customStart = new Date(startStr).getTime();
    const customEnd = new Date(endStr).getTime();

    const windowStart = selectedRange === 'custom' && !isNaN(customStart)
      ? customStart
      : selectedRange === 'today'
      ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })()
      : (now - (rangeObj.hours || 2160) * 60 * 60 * 1000);
    const windowEnd = selectedRange === 'custom' && !isNaN(customEnd)
      ? customEnd
      : now;

    const allLocal = [...(openAlerts || []), ...(closedAlerts || [])];
    const windowAlerts = allLocal.filter(a => {
      if (!a) return false;
      const created = a.CreatedDate ? new Date(a.CreatedDate).getTime() : 0;
      return ((created >= windowStart && created <= windowEnd) || !a.CreatedDate);
    });

    const FR_SLA_MINUTES = 15;
    const RESOLUTION_SLA_MINUTES = 60;

    let openCount = 0;
    let closedCount = 0;
    let breachedCount = 0;
    let frBreachedCount = 0;
    let autoResolvedCount = 0;
    let properCloseCount = 0;
    const durations: number[] = [];

    const enrichedAlerts = windowAlerts.map(a => {
      const created = a.CreatedDate ? new Date(a.CreatedDate).getTime() : 0;
      const endStr = getTicketEndTime(a);
      const ended = endStr ? new Date(endStr).getTime() : a.ClosedDate ? new Date(a.ClosedDate).getTime() : 0;
      const isOpen = isOpenAlert(a);
      const isClosed = isClosedAlert(a);

      if (isOpen) openCount++;
      if (isClosed) closedCount++;

      let dur = 0;
      if (created && ended && ended >= created) {
        dur = Math.round((ended - created) / 60000);
      } else if (isOpen && created) {
        dur = Math.max(0, Math.round((now - created) / 60000));
      } else if (isClosed) {
        dur = 18;
      }

      if (isClosed && dur >= 0) {
        durations.push(dur);
      }

      const isFrBreached = dur > FR_SLA_MINUTES;
      if (isFrBreached) frBreachedCount++;

      const isResBreached = dur > RESOLUTION_SLA_MINUTES;
      if (isResBreached) breachedCount++;

      const isAuto = isClosed && dur <= FR_SLA_MINUTES;
      if (isAuto) autoResolvedCount++;

      const isProper = isClosed && Boolean(endStr);
      if (isProper) properCloseCount++;

      const sig = extractAlertSignature(a);

      return {
        ...a,
        computed_duration: dur,
        is_fr_breached: isFrBreached,
        is_resolution_breached: isResBreached,
        is_auto_resolved: isAuto,
        is_proper_close: isProper,
        signature: sig,
      };
    });

    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

    const totalCount = windowAlerts.length;
    const resolutionRate = totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 100;
    const slaComplianceRate = totalCount > 0 ? Math.max(0, Math.round(((totalCount - breachedCount) / totalCount) * 100)) : 100;
    const autoResolvedRate = closedCount > 0 ? Math.round((autoResolvedCount / closedCount) * 100) : 0;
    const properCloseRate = closedCount > 0 ? Math.round((properCloseCount / closedCount) * 100) : 100;

    // Build line buckets
    const totalSpanMs = Math.max(3600000, windowEnd - windowStart);
    const totalHours = Math.max(1, Math.ceil(totalSpanMs / 3600000));
    const bucketCount = totalHours <= 48 ? 24 : totalHours <= 168 ? 14 : totalHours <= 360 ? 15 : 30;
    const bucketDurationMs = totalSpanMs / bucketCount;
    const buckets: AlertAnalyticsBucket[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const bStart = windowStart + i * bucketDurationMs;
      const bEnd = bStart + bucketDurationMs;
      const bDate = new Date(bStart);

      const label = totalHours <= 48
        ? bDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : bDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

      const inBucket = enrichedAlerts.filter(a => {
        const t = a.CreatedDate ? new Date(a.CreatedDate).getTime() : 0;
        return t >= bStart && t < bEnd;
      });

      const bOpen = inBucket.filter(isOpenAlert).length;
      const bClosed = inBucket.filter(isClosedAlert).length;
      const bBreached = inBucket.filter(a => a.is_resolution_breached).length;
      const bFrBreached = inBucket.filter(a => a.is_fr_breached).length;
      const bAuto = inBucket.filter(a => a.is_auto_resolved).length;
      const bDurs = inBucket.filter(a => a.computed_duration !== null && a.computed_duration >= 0).map(a => a.computed_duration);
      const bAvg = bDurs.length > 0
        ? Math.round(bDurs.reduce((acc, d) => acc + d, 0) / bDurs.length)
        : (bClosed > 0 ? avgDuration : 0);

      buckets.push({
        index: i,
        label,
        startTime: new Date(bStart).toISOString(),
        endTime: new Date(bEnd).toISOString(),
        total: inBucket.length,
        open: bOpen,
        closed: bClosed,
        breached: bBreached,
        frBreached: bFrBreached,
        autoResolved: bAuto,
        avgDurationMinutes: bAvg,
      });
    }

    // Top alert grouping
    const groupMap = new Map<string, { count: number; breaches: number; auto: number; durs: number[] }>();
    for (const a of enrichedAlerts) {
      const sig = a.signature || 'System Alert';
      if (!groupMap.has(sig)) {
        groupMap.set(sig, { count: 0, breaches: 0, auto: 0, durs: [] });
      }
      const entry = groupMap.get(sig)!;
      entry.count++;
      if (a.is_resolution_breached) entry.breaches++;
      if (a.is_auto_resolved) entry.auto++;
      if (a.computed_duration >= 0) entry.durs.push(a.computed_duration);
    }

    const topAlerts: TopAlertItem[] = Array.from(groupMap.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        open: 0,
        closed: data.count,
        breaches: data.breaches,
        frBreaches: 0,
        autoResolved: data.auto,
        avgDurationMinutes: data.durs.length > 0 ? Math.round(data.durs.reduce((acc, d) => acc + d, 0) / data.durs.length) : avgDuration,
        pct: totalCount > 0 ? Math.round((data.count / totalCount) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      siteName: siteName || 'All Sites',
      range: selectedRange,
      rangeLabel: rangeObj.label,
      totalAlerts: totalCount,
      openAlerts: openCount,
      closedAlerts: closedCount,
      resolutionRate,
      avgDurationMinutes: avgDuration,
      minDurationMinutes: minDuration,
      maxDurationMinutes: maxDuration,
      breachedAlerts: breachedCount,
      frBreachedAlerts: frBreachedCount,
      slaComplianceRate,
      autoResolvedAlerts: autoResolvedCount,
      autoResolvedRate,
      properCloseAlerts: properCloseCount,
      properCloseRate,
      buckets,
      topAlerts,
      alerts: enrichedAlerts,
    };
  }, [selectedRange, openAlerts, closedAlerts, siteName, appliedCustomRange]);

  // Use server analytics if available, otherwise seamlessly use local analytics
  const analytics: AlertAnalyticsResult = (effectiveServerData && Array.isArray(effectiveServerData.buckets) && effectiveServerData.buckets.length > 0)
    ? effectiveServerData
    : localAnalytics;

  // Synchronize live open alerts count with openAlerts prop to eliminate discrepancy
  const displayOpenAlerts = openAlerts !== undefined ? openAlerts.length : (analytics?.openAlerts || 0);
  const displayClosedAlerts = closedAlerts !== undefined && closedAlerts.length > 0 ? Math.max(closedAlerts.length, analytics?.closedAlerts || 0) : (analytics?.closedAlerts || 0);
  const displayTotalAlerts = Math.max(displayOpenAlerts + displayClosedAlerts, (analytics?.totalAlerts || 0) > 0 ? ((analytics.totalAlerts || 0) - Math.max(0, (analytics.openAlerts || 0) - displayOpenAlerts)) : (displayOpenAlerts + displayClosedAlerts));

  const buckets = (analytics?.buckets && Array.isArray(analytics.buckets)) ? analytics.buckets : [];
  const maxBucketTotal = Math.max(1, ...buckets.map(b => (typeof b.total === 'number' && !isNaN(b.total)) ? b.total : 0));

  // Compute duration distribution velocity bands (<15m, 15m-1h, >1h, Active Ongoing)
  const durationBands = useMemo(() => {
    const alerts = effectiveServerData?.alerts || [...(openAlerts || []), ...(closedAlerts || [])];
    let under15m = 0;
    let under1h = 0;
    let over1h = 0;
    let ongoing = displayOpenAlerts;

    for (const a of alerts) {
      if (!a || isOpenAlert(a)) {
        continue;
      }
      const raw = a as Record<string, unknown>;
      const dur = typeof a.duration_minutes === 'number' && !isNaN(a.duration_minutes)
        ? a.duration_minutes
        : typeof raw['duration_minutes'] === 'number' && !isNaN(raw['duration_minutes'] as number)
        ? (raw['duration_minutes'] as number)
        : (() => {
            const cTime = a.CreatedDate ? new Date(a.CreatedDate).getTime() : 0;
            const endStr = getTicketEndTime(a);
            const eTime = endStr ? new Date(endStr).getTime() : a.ClosedDate ? new Date(a.ClosedDate).getTime() : 0;
            return cTime && eTime && eTime >= cTime ? Math.round((eTime - cTime) / 60000) : 22;
          })();

      if (dur <= 15) under15m++;
      else if (dur <= 60) under1h++;
      else over1h++;
    }

    const total = Math.max(1, under15m + under1h + over1h + ongoing);
    return [
      {
        label: '< 15 mins (FR SLA Met / Auto-Resolved)',
        count: under15m,
        pct: Math.round((under15m / total) * 100),
        color: 'var(--success)',
      },
      {
        label: '15m – 60 mins (Standard Operational Resolution)',
        count: under1h,
        pct: Math.round((under1h / total) * 100),
        color: 'var(--blue)',
      },
      {
        label: '> 60 mins (Resolution SLA Breached)',
        count: over1h,
        pct: Math.round((over1h / total) * 100),
        color: 'var(--destructive)',
      },
      {
        label: 'Active Open Alerts (Ongoing)',
        count: ongoing,
        pct: Math.round((ongoing / total) * 100),
        color: 'var(--yellow)',
      },
    ];
  }, [effectiveServerData?.alerts, openAlerts, closedAlerts, displayOpenAlerts]);

  // Compute top alert signatures with percentage of highest for progress bar
  const topAlertsList = useMemo(() => {
    const list = (analytics?.topAlerts && Array.isArray(analytics.topAlerts))
      ? analytics.topAlerts
      : [];
    if (list.length === 0) return [];
    const maxCount = Math.max(1, ...list.map(t => (typeof t.count === 'number' && !isNaN(t.count)) ? t.count : 0));
    return list.map(t => {
      const count = (typeof t.count === 'number' && !isNaN(t.count)) ? t.count : 0;
      return {
        ...t,
        count,
        barPct: Math.max(6, Math.min(100, Math.round((count / maxCount) * 100))),
      };
    });
  }, [analytics?.topAlerts]);

  // SVG Line Chart coordinates and paths
  const chartWidth = 1000;
  const chartHeight = 150;
  const padLeft = 45;
  const padRight = 25;
  const padTop = 16;
  const baselineY = 126;
  const usableW = chartWidth - padLeft - padRight;
  const usableH = baselineY - padTop;

  // Grid steps (4 levels: 0%, 33%, 66%, 100%)
  const yGridSteps = useMemo(() => {
    return [0, 1, 2, 3].map(step => {
      const ratio = step / 3;
      const y = baselineY - ratio * usableH;
      const val = Math.round(ratio * maxBucketTotal);
      return { y, val };
    });
  }, [maxBucketTotal, baselineY, usableH]);

  // Compute (x, y) coordinates for Total Alerts line and Breached Alerts line
  const { totalPoints, breachPoints, bucketCoords } = useMemo(() => {
    const tPts: Array<{ x: number; y: number }> = [];
    const bPts: Array<{ x: number; y: number }> = [];
    const coords: Array<{ x: number; totalY: number; breachY: number; bucket: AlertAnalyticsBucket }> = [];

    if (buckets.length === 0) return { totalPoints: [], breachPoints: [], bucketCoords: [] };

    buckets.forEach((b, idx) => {
      const x = padLeft + (idx / Math.max(1, buckets.length - 1)) * usableW;
      const bTot = (typeof b.total === 'number' && !isNaN(b.total)) ? b.total : 0;
      const totalY = baselineY - (bTot / (maxBucketTotal || 1)) * usableH;
      const breachCount = (typeof b.breached === 'number' && !isNaN(b.breached)) ? b.breached : 0;
      const breachY = baselineY - (breachCount / (maxBucketTotal || 1)) * usableH;

      tPts.push({ x, y: totalY });
      bPts.push({ x, y: breachY });
      coords.push({ x, totalY, breachY, bucket: b });
    });

    return { totalPoints: tPts, breachPoints: bPts, bucketCoords: coords };
  }, [buckets, maxBucketTotal, padLeft, usableW, usableH, baselineY]);

  const totalLinePath = useMemo(() => createSmoothPath(totalPoints), [totalPoints]);
  const totalAreaPath = useMemo(() => createSmoothAreaPath(totalPoints, baselineY), [totalPoints, baselineY]);

  const hasAnyBreaches = useMemo(() => {
    return buckets.some(b => (b.breached || 0) > 0);
  }, [buckets]);

  const breachLinePath = useMemo(() => {
    if (!hasAnyBreaches) return '';
    return createSmoothPath(breachPoints);
  }, [breachPoints, hasAnyBreaches]);

  // Handle mouse move over SVG to track active hovered bucket
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!buckets || buckets.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || rect.width <= 0) return;
    const clientX = e.clientX - rect.left;
    const scale = rect.width / chartWidth;
    if (scale <= 0) return;
    const svgX = clientX / scale;
    const ratio = Math.max(0, Math.min(1, (svgX - padLeft) / usableW));
    if (isNaN(ratio)) return;
    const closestIdx = Math.round(ratio * (buckets.length - 1));
    if (buckets[closestIdx]) {
      setHoveredBucket(buckets[closestIdx]);
    }
  };

  const activeCoord = useMemo(() => {
    if (!hoveredBucket) return null;
    return bucketCoords.find(c => c.bucket.index === hoveredBucket.index) || null;
  }, [hoveredBucket, bucketCoords]);

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: isCollapsed ? 'none' : '1px solid var(--border)',
          background: 'var(--secondary)',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--orange-surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--soft-orange)',
              flexShrink: 0,
            }}
          >
            <TrendingUp style={{ width: 16, height: 16 }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
                Alert Intelligence & SLA Performance
              </span>
              {siteName && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 7px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--muted)',
                    color: 'var(--muted-foreground)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {siteName}
                </span>
              )}
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
              Distribution lifecycle (created → ended), MTTR resolution velocity & SLA breach telemetry
            </p>
          </div>
        </div>

        {/* Right side: SLA Adherence Badge & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '4px 10px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: (analytics?.slaComplianceRate ?? 100) >= 85 ? 'var(--success)' : 'var(--soft-orange)',
                display: 'inline-block',
                boxShadow: `0 0 0 2px color-mix(in oklch, ${(analytics?.slaComplianceRate ?? 100) >= 85 ? 'var(--success)' : 'var(--soft-orange)'} 20%, transparent)`,
              }}
            />
            <span style={{ color: 'var(--muted-foreground)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              SLA Compliance:
            </span>
            <strong style={{ color: 'var(--foreground)', fontWeight: 700 }}>
              {analytics?.slaComplianceRate ?? 100}%
            </strong>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: isFetching ? 'var(--soft-orange)' : 'var(--muted-foreground)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-sm)',
              transition: 'all 0.15s ease',
            }}
            title="Refresh Alert Analytics"
          >
            <RefreshCw
              style={{
                width: 13,
                height: 13,
                animation: isFetching ? 'spin 1s linear infinite' : 'none',
              }}
            />
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-sm)',
              transition: 'all 0.15s ease',
            }}
            title={isCollapsed ? 'Expand Analytics Panel' : 'Collapse Analytics Panel'}
          >
            {isCollapsed ? <ChevronDown style={{ width: 15, height: 15 }} /> : <ChevronUp style={{ width: 15, height: 15 }} />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div style={{ padding: '16px 18px' }}>
          {/* Time Range Selector */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'var(--secondary)',
                  padding: '3px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                }}
              >
                {ALERT_TIME_RANGES.map(range => {
                  const isActive = selectedRange === range.key;
                  return (
                    <button
                      key={range.key}
                      type="button"
                      onClick={() => handleRangeChange(range.key)}
                      style={{
                        background: isActive ? 'var(--card)' : 'transparent',
                        color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
                        border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                        boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.18)' : 'none',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 10px',
                        fontSize: 10.5,
                        fontWeight: isActive ? 600 : 500,
                        fontFamily: 'var(--font-mono)',
                        cursor: 'pointer',
                        transition: 'all 0.12s ease',
                        lineHeight: 1.2,
                      }}
                    >
                      {range.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom Date Range Picker when Custom range is active */}
              {selectedRange === 'custom' && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'var(--card)',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                  }}
                >
                  <Calendar style={{ width: 12, height: 12, color: 'var(--muted-foreground)' }} />
                  <span style={{ color: 'var(--muted-foreground)', fontSize: 9.5, fontWeight: 600 }}>FROM:</span>
                  <input
                    type="date"
                    value={localStartDate}
                    onChange={(e) => setLocalStartDate(e.target.value)}
                    style={{
                      background: 'var(--secondary)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      padding: '2px 5px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      outline: 'none',
                    }}
                  />
                  <input
                    type="time"
                    value={localStartTime}
                    onChange={(e) => setLocalStartTime(e.target.value)}
                    style={{
                      background: 'var(--secondary)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      padding: '2px 5px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      outline: 'none',
                    }}
                  />
                  <span style={{ color: 'var(--muted-foreground)', fontSize: 9.5, fontWeight: 600 }}>TO:</span>
                  <input
                    type="date"
                    value={localEndDate}
                    onChange={(e) => setLocalEndDate(e.target.value)}
                    style={{
                      background: 'var(--secondary)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      padding: '2px 5px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      outline: 'none',
                    }}
                  />
                  <input
                    type="time"
                    value={localEndTime}
                    onChange={(e) => setLocalEndTime(e.target.value)}
                    style={{
                      background: 'var(--secondary)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      padding: '2px 5px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleApplyCustom}
                    style={{
                      background: 'var(--primary)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 3,
                      padding: '3px 9px',
                      fontSize: 10.5,
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    APPLY
                  </button>
                </div>
              )}
            </div>

            {/* Range Legend & Series Indicators */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--muted-foreground)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 14,
                    height: 2.5,
                    borderRadius: 1,
                    background: 'var(--primary)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ color: 'var(--foreground)', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                  Total Alert Volume
                </span>
              </span>

              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 14,
                    height: 2,
                    borderTop: '2px dashed var(--destructive)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ color: 'var(--foreground)', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                  SLA Breached
                </span>
              </span>

              {isFetching && (
                <span style={{ fontSize: 10, color: 'var(--soft-orange)', fontFamily: 'var(--font-mono)' }}>
                  Loading {ALERT_TIME_RANGES.find(r => r.key === selectedRange)?.label} data…
                </span>
              )}
            </div>
          </div>

          {/* 4 Focused KPI Blocks: Alerts, MTTR, Breaches, Auto-Resolve */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            {/* KPI 1: Alerts In Window */}
            <div
              style={{
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                  Alerts In Window
                </span>
                <Radio style={{ width: 13, height: 13, color: 'var(--soft-orange)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                <strong style={{ fontSize: 26, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--foreground)', lineHeight: 1 }}>
                  {displayTotalAlerts}
                </strong>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>total alerts</span>
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--muted-foreground)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: displayOpenAlerts > 0 ? 'var(--destructive)' : 'var(--muted-foreground)', fontWeight: 600 }}>
                  {displayOpenAlerts} open
                </span>
                <span>•</span>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                  {displayClosedAlerts} resolved
                </span>
              </div>
            </div>

            {/* KPI 2: Average Time to Resolve (MTTR) */}
            <div
              style={{
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                  Avg Time to Resolve (MTTR)
                </span>
                <Clock style={{ width: 13, height: 13, color: 'var(--blue)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                <strong style={{ fontSize: 26, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--foreground)', lineHeight: 1 }}>
                  {(analytics?.avgDurationMinutes || 0) > 0 ? formatDuration(analytics?.avgDurationMinutes) : '—'}
                </strong>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>avg resolution</span>
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                <span>Min: {formatDuration(analytics?.minDurationMinutes)}</span>
                <span style={{ margin: '0 5px' }}>•</span>
                <span>Max: {formatDuration(analytics?.maxDurationMinutes)}</span>
              </div>
            </div>

            {/* KPI 3: Alerts Breached & FR Breach */}
            <div
              style={{
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                  Alerts Breached & FR Breach
                </span>
                <AlertTriangle style={{ width: 13, height: 13, color: analytics.breachedAlerts > 0 ? 'var(--destructive)' : 'var(--success)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                <strong
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    color: (analytics?.breachedAlerts || 0) > 0 ? 'var(--destructive)' : 'var(--foreground)',
                    lineHeight: 1,
                  }}
                >
                  {analytics?.breachedAlerts ?? 0}
                </strong>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>resolution breaches (&gt;60m)</span>
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: (analytics?.frBreachedAlerts || 0) > 0 ? 'var(--soft-orange)' : 'var(--muted-foreground)', fontWeight: 600 }}>
                  {analytics?.frBreachedAlerts ?? 0} FR breaches (&gt;15m)
                </span>
                <span>•</span>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                  {analytics?.slaComplianceRate ?? 100}% met SLA
                </span>
              </div>
            </div>

            {/* KPI 4: Auto-Resolve & Proper Close */}
            <div
              style={{
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                  Auto-Resolve & Proper Close
                </span>
                <Zap style={{ width: 13, height: 13, color: 'var(--success)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                <strong style={{ fontSize: 26, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--success)', lineHeight: 1 }}>
                  {analytics?.autoResolvedAlerts ?? 0}
                </strong>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                  ({analytics?.autoResolvedRate ?? 0}% auto-cleared)
                </span>
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>
                  {analytics?.properCloseRate ?? 100}% verified telemetry close
                </span>
              </div>
            </div>
          </div>

          {/* Line Graph Component with Background Grid */}
          <div
            style={{
              background: 'var(--secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
              position: 'relative',
              marginBottom: 16,
            }}
          >
            {/* Graph Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showChart ? 12 : 0, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.03em', fontFamily: 'var(--font-mono)' }}>
                  Alert Volume & SLA Resolution Trend Over {ALERT_TIME_RANGES.find(r => r.key === selectedRange)?.label}
                </span>
                <button
                  type="button"
                  onClick={() => setShowChart(!showChart)}
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--muted-foreground)',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                >
                  {showChart ? 'Minimize Chart' : 'Show Chart'}
                </button>
              </div>

              {hoveredBucket && (
                <div
                  style={{
                    fontSize: 10.5,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--foreground)',
                    background: 'var(--card)',
                    padding: '3px 9px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <strong>{hoveredBucket.label}</strong>
                  <span>•</span>
                  <span>{hoveredBucket.total} alerts ({hoveredBucket.open} open, {hoveredBucket.closed} closed)</span>
                  <span>•</span>
                  <span style={{ color: (hoveredBucket.breached || 0) > 0 ? 'var(--destructive)' : 'var(--muted-foreground)' }}>
                    {hoveredBucket.breached || 0} breached
                  </span>
                  <span>•</span>
                  <span>MTTR: {formatDuration(hoveredBucket.avgDurationMinutes)}</span>
                </div>
              )}
            </div>

            {/* Interactive SVG Line Graph */}
            {showChart && (
              <div style={{ width: '100%', height: chartHeight, position: 'relative' }}>
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  preserveAspectRatio="none"
                  onMouseMove={handleSvgMouseMove}
                  onMouseLeave={() => setHoveredBucket(null)}
                  style={{ overflow: 'visible', cursor: 'crosshair', display: 'block' }}
                >
                  <defs>
                    {/* Primary theme area gradient */}
                    <linearGradient id="themeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
                      <stop offset="90%" stopColor="var(--primary)" stopOpacity="0.02" />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                    </linearGradient>

                    {/* Breach area gradient */}
                    <linearGradient id="breachAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--destructive)" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="var(--destructive)" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Background Grid: Horizontal lines with dashed stroke */}
                  {yGridSteps.map((step, idx) => (
                    <g key={idx}>
                      <line
                        x1={padLeft}
                        y1={step.y}
                        x2={chartWidth - padRight}
                        y2={step.y}
                        stroke="var(--border)"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                        opacity={step.val === 0 ? 0.9 : 0.45}
                      />
                      <text
                        x={padLeft - 8}
                        y={step.y + 3.5}
                        textAnchor="end"
                        fill="var(--muted-foreground)"
                        fontSize="9.5"
                        fontFamily="var(--font-mono)"
                      >
                        {step.val}
                      </text>
                    </g>
                  ))}

                  {/* Vertical grid lines at major intervals */}
                  {bucketCoords.map((c, idx) => {
                    const showTick = buckets.length <= 15 ? true : idx % 2 === 0;
                    if (!showTick) return null;
                    return (
                      <line
                        key={idx}
                        x1={c.x}
                        y1={padTop}
                        x2={c.x}
                        y2={baselineY}
                        stroke="var(--border)"
                        strokeDasharray="2 3"
                        strokeWidth="1"
                        opacity="0.3"
                      />
                    );
                  })}

                  {/* Smooth Area Gradient Fill Under Curve */}
                  {totalAreaPath && (
                    <path
                      d={totalAreaPath}
                      fill="url(#themeAreaGrad)"
                    />
                  )}

                  {/* Primary Line Path (Matches Project Theme Color var(--primary)) */}
                  {totalLinePath && (
                    <path
                      d={totalLinePath}
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Secondary Breach Line (Dashed red line if breaches exist) */}
                  {breachLinePath && (
                    <path
                      d={breachLinePath}
                      fill="none"
                      stroke="var(--destructive)"
                      strokeWidth="1.75"
                      strokeDasharray="3 3"
                      strokeLinecap="round"
                      opacity="0.85"
                    />
                  )}

                  {/* Data Points on Line */}
                  {bucketCoords.map((c, idx) => {
                    const isHovered = hoveredBucket?.index === c.bucket.index;
                    const hasBreach = (c.bucket.breached || 0) > 0;
                    return (
                      <g key={idx}>
                        {/* Main total point */}
                        <circle
                          cx={c.x}
                          cy={c.totalY}
                          r={isHovered ? 5 : 2.5}
                          fill="var(--card)"
                          stroke="var(--primary)"
                          strokeWidth={isHovered ? 2.5 : 1.75}
                          style={{ transition: 'r 0.15s ease' }}
                        />

                        {/* Breach marker dot */}
                        {hasBreach && (
                          <circle
                            cx={c.x}
                            cy={c.breachY}
                            r={isHovered ? 4 : 2}
                            fill="var(--destructive)"
                            stroke="var(--card)"
                            strokeWidth="1"
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* Active Crosshair Cursor & Indicator */}
                  {activeCoord && (
                    <g>
                      <line
                        x1={activeCoord.x}
                        y1={padTop}
                        x2={activeCoord.x}
                        y2={baselineY}
                        stroke="var(--foreground)"
                        strokeDasharray="2 2"
                        strokeWidth="1"
                        opacity="0.45"
                      />
                      <circle
                        cx={activeCoord.x}
                        cy={activeCoord.totalY}
                        r="6"
                        fill="var(--primary)"
                        stroke="var(--card)"
                        strokeWidth="2"
                      />
                    </g>
                  )}
                </svg>

                {/* X-axis labels under baseline */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 4,
                    paddingLeft: `${(padLeft / chartWidth) * 100}%`,
                    paddingRight: `${(padRight / chartWidth) * 100}%`,
                    fontSize: 9.5,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {buckets.length > 0 && (
                    <>
                      <span>{buckets[0]?.label || ''}</span>
                      {buckets.length > 6 && <span>{buckets[Math.floor(buckets.length / 2)]?.label || ''}</span>}
                      <span>{buckets[buckets.length - 1]?.label || ''}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Insights Row: Top Alerts & Resolution Velocity */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 12,
            }}
          >
            {/* Box 1: Top Alerts In Selected Period */}
            <div
              style={{
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                  Top Alerts In Selected Period
                </span>
                <Layers style={{ width: 13, height: 13, color: 'var(--muted-foreground)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {topAlertsList.length > 0 ? (
                  topAlertsList.map(alert => (
                    <div key={alert.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                        <span
                          style={{
                            color: 'var(--foreground)',
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '72%',
                          }}
                          title={alert.name}
                        >
                          {alert.name}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--foreground)', fontWeight: 600 }}>
                            {alert.count} {alert.count === 1 ? 'alert' : 'alerts'}
                          </span>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontFamily: 'var(--font-mono)',
                              padding: '1px 5px',
                              borderRadius: 'var(--radius-sm)',
                              background: alert.breaches > 0 ? 'var(--destructive)' : 'var(--muted)',
                              color: alert.breaches > 0 ? '#fff' : 'var(--muted-foreground)',
                              fontWeight: 600,
                            }}
                          >
                            {alert.breaches > 0 ? `${alert.breaches} breached` : '0 breach'}
                          </span>
                        </div>
                      </div>

                      {/* Frequency Bar in Project Theme Accent */}
                      <div
                        style={{
                          height: 4,
                          width: '100%',
                          background: 'var(--muted)',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${alert.barPct}%`,
                            background: 'var(--primary)',
                            borderRadius: 2,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>

                      {/* Meta badges: MTTR, Auto-cleared, Share */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: 9.5,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--muted-foreground)',
                        }}
                      >
                        <span>MTTR: {formatDuration(alert.avgDurationMinutes)}</span>
                        <span>•</span>
                        <span>{alert.autoResolved} auto-cleared</span>
                        <span>•</span>
                        <span>{alert.pct}% of period</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', padding: '10px 0' }}>
                    No recurring alerts recorded in this time range.
                  </div>
                )}
              </div>
            </div>

            {/* Box 2: Resolution Velocity & SLA Adherence (MTTR Bands) */}
            <div
              style={{
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                  Resolution Velocity & SLA Adherence
                </span>
                <Timer style={{ width: 13, height: 13, color: 'var(--muted-foreground)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {durationBands.map(band => (
                  <div key={band.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: band.color }} />
                        <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{band.label}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                        {band.count} ({band.pct}%)
                      </span>
                    </div>
                    <div
                      style={{
                        height: 4,
                        width: '100%',
                        background: 'var(--muted)',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.max(0, band.pct)}%`,
                          background: band.color,
                          borderRadius: 2,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
