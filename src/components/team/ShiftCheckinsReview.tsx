/**
 * ShiftCheckinsReview.tsx
 * Panel del administrador: llegadas de empleados con su foto en vivo,
 * pendientes de aprobar o rechazar. Las fotos viven en un bucket privado
 * y se ven con URLs firmadas de corta duración.
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'
import { IconBubble } from '../tasks/ModuleHeader'

interface Checkin {
  id:            string
  schedule_id:   string
  employee_id:   string
  photo_path:    string
  checked_in_at: string
}

interface Row extends Checkin {
  name:  string
  shift: string
  photo: string | null
}

const hhmm = (t: string) => t.slice(0, 5)

export const ShiftCheckinsReview = memo(() => {
  const [rows, setRows]         = useState<Row[]>([])
  const [rejecting, setReject]  = useState<string | null>(null)
  const [note, setNote]         = useState('')
  const [busy, setBusy]         = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    const { data: cks } = await supabase.from('shift_checkins')
      .select('id, schedule_id, employee_id, photo_path, checked_in_at')
      .eq('status', 'pending').order('checked_in_at', { ascending: true })
    const list: Checkin[] = cks ?? []
    if (list.length === 0) { setRows([]); return }

    const [{ data: profs }, { data: scheds }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', list.map(c => c.employee_id)),
      supabase.from('employee_schedules').select('id, shift_start, shift_end').in('id', list.map(c => c.schedule_id)),
    ])
    const name  = new Map<string, string>((profs ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? 'Empleado']))
    const shift = new Map<string, string>((scheds ?? []).map((s: { id: string; shift_start: string; shift_end: string }) => [s.id, `${hhmm(s.shift_start)} – ${hhmm(s.shift_end)}`]))

    setRows(await Promise.all(list.map(async c => {
      const { data } = await supabase.storage.from('shift-checkins').createSignedUrl(c.photo_path, 3600)
      return { ...c, name: name.get(c.employee_id) ?? 'Empleado', shift: shift.get(c.schedule_id) ?? '', photo: data?.signedUrl ?? null }
    })))
  }, [])

  useEffect(() => {
    fetchPending()
    let ch: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (cancelled || !rid) return
      ch = supabase.channel('shift-checkins-review')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_checkins', filter: `restaurant_id=eq.${rid}` }, fetchPending)
        .subscribe()
    })
    return () => { cancelled = true; if (ch) supabase.removeChannel(ch) }
  }, [fetchPending])

  const review = async (id: string, aprobar: boolean) => {
    setBusy(id)
    const { error } = await supabase.rpc('revisar_llegada', { p_checkin_id: id, p_aprobar: aprobar, p_nota: aprobar ? null : note })
    setBusy(null)
    if (error) { message.error(error.message); return }
    setReject(null); setNote('')
    message.success(aprobar ? 'Llegada aprobada' : 'Llegada rechazada')
    fetchPending()
  }

  if (rows.length === 0) return null

  return (
    <div style={{ background: 'var(--w-surface)', borderRadius: 'var(--w-r-lg)', padding: '1rem', border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-sm)', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <h3 style={{ margin: 0, fontWeight: 700, fontSize: 'var(--w-fs-title)', color: 'var(--w-text)', fontFamily: 'var(--w-font)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <IconBubble tone="warning" size={36}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        </IconBubble>
        Llegadas por aprobar <Badge tone="warning">{rows.length} pendientes</Badge>
      </h3>
      {rows.map(r => (
        <div key={r.id} style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {r.photo
            ? <img src={r.photo} alt={`Llegada de ${r.name}`} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--w-r-md)', transform: 'scaleX(-1)' }} />
            : <div aria-hidden style={{ width: 120, height: 120, borderRadius: 'var(--w-r-md)', background: 'var(--w-accent-soft)', color: 'var(--w-accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '2rem', fontFamily: 'var(--w-font)' }}>
                {r.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'}
              </div>}
          <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <p style={{ margin: 0, fontWeight: 700, fontFamily: 'var(--w-font)' }}>{r.name}</p>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--w-text-3)', fontFamily: 'var(--w-font)' }}>
              Turno {r.shift} · llegó {new Date(r.checked_in_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </p>
            {rejecting === r.id ? (
              <>
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Motivo (opcional)"
                  style={{ minHeight: 44, padding: '0.5rem 0.75rem', borderRadius: 'var(--w-r-md)', border: '1px solid var(--w-border-strong)', fontSize: '0.875rem', color: 'var(--w-text)', background: 'var(--w-surface)', fontFamily: 'var(--w-font)' }} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button variant="danger" className="flex-1" onClick={() => review(r.id, false)} disabled={busy === r.id}>Rechazar</Button>
                  <Button variant="secondary" className="flex-1" onClick={() => { setReject(null); setNote('') }}>Cancelar</Button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button className="flex-1" onClick={() => review(r.id, true)} disabled={busy === r.id}>Aprobar</Button>
                <Button variant="secondary" className="flex-1" onClick={() => setReject(r.id)}>Rechazar</Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
})
ShiftCheckinsReview.displayName = 'ShiftCheckinsReview'
