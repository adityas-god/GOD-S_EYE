import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DashboardShell } from '@/components/dashboard-shell';
import { ConnectionsDialog, SiteEditor, SignInDialog } from '@/components/dashboard-dialogs';
import { sitesQueryOptions, type Site } from '@/lib/sites';
import { useAuth } from '@/components/auth-context';
import {
  sfFetchCasesForSite,
  sfFetchAlertAnalytics,
  sfFetchRedZoneSites,
  isAlertCase,
  detectSeverity,
  detectCaseCategory,
  isImTicket,
  isDirTicket,
  isChangeRequestTicket,
  isIncidentTicket,
  hasTicketEndTime,
  isLiveOpenCase,
  isClosedToday,
  getTicketEndTime,
  isOpenAlert,
  isClosedAlert,
  calculateAlertDuration,
  calculateSiteUrgentCounts,
  type SFCase,
  getAssigneeDisplayName,
  findBestSiteForCase,
  compileSiteIndex,
  areSameSite,
} from '@/integrations/salesforce/client';
import { SiteRunbookPanel, type RunbookTabKey } from '@/components/site-runbook-panel';
import { fetchSiteRunbook, defaultRunbook, type SiteRunbook } from '@/lib/runbook';
import { AlertAnalyticsPanel, type TimeRangeKey } from '@/components/alert-analytics-panel';

export type SiteTimeRangeKey = 'all' | '24h' | '48h' | '7d' | '15d' | '1m' | '2m' | '3m' | 'custom';

export const SITE_TIME_RANGES: Array<{ key: SiteTimeRangeKey; label: string; hours?: number }> = [
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

function formatDateTimeParts(isoString?: string | null): { date: string; time: string; full: string } {
  if (!isoString) return { date: '—', time: '', full: '—' };
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { date: '—', time: '', full: '—' };
    const isThisYear = d.getFullYear() === new Date().getFullYear();
    const date = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(isThisYear ? {} : { year: 'numeric' }),
    });
    const time = d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return { date, time, full: `${date}, ${time}` };
  } catch {
    return { date: '—', time: '', full: '—' };
  }
}

