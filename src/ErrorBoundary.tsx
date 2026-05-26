import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: string; stack: string }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: '', stack: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error:    error.message ?? String(error),
      stack:    error.stack   ?? '',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log completo para diagnóstico
    console.error('═══ APP CRASH ═══')
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
    console.error('Component stack:', info.componentStack)
    console.error('═════════════════')

    // Guardar en sessionStorage para poder recuperarlo
    try {
      sessionStorage.setItem('last_crash', JSON.stringify({
        error:   error.message,
        stack:   error.stack,
        component: info.componentStack,
        time:    new Date().toISOString(),
      }))
    } catch { /* ignorar */ }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    // Recuperar el último crash guardado
    let componentStack = ''
    try {
      const saved = sessionStorage.getItem('last_crash')
      if (saved) {
        const parsed = JSON.parse(saved)
        componentStack = parsed.component ?? ''
      }
    } catch { /* ignorar */ }

    return (
      <div style={{
        minHeight: '100vh', backgroundColor: '#D8DAE4',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', fontFamily: 'Nunito, sans-serif', gap: '1rem',
      }}>
        <div style={{ width: 56, height: 56, borderRadius: '1rem', overflow: 'hidden',
          boxShadow: '8px 8px 16px rgba(130,142,170,0.5),-8px -8px 16px rgba(255,255,255,0.5)' }}>
          <img src="/logo.jpg" alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>

        <p style={{ fontWeight: 700, color: '#2D3561', fontSize: '1rem', textAlign: 'center', margin: 0 }}>
          Error de aplicación
        </p>

        {/* Mostrar el error en pantalla para diagnóstico */}
        <div style={{
          backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.75rem',
          padding: '0.875rem', width: '100%', maxWidth: 380, overflow: 'auto',
        }}>
          <p style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 700, margin: '0 0 0.25rem' }}>
            Error #{this.state.error.match(/\d+/)?.[0] ?? '?'}:
          </p>
          <p style={{ fontSize: '0.7rem', color: '#991B1B', margin: 0, wordBreak: 'break-all' }}>
            {this.state.error}
          </p>
          {componentStack && (
            <pre style={{ fontSize: '0.6rem', color: '#7F1D1D', margin: '0.5rem 0 0',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto',
              backgroundColor: '#FEE2E2', padding: '0.5rem', borderRadius: '0.5rem' }}>
              {componentStack.trim().split('\n').slice(0, 15).join('\n')}
            </pre>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => {
            sessionStorage.removeItem('last_crash')
            window.location.reload()
          }} style={{
            padding: '0.75rem 1.5rem', backgroundColor: '#FF5722', color: '#fff',
            fontWeight: 700, border: 'none', borderRadius: '1rem', cursor: 'pointer',
            fontSize: '0.875rem',
            boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)',
          }}>
            🔄 Recargar
          </button>
          <button onClick={async () => {
            sessionStorage.clear()
            localStorage.clear()
            try {
              const cacheKeys = await caches.keys()
              await Promise.all(cacheKeys.map(k => caches.delete(k)))
            } catch { /* ignorar */ }
            window.location.reload()
          }} style={{
            padding: '0.75rem 1.5rem', backgroundColor: '#D8DAE4', color: '#5A617A',
            fontWeight: 700, border: 'none', borderRadius: '1rem', cursor: 'pointer',
            fontSize: '0.875rem',
            boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)',
          }}>
            🧹 Limpiar y recargar
          </button>
        </div>
      </div>
    )
  }
}
