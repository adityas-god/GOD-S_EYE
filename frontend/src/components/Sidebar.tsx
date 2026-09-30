import React from 'react';
import { 
  LayoutGrid, 
  ClipboardList,
  Calendar as CalendarIcon,
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
      icon: CalendarIcon, 
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
      className={`bg-[#090A0E] border-r border-[#1E2430] flex flex-col justify-between shrink-0 select-none transition-all duration-300 ease-in-out relative z-20 h-full overflow-hidden ${
        isCollapsed ? 'w-16' : 'w-56 lg:w-60'
      }`}
    >
      
      {/* Top Section: Nav items + Collapse Toggle */}
      <div>
        {/* Header / Collapse Bar */}
        <div className={`p-3 border-b border-[#1E2430] flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && (
            <span className="text-[10px] font-mono text-[#7A8396] uppercase tracking-wider font-semibold truncate">
              Operations Core
            </span>
          )}
          
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-[#7A869C] hover:text-white hover:bg-[#131722] border border-transparent hover:border-[#1E2430] transition-all"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            aria-label={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-[#FF5E00]" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-[#FF5E00]" />
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
                className={`w-full flex items-center rounded-xl text-xs font-medium transition-all text-left relative group ${
                  isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'
                } ${
                  isSlack 
                    ? 'text-emerald-400 hover:text-white hover:bg-[#121B17] border border-emerald-900/30' 
                    : isWarRoom
                      ? 'text-blue-400 hover:text-white hover:bg-[#121824] border border-blue-900/30'
                      : isAlertPool && isActive
                        ? 'bg-red-500 text-white font-bold'
                        : isAlertPool && activeAlertCount > 0
                          ? 'text-red-400 hover:text-red-300 hover:bg-[#1F1418]'
                          : isActive
                            ? 'bg-[#FF5E00] text-white font-bold rounded-lg'
                            : 'text-[#8E95A5] hover:text-white hover:bg-[#131722]'
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
                            ? 'text-white' 
                            : 'text-[#727B8E]'
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
                                ? 'bg-red-600 text-white' 
                                : 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                              : isActive 
                                ? 'bg-white/20 text-white' 
                                : 'bg-[#181A22] text-gray-300 border border-white/[0.04]'
                      }`}>
                        {item.count}
                      </span>
                    )}
                  </div>
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
      <div className="p-2 border-t border-[#1E2430]">
        {!isCollapsed ? (
          <div className="p-3 rounded-xl bg-[#0F1218] border border-[#1E2430] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#7B8599] uppercase tracking-wider font-semibold">
                Active Hub
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                <Radio className="w-3 h-3 text-emerald-400" />
                LIVE
              </span>
            </div>

            <div>
              <div className="font-extrabold text-[#FF5E00] text-sm tracking-tight truncate">
                {currentSiteObj.name}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#8E95A5] font-mono mt-0.5">
                <MapPin className="w-3 h-3 text-[#FF5E00] shrink-0" />
                <span className="truncate">{currentSiteObj.code} • {currentSiteObj.region}</span>
              </div>
            </div>

            {/* Direct Slack Channel Action Button */}
            <button
              onClick={openSiteSlack}
              className="w-full flex items-center justify-between gap-1.5 py-1.5 px-2.5 rounded-lg bg-[#111C17] hover:bg-[#15251F] border border-emerald-500/30 text-emerald-400 hover:text-emerald-200 text-[11px] font-semibold transition-all group"
              title={`Open Slack channel: ${siteIntelligence?.slackChannelName || '#ops-site'}`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
                <span className="truncate">{siteIntelligence?.slackChannelName || 'Slack Channel'}</span>
              </div>
              <ExternalLink className="w-3 h-3 opacity-70 group-hover:opacity-100 shrink-0" />
            </button>

            {/* Ranger Bot fleet micro-stat */}
            <div className="pt-2 border-t border-[#1E2430] flex items-center justify-between text-[10px] font-mono text-[#788399]">
              <div className="flex items-center gap-1">
                <Bot className="w-3 h-3 text-[#FF5E00]" />
                <span>142 Bots</span>
              </div>
              <div className="flex items-center gap-1 text-emerald-400">
                <BatteryCharging className="w-3 h-3" />
                <span>98%</span>
              </div>
            </div>
          </div>
          <div 
            onClick={openSiteSlack}
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-[#0F1218] border border-[#1E2430] hover:border-[#2E3748] text-center gap-1.5 cursor-pointer transition-colors" 
            title={`Active: ${currentSiteObj.name} (${currentSiteObj.code}) — Click for Slack`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[8px] font-mono font-bold text-gray-200 tracking-tight">
              {currentSiteObj.code}
            </span>
            <div className="w-3 flex flex-col justify-center gap-0.5 opacity-50">
              <span className="h-[1.5px] w-full bg-gray-400 rounded-full" />
              <span className="h-[1.5px] w-2/3 bg-gray-400 rounded-full mx-auto" />
            </div>
          </div>
        )}
      </div>

    </aside>
  );
};
