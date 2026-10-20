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
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: 'transparent',
        mixBlendMode: 'screen',
        ...style,
      }}
    >
      {showGlow && (
        <div
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(56, 189, 248, 0.28) 0%, rgba(249, 115, 22, 0.22) 55%, transparent 75%)',
            filter: 'blur(8px)',
            opacity: 0.8,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        className="pulse-ai-orb-circle"
        style={{
          width: size,
          height: size,
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          mixBlendMode: 'screen',
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
