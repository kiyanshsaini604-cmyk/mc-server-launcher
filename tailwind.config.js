/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mc: {
          green: '#3b7d23',
          dark: '#1a1a2e',
          darker: '#12121f',
          panel: '#222240',
          accent: '#4ade80',
          red: '#ef4444',
          yellow: '#eab308',
          blue: '#3b82f6',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
