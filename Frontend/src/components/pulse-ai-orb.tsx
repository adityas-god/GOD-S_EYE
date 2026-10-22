import React from 'react';

interface PulseAiOrbProps {
  size?: number;
  className?: string;
  showGlow?: boolean;
  style?: React.CSSProperties;
}

export function PulseAiOrb({
  size = 88,
  className = '',
  showGlow = false,
  style = {},
}: PulseAiOrbProps) {
  const isSmall = size <= 28;
  const isLarge = size >= 60;

  return (
    <div
      className={`pulse-ai-orb-wrapper ${isSmall ? 'pulse-ai-orb-small' : isLarge ? 'pulse-ai-orb-large' : 'pulse-ai-orb-medium'} ${className}`}
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      {showGlow && (
        <div
          className="pulse-ai-orb-glow"
          style={{
            position: 'absolute',
            inset: isLarge ? -10 : -4,
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        className="pulse-ai-orb-circle"
        style={{
          width: size,
          height: size,
        }}
      >
        <video
          src="/8557de74b105bcefd733d4dae074140f.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="pulse-ai-orb-video"
        />
      </div>
    </div>
  );
}
