import React, { useEffect } from 'react';
import { EmbeddedMiniBrowser } from './EmbeddedMiniBrowser';

interface MiniBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  metricLabel: string;
  initialUrl: string;
  onUpdateUrl?: (newUrl: string) => Promise<void>;
  siteName?: string;
  accentColor?: string;
}

export const MiniBrowserModal: React.FC<MiniBrowserModalProps> = ({
  isOpen,
  onClose,
  title,
  metricLabel,
  initialUrl,
  onUpdateUrl,
  siteName = 'Facility',
  accentColor = '#FF7A00',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 font-mono select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-5xl h-[88vh] max-h-[820px] bg-[#070A0F] rounded-2xl border border-[#232A39] shadow-[0_25px_70px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden transition-all duration-150"
        style={{ borderColor: `${accentColor}55` }}
        onClick={e => e.stopPropagation()}
      >
        <EmbeddedMiniBrowser
          initialUrl={initialUrl}
          title={title || `${siteName} — ${metricLabel} Diagnostic View`}
          metricLabel={metricLabel}
          accentColor={accentColor}
          compact={false}
          onUrlChange={(newUrl) => {
            if (onUpdateUrl) {
              onUpdateUrl(newUrl);
            }
          }}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
