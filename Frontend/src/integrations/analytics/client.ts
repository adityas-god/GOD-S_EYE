export type AnalyticsTimeframe = '24h' | '48h' | '7d' | '15d' | '1m' | '2m' | '3m' | '6m' | 'custom';

export interface TimeframeOption {
  key: AnalyticsTimeframe;
  label: string;
  days: number;
}

export const ANALYTICS_TIMEFRAMES: TimeframeOption[] = [
  { key: '24h', label: '24 hrs', days: 1 },
  { key: '48h', label: '48 hrs', days: 2 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '15d', label: '15 days', days: 15 },
  { key: '1m', label: '1 month', days: 30 },
  { key: '2m', label: '2 months', days: 60 },
  { key: '3m', label: '3 months', days: 90 },
  { key: '6m', label: '6 months', days: 180 },
  { key: 'custom', label: 'Custom', days: 0 },
];

export interface SeverityStat {
  count: number;
  pct: number;
}

export interface CasesAnalyticsResult {
  type: 'cases';
  timeframe: AnalyticsTimeframe;
  timeframeLabel: string;
  days: number;
  kpis: {
    totalIncidents: number;
    averageResolutionHours: number;
    totalFleetDowntimeHours: number;
    maxSiteDowntimeHours?: number;
    activeBreachedSitesCount: number;
    stableSitesCount: number;
    monitoredSitesCount: number;
  };
  severityBreakdown: {
    sev1: SeverityStat;
    sev2_urgent: SeverityStat;
    sev2_high: SeverityStat;
    sev3: SeverityStat;
    sev4: SeverityStat;
    total: number;
  };
  top10IncidentSites: Array<{
    rank: number;
    siteName: string;
    productLine: string;
    totalIncidents: number;
    sev1Count: number;
    sev2UrgentCount: number;
    sev2HighCount: number;
    sev3Count: number;
    sev4Count: number;
    downtimeHours: number;
    sharePct: number;
  }>;
  sitesWithMostDowntime: Array<{
    rank: number;
    siteName: string;
    productLine: string;
    downtimeHours: number;
    criticalIncidents: number;
    totalIncidents: number;
  }>;
  mostBreachedSites: Array<{
    rank: number;
    siteName: string;
    sev1Count: number;
    sev2UrgentCount: number;
    downtimeHours: number;
    breachSeverity: 'CRITICAL_BREACH' | 'ELEVATED_RISK';
  }>;
  stableSites: Array<{
    siteName: string;
    productLine: string;
  }>;
  topCriticalTickets: Array<{
    id: string;
    caseNumber: string;
    subject: string;
    siteName: string;
    detailedSeverity: string;
    isSiteDown: boolean;
    status: string;
    isResolved: boolean;
    createdDate: string;
    createdTime?: number;
    durationHours: number | null;
    subsystem: string;
    description?: string | null;
  }>;
  subsystemBreakdown: Array<{
    subsystem: string;
    count: number;
    pct: number;
  }>;
  reoccurringPatterns: Array<{
    signature: string;
    count: number;
  }>;
  timestamp: string;
}

