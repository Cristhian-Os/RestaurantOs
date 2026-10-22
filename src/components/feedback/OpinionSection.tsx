/**
 * OpinionSection.tsx — "Opinión y sugerencias" (Anexo F, 3.2 y 3.7)
 * Tres atajos que abren el chat de Resti en modo opinión, y "Mis sugerencias" con el estado de lo que ya envió.
 * Cuando una sugerencia pasa a "hecho" se muestra resaltada una vez (y se marca como vista).
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'

export const EVENTO_ABRIR_OPINION = 'ros:abrir-opinion'
export const EVENTO_OPINION_GUARDADA = 'ros:opinion-guardada'
export type AtajoOpinion = 'fallo' | 'mejora' | 'personalizacion'

interface Item { id: string; numero: number; tipo: string; titulo: string; estado: string; created_at: string; cierre_visto_at: string | null }

const ESTADO: Record<string, string> = {
  nuevo: 'Recibida', revisado: 'En revisión', planeado: 'Planeada', en_progreso: 'En construcción', hecho: '¡Lista!', descartado: 'No por ahora',
}
const TIPO: Record<string, string> = { fallo: 'Fallo', mejora: 'Mejora', personalizacion: 'Personalización', pregunta: 'Pregunta', otro: 'Otro' }
const ATAJOS: { id: AtajoOpinion; texto: string }[] = [
  { id: 'fallo', texto: 'Reportar un fallo' },
  { id: 'mejora', texto: 'Sugerir una mejora' },
  { id: 'personalizacion', texto: 'Personalizar mi restaurante' },
]

export const abrirChatOpinion = (atajo?: AtajoOpinion) => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_OPINION, { detail: { atajo } }))

export function OpinionSection() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recien, setRecien] = useState<Set<string>>(new Set())

  const cargar = useCallback(async () => {
    // «Mis sugerencias»: solo las del usuario (el admin también puede leer las de todo el restaurante)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    supabase.from('feedback_items')
      .select('id, numero, tipo, titulo, estado, created_at, cierre_visto_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data, error: e }) => {
        if (e) { setError(e.message); return }
        const lista = (data ?? []) as Item[]
        setItems(lista)
        // Las terminadas que aún no había visto se resaltan en esta visita y se marcan como vistas.
        const nuevas = lista.filter(i => i.estado === 'hecho' && !i.cierre_visto_at)
        if (nuevas.length) {
          setRecien(new Set(nuevas.map(i => i.id)))
          nuevas.forEach(i => { supabase.rpc('feedback_marcar_visto', { p_id: i.id }).then(() => undefined) })
        }
      })
  }, [])

  useEffect(() => {
    cargar()
    window.addEventListener(EVENTO_OPINION_GUARDADA, cargar)
    return () => window.removeEventListener(EVENTO_OPINION_GUARDADA, cargar)
  }, [cargar])

  const caja: React.CSSProperties = { background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '1.25rem' }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', display: 'grid', gap: '1rem', fontFamily: 'var(--w-sans)' }}>
      <div>
        <h2 className="ed-display" style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, color: 'var(--w-ink)' }}>Opinión y sugerencias</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--w-ink-mut)', margin: '0.25rem 0 0' }}>
          Cuéntale a Resti qué falló, qué mejorarías o cómo quieres personalizar tu restaurante. Lo leemos y lo tenemos en cuenta.
        </p>
      </div>

      <div style={{ ...caja, display: 'grid', gap: '0.6rem' }}>
        {ATAJOS.map(a => (
          <button key={a.id} onClick={() => abrirChatOpinion(a.id)} className="w-press"
            style={{ textAlign: 'left', padding: '0.85rem 1rem', minHeight: '2.75rem', borderRadius: '0.85rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            {a.texto}
          </button>
        ))}
        <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)', margin: '0.25rem 0 0' }}>
          Lo que escribas se guarda para mejorar RestaurantOS. No escribas contraseñas ni datos de tarjetas.
        </p>
      </div>

      <div style={caja}>
        <h3 style={{ margin: '0 0 0.6rem', fontSize: '1rem', color: 'var(--w-ink)' }}>Mis sugerencias</h3>
        {error && <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.85rem' }}>No se pudo cargar: {error}</p>}
        {!error && items === null && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--w-ink-mut)' }}>Cargando…</p>}
        {!error && items?.length === 0 && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--w-ink-mut)' }}>Aún no has enviado ninguna. Usa uno de los botones de arriba.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
          {(items ?? []).map(i => (
            <li key={i.id} style={{ padding: '0.7rem 0.9rem', borderRadius: '0.85rem', background: recien.has(i.id) ? 'rgba(29,122,70,0.12)' : 'var(--w-bg)', border: recien.has(i.id) ? '1px solid #1D7A46' : '1px solid var(--w-line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--w-ink)', fontSize: '0.9rem' }}>#{i.numero} · {i.titulo}</strong>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: i.estado === 'hecho' ? '#1D7A46' : 'var(--w-ink-mut)' }}>{ESTADO[i.estado] ?? i.estado}</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--w-ink-mut)' }}>
                {TIPO[i.tipo] ?? i.tipo} · {new Date(i.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                {recien.has(i.id) ? ' · ¡Ya está hecha! Gracias por la idea.' : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
