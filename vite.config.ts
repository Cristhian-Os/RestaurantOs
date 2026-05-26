import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({mode}) => ({
  plugins: [react()],
  server: { port: 5173 },
  define: {
    // En producción usar React development build para ver errores completos
    'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
  },
  build: {
    // Desactivar minificación temporalmente para ver stack traces reales
    minify: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':   ['react', 'react-dom'],
          'vendor-supabase':['@supabase/supabase-js'],
          'vendor-query':   ['@tanstack/react-query'],
          'vendor-antd':    ['antd'],
          'vendor-motion':  ['framer-motion'],
        }
      }
    }
  }
}))
