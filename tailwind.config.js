/** @type {import('tailwindcss').Config} */
export default {
  // Rutas explícitas — CRÍTICO para que Vercel no purgue clases en producción
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  // Safelist: clases generadas dinámicamente o con valores arbitrarios
  // que el purger podría eliminar al no verlas en el código estático
  safelist: [
    // Fondos neomórficos
    'bg-[#D8DAE4]', 'bg-[#CDD0DC]', 'bg-[#E2E4EC]', 'bg-[#FF5722]', 'bg-[#E64A19]',
    'bg-[#2D3561]', 'bg-[#10B981]', 'bg-[#F59E0B]', 'bg-[#3B82F6]',
    // Textos
    'text-[#2D3561]', 'text-[#5A617A]', 'text-[#8B92AA]', 'text-[#FF5722]',
    'text-[#E64A19]', 'text-[#10B981]',
    // Border colors
    'border-[#FF5722]', 'border-[#E0E3EC]',
    // Mínimos de altura garantizados
    'min-h-screen', 'min-h-0',
    // Sombras neomórficas extendidas
    'shadow-neo-out', 'shadow-neo-out-sm', 'shadow-neo-out-lg',
    'shadow-neo-in',  'shadow-neo-in-sm',  'shadow-neo-coral',
    // Layout
    'flex', 'flex-col', 'flex-row', 'flex-1', 'flex-shrink-0',
    'items-center', 'justify-center', 'justify-between',
    'gap-1', 'gap-2', 'gap-3', 'gap-4', 'gap-5', 'gap-6', 'gap-8',
    'p-3', 'p-4', 'p-5', 'p-6', 'p-8', 'p-12',
    'px-4', 'px-6', 'py-3', 'py-3.5', 'py-4', 'py-6',
    'w-full', 'w-10', 'w-14', 'w-16', 'w-20', 'w-24',
    'h-10', 'h-16', 'h-24',
    'max-w-sm', 'max-w-md',
    // Responsive
    'md:grid-cols-3', 'md:flex-row',
    // Bordes redondeados clave
    'rounded-2xl', 'rounded-3xl', 'rounded-full',
    // Grid
    'grid', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3',
    // Sticky / z-index
    'sticky', 'top-0', 'z-20',
    // Overflow
    'overflow-hidden', 'overflow-auto', 'overflow-y-auto',
    // Animate
    'animate-pulse', 'animate-spin',
    // Object fit — CRÍTICO para el logo
    'object-contain', 'object-cover',
    // Colores Tailwind base para badges
    'bg-amber-100', 'text-amber-700',
    'bg-emerald-100', 'text-emerald-700', 'bg-emerald-500',
    'bg-red-50', 'bg-red-100', 'text-red-600',
    'bg-blue-100', 'text-blue-700',
    'bg-orange-100', 'text-orange-700',
    'bg-purple-600', 'text-purple-600',
    'text-emerald-600', 'text-amber-600', 'text-blue-600', 'text-orange-600',
    // Transiciones
    'transition', 'transition-all', 'transition-transform',
    'duration-150', 'duration-200',
    'hover:scale-[1.02]', 'active:scale-95',
    'hover:text-[#FF5722]',
    // Space
    'space-y-4', 'space-y-6', 'space-y-8',
    // Text sizes
    'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl',
    'font-medium', 'font-semibold', 'font-bold',
    'tracking-wide', 'tracking-wider', 'uppercase',
    // Custom utilities
    'neo-card', 'neo-card-sm', 'neo-inset', 'neo-btn', 'neo-btn-coral',
    'neo-input', 'neo-sidebar-item', 'neo-sidebar-item-active',
    'neo-badge-pending', 'neo-badge-completed', 'neo-badge-cancelled',
    'neo-badge-cooking', 'neo-badge-ready',
    'animate-fade-in-up', 'animate-pulse-soft',
  ],
  theme: {
    extend: {
      colors: {
        neo: {
          base:      '#D8DAE4',   // atenuado
          surface:   '#CDD0DC',   // atenuado
          raised:    '#E2E4EC',
          coral:     '#FF5722',
          coralDark: '#E64A19',
          dark:      '#2D3561',
          mid:       '#5A617A',
          light:     '#8B92AA',
          green:     '#10B981',
          amber:     '#F59E0B',
          blue:      '#3B82F6',
        },
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
        display: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body:    ['"Nunito"',  'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
    },
  },
  plugins: [],
}
