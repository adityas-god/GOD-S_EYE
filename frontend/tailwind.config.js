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
          card: '#0F1218',      // Sleek Flat Dark Card Background
          hover: '#141822',     // Smooth Card Hover & Selected states
          subtle: '#0D1017',    // Recessed Container
          border: '#1E2430',    // Clean Crisp 1px Borders
          borderDark: '#161B24',
          text: '#FFFFFF',      // Crisp Pure White text
          muted: '#76839A',     // Muted Secondary Telemetry text
          orange: {
            DEFAULT: '#FF5E00', // GreyOrange Vibrant Orange
            hover: '#FF7522',
            dark: '#D94E00',
          },
          sev: {
            sev1: '#FF5E00',    // SEV 1: Orange
            sev2: '#384252',    // SEV 2: Dark Grey
            sev3: '#707D93',    // SEV 3: Light Grey
            none: '#CBD5E1'     // No Ticket: Greyish White
          }
        }
      },
      boxShadow: {
        none: 'none',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif']
      }
    },
  },
  plugins: [],
}
