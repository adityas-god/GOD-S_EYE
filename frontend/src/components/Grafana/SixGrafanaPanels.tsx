import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Bot, 
  Cpu, 
  Database, 
  Layers, 
  Zap, 
  Terminal, 
  Edit3, 
  ExternalLink, 
  Check, 
  X, 
  Maximize2,
  RefreshCw
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { DashboardLinkKey } from '../../types/twelveLinks';

interface PanelConfig {
  id: DashboardLinkKey;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  badgeColor: string;
  value: string;
  unit: string;
  metricLabel: string;
  sparkline: string;
}

const SIX_PANELS: PanelConfig[] = [
  {
    id: 'butler',
    title: 'Butler Fleet',
    subtitle: 'AGV Scheduler & Fleet Health',
    icon: Bot,
    accentColor: '#FF7A00',
    badgeColor: 'text-[#FF7A00] bg-[#FF7A00]/15 border-[#FF7A00]/30',
    value: '99.8%',
    unit: 'Uptime',
    metricLabel: '48 AGVs Active',
    sparkline: 'M0,25 Q15,5 30,20 T60,18 T90,28 T120,10 T150,22 T180,15 T200,20'
  },
  {
    id: 'bridge',
    title: 'Bridge Gateway',
    subtitle: 'Hardware Bus & PLC Telemetry',
    icon: Cpu,
    accentColor: '#10B981',
    badgeColor: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    value: '100%',
    unit: 'Signal',
    metricLabel: '4ms Bus Latency',
    sparkline: 'M0,20 L30,20 L30,8 L70,8 L70,24 L110,24 L110,12 L160,12 L160,20 L200,20'
  },
  {
    id: 'elastic',
    title: 'Elastic Ingest',
    subtitle: 'Cluster Search & Document Stream',
    icon: Database,
    accentColor: '#3B82F6',
    badgeColor: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
    value: '14.2k',
    unit: 'Docs/s',
    metricLabel: 'Cluster: Green',
    sparkline: 'M0,28 Q20,20 40,24 T80,12 T120,16 T160,8 T200,14'
  },
  {
    id: 'platform',
    title: 'Platform Core',
    subtitle: 'GreyMatter OS Transactions',
    icon: Layers,
    accentColor: '#A855F7',
    badgeColor: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
    value: '1,840',
    unit: 'TPS',
    metricLabel: '24ms P99 Latency',
    sparkline: 'M0,22 Q25,12 50,18 T100,6 T150,20 T200,12'
  },
  {
    id: 'influx',
    title: 'Influx Sensor',
    subtitle: 'High-Frequency Vibration Stream',
    icon: Zap,
    accentColor: '#14B8A6',
    badgeColor: 'text-teal-400 bg-teal-500/15 border-teal-500/30',
    value: '50 kHz',
    unit: 'Rate',
    metricLabel: '41°C Sensor Temp',
    sparkline: 'M0,15 L15,5 L30,25 L45,10 L60,28 L75,8 L90,22 L105,12 L120,24 L140,8 L160,26 L180,12 L200,16'
  },
  {
    id: 'logs',
    title: 'Diagnostic Logs',
    subtitle: 'Real-Time Tail & Exception Stream',
    icon: Terminal,
    accentColor: '#F59E0B',
    badgeColor: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
    value: '0 Fatal',
    unit: 'Errors',
    metricLabel: '2 Warn · Live Tail',
    sparkline: 'M0,26 L35,26 L35,16 L70,16 L70,26 L115,26 L115,10 L150,10 L150,26 L200,26'
  }
];

