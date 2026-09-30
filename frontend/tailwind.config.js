/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        industrial: {
          bg: '#090A0E',        // Deep Obsidian Matte Background
          card: '#121318',      // Sleek Charcoal Card / Panel Background
          hover: '#171821',     // Smooth Card Hover & Selected states
          subtle: '#0D0E13',    // Dark inner recessed container
          border: '#1F222C',    // Ultra-refined Sleek Dark Borders
          borderDark: '#161820',
          text: '#FFFFFF',      // Crisp Pure White text
          muted: '#8E95A5',     // Warm Muted Secondary Telemetry text
          orange: {
            DEFAULT: '#FF5426', // Radiant Burnt Orange / Coral Accent
            hover: '#FF6B3D',
            dark: '#D93B11',
            glow: 'rgba(255, 84, 38, 0.28)',
            subtle: 'rgba(255, 84, 38, 0.12)'
          },
          sev: {
            red: '#EF4444',     // SEV 1 Critical
            yellow: '#F59E0B',  // SEV 2 Major (>=2)
            blue: '#3B82F6',    // SEV 3 Minor
            green: '#10B981'    // Normal / Nominal
          }
        }
      },
      boxShadow: {
        'industrial-glow': '0 0 20px rgba(255, 84, 38, 0.22)',
        'orange-pill': '0 4px 16px -2px rgba(255, 84, 38, 0.35)',
        'sleek-card': '0 4px 20px -2px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'red-glow': '0 0 15px rgba(239, 68, 68, 0.3)',
        'yellow-glow': '0 0 15px rgba(245, 158, 11, 0.3)',
        'blue-glow': '0 0 15px rgba(59, 130, 246, 0.3)',
        'green-glow': '0 0 15px rgba(16, 185, 129, 0.3)',
        'panel': '0 4px 20px -2px rgba(0, 0, 0, 0.65)'
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif']
      }
    },
  },
  plugins: [],
}
