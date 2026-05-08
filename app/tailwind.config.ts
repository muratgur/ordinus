import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

export default {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
          active: 'hsl(var(--primary-active) / <alpha-value>)',
          soft: 'hsl(var(--primary-soft) / <alpha-value>)'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)'
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)'
        },
        surface: {
          subtle: 'hsl(var(--surface-subtle) / <alpha-value>)',
          strong: 'hsl(var(--surface-strong) / <alpha-value>)'
        },
        status: {
          planned: 'hsl(var(--status-planned) / <alpha-value>)',
          running: 'hsl(var(--status-running) / <alpha-value>)',
          reading: 'hsl(var(--status-reading) / <alpha-value>)',
          editing: 'hsl(var(--status-editing) / <alpha-value>)',
          blocked: 'hsl(var(--status-blocked) / <alpha-value>)',
          attention: 'hsl(var(--status-attention) / <alpha-value>)',
          completed: 'hsl(var(--status-completed) / <alpha-value>)',
          failed: 'hsl(var(--status-failed) / <alpha-value>)'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: [animate]
} satisfies Config
