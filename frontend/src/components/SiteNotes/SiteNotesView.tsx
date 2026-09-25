import React, { useState, useEffect } from 'react';
import { 
  Server, 
  UserCheck, 
  GitBranch, 
  ExternalLink, 
  Copy, 
  Check, 
  Edit3, 
  Save, 
  X, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Database, 
  MessageSquare, 
  FileText, 
  ShieldCheck, 
  Cpu, 
  Clock, 
  MapPin, 
  Globe, 
  Radio, 
  AlertCircle,
  Search,
  Video
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { SiteVM, SiteDashboardLink } from '../../types/sites';

export const SiteNotesView: React.FC = () => {
  const { 
    currentSiteObj, 
    siteIntelligence, 
    isLoadingSiteData, 
    isSavingSiteData, 
    updateSiteIntelligence, 
    resetSiteIntelligence,
    openSiteSlack,
    openSiteWarRoom
  } = useDashboard();

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [formData, setFormData] = useState(siteIntelligence);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [vmSearch, setVmSearch] = useState<string>('');

  // Sync formData whenever siteIntelligence updates
  useEffect(() => {
    setFormData(siteIntelligence);
  }, [siteIntelligence]);

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const handleSave = async () => {
    setSaveStatus(null);
    try {
      const res = await updateSiteIntelligence(formData);
      setSaveStatus({ type: 'success', message: res.message || 'Saved to MongoDB Atlas!' });
      setIsEditing(false);
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message || 'Failed to save changes.' });
    }
  };

  const handleCancel = () => {
    setFormData(siteIntelligence);
    setIsEditing(false);
  };

  const handleResetDefaults = async () => {
    if (window.confirm(`Reset all intelligence and notes for ${currentSiteObj.name} to MongoDB defaults?`)) {
      await resetSiteIntelligence();
      setSaveStatus({ type: 'success', message: 'Reset to standard system defaults in MongoDB Atlas.' });
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // VM Management
  const handleAddVm = () => {
    const newVm: SiteVM = {
      id: `vm_${Date.now()}`,
      hostname: `${currentSiteObj.code.toLowerCase().replace(/[^a-z0-9]/g, '-')}-node-${formData.vmIps.length + 1}`,
      ip: `10.142.20.${10 + formData.vmIps.length + 1}`,
      role: 'Worker Compute Node',
      status: 'ONLINE',
      specs: 'Ubuntu 22.04 LTS (8 vCPU, 32GB RAM)'
    };
    setFormData(prev => ({ ...prev, vmIps: [...prev.vmIps, newVm] }));
  };

  const handleRemoveVm = (index: number) => {
    setFormData(prev => ({
      ...prev,
      vmIps: prev.vmIps.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateVm = (index: number, field: keyof SiteVM, value: any) => {
    setFormData(prev => {
      const copy = [...prev.vmIps];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, vmIps: copy };
    });
  };

  // Dashboard Link Management
  const handleAddDashboard = () => {
    const newDash: SiteDashboardLink = {
      id: `dash_${Date.now()}`,
      title: 'New Operational Dashboard',
      url: 'https://cloudwatch.greymatter.greyorange.com',
      category: 'General',
      description: 'Custom monitoring view configured for this facility.'
    };
    setFormData(prev => ({ ...prev, dashboardLinks: [...prev.dashboardLinks, newDash] }));
  };

  const handleRemoveDashboard = (index: number) => {
    setFormData(prev => ({
      ...prev,
      dashboardLinks: prev.dashboardLinks.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateDashboard = (index: number, field: keyof SiteDashboardLink, value: any) => {
    setFormData(prev => {
      const copy = [...prev.dashboardLinks];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, dashboardLinks: copy };
    });
  };

  const filteredVms = (formData.vmIps || []).filter(vm => {
    if (!vmSearch) return true;
    const q = vmSearch.toLowerCase();
    return (
      vm.hostname.toLowerCase().includes(q) ||
      vm.ip.toLowerCase().includes(q) ||
      vm.role.toLowerCase().includes(q) ||
      vm.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-w-7xl mx-auto w-full">
      
      {/* Top Header Card */}
      <div className="p-5 rounded-2xl bg-[#121722] border border-[#232A39] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-[#FF7A00]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#FF7A00]/15 text-[#FF7A00] border border-[#FF7A00]/30">
              {currentSiteObj.categoryLabel || currentSiteObj.category}
            </span>
            <span className="text-xs font-mono text-gray-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#FF7A00]" />
              {currentSiteObj.region} • {currentSiteObj.timezone}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
              <Database className="w-3 h-3 text-emerald-400" />
              MongoDB Atlas Synced
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-mono font-extrabold text-white tracking-tight flex items-center gap-2">
            {currentSiteObj.name}
            <span className="text-sm font-mono text-gray-400 font-normal">({currentSiteObj.code})</span>
          </h1>

          <p className="text-xs font-mono text-[#8893A8]">
            Full infrastructure metadata, VM network matrix, engineering ownership, and operational runbook.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 z-10">
          {/* Direct Slack Channel Button */}
          <button
            onClick={openSiteSlack}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#11241C] hover:bg-[#163024] border border-emerald-500/50 text-emerald-400 hover:text-emerald-200 text-xs font-mono font-bold transition-all shadow-md group"
            title={`Open Slack channel: ${formData.slackChannelName}`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>{formData.slackChannelName || 'Open Slack'}</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </button>

          {/* Admin Edit Mode Toggle */}
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF7A00] hover:bg-[#FF8F26] text-white text-xs font-mono font-bold transition-all shadow-[0_0_15px_rgba(255,122,0,0.25)] active:scale-95"
            >
              <Edit3 className="w-4 h-4" />
              <span>Admin Edit Mode</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1A2230] hover:bg-[#232D3F] text-gray-300 text-xs font-mono font-semibold transition-all border border-[#2B3548]"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                onClick={handleSave}
                disabled={isSavingSiteData}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingSiteData ? 'Saving...' : 'Save to MongoDB'}</span>
              </button>
            </div>
          )}

          {/* Reset Defaults button */}
          <button
            onClick={handleResetDefaults}
            className="p-2 rounded-xl bg-[#161C26] hover:bg-[#1D2533] text-gray-400 hover:text-gray-200 border border-[#232A39] transition-all"
            title="Reset site info to defaults in MongoDB"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Save feedback banner */}
      {saveStatus && (
        <div className={`p-3.5 rounded-xl text-xs font-mono flex items-center justify-between border animate-in fade-in slide-in-from-top-2 ${
          saveStatus.type === 'success'
            ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
            : 'bg-red-950/60 border-red-500/50 text-red-300'
        }`}>
          <div className="flex items-center gap-2">
            {saveStatus.type === 'success' ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
            <span>{saveStatus.message}</span>
          </div>
          <button onClick={() => setSaveStatus(null)} className="text-gray-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Edit Mode Notice Bar */}
      {isEditing && (
        <div className="p-3 rounded-xl bg-[#FF7A00]/10 border border-[#FF7A00]/40 flex items-center justify-between text-xs font-mono text-[#FF7A00]">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 shrink-0" />
            <span>
              <strong>Admin Mode Active:</strong> Edit VM IPs, CEM contact, deployment records, dashboard links, or runbook notes below. Click "Save to MongoDB" to persist.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={isSavingSiteData}
              className="px-3 py-1 rounded bg-[#FF7A00] hover:bg-[#FF8F26] text-white font-bold transition-all shadow"
            >
              {isSavingSiteData ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </div>
      )}

      {/* GRID: Row 1 - CEM Info (Left) + Recent Deployment (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* CEM Information Card */}
        <div className="p-5 rounded-2xl bg-[#121722] border border-[#232A39] shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E2533]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#FF7A00]/15 text-[#FF7A00]">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-mono font-bold text-sm text-white">
                  Customer Escalation Manager (CEM)
                </h3>
                <p className="text-[11px] font-mono text-gray-400">
                  Direct operational lead and engineering escalation contact
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1C2330] text-gray-300 border border-[#263145]">
              Escalation Tier 1
            </span>
          </div>

          {!isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-[#161C28] border border-[#202838] space-y-1">
                <span className="text-[10px] font-mono uppercase text-gray-500 font-semibold">Lead Name</span>
                <div className="font-mono font-bold text-white text-sm">{formData.cem?.name || 'Unassigned'}</div>
              </div>

              <div className="p-3 rounded-xl bg-[#161C28] border border-[#202838] space-y-1">
                <span className="text-[10px] font-mono uppercase text-gray-500 font-semibold">Email Address</span>
                <a 
                  href={`mailto:${formData.cem?.email}`} 
                  className="font-mono text-xs text-[#FF7A00] hover:underline block truncate"
                >
                  {formData.cem?.email || 'support@greyorange.com'}
                </a>
              </div>

              <div className="p-3 rounded-xl bg-[#161C28] border border-[#202838] space-y-1">
                <span className="text-[10px] font-mono uppercase text-gray-500 font-semibold">Phone (24/7 On-Call)</span>
                <a 
                  href={`tel:${formData.cem?.phone}`} 
                  className="font-mono text-xs text-gray-200 hover:text-white block truncate"
                >
                  {formData.cem?.phone || '+1 (800) 555-0199'}
                </a>
              </div>

              <div className="p-3 rounded-xl bg-[#161C28] border border-[#202838] space-y-1">
                <span className="text-[10px] font-mono uppercase text-gray-500 font-semibold">Slack Handle</span>
                <div className="font-mono text-xs text-emerald-400 font-semibold truncate">
                  {formData.cem?.slack || '@ops-lead'}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-mono text-gray-400 block mb-1">CEM Name</label>
                <input
                  type="text"
                  value={formData.cem?.name || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, cem: { ...prev.cem, name: e.target.value } }))}
                  className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-[#FF7A00] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-gray-400 block mb-1">Email</label>
                <input
                  type="email"
                  value={formData.cem?.email || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, cem: { ...prev.cem, email: e.target.value } }))}
                  className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-[#FF7A00] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-gray-400 block mb-1">Phone</label>
                <input
                  type="text"
                  value={formData.cem?.phone || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, cem: { ...prev.cem, phone: e.target.value } }))}
                  className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-[#FF7A00] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-gray-400 block mb-1">Slack Handle</label>
                <input
                  type="text"
                  value={formData.cem?.slack || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, cem: { ...prev.cem, slack: e.target.value } }))}
                  className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-[#FF7A00] focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Recent Deployment Card */}
        <div className="p-5 rounded-2xl bg-[#121722] border border-[#232A39] shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E2533]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400">
                <GitBranch className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-mono font-bold text-sm text-white">
                  Recent Deployment Status
                </h3>
                <p className="text-[11px] font-mono text-gray-400">
                  Latest verified release, cluster commit, and change notes
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50 font-bold">
              {formData.recentDeployment?.version || 'v4.19.0'}
            </span>
          </div>

          {!isEditing ? (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-[#161C28] border border-[#202838]">
                  <span className="text-[10px] text-gray-500 block">Version</span>
                  <span className="font-bold text-white truncate block">{formData.recentDeployment?.version}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#161C28] border border-[#202838]">
                  <span className="text-[10px] text-gray-500 block">Deployed At</span>
                  <span className="font-medium text-gray-300 truncate block">{formData.recentDeployment?.deployedAt}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#161C28] border border-[#202838]">
                  <span className="text-[10px] text-gray-500 block">Commit Hash</span>
                  <code className="font-bold text-[#FF7A00] block truncate">#{formData.recentDeployment?.commitHash}</code>
                </div>
                <div className="p-2.5 rounded-xl bg-[#161C28] border border-[#202838]">
                  <span className="text-[10px] text-gray-500 block">Environment</span>
                  <span className="font-medium text-emerald-400 truncate block">{formData.recentDeployment?.environment}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#161C28] border border-[#202838] space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 uppercase font-semibold">
                  <span>Release Notes & Change Scope</span>
                  <span>By: {formData.recentDeployment?.deployedBy}</span>
                </div>
                <p className="text-xs font-mono text-gray-300 leading-relaxed">
                  {formData.recentDeployment?.notes || 'No change notes recorded.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-gray-400 block mb-1">Version</label>
                  <input
                    type="text"
                    value={formData.recentDeployment?.version || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, recentDeployment: { ...prev.recentDeployment, version: e.target.value } }))}
                    className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-[#FF7A00] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-gray-400 block mb-1">Deployed At</label>
                  <input
                    type="text"
                    value={formData.recentDeployment?.deployedAt || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, recentDeployment: { ...prev.recentDeployment, deployedAt: e.target.value } }))}
                    className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-[#FF7A00] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-gray-400 block mb-1">Commit Hash</label>
                  <input
                    type="text"
                    value={formData.recentDeployment?.commitHash || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, recentDeployment: { ...prev.recentDeployment, commitHash: e.target.value } }))}
                    className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-[#FF7A00] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-gray-400 block mb-1">Deployed By</label>
                  <input
                    type="text"
                    value={formData.recentDeployment?.deployedBy || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, recentDeployment: { ...prev.recentDeployment, deployedBy: e.target.value } }))}
                    className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-[#FF7A00] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-gray-400 block mb-1">Environment</label>
                  <input
                    type="text"
                    value={formData.recentDeployment?.environment || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, recentDeployment: { ...prev.recentDeployment, environment: e.target.value } }))}
                    className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-[#FF7A00] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono text-gray-400 block mb-1">Changelog & Notes</label>
                <textarea
                  rows={2}
                  value={formData.recentDeployment?.notes || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, recentDeployment: { ...prev.recentDeployment, notes: e.target.value } }))}
                  className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-[#FF7A00] focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

      </div>

      {/* SECTION 2: All VM IPs & Infrastructure Matrix */}
      <div className="p-5 rounded-2xl bg-[#121722] border border-[#232A39] shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2533]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-mono font-bold text-sm text-white flex items-center gap-2">
                All VM IPs & Infrastructure Nodes
                <span className="text-xs px-2 py-0.2 rounded-full bg-purple-950 text-purple-300 border border-purple-800/50">
                  {formData.vmIps?.length || 0} Nodes
                </span>
              </h3>
              <p className="text-[11px] font-mono text-gray-400">
                Network address topology, PLC sorter controllers, and application clusters
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Search VMs */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search IPs, Hostnames..."
                value={vmSearch}
                onChange={(e) => setVmSearch(e.target.value)}
                className="bg-[#161C28] border border-[#2B3548] text-xs font-mono text-white pl-8 pr-3 py-1.5 rounded-lg focus:border-[#FF7A00] focus:outline-none w-48 sm:w-56"
              />
            </div>

            {isEditing && (
              <button
                onClick={handleAddVm}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold transition-all shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add VM</span>
              </button>
            )}
          </div>
        </div>

        {/* VM IPs Table */}
        <div className="overflow-x-auto rounded-xl border border-[#202838]">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#161C28] text-gray-400 uppercase text-[10px] tracking-wider border-b border-[#202838]">
              <tr>
                <th className="py-2.5 px-3">Hostname</th>
                <th className="py-2.5 px-3">IP Address</th>
                <th className="py-2.5 px-3">Subsystem Role</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Specs / Hardware</th>
                {isEditing && <th className="py-2.5 px-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D2433]">
              {filteredVms.map((vm, idx) => (
                <tr key={vm.id || idx} className="hover:bg-[#151B26] transition-colors">
                  
                  {/* Hostname */}
                  <td className="py-2.5 px-3 font-semibold text-white">
                    {isEditing ? (
                      <input
                        type="text"
                        value={vm.hostname}
                        onChange={(e) => handleUpdateVm(idx, 'hostname', e.target.value)}
                        className="bg-[#1B2232] border border-[#2B3548] rounded px-2 py-1 text-xs font-mono text-white w-full"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5 text-gray-500" />
                        <span className="font-bold">{vm.hostname}</span>
                      </div>
                    )}
                  </td>

                  {/* IP Address + Copy Button */}
                  <td className="py-2.5 px-3">
                    {isEditing ? (
                      <input
                        type="text"
                        value={vm.ip}
                        onChange={(e) => handleUpdateVm(idx, 'ip', e.target.value)}
                        className="bg-[#1B2232] border border-[#2B3548] rounded px-2 py-1 text-xs font-mono text-emerald-400 font-bold w-full"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <code className="text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-800/30 px-2 py-0.5 rounded text-[11px]">
                          {vm.ip}
                        </code>
                        <button
                          onClick={() => handleCopyIp(vm.ip)}
                          className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#1F2738] transition-colors"
                          title="Copy IP to clipboard"
                        >
                          {copiedIp === vm.ip ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Role */}
                  <td className="py-2.5 px-3 text-gray-300">
                    {isEditing ? (
                      <input
                        type="text"
                        value={vm.role}
                        onChange={(e) => handleUpdateVm(idx, 'role', e.target.value)}
                        className="bg-[#1B2232] border border-[#2B3548] rounded px-2 py-1 text-xs font-mono text-white w-full"
                      />
                    ) : (
                      <span>{vm.role}</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-2.5 px-3">
                    {isEditing ? (
                      <select
                        value={vm.status}
                        onChange={(e) => handleUpdateVm(idx, 'status', e.target.value)}
                        className="bg-[#1B2232] border border-[#2B3548] rounded px-2 py-1 text-xs font-mono text-white"
                      >
                        <option value="ONLINE">ONLINE</option>
                        <option value="STANDBY">STANDBY</option>
                        <option value="MAINTENANCE">MAINTENANCE</option>
                        <option value="DEGRADED">DEGRADED</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        vm.status === 'ONLINE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' :
                        vm.status === 'STANDBY' ? 'bg-amber-950 text-amber-400 border border-amber-800/50' :
                        vm.status === 'MAINTENANCE' ? 'bg-purple-950 text-purple-400 border border-purple-800/50' :
                        'bg-red-950 text-red-400 border border-red-800/50'
                      }`}>
                        {vm.status}
                      </span>
                    )}
                  </td>

                  {/* Specs */}
                  <td className="py-2.5 px-3 text-gray-400 text-[11px] truncate max-w-[200px]">
                    {isEditing ? (
                      <input
                        type="text"
                        value={vm.specs || ''}
                        onChange={(e) => handleUpdateVm(idx, 'specs', e.target.value)}
                        className="bg-[#1B2232] border border-[#2B3548] rounded px-2 py-1 text-xs font-mono text-white w-full"
                      />
                    ) : (
                      <span>{vm.specs || 'Standard Cloud Instance'}</span>
                    )}
                  </td>

                  {/* Admin Delete Action */}
                  {isEditing && (
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleRemoveVm(idx)}
                        className="p-1 rounded text-red-400 hover:text-white hover:bg-red-950 transition-colors"
                        title="Delete VM row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: All Different Dashboard Links */}
      <div className="p-5 rounded-2xl bg-[#121722] border border-[#232A39] shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#1E2533]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-mono font-bold text-sm text-white flex items-center gap-2">
                All Operational & Telemetry Dashboard Links
                <span className="text-xs px-2 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                  {formData.dashboardLinks?.length || 0} Links
                </span>
              </h3>
              <p className="text-[11px] font-mono text-gray-400">
                1-click access to Grafana, GreyMatter, Kibana, CloudWatch, and custom monitoring suites
              </p>
            </div>
          </div>

          {isEditing && (
            <button
              onClick={handleAddDashboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold transition-all shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Dashboard Link</span>
            </button>
          )}
        </div>

        {/* Dashboards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {formData.dashboardLinks?.map((dash, idx) => (
            <div 
              key={dash.id || idx}
              className="p-3.5 rounded-xl bg-[#161C28] border border-[#232A39] hover:border-[#FF7A00]/40 transition-all flex flex-col justify-between group space-y-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.2 rounded bg-[#1F2738] text-gray-300 border border-[#2B3548]">
                    {dash.category}
                  </span>
                  {isEditing && (
                    <button
                      onClick={() => handleRemoveDashboard(idx)}
                      className="text-red-400 hover:text-white p-1 rounded hover:bg-red-950"
                      title="Remove dashboard link"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2 pt-1">
                    <input
                      type="text"
                      placeholder="Title"
                      value={dash.title}
                      onChange={(e) => handleUpdateDashboard(idx, 'title', e.target.value)}
                      className="w-full bg-[#1B2232] border border-[#2B3548] rounded px-2 py-1 text-xs font-mono text-white"
                    />
                    <input
                      type="text"
                      placeholder="URL"
                      value={dash.url}
                      onChange={(e) => handleUpdateDashboard(idx, 'url', e.target.value)}
                      className="w-full bg-[#1B2232] border border-[#2B3548] rounded px-2 py-1 text-xs font-mono text-emerald-400"
                    />
                    <input
                      type="text"
                      placeholder="Category"
                      value={dash.category}
                      onChange={(e) => handleUpdateDashboard(idx, 'category', e.target.value)}
                      className="w-full bg-[#1B2232] border border-[#2B3548] rounded px-2 py-1 text-xs font-mono text-gray-300"
                    />
                  </div>
                ) : (
                  <>
                    <h4 className="font-mono font-bold text-sm text-white group-hover:text-[#FF7A00] transition-colors line-clamp-1">
                      {dash.title}
                    </h4>
                    <p className="text-[11px] font-mono text-gray-400 line-clamp-2">
                      {dash.description || 'Live facility metrics and operational status.'}
                    </p>
                  </>
                )}
              </div>

              {!isEditing && (
                <div className="pt-2 border-t border-[#1F2636] flex items-center justify-between">
                  <span className="text-[10px] font-mono text-gray-500 truncate max-w-[150px]">
                    {dash.url.replace(/^https?:\/\//, '')}
                  </span>
                  <a
                    href={dash.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-mono font-bold text-[#FF7A00] hover:underline"
                  >
                    <span>Launch</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4: Slack + War Room + Runbook */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Slack Channel Card */}
        <div className="p-5 rounded-2xl bg-[#121722] border border-[#232A39] shadow-lg space-y-3.5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2533]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-mono font-bold text-sm text-white">Slack Ops Integration</h3>
                  <p className="text-[11px] font-mono text-gray-400">Live channel link for this facility</p>
                </div>
              </div>
            </div>

            {!isEditing ? (
              <div className="p-3.5 rounded-xl bg-[#11241C] border border-emerald-500/30 space-y-2">
                <div className="text-[10px] font-mono uppercase text-emerald-400/70 font-semibold">Channel Identifier</div>
                <div className="font-mono font-extrabold text-base text-emerald-300">{formData.slackChannelName || '#ops-site'}</div>
                <div className="text-[11px] font-mono text-emerald-200/60 truncate">{formData.slackChannelUrl}</div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] font-mono text-gray-400 block mb-1">Slack Channel Name</label>
                  <input
                    type="text"
                    value={formData.slackChannelName || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, slackChannelName: e.target.value }))}
                    className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-400 font-bold focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-gray-400 block mb-1">Slack Channel Direct Link (URL)</label>
                  <input
                    type="text"
                    value={formData.slackChannelUrl || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, slackChannelUrl: e.target.value }))}
                    className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            onClick={openSiteSlack}
            className="w-full py-2.5 px-3 rounded-xl bg-[#11241C] hover:bg-[#163024] border border-emerald-500/50 text-emerald-300 hover:text-white text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 shadow"
          >
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <span>Open {formData.slackChannelName} in Slack</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ─── War Room Card ─── */}
        <div className="p-5 rounded-2xl bg-[#121722] border border-[#232A39] shadow-lg space-y-3.5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2533]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-mono font-bold text-sm text-white">Zoom War Room</h3>
                  <p className="text-[11px] font-mono text-gray-400">Incident bridge & NOC escalation link</p>
                </div>
              </div>
              {formData.warRoomUrl && !isEditing && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950/60 text-blue-300 border border-blue-800/40 font-bold animate-pulse">
                  LIVE
                </span>
              )}
            </div>

            {!isEditing ? (
              <div className="space-y-2.5">
                <div className="p-3.5 rounded-xl bg-[#0E1A2C] border border-blue-500/30 space-y-2">
                  <div className="text-[10px] font-mono uppercase text-blue-400/70 font-semibold">Room Name</div>
                  <div className="font-mono font-extrabold text-sm text-blue-300 truncate">
                    {formData.warRoomName || 'NOC War Room'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-[#161C28] border border-[#202838] space-y-1">
                    <div className="text-[10px] font-mono uppercase text-gray-500 font-semibold">Meeting ID</div>
                    <code className="text-xs font-mono text-blue-300 font-bold block truncate">
                      {formData.warRoomMeetingId || '—'}
                    </code>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#161C28] border border-[#202838] space-y-1">
                    <div className="text-[10px] font-mono uppercase text-gray-500 font-semibold">Passcode</div>
                    <code className="text-xs font-mono text-amber-300 font-bold block truncate">
                      {formData.warRoomPasscode || '—'}
                    </code>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] font-mono text-gray-400 block mb-1">Room Name</label>
                  <input
                    type="text"
                    value={formData.warRoomName || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, warRoomName: e.target.value }))}
                    className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-blue-400 font-bold focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. DHL NOC War Room"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-gray-400 block mb-1">Zoom / Meeting URL</label>
                  <input
                    type="text"
                    value={formData.warRoomUrl || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, warRoomUrl: e.target.value }))}
                    className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-blue-500 focus:outline-none"
                    placeholder="https://greyorange.zoom.us/j/..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-mono text-gray-400 block mb-1">Meeting ID</label>
                    <input
                      type="text"
                      value={formData.warRoomMeetingId || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, warRoomMeetingId: e.target.value }))}
                      className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-blue-300 focus:border-blue-500 focus:outline-none"
                      placeholder="800 123 4567"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-gray-400 block mb-1">Passcode</label>
                    <input
                      type="text"
                      value={formData.warRoomPasscode || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, warRoomPasscode: e.target.value }))}
                      className="w-full bg-[#161C28] border border-[#2B3548] rounded-lg px-3 py-1.5 text-xs font-mono text-amber-300 focus:border-amber-500 focus:outline-none"
                      placeholder="NOC-SITECODE"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={openSiteWarRoom}
            disabled={!formData.warRoomUrl}
            className="w-full py-2.5 px-3 rounded-xl bg-[#0E1A2C] hover:bg-[#132236] border border-blue-500/50 text-blue-300 hover:text-white text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 shadow disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Video className="w-4 h-4 text-blue-400" />
            <span>Join {formData.warRoomName || 'War Room'}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Operational Runbook & Handover Notes */}
        <div className="p-5 rounded-2xl bg-[#121722] border border-[#232A39] shadow-lg space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E2533]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#FF7A00]/15 text-[#FF7A00]">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-mono font-bold text-sm text-white">Site Runbook & Handover</h3>
                <p className="text-[11px] font-mono text-gray-400">Shift protocols, maintenance windows, and emergency instructions</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1C2330] text-gray-300 border border-[#263145]">Ops Core</span>
          </div>

          {!isEditing ? (
            <div className="p-4 rounded-xl bg-[#161C28] border border-[#202838] text-xs font-mono text-gray-300 whitespace-pre-wrap leading-relaxed max-h-[260px] overflow-y-auto">
              {formData.siteNotes || 'No custom operational notes logged yet. Click Admin Edit Mode to add runbook guidelines.'}
            </div>
          ) : (
            <div>
              <label className="text-[11px] font-mono text-gray-400 block mb-1">Edit Operational Notes & Runbook (Markdown supported)</label>
              <textarea
                rows={9}
                value={formData.siteNotes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, siteNotes: e.target.value }))}
                className="w-full bg-[#161C28] border border-[#2B3548] rounded-xl p-3 text-xs font-mono text-white focus:border-[#FF7A00] focus:outline-none"
                placeholder="Document critical shift handovers, peak hour UPH constraints, inverter reset procedures..."
              />
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
