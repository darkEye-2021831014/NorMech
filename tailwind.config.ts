import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        paperStrong: 'rgb(var(--paper-strong) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        inkSoft: 'rgb(var(--ink-soft) / <alpha-value>)',
        inkMuted: 'rgb(var(--ink-muted) / <alpha-value>)',
        vermilion: 'rgb(var(--vermilion) / <alpha-value>)',
        vermilionSoft: 'rgb(var(--vermilion-soft) / <alpha-value>)',
        vermilionBright: 'rgb(var(--vermilion-bright) / <alpha-value>)',
        olive: 'rgb(var(--olive) / <alpha-value>)',
        oliveBright: 'rgb(var(--olive-bright) / <alpha-value>)',
        rule: 'rgb(var(--rule) / <alpha-value>)',
        cardBg: 'rgb(var(--card-bg) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-plex-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tightish: '-0.015em',
        widerish: '0.06em',
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '3px',
        md: '4px',
      },
      boxShadow: {
        'ink-1': '0 1px 0 0 rgb(var(--ink) / 0.08)',
        'ink-2': '0 2px 0 0 rgb(var(--ink) / 0.06), 0 1px 0 0 rgb(var(--ink) / 0.08)',
      },
      transitionTimingFunction: {
        notebook: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
