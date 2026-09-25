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
          bg: '#1E2229',        // Dark Slate Main Background
          card: '#2A2F3A',      // Dark Charcoal Panels / Cards
          hover: '#323846',     // Card Hover & Selected states
          subtle: '#232832',    // Nested dark container
          border: '#3A4252',    // Industrial Slate Borders
          borderDark: '#282E3B',
          text: '#F3F4F6',      // Crisp white/light grey text
          muted: '#9CA3AF',     // Muted secondary telemetry text
          orange: {
            DEFAULT: '#FF7A00', // Vivid Industrial Orange Accent
            hover: '#E56D00',
            dark: '#B35500',
            glow: 'rgba(255, 122, 0, 0.25)',
            subtle: 'rgba(255, 122, 0, 0.12)'
          },
          sev: {
            red: '#EF4444',     // SEV 1 Critical
            yellow: '#F59E0B',  // SEV 2 Major (>=2)
            blue: '#3B82F6',    // SEV 3 Minor
            green: '#10B981'    // Normal / Zero Tickets
          }
        }
      },
      boxShadow: {
        'industrial-glow': '0 0 20px rgba(255, 122, 0, 0.15)',
        'red-glow': '0 0 15px rgba(239, 68, 68, 0.3)',
        'yellow-glow': '0 0 15px rgba(245, 158, 11, 0.3)',
        'blue-glow': '0 0 15px rgba(59, 130, 246, 0.3)',
        'green-glow': '0 0 15px rgba(16, 185, 129, 0.3)',
        'panel': '0 4px 20px -2px rgba(0, 0, 0, 0.5)'
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif']
      }
    },
  },
  plugins: [],
}
