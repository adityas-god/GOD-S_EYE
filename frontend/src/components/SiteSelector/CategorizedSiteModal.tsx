import React, { useState } from 'react';
import { 
  X, 
  Search, 
  MapPin, 
  Check, 
  ArrowRight, 
  Bot, 
  Layers, 
  Zap, 
  Package, 
  Boxes 
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { SiteCategory, EnterpriseSite } from '../../types/sites';

interface CategorizedSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_METADATA: Record<SiteCategory, { title: string; subtitle: string; icon: any; color: string; badge: string }> = {
  RTP_TTP: {
    title: 'RTP / TTP Sites',
    subtitle: 'Robotic Throughput & Turnaround Processing',
    icon: Layers,
    color: 'from-[#FF7A00]/20 to-[#E05E00]/10 border-[#FF7A00]/40 text-[#FF7A00]',
    badge: '61 Sites'
  },
  RMS: {
    title: 'RMS (Ranger Mobile System)',
    subtitle: 'High-Density Mobile Robot Fleet System',
    icon: Bot,
    color: 'from-blue-500/20 to-blue-700/10 border-blue-500/40 text-blue-400',
    badge: '14 Sites'
  },
  RA: {
    title: 'RA (Ranger Autonomous)',
    subtitle: 'Autonomous Guided Pallet & Tote Movers',
    icon: Zap,
    color: 'from-purple-500/20 to-purple-700/10 border-purple-500/40 text-purple-400',
    badge: '3 Sites'
  },
  RIL: {
    title: 'RIL (Ranger In-Line)',
    subtitle: 'Conveyor & In-Line Sorter Integrated Hubs',
    icon: Package,
    color: 'from-emerald-500/20 to-emerald-700/10 border-emerald-500/40 text-emerald-400',
    badge: '12 Sites'
  },
  CASE_PICK: {
    title: 'Case Pick',
    subtitle: 'High-Throughput Case & Pallet Picking',
    icon: Boxes,
    color: 'from-amber-500/20 to-amber-700/10 border-amber-500/40 text-amber-400',
    badge: '2 Sites'
  }
};

export const CategorizedSiteModal: React.FC<CategorizedSiteModalProps> = ({ isOpen, onClose }) => {
  const { 
    selectedCategory, 
    setSelectedCategory, 
    selectedSite, 
    setSelectedSite, 
    groupedSites 
  } = useDashboard();

  const [activeTab, setActiveTab] = useState<SiteCategory>(selectedCategory || 'RTP_TTP');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpen) return null;

  const sitesInActiveCategory = groupedSites[activeTab] || [];
  const filteredSites = sitesInActiveCategory.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.region.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categoriesList: SiteCategory[] = ['RTP_TTP', 'RMS', 'RA', 'RIL', 'CASE_PICK'];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-5 animate-in fade-in">
      <div className="bg-[#10141C] border border-[#2B3548] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-mono">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#232A39] flex items-center justify-between bg-[#121620]">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF7A00]" />
              <h2 className="text-sm sm:text-base font-extrabold text-white uppercase tracking-wider">
                Select Facility — Click Category & Continue
              </h2>
            </div>
            <p className="text-[11px] text-[#717E95] mt-0.5">
              Choose a product line category on the left, then select the particular site under it.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1A2230] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2-Tier Content: Step 1 (Categories) on Left, Step 2 (Sites) on Right */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* STEP 1: Categories Column */}
          <div className="w-full md:w-80 bg-[#0E121A] border-r border-[#232A39] p-3 sm:p-4 overflow-y-auto space-y-2 shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#677389] px-2 pb-1">
              Step 1: Choose Category
            </div>

            {categoriesList.map(cat => {
              const meta = CATEGORY_METADATA[cat];
              const Icon = meta.icon;
              const isSelected = activeTab === cat;
              const count = groupedSites[cat]?.length || 0;

              return (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveTab(cat);
                    setSelectedCategory(cat);
                  }}
                  className={`w-full p-3 rounded-xl border text-left transition-all duration-150 relative group flex items-center justify-between ${
                    isSelected
                      ? 'bg-[#18202D] border-[#FF7A00] shadow-[0_0_15px_rgba(255,122,0,0.2)] ring-1 ring-[#FF7A00]'
                      : 'bg-[#131822] border-[#222938] hover:border-[#354157] hover:bg-[#161C28]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg bg-[#181F2C] border flex items-center justify-center shrink-0 ${meta.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold truncate ${isSelected ? 'text-[#FF7A00]' : 'text-white'}`}>
                          {meta.title}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#69758C] truncate">
                        {count} Facilities
                      </div>
                    </div>
                  </div>

                  <ArrowRight className={`w-4 h-4 text-[#5A667C] transition-transform ${isSelected ? 'text-[#FF7A00] translate-x-1' : 'group-hover:translate-x-0.5'}`} />
                </button>
              );
            })}
          </div>

          {/* STEP 2: Sites List Under Selected Category */}
          <div className="flex-1 flex flex-col bg-[#10141C] p-3 sm:p-4 overflow-hidden">
            
            {/* Search & Filter Header */}
            <div className="pb-3 border-b border-[#232A39] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#677389]">
                  Step 2: Select Particular Site in
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-[#FF7A00]/15 text-[#FF7A00] font-bold border border-[#FF7A00]/30">
                  {CATEGORY_METADATA[activeTab]?.title}
                </span>
              </div>

              {/* Search filter */}
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 text-[#657187] absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder={`Search ${filteredSites.length} sites...`}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-[#151A24] text-gray-200 text-xs pl-8 pr-3 py-1.5 rounded-lg border border-[#273246] focus:border-[#FF7A00] outline-none placeholder-[#545E73]"
                />
              </div>
            </div>

            {/* Sites Grid */}
            <div className="flex-1 overflow-y-auto mt-3 pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredSites.length === 0 ? (
                <div className="col-span-2 py-12 text-center text-[#6A768D] text-xs">
                  No facilities found matching "{searchQuery}"
                </div>
              ) : (
                filteredSites.map(s => {
                  const isCurrent = selectedSite === s.id;

                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedSite(s.id);
                        onClose();
                      }}
                      className={`p-3 rounded-xl border text-left transition-all duration-150 flex items-center justify-between group ${
                        isCurrent
                          ? 'bg-[#1C2332] border-[#FF7A00] shadow-[0_0_12px_rgba(255,122,0,0.22)] ring-1 ring-[#FF7A00]'
                          : 'bg-[#131822] border-[#222938] hover:border-[#3A475F] hover:bg-[#161C28]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isCurrent ? 'bg-[#FF7A00] text-white' : 'bg-[#1A2230] text-[#7E8B9E] group-hover:text-white'
                        }`}>
                          <MapPin className="w-4 h-4" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-bold truncate ${isCurrent ? 'text-[#FF7A00]' : 'text-gray-200 group-hover:text-white'}`}>
                              {s.name}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#69758C] flex items-center gap-2">
                            <span>{s.code}</span>
                            <span>•</span>
                            <span className="truncate">{s.region}</span>
                          </div>
                        </div>
                      </div>

                      {isCurrent ? (
                        <span className="w-5 h-5 rounded-full bg-[#FF7A00] text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                          <Check className="w-3 h-3" />
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#5A667C] group-hover:text-[#FF7A00] font-bold">
                          Select →
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-[#232A39] bg-[#121620] flex items-center justify-between text-xs text-[#6A758C]">
          <span>Selected Site: <strong className="text-white">{filteredSites.find(s => s.id === selectedSite)?.name || selectedSite}</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#FF7A00] hover:bg-[#FF8B21] text-white font-bold transition-all shadow-md"
          >
            Continue to Dashboard
          </button>
        </div>

      </div>
    </div>
  );
};