function formatPreciseTime(isoString?: string | null): string {
  return formatDateTimeParts(isoString).full;
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
      // Instantly seed site cases & alerts from existing salesforce-overview data so panel opens with 0ms delay
      const overview = context.queryClient.getQueryData<any>(['salesforce-overview']);
      if (overview && site.name) {
        const compiled = compileSiteIndex(sites);
        const matchesThisSite = (item: SFCase) => {
          if (!item) return false;
          const best = findBestSiteForCase(item, compiled);
          if (best && areSameSite(best, site.name, compiled)) return true;
          const loc = String(item.Customer_Location__c || item.Snow_Sitename__c || item.Site_Name_Customer_Input__c || item.Account_Name__c || (item as any).Account?.Name || '').trim().toLowerCase();
          const sLower = site.name.trim().toLowerCase();
          if (loc && loc.length >= 3 && sLower.length >= 3 && (loc.includes(sLower) || areSameSite(loc, site.name, compiled))) return true;
          return false;
        };

        const siteCases = (overview.cases || []).filter(matchesThisSite).filter(c => {
          if (c.CreatedDate) {
            const yr = new Date(c.CreatedDate).getFullYear();
            if (!isNaN(yr) && yr < 2026) return false;
          }
          return !isAlertCase(c);
        });
        const siteAlerts = (overview.alerts || []).filter(matchesThisSite).filter(a => {
          if (a.CreatedDate) {
            const yr = new Date(a.CreatedDate).getFullYear();
            if (!isNaN(yr) && yr < 2026) return false;
          }
          return isAlertCase(a) && isOpenAlert(a);
        });
        const siteClosed = (overview.closedAlerts || []).filter(matchesThisSite);

        context.queryClient.setQueryData(
          ['site-cases', site.id, site.name, site.salesforce_account_id, 'all', null],
          (prev: any) => {
            if (prev && Array.isArray(prev.records) && prev.records.length > 0) return prev;
            return {
              totalSize: siteCases.length,
              done: true,
              records: siteCases,
              alerts: siteAlerts,
              closed: siteClosed,
              product_lines: (site.product_lines as string[]) || [],
              product_line: site.product_line || null,
              site: site,
            };
          }
        );
      }

      // Non-blocking prefetch so fresh backend data streams in without freezing
      void context.queryClient.prefetchQuery({
        queryKey: ['site-cases', site.id, site.name, site.salesforce_account_id, 'all', null],
        queryFn: () =>
          sfFetchCasesForSite({
            data: {
              siteName: site.name,
              accountId: site.salesforce_account_id,
            },
            range: 'all',
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

  const queryClient = useQueryClient();
  const [connections, setConnections] = useState(false);
  const [editor, setEditor] = useState(false);
  const [login, setLogin] = useState(false);
  const [caseSearch, setCaseSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [selectedCase, setSelectedCase] = useState<SFCase | null>(null);
  const [activeBucket, setActiveBucket] = useState<'cases' | 'alerts' | 'closed' | 'analytics'>('cases');
  const [displayLimit, setDisplayLimit] = useState(40);
  const [siteTimeRange, setSiteTimeRange] = useState<SiteTimeRangeKey>('all');
  const getDefaultStartDate = () => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const getDefaultEndDate = () => new Date().toISOString().slice(0, 10);

  const [customStartDate, setCustomStartDate] = useState(getDefaultStartDate());
  const [customStartTime, setCustomStartTime] = useState('00:00');
  const [customEndDate, setCustomEndDate] = useState(getDefaultEndDate());
  const [customEndTime, setCustomEndTime] = useState('23:59');

  const [appliedCustomRange, setAppliedCustomRange] = useState<{
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
  }>({
    startDate: getDefaultStartDate(),
    startTime: '00:00',
    endDate: getDefaultEndDate(),
    endTime: '23:59',
  });
  const [historicalAlerts, setHistoricalAlerts] = useState<SFCase[]>([]);

  const analyticsEffectiveRange: TimeRangeKey = siteTimeRange;

  // Fetch deep alert analytics & precise alert records for this site only on-demand when analytics tab or historical range is active
  const isAnalyticsNeeded = activeBucket === 'analytics' || (siteTimeRange !== 'all' && siteTimeRange !== '24h');
  const {
    data: analyticsData,
    isFetching: analyticsFetching,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ['alert-analytics', site?.name || 'all', analyticsEffectiveRange, analyticsEffectiveRange === 'custom' ? appliedCustomRange : null],
    queryFn: () => sfFetchAlertAnalytics(
      site?.name || '',
      analyticsEffectiveRange,
      false,
      analyticsEffectiveRange === 'custom' ? appliedCustomRange : null
    ),
    enabled: Boolean(site?.name) && isAnalyticsNeeded,
    staleTime: 120_000,
    refetchInterval: isAnalyticsNeeded ? 120_000 : false,
    placeholderData: (prev) => prev,
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

  // Fetch all open cases & alerts (opened + closed today) for this site with instant placeholder seeding
  const {
    data: sfData,
    isFetching: sfFetching,
    isPlaceholderData: sfIsPlaceholder,
    refetch: refetchSf,
    error: sfError,
  } = useQuery({
    queryKey: ['site-cases', site?.id, site?.name, site?.salesforce_account_id, siteTimeRange, siteTimeRange === 'custom' ? appliedCustomRange : null],
    queryFn: async () => {
      if (!site) return { records: [], alerts: [], totalSize: 0, done: true };
      try {
        const result = await sfFetchCasesForSite({
          data: {
            siteName: site.name,
            accountId: site.salesforce_account_id,
          },
          range: siteTimeRange,
          startDate: appliedCustomRange.startDate,
          endDate: appliedCustomRange.endDate,
          startTime: appliedCustomRange.startTime,
          endTime: appliedCustomRange.endTime,
        });

        // Resilient fallback: if the site-specific query returned 0 records or missing alerts, but overview has open cases/alerts for this site,
        // merge/fallback to overview cases and alerts so the panel never wipes off!
        if (site?.name) {
          try {
            const overview = queryClient.getQueryData<any>(['salesforce-overview']);
            if (overview) {
              const siteLower = site.name.trim().toLowerCase();
              const compiled = compileSiteIndex(sites || []);
              const matchesSite = (item: SFCase) => {
                if (!item) return false;
                const best = findBestSiteForCase(item, compiled);
                if (best && areSameSite(best, site.name, compiled)) return true;
                const loc = String(item.Customer_Location__c || item.Snow_Sitename__c || item.Site_Name_Customer_Input__c || item.Account_Name__c || (item as any).Account?.Name || '').trim().toLowerCase();
                if (loc && loc.length >= 3 && siteLower.length >= 3 && (loc.includes(siteLower) || areSameSite(loc, site.name, compiled))) return true;
                return false;
              };
              const fallbackCases = (!result.records || result.records.length === 0) && Array.isArray(overview.cases)
                ? (overview.cases as SFCase[]).filter(matchesSite)
                : [];
              const matchedAlerts = Array.isArray(overview.alerts)
                ? (overview.alerts as SFCase[]).filter(matchesSite)
                : [];

              const mergedAlertsMap = new Map<string, SFCase>();
              for (const a of (result.alerts || [])) {
                if (a && a.Id) mergedAlertsMap.set(a.Id, a);
              }
              for (const a of matchedAlerts) {
                if (a && a.Id && !mergedAlertsMap.has(a.Id)) mergedAlertsMap.set(a.Id, a);
              }

              const finalRecords = result.records && result.records.length > 0 ? result.records : fallbackCases;
              return {
                ...result,
                totalSize: finalRecords.length,
                records: finalRecords,
                alerts: Array.from(mergedAlertsMap.values()),
              };
            }
          } catch {}
        }

        return result;
      } catch (err) {
        // If query failed (e.g. timeout or server restart), preserve existing query data if available
        const prev = queryClient.getQueryData<any>(['site-cases', site?.id, site?.name, site?.salesforce_account_id, siteTimeRange, siteTimeRange === 'custom' ? appliedCustomRange : null]);
        if (prev && prev.records && prev.records.length > 0) {
          return prev;
        }
        throw err;
      }
    },
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    refetchInterval: 30_000, // automatic background refresh every 30 seconds
    initialData: () => {
      if (siteTimeRange !== 'all') return undefined;
      try {
        const overview = queryClient.getQueryData<any>(['salesforce-overview']);
        if (overview && site?.name) {
          const compiled = compileSiteIndex(sites || []);
          const siteLower = site.name.trim().toLowerCase();
          const matchesSite = (item: SFCase) => {
            if (!item) return false;
            const best = findBestSiteForCase(item, compiled);
            if (best && areSameSite(best, site.name, compiled)) return true;
            const loc = String(item.Customer_Location__c || item.Snow_Sitename__c || item.Site_Name_Customer_Input__c || item.Account_Name__c || (item as any).Account?.Name || '').trim().toLowerCase();
            if (loc && loc.length >= 3 && siteLower.length >= 3 && (loc.includes(siteLower) || areSameSite(loc, site.name, compiled))) return true;
            return false;
          };
          const matchedCases = (overview.cases || []).filter(matchesSite).filter((c: SFCase) => {
            if (c.CreatedDate) {
              const yr = new Date(c.CreatedDate).getFullYear();
              if (!isNaN(yr) && yr < 2026) return false;
            }
            return !isAlertCase(c);
          });
          const matchedAlerts = (overview.alerts || []).filter(matchesSite).filter((a: SFCase) => {
            if (a.CreatedDate) {
              const yr = new Date(a.CreatedDate).getFullYear();
              if (!isNaN(yr) && yr < 2026) return false;
            }
            return isAlertCase(a) && isOpenAlert(a);
          });
          const matchedClosed = (overview.closedAlerts || []).filter(matchesSite);
          return {
            totalSize: matchedCases.length,
            done: true,
            records: matchedCases,
            alerts: matchedAlerts,
            closed: matchedClosed,
            product_lines: (site.product_lines as string[]) || [],
            product_line: site.product_line || null,
            site: site,
          };
        }
      } catch {}
      return undefined;
    },
    placeholderData: (prev) => {
      if (prev && (prev as any).site && ((prev as any).site.id === site?.id || (prev as any).site.name === site?.name)) {
        return prev;
      }
      return undefined;
    },
  });
  // sfLoading: true only on first load (no real data yet, or placeholder being shown during initial fetch)
  // NOT true during background 30s refreshes (sfFetching=true but sfIsPlaceholder=false means we have real data)
  const sfLoading = !sfData || (sfFetching && sfIsPlaceholder);

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
    return isClosedAlert(c);
  };

  // Timeframe calculation for filtering cases and alerts
  const timeWindow = useMemo(() => {
    const now = Date.now();
    if (siteTimeRange === '24h') {
      return { start: now - 24 * 3600 * 1000, end: now, isAll: false };
    }
    if (siteTimeRange === '48h') {
      return { start: now - 48 * 3600 * 1000, end: now, isAll: false };
    }
    if (siteTimeRange === '7d') {
      return { start: now - 7 * 86400 * 1000, end: now, isAll: false };
    }
    if (siteTimeRange === '15d') {
      return { start: now - 15 * 86400 * 1000, end: now, isAll: false };
    }
    if (siteTimeRange === '1m') {
      return { start: now - 30 * 86400 * 1000, end: now, isAll: false };
    }
    if (siteTimeRange === '2m') {
      return { start: now - 60 * 86400 * 1000, end: now, isAll: false };
    }
    if (siteTimeRange === '3m') {
      return { start: now - 90 * 86400 * 1000, end: now, isAll: false };
    }
    if (siteTimeRange === 'custom') {
      const startStr = `${appliedCustomRange.startDate}T${appliedCustomRange.startTime || '00:00'}:00`;
      const endStr = `${appliedCustomRange.endDate}T${appliedCustomRange.endTime || '23:59'}:59.999`;
      const sMs = new Date(startStr).getTime();
      const eMs = new Date(endStr).getTime();
      return {
        start: isNaN(sMs) ? 0 : sMs,
        end: isNaN(eMs) ? now : eMs,
        isAll: false,
      };
    }
    // 'all'
    return { start: 0, end: Infinity, isAll: true };
  }, [siteTimeRange, appliedCustomRange]);

  const matchesTimeWindow = useMemo(() => {
    return (item: SFCase) => {
      if (timeWindow.isAll) return true;
      const createdMs = item.CreatedDate ? new Date(item.CreatedDate).getTime() : 0;
      const closedMs = item.ClosedDate ? new Date(item.ClosedDate).getTime() : 0;
      const endStr = getTicketEndTime(item);
      const endMs = endStr ? new Date(endStr).getTime() : 0;
      const modifiedMs = item.LastModifiedDate ? new Date(item.LastModifiedDate).getTime() : 0;

      const ticketEventTime = endMs || closedMs || createdMs || modifiedMs;
      if (!ticketEventTime && !createdMs) return true;

      // In sliding windows (24h, 48h, 7d, etc.) or custom:
      return (
        (createdMs >= timeWindow.start && createdMs <= timeWindow.end) ||
        (ticketEventTime >= timeWindow.start && ticketEventTime <= timeWindow.end)
      );
    };
  }, [timeWindow]);

  // Extract matching alerts from global salesforce-overview cache so site workspace always reflects overview count
  const overviewAlertsForSite = useMemo(() => {
    try {
      const overview = queryClient.getQueryData<any>(['salesforce-overview']);
      if (!overview || !Array.isArray(overview.alerts) || !site?.name) return [];
      const compiled = compileSiteIndex(sites || []);
      const siteLower = site.name.trim().toLowerCase();
      return (overview.alerts as SFCase[]).filter(a => {
        if (!isAlertCase(a)) return false;
        const best = findBestSiteForCase(a, compiled);
        if (best && areSameSite(best, site.name, compiled)) return true;
        const loc = String(a.Customer_Location__c || a.Snow_Sitename__c || a.Site_Name_Customer_Input__c || a.Account_Name__c || (a as any).Account?.Name || '').trim().toLowerCase();
        if (loc && loc.length >= 3 && siteLower.length >= 3 && (loc.includes(siteLower) || areSameSite(loc, site.name, compiled))) return true;
        return false;
      });
    } catch {
      return [];
    }
  }, [queryClient, site?.name, sites]);

  // 1. Live Open Cases: strictly open cases (not closed, no end time, not alerts, not change requests, strictly year >= 2026)
  const allCases = useMemo(() => {
    const list = rawCases.filter(c => {
      if (c.CreatedDate) {
        const yr = new Date(c.CreatedDate).getFullYear();
        if (!isNaN(yr) && yr < 2026) return false;
      }
      return !isAlertCase(c) && isLiveOpenCase(c) && !isChangeRequestTicket(c) && !hasTicketEndTime(c) && !getTicketEndTime(c);
    });
    return list.filter(matchesTimeWindow);
  }, [rawCases, matchesTimeWindow]);

  // 2. Live Open Alerts: strictly open alert tickets (no end time, not closed, strictly year >= 2026)
  const openAlerts = useMemo(() => {
    const map = new Map<string, SFCase>();
    const isYear2026 = (item: SFCase) => {
      if (!item || !item.CreatedDate) return true;
      const yr = new Date(item.CreatedDate).getFullYear();
      return isNaN(yr) || yr >= 2026;
    };
    for (const a of rawAlerts) {
      if (isYear2026(a) && isAlertCase(a) && isOpenAlert(a) && a.Id) {
        map.set(a.Id, a);
      }
    }
    for (const c of rawCases) {
      if (isYear2026(c) && isAlertCase(c) && isOpenAlert(c) && c.Id) {
        map.set(c.Id, c);
      }
    }
    for (const a of overviewAlertsForSite) {
      if (isYear2026(a) && isAlertCase(a) && isOpenAlert(a) && a.Id) {
        map.set(a.Id, a);
      }
    }
    if (analyticsData?.alerts && Array.isArray(analyticsData.alerts)) {
      for (const a of analyticsData.alerts) {
        if (isYear2026(a) && isAlertCase(a) && isOpenAlert(a) && a.Id) {
          map.set(a.Id, a);
        }
      }
    }
    return Array.from(map.values()).filter(matchesTimeWindow);
  }, [rawAlerts, rawCases, overviewAlertsForSite, analyticsData?.alerts, matchesTimeWindow]);

  // Synchronize counts immediately into global React Query salesforce-overview & sites caches
  // so the site card on the main dashboard panel immediately matches this site workspace
  useEffect(() => {
    if (sfLoading || !site?.name) return;
    try {
      const sKey = site.name.trim().toLowerCase();
      queryClient.setQueryData(['salesforce-overview'], (prev: any) => {
        if (!prev || !prev.siteStats) return prev;
        const existing = prev.siteStats[sKey] || {};
        if (existing.count === allCases.length && existing.alertCount === openAlerts.length) return prev;
        return {
          ...prev,
          siteStats: {
            ...prev.siteStats,
            [sKey]: {
              ...existing,
              count: allCases.length,
              alertCount: openAlerts.length,
            },
          },
        };
      });

      queryClient.setQueryData(['sites'], (prevSites: any) => {
        if (!Array.isArray(prevSites)) return prevSites;
        return prevSites.map((s: Site) => {
          if (s.name?.trim().toLowerCase() === sKey) {
            return {
              ...s,
              open_cases_count: allCases.length,
              open_alerts_count: openAlerts.length,
            };
          }
          return s;
        });
      });
    } catch {}
  }, [allCases.length, openAlerts.length, site?.name, sfLoading, queryClient]);

  // 3. Closed Alerts: strictly closed alerts (by default ONLY past 24 hours; expands when timeframe selected)
  const closedAlerts = useMemo(() => {
    const map = new Map<string, SFCase>();
    for (const a of rawAlerts) {
      if (isAlertCase(a) && isClosedAlert(a) && a.Id) {
        map.set(a.Id, a);
      }
    }
    for (const c of rawClosed) {
      if (isAlertCase(c) && isClosedAlert(c) && c.Id) {
        map.set(c.Id, c);
      }
    }
    for (const c of rawCases) {
      if (isAlertCase(c) && isClosedAlert(c) && c.Id) {
        map.set(c.Id, c);
      }
    }
    for (const a of overviewAlertsForSite) {
      if (isAlertCase(a) && isClosedAlert(a) && a.Id) {
        map.set(a.Id, a);
      }
    }
    // Merge analyticsData alerts when a specific historical timeframe is selected
    if (siteTimeRange !== 'all' && analyticsData?.alerts && Array.isArray(analyticsData.alerts)) {
      for (const a of analyticsData.alerts) {
        if (isAlertCase(a) && isClosedAlert(a) && a.Id) {
          map.set(a.Id, a);
        }
      }
    }

    const allList = Array.from(map.values());

    // By default (when siteTimeRange is 'all' or default), closed alerts should ONLY show past 24 hours!
    if (siteTimeRange === 'all') {
      const past24hMs = Date.now() - 24 * 3600 * 1000;
      return allList.filter(item => {
        const closedMs = item.ClosedDate ? new Date(item.ClosedDate).getTime() : 0;
        const endStr = getTicketEndTime(item);
        const endMs = endStr ? new Date(endStr).getTime() : 0;
        const modifiedMs = item.LastModifiedDate ? new Date(item.LastModifiedDate).getTime() : 0;
        const createdMs = item.CreatedDate ? new Date(item.CreatedDate).getTime() : 0;
        const eventMs = endMs || closedMs || modifiedMs || createdMs;
        return eventMs >= past24hMs || isClosedToday(item);
      });
    }

    return allList.filter(matchesTimeWindow);
  }, [rawAlerts, rawClosed, rawCases, overviewAlertsForSite, analyticsData?.alerts, siteTimeRange, matchesTimeWindow]);

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
    if (analyticsData?.alerts && Array.isArray(analyticsData.alerts)) {
      for (const a of analyticsData.alerts) {
        if (isAlertCase(a) && a.Id) {
          map.set(a.Id, a);
        }
      }
    }
    return Array.from(map.values())
      .filter(matchesTimeWindow)
      .sort((a, b) => {
        const ta = a.CreatedDate ? new Date(a.CreatedDate).getTime() : 0;
        const tb = b.CreatedDate ? new Date(b.CreatedDate).getTime() : 0;
        return tb - ta;
      });
  }, [openAlerts, closedAlerts, rawAlerts, rawClosed, historicalAlerts, analyticsData?.alerts, matchesTimeWindow]);

  // When activeBucket is 'analytics', prioritize the exact alerts from analyticsData!
  const analyticsAlerts = useMemo(() => {
    if (analyticsData?.alerts && Array.isArray(analyticsData.alerts) && analyticsData.alerts.length > 0) {
      return analyticsData.alerts.filter(isAlertCase).filter(matchesTimeWindow);
    }
    return allSiteAlerts;
  }, [analyticsData?.alerts, allSiteAlerts, matchesTimeWindow]);

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
      const p = (activeBucket === 'alerts' || activeBucket === 'closed' || activeBucket === 'analytics'
        ? (c.Alert_Priority__c || c.Highest_Severity__c || c.Priority || '')
        : (c.Highest_Severity__c || c.Priority || '')).trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort();
  }, [activeItems, activeBucket]);

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

  const categoryCounts = useMemo(() => {
    let sw = 0;
    let hw = 0;
    for (const c of activeItems) {
      if (detectCaseCategory(c) === 'HARDWARE') {
        hw++;
      } else {
        sw++;
      }
    }
    return { SOFTWARE: sw, HARDWARE: hw };
  }, [activeItems]);

  const uniqueCategories = ['SOFTWARE', 'HARDWARE'];

  const uniqueAssignees = useMemo(() => {
    const set = new Set<string>();
    for (const c of activeItems) {
      set.add(getAssigneeDisplayName(c));
    }
    return Array.from(set).sort((a, b) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
  }, [activeItems]);

  // Filter items by search, status, severity, product, category, and assignee
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
        matchSeverity = detectSeverity(c) === 'sev1';
      } else if (severityFilter === 'SEV 2 URGENT') {
        const s = detectSeverity(c);
        matchSeverity = s === 'sev2' || (s as string) === 'sev2_urgent';
      } else if (severityFilter === 'SEV 2 HIGH') {
        matchSeverity = detectSeverity(c) === 'sev2_high';
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

      const catStr = detectCaseCategory(c);
      const matchCategory = activeBucket !== 'cases' || categoryFilter === 'All' || catStr.toUpperCase() === categoryFilter.toUpperCase();

      const assigneeStr = getAssigneeDisplayName(c);
      const matchAssignee = assigneeFilter === 'All' || assigneeStr.toLowerCase() === assigneeFilter.toLowerCase();

      return matchSearch && matchStatus && matchSeverity && matchProduct && matchCategory && matchAssignee;
    });
  }, [activeItems, caseSearch, statusFilter, severityFilter, productFilter, categoryFilter, assigneeFilter, siteProductLines, activeBucket]);

  // Reset display limit when switching bucket or applying filters for snappy O(1) response
  useEffect(() => {
    setDisplayLimit(40);
  }, [activeBucket, statusFilter, severityFilter, productFilter, categoryFilter, assigneeFilter, caseSearch, siteTimeRange]);

  // Windowed rendering slice: only mount initial 40 rows into DOM for instant responsiveness
  const visibleCases = useMemo(() => {
    return filteredCases.slice(0, displayLimit);
  }, [filteredCases, displayLimit]);

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

  const activeSiteItems = useMemo(() => {
    const map = new Map<string, SFCase>();
    for (const c of allCases) {
      if (c && c.Id) map.set(c.Id, c);
    }
    for (const a of openAlerts) {
      if (a && a.Id) map.set(a.Id, a);
    }
    return Array.from(map.values());
  }, [allCases, openAlerts]);

  const isCriticalSiteDown = allCases.some(c => Boolean(c.Is_Site_100_Down__c));
  // User requirement: automated IM tickets created for urgent cases count to ONLY one Sev 1 / Sev 2 (no double count)
  const { sev1Count, sev2Count } = useMemo(() => {
    return calculateSiteUrgentCounts(allCases);
  }, [allCases]);

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
                <Link
                  to="/red-zone"
                  search={{ site: site.name } as any}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(239, 68, 68, 0.16)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 4,
                    letterSpacing: '0.05em',
                    lineHeight: 1,
                    fontFamily: 'var(--font-mono)',
                    textDecoration: 'none',
                    boxShadow: '0 0 10px rgba(239, 68, 68, 0.25)',
                  }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
                  RED ZONE
                </Link>
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
                  setAssigneeFilter('All');
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
                  {sfLoading ? '…' : allCases.length}
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
                  setAssigneeFilter('All');
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
                  {sfLoading ? '…' : openAlerts.length}
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
                  setAssigneeFilter('All');
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
                title={siteTimeRange === 'all' ? "View closed alerts from past 24 hours" : `View closed alerts (${siteTimeRange})`}
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
                  setAssigneeFilter('All');
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
            {activeBucket !== 'analytics' && (severityFilter !== 'All' || productFilter !== 'All' || categoryFilter !== 'All' || assigneeFilter !== 'All' || statusFilter !== 'All' || caseSearch.trim().length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSeverityFilter('All');
                  setProductFilter('All');
                  setCategoryFilter('All');
                  setAssigneeFilter('All');
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
                ? (siteTimeRange === 'all'
                    ? 'Closed Alerts (Past 24 hours by default; select timeframe above to expand)'
                    : `Closed Alerts (${SITE_TIME_RANGES.find(r => r.key === siteTimeRange)?.label || siteTimeRange})`)
                : 'Alert Analytics & Telemetry (Created → Ended MTTR & Distribution)'}
            </span>
          </div>

          {/* Timeframe Scope Selector for Open Cases, Open Alerts, Closed Alerts, and Alert Analysis */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              background: 'color-mix(in oklch, var(--secondary) 65%, transparent)',
              borderBottom: '1px solid var(--border)',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--muted-foreground)',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Clock style={{ width: 11, height: 11, color: 'var(--soft-orange)' }} />
                TIMEFRAME:
              </span>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  background: 'var(--card)',
                  padding: '2px 4px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                }}
              >
                {SITE_TIME_RANGES.map(range => {
                  const isActive = siteTimeRange === range.key;
                  return (
                    <button
                      key={range.key}
                      type="button"
                      onClick={() => {
                        setSiteTimeRange(range.key);
                      }}
                      style={{
                        background: isActive ? 'var(--primary)' : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--muted-foreground)',
                        border: 'none',
                        borderRadius: 4,
                        padding: '3px 8px',
                        fontSize: 10.5,
                        fontWeight: isActive ? 700 : 500,
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

              {/* Custom Date & Time Picker */}
              {siteTimeRange === 'custom' && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'var(--card)',
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <Calendar style={{ width: 12, height: 12, color: 'var(--muted-foreground)' }} />
                  <span style={{ color: 'var(--muted-foreground)', fontSize: 9.5, fontWeight: 700 }}>FROM:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
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
                    value={customStartTime}
                    onChange={(e) => setCustomStartTime(e.target.value)}
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
                  <span style={{ color: 'var(--muted-foreground)', fontSize: 9.5, fontWeight: 700 }}>TO:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
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
                    value={customEndTime}
                    onChange={(e) => setCustomEndTime(e.target.value)}
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
                    onClick={() => {
                      const fullStart = `${customStartDate}T${customStartTime || '00:00'}`;
                      const fullEnd = `${customEndDate}T${customEndTime || '23:59'}`;
                      if (fullStart > fullEnd) {
                        alert('Start date & time must be before or equal to End date & time');
                        return;
                      }
                      setAppliedCustomRange({
                        startDate: customStartDate,
                        startTime: customStartTime,
                        endDate: customEndDate,
                        endTime: customEndTime,
                      });
                    }}
                    style={{
                      background: 'var(--primary)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 3,
                      padding: '3px 8px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    APPLY
                  </button>
                </div>
              )}
            </div>

            <div style={{ color: 'var(--muted-foreground)', fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
              {siteTimeRange === 'all'
                ? 'All live open cases & alerts (Closed alerts: past 24 hours)'
                : siteTimeRange === 'custom'
                ? `Window: ${appliedCustomRange.startDate} ${appliedCustomRange.startTime} → ${appliedCustomRange.endDate} ${appliedCustomRange.endTime}`
                : `Window: past ${SITE_TIME_RANGES.find(r => r.key === siteTimeRange)?.label || siteTimeRange}`}
            </div>
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
                selectedRange={siteTimeRange}
                onRangeChange={(r) => setSiteTimeRange(r as SiteTimeRangeKey)}
                customStartDate={appliedCustomRange.startDate}
                customStartTime={appliedCustomRange.startTime}
                customEndDate={appliedCustomRange.endDate}
                customEndTime={appliedCustomRange.endTime}
                onCustomRangeChange={(startDate, endDate, startTime, endTime) => {
                  setCustomStartDate(startDate);
                  if (startTime) setCustomStartTime(startTime);
                  setCustomEndDate(endDate);
                  if (endTime) setCustomEndTime(endTime);
                  setAppliedCustomRange({
                    startDate,
                    startTime: startTime || '00:00',
                    endDate,
                    endTime: endTime || '23:59',
                  });
                }}
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
                    {activeBucket === 'cases' && (
                      <>
                        <option value="SEV 1 URGENT" style={{ background: '#18191e', color: '#ef4444', fontWeight: 700 }}>
                          ● SEV 1 URGENT ({activeItems.filter(c => detectSeverity(c) === 'sev1').length})
                        </option>
                        <option value="SEV 2 URGENT" style={{ background: '#18191e', color: '#f59e0b', fontWeight: 700 }}>
                          ● SEV 2 URGENT ({activeItems.filter(c => { const s = detectSeverity(c); return s === 'sev2' || (s as string) === 'sev2_urgent'; }).length})
                        </option>
                        <option value="SEV 2 HIGH" style={{ background: '#18191e', color: '#c084fc', fontWeight: 700 }}>
                          ● SEV 2 HIGH ({activeItems.filter(c => detectSeverity(c) === 'sev2_high').length})
                        </option>
                      </>
                    )}
                    {uniqueSeverities
                      .filter(sev => sev !== 'SEV 1 URGENT' && sev !== 'SEV 2 URGENT' && sev !== 'SEV 2 HIGH')
                      .map(sev => (
                        <option key={sev} value={sev} style={{ background: '#18191e', color: '#fff' }}>
                          {sev} ({activeItems.filter(c => (c.Alert_Priority__c === sev || c.Highest_Severity__c === sev || c.Priority === sev)).length})
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
                      <option value="SOFTWARE" style={{ background: '#18191e', color: '#fff' }}>
                        SOFTWARE ({categoryCounts.SOFTWARE})
                      </option>
                      <option value="HARDWARE" style={{ background: '#18191e', color: '#fff' }}>
                        HARDWARE ({categoryCounts.HARDWARE})
                      </option>
                    </select>
                  </div>
                )}

                {/* Assigned To Filter Header */}
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <select
                    aria-label="Filter by Assigned To"
                    value={assigneeFilter}
                    onChange={e => setAssigneeFilter(e.target.value)}
                    style={{
                      background: assigneeFilter !== 'All' ? '#dc2626' : 'transparent',
                      color: assigneeFilter !== 'All' ? '#ffffff' : 'var(--muted-foreground)',
                      border: assigneeFilter !== 'All' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
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
                    title={assigneeFilter !== 'All' ? `Filtered by Assignee: ${assigneeFilter} (Click to change or reset)` : 'Click to filter by Assignee'}
                  >
                    <option value="All" style={{ background: '#18191e', color: '#fff' }}>
                      {assigneeFilter !== 'All' ? `ASSIGNED: ${assigneeFilter}` : 'ASSIGNED TO ▾'}
                    </option>
                    {assigneeFilter !== 'All' && (
                      <option value="All" style={{ background: '#18191e', color: '#f59e0b' }}>
                        ✕ Clear Filter (Show All)
                      </option>
                    )}
                    {uniqueAssignees.map(a => (
                      <option key={a} value={a} style={{ background: '#18191e', color: '#fff' }}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

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
                    <span>CREATED (START)</span>
                    <span>END TIME</span>
                    <span>DURATION (MTTR)</span>
                  </>
                ) : activeBucket === 'alerts' ? (
                  <>
                    <span>SITE / LOCATION</span>
                    <span>CREATED (START)</span>
                  </>
                ) : (
                  <>
                    <span>SITE / LOCATION</span>
                    <span>CREATED DATE &amp; TIME</span>
                  </>
                )}
              </div>

              {/* Table Body / Scroll Area */}
              <div
                className="panel-scroll"
                tabIndex={0}
                aria-label="Salesforce cases scrollable panel"
                onScroll={e => {
                  const target = e.currentTarget;
                  if (target.scrollHeight - target.scrollTop <= target.clientHeight + 80) {
                    if (displayLimit < filteredCases.length) {
                      setDisplayLimit(prev => Math.min(prev + 40, filteredCases.length));
                    }
                  }
                }}
              >
                {sfLoading ? (
                  <div className="source-empty">
                    <RefreshCw className="animate-spin" style={{ width: 28, height: 28, color: 'var(--blue)' }} />
                    <h3 style={{ marginTop: 14 }}>Fetching Salesforce cases…</h3>
                    <p>Retrieving active open cases for {site.name} from Salesforce org database.</p>
                  </div>
            ) : filteredCases.length > 0 ? (
              <div>
                {visibleCases.map(c => {
                  const isDown = Boolean(c.Is_Site_100_Down__c);
                  const raw = c as Record<string, unknown>;
                  const alertEndTime = getTicketEndTime(c) || c.ended_at || (raw['ended_at'] as string | undefined) || c.ClosedDate;
                  const hasEndTime = Boolean(alertEndTime);
                  const stLower = (c.Status || '').toLowerCase();
                  const isClosedStatus = stLower.includes('closed') || stLower.includes('solved') || stLower.includes('resolved');
                  const isHold = stLower.includes('hold');
                  const isProgress = stLower.includes('progress') || stLower.includes('assigned');
                  const isNew = stLower.includes('new');
                  const isInvestigating = stLower.includes('investigat');
                  const isClosedTodayAlert = !isHold && !isProgress && (isClosedStatus || (activeBucket === 'closed' || (hasEndTime && !isNew && !stLower.includes('open'))));
                  const durationInfo = calculateAlertDuration(
                    c.CreatedDate || c.created_at || (raw['created_at'] as string | undefined),
                    alertEndTime,
                    !isClosedTodayAlert
                  );
                  const statusClass = (activeBucket === 'closed' || isClosedStatus || isClosedTodayAlert)
                    ? 'status-resolved'
                    : isHold
                    ? 'status-hold'
                    : isNew
                    ? 'status-new'
                    : isProgress
                    ? 'status-progress'
                    : isInvestigating
                    ? 'status-investigating'
                    : 'status-other';

                  const isAlert = activeBucket === 'alerts' || activeBucket === 'closed' || activeBucket === 'analytics' || isAlertCase(c);
                  const sevType = isAlert ? 'sev3' : detectSeverity(c);
                  const isSev1Urgent = !isAlert && sevType === 'sev1';
                  const isSev2Urgent = !isAlert && (sevType === 'sev2' || (sevType as string) === 'sev2_urgent');
                  const isSev2High = !isAlert && sevType === 'sev2_high';

                  const alertPrio = String(c.Alert_Priority__c || c.Highest_Severity__c || c.Priority || 'P3').trim();
                  const priorityClass = isSev1Urgent
                    ? 'p-p1'
                    : isSev2Urgent
                    ? 'p-p2'
                    : isSev2High
                    ? 'p-p2-high'
                    : isAlert
                    ? (/p1|sev.*1|critical/i.test(alertPrio) ? 'p-p1' : /p2|sev.*2|high/i.test(alertPrio) ? 'p-p2' : 'p-p3')
                    : 'p-p3';

                  const priorityDisplay = isAlert
                    ? (c.Alert_Priority__c || c.Highest_Severity__c || c.Priority || 'P3')
                    : isSev1Urgent
                    ? 'SEV 1 URGENT'
                    : isSev2Urgent
                    ? 'SEV 2 URGENT'
                    : isSev2High
                    ? 'SEV 2 HIGH'
                    : String(c.Highest_Severity__c || c.Priority || 'Severity 3');

                  const productDisplay = String(c.Product_Type__c || c.product_line || c.Parent_Product_Type__c || siteProductType);
                  const categoryDisplay = detectCaseCategory(c);
                  const assignedDisplay = getAssigneeDisplayName(c);

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
                                isClosedTodayAlert || isClosedStatus
                                  ? { color: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.4)', background: 'rgba(34, 197, 94, 0.12)' }
                                  : undefined
                              }
                            >
                              {activeBucket === 'closed' ? (c.Status || 'Closed') : (c.Status || 'Open')}
                            </span>
                          </div>

                          {/* Created Time */}
                          <div className="case-date-cell" style={{ fontSize: 10, color: 'var(--foreground)' }}>
                            {formatPreciseTime(c.CreatedDate || c.created_at || (raw['created_at'] as string | undefined))}
                          </div>

                          {/* Ended Time */}
                          <div className="case-date-cell" style={{ fontSize: 10, color: alertEndTime ? 'var(--muted-foreground)' : '#ef4444' }}>
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
                              style={isClosedTodayAlert || isClosedStatus ? { color: '#22c55e', borderColor: 'oklch(0.7 0.15 140 / 0.4)', background: 'oklch(0.7 0.15 140 / 0.15)' } : undefined}
                            >
                              {c.Status || 'Open'}
                            </span>
                          </div>

                          {/* Site / Location */}
                          <div className="case-site-tag" title={String(c.Snow_Sitename__c || c.Customer_Location__c || site.name)}>
                            <MapPin style={{ width: 11, height: 11, flexShrink: 0 }} />
                            <span>
                              {String(c.Snow_Sitename__c || c.Customer_Location__c || site.name)}
                            </span>
                          </div>

                          {/* Created / Start Time */}
                          {(() => {
                            const p = formatDateTimeParts(c.CreatedDate || c.created_at || (raw['created_at'] as string | undefined));
                            return (
                              <div className="case-date-cell" style={{ display: 'flex', flexDirection: 'column', gap: 1 }} title={`Created (Start): ${p.full}`}>
                                <span style={{ fontSize: 10.5, color: '#ef4444', fontWeight: 600 }}>{p.date}</span>
                                <span style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>{p.time}</span>
                              </div>
                            );
                          })()}
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
                              {c.Status || 'Closed'}
                            </span>
                          </div>

                          {/* Created / Start Time */}
                          {(() => {
                            const p = formatDateTimeParts(c.CreatedDate || c.created_at || (raw['created_at'] as string | undefined));
                            return (
                              <div className="case-date-cell" style={{ display: 'flex', flexDirection: 'column', gap: 1 }} title={`Created (Start): ${p.full}`}>
                                <span style={{ fontSize: 10.5, color: 'var(--foreground)', fontWeight: 600 }}>{p.date}</span>
                                <span style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>{p.time}</span>
                              </div>
                            );
                          })()}

                          {/* End Time */}
                          {(() => {
                            const p = formatDateTimeParts(alertEndTime);
                            return (
                              <div className="case-date-cell" style={{ display: 'flex', flexDirection: 'column', gap: 1 }} title={`Ended: ${p.full}`}>
                                <span style={{ fontSize: 10.5, color: '#10b981', fontWeight: 600 }}>{p.date}</span>
                                <span style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>{p.time}</span>
                              </div>
                            );
                          })()}

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
                              {!isAlert && isSev1Urgent && (
                                <span className="case-down-badge" style={{ background: '#dc2626', color: '#fff', fontWeight: 800 }}>
                                  SEV 1 URGENT
                                </span>
                              )}
                              {!isAlert && isSev2Urgent && (
                                <span className="case-down-badge" style={{ background: '#d97706', color: '#fff', fontWeight: 800 }}>
                                  SEV 2 URGENT
                                </span>
                              )}
                              {!isAlert && isSev2High && (
                                <span className="case-down-badge" style={{ background: '#7e22ce', color: '#fff', fontWeight: 800 }}>
                                  SEV 2 HIGH
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
                          {activeBucket === 'cases' && (
                            <div className="case-category-cell" title={categoryDisplay}>
                              {categoryDisplay}
                            </div>
                          )}

                          {/* Assigned To */}
                          <div className="case-assignee-cell" title={assignedDisplay}>
                            <User style={{ width: 11, height: 11 }} />
                            <span>{assignedDisplay}</span>
                          </div>

                          {/* Status */}
                          <div>
                            <span
                              className={`case-status-badge ${statusClass}`}
                              style={isClosedTodayAlert || isClosedStatus ? { color: '#22c55e', borderColor: 'oklch(0.7 0.15 140 / 0.4)', background: 'oklch(0.7 0.15 140 / 0.15)' } : undefined}
                            >
                              {isClosedTodayAlert ? (c.Status || 'Closed (Today)') : (c.Status || 'Open')}
                            </span>
                          </div>

                          {/* Site / Location */}
                          <div className="case-site-tag" title={String(c.Snow_Sitename__c || c.Customer_Location__c || site.name)}>
                            <MapPin style={{ width: 11, height: 11, flexShrink: 0 }} />
                            <span>
                              {String(c.Snow_Sitename__c || c.Customer_Location__c || site.name)}
                            </span>
                          </div>

                          {/* Created Date & Time */}
                          {(() => {
                            const p = formatDateTimeParts(c.CreatedDate || c.created_at || (raw['created_at'] as string | undefined) || c.LastModifiedDate);
                            return (
                              <div
                                className="case-date-cell"
                                style={{ display: 'flex', flexDirection: 'column', gap: 1 }}
                                title={`Created: ${p.full}`}
                              >
                                <span style={{ color: 'var(--foreground)', fontWeight: 600, fontSize: 10.5 }}>{p.date}</span>
                                <span style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>{p.time}</span>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  );
                })}
                {displayLimit < filteredCases.length && (
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <button
                      type="button"
                      onClick={() => setDisplayLimit(prev => Math.min(prev + 40, filteredCases.length))}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        padding: '4px 12px',
                        fontSize: 11,
                        color: 'var(--muted-foreground)',
                        cursor: 'pointer',
                      }}
                    >
                      Load more ({filteredCases.length - displayLimit} remaining)
                    </button>
                  </div>
                )}
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
                    ? `All support tickets for ${site.name} are resolved. Excludes alerts.`
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
                  {analyticsData?.totalAlerts ?? allSiteAlerts.length} total alerts analyzed in {analyticsData?.rangeLabel || SITE_TIME_RANGES.find(r => r.key === siteTimeRange)?.label || siteTimeRange} window
                </span>
                <span>Telemetry Source: Salesforce Org (Live)</span>
              </>
            ) : (
              <>
                <span>
                  {Math.min(displayLimit, filteredCases.length)} of {filteredCases.length}{' '}
                  {activeBucket === 'cases'
                    ? 'open cases'
                    : activeBucket === 'alerts'
                    ? 'open alerts'
                    : 'closed alerts'}{' '}
                  displayed {filteredCases.length > displayLimit ? '• scroll to load more' : ''}
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
                  {detectCaseCategory(selectedCase)}
                </p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Assigned To</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>
                  {getAssigneeDisplayName(selectedCase)}
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
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Site / Location</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>
                  {String(selectedCase.Snow_Sitename__c || selectedCase.Customer_Location__c || site.name)}
                </p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Created Date &amp; Time</span>
                <p style={{ margin: '3px 0 0', fontWeight: 600, color: 'var(--foreground)' }}>
                  {formatDateTimeParts(selectedCase.CreatedDate || selectedCase.created_at || selectedCase.LastModifiedDate).full}
                </p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Last Updated</span>
                <p style={{ margin: '3px 0 0', fontWeight: 500 }}>
                  {formatDateTimeParts(selectedCase.LastModifiedDate).full}
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