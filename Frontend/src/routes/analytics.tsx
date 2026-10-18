import { useState, useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert,
  Radio,
  Calendar,
  RefreshCw,
  AlertTriangle,
  Clock,
  Flame,
  CheckCircle2,
  Building2,
  Activity,
  ArrowUpRight,
  Search,
  Zap,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Layers,
  Wrench,
} from 'lucide-react';
import { DashboardShell } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  fetchCasesAnalytics,
  fetchAlertsAnalytics,
  ANALYTICS_TIMEFRAMES,
  type AnalyticsTimeframe,
  type CasesAnalyticsResult,
  type AlertsAnalyticsResult,
} from '@/integrations/analytics/client';

export const Route = createFileRoute('/analytics')({
  head: () => ({
    meta: [
      {
        title: 'GO Analytics | Sitepulse Fleet Telemetry',
      },
    ],
  }),
  component: AnalyticsPage,
});

function formatHours(h: number | null | undefined): string {
  if (h === null || h === undefined || isNaN(h)) return '0h';
  if (h < 1) {
    const mins = Math.round(h * 60);
    return `${mins}m`;
  }
  const fullHours = Math.floor(h);
  const remMins = Math.round((h - fullHours) * 60);
  if (remMins === 0) return `${fullHours}h`;
  return `${fullHours}h ${remMins}m`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(dateStr);
  }
}

