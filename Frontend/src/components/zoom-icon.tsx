import React from 'react';

interface ZoomIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * High-definition vector icon for Zoom Meetings & Incident War Rooms
 * Features the signature Zoom brand squircle with white video camera glyph
 */
export function ZoomIcon({
  size = 16,
  className = '',
  style = {},
}: ZoomIconProps) {
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
      <title>Zoom</title>
      {/* Zoom Brand Rounded Squircle */}
      <rect width="24" height="24" rx="5.5" fill="#2D8CFF" />

      {/* Video Camera Body */}
      <rect x="4.5" y="7.2" width="9" height="9.6" rx="2" fill="#FFFFFF" />

      {/* Video Camera Lens */}
      <path
        d="M13.5 10.5L18.2 7.3C18.7 6.95 19.5 7.3 19.5 7.9V16.1C19.5 16.7 18.7 17.05 18.2 16.7L13.5 13.5V10.5Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
