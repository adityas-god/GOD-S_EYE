import React, { useState, useEffect } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import { AdminPanelLink } from '../../types/dashboard';
import { 
  X, 
  Save, 
  SlidersHorizontal, 
  CheckCircle2, 
  AlertCircle, 
  MessageSquare, 
  ExternalLink, 
  Database,
  Layers,
  Settings as SettingsIcon,
  Sparkles
} from 'lucide-react';

interface AdminEmbedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminEmbedModal: React.FC<AdminEmbedModalProps> = ({ isOpen, onClose }) => {
  const { 
    currentSiteObj, 
    siteIntelligence, 
    updateSiteIntelligence, 
    openSiteSlack,
    embedLinks, 
    updateEmbed 
  } = useDashboard();
  
  const [activeTab, setActiveTab] = useState<'slack' | 'embeds'>('slack');

  // Slack state
  const [slackChannelName, setSlackChannelName] = useState<string>('');
  const [slackChannelUrl, setSlackChannelUrl] = useState<string>('');
  const [isSavingSlack, setIsSavingSlack] = useState<boolean>(false);
  const [slackStatus, setSlackStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Embeds state
  const [panelKey, setPanelKey] = useState<string>('primary_metrics');
  const [title, setTitle] = useState<string>('');
  const [embedUrl, setEmbedUrl] = useState<string>('');
  const [panelType, setPanelType] = useState<'iframe' | 'markdown' | 'metrics'>('iframe');
  const [isSavingEmbed, setIsSavingEmbed] = useState<boolean>(false);
  const [embedStatus, setEmbedStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (siteIntelligence) {
      setSlackChannelName(siteIntelligence.slackChannelName || '');
      setSlackChannelUrl(siteIntelligence.slackChannelUrl || '');
    }
  }, [siteIntelligence]);

  useEffect(() => {
    const existing = (embedLinks || []).find(l => l?.panel_key === panelKey);
    if (existing) {
      setTitle(existing.title);
      setEmbedUrl(existing.embed_url);
      setPanelType(existing.panel_type);
    } else {
      setTitle(panelKey === 'primary_metrics' ? 'Live Telemetry Dashboard' : 'Facility Operational Runbook');
      setEmbedUrl('https://grafana.wikimedia.org/d-solo/000000021/mediawiki-alerts?orgId=1&panelId=1');
      setPanelType('iframe');
    }
  }, [panelKey, embedLinks]);

  if (!isOpen) return null;