export function AnalyticsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'cases' | 'alerts'>('cases');
  const [selectedTimeframe, setSelectedTimeframe] = useState<AnalyticsTimeframe>('7d');
  const [ticketSearch, setTicketSearch] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAllStableSites, setShowAllStableSites] = useState(false);
  const [alertTicketSearch, setAlertTicketSearch] = useState('');
  const [alertPriorityFilter, setAlertPriorityFilter] = useState<string>('ALL');
  const [alertBreachFilter, setAlertBreachFilter] = useState<string>('ALL');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>('ALL');
  const [hoveredSeverityTier, setHoveredSeverityTier] = useState<string | null>(null);
  const [showAllStableAlertSites, setShowAllStableAlertSites] = useState(false);

  // Query for Cases Analytics
  const {
    data: casesData,
    isLoading: casesLoading,
    isFetching: casesFetching,
    error: casesError,
  } = useQuery<CasesAnalyticsResult>({
    queryKey: ['analytics-cases', selectedTimeframe],
    queryFn: () => fetchCasesAnalytics(selectedTimeframe),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Query for Alerts Analytics
  const {
    data: alertsData,
    isLoading: alertsLoading,
    isFetching: alertsFetching,
    error: alertsError,
  } = useQuery<AlertsAnalyticsResult>({
    queryKey: ['analytics-alerts', selectedTimeframe],
    queryFn: () => fetchAlertsAnalytics(selectedTimeframe),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    enabled: activeTab === 'alerts',
  });

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === 'cases') {
        await queryClient.fetchQuery({
          queryKey: ['analytics-cases', selectedTimeframe],
          queryFn: () => fetchCasesAnalytics(selectedTimeframe, true),
        });
      } else {
        await queryClient.fetchQuery({
          queryKey: ['analytics-alerts', selectedTimeframe],
          queryFn: () => fetchAlertsAnalytics(selectedTimeframe, true),
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const isCurrentLoading = activeTab === 'cases' ? casesLoading : alertsLoading;
  const isCurrentFetching = activeTab === 'cases' ? casesFetching : alertsFetching;
  const currentError = activeTab === 'cases' ? casesError : alertsError;

  // Filtered tickets
  const filteredCriticalTickets = useMemo(() => {
    if (!casesData?.topCriticalTickets) return [];
    let list = casesData.topCriticalTickets;
    if (selectedSeverityFilter !== 'ALL') {
      list = list.filter(t => t.detailedSeverity === selectedSeverityFilter);
    }
    if (!ticketSearch.trim()) return list;
    const q = ticketSearch.toLowerCase().trim();
    return list.filter(
      t =>
        t.caseNumber?.toLowerCase().includes(q) ||
        t.siteName?.toLowerCase().includes(q) ||
        t.subject?.toLowerCase().includes(q) ||
        t.subsystem?.toLowerCase().includes(q)
    );
  }, [casesData, ticketSearch, selectedSeverityFilter]);

  // Filtered Top 10 Sites (cases)
  const filteredTopSitesCases = useMemo(() => {
    if (!casesData?.top10IncidentSites) return [];
    if (!siteSearch.trim()) return casesData.top10IncidentSites;
    const q = siteSearch.toLowerCase().trim();
    return casesData.top10IncidentSites.filter(
      s => s.siteName?.toLowerCase().includes(q) || s.productLine?.toLowerCase().includes(q)
    );
  }, [casesData, siteSearch]);

  // Filtered Top 10 Sites (alerts)
  const filteredTopSitesAlerts = useMemo(() => {
    if (!alertsData?.top10AlertSites) return [];
    if (!siteSearch.trim()) return alertsData.top10AlertSites;
    const q = siteSearch.toLowerCase().trim();
    return alertsData.top10AlertSites.filter(
      s => s.siteName?.toLowerCase().includes(q) || s.productLine?.toLowerCase().includes(q)
    );
  }, [alertsData, siteSearch]);

  // Filtered Top Breached Alerts
  const filteredBreachedAlerts = useMemo(() => {
    if (!alertsData?.topBreachedAlerts) return [];
    let list = alertsData.topBreachedAlerts;
    if (alertPriorityFilter !== 'ALL') {
      list = list.filter(a => a.priority === alertPriorityFilter);
    }
    if (alertBreachFilter === 'ACTIVE_BREACH') {
      list = list.filter(a => a.isActiveBreach);
    } else if (alertBreachFilter === 'RESOLVED_BREACH') {
      list = list.filter(a => !a.isOpen);
    }
    if (alertTicketSearch.trim()) {
      const q = alertTicketSearch.toLowerCase().trim();
      list = list.filter(
        a =>
          a.caseNumber?.toLowerCase().includes(q) ||
          a.siteName?.toLowerCase().includes(q) ||
          a.subject?.toLowerCase().includes(q) ||
          a.subsystem?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [alertsData, alertTicketSearch, alertPriorityFilter, alertBreachFilter]);

  return (
    <DashboardShell>
      <div className="page-wrap">
        {/* SITE-PULSE PAGE HEADING */}
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <span />
              FLEET RELIABILITY &amp; DOWNTIME TELEMETRY
            </div>
            <h1>
              GO Analytics<span className="heading-dot">.</span>
            </h1>
            <p>
              Longitudinal incident distributions, facility downtime tracking, and service SLA telemetry across all facilities.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isRefreshing || isCurrentFetching}
              className="add-button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
              }}
            >
              <RefreshCw
                className={isRefreshing || isCurrentFetching ? 'animate-spin' : ''}
                style={{ width: 13, height: 13 }}
              />
              {isRefreshing || isCurrentFetching ? 'SYNCING...' : 'REFRESH'}
            </Button>
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--muted-foreground)',
                background: 'var(--card)',
                padding: '8px 12px',
                borderRadius: 5,
                border: '1px solid var(--border)',
              }}
            >
              SYNCED: {formatDate(activeTab === 'cases' ? casesData?.timestamp : alertsData?.timestamp)}
            </div>
          </div>
        </div>

        {/* CONTROLS BAR: TWO-TOGGLE (CASES VS ALERTS) & TIMEFRAME SELECTOR */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginTop: 26,
            marginBottom: 24,
            flexWrap: 'wrap',
          }}
        >
          {/* Main Two-Toggle Switch (Cases vs Alerts) */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--card)',
              padding: 3,
              borderRadius: 6,
              border: '1px solid var(--border)',
              gap: 3,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('cases')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 15px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: activeTab === 'cases' ? 600 : 500,
                fontFamily: 'var(--font-sans)',
                background: activeTab === 'cases' ? 'var(--orange-surface)' : 'transparent',
                color: activeTab === 'cases' ? 'var(--soft-orange)' : 'var(--muted-foreground)',
                borderBottom: activeTab === 'cases' ? '2px solid var(--primary)' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <ShieldAlert style={{ width: 14, height: 14 }} />
              <span>Cases &amp; Outages</span>
              {casesData?.kpis?.totalIncidents !== undefined && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 3,
                    background: activeTab === 'cases' ? 'var(--primary)' : 'var(--secondary)',
                    color: activeTab === 'cases' ? '#ffffff' : 'var(--foreground)',
                  }}
                >
                  {casesData.kpis.totalIncidents}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('alerts')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 15px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: activeTab === 'alerts' ? 600 : 500,
                fontFamily: 'var(--font-sans)',
                background: activeTab === 'alerts' ? 'var(--blue-surface)' : 'transparent',
                color: activeTab === 'alerts' ? 'var(--blue)' : 'var(--muted-foreground)',
                borderBottom: activeTab === 'alerts' ? '2px solid var(--blue)' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <Radio style={{ width: 14, height: 14 }} />
              <span>System Alerts</span>
              {alertsData?.kpis?.totalAlerts !== undefined && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 3,
                    background: activeTab === 'alerts' ? 'var(--blue)' : 'var(--secondary)',
                    color: activeTab === 'alerts' ? '#ffffff' : 'var(--foreground)',
                  }}
                >
                  {alertsData.kpis.totalAlerts}
                </span>
              )}
            </button>
          </div>

          {/* Timeframe Selector Pill Buttons (SitePulse standard) */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--card)',
              padding: 3,
              borderRadius: 6,
              border: '1px solid var(--border)',
              gap: 2,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--muted-foreground)',
                padding: '0 8px',
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Calendar style={{ width: 11, height: 11 }} />
              SCOPE:
            </span>
            {ANALYTICS_TIMEFRAMES.map((tf) => {
              const isSelected = selectedTimeframe === tf.key;
              return (
                <button
                  key={tf.key}
                  type="button"
                  onClick={() => setSelectedTimeframe(tf.key)}
                  style={{
                    background: isSelected ? 'var(--primary)' : 'transparent',
                    color: isSelected ? '#ffffff' : 'var(--muted-foreground)',
                    border: 'none',
                    borderRadius: 4,
                    padding: '5px 11px',
                    fontSize: 11,
                    fontWeight: isSelected ? 600 : 500,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ACCURACY & OMISSION FILTER BANNER */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            padding: '10px 16px',
            borderRadius: 6,
            marginBottom: 24,
            fontSize: 11.5,
            background: activeTab === 'cases' ? 'var(--orange-surface)' : 'var(--blue-surface)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck
              style={{
                width: 15,
                height: 15,
                color: activeTab === 'cases' ? 'var(--soft-orange)' : 'var(--blue)',
              }}
            />
            <span>
              <strong>Precision Engine:</strong>{' '}
              {activeTab === 'cases' ? (
                <>Automated child IM tickets, DIR reports, and non-site records strictly omitted. Facility downtime counted solely on Sev 1 and Sev 2 Urgent incidents clamped to window.</>
              ) : (
                <>Machine alert telemetry isolated from human customer inquiries and internal synchronizations.</>
              )}
            </span>
          </div>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)' }}>
            WINDOW: {selectedTimeframe.toUpperCase()} (Past {ANALYTICS_TIMEFRAMES.find(t => t.key === selectedTimeframe)?.days} days)
          </span>
        </div>

        {/* LOADING STATE */}
        {isCurrentLoading && (
          <div
            style={{
              padding: 60,
              textAlign: 'center',
              background: 'var(--card)',
              borderRadius: 7,
              border: '1px solid var(--border)',
              margin: '28px 0',
            }}
          >
            <RefreshCw
              className="animate-spin"
              style={{ width: 28, height: 28, margin: '0 auto 14px', color: 'var(--primary)' }}
            />
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--foreground)', fontFamily: 'var(--font-sans)' }}>
              Executing High-Precision Analytics Queries...
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 5, fontFamily: 'var(--font-mono)' }}>
              Calculating non-overlapping interval union downtime, validating facility mapping, and classifying fleet severity.
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {currentError && !isCurrentLoading && (
          <div
            style={{
              padding: 20,
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 7,
              marginBottom: 24,
              color: '#ef4444',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
              <AlertTriangle style={{ width: 16, height: 16 }} />
              Failed to load analytics data
            </div>
            <p style={{ margin: '6px 0 10px', fontSize: 12, color: 'var(--foreground)' }}>
              {(currentError as Error).message || 'An error occurred while connecting to Salesforce.'}
            </p>
            <Button size="sm" variant="outline" onClick={handleManualRefresh} style={{ height: 30, fontSize: 11 }}>
              Retry Query
            </Button>
          </div>
        )}

        {/* ================= CASES ANALYTICS VIEW ================= */}
        {activeTab === 'cases' && casesData && !isCurrentLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* OVERVIEW METRICS (4 CARDS) */}
            <div className="overview-metrics" style={{ marginTop: 0, marginBottom: 4 }}>
              {/* Card 1: Total Incidents */}
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <ShieldAlert />
                  TOTAL INCIDENTS
                </span>
                <div>
                  <strong style={{ fontFamily: 'var(--font-sans)' }}>{casesData.kpis.totalIncidents}</strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>In {casesData.timeframeLabel}</span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span
                    className="source-dot"
                    style={{ background: casesData.kpis.totalIncidents > 0 ? 'var(--primary)' : 'var(--success)' }}
                  />
                  {casesData.severityBreakdown.sev1.count} Sev-1 • {casesData.severityBreakdown.sev2_urgent.count} Sev-2 Urgent
                </div>
              </div>

              {/* Card 2: Total Outage Downtime */}
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <Clock />
                  FACILITY DOWNTIME
                </span>
                <div>
                  <strong
                    style={{
                      fontFamily: 'var(--font-sans)',
                      color: casesData.kpis.totalFleetDowntimeHours > 0 ? '#ef4444' : 'var(--foreground)',
                    }}
                  >
                    {formatHours(casesData.kpis.totalFleetDowntimeHours)}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>Cumulative Facility Outage</span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span
                    className="source-dot"
                    style={{ background: casesData.kpis.totalFleetDowntimeHours > 0 ? '#ef4444' : 'var(--success)' }}
                  />
                  Sev 1 &amp; Sev 2 Urgent Only (Clamped)
                </div>
              </div>

              {/* Card 3: Breached Sites */}
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <Flame />
                  BREACHED SITES
                </span>
                <div>
                  <strong style={{ fontFamily: 'var(--font-sans)' }}>
                    {casesData.kpis.activeBreachedSitesCount}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>Exceeding Outage / SLA Limits</span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span
                    className="source-dot"
                    style={{ background: casesData.kpis.activeBreachedSitesCount > 0 ? 'var(--soft-orange)' : 'var(--success)' }}
                  />
                  Critical SLA Risk Tracking
                </div>
              </div>

              {/* Card 4: Stable Facilities */}
              <div className="metric" style={{ borderRight: 'none' }}>
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <CheckCircle2 />
                  STABLE SITES
                </span>
                <div>
                  <strong style={{ fontFamily: 'var(--font-sans)', color: 'var(--success)' }}>
                    {casesData.kpis.stableSitesCount}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    Of {casesData.kpis.monitoredSitesCount} Monitored Facilities
                  </span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span className="source-dot" style={{ background: 'var(--success)' }} />
                  Zero Incidents in Window
                </div>
              </div>
            </div>

            {/* SEVERITY DISTRIBUTION & FLEET IMPACT PANEL */}
            {(() => {
              const severityTiers = [
                {
                  key: 'sev1',
                  label: 'SEV 1',
                  sublabel: '100% Impact',
                  descriptor: 'Site Outage / Catastrophic',
                  color: '#dc2626',
                  glowColor: 'rgba(220, 38, 38, 0.25)',
                  tintBg: 'rgba(220, 38, 38, 0.04)',
                  barGradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  badgeBg: 'rgba(220, 38, 38, 0.08)',
                  badgeBorder: 'rgba(220, 38, 38, 0.25)',
                  stat: casesData.severityBreakdown.sev1,
                  hasPulse: true,
                },
                {
                  key: 'sev2_urgent',
                  label: 'SEV 2 URGENT',
                  sublabel: '50-99% Impact',
                  descriptor: 'Partial Outage / Urgent',
                  color: '#ea580c',
                  glowColor: 'rgba(234, 88, 12, 0.25)',
                  tintBg: 'rgba(234, 88, 12, 0.04)',
                  barGradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                  badgeBg: 'rgba(234, 88, 12, 0.08)',
                  badgeBorder: 'rgba(234, 88, 12, 0.25)',
                  stat: casesData.severityBreakdown.sev2_urgent,
                  hasPulse: true,
                },
                {
                  key: 'sev2_high',
                  label: 'SEV 2 HIGH',
                  sublabel: 'Non-Urgent',
                  descriptor: 'Reduced Capacity',
                  color: '#ca8a04',
                  glowColor: 'rgba(202, 138, 4, 0.25)',
                  tintBg: 'rgba(202, 138, 4, 0.04)',
                  barGradient: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                  badgeBg: 'rgba(202, 138, 4, 0.08)',
                  badgeBorder: 'rgba(202, 138, 4, 0.25)',
                  stat: casesData.severityBreakdown.sev2_high,
                  hasPulse: false,
                },
                {
                  key: 'sev3',
                  label: 'SEV 3',
                  sublabel: 'Standard',
                  descriptor: 'Standard Operations',
                  color: '#0284c7',
                  glowColor: 'rgba(2, 132, 199, 0.25)',
                  tintBg: 'rgba(2, 132, 199, 0.04)',
                  barGradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  badgeBg: 'rgba(2, 132, 199, 0.08)',
                  badgeBorder: 'rgba(2, 132, 199, 0.25)',
                  stat: casesData.severityBreakdown.sev3,
                  hasPulse: false,
                },
                {
                  key: 'sev4',
                  label: 'SEV 4',
                  sublabel: 'Minor / Query',
                  descriptor: 'Informational Tasks',
                  color: '#64748b',
                  glowColor: 'rgba(100, 116, 139, 0.2)',
                  tintBg: 'rgba(100, 116, 139, 0.04)',
                  barGradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
                  badgeBg: 'rgba(100, 116, 139, 0.08)',
                  badgeBorder: 'rgba(100, 116, 139, 0.25)',
                  stat: casesData.severityBreakdown.sev4,
                  hasPulse: false,
                },
              ];

              const activeTierObj = severityTiers.find(t => t.key === selectedSeverityFilter);

              return (
                <section className="data-panel">
                  {/* Panel Heading */}
                  <div className="data-panel-heading">
                    <div className="provider-symbol">
                      <Activity />
                    </div>
                    <div>
                      <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                        INCIDENT CLASSIFICATION TELEMETRY
                      </span>
                      <h2
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 16,
                          fontWeight: 500,
                          margin: '2px 0 0',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          color: 'var(--foreground)',
                        }}
                      >
                        Severity Distribution &amp; Fleet Impact
                        {selectedSeverityFilter !== 'ALL' && activeTierObj && (
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: activeTierObj.badgeBg,
                              border: `1px solid ${activeTierObj.color}`,
                              color: activeTierObj.color,
                              fontWeight: 700,
                            }}
                          >
                            FILTERED: {activeTierObj.label}
                          </span>
                        )}
                      </h2>
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                      {selectedSeverityFilter !== 'ALL' && (
                        <button
                          onClick={() => setSelectedSeverityFilter('ALL')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 6,
                            background: 'rgba(220, 38, 38, 0.1)',
                            border: '1px solid rgba(220, 38, 38, 0.25)',
                            color: '#dc2626',
                            fontSize: 10.5,
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          title="Reset severity filter"
                        >
                          CLEAR FILTER ✕
                        </button>
                      )}
                      <span className="pill" style={{ fontFamily: 'var(--font-mono)' }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: 'var(--success)',
                            boxShadow: '0 0 6px var(--success)',
                            display: 'inline-block',
                          }}
                        />
                        {casesData.severityBreakdown.total} Total Incidents
                      </span>
                    </div>
                  </div>

                  {/* Panel Content */}
                  <div style={{ padding: '20px 23px' }}>
                    {/* Telemetry Distribution Gauge */}
                    <div
                      style={{
                        background: 'var(--secondary)',
                        padding: '3px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.06)',
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          height: 12,
                          width: '100%',
                          display: 'flex',
                          gap: 2,
                          borderRadius: 4,
                          overflow: 'hidden',
                        }}
                      >
                        {severityTiers.map(tier => {
                          if (tier.stat.pct <= 0) return null;
                          const isHovered = hoveredSeverityTier === tier.key;
                          const isSelected = selectedSeverityFilter === tier.key;
                          const isDimmed = (hoveredSeverityTier && !isHovered) || (selectedSeverityFilter !== 'ALL' && !isSelected);

                          return (
                            <div
                              key={tier.key}
                              onMouseEnter={() => setHoveredSeverityTier(tier.key)}
                              onMouseLeave={() => setHoveredSeverityTier(null)}
                              onClick={() => setSelectedSeverityFilter(prev => prev === tier.key ? 'ALL' : tier.key)}
                              title={`${tier.label}: ${tier.stat.count} incidents (${tier.stat.pct}% of fleet) — Click to filter`}
                              style={{
                                width: `${tier.stat.pct}%`,
                                background: tier.barGradient,
                                cursor: 'pointer',
                                transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                                opacity: isDimmed ? 0.35 : 1,
                                transform: (isHovered || isSelected) ? 'scaleY(1.15)' : 'scaleY(1)',
                                boxShadow: (isHovered || isSelected) ? `0 0 8px ${tier.color}` : 'none',
                                position: 'relative',
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Interactive Telemetry Legend */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 16,
                        padding: '0 2px',
                      }}
                    >
                      {severityTiers.map(tier => {
                        const isSelected = selectedSeverityFilter === tier.key;
                        const isHovered = hoveredSeverityTier === tier.key;
                        return (
                          <button
                            key={tier.key}
                            onMouseEnter={() => setHoveredSeverityTier(tier.key)}
                            onMouseLeave={() => setHoveredSeverityTier(null)}
                            onClick={() => setSelectedSeverityFilter(prev => prev === tier.key ? 'ALL' : tier.key)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '3px 8px',
                              borderRadius: 5,
                              background: isSelected ? tier.badgeBg : isHovered ? 'var(--secondary)' : 'transparent',
                              border: isSelected ? `1px solid ${tier.color}` : '1px solid transparent',
                              color: isSelected ? tier.color : isHovered ? 'var(--foreground)' : 'var(--muted-foreground)',
                              fontSize: 10.5,
                              fontFamily: 'var(--font-mono)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span
                              className={tier.hasPulse ? 'telemetry-live-dot' : ''}
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: tier.color,
                                boxShadow: isSelected || isHovered ? `0 0 6px ${tier.color}` : 'none',
                                display: 'inline-block',
                              }}
                            />
                            <span>
                              {tier.label}:{' '}
                              <strong style={{ color: isSelected ? tier.color : 'var(--foreground)' }}>
                                {tier.stat.count}
                              </strong>{' '}
                              <span style={{ opacity: 0.75, fontSize: 10 }}>({tier.stat.pct}%)</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* 5 Severity Sub-Cards Grid */}
                    <div className="severity-cards-grid">
                      {severityTiers.map(tier => {
                        const isSelected = selectedSeverityFilter === tier.key;
                        const isHovered = hoveredSeverityTier === tier.key;

                        return (
                          <div
                            key={tier.key}
                            onMouseEnter={() => setHoveredSeverityTier(tier.key)}
                            onMouseLeave={() => setHoveredSeverityTier(null)}
                            onClick={() => setSelectedSeverityFilter(prev => prev === tier.key ? 'ALL' : tier.key)}
                            style={{
                              position: 'relative',
                              padding: '14px 16px',
                              borderRadius: 7,
                              background: `linear-gradient(180deg, ${tier.tintBg} 0%, var(--card) 100%)`,
                              border: `1px solid ${isSelected ? tier.color : isHovered ? tier.color : 'var(--border)'}`,
                              boxShadow: isSelected
                                ? `0 0 0 2px ${tier.color}, 0 6px 18px -2px ${tier.glowColor}`
                                : isHovered
                                ? `0 6px 16px -2px ${tier.glowColor}`
                                : '0 1px 3px rgba(0, 0, 0, 0.04)',
                              cursor: 'pointer',
                              transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                              transform: isSelected || isHovered ? 'translateY(-2px)' : 'none',
                              overflow: 'hidden',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              minHeight: 130,
                            }}
                          >
                            {/* Top Accent Strip */}
                            <div
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                height: 3,
                                background: tier.barGradient,
                              }}
                            />

                            <div>
                              {/* Card Header Row */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {tier.hasPulse && (
                                    <span
                                      className="telemetry-live-dot"
                                      style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: tier.color,
                                        boxShadow: `0 0 6px ${tier.color}`,
                                        display: 'inline-block',
                                      }}
                                    />
                                  )}
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: tier.color,
                                      fontFamily: 'var(--font-mono)',
                                      letterSpacing: '0.04em',
                                    }}
                                  >
                                    {tier.label}
                                  </span>
                                </div>
                                <span
                                  style={{
                                    fontSize: 9,
                                    color: tier.color,
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-mono)',
                                    background: tier.badgeBg,
                                    border: `1px solid ${tier.badgeBorder}`,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    letterSpacing: '0.02em',
                                  }}
                                >
                                  {tier.sublabel}
                                </span>
                              </div>

                              {/* Main Metric Counter Row */}
                              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '2px 0 6px' }}>
                                <span
                                  style={{
                                    fontSize: 32,
                                    fontWeight: 700,
                                    color: 'var(--foreground)',
                                    fontFamily: 'var(--font-sans)',
                                    letterSpacing: '-0.02em',
                                    lineHeight: 1,
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {tier.stat.count}
                                </span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: tier.color,
                                    fontFamily: 'var(--font-mono)',
                                    background: tier.badgeBg,
                                    border: `1px solid ${tier.badgeBorder}`,
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                  }}
                                >
                                  {tier.stat.pct}%
                                </span>
                              </div>

                              {/* Proportional Mini Share Bar */}
                              <div
                                style={{
                                  height: 3,
                                  width: '100%',
                                  background: 'var(--secondary)',
                                  borderRadius: 2,
                                  overflow: 'hidden',
                                  margin: '8px 0',
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.min(100, Math.max(tier.stat.pct, 3))}%`,
                                    background: tier.barGradient,
                                    borderRadius: 2,
                                    transition: 'width 0.4s ease',
                                  }}
                                />
                              </div>
                            </div>

                            {/* Card Footer: Description & State */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: 9.5,
                                color: 'var(--muted-foreground)',
                                fontFamily: 'var(--font-mono)',
                                marginTop: 'auto',
                                paddingTop: 4,
                              }}
                            >
                              <span>{tier.descriptor}</span>
                              <span
                                style={{
                                  fontSize: 8.5,
                                  fontWeight: 700,
                                  color: isSelected ? tier.color : isHovered ? tier.color : 'transparent',
                                  transition: 'color 0.15s ease',
                                }}
                              >
                                {isSelected ? '● ACTIVE' : 'FILTER →'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* TOP 10 SITES WITH INCIDENTS PANEL */}
            <section className="data-panel">
              <div className="data-panel-heading">
                <div className="provider-symbol">
                  <Building2 />
                </div>
                <div>
                  <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                    FACILITY RANKING
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500, margin: '2px 0 0' }}>
                    TOP 10 Sites with Incidents ({casesData.timeframeLabel})
                  </h2>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 220 }}>
                    <Input
                      placeholder="Filter site name..."
                      value={siteSearch}
                      onChange={e => setSiteSearch(e.target.value)}
                      style={{ height: 32, fontSize: 11, background: 'var(--card)' }}
                    />
                  </div>
                  <span className="pill" style={{ fontFamily: 'var(--font-mono)' }}>
                    {casesData.top10IncidentSites.length} Facilities Ranked
                  </span>
                </div>
              </div>

              {filteredTopSitesCases.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12.5, fontFamily: 'var(--font-mono)' }}>
                  No facilities with incidents found matching filter.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--muted-foreground)',
                          textAlign: 'left',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          letterSpacing: '0.05em',
                        }}
                      >
                        <th style={{ padding: '10px 18px', width: 60 }}>RANK</th>
                        <th style={{ padding: '10px 18px' }}>SITE NAME</th>
                        <th style={{ padding: '10px 18px' }}>PRODUCT LINE</th>
                        <th style={{ padding: '10px 18px', textAlign: 'center' }}>TOTAL INCIDENTS</th>
                        <th style={{ padding: '10px 18px' }}>SEVERITY BREAKDOWN</th>
                        <th style={{ padding: '10px 18px', textAlign: 'right' }}>FACILITY DOWNTIME</th>
                        <th style={{ padding: '10px 18px', textAlign: 'right' }}>FLEET SHARE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTopSitesCases.map(s => {
                        return (
                          <tr
                            key={s.siteName}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              transition: 'background 0.12s ease',
                            }}
                            className="site-table-row"
                          >
                            <td style={{ padding: '12px 18px', fontFamily: 'var(--font-mono)' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: 22,
                                  height: 22,
                                  borderRadius: '50%',
                                  background: s.rank === 1 ? 'var(--primary)' : s.rank === 2 ? 'var(--soft-orange)' : 'var(--secondary)',
                                  color: s.rank <= 2 ? '#ffffff' : 'var(--foreground)',
                                  fontWeight: 700,
                                  fontSize: 10,
                                }}
                              >
                                #{s.rank}
                              </span>
                            </td>
                            <td style={{ padding: '12px 18px', fontWeight: 600, color: 'var(--foreground)' }}>
                              <Link
                                to="/red-zone"
                                style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                              >
                                {s.siteName}
                                <ArrowUpRight style={{ width: 11, height: 11, opacity: 0.6 }} />
                              </Link>
                            </td>
                            <td style={{ padding: '12px 18px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                              {s.productLine || '—'}
                            </td>
                            <td style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-sans)' }}>
                              {s.totalIncidents}
                            </td>
                            <td style={{ padding: '12px 18px' }}>
                              <div style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                                {s.sev1Count > 0 && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      fontWeight: 700,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      background: '#dc2626',
                                      color: '#ffffff',
                                      fontFamily: 'var(--font-mono)',
                                    }}
                                  >
                                    Sev1: {s.sev1Count}
                                  </span>
                                )}
                                {s.sev2UrgentCount > 0 && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      fontWeight: 700,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      background: '#ea580c',
                                      color: '#ffffff',
                                      fontFamily: 'var(--font-mono)',
                                    }}
                                  >
                                    Sev2-U: {s.sev2UrgentCount}
                                  </span>
                                )}
                                {s.sev2HighCount > 0 && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      fontWeight: 600,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      background: 'var(--yellow-surface)',
                                      color: 'var(--yellow)',
                                      border: '1px solid var(--border)',
                                      fontFamily: 'var(--font-mono)',
                                    }}
                                  >
                                    Sev2-H: {s.sev2HighCount}
                                  </span>
                                )}
                                {s.sev3Count > 0 && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      fontWeight: 600,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      background: 'var(--blue-surface)',
                                      color: 'var(--blue)',
                                      border: '1px solid var(--border)',
                                      fontFamily: 'var(--font-mono)',
                                    }}
                                  >
                                    Sev3: {s.sev3Count}
                                  </span>
                                )}
                                {s.sev4Count > 0 && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      fontWeight: 600,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      background: 'var(--muted)',
                                      color: 'var(--muted-foreground)',
                                      border: '1px solid var(--border)',
                                      fontFamily: 'var(--font-mono)',
                                    }}
                                  >
                                    Sev4: {s.sev4Count}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td
                              style={{
                                padding: '12px 18px',
                                textAlign: 'right',
                                fontWeight: 600,
                                fontFamily: 'var(--font-mono)',
                                color: s.downtimeHours > 0 ? '#ef4444' : 'var(--muted-foreground)',
                              }}
                            >
                              {formatHours(s.downtimeHours)}
                            </td>
                            <td style={{ padding: '12px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                              {s.sharePct}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* DUAL PANELS: SITES WITH MOST DOWNTIME & MOST BREACHED SITES */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                gap: 20,
              }}
            >
              {/* Site with Most Downtimes Panel */}
              <section className="data-panel">
                <div className="data-panel-heading">
                  <div className="provider-symbol" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                    <Clock />
                  </div>
                  <div>
                    <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                      DOWNTIME LEADERS
                    </span>
                    <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, margin: '2px 0 0' }}>
                      Sites with Most Downtime
                    </h2>
                  </div>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  {casesData.sitesWithMostDowntime.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      Zero facility outage downtime recorded in this timeframe.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {casesData.sitesWithMostDowntime.map(item => (
                        <div
                          key={item.siteName}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: 6,
                            background: 'var(--secondary)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: 'var(--muted-foreground)',
                              }}
                            >
                              #{item.rank}
                            </span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--foreground)' }}>
                                {item.siteName}
                              </div>
                              <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                                {item.productLine} &bull; {item.criticalIncidents} urgent cases
                              </div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
                              {formatHours(item.downtimeHours)}
                            </div>
                            <div style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>outage window</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Most Breached Sites Panel */}
              <section className="data-panel">
                <div className="data-panel-heading">
                  <div className="provider-symbol" style={{ background: 'var(--orange-surface)', color: 'var(--soft-orange)' }}>
                    <ShieldAlert />
                  </div>
                  <div>
                    <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                      CRITICAL BREACH THRESHOLDS
                    </span>
                    <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, margin: '2px 0 0' }}>
                      Most Breached Sites
                    </h2>
                  </div>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  {casesData.mostBreachedSites.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      No facility SLA breaches detected in this timeframe. Fleet is fully compliant.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {casesData.mostBreachedSites.map(item => (
                        <div
                          key={item.siteName}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: 6,
                            background: item.breachSeverity === 'CRITICAL_BREACH' ? 'rgba(239, 68, 68, 0.06)' : 'var(--orange-surface)',
                            border: `1px solid ${item.breachSeverity === 'CRITICAL_BREACH' ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)'}`,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: item.breachSeverity === 'CRITICAL_BREACH' ? '#ef4444' : 'var(--soft-orange)',
                              }}
                            >
                              #{item.rank}
                            </span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--foreground)' }}>
                                {item.siteName}
                              </div>
                              <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                                {item.sev1Count} Sev-1 &bull; {item.sev2UrgentCount} Sev-2 Urgent
                              </div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                fontSize: 9,
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: 4,
                                background: item.breachSeverity === 'CRITICAL_BREACH' ? '#dc2626' : 'var(--primary)',
                                color: '#ffffff',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {item.breachSeverity === 'CRITICAL_BREACH' ? 'CRITICAL' : 'ELEVATED'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* TOP MOST BREACHED & CRITICAL TICKETS PANEL */}
            <section className="data-panel">
              <div className="data-panel-heading">
                <div className="provider-symbol" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                  <Flame />
                </div>
                <div>
                  <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                    SEV 1 &amp; SEV 2 URGENT TELEMETRY
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500, margin: '2px 0 0' }}>
                    Top Most Breached &amp; Critical Tickets
                  </h2>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {selectedSeverityFilter !== 'ALL' && (
                    <button
                      onClick={() => setSelectedSeverityFilter('ALL')}
                      style={{
                        height: 32,
                        padding: '0 10px',
                        fontSize: 10.5,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        background: 'rgba(239, 68, 68, 0.12)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      title="Clear severity filter"
                    >
                      FILTER: {selectedSeverityFilter.toUpperCase().replace('_', ' ')} ✕
                    </button>
                  )}
                  <div style={{ width: 240 }}>
                    <Input
                      placeholder="Search ticket #, site, subject..."
                      value={ticketSearch}
                      onChange={e => setTicketSearch(e.target.value)}
                      style={{ height: 32, fontSize: 11, background: 'var(--card)' }}
                    />
                  </div>
                  <span className="pill" style={{ fontFamily: 'var(--font-mono)' }}>
                    {filteredCriticalTickets.length} Outages
                  </span>
                </div>
              </div>

              {filteredCriticalTickets.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  No Sev 1 or Sev 2 Urgent incidents recorded in this timeframe.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--muted-foreground)',
                          textAlign: 'left',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          letterSpacing: '0.05em',
                        }}
                      >
                        <th style={{ padding: '10px 18px', width: 115 }}>CASE #</th>
                        <th style={{ padding: '10px 18px' }}>FACILITY</th>
                        <th style={{ padding: '10px 18px' }}>SEVERITY</th>
                        <th style={{ padding: '10px 18px' }}>SUBJECT</th>
                        <th style={{ padding: '10px 18px' }}>SUBSYSTEM</th>
                        <th style={{ padding: '10px 18px', textAlign: 'right' }}>OUTAGE DOWNTIME</th>
                        <th style={{ padding: '10px 18px' }}>STATUS</th>
                        <th style={{ padding: '10px 18px' }}>CREATED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCriticalTickets.map(t => {
                        const isSev1 = t.detailedSeverity === 'sev1';
                        const isSev2U = t.detailedSeverity === 'sev2_urgent';
                        return (
                          <tr
                            key={t.id || t.caseNumber}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              transition: 'background 0.12s ease',
                            }}
                            className="site-table-row"
                          >
                            <td style={{ padding: '12px 18px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                              <a
                                href={
                                  t.id && String(t.id).startsWith('500')
                                    ? `https://greyorangeorg.lightning.force.com/lightning/r/Case/${t.id}/view`
                                    : `https://greyorangeorg.my.salesforce.com/${t.id || t.caseNumber}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Open Case ${t.caseNumber} in Salesforce`}
                                className="case-number-tag"
                              >
                                {t.caseNumber}
                                <ArrowUpRight style={{ width: 10, height: 10 }} />
                              </a>
                            </td>
                            <td style={{ padding: '12px 18px', fontWeight: 600, color: 'var(--foreground)' }}>
                              {t.siteName}
                            </td>
                            <td style={{ padding: '12px 18px' }}>
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: isSev1 ? '#dc2626' : isSev2U ? '#ea580c' : 'var(--secondary)',
                                  color: '#ffffff',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                {isSev1 ? 'SEV 1' : isSev2U ? 'SEV 2 URGENT' : 'CRITICAL'}
                              </span>
                              {t.isSiteDown && (
                                <span
                                  className="case-down-badge"
                                  style={{ marginLeft: 5 }}
                                >
                                  DOWN
                                </span>
                              )}
                            </td>
                            <td
                              style={{
                                padding: '12px 18px',
                                maxWidth: 280,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={t.subject}
                            >
                              {t.subject}
                            </td>
                            <td style={{ padding: '12px 18px', color: 'var(--muted-foreground)', fontSize: 11 }}>
                              {t.subsystem}
                            </td>
                            <td
                              style={{
                                padding: '12px 18px',
                                textAlign: 'right',
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                                color: t.durationHours && t.durationHours > 0 ? '#ef4444' : 'var(--foreground)',
                              }}
                            >
                              {formatHours(t.durationHours)}
                            </td>
                            <td style={{ padding: '12px 18px' }}>
                              <span
                                className={`case-status-badge ${t.isResolved ? 'status-new' : 'status-progress'}`}
                              >
                                {t.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px 18px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                              {formatDate(t.createdDate)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* STABLE FACILITIES PANEL */}
            <section className="data-panel">
              <div className="data-panel-heading">
                <div className="provider-symbol" style={{ background: 'var(--green-surface)', color: 'var(--success)' }}>
                  <CheckCircle2 />
                </div>
                <div>
                  <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                    UNINTERRUPTED FACILITIES
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, margin: '2px 0 0' }}>
                    Stable Sites with Zero Incidents ({casesData.stableSites.length})
                  </h2>
                </div>

                {casesData.stableSites.length > 12 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllStableSites(!showAllStableSites)}
                    style={{ marginLeft: 'auto', fontSize: 11, height: 28, fontFamily: 'var(--font-mono)' }}
                  >
                    {showAllStableSites ? (
                      <>
                        COLLAPSE <ChevronUp style={{ width: 12, height: 12, marginLeft: 4 }} />
                      </>
                    ) : (
                      <>
                        VIEW ALL ({casesData.stableSites.length}) <ChevronDown style={{ width: 12, height: 12, marginLeft: 4 }} />
                      </>
                    )}
                  </Button>
                )}
              </div>

              <div style={{ padding: '18px 22px' }}>
                {casesData.stableSites.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    Every monitored site experienced at least one ticket during this timeframe.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      maxHeight: showAllStableSites ? 'none' : 110,
                      overflow: 'hidden',
                    }}
                  >
                    {casesData.stableSites.map(s => (
                      <span
                        key={s.siteName}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 10px',
                          borderRadius: 4,
                          background: 'var(--secondary)',
                          border: '1px solid var(--border)',
                          fontSize: 11.5,
                          fontWeight: 500,
                          color: 'var(--foreground)',
                        }}
                      >
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)' }} />
                        <strong>{s.siteName}</strong>
                        {s.productLine && (
                          <span style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                            ({s.productLine})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* SUBSYSTEM BREAKDOWN & REOCCURRING PATTERNS */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                gap: 20,
              }}
            >
              {/* Subsystem Incident Breakdown */}
              <section className="data-panel">
                <div className="data-panel-heading">
                  <div className="provider-symbol">
                    <Layers />
                  </div>
                  <div>
                    <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                      ROOT CAUSE DOMAINS
                    </span>
                    <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, margin: '2px 0 0' }}>
                      Subsystem Incident Breakdown
                    </h2>
                  </div>
                </div>

                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {casesData.subsystemBreakdown.map(sub => (
                    <div key={sub.subsystem} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                        <span style={{ fontWeight: 500, color: 'var(--foreground)' }}>
                          {sub.subsystem}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)' }}>
                          {sub.count} ({sub.pct}%)
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: 'var(--secondary)',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${sub.pct}%`,
                            background:
                              sub.subsystem === 'Robotics & Hardware'
                                ? 'var(--primary)'
                                : sub.subsystem === 'Software & Database'
                                ? 'var(--blue)'
                                : sub.subsystem === 'System Outage'
                                ? '#ef4444'
                                : 'var(--muted-foreground)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Reoccurring Issues Clustering */}
              <section className="data-panel">
                <div className="data-panel-heading">
                  <div className="provider-symbol" style={{ background: 'var(--orange-surface)', color: 'var(--soft-orange)' }}>
                    <Wrench />
                  </div>
                  <div>
                    <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                      RECURRING SIGNATURES
                    </span>
                    <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, margin: '2px 0 0' }}>
                      Reoccurring Incident Patterns
                    </h2>
                  </div>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  {casesData.reoccurringPatterns.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      No recurrent incident patterns detected in this timeframe.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {casesData.reoccurringPatterns.map(pat => (
                        <div
                          key={pat.signature}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '9px 12px',
                            borderRadius: 6,
                            background: 'var(--secondary)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--foreground)' }}>
                            {pat.signature}
                          </span>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: 'var(--orange-surface)',
                              color: 'var(--soft-orange)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {pat.count} cases
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ================= ALERTS ANALYTICS VIEW ================= */}
        {activeTab === 'alerts' && alertsData && !isCurrentLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* OVERVIEW METRICS (ALERTS) */}
            <div className="overview-metrics" style={{ marginTop: 0, marginBottom: 4 }}>
              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <Radio />
                  TOTAL SIGNALS &amp; ALERTS
                </span>
                <div>
                  <strong style={{ fontFamily: 'var(--font-sans)' }}>{alertsData.kpis.totalAlerts}</strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>In {alertsData.timeframeLabel}</span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span className="source-dot" style={{ background: 'var(--blue)' }} />
                  {alertsData.kpis.activeAlertsCount || 0} Currently Firing
                </div>
              </div>

              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <ShieldAlert />
                  ALERT SLA BREACHES
                </span>
                <div>
                  <strong
                    style={{
                      fontFamily: 'var(--font-sans)',
                      color: (alertsData.kpis.breachedAlertsCount || 0) > 0 ? '#ef4444' : 'var(--foreground)',
                    }}
                  >
                    {alertsData.kpis.breachedAlertsCount || 0}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {alertsData.kpis.breachRatePct || 0}% Breach Rate
                  </span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span
                    className="source-dot"
                    style={{
                      background: (alertsData.kpis.activeBreachedAlertsCount || 0) > 0 ? '#ef4444' : 'var(--success)',
                    }}
                  />
                  {alertsData.kpis.activeBreachedAlertsCount || 0} Active Overdue
                </div>
              </div>

              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <Clock />
                  AVG RESOLUTION / MTTA
                </span>
                <div>
                  <strong style={{ fontFamily: 'var(--font-sans)' }}>
                    {formatHours(alertsData.kpis.averageResolutionHours)}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>Signal Mitigation MTTR</span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span className="source-dot" style={{ background: 'var(--blue)' }} />
                  Response SLA Target: 30m / 2h
                </div>
              </div>

              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <AlertTriangle />
                  P1 CRITICAL SIGNALS
                </span>
                <div>
                  <strong style={{ fontFamily: 'var(--font-sans)', color: '#ef4444' }}>
                    {alertsData.kpis.p1CriticalCount}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {alertsData.kpis.p1BreachedCount || 0} Breached (30m Target)
                  </span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span className="source-dot" style={{ background: '#ef4444' }} />
                  Immediate Opsgenie Triggers
                </div>
              </div>

              <div className="metric">
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <Zap />
                  P2 HIGH SIGNALS
                </span>
                <div>
                  <strong style={{ fontFamily: 'var(--font-sans)', color: 'var(--soft-orange)' }}>
                    {alertsData.kpis.p2HighCount}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {alertsData.kpis.p2BreachedCount || 0} Breached (2h Target)
                  </span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span className="source-dot" style={{ background: 'var(--soft-orange)' }} />
                  Degraded Subsystem Events
                </div>
              </div>

              <div className="metric" style={{ borderRight: 'none' }}>
                <span className="metric-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
                  <Building2 />
                  FACILITIES IN ALERT
                </span>
                <div>
                  <strong style={{ fontFamily: 'var(--font-sans)' }}>
                    {alertsData.kpis.activeAlertSitesCount}
                  </strong>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    Of {alertsData.kpis.monitoredSitesCount} Monitored Facilities
                  </span>
                </div>
                <div className="metric-foot" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                  <span className="source-dot" style={{ background: 'var(--success)' }} />
                  {alertsData.kpis.stableSitesCount} Sites with Zero Alerts
                </div>
              </div>
            </div>

            {/* PRIORITY & SLA TARGETS BREAKDOWN STRIP */}
            {(() => {
              const alertTiers = [
                {
                  key: 'P1',
                  label: 'P1 CRITICAL',
                  sla: '30m',
                  descriptor: 'Immediate Escalation',
                  color: '#dc2626',
                  glowColor: 'rgba(220, 38, 38, 0.25)',
                  tintBg: 'rgba(220, 38, 38, 0.04)',
                  barGradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  badgeBg: 'rgba(220, 38, 38, 0.08)',
                  badgeBorder: 'rgba(220, 38, 38, 0.25)',
                  count: alertsData.priorityBreakdown.p1.count,
                  pct: alertsData.priorityBreakdown.p1.pct,
                  breached: alertsData.priorityBreakdown.p1.breached || 0,
                  hasPulse: true,
                },
                {
                  key: 'P2',
                  label: 'P2 HIGH',
                  sla: '2h',
                  descriptor: 'Degraded Subsystem',
                  color: '#ea580c',
                  glowColor: 'rgba(234, 88, 12, 0.25)',
                  tintBg: 'rgba(234, 88, 12, 0.04)',
                  barGradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                  badgeBg: 'rgba(234, 88, 12, 0.08)',
                  badgeBorder: 'rgba(234, 88, 12, 0.25)',
                  count: alertsData.priorityBreakdown.p2.count,
                  pct: alertsData.priorityBreakdown.p2.pct,
                  breached: alertsData.priorityBreakdown.p2.breached || 0,
                  hasPulse: true,
                },
                {
                  key: 'P3',
                  label: 'P3 MEDIUM',
                  sla: '8h',
                  descriptor: 'Non-Blocking Anomaly',
                  color: '#0284c7',
                  glowColor: 'rgba(2, 132, 199, 0.25)',
                  tintBg: 'rgba(2, 132, 199, 0.04)',
                  barGradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  badgeBg: 'rgba(2, 132, 199, 0.08)',
                  badgeBorder: 'rgba(2, 132, 199, 0.25)',
                  count: alertsData.priorityBreakdown.p3.count,
                  pct: alertsData.priorityBreakdown.p3.pct,
                  breached: alertsData.priorityBreakdown.p3.breached || 0,
                  hasPulse: false,
                },
                {
                  key: 'P4',
                  label: 'P4 LOW',
                  sla: '24h',
                  descriptor: 'Routine Maintenance',
                  color: '#ca8a04',
                  glowColor: 'rgba(202, 138, 4, 0.25)',
                  tintBg: 'rgba(202, 138, 4, 0.04)',
                  barGradient: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                  badgeBg: 'rgba(202, 138, 4, 0.08)',
                  badgeBorder: 'rgba(202, 138, 4, 0.25)',
                  count: alertsData.priorityBreakdown.p4.count,
                  pct: alertsData.priorityBreakdown.p4.pct,
                  breached: alertsData.priorityBreakdown.p4.breached || 0,
                  hasPulse: false,
                },
                {
                  key: 'P5',
                  label: 'P5 INFO',
                  sla: 'Informational',
                  descriptor: 'Telemetry Heartbeats',
                  color: '#64748b',
                  glowColor: 'rgba(100, 116, 139, 0.2)',
                  tintBg: 'rgba(100, 116, 139, 0.04)',
                  barGradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
                  badgeBg: 'rgba(100, 116, 139, 0.08)',
                  badgeBorder: 'rgba(100, 116, 139, 0.25)',
                  count: alertsData.priorityBreakdown.p5.count,
                  pct: alertsData.priorityBreakdown.p5.pct,
                  breached: alertsData.priorityBreakdown.p5.breached || 0,
                  hasPulse: false,
                },
              ];

              return (
                <section className="data-panel">
                  <div className="data-panel-heading">
                    <div className="provider-symbol">
                      <Radio />
                    </div>
                    <div>
                      <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                        ALERT SLA COMPLIANCE
                      </span>
                      <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500, color: 'var(--foreground)', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                        Response SLA Distribution by Urgency Tier
                        {alertPriorityFilter !== 'ALL' && (
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: 'rgba(220, 38, 38, 0.1)',
                              border: '1px solid #dc2626',
                              color: '#dc2626',
                              fontWeight: 700,
                            }}
                          >
                            FILTERED: {alertPriorityFilter}
                          </span>
                        )}
                      </h2>
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                      {alertPriorityFilter !== 'ALL' && (
                        <button
                          onClick={() => setAlertPriorityFilter('ALL')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 6,
                            background: 'rgba(220, 38, 38, 0.1)',
                            border: '1px solid rgba(220, 38, 38, 0.25)',
                            color: '#dc2626',
                            fontSize: 10.5,
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          CLEAR FILTER ✕
                        </button>
                      )}
                      <span className="pill" style={{ fontFamily: 'var(--font-mono)' }}>
                        Total: {alertsData.priorityBreakdown.total} Alerts
                      </span>
                    </div>
                  </div>

                  <div style={{ padding: '20px 23px' }}>
                    {/* Modern Gauge */}
                    <div style={{ background: 'var(--secondary)', padding: '3px', borderRadius: 6, border: '1px solid var(--border)', boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.06)', marginBottom: 16 }}>
                      <div style={{ height: 12, width: '100%', display: 'flex', gap: 2, borderRadius: 4, overflow: 'hidden' }}>
                        {alertTiers.map(tier => {
                          if (tier.pct <= 0) return null;
                          const isSelected = alertPriorityFilter === tier.key;
                          return (
                            <div
                              key={tier.key}
                              onClick={() => setAlertPriorityFilter(prev => prev === tier.key ? 'ALL' : tier.key)}
                              style={{
                                width: `${tier.pct}%`,
                                background: tier.barGradient,
                                cursor: 'pointer',
                                transition: 'all 0.18s ease',
                                transform: isSelected ? 'scaleY(1.15)' : 'scaleY(1)',
                                boxShadow: isSelected ? `0 0 8px ${tier.color}` : 'none',
                              }}
                              title={`${tier.label}: ${tier.count} alerts (${tier.pct}%) - Click to filter`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Cards */}
                    <div className="severity-cards-grid">
                      {alertTiers.map(tier => {
                        const isSelected = alertPriorityFilter === tier.key;
                        return (
                          <div
                            key={tier.key}
                            onClick={() => setAlertPriorityFilter(prev => prev === tier.key ? 'ALL' : tier.key)}
                            style={{
                              position: 'relative',
                              padding: '14px 16px',
                              borderRadius: 7,
                              background: `linear-gradient(180deg, ${tier.tintBg} 0%, var(--card) 100%)`,
                              border: `1px solid ${isSelected ? tier.color : 'var(--border)'}`,
                              boxShadow: isSelected
                                ? `0 0 0 2px ${tier.color}, 0 6px 18px -2px ${tier.glowColor}`
                                : '0 1px 3px rgba(0, 0, 0, 0.04)',
                              cursor: 'pointer',
                              transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                              transform: isSelected ? 'translateY(-2px)' : 'none',
                              overflow: 'hidden',
                              minHeight: 130,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                            }}
                          >
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: tier.barGradient }} />
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {tier.hasPulse && (
                                    <span className="telemetry-live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: tier.color, boxShadow: `0 0 6px ${tier.color}`, display: 'inline-block' }} />
                                  )}
                                  <span style={{ fontSize: 11, fontWeight: 700, color: tier.color, fontFamily: 'var(--font-mono)' }}>
                                    {tier.label}
                                  </span>
                                </div>
                                <span style={{ fontSize: 9, color: tier.color, fontWeight: 700, fontFamily: 'var(--font-mono)', background: tier.badgeBg, border: `1px solid ${tier.badgeBorder}`, padding: '2px 6px', borderRadius: 4 }}>
                                  SLA: {tier.sla}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '2px 0 6px' }}>
                                <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--foreground)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                                  {tier.count}
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: tier.color, fontFamily: 'var(--font-mono)', background: tier.badgeBg, padding: '1px 6px', borderRadius: 4, border: `1px solid ${tier.badgeBorder}` }}>
                                  {tier.pct}%
                                </span>
                              </div>

                              <div style={{ height: 3, width: '100%', background: 'var(--secondary)', borderRadius: 2, overflow: 'hidden', margin: '8px 0' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, Math.max(tier.pct, 3))}%`, background: tier.barGradient, borderRadius: 2 }} />
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', marginTop: 'auto', paddingTop: 4 }}>
                              <span style={{ color: tier.breached > 0 ? tier.color : 'var(--muted-foreground)', fontWeight: tier.breached > 0 ? 700 : 500 }}>
                                {tier.breached > 0 ? `${tier.breached} SLA Breached` : 'Zero Breaches'}
                              </span>
                              <span style={{ color: isSelected ? tier.color : 'transparent', fontWeight: 700, fontSize: 8.5 }}>
                                {isSelected ? '● ACTIVE' : 'FILTER →'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* DUAL PANELS: TOP 10 SITES BY ALERTS & MOST BREACHED ALERT SITES */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                gap: 20,
              }}
            >
              {/* TOP 10 SITES BY ALERT FREQUENCY */}
              <section className="data-panel">
                <div className="data-panel-heading">
                  <div className="provider-symbol" style={{ background: 'var(--blue-surface)', color: 'var(--blue)' }}>
                    <Building2 />
                  </div>
                  <div>
                    <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                      FREQUENCY RANKING
                    </span>
                    <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, margin: '2px 0 0' }}>
                      TOP 10 Sites by Alert Volume
                    </h2>
                  </div>

                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="pill" style={{ fontFamily: 'var(--font-mono)' }}>
                      {alertsData.top10AlertSites.length} Facilities
                    </span>
                  </div>
                </div>

                {filteredTopSitesAlerts.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    No facilities with alerts found in this timeframe.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr
                          style={{
                            borderBottom: '1px solid var(--border)',
                            color: 'var(--muted-foreground)',
                            textAlign: 'left',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            letterSpacing: '0.05em',
                          }}
                        >
                          <th style={{ padding: '10px 14px', width: 50 }}>RANK</th>
                          <th style={{ padding: '10px 14px' }}>SITE NAME</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center' }}>ALERTS</th>
                          <th style={{ padding: '10px 14px' }}>PRIORITY</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right' }}>BREACHES</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right' }}>SHARE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTopSitesAlerts.map(s => (
                          <tr
                            key={s.siteName}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              transition: 'background 0.12s ease',
                            }}
                            className="site-table-row"
                          >
                            <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: 20,
                                  height: 20,
                                  borderRadius: '50%',
                                  background: s.rank === 1 ? 'var(--blue)' : 'var(--secondary)',
                                  color: s.rank === 1 ? '#ffffff' : 'var(--foreground)',
                                  fontWeight: 700,
                                  fontSize: 9.5,
                                }}
                              >
                                #{s.rank}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--foreground)' }}>
                              <div>{s.siteName}</div>
                              <div style={{ fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                                {s.productLine || '—'}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, fontSize: 12.5, fontFamily: 'var(--font-sans)' }}>
                              {s.totalAlerts}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'inline-flex', gap: 3, flexWrap: 'wrap' }}>
                                {s.p1Count > 0 && (
                                  <span style={{ fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#dc2626', color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                                    P1: {s.p1Count}
                                  </span>
                                )}
                                {s.p2Count > 0 && (
                                  <span style={{ fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#ea580c', color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                                    P2: {s.p2Count}
                                  </span>
                                )}
                                {s.p3Count > 0 && (
                                  <span style={{ fontSize: 8.5, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'var(--blue-surface)', color: 'var(--blue)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>
                                    P3: {s.p3Count}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: (s.breachedCount || 0) > 0 ? '#ef4444' : 'var(--muted-foreground)' }}>
                              {(s.breachedCount || 0) > 0 ? `${s.breachedCount} breached` : '0'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                              {s.sharePct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* MOST BREACHED SITES BY ALERTS */}
              <section className="data-panel">
                <div className="data-panel-heading">
                  <div className="provider-symbol" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                    <ShieldAlert />
                  </div>
                  <div>
                    <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                      SLA VIOLATIONS
                    </span>
                    <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, margin: '2px 0 0' }}>
                      Most Breached Sites (Alerts)
                    </h2>
                  </div>

                  <div style={{ marginLeft: 'auto' }}>
                    <span className="pill" style={{ fontFamily: 'var(--font-mono)', color: '#ef4444' }}>
                      {alertsData.mostBreachedAlertSites?.length || 0} Facilities Breaching
                    </span>
                  </div>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  {(!alertsData.mostBreachedAlertSites || alertsData.mostBreachedAlertSites.length === 0) ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      Zero alert SLA breaches recorded in this timeframe. All customer facilities are compliant!
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {alertsData.mostBreachedAlertSites.map(item => (
                        <div
                          key={item.siteName}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: 6,
                            background: item.breachSeverity === 'CRITICAL_BREACH' ? 'rgba(239, 68, 68, 0.06)' : 'var(--orange-surface)',
                            border: `1px solid ${item.breachSeverity === 'CRITICAL_BREACH' ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)'}`,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: item.breachSeverity === 'CRITICAL_BREACH' ? '#ef4444' : 'var(--soft-orange)',
                              }}
                            >
                              #{item.rank}
                            </span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--foreground)' }}>
                                {item.siteName}
                              </div>
                              <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                                {item.productLine} &bull; {item.p1Breaches > 0 ? `${item.p1Breaches} P1 Critical Breaches` : `${item.p2Breaches} P2 Breaches`}
                              </div>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
                                {item.breachedCount} breached
                              </div>
                              <div style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                                {item.breachRatePct}% breach rate
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: 8.5,
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                                padding: '3px 7px',
                                borderRadius: 4,
                                background: item.breachSeverity === 'CRITICAL_BREACH' ? '#ef4444' : 'var(--soft-orange)',
                                color: '#ffffff',
                              }}
                            >
                              {item.breachSeverity === 'CRITICAL_BREACH' ? 'CRITICAL' : 'ELEVATED'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* DEDICATED FULL-WIDTH PANEL: TOP MOST BREACHED ALERTS (OVERDUE SIGNALS) */}
            <section className="data-panel">
              <div className="data-panel-heading">
                <div className="provider-symbol" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                  <ShieldAlert />
                </div>
                <div>
                  <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                    OVERDUE SIGNALS &amp; RESPONSE BREACHES
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500, margin: '2px 0 0' }}>
                    Top Most Breached Alerts ({filteredBreachedAlerts.length})
                  </h2>
                </div>

                {/* Filters Bar: Search, Priority Filter, Breach Status Filter */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ width: 220 }}>
                    <Input
                      placeholder="Filter alert, site, subject..."
                      value={alertTicketSearch}
                      onChange={e => setAlertTicketSearch(e.target.value)}
                      style={{ height: 30, fontSize: 11, background: 'var(--card)' }}
                    />
                  </div>

                  {/* Priority Selector */}
                  <div style={{ display: 'inline-flex', background: 'var(--secondary)', padding: 2, borderRadius: 5, border: '1px solid var(--border)' }}>
                    {(['ALL', 'P1', 'P2', 'P3'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setAlertPriorityFilter(p)}
                        style={{
                          fontSize: 9.5,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: alertPriorityFilter === p ? 700 : 500,
                          padding: '3px 8px',
                          borderRadius: 4,
                          border: 'none',
                          background: alertPriorityFilter === p ? (p === 'P1' ? '#dc2626' : p === 'P2' ? '#ea580c' : 'var(--blue)') : 'transparent',
                          color: alertPriorityFilter === p ? '#ffffff' : 'var(--muted-foreground)',
                          cursor: 'pointer',
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Breach Status Selector */}
                  <div style={{ display: 'inline-flex', background: 'var(--secondary)', padding: 2, borderRadius: 5, border: '1px solid var(--border)' }}>
                    {(['ALL', 'ACTIVE_BREACH', 'RESOLVED_BREACH'] as const).map(b => (
                      <button
                        key={b}
                        onClick={() => setAlertBreachFilter(b)}
                        style={{
                          fontSize: 9.5,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: alertBreachFilter === b ? 700 : 500,
                          padding: '3px 8px',
                          borderRadius: 4,
                          border: 'none',
                          background: alertBreachFilter === b ? 'var(--card)' : 'transparent',
                          color: alertBreachFilter === b ? 'var(--foreground)' : 'var(--muted-foreground)',
                          cursor: 'pointer',
                        }}
                      >
                        {b === 'ALL' ? 'ALL BREACHES' : b === 'ACTIVE_BREACH' ? 'ACTIVE OVERDUE' : 'RESOLVED'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {filteredBreachedAlerts.length === 0 ? (
                <div style={{ padding: 36, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  {alertTicketSearch || alertPriorityFilter !== 'ALL' || alertBreachFilter !== 'ALL'
                    ? 'No breached alerts match the selected filters.'
                    : 'Zero alert SLA breaches recorded in this timeframe! All signals mitigated within targets.'}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--muted-foreground)',
                          textAlign: 'left',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          letterSpacing: '0.05em',
                        }}
                      >
                        <th style={{ padding: '10px 18px', width: 120 }}>ALERT / CASE #</th>
                        <th style={{ padding: '10px 18px' }}>FACILITY</th>
                        <th style={{ padding: '10px 18px' }}>PRIORITY</th>
                        <th style={{ padding: '10px 18px' }}>SUBJECT</th>
                        <th style={{ padding: '10px 18px' }}>SUBSYSTEM</th>
                        <th style={{ padding: '10px 18px', textAlign: 'right' }}>DURATION</th>
                        <th style={{ padding: '10px 18px', textAlign: 'center' }}>SLA TARGET</th>
                        <th style={{ padding: '10px 18px', textAlign: 'right' }}>BREACH OVERDUE</th>
                        <th style={{ padding: '10px 18px' }}>STATUS</th>
                        <th style={{ padding: '10px 18px' }}>TRIGGERED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBreachedAlerts.map(a => {
                        const isP1 = a.priority === 'P1';
                        const isP2 = a.priority === 'P2';
                        return (
                          <tr
                            key={a.id || a.caseNumber}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              transition: 'background 0.12s ease',
                            }}
                            className="site-table-row"
                          >
                            <td style={{ padding: '12px 18px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                              <a
                                href={
                                  a.id && String(a.id).startsWith('500')
                                    ? `https://greyorangeorg.lightning.force.com/lightning/r/Case/${a.id}/view`
                                    : `https://greyorangeorg.my.salesforce.com/${a.id || a.caseNumber}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Open Alert Case ${a.caseNumber} in Salesforce`}
                                className="case-number-tag"
                              >
                                {a.caseNumber}
                                <ArrowUpRight style={{ width: 10, height: 10 }} />
                              </a>
                            </td>
                            <td style={{ padding: '12px 18px', fontWeight: 600, color: 'var(--foreground)' }}>
                              {a.siteName}
                            </td>
                            <td style={{ padding: '12px 18px' }}>
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: isP1 ? '#dc2626' : isP2 ? '#ea580c' : 'var(--blue)',
                                  color: '#ffffff',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                {a.priority}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: '12px 18px',
                                maxWidth: 280,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={a.subject}
                            >
                              {a.subject}
                            </td>
                            <td style={{ padding: '12px 18px', color: 'var(--muted-foreground)', fontSize: 11 }}>
                              {a.subsystem}
                            </td>
                            <td
                              style={{
                                padding: '12px 18px',
                                textAlign: 'right',
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                                color: a.isActiveBreach ? '#ef4444' : 'var(--foreground)',
                              }}
                            >
                              {formatHours(a.durationHours)}
                            </td>
                            <td style={{ padding: '12px 18px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-foreground)' }}>
                              {formatHours(a.slaTargetHours)}
                            </td>
                            <td
                              style={{
                                padding: '12px 18px',
                                textAlign: 'right',
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                                color: '#ef4444',
                              }}
                            >
                              +{formatHours(a.breachOverdueHours)}
                            </td>
                            <td style={{ padding: '12px 18px' }}>
                              <span
                                className={`case-status-badge ${a.isOpen ? 'status-progress' : 'status-new'}`}
                                style={a.isActiveBreach ? { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' } : {}}
                              >
                                {a.isActiveBreach ? 'OVERDUE FIRING' : a.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px 18px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                              {formatDate(a.createdDate)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* DUAL PANELS: TOP RECURRING ALERT SIGNATURES & SUBSYSTEM BREAKDOWN */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                gap: 20,
              }}
            >
              {/* TOP FIRED ALERT SIGNATURES */}
              <section className="data-panel">
                <div className="data-panel-heading">
                  <div className="provider-symbol" style={{ background: 'var(--yellow-surface)', color: 'var(--yellow)' }}>
                    <Zap />
                  </div>
                  <div>
                    <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                      AUTOMATED PATTERNS
                    </span>
                    <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, margin: '2px 0 0' }}>
                      Top Recurring Alert Signatures
                    </h2>
                  </div>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  {alertsData.topFiredAlertSignatures.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      No automated alert signatures recorded.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {alertsData.topFiredAlertSignatures.map((sig, idx) => (
                        <div
                          key={sig.signature}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: 6,
                            background: 'var(--secondary)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '65%' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)' }}>
                              #{idx + 1}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                color: 'var(--foreground)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={sig.signature}
                            >
                              {sig.signature}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {(sig.breachedCount || 0) > 0 && (
                              <span
                                style={{
                                  fontSize: 8.5,
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: 3,
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                }}
                              >
                                {sig.breachedCount} breached
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: 9.5,
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'var(--blue-surface)',
                                color: 'var(--blue)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {sig.count} alerts
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* SUBSYSTEM BREAKDOWN FOR ALERTS */}
              <section className="data-panel">
                <div className="data-panel-heading">
                  <div className="provider-symbol" style={{ background: 'var(--blue-surface)', color: 'var(--blue)' }}>
                    <Layers />
                  </div>
                  <div>
                    <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                      INFRASTRUCTURE DISTRIBUTION
                    </span>
                    <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, margin: '2px 0 0' }}>
                      Alert Subsystem Breakdown
                    </h2>
                  </div>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  {(!alertsData.subsystemBreakdown || alertsData.subsystemBreakdown.length === 0) ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      No subsystem data available.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {alertsData.subsystemBreakdown.map(sub => (
                        <div key={sub.subsystem}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span style={{ fontWeight: 500, color: 'var(--foreground)' }}>{sub.subsystem}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)' }}>
                              {sub.count} ({sub.pct}%)
                            </span>
                          </div>
                          <div style={{ height: 6, background: 'var(--secondary)', borderRadius: 3, overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${sub.pct}%`,
                                height: '100%',
                                background:
                                  sub.subsystem === 'Robotics & Hardware'
                                    ? '#ef4444'
                                    : sub.subsystem === 'Software & Database'
                                    ? 'var(--blue)'
                                    : sub.subsystem === 'Network & Connectivity'
                                    ? 'var(--soft-orange)'
                                    : 'var(--muted-foreground)',
                                borderRadius: 3,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* STABLE SITES WITH ZERO ALERTS */}
            <section className="data-panel">
              <div className="data-panel-heading">
                <div className="provider-symbol" style={{ background: 'var(--green-surface)', color: 'var(--success)' }}>
                  <CheckCircle2 />
                </div>
                <div>
                  <span className="eyebrow" style={{ fontFamily: 'var(--font-mono)' }}>
                    QUIET TELEMETRY FACILITIES
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, margin: '2px 0 0' }}>
                    Stable Sites with Zero Alerts ({alertsData.stableSites.length})
                  </h2>
                </div>

                {alertsData.stableSites.length > 12 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllStableAlertSites(!showAllStableAlertSites)}
                    style={{ marginLeft: 'auto', fontSize: 11, height: 28, fontFamily: 'var(--font-mono)' }}
                  >
                    {showAllStableAlertSites ? (
                      <>
                        COLLAPSE <ChevronUp style={{ width: 12, height: 12, marginLeft: 4 }} />
                      </>
                    ) : (
                      <>
                        VIEW ALL ({alertsData.stableSites.length}) <ChevronDown style={{ width: 12, height: 12, marginLeft: 4 }} />
                      </>
                    )}
                  </Button>
                )}
              </div>

              <div style={{ padding: '18px 22px' }}>
                {alertsData.stableSites.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    Every monitored site triggered at least one automated alert during this timeframe.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      maxHeight: showAllStableAlertSites ? 'none' : 110,
                      overflow: 'hidden',
                    }}
                  >
                    {alertsData.stableSites.map(s => (
                      <span
                        key={s.siteName}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 11px',
                          borderRadius: 5,
                          background: 'var(--green-surface)',
                          color: 'var(--success)',
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 500,
                          border: '1px solid rgba(34, 197, 94, 0.2)',
                        }}
                      >
                        <ShieldCheck style={{ width: 12, height: 12 }} />
                        {s.siteName}
                        {s.productLine && (
                          <span style={{ fontSize: 9, opacity: 0.75 }}>({s.productLine})</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
