import React from 'react';

interface GoRosterIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Minimalist, high-definition vector icon for GO Support Roster
 * Sleek modern support headset with clean geometry, balanced proportions, and subtle dual-tone ear cushions
 */
export function GoRosterIcon({
  size = 16,
  className = '',
  style = {},
}: GoRosterIconProps) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
    >
      <title>GO Support Roster</title>
      {/* Headset Headband */}
      <path
        d="M3 11.5C3 6.80558 7.02944 3 12 3C16.9706 3 21 6.80558 21 11.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Left Ear Cushion */}
      <rect
        x="2"
        y="11"
        width="3.5"
        height="6.5"
        rx="1.75"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="currentColor"
        fillOpacity="0.18"
      />

      {/* Right Ear Cushion */}
      <rect
        x="18.5"
        y="11"
        width="3.5"
        height="6.5"
        rx="1.75"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="currentColor"
        fillOpacity="0.18"
      />

      {/* Microphone Boom */}
      <path
        d="M19 16.5V17.5C19 19.433 17.433 21 15.5 21H12.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Microphone Capsule */}
      <rect
        x="10.5"
        y="19.75"
        width="2.8"
        height="2.5"
        rx="1"
        fill="currentColor"
      />
    </svg>
  );
}
