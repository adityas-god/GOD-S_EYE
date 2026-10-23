import { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
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
  CheckCircle2,
  ShieldAlert,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DashboardShell } from '@/components/dashboard-shell';
import { ConnectionsDialog, DeleteSiteDialog, SiteEditor, SignInDialog } from '@/components/dashboard-dialogs';
import { useAuth } from '@/components/auth-context';
import { sitesQueryOptions, type Site } from '@/lib/sites';
import { updateSiteProductLines } from '@/lib/sites.functions';
import {
  sfSyncOrgSites,
  sfFetchLiveCasesOverview,
  type SFCase,
  isAlertCase,
  detectSeverity,
  isImTicket,
  isDirTicket,
  isChangeRequestTicket,
  isIncidentTicket,
  isLiveOpenCase,
  isOpenAlert,
  isClosedAlert,
  getTicketEndTime,
  hasTicketEndTime,
  isTodayDate,
  compileSites,
  findBestSiteForCase,
  areSameSite,
  calculateAlertDuration,
  KNOWN_SITE_ALIASES,
  normalizeCanonical,
  type SiteCaseStat,
  getAssigneeDisplayName,
} from '@/integrations/salesforce/client';
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
  const { data: baseSites = [] } = useQuery({
    ...sitesQueryOptions(),
    placeholderData: (prev) => prev,
  });
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
  const [activeBucket, setActiveBucket] = useState<'cases' | 'alerts' | 'closed'>('cases');
  const [selectedCase, setSelectedCase] = useState<SFCase | null>(null);
  const [ticketsCollapsed, setTicketsCollapsed] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [activeAddSite, setActiveAddSite] = useState<EnrichedSite | null>(null);
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; right: number } | null>(null);
  const [customProductInput, setCustomProductInput] = useState('');

  // Fetch live cases stats across the entire org (excludes alerts & solved/on-hold)
  const {
    data: sfOverview,
    isFetching: sfFetching,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['salesforce-overview'],
    queryFn: () => sfFetchLiveCasesOverview(false),
    placeholderData: (prev) => prev,
    staleTime: 10_000,
    refetchInterval: 30_000, // automatic live background refresh every 30 seconds
    refetchOnWindowFocus: true, // auto-refresh whenever browser tab is focused
  });

  const refetchOverviewRef = useRef(refetchOverview);
  refetchOverviewRef.current = refetchOverview;

  // Real-time synchronization via SSE from backend if available (stable listener)
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/webhooks/events');
      es.addEventListener('case_update', () => {
        void refetchOverviewRef.current();
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
  }, [queryClient]);

  // Heavy enrichment & dynamic ranking: only runs when baseSites or sfOverview changes!
  // Completely isolated from search bar typing to prevent CPU lag on VMs.
  const enrichedSites = useMemo(() => {
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
    const statsMap = (sfOverview?.siteStats || {}) as Record<string, SiteCaseStat>;
    const statsEntries = Object.entries(statsMap);
    // Only compare entries that actually have cases, alerts, or downtime
    const activeStatsEntries = statsEntries.filter(([_, rawV]) => {
      const v = rawV as SiteCaseStat;
      return (v.count || 0) > 0 || (v.alertCount || 0) > 0 || Boolean(v.isDown) || (v.caseNumbers && v.caseNumbers.length > 0);
    });

    const enriched: EnrichedSite[] = uniqueSites.map(site => {
      const siteLower = site.name.trim().toLowerCase();
      let stats: SiteCaseStat | undefined = statsMap[siteLower];
      if (sfOverview?.siteStats) {
        // Collect and merge all matching stats entries for this site (handles aliases and host names)
        let mergedStats: SiteCaseStat | null = stats ? { ...stats, caseNumbers: [...(stats.caseNumbers || [])] } : null;
        for (const [k, rawV] of activeStatsEntries) {
          const v = rawV as SiteCaseStat;
          if (k !== siteLower && areSameSite(k, site.name)) {
            if (!mergedStats) {
              mergedStats = { ...v, caseNumbers: [...(v.caseNumbers || [])] };
            } else {
              mergedStats.count = (mergedStats.count || 0) + (v.count || 0);
              mergedStats.alertCount = (mergedStats.alertCount || 0) + (v.alertCount || 0);
              mergedStats.isDown = Boolean(mergedStats.isDown || v.isDown);
              mergedStats.sev1Count = Math.max(mergedStats.sev1Count || 0, v.sev1Count || 0);
              mergedStats.sev2Count = Math.max(mergedStats.sev2Count || 0, v.sev2Count || 0);
              mergedStats.sev3Count = (mergedStats.sev3Count || 0) + (v.sev3Count || 0);
              for (const cn of v.caseNumbers || []) {
                if (!mergedStats.caseNumbers.includes(cn)) {
                  mergedStats.caseNumbers.push(cn);
                }
              }
              if (v.product_lines && v.product_lines.length > 0) {
                const combined = new Set([...(mergedStats.product_lines || []), ...v.product_lines]);
                mergedStats.product_lines = Array.from(combined);
              }
            }
          }
        }
        if (mergedStats) stats = mergedStats;
      }

      const openCount = stats ? stats.count : (site.open_cases_count ?? 0);
      const alertCount = stats ? (stats.alertCount ?? 0) : 0;
      const isDown = stats ? stats.isDown : (site.is_down ?? false);
      const caseNumbers = stats?.caseNumbers ?? [];
      const sev1Count = stats ? (stats.sev1Count ?? 0) : 0;
      const sev2Count = stats ? (stats.sev2Count ?? 0) : 0;
      const sev3Count = stats ? (stats.sev3Count ?? 0) : 0;

      const productLines = (site.product_lines !== undefined)
        ? (Array.isArray(site.product_lines) ? site.product_lines : [])
        : (site.product_line
        ? site.product_line.split(',').map(x => x.trim()).filter(Boolean)
        : (stats?.product_lines && stats.product_lines.length > 0 ? stats.product_lines : ['RMS']));

      return {
        ...site,
        product_lines: productLines,
        product_line: productLines.join(', '),
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

    return enriched;
  }, [baseSites, sfOverview]);

  // Deferred search value allows 60fps responsive typing on low-spec VMs
  const deferredSearch = useDeferredValue(search);

  // Fast sub-millisecond filtering on keystrokes
  const sortedAndFilteredSites = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const isAll = product === 'All products';
    const normProduct = isAll ? '' : product.toUpperCase().replace(/[\s_-]+/g, '');

    if (!q && isAll) return enrichedSites;

    return enrichedSites.filter(s => {
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (!isAll) {
        const siteProds = (s.product_lines && s.product_lines.length > 0)
          ? s.product_lines.map(p => p.toUpperCase().replace(/[\s_-]+/g, ''))
          : (s.product_line || '').toUpperCase().replace(/[\s_-]+/g, '').split(',');
        const matchesProduct = siteProds.some(p => p.includes(normProduct) || normProduct.includes(p));
        if (!matchesProduct) return false;
      }
      return true;
    });
  }, [enrichedSites, deferredSearch, product]);

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

  // Strictly filter cases with end-time logic (no end time, no closed/hold status, no alerts, no DIR)
  // Aligns with site workspace panel: counts all live open cases
  const openCases = useMemo(() => {
    return (sfOverview?.cases ?? []).filter(c => 
      isLiveOpenCase(c) && 
      !isChangeRequestTicket(c) &&
      !hasTicketEndTime(c) && 
      !getTicketEndTime(c)
    );
  }, [sfOverview?.cases]);

  // Strictly filter alerts: only open alerts (no end time, no closed/hold status)
  const openAlerts = useMemo(() => {
    const list = [
      ...(sfOverview?.alerts ?? []),
      ...(sfOverview?.cases ?? []).filter(c => isAlertCase(c) && isOpenAlert(c)),
    ];
    const map = new Map<string, SFCase>();
    for (const a of list) {
      if (a && a.Id) map.set(a.Id, a);
    }
    return Array.from(map.values());
  }, [sfOverview?.alerts, sfOverview?.cases]);

  // Closed alerts: alerts with end time or closed status
  const closedAlerts = useMemo(() => {
    const list = [
      ...(sfOverview?.closedAlerts ?? []),
      ...(sfOverview?.alerts ?? []).filter(isClosedAlert),
      ...(sfOverview?.cases ?? []).filter(c => isAlertCase(c) && isClosedAlert(c)),
    ];
    const map = new Map<string, SFCase>();
    for (const c of list) {
      if (c && c.Id) map.set(c.Id, c);
    }
    return Array.from(map.values());
  }, [sfOverview]);

  const totalOpenCases = sfOverview?.totalLiveCases !== undefined && sfOverview.totalLiveCases <= openCases.length
    ? sfOverview.totalLiveCases
    : openCases.length;
  const totalOpenAlerts = openAlerts.length;

  const totalActiveSev1 = useMemo(() => {
    return enrichedSites.reduce((sum, s) => sum + (s.sev1_count ?? 0), 0);
  }, [enrichedSites]);

  const totalActiveSev2 = useMemo(() => {
    return enrichedSites.reduce((sum, s) => sum + (s.sev2_count ?? 0), 0);
  }, [enrichedSites]);
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

  // Top 4 sites with the most issues across workspace (decoupled from search filter)
  const top4IssueSiteIds = useMemo(() => {
    const withIssues = enrichedSites.filter(
      s => (s.open_cases_count ?? 0) > 0 || (s.open_alerts_count ?? 0) > 0 || Boolean(s.is_down)
    );
    return new Set(withIssues.slice(0, 4).map(s => s.id));
  }, [enrichedSites]);

  const compiledSitesList = useMemo(() => compileSites(baseSites), [baseSites]);

  const siteNameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of baseSites) {
      if (!s?.name) continue;
      map.set(s.name.toLowerCase(), s.id);
      map.set(normalizeCanonical(s.name), s.id);
      const aliases = KNOWN_SITE_ALIASES[s.name] || [];
      for (const alias of aliases) {
        map.set(alias.toLowerCase(), s.id);
        map.set(normalizeCanonical(alias), s.id);
      }
    }
    return map;
  }, [baseSites]);

  const isTicketFromToday = (c: SFCase) => {
    const candidates = [c.CreatedDate, c.ClosedDate, c.End_Time__c, c.end_time, c.LastModifiedDate].filter(Boolean) as string[];
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

  const todayCasesCount = openCases.length;
  const todayAlertsCount = openAlerts.length;
  const todayClosedAlertsCount = closedAlerts.length;

  const currentBucketItems = useMemo(() => {
    return activeBucket === 'cases' ? openCases : activeBucket === 'alerts' ? openAlerts : closedAlerts;
  }, [activeBucket, openCases, openAlerts, closedAlerts]);

  // Pre-index ticket to site mapping once per bucket update so JSX render loop is O(1)
  const ticketSiteMap = useMemo(() => {
    const map = new Map<string, { siteDisplay: string; matchedSiteId?: string | undefined }>();
    for (const c of currentBucketItems) {
      if (!c?.Id) continue;
      const mappedSiteName = findBestSiteForCase(c, compiledSitesList);
      const siteDisplay = mappedSiteName || String(c.Snow_Sitename__c || c.Customer_Location__c || c.Site_Name_Customer_Input__c || c.Account_Name__c || 'GreyOrange Org');
      const matchedSiteId = siteNameToId.get(siteDisplay.toLowerCase()) || siteNameToId.get(normalizeCanonical(siteDisplay));
      map.set(c.Id, { siteDisplay, matchedSiteId });
    }
    return map;
  }, [currentBucketItems, compiledSitesList, siteNameToId]);

  const uniqueSeverities = useMemo(() => {
    const set = new Set<string>();
    for (const c of currentBucketItems) {
      const p = (activeBucket === 'alerts'
        ? (c.Alert_Priority__c || c.Highest_Severity__c || c.Priority || '')
        : (c.Highest_Severity__c || c.Priority || '')).trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort();
  }, [currentBucketItems, activeBucket]);

  const sev1CountInBucket = useMemo(() => {
    return currentBucketItems.filter(c => detectSeverity(c) === 'sev1').length;
  }, [currentBucketItems]);

  const sev2CountInBucket = useMemo(() => {
    return currentBucketItems.filter(c => {
      const s = detectSeverity(c);
      return s === 'sev2' || (s as string) === 'sev2_urgent';
    }).length;
  }, [currentBucketItems]);

  const sev2HighCountInBucket = useMemo(() => {
    return currentBucketItems.filter(c => detectSeverity(c) === 'sev2_high').length;
  }, [currentBucketItems]);

  const severityCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const sev of uniqueSeverities) {
      const sfLower = sev.toLowerCase();
      let count = 0;
      for (const c of currentBucketItems) {
        const p1 = (c.Highest_Severity__c || '').trim().toLowerCase();
        const p2 = (c.Priority || '').trim().toLowerCase();
        const p3 = (c.Alert_Priority__c || '').trim().toLowerCase();
        if (p1 === sfLower || p2 === sfLower || p3 === sfLower) {
          count++;
        }
      }
      map.set(sev, count);
    }
    return map;
  }, [uniqueSeverities, currentBucketItems]);

  const uniqueProducts = useMemo(() => {
    const set = new Set<string>();
    for (const c of currentBucketItems) {
      const p = String(c.Product_Type__c || c.product_line || c.Parent_Product_Type__c || '').trim();
      if (p && !['null', 'undefined', 'all', 'none', 'n/a'].includes(p.toLowerCase())) {
        set.add(p);
      }
    }
    return Array.from(set).sort();
  }, [currentBucketItems]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    for (const c of currentBucketItems) {
      const cat = String(c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support').trim();
      if (cat && !['null', 'undefined', 'all', 'none', 'n/a'].includes(cat.toLowerCase())) {
        set.add(cat);
      }
    }
    return Array.from(set).sort();
  }, [currentBucketItems]);

  const uniqueAssignees = useMemo(() => {
    const set = new Set<string>();
    for (const c of currentBucketItems) {
      set.add(getAssigneeDisplayName(c));
    }
    return Array.from(set).sort((a, b) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
  }, [currentBucketItems]);

  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const c of currentBucketItems) {
      const s = String(c.Status || '').trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort();
  }, [currentBucketItems]);

  // Filter tickets with severity, product, category, assignee, and status filters
  const currentOrgTickets: SFCase[] = useMemo(() => {
    const filtered = currentBucketItems.filter(c => {
      // 1. Severity filter
      if (severityFilter === 'SEV 1 URGENT') {
        if (detectSeverity(c) !== 'sev1') return false;
      } else if (severityFilter === 'SEV 2 URGENT') {
        const s = detectSeverity(c);
        if (s !== 'sev2' && (s as string) !== 'sev2_urgent') return false;
      } else if (severityFilter === 'SEV 2 HIGH') {
        if (detectSeverity(c) !== 'sev2_high') return false;
      } else if (severityFilter !== 'All') {
        const p1 = (c.Highest_Severity__c || '').trim().toLowerCase();
        const p2 = (c.Priority || '').trim().toLowerCase();
        const p3 = (c.Alert_Priority__c || '').trim().toLowerCase();
        const sfLower = severityFilter.toLowerCase();
        if (p1 !== sfLower && p2 !== sfLower && p3 !== sfLower) return false;
      }

      // 2. Product filter
      if (productFilter !== 'All') {
        const prod = String(c.Product_Type__c || c.product_line || c.Parent_Product_Type__c || 'RMS').trim().toLowerCase();
        if (prod !== productFilter.toLowerCase()) return false;
      }

      // 3. Category filter (only applicable for cases view)
      if (categoryFilter !== 'All' && activeBucket === 'cases') {
        const cat = String(c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support').trim().toLowerCase();
        if (cat !== categoryFilter.toLowerCase()) return false;
      }

      // 4. Assignee filter
      if (assigneeFilter !== 'All') {
        const assignee = getAssigneeDisplayName(c);
        if (assignee.toLowerCase() !== assigneeFilter.toLowerCase()) return false;
      }

      // 5. Status filter
      if (statusFilter !== 'All') {
        const st = String(c.Status || '').trim().toLowerCase();
        if (st !== statusFilter.toLowerCase()) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const timeA = a.CreatedDate || a.LastModifiedDate ? new Date(a.CreatedDate || a.LastModifiedDate || '').getTime() : 0;
      const timeB = b.CreatedDate || b.LastModifiedDate ? new Date(b.CreatedDate || b.LastModifiedDate || '').getTime() : 0;
      return timeB - timeA;
    });
  }, [currentBucketItems, severityFilter, productFilter, categoryFilter, assigneeFilter, statusFilter, activeBucket]);

  const formatPreciseTime = (isoString?: string | null): string => {
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
  };

  // Pre-computed ticket view models for O(1) instant rendering without re-parsing on every frame
  const ticketViewModels = useMemo(() => {
    return currentOrgTickets.map(c => {
      const isDown = Boolean(c.Is_Site_100_Down__c);
      const raw = c as Record<string, unknown>;
      const alertEndTime = getTicketEndTime(c) || c.ended_at || (raw['ended_at'] as string | undefined) || c.ClosedDate;
      const stLower = (c.Status || '').toLowerCase();
      const isClosedTodayAlert = stLower.includes('closed') || stLower.includes('solved') || stLower.includes('resolved') || Boolean(alertEndTime);
      const statusClass = isClosedTodayAlert
        ? 'status-resolved'
        : stLower.includes('new')
        ? 'status-new'
        : stLower.includes('progress')
        ? 'status-progress'
        : stLower.includes('investigat')
        ? 'status-investigating'
        : stLower.includes('hold')
        ? 'status-hold'
        : 'status-other';

      const isAlert = activeBucket === 'alerts' || isAlertCase(c);
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

      const productDisplay = String(c.Product_Type__c || c.product_line || c.Parent_Product_Type__c || 'RMS');
      const categoryDisplay = String(c.Category__c || c.Snow_Category__c || c.Category || c.Type || 'Technical Support');
      const assignedDisplay = getAssigneeDisplayName(c);
      
      const cachedSite = c?.Id ? ticketSiteMap.get(c.Id) : undefined;
      const siteDisplay = cachedSite?.siteDisplay || findBestSiteForCase(c, compiledSitesList) || String(c.Snow_Sitename__c || c.Customer_Location__c || c.Site_Name_Customer_Input__c || c.Account_Name__c || 'GreyOrange Org');
      const matchedSiteId = cachedSite ? cachedSite.matchedSiteId : (siteNameToId.get(siteDisplay.toLowerCase()) || siteNameToId.get(normalizeCanonical(siteDisplay)));

      const fromToday = isTicketFromToday(c);
      const durationInfo = calculateAlertDuration(
        c.CreatedDate || c.created_at || (raw['created_at'] as string | undefined),
        alertEndTime,
        !isClosedTodayAlert
      );

      const createdTimeFormatted = formatPreciseTime(c.CreatedDate || c.created_at || (raw['created_at'] as string | undefined));
      const endTimeFormatted = alertEndTime ? formatPreciseTime(alertEndTime) : '—';
      const dateVal = c.CreatedDate || c.LastModifiedDate;
      const casesDateFormatted = fromToday
        ? (dateVal ? new Date(dateVal).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Today')
        : (dateVal ? new Date(dateVal).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');

      return {
        c,
        isDown,
        isAlert,
        raw,
        alertEndTime,
        isClosedTodayAlert,
        statusClass,
        sevType,
        isSev1Urgent,
        isSev2Urgent,
        isSev2High,
        priorityClass,
        priorityDisplay,
        productDisplay,
        categoryDisplay,
        assignedDisplay,
        siteDisplay,
        matchedSiteId,
        fromToday,
        durationInfo,
        createdTimeFormatted,
        endTimeFormatted,
        casesDateFormatted,
      };
    });
  }, [currentOrgTickets, ticketSiteMap, compiledSitesList, siteNameToId, activeBucket]);

  const handleRemoveProduct = async (site: EnrichedSite, prodToRemove: string) => {
    const currentLines = (site.product_lines && site.product_lines.length > 0)
      ? site.product_lines
      : (site.product_line ? site.product_line.split(',').map(x => x.trim()).filter(Boolean) : []);

    const newLines = currentLines.filter(p => p.toLowerCase() !== prodToRemove.toLowerCase());

    // Optimistic cache update for ['sites']
    queryClient.setQueryData<Site[]>(['sites'], (old = []) => {
      return old.map(s => {
        if (s.id === site.id || s.name.trim().toLowerCase() === site.name.trim().toLowerCase()) {
          return {
            ...s,
            product_lines: newLines,
            product_line: newLines.join(', '),
          };
        }
        return s;
      });
    });

    // Optimistic update for ['salesforce-overview']
    queryClient.setQueryData<any>(['salesforce-overview'], (old: any) => {
      if (!old || !old.siteStats) return old;
      const key = site.name.trim().toLowerCase();
      const existingStat = old.siteStats[key];
      if (!existingStat) return old;
      return {
        ...old,
        siteStats: {
          ...old.siteStats,
          [key]: {
            ...existingStat,
            product_lines: newLines,
            product_line: newLines.join(', '),
          },
        },
      };
    });

    toast.success(`Removed ${prodToRemove} from ${site.name}`);

    try {
      const ok = await updateSiteProductLines(site.id, newLines);
      if (!ok) {
        toast.error(`Failed to persist removal to server, re-syncing`);
        void queryClient.invalidateQueries({ queryKey: ['sites'] });
      }
    } catch (err) {
      toast.error(`Error saving changes: ${(err as Error).message}`);
      void queryClient.invalidateQueries({ queryKey: ['sites'] });
    }
  };

  const handleAddProduct = async (site: EnrichedSite, newProdRaw: string) => {
    const newProd = newProdRaw.trim();
    if (!newProd) return;

    const currentLines = (site.product_lines && site.product_lines.length > 0)
      ? site.product_lines
      : (site.product_line ? site.product_line.split(',').map(x => x.trim()).filter(Boolean) : []);

    if (currentLines.some(p => p.toLowerCase() === newProd.toLowerCase())) {
      toast.info(`${newProd} is already added to ${site.name}`);
      setActiveAddSite(null);
      setPopoverCoords(null);
      return;
    }

    const newLines = [...currentLines, newProd];
    setActiveAddSite(null);
    setPopoverCoords(null);

    // Optimistic cache update for ['sites']
    queryClient.setQueryData<Site[]>(['sites'], (old = []) => {
      return old.map(s => {
        if (s.id === site.id || s.name.trim().toLowerCase() === site.name.trim().toLowerCase()) {
          return {
            ...s,
            product_lines: newLines,
            product_line: newLines.join(', '),
          };
        }
        return s;
      });
    });

    // Optimistic update for ['salesforce-overview']
    queryClient.setQueryData<any>(['salesforce-overview'], (old: any) => {
      if (!old || !old.siteStats) return old;
      const key = site.name.trim().toLowerCase();
      const existingStat = old.siteStats[key];
      if (!existingStat) return old;
      return {
        ...old,
        siteStats: {
          ...old.siteStats,
          [key]: {
            ...existingStat,
            product_lines: newLines,
            product_line: newLines.join(', '),
          },
        },
      };
    });

    toast.success(`Added ${newProd} to ${site.name}`);

    try {
      const ok = await updateSiteProductLines(site.id, newLines);
      if (!ok) {
        toast.error(`Failed to persist to server, re-syncing`);
        void queryClient.invalidateQueries({ queryKey: ['sites'] });
      }
    } catch (err) {
      toast.error(`Error saving changes: ${(err as Error).message}`);
      void queryClient.invalidateQueries({ queryKey: ['sites'] });
    }
  };

  const renderSiteCard = (site: EnrichedSite, i: number) => {
    const casesCount = site.open_cases_count ?? 0;
    const alertsCount = site.open_alerts_count ?? 0;
    const hasCases = casesCount > 0;
    const hasAlerts = alertsCount > 0;
    const sev1Count = site.sev1_count ?? 0;
    const sev2Count = site.sev2_count ?? 0;
    const hasSev1 = sev1Count > 0;
    const hasSev2 = sev2Count > 0;
    const hasUrgent = hasSev1 || hasSev2;
    const isUrgentThresholdMet = hasUrgent || Boolean(site.is_down);

    return (
      <article
        className={`site-card ${isUrgentThresholdMet ? 'site-card-paper site-card-highlight-red' : ''} ${activeAddSite?.id === site.id ? 'active-popover' : ''}`}
        key={site.id}
      >
        <Button asChild variant="site">
          <Link to="/sites/$siteId" params={{ siteId: site.id }} preload={false}>
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

            {/* Dynamic Product Badges: List view allows interactive add/delete; Grid (square boxes) view displays clean static badges only */}
            {view === 'list' ? (
              <div
                className="site-product-badges-container"
                style={{
                  display: 'flex',
                  gap: 4,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  margin: 0,
                  position: 'relative',
                }}
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {(site.product_lines && site.product_lines.length > 0
                  ? site.product_lines
                  : site.product_line ? site.product_line.split(',').map(p => p.trim()).filter(Boolean) : []
                ).map(prod => (
                  <span
                    key={prod}
                    className="case-product-pill site-product-pill-editable"
                    title="Double-click to remove"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDoubleClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleRemoveProduct(site, prod);
                    }}
                  >
                    {prod}
                  </span>
                ))}

                {/* Minimalistic soft add button (list view only) */}
                <button
                  type="button"
                  className="soft-product-add-btn"
                  title="Add product type"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (activeAddSite?.id === site.id) {
                      setActiveAddSite(null);
                      setPopoverCoords(null);
                    } else {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const popoverHeight = 175;
                      const rightOffset = Math.max(12, window.innerWidth - rect.right);
                      const topOffset = rect.bottom + popoverHeight > window.innerHeight
                        ? Math.max(12, rect.top - popoverHeight - 6)
                        : rect.bottom + 6;
                      setPopoverCoords({ top: topOffset, right: rightOffset });
                      setActiveAddSite(site);
                      setCustomProductInput('');
                    }
                  }}
                  onDoubleClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <Plus style={{ width: 10, height: 10 }} />
                </button>
              </div>
            ) : (
              /* Grid / Square boxes view: Purely static product pills, NO edit options or add buttons */
              ((site.product_lines && site.product_lines.length > 0) || site.product_line) && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, marginBottom: 8 }}>
                  {(site.product_lines && site.product_lines.length > 0
                    ? site.product_lines
                    : site.product_line ? site.product_line.split(',').map(p => p.trim()).filter(Boolean) : []
                  ).map(prod => (
                    <span
                      key={prod}
                      className="case-product-pill"
                    >
                      {prod}
                    </span>
                  ))}
                </div>
              )
            )}

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
              <p style={{ margin: 0 }}>Every site. Every alert. Dynamic ranking by live open tickets.</p>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: '#22c55e',
                  background: 'rgba(34, 197, 94, 0.1)',
                  padding: '2px 7px',
                  borderRadius: 4,
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                }}
                title="Connected directly to GreyOrange Salesforce org API"
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                LIVE SF
              </span>
              {sfOverview?.timestamp && (
                <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'var(--font-mono)' }} title={`Last refreshed: ${sfOverview.timestamp}`}>
                  Synced: {new Date(sfOverview.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="outline"
              onClick={async () => {
                setSyncingOrg(true);
                try {
                  toast.info('Fetching live data directly from Salesforce…');
                  await sfFetchLiveCasesOverview(true);
                  await queryClient.invalidateQueries({ queryKey: ['salesforce-overview'] });
                  await queryClient.invalidateQueries({ queryKey: ['sites'] });
                  await refetchOverview();
                  toast.success('Dashboard updated with live Salesforce data.');
                } catch (err) {
                  toast.error(`Salesforce fetch notice: ${(err as Error).message}`);
                } finally {
                  setSyncingOrg(false);
                }
              }}
              disabled={syncingOrg || sfFetching}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40 }}
              title="Query live tickets directly from Salesforce org API right now"
            >
              <RefreshCw className={syncingOrg || sfFetching ? 'animate-spin' : ''} style={{ width: 14, height: 14 }} />
              <span>{syncingOrg || sfFetching ? 'Fetching Live SF…' : 'Fetch Live SF'}</span>
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
              <span>{totalOpenAlerts > 0 ? 'active live open alerts' : 'all sites alert-free'}</span>
            </div>
            <div className="metric-foot">
              <span className="source-dot" style={{ background: totalOpenAlerts > 0 ? '#ef4444' : '#22c55e' }} />
              {totalOpenAlerts > 0 ? `${sitesWithAlerts.length} ${sitesWithAlerts.length === 1 ? 'site' : 'sites'} with alerts` : 'All sites alert-free'}
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
          <div 
            className="metric" 
            style={{ cursor: 'pointer' }}
            title="Click to view live urgent cases in the table below"
            onClick={() => {
              setActiveBucket('cases');
              if (severityFilter === 'All') {
                setSeverityFilter(totalActiveSev1 > 0 ? 'SEV 1 URGENT' : 'SEV 2 URGENT');
              } else {
                setSeverityFilter('All');
              }
            }}
          >
            <span className="metric-label">
              <ShieldAlert style={{ width: 14, height: 14, color: totalActiveSev1 > 0 ? '#ef4444' : totalActiveSev2 > 0 ? '#f59e0b' : 'var(--muted-foreground)' }} />
              Active urgent cases
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: totalActiveSev1 > 0 ? '#ef4444' : 'var(--muted-foreground)' }}>
                  SEV 1 URGENT :
                </span>
                <strong className={totalActiveSev1 > 0 ? '' : 'metric-dash'} style={{ fontSize: 24, fontWeight: 450, color: totalActiveSev1 > 0 ? '#ef4444' : undefined, lineHeight: 1 }}>
                  {totalActiveSev1}
                </strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: totalActiveSev2 > 0 ? '#f59e0b' : 'var(--muted-foreground)' }}>
                  SEV 2 URGENT :
                </span>
                <strong className={totalActiveSev2 > 0 ? '' : 'metric-dash'} style={{ fontSize: 24, fontWeight: 450, color: totalActiveSev2 > 0 ? '#f59e0b' : undefined, lineHeight: 1 }}>
                  {totalActiveSev2}
                </strong>
              </div>
            </div>
            <div className="metric-foot">
              <span 
                className="source-dot" 
                style={{ background: totalActiveSev1 > 0 ? '#ef4444' : totalActiveSev2 > 0 ? '#f59e0b' : '#22c55e' }} 
              />
              {totalActiveSev1 + totalActiveSev2 > 0 
                ? `${totalActiveSev1 + totalActiveSev2} urgent ${totalActiveSev1 + totalActiveSev2 === 1 ? 'case' : 'cases'} across workspace` 
                : 'All sites clear of urgent cases'}
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

            {/* Pill Toggle for Cases vs Open Alerts vs Closed Alerts */}
            <div className="sf-bucket-toggle">
              <button
                type="button"
                className={`sf-bucket-btn ${activeBucket === 'cases' ? 'active' : ''}`}
                onClick={() => {
                  setActiveBucket('cases');
                  setSeverityFilter('All');
                  setProductFilter('All');
                  setCategoryFilter('All');
                  setAssigneeFilter('All');
                  setStatusFilter('All');
                }}
                title="Live Open Cases"
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
                onClick={() => {
                  setActiveBucket('alerts');
                  setSeverityFilter('All');
                  setProductFilter('All');
                  setCategoryFilter('All');
                  setAssigneeFilter('All');
                  setStatusFilter('All');
                }}
                title="Live Open Alerts"
              >
                <span className="sf-bucket-count">{todayAlertsCount}</span>
                <span className="sf-bucket-label">
                  <Radio style={{ width: 11, height: 11, color: '#ef4444' }} />
                  Open Alerts
                </span>
              </button>

              <button
                type="button"
                className={`sf-bucket-btn ${activeBucket === 'closed' ? 'active' : ''}`}
                onClick={() => {
                  setActiveBucket('closed');
                  setSeverityFilter('All');
                  setProductFilter('All');
                  setCategoryFilter('All');
                  setAssigneeFilter('All');
                  setStatusFilter('All');
                }}
                title="Closed Alerts"
              >
                <span className="sf-bucket-count">{todayClosedAlertsCount}</span>
                <span className="sf-bucket-label">
                  <CheckCircle2 style={{ width: 11, height: 11, color: '#22c55e' }} />
                  Closed Alerts
                </span>
              </button>
            </div>

            {(severityFilter !== 'All' || productFilter !== 'All' || categoryFilter !== 'All' || assigneeFilter !== 'All' || statusFilter !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSeverityFilter('All');
                  setProductFilter('All');
                  setCategoryFilter('All');
                  setAssigneeFilter('All');
                  setStatusFilter('All');
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
                  marginLeft: 8,
                }}
                title="Reset active filters"
              >
                <X style={{ width: 11, height: 11 }} />
                <span>Reset filters</span>
              </button>
            )}

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
              <div
                className="sf-panel-table-head"
                style={{
                  borderTop: '1px solid var(--border)',
                  ...(activeBucket === 'alerts'
                    ? { gridTemplateColumns: 'minmax(220px, 1.5fr) 95px 95px 135px 105px 135px 130px' }
                    : activeBucket === 'closed'
                    ? { gridTemplateColumns: 'minmax(200px, 1.4fr) 85px 85px 125px 95px 125px 115px 115px 100px' }
                    : undefined),
                }}
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
                    {activeBucket === 'cases' && (
                      <>
                        <option value="SEV 1 URGENT" style={{ background: '#18191e', color: '#ef4444', fontWeight: 700 }}>
                          ● SEV 1 URGENT ({sev1CountInBucket})
                        </option>
                        <option value="SEV 2 URGENT" style={{ background: '#18191e', color: '#f59e0b', fontWeight: 700 }}>
                          ● SEV 2 URGENT ({sev2CountInBucket})
                        </option>
                        <option value="SEV 2 HIGH" style={{ background: '#18191e', color: '#c084fc', fontWeight: 700 }}>
                          ● SEV 2 HIGH ({sev2HighCountInBucket})
                        </option>
                      </>
                    )}
                    {uniqueSeverities
                      .filter(sev => sev !== 'SEV 1 URGENT' && sev !== 'SEV 2 URGENT' && sev !== 'SEV 2 HIGH')
                      .map(sev => {
                        const count = severityCountsMap.get(sev) ?? 0;
                        return (
                          <option key={sev} value={sev} style={{ background: '#18191e', color: '#fff' }}>
                            {sev} ({count})
                          </option>
                        );
                      })}
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
                    title={productFilter !== 'All' ? `Filtered by Product: ${productFilter} (Click to change)` : 'Filter by Product'}
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

                {/* Category Filter Header - ONLY shown in Cases view */}
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
                      title={categoryFilter !== 'All' ? `Filtered by Category: ${categoryFilter} (Click to change)` : 'Filter by Category'}
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
                    title={assigneeFilter !== 'All' ? `Filtered by Assignee: ${assigneeFilter} (Click to change)` : 'Filter by Assignee'}
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
                    title={statusFilter !== 'All' ? `Filtered by Status: ${statusFilter} (Click to change)` : 'Filter by Status'}
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
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <span>SITE / LOCATION</span>
                {activeBucket === 'closed' ? (
                  <>
                    <span>START TIME</span>
                    <span>END TIME</span>
                    <span>DURATION (MTTR)</span>
                  </>
                ) : activeBucket === 'alerts' ? (
                  <span>START TIME</span>
                ) : (
                  <span>CREATED / MODIFIED</span>
                )}
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
                    {ticketViewModels.map(item => {
                      const {
                        c,
                        isAlert,
                        alertEndTime,
                        isClosedTodayAlert,
                        statusClass,
                        isSev1Urgent,
                        isSev2Urgent,
                        isSev2High,
                        priorityClass,
                        priorityDisplay,
                        productDisplay,
                        categoryDisplay,
                        assignedDisplay,
                        siteDisplay,
                        matchedSiteId,
                        fromToday,
                        durationInfo,
                        createdTimeFormatted,
                        endTimeFormatted,
                        casesDateFormatted,
                      } = item;

                      return (
                        <div
                          key={c.Id}
                          className="sf-case-row"
                          style={
                            activeBucket === 'alerts'
                              ? { gridTemplateColumns: 'minmax(220px, 1.5fr) 95px 95px 135px 105px 135px 130px' }
                              : activeBucket === 'closed'
                              ? { gridTemplateColumns: 'minmax(200px, 1.4fr) 85px 85px 125px 95px 125px 115px 115px 100px' }
                              : undefined
                          }
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

                          {/* Category - ONLY shown in Cases view, strictly omitted in Alerts views */}
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
                              style={activeBucket === 'closed' || isClosedTodayAlert ? { color: '#22c55e', borderColor: 'oklch(0.7 0.15 140 / 0.4)', background: 'oklch(0.7 0.15 140 / 0.15)' } : undefined}
                            >
                              {activeBucket === 'closed' ? 'Closed' : activeBucket === 'alerts' ? 'Active Open' : isClosedTodayAlert ? 'Closed (Today)' : c.Status}
                            </span>
                          </div>

                          {/* Site / Location (clickable to site workspace if found) */}
                          <div className="case-site-tag" title={siteDisplay}>
                            <MapPin style={{ width: 11, height: 11, flexShrink: 0 }} />
                            {matchedSiteId ? (
                              <Link
                                to="/sites/$siteId"
                                params={{ siteId: matchedSiteId }}
                                preload={false}
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

                          {/* Date Cells: Start Time in Open Alerts; Start, End Time & MTTR Duration in Closed Alerts; Created/Modified in Cases */}
                          {activeBucket === 'alerts' ? (
                            <div className="case-date-cell" style={{ fontSize: 10, color: '#f87171', fontWeight: 600 }}>
                              {createdTimeFormatted}
                            </div>
                          ) : activeBucket === 'closed' ? (
                            <>
                              <div className="case-date-cell" style={{ fontSize: 10, color: '#cbd5e1' }}>
                                {createdTimeFormatted}
                              </div>
                              <div className="case-date-cell" style={{ fontSize: 10, color: '#34d399', fontWeight: 600 }}>
                                {endTimeFormatted}
                              </div>
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
                            <div className="case-date-cell">
                              <span style={{ color: '#ffffff', fontWeight: fromToday ? 600 : 500 }}>
                                {casesDateFormatted}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
              </div>
            ) : (
              <div className="source-empty" style={{ padding: '24px 16px' }}>
                <div className="empty-source-art cloud-art">
                  {activeBucket === 'alerts' ? (
                    <Radio style={{ color: '#ef4444' }} />
                  ) : activeBucket === 'closed' ? (
                    <CheckCircle2 style={{ color: '#22c55e' }} />
                  ) : (
                    <Cloud />
                  )}
                  <span />
                  <span />
                </div>
                <h4 style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>
                  No {activeBucket === 'cases' ? 'open cases' : activeBucket === 'alerts' ? 'open alerts' : 'closed alerts'} found
                </h4>
                <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
                  All monitored sites across Salesforce org are clear of {activeBucket === 'cases' ? 'open cases' : activeBucket === 'alerts' ? 'open alerts' : 'closed alerts'}.
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

      {/* Portaled Product Types Popover: 100% immune to card containment / overflow clipping */}
      {activeAddSite && typeof document !== 'undefined' && createPortal(
        <>
          <div
            className="product-popover-backdrop"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              setActiveAddSite(null);
              setPopoverCoords(null);
            }}
          />
          <div
            className="site-product-popover"
            style={{
              position: 'fixed',
              top: popoverCoords?.top ?? 120,
              right: popoverCoords?.right ?? 24,
              zIndex: 99999,
            }}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="site-product-popover-title">
              <span>Add Product ({activeAddSite.name})</span>
              <button
                type="button"
                className="popover-close-btn"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveAddSite(null);
                  setPopoverCoords(null);
                }}
                title="Close"
              >
                <X style={{ width: 11, height: 11 }} />
              </button>
            </div>

            <div className="product-popover-presets">
              {['RMS', 'RIL', 'RA', 'Case Pick', 'TTP', 'RTP', 'gStore'].map(type => {
                const curLines = activeAddSite.product_lines || (activeAddSite.product_line ? activeAddSite.product_line.split(',').map(x => x.trim()) : []);
                const alreadyHas = curLines.some(p => p.toLowerCase() === type.toLowerCase());
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={alreadyHas}
                    className={`product-popover-opt ${alreadyHas ? 'already-added' : ''}`}
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!alreadyHas) {
                        void handleAddProduct(activeAddSite, type);
                        setActiveAddSite(null);
                        setPopoverCoords(null);
                      }
                    }}
                    title={alreadyHas ? `${type} already added` : `Add ${type}`}
                  >
                    <span>{type}</span>
                    {alreadyHas && <Check style={{ width: 9, height: 9, marginLeft: 2 }} />}
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                e.stopPropagation();
                if (customProductInput.trim()) {
                  void handleAddProduct(activeAddSite, customProductInput.trim());
                  setCustomProductInput('');
                  setActiveAddSite(null);
                  setPopoverCoords(null);
                }
              }}
              style={{ display: 'flex', gap: 4, marginTop: 8 }}
            >
              <input
                type="text"
                value={customProductInput}
                onChange={e => setCustomProductInput(e.target.value)}
                placeholder="Custom type..."
                className="product-popover-input"
                autoFocus
                onClick={e => e.stopPropagation()}
              />
              <button
                type="submit"
                disabled={!customProductInput.trim()}
                className="product-popover-submit"
                onClick={e => e.stopPropagation()}
              >
                Add
              </button>
            </form>
          </div>
        </>,
        document.body
      )}

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
                  {String(selectedCase.Product_Type__c || selectedCase.product_line || selectedCase.Parent_Product_Type__c || 'RMS')}
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
