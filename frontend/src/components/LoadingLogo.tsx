import React from 'react';

interface LoadingLogoProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingLogo: React.FC<LoadingLogoProps> = ({ 
  label = 'Loading GreyOrange Telemetry...', 
  size = 'md' 
}) => {
  const dim = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-20 h-20' : 'w-14 h-14';

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 select-none animate-in fade-in duration-200">
      <div className={`relative ${dim} rounded-2xl overflow-hidden shadow-none border border-[#1E2430]`}>
        <img 
          src="/assets/images.jpg" 
          alt="GreyOrange" 
          className="w-full h-full object-cover animate-pulse"
        />
      </div>
      {label && (
        <span className="text-xs font-mono font-medium text-[#76839A] tracking-wider uppercase">
          {label}
        </span>
      )}
    </div>
  );
};
