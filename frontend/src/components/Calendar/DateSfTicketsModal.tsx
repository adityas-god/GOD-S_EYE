import React from 'react';
import { 
  X, 
  ExternalLink, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  CheckCircle2, 
  Clock, 
  User, 
  Layers, 
  ShieldAlert,
  Share2
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

interface DateSfTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateStr: string;
}

export const DateSfTicketsModal: React.FC<DateSfTicketsModalProps> = ({
  isOpen,
  onClose,
  dateStr
}) => {
  const { currentSiteObj, ticketsList } = useDashboard();

  if (!isOpen) return null;

  // Filter tickets for this specific date
  const dayTickets = (ticketsList || []).filter((t: any) => {
    return t.incidentDate === dateStr || (t.date && t.date === dateStr);
  });

  const sev1Tickets = dayTickets.filter((t: any) => t.severity === 'SEV1' || t.severity === 'RED');
  const sev2Tickets = dayTickets.filter((t: any) => t.severity === 'SEV2' || t.severity === 'AMBER' || t.severity === 'YELLOW');
  const sev3Tickets = dayTickets.filter((t: any) => t.severity === 'SEV3' || t.severity === 'BLUE');

  // Format date nicely (e.g. Thursday, May 15, 2025)
  const [y, m, d] = dateStr.split('-').map(Number);
  const formattedDate = !isNaN(y) && !isNaN(m) && !isNaN(d) 
    ? new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : dateStr;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 font-mono animate-in fade-in duration-150">
      <div 
        className="bg-[#0F141E] border border-[#2A3448] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        
        {/* Modal Header */}
        <div className="p-4 bg-[#141A26] border-b border-[#232A39] flex items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF7A00] animate-pulse" />
              <h2 className="font-extrabold text-sm text-white uppercase tracking-wider">
                Salesforce Incidents — {formattedDate}
              </h2>
            </div>
            <div className="text-[11px] text-[#7B88A0] mt-0.5">
              Facility: <strong className="text-white">{currentSiteObj?.name}</strong> ({currentSiteObj?.code})
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2.5 py-1 rounded-lg bg-[#1B2232] border border-[#2A364E] text-[#FF7A00] font-bold">
              {dayTickets.length} {dayTickets.length === 1 ? 'Ticket' : 'Tickets'}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#19202E] hover:bg-[#252E42] text-gray-400 hover:text-white transition-colors"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Severity Summary Pills */}
        <div className="px-4 py-2 bg-[#111622] border-b border-[#1E2638] flex items-center gap-2 text-[11px] shrink-0">
          <span className="text-[#627087]">Severity Breakdown:</span>
          <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-bold border border-red-500/30">
            {sev1Tickets.length} SEV 1
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
            {sev2Tickets.length} SEV 2
          </span>
          <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
            {sev3Tickets.length} SEV 3
          </span>
        </div>

        {/* Tickets List Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
          {dayTickets.length === 0 ? (
            <div className="p-8 text-center bg-[#121724] border border-[#1E2638] rounded-xl">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
              <div className="font-bold text-white text-sm">Normal Operations — Zero Incidents</div>
              <div className="text-xs text-[#6F7D96] mt-1">No Salesforce incident cases were logged on {formattedDate}.</div>
              <a 
                href={`https://greyorange.lightning.force.com/lightning/o/Case/new?defaultFieldValues=Site__c=${encodeURIComponent(currentSiteObj?.name || '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-lg bg-[#1C2536] hover:bg-[#FF7A00] text-gray-300 hover:text-white text-xs font-bold transition-all border border-[#28354A]"
              >
                <span>Log New SF Ticket</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            dayTickets.map((t: any, idx: number) => {
              const sev = t.severity || 'SEV3';
              const isSev1 = sev === 'SEV1' || sev === 'RED';
              const isSev2 = sev === 'SEV2' || sev === 'AMBER' || sev === 'YELLOW';
              const ticketKey = t.ticketKey || t.id || `SF-${idx + 1001}`;
              
              // Direct Salesforce Lightning URL for this ticket
              const sfDirectLink = `https://greyorange.lightning.force.com/lightning/r/Case/${ticketKey}/view`;

              return (
                <div 
                  key={t.id || idx}
                  className="p-3.5 rounded-xl bg-[#131926] border border-[#222C3E] hover:border-[#FF7A00]/60 transition-all flex flex-col justify-between space-y-2 group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded text-white ${
                        isSev1 ? 'bg-[#EF4444]' : isSev2 ? 'bg-[#F59E0B] text-black' : 'bg-[#3B82F6]'
                      }`}>
                        {isSev1 ? 'SEV 1' : isSev2 ? 'SEV 2' : 'SEV 3'}
                      </span>

                      <span className="font-bold text-white text-xs truncate">
                        {ticketKey}
                      </span>

                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1A2232] text-[#8695AD] border border-[#27344C] hidden sm:inline">
                        {t.serviceComponent || t.service || 'System'}
                      </span>
                    </div>

                    {/* DIRECT SALESFORCE LINK BUTTON */}
                    <a
                      href={sfDirectLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FF7A00] hover:bg-[#FF8B21] text-white text-[10px] font-bold shadow-xs transition-all shrink-0"
                      title="Open this Case directly in Salesforce Lightning"
                    >
                      <span>Salesforce Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {/* Summary & Description */}
                  <div>
                    <div className="font-bold text-white text-xs">
                      {t.summary || t.subject || 'Incident Alert'}
                    </div>
                    {t.description && (
                      <div className="text-[11px] text-[#7E8CA4] mt-1 line-clamp-2">
                        {t.description}
                      </div>
                    )}
                  </div>

                  {/* Footer Meta */}
                  <div className="pt-2 border-t border-[#1C2434] flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#69778F]">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>{t.assigneeName || t.assignee || 'On-Call Tech'}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{t.incidentTime || t.time || '09:00 AM EDT'}</span>
                      </span>
                    </div>

                    <span className="font-bold text-emerald-400">
                      Status: {t.status || 'IN_PROGRESS'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-[#131926] border-t border-[#232A39] flex items-center justify-between text-xs text-[#717E96] shrink-0">
          <span>Click any Salesforce Link to open the ticket in Lightning portal</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-[#1C2434] hover:bg-[#253046] text-white font-bold transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
