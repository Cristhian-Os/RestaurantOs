/**
 * MarcaConVistaPrevia.tsx — Paso "Marca" del asistente con pantalla dividida (Anexo D, 3.6).
 * A un lado el editor de marca; al otro, el MENÚ PÚBLICO REAL del restaurante (con sus platos y fotos) dentro de un marco de celular,
 * que cambia al instante con los colores, el logo y la portada aún sin guardar. Se comunica con el menú por postMessage (?preview=1).
 * En pantallas angostas la vista previa se abre a pantalla completa con el botón "Ver cómo queda".
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import BrandingManager, { type BorradorMarca } from '../branding/BrandingManager'

// ¿El texto blanco se lee sobre este color? (contraste WCAG: mínimo 3 para texto grande y botones)
function contrasteConBlanco(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05)
}

function useAncho(): number {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return w
}

const chip = (on: boolean): React.CSSProperties => ({
  border: `1px solid ${on ? 'var(--w-terra)' : 'var(--w-line)'}`, background: on ? 'var(--w-terra)' : 'var(--w-bg)', color: on ? '#fff' : 'var(--w-ink)',
  borderRadius: '999px', padding: '0.4rem 0.9rem', minHeight: '2.5rem', fontWeight: 700, fontFamily: 'var(--w-sans)', fontSize: '0.8125rem', cursor: 'pointer',
})

export function MarcaConVistaPrevia({ slug }: { slug: string | null }) {
  const [borrador, setBorrador] = useState<BorradorMarca | null>(null)
  const [dispositivo, setDispositivo] = useState<'celular' | 'tablet'>('celular')
  const [cerrado, setCerrado] = useState(false)
  const [abierta, setAbierta] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const ancho = useAncho()
  const dividida = ancho >= 900

  // El menú avisa cuando está listo (cada vez que se abre un iframe nuevo); entonces se le manda el borrador actual.
  const ultimo = useRef<{ borrador: BorradorMarca | null; cerrado: boolean }>({ borrador: null, cerrado: false })
  const enviar = useCallback(() => {
    const { borrador: b, cerrado: c } = ultimo.current
    if (!b) return
    iframeRef.current?.contentWindow?.postMessage({ tipo: 'ros-preview', color: b.color, nombre: b.nombre, logo: b.logo, portada: b.portada, cerrado: c }, window.location.origin)
  }, [])
  useEffect(() => {
    const alRecibir = (e: MessageEvent) => { if (e.origin === window.location.origin && (e.data as { tipo?: string } | null)?.tipo === 'ros-preview-listo') enviar() }
    window.addEventListener('message', alRecibir)
    return () => window.removeEventListener('message', alRecibir)
  }, [enviar])
  useEffect(() => { ultimo.current = { borrador, cerrado }; enviar() }, [borrador, cerrado, enviar])

  const contraste = borrador ? contrasteConBlanco(borrador.color) : null
  const ilegible = contraste !== null && contraste < 3
  const ancha = dispositivo === 'tablet' ? 640 : 380

  const vista = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button style={chip(dispositivo === 'celular')} onClick={() => setDispositivo('celular')}>📱 Celular</button>
        <button style={chip(dispositivo === 'tablet')} onClick={() => setDispositivo('tablet')}>Tablet</button>
        <button style={chip(!cerrado)} onClick={() => setCerrado(false)}>Abierto</button>
        <button style={chip(cerrado)} onClick={() => setCerrado(true)}>Cerrado</button>
      </div>
      {slug ? (
        <div style={{ width: dividida ? ancha : '100%', maxWidth: '100%', height: dividida ? 640 : 'calc(100vh - 9rem)', borderRadius: dividida ? '2rem' : '1rem', border: dividida ? '8px solid var(--w-ink)' : '1px solid var(--w-line)', overflow: 'hidden', background: 'var(--w-bg)' }}>
          <iframe ref={iframeRef} title="Así se ve tu menú" src={`${window.location.origin}/menu/${slug}?preview=1`} style={{ width: '100%', height: '100%', border: 'none' }} />
        </div>
      ) : <p style={{ color: 'var(--w-ink-mut)' }}>Cuando tu restaurante tenga dirección web propia, aquí verás cómo queda tu menú.</p>}
      {ilegible && (
        <p role="alert" style={{ margin: 0, maxWidth: ancha, fontSize: '0.8125rem', color: '#B0341D', fontWeight: 600 }}>
          ⚠ Este color es muy claro: el texto blanco de los botones se leerá mal. Prueba uno más oscuro.
        </p>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}><BrandingManager onBorrador={setBorrador} /></div>
      {dividida && <div style={{ position: 'sticky', top: '1rem', flexShrink: 0 }}>{vista}</div>}
      {!dividida && (
        <>
          <button onClick={() => setAbierta(true)} style={{ position: 'fixed', right: '1rem', bottom: '5.5rem', zIndex: 60, borderRadius: '999px', border: 'none', background: 'var(--w-terra)', color: '#fff', fontWeight: 700, padding: '0.85rem 1.25rem', minHeight: '3rem', boxShadow: '0 6px 20px rgba(0,0,0,0.25)', cursor: 'pointer', fontFamily: 'var(--w-sans)' }}>
            👁 Ver cómo queda
          </button>
          {abierta && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--w-bg)', padding: '0.75rem', overflow: 'auto' }}>
              <button onClick={() => setAbierta(false)} style={{ ...chip(false), marginBottom: '0.5rem' }}>← Volver a editar</button>
              {vista}
            </div>
          )}
        </>
      )}
    </div>
  )
}
