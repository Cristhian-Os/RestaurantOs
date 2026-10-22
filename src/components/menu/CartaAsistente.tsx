/**
 * CartaAsistente.tsx — "Pregunta sobre la carta" del menú QR (vista del comensal). SIN personaje de Resti.
 * Un campo de texto; la respuesta sale de la carta real (platos, precios, agotados, ingredientes registrados).
 * No se guarda la conversación: solo se muestra la última respuesta. Si el restaurante tiene mascota, va como imagen fija.
 */
import { useState } from 'react'
import { supabase } from '../../services/supabaseClient'

const sesionId = (): string => {
  try { let s = sessionStorage.getItem('ros_menu_sesion'); if (!s) { s = crypto.randomUUID().replace(/-/g, ''); sessionStorage.setItem('ros_menu_sesion', s) } return s }
  catch { return 'sinalmacen' + Math.random().toString(36).slice(2, 12) }
}

/** Mascota del restaurante: imagen fija. Solo se mueve, muy lento, si el comensal no pidió menos movimiento. */
export function MascotaMenu({ url, nombre }: { url: string; nombre: string }) {
  return (
    <>
      <style>{`@keyframes menu-mascota{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        .menu-mascota{animation:menu-mascota 7s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.menu-mascota{animation:none}}`}</style>
      <img className="menu-mascota" src={url} alt={`Mascota de ${nombre}`} width={84} loading="lazy" draggable={false}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        style={{ position: 'absolute', right: '1rem', top: '1rem', width: 84, height: 'auto', objectFit: 'contain', pointerEvents: 'none' }} />
    </>
  )
}

export default function CartaAsistente({ slug, restaurantId, mesa }: { slug: string | null; restaurantId: string | null; mesa: string }) {
  const [abierto, setAbierto] = useState(false)
  const [pregunta, setPregunta] = useState('')
  const [respuesta, setRespuesta] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const preguntar = async () => {
    const q = pregunta.trim()
    if (q.length < 2 || cargando) return
    setCargando(true); setRespuesta(null)
    try {
      const { data, error } = await supabase.functions.invoke('menu-asistente', { body: { slug, restaurant_id: slug ? undefined : restaurantId, mesa, pregunta: q, sesion: sesionId() } })
      if (error) throw error
      setRespuesta(String(data?.respuesta ?? 'No pude responder ahora. Pídele ayuda al mesero.'))
      setPregunta('')
    } catch {
      setRespuesta('No pude responder ahora. Pídele ayuda al mesero.')
    } finally { setCargando(false) }
  }

  return (
    <div style={{ marginTop: '1rem', fontFamily: 'var(--w-sans)' }}>
      <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
        style={{ border: '1px solid var(--w-terra)', background: 'var(--w-surface)', color: 'var(--w-terra)', fontWeight: 700, fontSize: '0.875rem', borderRadius: '999px', padding: '0.6rem 1.1rem', minHeight: '2.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>
        {abierto ? 'Cerrar' : 'Pregunta sobre la carta'}
      </button>
      {abierto && (
        <div style={{ marginTop: '0.75rem', padding: '0.875rem', borderRadius: '1rem', background: 'var(--w-surface)', border: '1px solid var(--w-line)', maxWidth: '34rem' }}>
          <label htmlFor="carta-pregunta" style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--w-ink-mut)', marginBottom: '0.375rem' }}>
            Pregunta por ingredientes, precios, opciones o qué hay disponible.
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input id="carta-pregunta" value={pregunta} maxLength={300} placeholder="Ej.: ¿qué me recomiendas?"
              onChange={e => setPregunta(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void preguntar() }}
              style={{ flex: 1, minWidth: 0, border: '1px solid var(--w-line)', borderRadius: '0.75rem', padding: '0.6rem 0.85rem', fontSize: '1rem', minHeight: '2.75rem', background: 'var(--w-bg)', color: 'var(--w-ink)', fontFamily: 'inherit' }} />
            <button type="button" onClick={() => void preguntar()} disabled={cargando || pregunta.trim().length < 2}
              style={{ border: 'none', borderRadius: '0.75rem', padding: '0 1rem', minHeight: '2.75rem', background: 'var(--w-terra)', color: '#fff', fontWeight: 700, cursor: cargando ? 'wait' : 'pointer', opacity: cargando || pregunta.trim().length < 2 ? 0.6 : 1, fontFamily: 'inherit' }}>
              {cargando ? '…' : 'Preguntar'}
            </button>
          </div>
          <div role="status" aria-live="polite" style={{ marginTop: '0.625rem', fontSize: '0.9375rem', lineHeight: 1.45, color: 'var(--w-ink)', whiteSpace: 'pre-wrap' }}>
            {cargando ? 'Mirando la carta…' : respuesta}
          </div>
          <p style={{ margin: '0.625rem 0 0', fontSize: '0.75rem', color: 'var(--w-ink-mut)' }}>No guardo tu conversación. En alergias, la última palabra la tiene el personal.</p>
        </div>
      )}
    </div>
  )
}
