import React from 'react';
import { 
  LayoutGrid, 
  ClipboardList,
  Radio, 
  Settings,
  MapPin,
  Bot,
  BatteryCharging,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Sparkles,
  AlertTriangle,
  Video
} from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';

interface SidebarProps {
  activeNav: string;
  setActiveNav: (nav: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  onOpenSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeNav, 
  setActiveNav,
  isCollapsed,
  setIsCollapsed,
  onOpenSettings
}) => {
  const { 
    currentSiteObj, 
    siteIntelligence, 
    openSiteSlack, 
    openSiteWarRoom, 
    activeAlertCount 
  } = useDashboard();

  const navItems = [
    { 
      id: 'overview', 
      label: 'Overview', 
      icon: LayoutGrid, 
      count: null,
      type: 'nav'
    },
    { 
      id: 'alert-pool', 
      label: 'Alert Pool', 
      icon: AlertTriangle, 
      count: activeAlertCount > 0 ? `${activeAlertCount} ACT` : '0 ACT',
      type: 'nav'
    },
    { 
      id: 'site-notes', 
      label: 'Site Notes', 
      icon: ClipboardList, 
      count: 'INTEL',
      type: 'nav'
    },
    { 
      id: 'slack', 
      label: siteIntelligence?.slackChannelName || 'Slack Channel', 
      icon: MessageSquare, 
      count: 'SLACK',
      type: 'action',
      action: openSiteSlack,
      isExternal: true
    },
    { 
      id: 'war-room', 
      label: 'Zoom War Room', 
      icon: Video, 
      count: 'ZOOM',
      type: 'action',
      action: openSiteWarRoom,
      isExternal: true
    },
    { 
      id: 'scenes', 
      label: 'Postgres Telemetry', 
      icon: Radio, 
      count: 'LIVE',
      type: 'nav'
    },
    { 
      id: 'settings', 
      label: 'Settings', 
      icon: Settings, 
      count: null,
      type: onOpenSettings ? 'action' : 'nav',
      action: onOpenSettings
    },
  ];

  return (
    <aside 
      className={`bg-[#10141C] border-r border-[#232A39] flex flex-col justify-between shrink-0 select-none transition-all duration-300 ease-in-out relative z-20 h-full overflow-hidden ${
        isCollapsed ? 'w-16' : 'w-56 lg:w-60'
      }`}
    >
      
      {/* Top Section: Nav items + Collapse Toggle */}
      <div>
        {/* Header / Collapse Bar */}
        <div className={`p-3 border-b border-[#232A39]/60 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && (
            <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-wider font-semibold truncate">
              Operations Core
            </span>
          )}
          
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-[#7A869C] hover:text-white hover:bg-[#1A2230] border border-transparent hover:border-[#2B3548] transition-all"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            aria-label={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-[#FF7A00]" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-[#FF7A00]" />
            )}
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1.5 p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            const isSlack = item.id === 'slack';
            const isWarRoom = item.id === 'war-room';
            const isAlertPool = item.id === 'alert-pool';

            const handleClick = () => {
              if (item.action) {
                item.action();
              } else {
                setActiveNav(item.id);
              }
            };

            return (
              <button
                key={item.id}
                onClick={handleClick}
                title={isCollapsed ? `${item.label} ${item.count ? `(${item.count})` : ''}` : undefined}
                className={`w-full flex items-center rounded-lg text-xs font-mono font-medium transition-all text-left relative group ${
                  isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'
                } ${
                  isSlack 
                    ? 'text-emerald-400 hover:text-white hover:bg-[#172420] border border-emerald-900/30' 
                    : isWarRoom
                      ? 'text-blue-400 hover:text-white hover:bg-[#131F33] border border-blue-900/30'
                      : isAlertPool && isActive
                        ? 'bg-red-500/15 text-red-400 font-bold border-l-2 border-red-500 shadow-[0_2px_12px_rgba(239,68,68,0.15)]'
                        : isAlertPool && activeAlertCount > 0
                          ? 'text-red-400/90 hover:text-red-300 hover:bg-[#1F171A]'
                          : isActive
                            ? 'bg-[#FF7A00]/15 text-[#FF7A00] font-bold border-l-2 border-[#FF7A00] shadow-[0_2px_12px_rgba(255,122,0,0.12)]'
                            : 'text-[#8893A8] hover:text-white hover:bg-[#161C26]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${
                    isSlack 
                      ? 'text-emerald-400 group-hover:scale-110 transition-transform' 
                      : isWarRoom
                        ? 'text-blue-400 group-hover:scale-110 transition-transform'
                        : isAlertPool && activeAlertCount > 0
                          ? 'text-red-400 animate-pulse'
                          : isActive 
                            ? 'text-[#FF7A00]' 
                            : 'text-[#626D82]'
                  }`} />
                  {!isCollapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    {item.isExternal && (
                      <ExternalLink className={`w-3 h-3 ${isWarRoom ? 'text-blue-400/80' : 'text-emerald-400/70'}`} />
                    )}
                    {item.count && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold font-mono tracking-wider ${
                        isSlack 
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                          : isWarRoom
                            ? 'bg-blue-950 text-blue-300 border border-blue-800/60'
                            : isAlertPool && activeAlertCount > 0
                              ? isActive 
                                ? 'bg-red-500 text-white' 
                                : 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                              : isActive 
                                ? 'bg-[#FF7A00] text-white' 
                                : 'bg-[#222A3A] text-gray-300'
                      }`}>
                        {item.count}
                      </span>
                    )}
                  </div>
                )}

                {/* Collapsed dot / badge */}
                {isCollapsed && item.count && (
                  <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
                    isSlack 
                      ? 'bg-emerald-400 shadow-[0_0_6px_#10B981]' 
                      : isWarRoom
                        ? 'bg-blue-400 shadow-[0_0_6px_#3B82F6]'
                        : isAlertPool && activeAlertCount > 0
                          ? 'bg-red-500 shadow-[0_0_6px_#EF4444] animate-ping'
                          : 'bg-[#FF7A00] shadow-[0_0_6px_#FF7A00]'
                  }`} />
                )}

                {/* Hover Tooltip when collapsed */}
                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-2.5 py-1 bg-[#151A24] border border-[#2B3548] text-white text-[11px] font-mono rounded-md shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 flex items-center gap-1.5">
                    <span>{item.label}</span>
                    {item.isExternal && (
                      <ExternalLink className={`w-3 h-3 ${isWarRoom ? 'text-blue-400' : 'text-emerald-400'}`} />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom GreyOrange Facility Telemetry Card with direct Slack launcher */}
      <div className="p-2 border-t border-[#232A39]/60">
        {!isCollapsed ? (
          <div className="p-3 rounded-xl bg-[#141923] border border-[#232A39] shadow-inner space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#6A758B] uppercase tracking-wider font-semibold">
                Active Hub
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                <Radio className="w-3 h-3 animate-pulse" />
                LIVE
              </span>
            </div>

            <div>
              <div className="font-mono font-extrabold text-[#FF7A00] text-sm tracking-tight truncate">
                {currentSiteObj.name}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#8893A8] font-mono mt-0.5">
                <MapPin className="w-3 h-3 text-[#FF7A00] shrink-0" />
                <span className="truncate">{currentSiteObj.code} • {currentSiteObj.region}</span>
              </div>
            </div>

            {/* Direct Slack Channel Action Button */}
            <button
              onClick={openSiteSlack}
              className="w-full flex items-center justify-between gap-1.5 py-1.5 px-2.5 rounded-lg bg-[#11241C] hover:bg-[#163024] border border-emerald-500/40 text-emerald-400 hover:text-emerald-200 text-[11px] font-mono font-semibold transition-all group shadow-sm"
              title={`Open Slack channel: ${siteIntelligence?.slackChannelName || '#ops-site'}`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
                <span className="truncate">{siteIntelligence?.slackChannelName || 'Slack Channel'}</span>
              </div>
              <ExternalLink className="w-3 h-3 opacity-70 group-hover:opacity-100 shrink-0" />
            </button>

            {/* Ranger Bot fleet micro-stat */}
            <div className="pt-2 border-t border-[#1F2636] flex items-center justify-between text-[10px] font-mono text-[#788399]">
              <div className="flex items-center gap-1">
                <Bot className="w-3 h-3 text-[#FF7A00]" />
                <span>142 Bots</span>
              </div>
              <div className="flex items-center gap-1 text-emerald-400">
                <BatteryCharging className="w-3 h-3" />
                <span>98%</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-[#141923] border border-[#232A39] text-center gap-1.5" title={`Active: ${currentSiteObj.name}`}>
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-[9px] font-mono font-bold text-[#FF7A00] truncate max-w-[44px]">
              {currentSiteObj.code}
            </span>
            <button 
              onClick={openSiteSlack} 
              className="p-1 rounded bg-[#11241C] text-emerald-400 hover:text-white"
              title={`Open Slack: ${siteIntelligence?.slackChannelName}`}
            >
              <MessageSquare className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

    </aside>
  );
};
