import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  AlertOctagon, 
  Info, 
  CheckCircle2, 
  Bell, 
  BellOff, 
  Search, 
  Filter, 
  ExternalLink, 
  MessageSquare, 
  Check, 
  Database, 
  ChevronDown, 
  ChevronUp, 
  Cpu, 
  Radio, 
  Clock, 
  RotateCcw,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { SiteAlert } from '../../types/sites';

export const AlertPoolView: React.FC = () => {
  const { 
    currentSiteObj, 
    siteIntelligence, 
    siteAlerts, 
    activeAlertCount, 
    acknowledgeAlert, 
    resolveAlert, 
    silenceAlert, 
    openSiteSlack 
  } = useDashboard();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedSubsystem, setSelectedSubsystem] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Subsystems available across alerts
  const subsystems = useMemo(() => {
    const set = new Set<string>();
    siteAlerts.forEach(a => set.add(a.subsystem));
    return Array.from(set);
  }, [siteAlerts]);

  // Filtered alert list
  const filteredAlerts = useMemo(() => {
    return siteAlerts.filter(a => {
      if (selectedSeverity !== 'ALL' && a.severity !== selectedSeverity) return false;
      if (selectedSubsystem !== 'ALL' && a.subsystem !== selectedSubsystem) return false;
      if (selectedStatus !== 'ALL' && a.status !== selectedStatus) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
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
  }, [siteAlerts, selectedSeverity, selectedSubsystem, selectedStatus, searchTerm]);

  // Counts for KPI cards
  const counts = useMemo(() => {
    const critical = siteAlerts.filter(a => a.severity === 'CRITICAL' && a.status === 'FIRING').length;
    const warning = siteAlerts.filter(a => a.severity === 'WARNING' && a.status === 'FIRING').length;
    const acknowledged = siteAlerts.filter(a => a.status === 'ACKNOWLEDGED').length;
    const resolved = siteAlerts.filter(a => a.status === 'RESOLVED').length;
    return { critical, warning, acknowledged, resolved };
  }, [siteAlerts]);

  const handleAcknowledgeAll = async () => {
    const firing = siteAlerts.filter(a => a.status === 'FIRING');
    for (const a of firing) {
      await acknowledgeAlert(a.id);
    }
    setFeedbackToast(`Acknowledged ${firing.length} firing alerts!`);
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handleShareToSlack = (alert: SiteAlert) => {
    openSiteSlack();
    setFeedbackToast(`Opening ${siteIntelligence?.slackChannelName || 'Slack'} for #${alert.alertKey}`);
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-[0_0_8px_rgba(239,68,68,0.2)]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
            CRITICAL
          </span>
        );
      case 'WARNING':
        return (
          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            WARNING
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-mono font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            INFO
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'FIRING':
        return (
          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-black flex items-center gap-1 animate-pulse">
            <AlertOctagon className="w-2.5 h-2.5" />
            FIRING
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <Check className="w-2.5 h-2.5" />
            ACKNOWLEDGED
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" />
            RESOLVED
          </span>
        );
      case 'SILENCED':
        return (
          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <BellOff className="w-2.5 h-2.5" />
            SILENCED
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 max-w-7xl mx-auto w-full font-mono select-none">
      
      {/* 1. Header Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#121722] border border-[#232A39] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-[#FF7A00]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#FF7A00]/15 text-[#FF7A00] border border-[#FF7A00]/30">
              ALERT POOL
            </span>
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
              <Database className="w-3 h-3" />
              MongoDB Atlas Synced
            </span>
            <span className="flex items-center gap-1 text-[11px] text-rose-400 bg-rose-950/40 border border-rose-800/40 px-2 py-0.5 rounded-full">
              <Radio className="w-3 h-3 animate-ping" />
              {activeAlertCount} Active Firing
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            {currentSiteObj?.name || "Sam's ATL"}
            <span className="text-sm text-gray-400 font-normal">({currentSiteObj?.code || 'SAM-ATL'}) Alert Matrix</span>
          </h1>

          <p className="text-xs text-[#8893A8]">
            Aggregated real-time hardware alarms, Butler AGV telemetry faults, PLC sorter drops, and threshold triggers.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 z-10">
          <button
            onClick={openSiteSlack}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#11241C] hover:bg-[#163024] border border-emerald-500/50 text-emerald-400 hover:text-emerald-200 text-xs font-bold transition-all shadow group"
            title={`Open ${siteIntelligence?.slackChannelName || 'Slack Channel'}`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>{siteIntelligence?.slackChannelName || 'Open Slack'}</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </button>

          {activeAlertCount > 0 && (
            <button
              onClick={handleAcknowledgeAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF7A00] hover:bg-[#FF8F26] text-white text-xs font-bold transition-all shadow-[0_0_12px_rgba(255,122,0,0.3)] active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Acknowledge All ({activeAlertCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Toast Feedback */}
      {feedbackToast && (
        <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{feedbackToast}</span>
          </div>
        </div>
      )}

      {/* 2. Top Metric KPI Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Critical Card */}
        <div 
          onClick={() => setSelectedSeverity(selectedSeverity === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer bg-[#141824] ${
            selectedSeverity === 'CRITICAL' ? 'border-red-500 ring-1 ring-red-500' : 'border-[#232A39] hover:border-red-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>CRITICAL (SEV1)</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-black text-red-400 mt-1 flex items-center gap-2">
            {counts.critical}
            {counts.critical > 0 && <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">Requires immediate NOC intervention</div>
        </div>

        {/* Warning Card */}
        <div 
          onClick={() => setSelectedSeverity(selectedSeverity === 'WARNING' ? 'ALL' : 'WARNING')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer bg-[#141824] ${
            selectedSeverity === 'WARNING' ? 'border-amber-500 ring-1 ring-amber-500' : 'border-[#232A39] hover:border-amber-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>WARNING (SEV2)</span>
            <AlertOctagon className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1">
            {counts.warning}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">Subsystem threshold degraded</div>
        </div>

        {/* Acknowledged Card */}
        <div 
          onClick={() => setSelectedStatus(selectedStatus === 'ACKNOWLEDGED' ? 'ALL' : 'ACKNOWLEDGED')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer bg-[#141824] ${
            selectedStatus === 'ACKNOWLEDGED' ? 'border-blue-500 ring-1 ring-blue-500' : 'border-[#232A39] hover:border-blue-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>ACKNOWLEDGED</span>
            <Check className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-blue-400 mt-1">
            {counts.acknowledged}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">Under engineering investigation</div>
        </div>

        {/* Resolved Card */}
        <div 
          onClick={() => setSelectedStatus(selectedStatus === 'RESOLVED' ? 'ALL' : 'RESOLVED')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer bg-[#141824] ${
            selectedStatus === 'RESOLVED' ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-[#232A39] hover:border-emerald-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>RESOLVED</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {counts.resolved}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">Auto-cleared in last 24 hours</div>
        </div>
      </div>

      {/* 3. Search & Multi-Filter Control Bar */}
      <div className="p-3 rounded-xl bg-[#121722] border border-[#232A39] flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search alert ID, component, bot, PLC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#161C28] border border-[#2B3548] text-xs text-white pl-8 pr-3 py-1.5 rounded-lg focus:border-[#FF7A00] focus:outline-none w-full"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Severity Filter */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="bg-[#161C28] border border-[#2B3548] text-gray-300 px-2.5 py-1.5 rounded-lg focus:border-[#FF7A00] focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">🔴 Critical</option>
            <option value="WARNING">🟡 Warning</option>
            <option value="INFO">🔵 Info</option>
          </select>

          {/* Subsystem Filter */}
          <select
            value={selectedSubsystem}
            onChange={(e) => setSelectedSubsystem(e.target.value)}
            className="bg-[#161C28] border border-[#2B3548] text-gray-300 px-2.5 py-1.5 rounded-lg focus:border-[#FF7A00] focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Subsystems</option>
            {subsystems.map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-[#161C28] border border-[#2B3548] text-gray-300 px-2.5 py-1.5 rounded-lg focus:border-[#FF7A00] focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="FIRING">🔥 Firing</option>
            <option value="ACKNOWLEDGED">✓ Acknowledged</option>
            <option value="RESOLVED">✔ Resolved</option>
            <option value="SILENCED">🔕 Silenced</option>
          </select>
        </div>
      </div>

      {/* 4. Alert Pool Stream Table */}
      <div className="rounded-xl border border-[#232A39] overflow-hidden bg-[#10141D] shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#151B27] text-gray-400 uppercase text-[10px] tracking-wider border-b border-[#232A39]">
              <tr>
                <th className="py-2.5 px-3">Alert ID</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Subsystem / Node</th>
                <th className="py-2.5 px-3">Diagnosis Summary</th>
                <th className="py-2.5 px-3">Telemetry Metric</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D2536] text-gray-300">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    <ShieldAlert className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-50" />
                    No alerts matching the selected filters. All telemetry streams are nominal!
                  </td>
                </tr>
              ) : (
                filteredAlerts.map(alert => {
                  const isExpanded = expandedAlertId === alert.id;

                  return (
                    <React.Fragment key={alert.id}>
                      <tr 
                        onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                        className={`hover:bg-[#161D2B] transition-colors cursor-pointer group ${
                          isExpanded ? 'bg-[#182130]' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-bold text-[#FF7A00] whitespace-nowrap group-hover:underline">
                          {alert.alertKey}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {getSeverityBadge(alert.severity)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-[#182232] text-gray-200 border border-[#2B3548] font-bold text-[10px]">
                              {alert.subsystem}
                            </span>
                            <span className="text-gray-400 text-[11px]">{alert.sourceComponent}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-white max-w-sm font-medium">
                          <div className="truncate">{alert.title}</div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <code className="px-2 py-0.5 rounded bg-[#131924] text-amber-300 border border-[#263348] text-[10.5px]">
                            {alert.value}
                          </code>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {getStatusBadge(alert.status)}
                        </td>
                        <td className="py-2.5 px-3 text-gray-400 text-[11px] whitespace-nowrap">
                          {alert.timestamp}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {alert.status === 'FIRING' && (
                              <button
                                onClick={() => acknowledgeAlert(alert.id)}
                                className="px-2 py-1 rounded bg-[#192231] hover:bg-[#253247] text-blue-400 hover:text-white border border-blue-500/30 text-[10px] font-bold transition-all"
                                title="Acknowledge Alert"
                              >
                                Ack
                              </button>
                            )}
                            {alert.status !== 'RESOLVED' && (
                              <button
                                onClick={() => resolveAlert(alert.id)}
                                className="px-2 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold transition-all"
                                title="Mark as Resolved"
                              >
                                Resolve
                              </button>
                            )}
                            <button
                              onClick={() => handleShareToSlack(alert)}
                              className="p-1 rounded bg-[#12241D] hover:bg-[#1A3329] text-emerald-400 border border-emerald-500/30"
                              title="Escalate to Slack channel"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                              className="p-1 rounded text-gray-400 hover:text-white"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[#FF7A00]" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Diagnostic Runbook Drawer */}
                      {isExpanded && (
                        <tr className="bg-[#131824] border-b border-[#232A39]">
                          <td colSpan={8} className="p-3">
                            <div className="bg-[#182030] rounded-xl p-3.5 border border-[#28354A] space-y-2.5">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <ShieldAlert className="w-4 h-4 text-[#FF7A00]" />
                                  <span className="font-bold text-white">{alert.alertKey} Root Cause Analysis</span>
                                </div>
                                <span className="text-gray-400">
                                  Source: <strong className="text-white">{alert.sourceComponent}</strong> ({alert.subsystem})
                                </span>
                              </div>

                              <p className="text-xs text-gray-300 leading-relaxed bg-[#10141D] p-3 rounded-lg border border-[#212B3B]">
                                {alert.description}
                              </p>

                              <div className="flex items-center justify-between pt-2 border-t border-[#232A39] text-xs">
                                <div className="flex items-center gap-3 text-gray-400 text-[11px]">
                                  {alert.acknowledgedBy && (
                                    <span>Triage Lead: <strong className="text-white">{alert.acknowledgedBy}</strong></span>
                                  )}
                                  <span>Auto-Throttle: <strong className="text-emerald-400">Enabled</strong></span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {alert.status === 'FIRING' && (
                                    <button
                                      onClick={() => silenceAlert(alert.id)}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#202738] hover:bg-[#2A344A] text-purple-300 text-xs font-bold border border-purple-500/30"
                                    >
                                      <BellOff className="w-3 h-3" />
                                      <span>Silence (1hr)</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleShareToSlack(alert)}
                                    className="flex items-center gap-1 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                    <span>Post to {siteIntelligence?.slackChannelName || 'Slack'}</span>
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
      </div>

    </div>
  );
};
