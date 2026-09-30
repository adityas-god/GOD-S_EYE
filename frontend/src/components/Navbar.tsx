import React, { useState, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { 
  ChevronDown, 
  Settings, 
  Search,
  MapPin,
  Layers,
  User
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
  const [searchFilter, setSearchFilter] = useState<string>('');

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
    <header className="h-12 bg-[#090A0E] border-b border-[#1E2430] px-3 sm:px-4 flex items-center justify-between z-30 select-none sticky top-0 font-sans">
      
      {/* LEFT: Official Brand Logo from Image 2 + Category & Site Switchers */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        
        {/* GreyOrange Official Logo in Top-Left Corner */}
        <div 
          onClick={() => setIsCategoryModalOpen(true)}
          className="flex items-center cursor-pointer py-1 pr-1 group"
          title="GreyOrange Operations Portal"
        >
          <img 
            src="/greyorange-logo.svg" 
            alt="GreyOrange" 
            className="h-6 sm:h-7 w-auto object-contain transition-opacity group-hover:opacity-90"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/favicon.svg';
            }}
          />
        </div>

        {/* Category Pill Dropdown */}
        <div className="relative">
          <div className="flex items-center gap-1.5 bg-[#131722] hover:bg-[#181D2B] text-[#FF5E00] text-xs font-semibold pl-2.5 pr-6 py-1 rounded-lg border border-[#202738] transition-colors cursor-pointer">
            <Layers className="w-3.5 h-3.5 text-[#FF5E00] shrink-0 pointer-events-none" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as SiteCategory)}
              className="appearance-none bg-transparent text-[#FF5E00] focus:outline-none cursor-pointer pr-1"
            >
              <option value="RTP_TTP" className="bg-[#10141D] text-white">RTP / TTP (61)</option>
              <option value="RMS" className="bg-[#10141D] text-white">RMS (14)</option>
              <option value="RA" className="bg-[#10141D] text-white">RA (3)</option>
              <option value="RIL" className="bg-[#10141D] text-white">RIL (12)</option>
              <option value="CASE_PICK" className="bg-[#10141D] text-white">Case Pick (2)</option>
            </select>
          </div>
          <ChevronDown className="w-3 h-3 text-[#FF5E00] absolute right-2 top-2.5 pointer-events-none" />
        </div>

        {/* Site Pill Dropdown */}
        <div className="relative">
          <div className="flex items-center gap-1.5 bg-[#131722] hover:bg-[#181D2B] text-gray-200 text-xs font-medium pl-2.5 pr-6 py-1 rounded-lg border border-[#202738] transition-colors cursor-pointer max-w-[170px] sm:max-w-[220px]">
            <MapPin className="w-3 h-3 text-[#76839A] shrink-0 pointer-events-none" />
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="appearance-none bg-transparent text-gray-200 focus:outline-none cursor-pointer truncate w-full"
            >
              {availableSitesForCategory.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#10141D] text-white">
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
          <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 top-2.5 pointer-events-none" />
        </div>

      </div>

      {/* CENTER: Exact Search Input from Reference Dashboard */}
      <div className="flex-1 max-w-sm lg:max-w-md mx-3 relative hidden md:block">
        <Search className="w-3.5 h-3.5 text-[#657187] absolute left-3 top-2.5 pointer-events-none" />
        <input
          type="text"
          placeholder="Search sites, bots, racks, incidents..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          onClick={() => setIsCategoryModalOpen(true)}
          className="w-full bg-[#131722] text-gray-200 text-xs pl-8 pr-3 py-1.5 rounded-lg border border-[#202738] focus:border-[#FF5E00] focus:outline-none placeholder-[#545E73] cursor-pointer"
        />
      </div>

      {/* RIGHT: Live Clock + Settings + Admin User Dropdown */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        
        {/* Live Status & Clock */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-gray-300 px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="font-semibold text-gray-200">{currentTime || '06:43 AM'}</span>
          <span className="text-[10px] text-[#76839A] font-medium">{getTimezoneLabel()}</span>
        </div>

        {/* Settings Icon */}
        <button
          onClick={() => {
            setIsAdminMode(!isAdminMode);
            onOpenAdminModal();
          }}
          className="p-1.5 text-[#76839A] hover:text-white hover:bg-[#151924] rounded-lg transition-colors"
          title="Configure Dashboard Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Admin Dropdown */}
        <button
          onClick={() => {
            setIsAdminMode(!isAdminMode);
            onOpenAdminModal();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#131722] hover:bg-[#181D2B] text-gray-300 hover:text-white border border-[#202738] text-xs transition-colors"
          title="Admin Profile"
        >
          <User className="w-3 h-3 text-[#76839A]" />
          <span className="font-medium text-gray-200">Admin</span>
          <ChevronDown className="w-2.5 h-2.5 text-gray-400" />
        </button>

      </div>

      {/* Facility / Site Selection Modal */}
      <CategorizedSiteModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
      />

    </header>
  );
};
