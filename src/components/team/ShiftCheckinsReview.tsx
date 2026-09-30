/**
 * ShiftCheckinsReview.tsx
 * Panel del administrador: llegadas de empleados con su foto en vivo,
 * pendientes de aprobar o rechazar. Las fotos viven en un bucket privado
 * y se ven con URLs firmadas de corta duración.
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'

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
    <div style={{ background: 'var(--w-surface)', borderRadius: '1.25rem', padding: '1rem', border: '2px solid var(--w-saffron)', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <h3 className="ed-display" style={{ margin: 0, fontWeight: 600, fontSize: '1.25rem' }}>
        Llegadas por aprobar <span style={{ fontSize: '0.875rem', color: 'var(--w-ink-mut)', fontWeight: 400 }}>({rows.length})</span>
      </h3>
      {rows.map(r => (
        <div key={r.id} style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {r.photo
            ? <img src={r.photo} alt={`Llegada de ${r.name}`} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: '0.875rem', transform: 'scaleX(-1)' }} />
            : <div style={{ width: 120, height: 120, borderRadius: '0.875rem', background: 'var(--w-bg)' }} />}
          <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <p style={{ margin: 0, fontWeight: 700, fontFamily: 'var(--w-sans)' }}>{r.name}</p>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--w-ink-mut)', fontFamily: 'var(--w-sans)' }}>
              Turno {r.shift} · llegó {new Date(r.checked_in_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </p>
            {rejecting === r.id ? (
              <>
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Motivo (opcional)"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '0.625rem', border: '1px solid var(--w-line)', fontSize: '0.875rem', background: 'var(--w-bg)' }} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => review(r.id, false)} disabled={busy === r.id}
                    style={{ flex: 1, padding: '0.625rem', borderRadius: '0.75rem', border: 'none', background: 'var(--w-wine)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Rechazar</button>
                  <button onClick={() => { setReject(null); setNote('') }}
                    style={{ flex: 1, padding: '0.625rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => review(r.id, true)} disabled={busy === r.id}
                  style={{ flex: 1, padding: '0.625rem', borderRadius: '0.75rem', border: 'none', background: 'var(--w-olive)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy === r.id ? 0.6 : 1 }}>Aprobar</button>
                <button onClick={() => setReject(r.id)}
                  style={{ flex: 1, padding: '0.625rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', fontWeight: 700, cursor: 'pointer' }}>Rechazar</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
})
ShiftCheckinsReview.displayName = 'ShiftCheckinsReview'