export const SixGrafanaPanels: React.FC = () => {
  const { 
    currentSiteObj, 
    activeDashboardKey, 
    setActiveDashboardKey,
    selectedService,
    setSelectedService,
    dashboardLinks, 
    dashboardTitles, 
    updateDashboardLink 
  } = useDashboard();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [editingPanelId, setEditingPanelId] = useState<DashboardLinkKey | null>(null);
  const [editUrl, setEditUrl] = useState<string>('');
  const [editTitle, setEditTitle] = useState<string>('');

  // Simulated telemetry loading cycle for sleek dashboard transitions
  useEffect(() => {
    setIsLoading(true);
    const t = setTimeout(() => setIsLoading(false), 450);
    return () => clearTimeout(t);
  }, [currentSiteObj?.id]);

  const handleStartEdit = (e: React.MouseEvent, panelId: DashboardLinkKey, title: string) => {
    e.stopPropagation();
    setEditingPanelId(panelId);
    setEditUrl(dashboardLinks[panelId] || '');
    setEditTitle(dashboardTitles[panelId] || `${currentSiteObj?.name || 'Site'} — ${title}`);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPanelId && editUrl.trim()) {
      await updateDashboardLink(editingPanelId, editUrl.trim(), editTitle.trim());
    }
    setEditingPanelId(null);
  };

  const handleSelectPanel = (panelId: DashboardLinkKey) => {
    setActiveDashboardKey(panelId);
    setSelectedService(panelId);
  };

  return (
    <div className="surface-card rounded-xl p-3 sm:p-4 shadow-lg overflow-hidden h-[330px] flex flex-col border border-[#232A39] font-mono">
      
      {/* Top Header Bar */}
      <div className="shrink-0 flex items-center justify-between pb-2 border-b border-[#232A39]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#FF7A00] animate-pulse" />
          <span className="font-extrabold text-xs uppercase tracking-wider text-white">
            Grafana Operational Panels
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#151A24] text-[#8C98AE] border border-[#273246]">
            6 Active Streams
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span className="flex items-center gap-1 text-emerald-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Ingestion
          </span>
          <span className="text-[#55627A]">|</span>
          <span className="text-gray-300 font-semibold">{currentSiteObj?.name || "Sam's ATL"}</span>
        </div>
      </div>

      {/* Inline Edit Form if an item is being edited */}
      {editingPanelId && (
        <form onSubmit={handleSaveEdit} className="shrink-0 my-1 p-2 bg-[#121722] rounded-lg border border-[#2B3548] flex items-center gap-2 text-xs animate-in fade-in">
          <span className="text-[10px] font-bold text-[#FF7A00] shrink-0 uppercase">
            Edit {editingPanelId}:
          </span>
          <input 
            type="url"
            required
            placeholder="Paste Grafana panel or dashboard embed URL..."
            value={editUrl}
            onChange={e => setEditUrl(e.target.value)}
            className="flex-1 bg-[#090C12] border border-[#252E3E] text-white px-2 py-1 rounded text-[10px] outline-none focus:border-[#FF7A00]"
          />
          <button
            type="submit"
            className="px-2 py-1 bg-[#FF7A00] hover:bg-[#FF8A1C] text-white text-[10px] font-bold rounded flex items-center gap-1 shrink-0"
          >
            <Check className="w-3 h-3" />
            <span>Save</span>
          </button>
          <button
            type="button"
            onClick={() => setEditingPanelId(null)}
            className="p-1 bg-[#1C2330] text-gray-400 hover:text-white rounded shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </form>
      )}

      {/* 6 Grafana Loading Panels Grid (2 rows x 3 columns on standard, 2 on compact) */}
      <div className="flex-1 min-h-0 mt-2 overflow-y-auto pr-0.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 h-full">
          {SIX_PANELS.map((p, idx) => {
            const Icon = p.icon;
            const isSelected = activeDashboardKey === p.id || selectedService === p.id;
            const customUrl = dashboardLinks[p.id];
            const hasCustomIframe = customUrl && !customUrl.includes('wikimedia.org');

            return (
              <div
                key={p.id}
                onClick={() => handleSelectPanel(p.id)}
                className={`relative rounded-lg border p-2 flex flex-col justify-between cursor-pointer transition-all duration-150 group overflow-hidden ${
                  isSelected 
                    ? 'bg-[#151B27] border-[#FF7A00] ring-1 ring-[#FF7A00]/50 shadow-[0_0_12px_rgba(255,122,0,0.15)]' 
                    : 'bg-[#10141D] hover:bg-[#141924] border-[#202736] hover:border-[#2C374D]'
                }`}
              >
                {/* Top Row: Icon + Title + Live indicator + Quick Edit */}
                <div className="flex items-center justify-between gap-1 shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div 
                      className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${p.accentColor}20`, color: p.accentColor }}
                    >
                      <Icon className="w-3 h-3" />
                    </div>
                    <div className="truncate">
                      <div className="text-[11px] font-bold text-white leading-none truncate flex items-center gap-1">
                        <span>{idx + 1}. {p.title}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Edit Link & Open Tab */}
                  <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                    {customUrl && (
                      <a
                        href={customUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-gray-400 hover:text-white p-0.5"
                        title="Open Grafana panel in new tab"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleStartEdit(e, p.id, p.title)}
                      className="text-gray-400 hover:text-[#FF7A00] p-0.5"
                      title="Edit Grafana link"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                {/* Center Visualization: Telemetry Sparkline & Stat */}
                {isLoading ? (
                  /* Sleek Loading State */
                  <div className="my-auto py-2 flex flex-col items-center justify-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-[#FF7A00] animate-spin" />
                    <span className="text-[9px] text-[#637088]">Loading Telemetry...</span>
                  </div>
                ) : (
                  /* Live Grafana Panel Visualizer */
                  <div className="my-1 flex items-end justify-between gap-2">
                    <div>
                      <div className="text-base sm:text-lg font-black tracking-tight text-white leading-none">
                        {p.value}
                      </div>
                      <div className="text-[9px] text-[#6E7B93] mt-0.5 flex items-center gap-1">
                        <span className="font-semibold text-gray-300">{p.unit}</span>
                        <span>•</span>
                        <span className="truncate">{p.metricLabel}</span>
                      </div>
                    </div>

                    {/* Animated SVG Sparkline Waveform */}
                    <div className="w-24 h-8 shrink-0 relative overflow-hidden">
                      <svg className="w-full h-full" viewBox="0 0 200 32" preserveAspectRatio="none">
                        <path
                          d={p.sparkline}
                          fill="none"
                          stroke={p.accentColor}
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d={`${p.sparkline} L200,32 L0,32 Z`}
                          fill={`${p.accentColor}18`}
                        />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Bottom Status Bar */}
                <div className="shrink-0 pt-1 border-t border-[#1C2332] flex items-center justify-between text-[8px] text-[#5D6B82]">
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Live 100ms stream</span>
                  </span>
                  <span className="text-[#8492A6] group-hover:text-[#FF7A00] font-bold">
                    {isSelected ? 'ACTIVE' : 'INSPECT →'}
                  </span>
                </div>

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
