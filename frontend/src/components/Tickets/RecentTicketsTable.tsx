import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  MapPin, 
  Activity,
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle2,
  MessageSquare,
  Check,
  RotateCcw,
  ShieldAlert
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { ActiveDashboardViewer } from '../Grafana/ActiveDashboardViewer';
import { SiteAlert } from '../../types/sites';

interface IncidentRecord {
  id: string;
  ticketKey: string;
  summary: string;
  severity: 'SEV1' | 'SEV2' | 'SEV3';
  severityLabel: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  service: string;
  assignee: string;
  assigneeRole: string;
  timestamp: string;
  date: string;
  siteId: string;
  siteName: string;
  description: string;
}

export const RecentTicketsTable: React.FC = () => {
  const { 
    currentSiteObj, 
    selectedDate, 
    selectedService,
    siteAlerts,
    activeAlertCount,
    acknowledgeAlert,
    resolveAlert,
    openSiteSlack,
    siteIntelligence
  } = useDashboard();

  const [activeTab, setActiveTab] = useState<'tickets' | 'alerts' | 'telemetry'>('tickets');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  // Alert-specific states
  const [alertSearchTerm, setAlertSearchTerm] = useState<string>('');
  const [alertSeverityFilter, setAlertSeverityFilter] = useState<string>('ALL');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [alertFeedbackToast, setAlertFeedbackToast] = useState<string | null>(null);

  // Deterministic mock incident generation for current site and date
  const incidents: IncidentRecord[] = useMemo(() => {
    const site = currentSiteObj || { id: 'rtp_sams_atl', name: "Sam's ATL", code: 'SAM-ATL' };
    const date = selectedDate || '2026-09-04';
    const siteCode = site.code || 'SAM-ATL';

    const baseRecords: IncidentRecord[] = [
      {
        id: `${site.id}-1`,
        ticketKey: `INC-${siteCode}-3001`,
        summary: `${site.name} — Barcode Optical Scanner Reader Lens Degradation`,
        severity: 'SEV1',
        severityLabel: 'CRITICAL',
        status: 'OPEN',
        service: 'Platform',
        assignee: 'Marcus Vance',
        assigneeRole: 'Senior L3 Site Reliability Engineer',
        timestamp: '08:14 AM',
        date,
        siteId: site.id,
        siteName: site.name,
        description: 'Optical scanner head #4 reported high drop in read accuracy on tray induct conveyor. Cleaning cycle triggered, firmware telemetry reporting camera sensor saturation.'
      },
      {
        id: `${site.id}-2`,
        ticketKey: `INC-${siteCode}-3002`,
        summary: `${site.name} — AGV Butler Fleet Collision Avoidance Micro-Stall`,
        severity: 'SEV2',
        severityLabel: 'MAJOR',
        status: 'IN_PROGRESS',
        service: 'Butler',
        assignee: 'Sarah Chen',
        assigneeRole: 'Robotics Fleet Operations Lead',
        timestamp: '09:22 AM',
        date,
        siteId: site.id,
        siteName: site.name,
        description: 'Two Butler units encountered path reservation deadlock at Grid Intersection D-14. Auto-clearing algorithm triggered with 8s latency spike.'
      },
      {
        id: `${site.id}-3`,
        ticketKey: `INC-${siteCode}-3003`,
        summary: `${site.name} — Hardware Bridge CAN-Bus Packet Jitter`,
        severity: 'SEV3',
        severityLabel: 'MINOR',
        status: 'RESOLVED',
        service: 'Bridge',
        assignee: 'Elena Rostova',
        assigneeRole: 'Hardware Diagnostics Specialist',
        timestamp: '10:05 AM',
        date,
        siteId: site.id,
        siteName: site.name,
        description: 'Transient packet jitter observed on PLC gateway node 2. Re-routed traffic to secondary optical transceiver; error rate returned to 0.'
      },
      {
        id: `${site.id}-4`,
        ticketKey: `INC-${siteCode}-3004`,
        summary: `${site.name} — Elasticsearch Log Ingestion Buffer Flush Warning`,
        severity: 'SEV2',
        severityLabel: 'MAJOR',
        status: 'OPEN',
        service: 'Elastic',
        assignee: 'Devon Miller',
        assigneeRole: 'Infrastructure Systems Engineer',
        timestamp: '11:30 AM',
        date,
        siteId: site.id,
        siteName: site.name,
        description: 'Log ingestion queue reached 78% water-mark due to surge in barcode diagnostic trace payloads. Dynamic scale-up of collector workers initiated.'
      },
      {
        id: `${site.id}-5`,
        ticketKey: `INC-${siteCode}-3005`,
        summary: `${site.name} — InfluxDB Time-Series Ingestion Stream Intermittent Delay`,
        severity: 'SEV3',
        severityLabel: 'MINOR',
        status: 'CLOSED',
        service: 'Influx',
        assignee: 'Priya Patel',
        assigneeRole: 'Database Reliability Engineer',
        timestamp: '01:45 PM',
        date,
        siteId: site.id,
        siteName: site.name,
        description: 'Sensor data batch write experienced 12ms latency during partition snapshot. Write buffers absorbed telemetry without data loss.'
      },
      {
        id: `${site.id}-6`,
        ticketKey: `INC-${siteCode}-3006`,
        summary: `${site.name} — Core GreyMatter Transaction Rate Drop on Station 12`,
        severity: 'SEV1',
        severityLabel: 'CRITICAL',
        status: 'IN_PROGRESS',
        service: 'Platform',
        assignee: 'Alex Thorne',
        assigneeRole: 'Platform Performance Specialist',
        timestamp: '02:18 PM',
        date,
        siteId: site.id,
        siteName: site.name,
        description: 'Station 12 reported 4 consecutive timeout responses during pallet verification handshake. Failover node warm-started.'
      }
    ];

    return baseRecords;
  }, [currentSiteObj, selectedDate]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter(t => {
      if (selectedService && t.service.toLowerCase() !== selectedService.toLowerCase()) {
        return false;
      }
      if (filterSeverity !== 'ALL') {
        if (filterSeverity === 'RED' && t.severity !== 'SEV1') return false;
        if (filterSeverity === 'AMBER' && t.severity !== 'SEV2') return false;
        if (filterSeverity === 'BLUE' && t.severity !== 'SEV3') return false;
      }
      if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return t.ticketKey.toLowerCase().includes(q) || 
               t.summary.toLowerCase().includes(q) || 
               t.service.toLowerCase().includes(q) ||
               t.assignee.toLowerCase().includes(q);
      }
      return true;
    });
  }, [incidents, selectedService, filterSeverity, filterStatus, searchTerm]);

  // Filtered Site Alerts for inline tab
  const filteredSiteAlerts = useMemo(() => {
    return siteAlerts.filter(a => {
      if (alertSeverityFilter !== 'ALL' && a.severity !== alertSeverityFilter) return false;
      if (alertSearchTerm.trim()) {
        const q = alertSearchTerm.toLowerCase();
        return (
          a.alertKey.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q) ||
          a.subsystem.toLowerCase().includes(q) ||
          a.sourceComponent.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [siteAlerts, alertSeverityFilter, alertSearchTerm]);

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'SEV1':
      case 'CRITICAL':
        return (
          <span className="px-1.5 py-0.2 rounded bg-red-500/15 text-red-400 border border-red-500/30 text-[9.5px] font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
            CRITICAL
          </span>
        );
      case 'SEV2':
      case 'WARNING':
        return (
          <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[9.5px] font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            WARNING
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[9.5px] font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            INFO
          </span>
        );
    }
  };

  const getStatusPill = (status: string) => {
    switch (status) {
      case 'OPEN':
      case 'FIRING':
        return <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold">Firing</span>;
      case 'IN_PROGRESS':
      case 'ACKNOWLEDGED':
        return <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">Ack'd</span>;
      case 'RESOLVED':
        return <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">Resolved</span>;
      case 'CLOSED':
        return <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-gray-500/15 text-gray-400 border border-gray-500/30 font-bold">Closed</span>;
      default:
        return <span>{status}</span>;
    }
  };

  const handleAcknowledgeAlert = async (alertId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await acknowledgeAlert(alertId);
    setAlertFeedbackToast('Alert acknowledged');
    setTimeout(() => setAlertFeedbackToast(null), 2500);
  };

  const handleResolveAlert = async (alertId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await resolveAlert(alertId);
    setAlertFeedbackToast('Alert marked as resolved');
    setTimeout(() => setAlertFeedbackToast(null), 2500);
  };

  return (
    <div className="surface-card rounded-xl p-1.5 sm:p-2 shadow-lg overflow-hidden h-full min-h-0 flex flex-col border border-[#232A39] font-mono">
      
      {/* Header & Controls Bar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between pb-1 border-b border-[#232A39] gap-1.5">
        
        {/* Title + Active context badge + Mode switcher */}
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-xs uppercase tracking-wider text-white flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#FF7A00]" />
            Incident Details
          </span>

          <span className="text-[9.5px] px-1.5 py-0.2 rounded-md bg-[#151A24] text-[#8C98AE] border border-[#273246]">
            {activeTab === 'alerts' 
              ? `${filteredSiteAlerts.length} alerts` 
              : `${filteredIncidents.length} active`}
          </span>

          <span className="text-[9.5px] px-1.5 py-0.2 rounded-md bg-[#FF7A00]/15 text-[#FF7A00] border border-[#FF7A00]/30 font-bold flex items-center gap-1 truncate max-w-[130px]">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{currentSiteObj?.name || "Sam's ATL"}</span>
          </span>

          {selectedService && (
            <span className="text-[9.5px] px-1.5 py-0.2 rounded-md bg-[#3B82F6]/15 text-[#3B82F6] border border-[#3B82F6]/30 font-bold">
              {selectedService.toUpperCase()}
            </span>
          )}

          {/* Toggle between Cases, Alert Pool, & Live Telemetry Panel */}
          <div className="hidden sm:flex items-center bg-[#121620] rounded-md border border-[#232A39] p-0.5 text-[9.5px]">
            <button
              onClick={() => setActiveTab('tickets')}
              className={`px-2 py-0.5 rounded font-bold transition-all ${
                activeTab === 'tickets' ? 'bg-[#FF7A00] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Cases
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-2 py-0.5 rounded font-bold transition-all flex items-center gap-1 ${
                activeTab === 'alerts' 
                  ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.4)]' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              <span>Alert Pool</span>
              {activeAlertCount > 0 && (
                <span className={`px-1 py-0.1 rounded text-[8.5px] font-extrabold ${
                  activeTab === 'alerts' ? 'bg-black/30 text-white' : 'bg-red-500/20 text-red-400 border border-red-500/40'
                }`}>
                  {activeAlertCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`px-2 py-0.5 rounded font-bold transition-all flex items-center gap-1 ${
                activeTab === 'telemetry' ? 'bg-[#FF7A00] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Activity className="w-2.5 h-2.5" />
              <span>Telemetry</span>
            </button>
          </div>
        </div>

        {/* Feedback Toast if present */}
        {alertFeedbackToast && (
          <div className="text-[10px] text-emerald-400 bg-emerald-950/70 border border-emerald-800/60 px-2 py-0.5 rounded animate-fade-in flex items-center gap-1">
            <Check className="w-3 h-3 text-emerald-400" />
            <span>{alertFeedbackToast}</span>
          </div>
        )}

        {/* Filters & Search (Visible on Tickets tab) */}
        {activeTab === 'tickets' && (
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="w-3 h-3 text-[#657187] absolute left-2 top-1.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search cases..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-[#121620] text-gray-200 text-[11px] pl-6 pr-2 py-0.5 rounded-md border border-[#262F41] focus:outline-none focus:border-[#FF7A00] w-28 sm:w-36 placeholder-[#545E73]"
              />
            </div>

            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="bg-[#121620] text-gray-300 text-[11px] px-2 py-0.5 rounded-md border border-[#262F41] focus:outline-none focus:border-[#FF7A00] cursor-pointer"
            >
              <option value="ALL">All Severities</option>
              <option value="RED">🔴 Red</option>
              <option value="AMBER">🟡 Amber</option>
              <option value="BLUE">🔵 Blue</option>
            </select>
          </div>
        )}

        {/* Filters & Search (Visible on Alert Pool tab) */}
        {activeTab === 'alerts' && (
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="w-3 h-3 text-[#657187] absolute left-2 top-1.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search site alerts..."
                value={alertSearchTerm}
                onChange={(e) => setAlertSearchTerm(e.target.value)}
                className="bg-[#121620] text-gray-200 text-[11px] pl-6 pr-2 py-0.5 rounded-md border border-[#262F41] focus:outline-none focus:border-red-500 w-28 sm:w-36 placeholder-[#545E73]"
              />
            </div>

            <select
              value={alertSeverityFilter}
              onChange={(e) => setAlertSeverityFilter(e.target.value)}
              className="bg-[#121620] text-gray-300 text-[11px] px-2 py-0.5 rounded-md border border-[#262F41] focus:outline-none focus:border-red-500 cursor-pointer"
            >
              <option value="ALL">All Levels</option>
              <option value="CRITICAL">🔴 Critical</option>
              <option value="WARNING">🟡 Warning</option>
              <option value="INFO">🔵 Info</option>
            </select>

            <button
              onClick={openSiteSlack}
              className="px-2 py-0.5 rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 text-[10px] font-bold flex items-center gap-1 transition-all"
              title={`Open ${siteIntelligence?.slackChannelName || 'Slack'} to discuss`}
            >
              <MessageSquare className="w-2.5 h-2.5" />
              <span className="hidden md:inline">Site Slack</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content: Tickets Table OR Alert Pool OR Active Telemetry */}
      {activeTab === 'telemetry' ? (
        <div className="flex-1 min-h-0 pt-1">
          <ActiveDashboardViewer />
        </div>
      ) : activeTab === 'alerts' ? (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto relative mt-0.5">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#121620] z-10 border-b border-[#1E2534] shadow-xs">
              <tr className="text-[#657187] text-[9.5px] uppercase">
                <th className="py-1 px-2 font-semibold">Alert ID</th>
                <th className="py-1 px-2 font-semibold">Severity</th>
                <th className="py-1 px-2 font-semibold">Alert Title & Root Cause</th>
                <th className="py-1 px-2 font-semibold">Subsystem</th>
                <th className="py-1 px-2 font-semibold">Trigger Metric</th>
                <th className="py-1 px-2 font-semibold">Status</th>
                <th className="py-1 px-2 font-semibold">Time</th>
                <th className="py-1 px-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1B2230]/70 text-gray-300">
              {filteredSiteAlerts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-[#6A768D] text-xs">
                    No active or historical alerts matching criteria for this facility.
                  </td>
                </tr>
              ) : (
                filteredSiteAlerts.map((alert) => {
                  const isExpanded = expandedAlertId === alert.id;

                  return (
                    <React.Fragment key={alert.id}>
                      <tr 
                        onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                        className={`hover:bg-[#1A212E]/70 transition-colors cursor-pointer group ${
                          isExpanded ? 'bg-[#18202D]' : ''
                        }`}
                      >
                        <td className="py-1.5 px-2 font-bold text-rose-400 group-hover:underline text-[11px] whitespace-nowrap">
                          {alert.alertKey}
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          {getSeverityBadge(alert.severity)}
                        </td>
                        <td className="py-1.5 px-2 text-white max-w-sm font-medium text-[11px]">
                          <div className="truncate font-semibold">{alert.title}</div>
                          <div className="text-[10px] text-gray-400 truncate">{alert.description}</div>
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          <span className="px-1.5 py-0.2 rounded bg-[#18202D] text-gray-200 border border-[#2B3548] font-bold text-[9.5px]">
                            {alert.subsystem}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-[10.5px] text-amber-300 font-mono whitespace-nowrap">
                          {alert.metricValue ? (
                            <span>{alert.metricValue} <span className="text-[#657187]">/ {alert.threshold || 'LIMIT'}</span></span>
                          ) : alert.value ? (
                            <span>{alert.value}</span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          {getStatusPill(alert.status)}
                        </td>
                        <td className="py-1.5 px-2 text-[#7B869D] text-[10.5px] whitespace-nowrap">
                          {alert.timestamp}
                        </td>
                        <td className="py-1.5 px-2 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {alert.status === 'FIRING' && (
                              <button 
                                onClick={(e) => handleAcknowledgeAlert(alert.id, e)}
                                title="Acknowledge Alert"
                                className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 text-[9.5px] font-bold flex items-center gap-0.5"
                              >
                                <Check className="w-2.5 h-2.5" />
                                <span>Ack</span>
                              </button>
                            )}
                            {alert.status !== 'RESOLVED' && (
                              <button 
                                onClick={(e) => handleResolveAlert(alert.id, e)}
                                title="Resolve Alert"
                                className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/40 text-[9.5px] font-bold flex items-center gap-0.5"
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>Fix</span>
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                              className="p-1 rounded text-[#7B869D] hover:text-white"
                            >
                              {isExpanded ? <ChevronUp className="w-3 h-3 text-[#FF7A00]" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Alert Diagnostics Drawer */}
                      {isExpanded && (
                        <tr className="bg-[#121620]/95 border-b border-[#232A39]">
                          <td colSpan={8} className="p-2.5">
                            <div className="bg-[#171D27] rounded-lg p-3 border border-[#283245] space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-red-400 flex items-center gap-1.5">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  <span>{alert.alertKey} — Telemetry Diagnostics</span>
                                </span>
                                <span className="text-[#78849B]">
                                  Component: <strong className="text-white">{alert.sourceComponent}</strong> ({alert.subsystem})
                                </span>
                              </div>

                              <p className="text-xs text-gray-300 leading-relaxed bg-[#10141C] p-2.5 rounded border border-[#212836]">
                                {alert.description}
                              </p>

                              {(alert.remediation || alert.runbookUrl) && (
                                <div className="p-2 rounded bg-amber-950/20 border border-amber-900/40 text-[11px] text-amber-200/90 flex items-center justify-between">
                                  <div>
                                    <strong className="text-amber-400 font-bold">Recommended Runbook: </strong>
                                    <span>{alert.remediation || 'Inspect physical sensor contact and clear path queue.'}</span>
                                  </div>
                                  {alert.runbookUrl && (
                                    <a
                                      href={alert.runbookUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[10px] text-[#FF7A00] hover:underline flex items-center gap-1 shrink-0 ml-2 font-bold"
                                    >
                                      <span>Runbook Doc</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#232A39]">
                                <div className="flex items-center gap-3 text-[#78849B]">
                                  <span>Value: <strong className="text-amber-300 font-mono">{alert.value || alert.metricValue || 'N/A'}</strong></span>
                                  {alert.threshold && <span>Threshold: <strong className="text-rose-400 font-mono">{alert.threshold}</strong></span>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {alert.status === 'FIRING' && (
                                    <button
                                      onClick={() => handleAcknowledgeAlert(alert.id)}
                                      className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Acknowledge</span>
                                    </button>
                                  )}
                                  {alert.status !== 'RESOLVED' && (
                                    <button
                                      onClick={() => handleResolveAlert(alert.id)}
                                      className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Mark Resolved</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={openSiteSlack}
                                    className="px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 font-bold flex items-center gap-1"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                    <span>Discuss in {siteIntelligence?.slackChannelName || 'Slack'}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto relative mt-0.5">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#121620] z-10 border-b border-[#1E2534] shadow-xs">
              <tr className="text-[#657187] text-[9.5px] uppercase">
                <th className="py-1 px-2 font-semibold">Case ID</th>
                <th className="py-1 px-2 font-semibold">Incident Summary</th>
                <th className="py-1 px-2 font-semibold">Severity</th>
                <th className="py-1 px-2 font-semibold">Service</th>
                <th className="py-1 px-2 font-semibold">Status</th>
                <th className="py-1 px-2 font-semibold">Assignee</th>
                <th className="py-1 px-2 font-semibold">Time</th>
                <th className="py-1 px-2 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1B2230]/70 text-gray-300">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-[#6A768D] text-xs">
                    No incident records matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((t) => {
                  const isExpanded = expandedTicketId === t.id;

                  return (
                    <React.Fragment key={t.id}>
                      <tr 
                        onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                        className={`hover:bg-[#1A212E]/70 transition-colors cursor-pointer group ${
                          isExpanded ? 'bg-[#18202D]' : ''
                        }`}
                      >
                        <td className="py-1.5 px-2 font-bold text-[#FF7A00] group-hover:underline text-[11px] whitespace-nowrap">
                          {t.ticketKey}
                        </td>
                        <td className="py-1.5 px-2 text-white max-w-sm font-medium text-[11px]">
                          <div className="truncate">{t.summary}</div>
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          {getSeverityBadge(t.severity)}
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          <span className="px-1.5 py-0.2 rounded bg-[#18202D] text-gray-200 border border-[#2B3548] font-bold text-[9.5px]">
                            {t.service}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          {getStatusPill(t.status)}
                        </td>
                        <td className="py-1.5 px-2 text-[11px] whitespace-nowrap">
                          <span className="truncate max-w-[110px] text-gray-200">{t.assignee}</span>
                        </td>
                        <td className="py-1.5 px-2 text-[#7B869D] text-[10.5px] whitespace-nowrap">
                          {t.timestamp}
                        </td>
                        <td className="py-1.5 px-2 text-right whitespace-nowrap">
                          <button className="p-0.5 rounded text-[#7B869D] group-hover:text-white">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[#FF7A00]" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Detail Drawer */}
                      {isExpanded && (
                        <tr className="bg-[#121620]/95 border-b border-[#232A39]">
                          <td colSpan={8} className="p-2.5">
                            <div className="bg-[#171D27] rounded-lg p-3 border border-[#283245] space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-[#FF7A00]">{t.ticketKey} Diagnostics</span>
                                <span className="text-[#78849B]">Assigned to: <strong className="text-white">{t.assignee}</strong> ({t.assigneeRole})</span>
                              </div>
                              <p className="text-xs text-gray-300 leading-relaxed bg-[#10141C] p-2.5 rounded border border-[#212836]">
                                {t.description}
                              </p>
                              <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#232A39]">
                                <span className="text-[#78849B]">Target MTTR: <strong className="text-emerald-400">&lt; 45 mins</strong></span>
                                <button className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#FF7A00] hover:bg-[#FF8A1C] text-white font-bold">
                                  <span>Open in Salesforce Apex</span>
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};
