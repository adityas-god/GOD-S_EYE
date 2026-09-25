import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
  Link, 
  Sparkles, 
  CheckCircle2, 
  ExternalLink,
  Bot,
  Activity,
  Layers,
  HardDrive,
  Cpu,
  TrendingUp,
  Zap
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { DashboardLinkKey, DEFAULT_12_LINKS } from '../../types/twelveLinks';
import { normalizeGrafanaUrl } from '../../utils/proxyUrl';

const ALL_12_KEYS: DashboardLinkKey[] = [
  'butler', 'bridge', 'elastic', 'platform', 'influx', 'logs',
  'UPH', 'PPR', 'R2R', 'KPI', 'DISK', 'MEM'
];

export const EditDashboardLinkModal: React.FC = () => {
  const { 
    editingLinkKey, 
    setEditingLinkKey, 
    selectedSite, 
    currentSiteObj, 
    dashboardLinks, 
    dashboardTitles, 
    updateDashboardLink,
    setActiveDashboardKey 
  } = useDashboard();

  const [currentKey, setCurrentKey] = useState<DashboardLinkKey>('butler');
  const [title, setTitle] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (editingLinkKey) {
      setCurrentKey(editingLinkKey);
      setTitle(dashboardTitles[editingLinkKey] || DEFAULT_12_LINKS[editingLinkKey]?.title || '');
      setUrl(dashboardLinks[editingLinkKey] || '');
      setSaveMessage(null);
    }
  }, [editingLinkKey, dashboardLinks, dashboardTitles]);

  if (!editingLinkKey) return null;

  const meta = DEFAULT_12_LINKS[currentKey];
  const siteName = currentSiteObj?.name || selectedSite;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsSaving(true);
    await updateDashboardLink(currentKey, url.trim(), title.trim());
    setActiveDashboardKey(currentKey); // auto-activate this dashboard

    setIsSaving(false);
    setSaveMessage(`Dashboard link for ${meta.title} saved & rendered!`);

    setTimeout(() => {
      setSaveMessage(null);
      setEditingLinkKey(null);
    }, 850);
  };

  const handleSelectKey = (key: DashboardLinkKey) => {
    setCurrentKey(key);
    setTitle(dashboardTitles[key] || DEFAULT_12_LINKS[key]?.title || '');
    setUrl(dashboardLinks[key] || '');
    setSaveMessage(null);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-5 font-mono animate-in fade-in">
      <div className="bg-[#121620] border border-[#2B3548] rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-[#232A39] flex items-center justify-between bg-[#151A24]">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF7A00]" />
            <div>
              <h2 className="text-sm font-extrabold text-white uppercase tracking-wider">
                Edit Dashboard Link — {siteName}
              </h2>
              <p className="text-[11px] text-[#717E95]">
                Configure the Grafana or telemetry dashboard link for any of the 12 services and metrics.
              </p>
            </div>
          </div>

          <button
            onClick={() => setEditingLinkKey(null)}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-[#1E2636] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 12 Keys Quick Selector Tabs */}
        <div className="p-3 bg-[#0E121A] border-b border-[#232A39] space-y-2">
          <div className="text-[10px] text-[#69758C] font-bold uppercase flex justify-between">
            <span>Select Service or Metric to Configure:</span>
            <span className="text-[#FF7A00]">#{meta?.index} of 12</span>
          </div>

          {/* 6 Services */}
          <div>
            <div className="text-[9px] text-[#556277] uppercase font-bold mb-1">Services (6):</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {(['butler', 'bridge', 'elastic', 'platform', 'influx', 'logs'] as DashboardLinkKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => handleSelectKey(k)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold truncate transition-all ${
                    currentKey === k 
                      ? 'bg-[#FF7A00] text-white shadow-md' 
                      : 'bg-[#151A24] text-gray-300 hover:text-white border border-[#232A39]'
                  }`}
                >
                  {k.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* 6 Metrics */}
          <div>
            <div className="text-[9px] text-[#556277] uppercase font-bold mb-1">Telemetry Metrics (6):</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {(['UPH', 'PPR', 'R2R', 'KPI', 'DISK', 'MEM'] as DashboardLinkKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => handleSelectKey(k)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold truncate transition-all ${
                    currentKey === k 
                      ? 'bg-[#FF7A00] text-white shadow-md' 
                      : 'bg-[#151A24] text-gray-300 hover:text-white border border-[#232A39]'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSave} className="p-4 sm:p-5 space-y-4">
          
          {saveMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-400 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#8F9BAC] mb-1">
                Configuring Target
              </label>
              <div className="p-2.5 rounded-lg bg-[#171D27] border border-[#232A39] text-xs font-bold text-[#FF7A00] flex items-center justify-between">
                <span>{currentKey.toUpperCase()} ({meta.category})</span>
                <span className="text-[10px] text-gray-400">Panel #{meta.index}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#8F9BAC] mb-1">
                Facility Site
              </label>
              <div className="p-2.5 rounded-lg bg-[#171D27] border border-[#232A39] text-xs font-bold text-white">
                {siteName} ({selectedSite})
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#8F9BAC] mb-1">
              Dashboard Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Butler Fleet Orchestration & AGV Scheduler"
              className="w-full bg-[#171D27] border border-[#2B3548] rounded-lg px-3 py-2 text-xs text-white placeholder-[#515C70] focus:border-[#FF7A00] outline-none font-medium"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs text-[#8F9BAC]">
                Grafana / Dashboard Link (URL) <span className="text-[#FF7A00]">*</span>
              </label>
              {url && (
                <a
                  href={normalizeGrafanaUrl(url) || url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-[#FF7A00] hover:underline flex items-center gap-1"
                >
                  <span>Test Link</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
            <input
              type="text"
              required
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Paste Grafana Embed HTML (<iframe...>) or URL (/d-solo/...)"
              className="w-full bg-[#171D27] border border-[#2B3548] rounded-lg px-3 py-2 text-xs text-white placeholder-[#515C70] focus:border-[#FF7A00] outline-none font-medium"
            />
            <span className="text-[10px] text-[#657186] mt-1 block">
              Paste Grafana Share → Embed HTML (&lt;iframe...&gt;), solo URL (`/d-solo/...`), or full dashboard link.
            </span>
          </div>

          <div className="pt-3 border-t border-[#232A39] flex items-center justify-between">
            <span className="text-[10px] text-[#6F7C93] flex items-center gap-1">
              <Database className="w-3 h-3 text-[#FF7A00]" />
              <span>Saves to MongoDB Atlas for <strong>{siteName}</strong></span>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingLinkKey(null)}
                className="px-4 py-2 rounded-lg bg-[#19202C] hover:bg-[#232C3E] text-gray-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-lg bg-[#FF7A00] hover:bg-[#FF8B21] text-white text-xs font-bold shadow-[0_0_12px_rgba(255,122,0,0.3)] transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save & Auto-Render'}</span>
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
