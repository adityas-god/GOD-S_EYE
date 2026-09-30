import React, { useState, useEffect } from 'react';
import { 
  X, 
  Link as LinkIcon, 
  BookOpen, 
  AlertTriangle, 
  Layers, 
  ExternalLink, 
  Check, 
  Tag, 
  User, 
  Building2, 
  FileText 
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { SopCategory, SiteSopAttachment } from '../../types/sites';

export const AttachSopModal: React.FC = () => {
  const { 
    isAttachSopModalOpen, 
    closeAttachSopModal, 
    sopModalPrefill, 
    addSop, 
    allEnterpriseSites, 
    currentSiteObj,
    selectedSite 
  } = useDashboard();

  const [siteId, setSiteId] = useState<string>(selectedSite || 'rtp_sams_atl');
  const [category, setCategory] = useState<SopCategory>('ALERT');
  const [title, setTitle] = useState<string>('');
  const [documentUrl, setDocumentUrl] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [subsystem, setSubsystem] = useState<string>('Butler Fleet');
  const [severity, setSeverity] = useState<'SEV1' | 'SEV2' | 'SEV3' | 'ALL'>('SEV1');
  const [associatedKey, setAssociatedKey] = useState<string>('');
  const [author, setAuthor] = useState<string>('Operations SRE Lead');
  const [tagsInput, setTagsInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Sync form when prefill changes or modal opens
  useEffect(() => {
    if (isAttachSopModalOpen) {
      setSiteId(sopModalPrefill?.siteId || selectedSite || 'rtp_sams_atl');
      setCategory(sopModalPrefill?.category || 'ALERT');
      setTitle(sopModalPrefill?.title || '');
      setDocumentUrl(sopModalPrefill?.documentUrl || '');
      setDescription(sopModalPrefill?.description || '');
      setSubsystem(sopModalPrefill?.subsystem || 'Butler Fleet');
      setSeverity(sopModalPrefill?.severity || 'SEV1');
      setAssociatedKey(sopModalPrefill?.associatedKey || '');
      setAuthor(sopModalPrefill?.author || 'Operations SRE Lead');
      setTagsInput(sopModalPrefill?.tags ? sopModalPrefill.tags.join(', ') : '');
      setFormError(null);
    }
  }, [isAttachSopModalOpen, sopModalPrefill, selectedSite]);

  if (!isAttachSopModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Please enter a clear SOP title.');
      return;
    }
    if (!documentUrl.trim()) {
      setFormError('Please provide a document URL (Google Docs, Confluence, SharePoint, etc.).');
      return;
    }
    if (!description.trim()) {
      setFormError('Please provide a description or action steps for this SOP.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const targetSiteObj = allEnterpriseSites.find(s => s.id === siteId);
    const siteName = siteId === 'ALL' ? 'Global (All Facilities)' : targetSiteObj?.name || currentSiteObj.name;
    const siteCode = siteId === 'ALL' ? 'GLOBAL' : targetSiteObj?.code || currentSiteObj.code;

    const parsedTags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    try {
      await addSop({
        siteId,
        siteName,
        siteCode,
        category,
        title: title.trim(),
        description: description.trim(),
        documentUrl: documentUrl.trim(),
        subsystem: subsystem.trim() || 'General',
        severity,
        associatedKey: associatedKey.trim() || undefined,
        author: author.trim() || 'Operations Lead',
        tags: parsedTags.length > 0 ? parsedTags : [subsystem, category === 'ALERT' ? 'Alert' : 'Incident']
      });

      closeAttachSopModal();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to attach SOP. Please check fields.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 font-mono animate-in fade-in duration-150">
      <div 
        className="bg-[#0F1218] border border-[#1E2430] rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-none overflow-hidden select-none"
        onClick={e => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-4 bg-[#131722] border-b border-[#1E2430] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#FF5E00] flex items-center justify-center text-white shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-xs uppercase tracking-wider text-white truncate">
                Attach SOP Document
              </h2>
              <p className="text-[10px] text-[#76839A] truncate">
                Link standard operating runbooks to alerts and site incidents
              </p>
            </div>
          </div>

          <button
            onClick={closeAttachSopModal}
            className="p-1.5 rounded-lg bg-[#181D2B] hover:bg-[#202738] text-gray-400 hover:text-white transition-colors"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
          
          {formError && (
            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-[11px] flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Row 1: Target Facility + Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
                Target Facility
              </label>
              <div className="relative">
                <select
                  value={siteId}
                  onChange={e => setSiteId(e.target.value)}
                  className="w-full bg-[#131722] border border-[#1E2430] rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] cursor-pointer"
                >
                  <option value="ALL">🌐 Global (All Facilities)</option>
                  {allEnterpriseSites.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) — {s.region}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
                SOP Category
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategory('ALERT')}
                  className={`py-1.5 px-2 rounded-lg text-[10.5px] font-bold border transition-colors ${
                    category === 'ALERT'
                      ? 'bg-[#FF5E00] text-white border-[#FF5E00]'
                      : 'bg-[#131722] text-[#8C98AE] border-[#1E2430] hover:text-white'
                  }`}
                >
                  ⚡ Alert SOP
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('SITE_INCIDENT')}
                  className={`py-1.5 px-2 rounded-lg text-[10.5px] font-bold border transition-colors ${
                    category === 'SITE_INCIDENT'
                      ? 'bg-[#384252] text-white border-[#4F5D73]'
                      : 'bg-[#131722] text-[#8C98AE] border-[#1E2430] hover:text-white'
                  }`}
                >
                  🏭 Site Incident
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Title */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
              SOP Title *
            </label>
            <input
              type="text"
              placeholder="e.g. Butler Motor Thermal Over-Temperature Recovery Procedure"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-[#131722] border border-[#1E2430] rounded-lg px-3 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] placeholder-[#545E73]"
              required
            />
          </div>

          {/* Row 3: Document URL + Quick Test */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] uppercase font-bold text-[#76839A]">
                Document URL (Google Docs / Confluence / Notion / Wiki) *
              </label>
              {documentUrl && (
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[9.5px] text-[#FF5E00] hover:underline flex items-center gap-1 font-bold"
                >
                  <span>Test Link</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
            <div className="relative">
              <LinkIcon className="w-3.5 h-3.5 text-[#657187] absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="url"
                placeholder="https://docs.google.com/document/d/... or https://confluence.greyorange.com/..."
                value={documentUrl}
                onChange={e => setDocumentUrl(e.target.value)}
                className="w-full bg-[#131722] border border-[#1E2430] rounded-lg pl-8 pr-3 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] placeholder-[#545E73]"
                required
              />
            </div>
          </div>

          {/* Row 4: Description & Action Steps */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
              Description & Action Steps *
            </label>
            <textarea
              rows={3}
              placeholder="Provide a concise description of triage steps, required safety gear, and recovery verification..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-[#131722] border border-[#1E2430] rounded-lg p-2.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] placeholder-[#545E73] resize-none leading-relaxed"
              required
            />
          </div>

          {/* Row 5: Subsystem + Severity + Associated Key */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
                Subsystem / Component
              </label>
              <select
                value={subsystem}
                onChange={e => setSubsystem(e.target.value)}
                className="w-full bg-[#131722] border border-[#1E2430] rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] cursor-pointer"
              >
                <option value="Butler Fleet">Butler Fleet</option>
                <option value="Optics Scanner">Optics Scanner</option>
                <option value="Sorter Bridge">Sorter Bridge</option>
                <option value="Platform">Platform</option>
                <option value="Elastic">Elastic</option>
                <option value="InfluxDB">InfluxDB</option>
                <option value="Kafka Logs">Kafka Logs</option>
                <option value="Battery Systems">Battery Systems</option>
                <option value="Hardware">Hardware</option>
                <option value="Network">Network</option>
                <option value="General">General</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
                Severity Level
              </label>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value as any)}
                className="w-full bg-[#131722] border border-[#1E2430] rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] cursor-pointer"
              >
                <option value="SEV1">🟠 SEV 1 (Critical)</option>
                <option value="SEV2">⚫ SEV 2 (Major)</option>
                <option value="SEV3">⚪ SEV 3 (Minor)</option>
                <option value="ALL">All Severities</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
                Associated Alert/Case ID
              </label>
              <input
                type="text"
                placeholder="ALT-901 or INC-3001"
                value={associatedKey}
                onChange={e => setAssociatedKey(e.target.value)}
                className="w-full bg-[#131722] border border-[#1E2430] rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] placeholder-[#545E73]"
              />
            </div>
          </div>

          {/* Row 6: Author & Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
                Author / On-Call Engineer
              </label>
              <input
                type="text"
                placeholder="Marcus Vance (SRE)"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                className="w-full bg-[#131722] border border-[#1E2430] rounded-lg px-3 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00]"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
                Tags (Comma Separated)
              </label>
              <input
                type="text"
                placeholder="thermal, safety, induct, plc"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                className="w-full bg-[#131722] border border-[#1E2430] rounded-lg px-3 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00]"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-[#1E2430] flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={closeAttachSopModal}
              className="px-3.5 py-1.5 rounded-lg bg-[#131722] hover:bg-[#181D2B] text-gray-300 hover:text-white border border-[#1E2430] text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-[#FF5E00] hover:bg-[#FF7522] text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Attaching...' : 'Attach SOP Document'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
