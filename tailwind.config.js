/** @type {import('tailwindcss').Config} */
import animatePlugin from 'tailwindcss-animate';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Class strategy: ThemeProvider puts `.dark` on <html>. The palette remap
  // in src/styles/globals.css does the bulk of the work; `dark:` variants stay
  // available for one-off overrides.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cream: '#FFF8EE',
        ink: '#0F172A',
        muted: '#475569',
        // Growlanzo brand scale — sampled directly from the "zo" of the final
        // wordmark (public/growlanzo-wordmark-*.png): median #24ba35, deep
        // #008623, highlight #c2e30c. Overriding Tailwind's built-in `emerald`
        // here re-skins every `emerald-*` class in the app from this one
        // source, so the whole UI tracks the logo.
        // 600/700 are one step darker than the logo mid-tone on purpose: they
        // carry white button text and body links, and keep >=4.5:1 on white.
        emerald: {
          50: '#f1fcef',
          100: '#ddf7d9',
          200: '#bbefb4',
          300: '#89e07f',
          400: '#4fcb45',
          500: '#24ba35',
          600: '#14861f',
          700: '#0f6f1a',
          800: '#10591a',
          900: '#104a1a',
          950: '#04270c',
        },
        primary: {
          50: '#f1fcef',
          100: '#ddf7d9',
          200: '#bbefb4',
          300: '#89e07f',
          400: '#4fcb45',
          500: '#24ba35',
          600: '#14861f',
          700: '#0f6f1a',
          800: '#10591a',
          900: '#104a1a',
          950: '#04270c',
        },
        secondary: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
      },
      fontFamily: {
        sans: ['Satoshi', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Cabinet Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '2rem',
          lg: '4rem',
          xl: '5rem',
          '2xl': '6rem',
        },
      },
      animation: {
        'fade-up': 'fadeUp 700ms ease-out forwards',
        'scan': 'scan 2.2s ease-in-out infinite',
        'scan-slow': 'scan 2.4s ease-in-out infinite',
        'dot-travel': 'dotTravel 2.6s linear infinite',
        'soft-pulse': 'softPulse 3.2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scan: {
          '0%': { transform: 'translateX(-35%)', opacity: '0' },
          '15%': { opacity: '1' },
          '50%': { opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { transform: 'translateX(35%)', opacity: '0' },
        },
        dotTravel: {
          '0%': { transform: 'translateX(0)', opacity: '0' },
          '10%': { opacity: '1' },
          '80%': { opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        softPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.03)', opacity: '0.9' },
        },
      },
    },
  },
  plugins: [animatePlugin],
};
