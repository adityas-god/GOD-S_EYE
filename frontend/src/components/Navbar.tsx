import React, { useState, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { 
  ChevronDown, 
  Settings, 
  Search
} from 'lucide-react';
import { SiteCategory } from '../types/sites';
import { CategorizedSiteModal } from './SiteSelector/CategorizedSiteModal';

interface NavbarProps {
  onOpenAdminModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAdminModal }) => {
  const { 
    selectedCategory,
    setSelectedCategory,
    availableSitesForCategory,
    selectedSite, 
    setSelectedSite, 
    currentSiteObj,
    isAdminMode, 
    setIsAdminMode 
  } = useDashboard();

  const [currentTime, setCurrentTime] = useState<string>('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  const getTimezoneLabel = () => {
    const tz = currentSiteObj?.timezone || 'America/New_York';
    if (tz.includes('New_York') || tz.includes('Toronto')) return 'EDT';
    if (tz.includes('Chicago') || tz.includes('Mexico_City')) return 'CDT';
    if (tz.includes('Denver')) return 'MDT';
    if (tz.includes('Los_Angeles') || tz.includes('Phoenix')) return 'PDT';
    if (tz.includes('Santiago') || tz.includes('Bogota')) return 'CLT';
    if (tz.includes('Tokyo') || tz.includes('Seoul')) return 'KST/JST';
    if (tz.includes('London')) return 'BST';
    if (tz.includes('Berlin') || tz.includes('Amsterdam') || tz.includes('Rome')) return 'CEST';
    return 'UTC';
  };

  return (
    <header className="h-12 bg-[#0E121A] border-b border-[#1E2533] px-4 sm:px-6 flex items-center justify-between z-30 select-none sticky top-0">
      
      {/* LEFT: Brand + Streamlined Site Switcher */}
      <div className="flex items-center gap-3 sm:gap-4">
        
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#FF7A00] flex items-center justify-center text-white font-mono font-black text-xs shadow-[0_0_10px_rgba(255,122,0,0.3)]">
            GO
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-extrabold text-sm tracking-wide text-white">
              GREY<span className="text-[#FF7A00]">ORANGE</span>
            </span>
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#FF7A00]/15 text-[#FF7A00] border border-[#FF7A00]/30 font-bold">
              OPS
            </span>
          </div>
        </div>

        <div className="h-4 w-px bg-[#1E2533]" />

        {/* Category Dropdown */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as SiteCategory)}
            className="appearance-none bg-[#141923] hover:bg-[#1A2230] text-[#FF7A00] text-xs font-mono font-bold pl-2.5 pr-6 py-1 rounded-md border border-[#232A39] hover:border-[#FF7A00]/50 focus:border-[#FF7A00] focus:outline-none cursor-pointer transition-colors"
          >
            <option value="RTP_TTP">RTP / TTP (61)</option>
            <option value="RMS">RMS (14)</option>
            <option value="RA">RA (3)</option>
            <option value="RIL">RIL (12)</option>
            <option value="CASE_PICK">Case Pick (2)</option>
          </select>
          <ChevronDown className="w-3 h-3 text-[#FF7A00] absolute right-1.5 top-2 pointer-events-none" />
        </div>

        {/* Site Dropdown */}
        <div className="relative">
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="appearance-none bg-[#141923] hover:bg-[#1A2230] text-gray-200 text-xs font-mono font-medium pl-2.5 pr-6 py-1 rounded-md border border-[#232A39] hover:border-[#FF7A00]/50 focus:border-[#FF7A00] focus:outline-none cursor-pointer transition-colors max-w-[180px] sm:max-w-[240px] truncate"
          >
            {availableSitesForCategory.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 top-2 pointer-events-none" />
        </div>

        {/* Quick Search Dialog Button */}
        <button
          onClick={() => setIsCategoryModalOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#141923] hover:bg-[#1A2230] text-gray-400 hover:text-[#FF7A00] border border-[#232A39] text-xs font-mono transition-colors"
          title="Search all 80+ enterprise sites"
        >
          <Search className="w-3 h-3" />
          <span className="hidden lg:inline text-[10px]">Search Sites</span>
        </button>
      </div>

      {/* RIGHT: Live Time + Admin */}
      <div className="flex items-center gap-3">
        
        {/* Simple Live Clock */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-gray-400 bg-[#141923] px-2.5 py-1 rounded-md border border-[#1E2533]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-gray-200 font-medium">{currentTime || '12:00 PM'}</span>
          <span className="text-[10px] text-gray-500 font-bold">{getTimezoneLabel()}</span>
        </div>

        {/* Admin Button */}
        <button
          onClick={() => {
            setIsAdminMode(!isAdminMode);
            onOpenAdminModal();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#181F2C] hover:bg-[#202A3C] text-gray-300 hover:text-white border border-[#263145] hover:border-[#FF7A00]/50 text-xs font-mono transition-all"
          title="Configure Dashboard Settings"
        >
          <Settings className="w-3 h-3 text-[#FF7A00]" />
          <span className="font-semibold">Admin</span>
        </button>

      </div>

      {/* Categorized Site Explorer Modal */}
      <CategorizedSiteModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
      />

    </header>
  );
};
