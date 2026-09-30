import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  Plus, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Filter, 
  AlertTriangle, 
  Building2, 
  Layers, 
  FileText, 
  CheckCircle2, 
  Sparkles, 
  Tag, 
  Clock, 
  User, 
  ShieldAlert 
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
    allEnterpriseSites,
    groupedSites,
    selectedCategory,
    setSelectedCategory
  } = useDashboard();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'ALL' | SopCategory>('ALL');
  const [selectedSubsystemFilter, setSelectedSubsystemFilter] = useState<string>('ALL');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>('ALL');
  const [siteScope, setSiteScope] = useState<'CURRENT' | 'ALL' | 'SPECIFIC'>('CURRENT');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Subsystems derived from existing SOPs
  const availableSubsystems = useMemo(() => {
    const set = new Set<string>();
    sops.forEach(s => {
      if (s.subsystem) set.add(s.subsystem);
    });
    return Array.from(set);
  }, [sops]);

  // Filter SOPs based on Site, Category, Search, Subsystem, and Severity
  const filteredSops = useMemo(() => {
    return sops.filter(item => {
      // Site scope filtering
      if (siteScope === 'CURRENT') {
        const matchesCurrent = item.siteId === currentSiteObj.id || item.siteId === 'ALL';
        if (!matchesCurrent) return false;
      }

      // Category tab filtering
      if (selectedCategoryTab !== 'ALL' && item.category !== selectedCategoryTab) {
        return false;
      }

      // Subsystem filtering
      if (selectedSubsystemFilter !== 'ALL' && item.subsystem !== selectedSubsystemFilter) {
        return false;
      }

      // Severity filtering
      if (selectedSeverityFilter !== 'ALL' && item.severity !== selectedSeverityFilter) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesSubsystem = item.subsystem.toLowerCase().includes(q);
        const matchesUrl = item.documentUrl.toLowerCase().includes(q);
        const matchesKey = item.associatedKey ? item.associatedKey.toLowerCase().includes(q) : false;
        const matchesTags = item.tags ? item.tags.some(t => t.toLowerCase().includes(q)) : false;

        return matchesTitle || matchesDesc || matchesSubsystem || matchesUrl || matchesKey || matchesTags;
      }

      return true;
    });
  }, [
    sops, 
    siteScope, 
    currentSiteObj.id, 
    selectedCategoryTab, 
    selectedSubsystemFilter, 
    selectedSeverityFilter, 
    searchTerm
  ]);

  // Stats calculation
  const stats = useMemo(() => {
    const forSite = sops.filter(s => s.siteId === currentSiteObj.id || s.siteId === 'ALL');
    const alertSops = forSite.filter(s => s.category === 'ALERT').length;
    const incidentSops = forSite.filter(s => s.category === 'SITE_INCIDENT').length;
    const sev1Sops = forSite.filter(s => s.severity === 'SEV1').length;
    return {
      total: forSite.length,
      alertSops,
      incidentSops,
      sev1Sops
    };
  }, [sops, currentSiteObj.id]);

  const handleCopyLink = (sop: SiteSopAttachment) => {
    if (sop.documentUrl) {
      navigator.clipboard.writeText(sop.documentUrl);
      setCopiedId(sop.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (window.confirm(`Are you sure you want to remove the SOP attachment: "${title}"?`)) {
      await deleteSop(id);
    }
  };

  const getCategoryBadge = (cat: SopCategory) => {
    switch (cat) {
      case 'ALERT':
        return (
          <span className="px-2 py-0.5 rounded bg-[#FF5E00]/15 text-[#FF5E00] border border-[#FF5E00]/30 text-[9.5px] font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5E00]" />
            ALERT SOP
          </span>
        );
      case 'SITE_INCIDENT':
        return (
          <span className="px-2 py-0.5 rounded bg-[#384252]/50 text-gray-200 border border-[#384252] text-[9.5px] font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#384252] border border-[#556379]" />
            SITE INCIDENT
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-[#707D93]/20 text-[#CBD5E1] border border-[#707D93]/30 text-[9.5px] font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#707D93]" />
            GENERAL SOP
          </span>
        );
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'SEV1':
        return (
          <span className="px-1.5 py-0.2 rounded bg-[#FF5E00] text-white text-[9px] font-bold">
            SEV 1
          </span>
        );
      case 'SEV2':
        return (
          <span className="px-1.5 py-0.2 rounded bg-[#384252] text-white border border-[#4F5D73] text-[9px] font-bold">
            SEV 2
          </span>
        );
      case 'SEV3':
        return (
          <span className="px-1.5 py-0.2 rounded bg-[#707D93] text-white text-[9px] font-bold">
            SEV 3
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.2 rounded bg-[#1A2230] text-[#CBD5E1] border border-[#2B3548] text-[9px] font-bold">
            ALL
          </span>
        );
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#090A0E] text-[#F3F4F6] font-mono overflow-hidden select-none">
      
      {/* 1. Header Toolbar */}
      <div className="p-3 sm:p-4 bg-[#0F1218] border-b border-[#1E2430] flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        {/* Title + Facility Scope */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#FF5E00] flex items-center justify-center text-white shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-sm sm:text-base uppercase tracking-wider text-white truncate">
                SOP Attachments & Runbook Library
              </h1>
              <span className="text-[9.5px] px-2 py-0.5 rounded-lg bg-[#131722] text-[#8C98AE] border border-[#1E2430] font-bold">
                {filteredSops.length} Active
              </span>
            </div>

            <div className="flex items-center gap-2 text-[10.5px] text-[#76839A] mt-0.5 truncate">
              <span>Facility: <strong className="text-[#FF5E00]">{currentSiteObj.name}</strong> ({currentSiteObj.code})</span>
              <span>•</span>
              <span>Scope: <strong className="text-gray-200">{siteScope === 'CURRENT' ? 'Current Site & Global' : 'All Facilities'}</strong></span>
            </div>
          </div>
        </div>

        {/* Site Switcher Pill + Scope Toggle + Add Button */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Facility Switcher Dropdown */}
          <div className="relative">
            <select
              value={selectedSite}
              onChange={e => setSelectedSite(e.target.value)}
              className="bg-[#131722] text-gray-200 text-xs px-2.5 py-1.5 rounded-lg border border-[#1E2430] focus:border-[#FF5E00] focus:outline-none cursor-pointer max-w-[180px] truncate"
            >
              {allEnterpriseSites.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Toggle between Current Site vs All Sites */}
          <button
            onClick={() => setSiteScope(siteScope === 'CURRENT' ? 'ALL' : 'CURRENT')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              siteScope === 'ALL'
                ? 'bg-[#18202D] text-white border-[#2B3548]'
                : 'bg-[#131722] text-[#76839A] border-[#1E2430] hover:text-white'
            }`}
            title={siteScope === 'CURRENT' ? "Show SOPs across all facilities" : "Filter by current facility"}
          >
            {siteScope === 'CURRENT' ? 'Site View' : 'Global View'}
          </button>

          {/* Attach New SOP Action */}
          <button
            onClick={() => openAttachSopModal({ siteId: currentSiteObj.id })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF5E00] hover:bg-[#FF7522] text-white text-xs font-bold transition-all shadow-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Attach SOP</span>
          </button>

        </div>

      </div>

      {/* 2. Stat Summary Pills Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 pb-0 shrink-0">
        
        <div className="p-2.5 rounded-xl bg-[#0F1218] border border-[#1E2430] flex items-center justify-between">
          <div>
            <div className="text-[9.5px] uppercase font-bold text-[#76839A]">Total SOPs</div>
            <div className="text-base font-extrabold text-white mt-0.5">{stats.total}</div>
          </div>
          <BookOpen className="w-5 h-5 text-gray-500 opacity-60" />
        </div>

        <div className="p-2.5 rounded-xl bg-[#0F1218] border border-[#1E2430] flex items-center justify-between">
          <div>
            <div className="text-[9.5px] uppercase font-bold text-[#FF5E00]">Alert SOPs</div>
            <div className="text-base font-extrabold text-[#FF5E00] mt-0.5">{stats.alertSops}</div>
          </div>
          <AlertTriangle className="w-5 h-5 text-[#FF5E00] opacity-70" />
        </div>

        <div className="p-2.5 rounded-xl bg-[#0F1218] border border-[#1E2430] flex items-center justify-between">
          <div>
            <div className="text-[9.5px] uppercase font-bold text-[#8C98AE]">Site Incident SOPs</div>
            <div className="text-base font-extrabold text-gray-200 mt-0.5">{stats.incidentSops}</div>
          </div>
          <Layers className="w-5 h-5 text-gray-400 opacity-60" />
        </div>

        <div className="p-2.5 rounded-xl bg-[#0F1218] border border-[#1E2430] flex items-center justify-between">
          <div>
            <div className="text-[9.5px] uppercase font-bold text-red-400">Critical (SEV 1) SOPs</div>
            <div className="text-base font-extrabold text-red-400 mt-0.5">{stats.sev1Sops}</div>
          </div>
          <ShieldAlert className="w-5 h-5 text-red-400 opacity-70" />
        </div>

      </div>

      {/* 3. Search & Filter Bar */}
      <div className="p-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
        
        {/* Category Tabs */}
        <div className="flex items-center bg-[#0F1218] rounded-xl border border-[#1E2430] p-1 gap-1 text-xs">
          <button
            onClick={() => setSelectedCategoryTab('ALL')}
            className={`px-3 py-1 rounded-lg font-bold transition-all ${
              selectedCategoryTab === 'ALL'
                ? 'bg-[#18202D] text-white border border-[#2B3548]'
                : 'text-[#76839A] hover:text-white'
            }`}
          >
            All SOPs ({sops.length})
          </button>
          <button
            onClick={() => setSelectedCategoryTab('ALERT')}
            className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              selectedCategoryTab === 'ALERT'
                ? 'bg-[#FF5E00] text-white'
                : 'text-[#76839A] hover:text-[#FF5E00]'
            }`}
          >
            <span>⚡ Alert SOPs</span>
            <span className="text-[9px] px-1 py-0.1 rounded bg-black/30 font-mono">
              {sops.filter(s => s.category === 'ALERT').length}
            </span>
          </button>
          <button
            onClick={() => setSelectedCategoryTab('SITE_INCIDENT')}
            className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              selectedCategoryTab === 'SITE_INCIDENT'
                ? 'bg-[#384252] text-white border border-[#4F5D73]'
                : 'text-[#76839A] hover:text-white'
            }`}
          >
            <span>🏭 Site Incident SOPs</span>
            <span className="text-[9px] px-1 py-0.1 rounded bg-black/30 font-mono">
              {sops.filter(s => s.category === 'SITE_INCIDENT').length}
            </span>
          </button>
          <button
            onClick={() => setSelectedCategoryTab('GENERAL')}
            className={`px-3 py-1 rounded-lg font-bold transition-all ${
              selectedCategoryTab === 'GENERAL'
                ? 'bg-[#18202D] text-white border border-[#2B3548]'
                : 'text-[#76839A] hover:text-white'
            }`}
          >
            General Checklist
          </button>
        </div>

        {/* Search & Select Filters */}
        <div className="flex items-center gap-2 flex-1 max-w-lg justify-end">
          
          {/* Search Box */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-[#657187] absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search title, steps, tags, links..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[#0F1218] text-gray-200 text-xs pl-8 pr-3 py-1.5 rounded-lg border border-[#1E2430] focus:border-[#FF5E00] focus:outline-none placeholder-[#545E73]"
            />
          </div>

          {/* Subsystem Filter */}
          <select
            value={selectedSubsystemFilter}
            onChange={e => setSelectedSubsystemFilter(e.target.value)}
            className="bg-[#0F1218] text-gray-300 text-xs px-2.5 py-1.5 rounded-lg border border-[#1E2430] focus:border-[#FF5E00] focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Subsystems</option>
            {availableSubsystems.map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>

          {/* Severity Filter */}
          <select
            value={selectedSeverityFilter}
            onChange={e => setSelectedSeverityFilter(e.target.value)}
            className="bg-[#0F1218] text-gray-300 text-xs px-2.5 py-1.5 rounded-lg border border-[#1E2430] focus:border-[#FF5E00] focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Severities</option>
            <option value="SEV1">SEV 1 (Orange)</option>
            <option value="SEV2">SEV 2 (Dark Grey)</option>
            <option value="SEV3">SEV 3 (Light Grey)</option>
          </select>

        </div>

      </div>

      {/* 4. SOP Cards Grid View */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {filteredSops.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center p-6 text-center rounded-2xl bg-[#0F1218] border border-[#1E2430] space-y-3">
            <BookOpen className="w-12 h-12 text-[#657187] opacity-60" />
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                No SOP Documents Found
              </h3>
              <p className="text-xs text-[#76839A] mt-1 max-w-md">
                No SOPs matching the current filters for {currentSiteObj.name}. Click below to attach a new runbook document for alerts or site incidents.
              </p>
            </div>
            <button
              onClick={() => openAttachSopModal({ siteId: currentSiteObj.id })}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF5E00] hover:bg-[#FF7522] text-white text-xs font-bold transition-all shadow-none"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Attach First SOP for {currentSiteObj.code}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredSops.map(sop => {
              const isCopied = copiedId === sop.id;

              return (
                <div
                  key={sop.id}
                  className="surface-card rounded-xl p-3.5 flex flex-col justify-between border border-[#1E2430] bg-[#0F1218] hover:border-[#2C384D] transition-all group relative"
                >
                  
                  {/* Top Bar: Category + Severity + Facility Pill */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getCategoryBadge(sop.category)}
                        {getSeverityBadge(sop.severity)}
                      </div>

                      <span className="text-[9.5px] px-2 py-0.5 rounded-lg bg-[#131722] text-[#8C98AE] border border-[#1E2430] font-bold shrink-0 truncate max-w-[120px]">
                        {sop.siteCode || 'GLOBAL'}
                      </span>
                    </div>

                    {/* SOP Title */}
                    <h3 className="text-sm font-extrabold text-white group-hover:text-[#FF5E00] transition-colors leading-snug line-clamp-2">
                      {sop.title}
                    </h3>

                    {/* Subsystem & Associated Key Tag */}
                    <div className="flex items-center gap-2 mt-1.5 mb-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#18202D] text-gray-200 border border-[#2B3548] font-bold">
                        {sop.subsystem}
                      </span>

                      {sop.associatedKey && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#1F1710] text-[#FF5E00] border border-[#FF5E00]/30 font-bold flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          <span>{sop.associatedKey}</span>
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs text-[#8E9BAC] leading-relaxed line-clamp-3 mb-3 bg-[#0A0D14] p-2.5 rounded-lg border border-[#161B26]">
                      {sop.description}
                    </p>

                    {/* Document URL Preview */}
                    <div className="flex items-center gap-1.5 text-[10.5px] text-[#55637A] font-mono truncate mb-3">
                      <ExternalLink className="w-3 h-3 text-[#FF5E00] shrink-0" />
                      <span className="truncate">{sop.documentUrl}</span>
                    </div>
                  </div>

                  {/* Footer: Author/Date + Action Buttons */}
                  <div className="pt-2.5 border-t border-[#1E2430] flex items-center justify-between gap-2 shrink-0">
                    <div className="text-[9.5px] text-[#63728A] truncate max-w-[140px]">
                      <div>{sop.author}</div>
                      <div className="text-[8.5px] text-[#4A5568]">{sop.createdAt}</div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Copy Link Button */}
                      <button
                        onClick={() => handleCopyLink(sop)}
                        className="p-1.5 rounded-lg bg-[#131722] hover:bg-[#181D2B] text-gray-400 hover:text-white border border-[#1E2430] transition-colors"
                        title="Copy document URL to clipboard"
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDelete(sop.id, sop.title)}
                        className="p-1.5 rounded-lg bg-[#131722] hover:bg-red-950/60 text-gray-400 hover:text-red-400 border border-[#1E2430] hover:border-red-900/50 transition-colors"
                        title="Remove SOP Attachment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Primary Open Document Button */}
                      <a
                        href={sop.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#FF5E00] hover:bg-[#FF7522] text-white text-xs font-bold transition-all shadow-none"
                        title="Open SOP Document in new tab"
                      >
                        <span>Open SOP</span>
                        <ExternalLink className="w-3 h-3" />
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
