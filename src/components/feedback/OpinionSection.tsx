/**
 * OpinionSection.tsx — "Opinión y sugerencias" (Anexo F, 3.2 y 3.7)
 * Tres atajos que abren el chat de Resti en modo opinión, y "Mis sugerencias" con el estado de lo que ya envió.
 * Cuando una sugerencia pasa a "hecho" se muestra resaltada una vez (y se marca como vista).
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { StatePanel } from '../ui/StatePanel'
import { ModuleHeader, IconBubble } from '../tasks/ModuleHeader'

export const EVENTO_ABRIR_OPINION = 'ros:abrir-opinion'
export const EVENTO_OPINION_GUARDADA = 'ros:opinion-guardada'
export type AtajoOpinion = 'fallo' | 'mejora' | 'personalizacion'

interface Item { id: string; numero: number; tipo: string; titulo: string; estado: string; urgencia: string; created_at: string; cierre_visto_at: string | null }

const ESTADO: Record<string, string> = {
  nuevo: 'Recibida', revisado: 'En revisión', planeado: 'Planeada', en_progreso: 'En construcción', hecho: '¡Lista!', descartado: 'No por ahora',
}
const TIPO: Record<string, string> = { fallo: 'Fallo', mejora: 'Mejora', personalizacion: 'Personalización', pregunta: 'Pregunta', otro: 'Otro' }
const ico = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24' } as const
const ATAJOS: { id: AtajoOpinion; texto: string; tone: 'danger' | 'accent' | 'info'; icon: ReactNode }[] = [
  { id: 'fallo', texto: 'Reportar un fallo', tone: 'danger', icon: <svg {...ico}><path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17.5v.01"/></svg> },
  { id: 'mejora', texto: 'Sugerir una mejora', tone: 'accent', icon: <svg {...ico}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg> },
  { id: 'personalizacion', texto: 'Personalizar mi restaurante', tone: 'info', icon: <svg {...ico}><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.2-1.7-.4-1 .3-2.3 1.5-2.3H17a4 4 0 0 0 4-4c0-5-4-10-9-10z"/><circle cx="7.5" cy="11" r=".8"/><circle cx="12" cy="7.5" r=".8"/><circle cx="16.5" cy="11" r=".8"/></svg> },
]

export const abrirChatOpinion = (atajo?: AtajoOpinion) => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_OPINION, { detail: { atajo } }))

export function OpinionSection() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recien, setRecien] = useState<Set<string>>(new Set())

  const cargar = useCallback(() => {
    supabase.from('feedback_items')
      .select('id, numero, tipo, titulo, estado, urgencia, created_at, cierre_visto_at')
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

  return (
    <div className="mx-auto grid max-w-[980px] gap-4" style={{ fontFamily: 'var(--w-font)' }}>
      <ModuleHeader
        icon={<svg {...ico}><path d="M12 21s-7-4.4-9.2-9A5.3 5.3 0 0 1 12 6.2 5.3 5.3 0 0 1 21.2 12C19 16.6 12 21 12 21z"/></svg>}
        title="Opinión y sugerencias"
        subtitle="Cuéntale a Resti qué falló, qué mejorarías o cómo quieres personalizar tu restaurante. Lo leemos y lo tenemos en cuenta."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {ATAJOS.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => abrirChatOpinion(a.id)}
            className="flex min-h-[88px] items-center gap-3 rounded-[var(--w-r-lg)] border border-[var(--w-border)] bg-[var(--w-surface)] p-4 text-left transition-colors hover:bg-[var(--w-surface-sunken)]"
            style={{ boxShadow: 'var(--w-shadow-sm)' }}
          >
            <IconBubble tone={a.tone} size={44}>{a.icon}</IconBubble>
            <span className="font-semibold text-[color:var(--w-text)] text-[length:var(--w-fs-body)]">{a.texto}</span>
          </button>
        ))}
      </div>
      <p style={{ fontSize: 'var(--w-fs-caption)', color: 'var(--w-text-3)', margin: 0 }}>
        Lo que escribas se guarda para mejorar RestaurantOS. No escribas contraseñas ni datos de tarjetas.
      </p>

      <Card>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: 'var(--w-fs-title)', fontWeight: 700, color: 'var(--w-text)' }}>Mis sugerencias</h3>
        {error && <p style={{ margin: 0, color: 'var(--w-danger-text)', fontSize: 'var(--w-fs-label)' }}>No se pudo cargar: {error}</p>}
        {!error && items === null && <p style={{ margin: 0, fontSize: 'var(--w-fs-label)', color: 'var(--w-text-3)' }}>Cargando…</p>}
        {!error && items?.length === 0 && <StatePanel kind="empty" title="Aún no has enviado ninguna" text="Usa uno de los botones de arriba." />}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
          {(items ?? []).map(i => (
            <li key={i.id} style={{ padding: '0.75rem 1rem', borderRadius: 'var(--w-r-md)', background: recien.has(i.id) ? 'var(--w-success-bg)' : 'var(--w-surface-sunken)', border: recien.has(i.id) ? '1px solid var(--w-success)' : '1px solid var(--w-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--w-text)', fontSize: 'var(--w-fs-body)' }}>#{i.numero} · {i.titulo}</strong>
                <Badge tone={i.estado === 'hecho' ? 'success' : 'neutral'}>{ESTADO[i.estado] ?? i.estado}</Badge>
              </div>
              <span style={{ fontSize: 'var(--w-fs-caption)', color: 'var(--w-text-3)' }}>
                {TIPO[i.tipo] ?? i.tipo} · {new Date(i.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                {recien.has(i.id) ? ' · ¡Ya está hecha! Gracias por la idea.' : ''}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
