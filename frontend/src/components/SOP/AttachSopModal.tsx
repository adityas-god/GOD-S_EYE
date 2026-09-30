import React, { useState, useEffect } from 'react';
import { 
  X, 
  Link as LinkIcon, 
  BookOpen, 
  AlertTriangle, 
  ExternalLink, 
  Check 
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { SopCategory } from '../../types/sites';

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
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

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
      setFormError(null);
    }
  }, [isAttachSopModalOpen, sopModalPrefill, selectedSite]);

  if (!isAttachSopModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Please enter an SOP title.');
      return;
    }
    if (!documentUrl.trim()) {
      setFormError('Please provide a document URL.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const targetSiteObj = allEnterpriseSites.find(s => s.id === siteId);
    const siteName = siteId === 'ALL' ? 'Global (All Facilities)' : targetSiteObj?.name || currentSiteObj.name;
    const siteCode = siteId === 'ALL' ? 'GLOBAL' : targetSiteObj?.code || currentSiteObj.code;

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
        author: 'Operator',
        tags: [subsystem]
      });

      closeAttachSopModal();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to attach SOP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 font-mono animate-in fade-in duration-150">
      <div 
        className="bg-[#0F1218] border border-[#1E2430] rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-none overflow-hidden select-none"
        onClick={e => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-3.5 bg-[#131722] border-b border-[#1E2430] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#FF5E00] flex items-center justify-center text-white shrink-0">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-xs uppercase tracking-wider text-white truncate">
                Attach SOP
              </h2>
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
          
          {formError && (
            <div className="p-2 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-[11px] flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Row 1: Target Facility + Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
                Facility
              </label>
              <select
                value={siteId}
                onChange={e => setSiteId(e.target.value)}
                className="w-full bg-[#131722] border border-[#1E2430] rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] cursor-pointer"
              >
                <option value="ALL">🌐 Global (All Facilities)</option>
                {allEnterpriseSites.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
                Category
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
                  Alert SOP
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
                  Site Incident
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Title */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
              Title *
            </label>
            <input
              type="text"
              placeholder="e.g. Inverter Reset Procedure"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-[#131722] border border-[#1E2430] rounded-lg px-3 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] placeholder-[#545E73]"
              required
            />
          </div>

          {/* Row 3: Document URL + Test Link */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] uppercase font-bold text-[#76839A]">
                Document URL *
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
                placeholder="https://..."
                value={documentUrl}
                onChange={e => setDocumentUrl(e.target.value)}
                className="w-full bg-[#131722] border border-[#1E2430] rounded-lg pl-8 pr-3 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] placeholder-[#545E73]"
                required
              />
            </div>
          </div>

          {/* Row 4: Subsystem + Severity + Associated Key */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
                Subsystem
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
                Severity
              </label>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value as any)}
                className="w-full bg-[#131722] border border-[#1E2430] rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] cursor-pointer"
              >
                <option value="SEV1">SEV 1</option>
                <option value="SEV2">SEV 2</option>
                <option value="SEV3">SEV 3</option>
                <option value="ALL">ALL</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
                Alert / Case ID
              </label>
              <input
                type="text"
                placeholder="e.g. ALT-101"
                value={associatedKey}
                onChange={e => setAssociatedKey(e.target.value)}
                className="w-full bg-[#131722] border border-[#1E2430] rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] placeholder-[#545E73]"
              />
            </div>
          </div>

          {/* Row 5: Description (Optional) */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-[#76839A] mb-1">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Brief description or steps..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-[#131722] border border-[#1E2430] rounded-lg p-2.5 text-gray-200 text-xs focus:outline-none focus:border-[#FF5E00] placeholder-[#545E73] resize-none leading-relaxed"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-[#1E2430] flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={closeAttachSopModal}
              className="px-3 py-1.5 rounded-lg bg-[#131722] hover:bg-[#181D2B] text-gray-300 hover:text-white border border-[#1E2430] text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-[#FF5E00] hover:bg-[#FF7522] text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Attaching...' : 'Attach SOP'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