export interface AlertsAnalyticsResult {
  type: 'alerts';
  timeframe: AnalyticsTimeframe;
  timeframeLabel: string;
  days: number;
  kpis: {
    totalAlerts: number;
    breachedAlertsCount: number;
    breachRatePct: number;
    activeAlertsCount: number;
    activeBreachedAlertsCount: number;
    p1CriticalCount: number;
    p1BreachedCount: number;
    p2HighCount: number;
    p2BreachedCount: number;
    p3MediumCount: number;
    averageResolutionHours: number;
    activeAlertSitesCount: number;
    stableSitesCount: number;
    monitoredSitesCount: number;
  };
  priorityBreakdown: {
    p1: SeverityStat & { breached?: number };
    p2: SeverityStat & { breached?: number };
    p3: SeverityStat & { breached?: number };
    p4: SeverityStat & { breached?: number };
    p5: SeverityStat & { breached?: number };
    total: number;
  };
  top10AlertSites: Array<{
    rank: number;
    siteName: string;
    productLine: string;
    totalAlerts: number;
    p1Count: number;
    p2Count: number;
    p3Count: number;
    breachedCount?: number;
    p1Breaches?: number;
    p2Breaches?: number;
    activeCount?: number;
    activeBreaches?: number;
    breachRatePct?: number;
    sharePct: number;
  }>;
  mostBreachedAlertSites: Array<{
    rank: number;
    siteName: string;
    productLine: string;
    totalAlerts: number;
    breachedCount: number;
    p1Breaches: number;
    p2Breaches: number;
    breachRatePct: number;
    activeBreaches: number;
    breachSeverity: 'CRITICAL_BREACH' | 'ELEVATED_RISK';
  }>;
  topBreachedAlerts: Array<{
    id: string;
    caseNumber: string;
    subject: string;
    siteName: string;
    priority: string;
    status: string;
    isOpen: boolean;
    isResolved: boolean;
    createdDate: string;
    createdTime?: number;
    endTime?: string | null;
    durationHours: number;
    slaTargetHours: number;
    isBreached: boolean;
    breachOverdueHours: number;
    isActiveBreach: boolean;
    subsystem: string;
    description?: string | null;
  }>;
  stableSites: Array<{
    siteName: string;
    productLine: string;
  }>;
  topFiredAlertSignatures: Array<{
    signature: string;
    count: number;
    breachedCount?: number;
    p1Count?: number;
    impactedSitesCount?: number;
  }>;
  topRecentP1P2Alerts: Array<{
    id: string;
    caseNumber: string;
    subject: string;
    siteName: string;
    priority: string;
    status: string;
    isOpen?: boolean;
    createdDate: string;
    createdTime?: number;
    durationHours: number | null;
    slaTargetHours?: number;
    isBreached?: boolean;
    breachOverdueHours?: number;
    isActiveBreach?: boolean;
    subsystem: string;
  }>;
  subsystemBreakdown?: Array<{
    subsystem: string;
    count: number;
    pct: number;
  }>;
  recentAlerts?: Array<{
    id: string;
    caseNumber: string;
    subject: string;
    siteName: string;
    priority: string;
    status: string;
    isOpen: boolean;
    isResolved: boolean;
    createdDate: string;
    createdTime?: number;
    durationHours: number;
    slaTargetHours: number;
    isBreached: boolean;
    breachOverdueHours: number;
    isActiveBreach: boolean;
    subsystem: string;
  }>;
  timestamp: string;
}

export async function fetchCasesAnalytics(
  timeframe: AnalyticsTimeframe = '7d',
  forceRefresh = false,
  customRange?: { startDate?: string; endDate?: string } | null
): Promise<CasesAnalyticsResult> {
  const params = new URLSearchParams();
  params.set('timeframe', timeframe);
  if (timeframe === 'custom' && customRange) {
    if (customRange.startDate) params.set('startDate', customRange.startDate);
    if (customRange.endDate) params.set('endDate', customRange.endDate);
  }
  if (forceRefresh) params.set('refresh', 'true');

  const res = await fetch(`/api/analytics/cases?${params.toString()}`, {
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch cases analytics: ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch cases analytics');
  }
  return data as CasesAnalyticsResult;
}

export async function fetchAlertsAnalytics(
  timeframe: AnalyticsTimeframe = '7d',
  forceRefresh = false,
  customRange?: { startDate?: string; endDate?: string } | null
): Promise<AlertsAnalyticsResult> {
  const params = new URLSearchParams();
  params.set('timeframe', timeframe);
  if (timeframe === 'custom' && customRange) {
    if (customRange.startDate) params.set('startDate', customRange.startDate);
    if (customRange.endDate) params.set('endDate', customRange.endDate);
  }
  if (forceRefresh) params.set('refresh', 'true');

  const res = await fetch(`/api/analytics/alerts?${params.toString()}`, {
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch alerts analytics: ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch alerts analytics');
  }
  return data as AlertsAnalyticsResult;
}
