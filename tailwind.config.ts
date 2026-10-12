import type { Config } from 'tailwindcss';

// PulsePoint design tokens — see docs/DESIGN.md
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      colors: {
        frame: { DEFAULT: '#1E2A30', 2: '#273740', 3: '#33454E', text: '#D5DDDC', muted: '#8FA2A4' },
        paper: '#F5F3EE',
        panel: '#FFFEFC',
        sunk: '#EFECE5',
        line: { DEFAULT: '#E5E1D8', strong: '#D3CEC2' },
        ink: { DEFAULT: '#17191E', 2: '#3B4049', muted: '#5A5F68', faint: '#666B74' },
        coal: { DEFAULT: '#1B1D21', 2: '#272A30', 3: '#353841', text: '#F2F0EA', muted: '#A2A6AE' },
        violet: { DEFAULT: '#5B4FE0', ink: '#4337C9', soft: '#ECE9FD', line: '#CFC9F8' },
        teal: { DEFAULT: '#7FA6A2', soft: '#E3EEEC', ink: '#3F6B67' },
        rise: { DEFAULT: '#B03D22', soft: '#FBE8E1', fill: '#C4472A' },
        fall: { DEFAULT: '#25684F', soft: '#E1F1E9', fill: '#2E7D63' },
        fresh: { DEFAULT: '#7E5306', fill: '#E3B33E', soft: '#F7ECC8' },
      },
      borderRadius: { sheet: '28px', panel: '18px', ctl: '10px' },
      fontSize: {
        '2xs': ['11px', '14px'],
        display: ['44px', { lineHeight: '1.08', letterSpacing: '-0.025em' }],
        numeral: ['40px', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      boxShadow: { sheet: '0 1px 0 rgba(255,255,255,.04), 0 24px 48px -32px rgba(0,0,0,.45)', pop: '0 12px 32px -12px rgba(23,25,30,.25)' },
    },
  },
  plugins: [],
} satisfies Config;
