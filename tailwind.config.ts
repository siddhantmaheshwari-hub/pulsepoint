import type { Config } from 'tailwindcss';

// PulsePoint design tokens — see docs/DESIGN.md
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        frame: { DEFAULT: '#18242A', 2: '#22313A', 3: '#2E404A', text: '#DCE4E3', muted: '#93A6A8' },
        // Surfaces: warm canvas (paper) → raised cards (panel) → tinted wells (sunk / mist / sand)
        paper: '#F3F1EB',
        panel: '#FFFEFB',
        sunk: '#EEEBE3',
        mist: '#EAF1EF',
        sand: '#F7F2E7',
        line: { DEFAULT: '#E7E2D8', strong: '#D3CEC2', soft: '#EFEBE3' },
        ink: { DEFAULT: '#15171C', 2: '#383D46', muted: '#5A5F68', faint: '#60656E' },
        coal: { DEFAULT: '#17191D', 2: '#23262C', 3: '#33363E', text: '#F3F1EB', muted: '#A4A8B0' },
        violet: { DEFAULT: '#5B4FE0', ink: '#4337C9', soft: '#EEEBFD', line: '#D6D0FA' },
        teal: { DEFAULT: '#7FA6A2', soft: '#E3EEEC', ink: '#3F6B67' },
        rise: { DEFAULT: '#B03D22', soft: '#FBE8E1', fill: '#C4472A' },
        fall: { DEFAULT: '#25684F', soft: '#E1F1E9', fill: '#2E7D63' },
        fresh: { DEFAULT: '#7E5306', fill: '#E3B33E', soft: '#F7ECC8' },
      },
      borderRadius: { sheet: '28px', panel: '20px', well: '14px', ctl: '10px' },
      fontSize: {
        '2xs': ['11px', '14px'],
        display: ['44px', { lineHeight: '1.06', letterSpacing: '-0.03em' }],
        numeral: ['40px', { lineHeight: '1', letterSpacing: '-0.035em' }],
        hero: ['56px', { lineHeight: '0.95', letterSpacing: '-0.045em' }],
      },
      boxShadow: {
        sheet: '0 1px 0 rgba(255,255,255,.05), 0 30px 60px -36px rgba(0,0,0,.55)',
        // Raised cards: a hairline lift plus a long, faint ambient shadow
        card: '0 1px 2px rgba(21,23,28,.04), 0 10px 28px -18px rgba(21,23,28,.16)',
        'card-hover': '0 1px 2px rgba(21,23,28,.05), 0 16px 36px -18px rgba(21,23,28,.22)',
        pop: '0 16px 40px -14px rgba(21,23,28,.28)',
        inset: 'inset 0 1px 2px rgba(21,23,28,.05)',
      },
    },
  },
  plugins: [],
} satisfies Config;
