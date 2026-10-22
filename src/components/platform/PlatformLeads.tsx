/**
 * PlatformLeads.tsx — pestaña "Leads": personas que hablaron con Resti (vendedor) en la landing y dejaron sus datos.
 * Se leen con plataforma_leads (solo dueño con código de 2 pasos). El WhatsApp abre el chat con un mensaje listo.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { botonSuave, fechaCorta, suave, tarjeta } from './platformUi'

interface Lead {
  id: string; created_at: string; nombre: string; restaurante: string | null; ciudad: string | null; whatsapp: string
  tipo_negocio: string | null; mesas: number | null; interes: string; resumen: string | null; ref: string | null; estado: string
}
const INTERES: Record<string, string> = { esencial: 'Esencial', pro: 'Pro', multisede: 'Varias sedes (en espera)', otro: 'Por definir' }
const ESTADOS = ['nuevo', 'contactado', 'descartado'] as const

export function PlatformLeads() {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<string>('nuevo')

  const cargar = useCallback(() => {
    supabase.rpc('plataforma_leads', { p_limite: 300 }).then(({ data, error: e }) => {
      if (e) setError(e.message); else { setError(null); setLeads((data ?? []) as Lead[]) }
    })
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const marcar = async (id: string, estado: string) => {
    const { error: e } = await supabase.rpc('plataforma_marcar_lead', { p_id: id, p_estado: estado })
    if (e) setError(e.message); else cargar()
  }

  if (error) return <p role="alert" style={{ color: 'var(--w-wine, #B0341D)' }}>No se pudieron cargar los leads: {error}</p>
  if (!leads) return <p style={suave}>Cargando…</p>
  const lista = leads.filter(l => !filtro || l.estado === filtro)

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select aria-label="Estado" value={filtro} onChange={e => setFiltro(e.target.value)}
          style={{ padding: '0.5rem 0.6rem', minHeight: '2.5rem', borderRadius: '0.6rem', border: '1px solid var(--w-line, #bbb)' }}>
          <option value="">Todos</option>{ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={suave}>{lista.length} {lista.length === 1 ? 'lead' : 'leads'}</span>
      </div>
      {lista.length === 0 && <p style={suave}>Todavía no hay leads con ese estado.</p>}
      {lista.map(l => (
        <div key={l.id} style={tarjeta}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <b>{l.nombre}{l.restaurante ? ` · ${l.restaurante}` : ''}</b>
            <span style={suave}>{fechaCorta(l.created_at)} · {l.estado}</span>
          </div>
          <p style={{ margin: '0.25rem 0', ...suave }}>
            {[l.ciudad, l.tipo_negocio, l.mesas != null ? `${l.mesas} mesas` : null, `Interés: ${INTERES[l.interes] ?? l.interes}`, l.ref ? `ref: ${l.ref}` : null].filter(Boolean).join(' · ')}
          </p>
          {l.resumen && <p style={{ margin: '0.25rem 0' }}>{l.resumen}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <a href={`https://wa.me/${l.whatsapp}?text=${encodeURIComponent(`Hola ${l.nombre.split(' ')[0]}, te escribo de RestaurantOS: hablaste con Resti en nuestra página.`)}`} target="_blank" rel="noreferrer"
              style={{ ...botonSuave, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>WhatsApp · {l.whatsapp}</a>
            {ESTADOS.filter(s => s !== l.estado).map(s => <button key={s} style={botonSuave} onClick={() => void marcar(l.id, s)}>Marcar {s}</button>)}
          </div>
        </div>
      ))}
    </div>
  )
}
