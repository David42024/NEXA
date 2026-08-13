/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#06111F',
          900: '#0B1F33',
          800: '#132540',
          700: '#1B3357',
        },
        cyan: {
          400: '#38BDF8',
          500: '#08A9E6',
          600: '#0894C5',
        },
        surface: '#F4F6F9',
        ink: '#111827',
      },
      fontFamily: {
        display: ['"Sora"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,26,48,0.06), 0 8px 24px -12px rgba(11,26,48,0.15)',
      },
      borderRadius: {
        xl2: '1.1rem',
      },
    },
  },
  plugins: [],
}
