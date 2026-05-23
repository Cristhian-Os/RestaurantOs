/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        neo: {
          base: '#E8EAF0',
          surface: '#E0E3EC',
          coral: '#FF5722',
          coralDark: '#E64A19',
          dark: '#2D3561',
          mid: '#6B7280',
          light: '#F5F7FF',
        }
      },
      boxShadow: {
        'neo-out':    '8px 8px 16px rgba(163,177,198,0.65), -8px -8px 16px rgba(255,255,255,0.75)',
        'neo-out-sm': '4px 4px 10px rgba(163,177,198,0.6), -4px -4px 10px rgba(255,255,255,0.7)',
        'neo-out-lg': '12px 12px 24px rgba(163,177,198,0.7), -12px -12px 24px rgba(255,255,255,0.8)',
        'neo-in':     'inset 6px 6px 12px rgba(163,177,198,0.6), inset -6px -6px 12px rgba(255,255,255,0.7)',
        'neo-in-sm':  'inset 3px 3px 7px rgba(163,177,198,0.55), inset -3px -3px 7px rgba(255,255,255,0.65)',
        'neo-coral':  '8px 8px 16px rgba(255,87,34,0.35), -4px -4px 12px rgba(255,255,255,0.6)',
      },
      fontFamily: {
        display: ['"DM Sans"', 'sans-serif'],
        body:    ['"Nunito"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      }
    },
  },
  plugins: [],
}
