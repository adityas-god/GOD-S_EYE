import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  Plus, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Tag 
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { SopCategory, SiteSopAttachment } from '../../types/sites';

export const SopLibraryView: React.FC = () => {
  const { 
    sops, 
    deleteSop, 
    openAttachSopModal, 
    currentSiteObj, 
    selectedSite, 
    setSelectedSite, 
    allEnterpriseSites
  } = useDashboard();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'ALL' | SopCategory>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter SOPs for current site or global, plus search and category tab
  const filteredSops = useMemo(() => {
    return sops.filter(item => {
      // Show SOPs matching current site or Global (ALL)
      const matchesSite = item.siteId === currentSiteObj.id || item.siteId === 'ALL';
      if (!matchesSite) return false;

      // Category filter
      if (selectedCategoryTab !== 'ALL' && item.category !== selectedCategoryTab) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.subsystem.toLowerCase().includes(q) ||
          item.documentUrl.toLowerCase().includes(q) ||
          (item.associatedKey ? item.associatedKey.toLowerCase().includes(q) : false)
        );
      }

      return true;
    });
  }, [sops, currentSiteObj.id, selectedCategoryTab, searchTerm]);

  const handleCopyLink = (sop: SiteSopAttachment) => {
    if (sop.documentUrl) {
      navigator.clipboard.writeText(sop.documentUrl);
      setCopiedId(sop.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (window.confirm(`Delete SOP: "${title}"?`)) {
      await deleteSop(id);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'SEV1':
        return <span className="px-1.5 py-0.2 rounded bg-[#FF5E00] text-white text-[9px] font-bold">SEV 1</span>;
      case 'SEV2':
        return <span className="px-1.5 py-0.2 rounded bg-[#384252] text-white border border-[#4F5D73] text-[9px] font-bold">SEV 2</span>;
      case 'SEV3':
        return <span className="px-1.5 py-0.2 rounded bg-[#707D93] text-white text-[9px] font-bold">SEV 3</span>;
      default:
        return <span className="px-1.5 py-0.2 rounded bg-[#1A2230] text-[#CBD5E1] border border-[#2B3548] text-[9px] font-bold">ALL</span>;
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#090A0E] text-[#F3F4F6] font-mono overflow-hidden select-none">
      
      {/* 1. Header Toolbar */}
      <div className="p-3 sm:p-4 bg-[#0F1218] border-b border-[#1E2430] flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        {/* Title & Current Site */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FF5E00] flex items-center justify-center text-white shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-sm uppercase tracking-wider text-white">
                SOP Portal
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#131722] text-[#FF5E00] border border-[#1E2430] font-bold">
                {currentSiteObj.code}
              </span>
            </div>
            <div className="text-[10px] text-[#76839A] mt-0.5">
              {currentSiteObj.name} • {filteredSops.length} Attached
            </div>
          </div>
        </div>

        {/* Site Switcher + Action Button */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={selectedSite}
            onChange={e => setSelectedSite(e.target.value)}
            className="bg-[#131722] text-gray-200 text-xs px-2.5 py-1.5 rounded-lg border border-[#1E2430] focus:border-[#FF5E00] focus:outline-none cursor-pointer max-w-[190px] truncate"
          >
            {allEnterpriseSites.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>

          <button
            onClick={() => openAttachSopModal({ siteId: currentSiteObj.id })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF5E00] hover:bg-[#FF7522] text-white text-xs font-bold transition-all shadow-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Attach SOP</span>
          </button>
        </div>

      </div>

      {/* 2. Compact Search & Category Filter Bar */}
      <div className="p-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
        
        {/* Filter Pills */}
        <div className="flex items-center bg-[#0F1218] rounded-lg border border-[#1E2430] p-0.5 text-xs">
          <button
            onClick={() => setSelectedCategoryTab('ALL')}
            className={`px-3 py-1 rounded-md font-bold transition-all ${
              selectedCategoryTab === 'ALL'
                ? 'bg-[#18202D] text-white border border-[#2B3548]'
                : 'text-[#76839A] hover:text-white'
            }`}
          >
            All ({filteredSops.length})
          </button>
          <button
            onClick={() => setSelectedCategoryTab('ALERT')}
            className={`px-3 py-1 rounded-md font-bold transition-all ${
              selectedCategoryTab === 'ALERT'
                ? 'bg-[#FF5E00] text-white'
                : 'text-[#76839A] hover:text-[#FF5E00]'
            }`}
          >
            Alert SOPs
          </button>
          <button
            onClick={() => setSelectedCategoryTab('SITE_INCIDENT')}
            className={`px-3 py-1 rounded-md font-bold transition-all ${
              selectedCategoryTab === 'SITE_INCIDENT'
                ? 'bg-[#384252] text-white border border-[#4F5D73]'
                : 'text-[#76839A] hover:text-white'
            }`}
          >
            Site Incidents
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-[#657187] absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search SOPs..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-[#0F1218] text-gray-200 text-xs pl-8 pr-3 py-1.5 rounded-lg border border-[#1E2430] focus:border-[#FF5E00] focus:outline-none placeholder-[#545E73]"
          />
        </div>

      </div>

      {/* 3. SOP Cards / List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {filteredSops.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center p-6 text-center rounded-xl bg-[#0F1218] border border-[#1E2430] space-y-2">
            <BookOpen className="w-8 h-8 text-[#657187] opacity-50" />
            <div className="text-xs font-bold text-gray-300">
              No SOPs attached for {currentSiteObj.name}
            </div>
            <button
              onClick={() => openAttachSopModal({ siteId: currentSiteObj.id })}
              className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF5E00] hover:bg-[#FF7522] text-white text-xs font-bold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Attach SOP</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {filteredSops.map(sop => {
              const isCopied = copiedId === sop.id;

              return (
                <div
                  key={sop.id}
                  className="surface-card rounded-xl p-3 flex flex-col justify-between border border-[#1E2430] bg-[#0F1218] hover:border-[#2C384D] transition-all"
                >
                  <div>
                    {/* Header: Badges */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                          sop.category === 'ALERT'
                            ? 'bg-[#FF5E00]/15 text-[#FF5E00] border border-[#FF5E00]/30'
                            : 'bg-[#384252]/50 text-gray-200 border border-[#384252]'
                        }`}>
                          {sop.category === 'ALERT' ? 'ALERT' : 'INCIDENT'}
                        </span>
                        {getSeverityBadge(sop.severity)}
                        <span className="text-[9.5px] text-[#76839A] font-bold">
                          {sop.subsystem}
                        </span>
                      </div>

                      {sop.associatedKey && (
                        <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-[#1A2230] text-[#FF5E00] border border-[#FF5E00]/20 font-bold flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          <span>{sop.associatedKey}</span>
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-xs sm:text-sm font-bold text-white leading-snug line-clamp-2">
                      {sop.title}
                    </h3>

                    {/* Description (concise) */}
                    {sop.description && (
                      <p className="text-[11px] text-[#8E9BAC] mt-1 line-clamp-2">
                        {sop.description}
                      </p>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 mt-2 border-t border-[#1E2430] flex items-center justify-between gap-2">
                    <span className="text-[9px] text-[#55637A] truncate max-w-[120px]">
                      {sop.siteCode || 'GLOBAL'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopyLink(sop)}
                        className="p-1 rounded-md bg-[#131722] hover:bg-[#181D2B] text-gray-400 hover:text-white border border-[#1E2430]"
                        title="Copy URL"
                      >
                        {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>

                      <button
                        onClick={() => handleDelete(sop.id, sop.title)}
                        className="p-1 rounded-md bg-[#131722] hover:bg-red-950/60 text-gray-400 hover:text-red-400 border border-[#1E2430]"
                        title="Delete SOP"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>

                      <a
                        href={sop.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FF5E00] hover:bg-[#FF7522] text-white text-[11px] font-bold transition-all"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
