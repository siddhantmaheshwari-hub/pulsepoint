import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        paper: '#F3F4F1',
        panel: '#FFFFFF',
        ink: '#18202E',
        muted: '#5E6675',
        line: '#DCDFE3',
        signal: '#C2410C',
        calm: '#2F7A5B',
        fresh: '#5B47B0',
        steel: '#34537A',
      },
    },
  },
  plugins: [],
} satisfies Config;