  const handleSaveSlack = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSlack(true);
    setSlackStatus(null);
    try {
      const res = await updateSiteIntelligence({
        slackChannelName,
        slackChannelUrl
      });
      setSlackStatus({ type: 'success', text: res.message || 'Slack integration persisted in MongoDB Atlas.' });
      setTimeout(() => setIsSavingSlack(false), 500);
    } catch (err: any) {
      setSlackStatus({ type: 'error', text: err.message || 'Failed to persist Slack settings.' });
      setIsSavingSlack(false);
    }
  };

  const handleSaveEmbed = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEmbed(true);
    setEmbedStatus(null);

    try {
      await updateEmbed({
        panel_key: panelKey,
        title,
        embed_url: embedUrl,
        panel_type: panelType,
        updated_by: 'Administrator'
      });
      setEmbedStatus({ type: 'success', text: 'Embed URL persisted successfully.' });
      setTimeout(() => setIsSavingEmbed(false), 500);
    } catch (err: any) {
      setEmbedStatus({ type: 'error', text: err.message || 'Failed to save configuration.' });
      setIsSavingEmbed(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div onClick={onClose} className="fixed inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in" />

      {/* Modal Dialog */}
      <div className="relative bg-[#121722] border border-[#232A39] rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#232A39] bg-[#141923] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#FF7A00]/15 text-[#FF7A00]">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-mono font-bold text-base text-white">
                Facility & Integration Settings
              </h3>
              <p className="text-xs text-gray-400 font-mono flex items-center gap-1.5 mt-0.5">
                Target Facility: <strong className="text-[#FF7A00]">{currentSiteObj.name}</strong>
                <span className="text-gray-500">({currentSiteObj.code})</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#1D2533] hover:bg-[#283344] text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#232A39] bg-[#0E121A] px-5 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('slack')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs font-mono font-bold transition-all border-b-2 ${
              activeTab === 'slack'
                ? 'border-emerald-400 text-emerald-400 bg-[#141923]'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#141923]/50'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <span>Slack Integration</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('embeds')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs font-mono font-bold transition-all border-b-2 ${
              activeTab === 'embeds'
                ? 'border-[#FF7A00] text-[#FF7A00] bg-[#141923]'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#141923]/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Embed Panels</span>
          </button>
        </div>

        {/* TAB 1: SLACK INTEGRATION */}
        {activeTab === 'slack' && (
          <form onSubmit={handleSaveSlack} className="p-5 space-y-4">
            {slackStatus && (
              <div className={`p-3 rounded-xl text-xs font-mono flex items-center gap-2 ${
                slackStatus.type === 'success' 
                  ? 'bg-emerald-950/50 border border-emerald-500/50 text-emerald-300' 
                  : 'bg-red-950/50 border border-red-500/50 text-red-300'
              }`}>
                {slackStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />}
                <span>{slackStatus.text}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-[#11241C] border border-emerald-500/30 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] font-mono text-emerald-400/80 uppercase font-semibold">Active Slack Link</span>
                <div className="text-xs font-mono text-emerald-200 font-bold">
                  {slackChannelName || `#ops-${currentSiteObj.code.toLowerCase()}`}
                </div>
              </div>
              <button
                type="button"
                onClick={openSiteSlack}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-mono font-bold transition-all shadow"
              >
                <span>Launch Channel</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                Slack Channel Identifier / Name
              </label>
              <input
                type="text"
                required
                value={slackChannelName}
                onChange={e => setSlackChannelName(e.target.value)}
                placeholder="#ops-facility-name"
                className="w-full px-3 py-2 bg-[#161C28] border border-[#2B3548] rounded-xl text-sm text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-gray-500 mt-1 font-mono">
                The public or incident triage channel for {currentSiteObj.name}. Displayed in the sidebar and hub card.
              </p>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                Slack Channel Direct URL or Webhook Link
              </label>
              <input
                type="text"
                required
                value={slackChannelUrl}
                onChange={e => setSlackChannelUrl(e.target.value)}
                placeholder="https://slack.com/app_redirect?channel=..."
                className="w-full px-3 py-2 bg-[#161C28] border border-[#2B3548] rounded-xl text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-gray-500 mt-1 font-mono">
                When clicked anywhere in the dashboard, opens this link directly in a new tab or Slack application.
              </p>
            </div>

            {/* Persistence in MongoDB Atlas confirmation */}
            <div className="pt-2 flex items-center justify-between border-t border-[#1E2533]">
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                <Database className="w-3.5 h-3.5" />
                Persists to MongoDB Atlas
              </span>

              <button
                type="submit"
                disabled={isSavingSlack}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingSlack ? 'Persisting...' : 'Save Slack Integration'}</span>
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: EMBEDS CONFIGURATION */}
        {activeTab === 'embeds' && (
          <form onSubmit={handleSaveEmbed} className="p-5 space-y-4">
            {embedStatus && (
              <div className={`p-3 rounded-xl text-xs font-mono flex items-center gap-2 ${
                embedStatus.type === 'success' 
                  ? 'bg-emerald-950/50 border border-emerald-500/50 text-emerald-300' 
                  : 'bg-red-950/50 border border-red-500/50 text-red-300'
              }`}>
                {embedStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />}
                <span>{embedStatus.text}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                Select Panel Slot
              </label>
              <select
                value={panelKey}
                onChange={e => setPanelKey(e.target.value)}
                className="w-full px-3 py-2 bg-[#161C28] border border-[#2B3548] rounded-xl text-sm text-white font-mono focus:outline-none focus:border-[#FF7A00]"
              >
                <option value="primary_metrics">Slot 1: Primary Metrics / Telemetry (Grafana)</option>
                <option value="runbook_doc">Slot 2: Operational SOP / Runbook Document</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                Display Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Real-Time Conveyor Diagnostics"
                className="w-full px-3 py-2 bg-[#161C28] border border-[#2B3548] rounded-xl text-sm text-white font-mono focus:outline-none focus:border-[#FF7A00]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-gray-400 mb-1">
                Iframe Embed URL
              </label>
              <input
                type="url"
                required
                value={embedUrl}
                onChange={e => setEmbedUrl(e.target.value)}
                placeholder="https://grafana.wikimedia.org/d-solo/..."
                className="w-full px-3 py-2 bg-[#161C28] border border-[#2B3548] rounded-xl text-sm text-white font-mono focus:outline-none focus:border-[#FF7A00]"
              />
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-[#1E2533]">
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-gray-400">
                <Database className="w-3.5 h-3.5 text-[#FF7A00]" />
                Persists to Database
              </span>

              <button
                type="submit"
                disabled={isSavingEmbed}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF7A00] hover:bg-[#FF8F26] text-white font-mono text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingEmbed ? 'Saving...' : 'Save Embed Panel'}</span>
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
