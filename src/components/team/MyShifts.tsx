/**
 * MyShifts.tsx
 * Vista del empleado: los turnos que el administrador le asignó (hoy en adelante).
 * Lee public.employee_schedules; la RLS "Employee views own schedule" ya limita
 * las filas al propio empleado.
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { ModuleHeader } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import type { Tone } from '../ui/Badge'
import { StatePanel } from '../ui/StatePanel'
import { supabase } from '../../services/supabaseClient'
import { hoyBogota } from '../../services/menuOptions'
import { pushNotificationService } from '../../services/pushNotificationService'
import { CameraCapture } from './CameraCapture'
import message from 'antd/es/message'
import type { Profile } from '../../pages/Dashboard'

interface Shift {
  id:          string
  work_date:   string   // YYYY-MM-DD
  shift_start: string   // HH:MM:SS
  shift_end:   string
  notes:       string | null
}

interface Checkin {
  schedule_id: string
  status:      'pending' | 'approved' | 'rejected'
  review_note: string | null
}

const hhmm = (t: string) => t.slice(0, 5)

// Franja según la hora de entrada (solo etiqueta visual).
const franja = (start: string): { label: string; tone: Tone } => {
  const h = Number(start.slice(0, 2))
  if (h < 12) return { label: 'Mañana', tone: 'success' }
  if (h < 18) return { label: 'Tarde', tone: 'accent' }
  return { label: 'Noche', tone: 'info' }
}

// Fecha sin hora → día local sin corrimiento de zona horaria.
const dayLabel = (iso: string, today: string): string => {
  if (iso === today) return 'Hoy'
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const tomorrow = new Date(today + 'T00:00:00')
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (date.toDateString() === tomorrow.toDateString()) return 'Mañana'
  return date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })
}

export const MyShifts = memo(({ profile }: { profile: Profile }) => {
  const [shifts, setShifts]   = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [checkins, setCheckins] = useState<Record<string, Checkin>>({})
  const [capturing, setCapturing] = useState<Shift | null>(null)
  const today = hoyBogota()

  const fetchShifts = useCallback(async () => {
    const { data } = await supabase
      .from('employee_schedules')
      .select('id, work_date, shift_start, shift_end, notes')
      .eq('employee_id', profile.id)
      .gte('work_date', hoyBogota())
      .order('work_date', { ascending: true })
      .order('shift_start', { ascending: true })
    setShifts(data ?? [])
    const ids = (data ?? []).map(s => s.id)
    if (ids.length) {
      const { data: cks } = await supabase.from('shift_checkins')
        .select('schedule_id, status, review_note').in('schedule_id', ids)
      setCheckins(Object.fromEntries((cks ?? []).map((c: Checkin) => [c.schedule_id, c])))
    }
    setLoading(false)
  }, [profile.id])

  // Aparece al instante si el admin crea o cambia un turno mientras la app está abierta.
  useEffect(() => {
    fetchShifts()
    const ch = supabase
      .channel(`my-shifts-${profile.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'employee_schedules', filter: `employee_id=eq.${profile.id}` },
        fetchShifts)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shift_checkins', filter: `employee_id=eq.${profile.id}` },
        fetchShifts)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchShifts, profile.id])

  // Foto en vivo → bucket privado → registrar_llegada (valida turno y día en el servidor).
  const sendArrival = async (shift: Shift, photo: Blob) => {
    const path = `${profile.id}/${shift.work_date}-${crypto.randomUUID()}.jpg`
    const { error: upErr } = await supabase.storage.from('shift-checkins').upload(path, photo, { contentType: 'image/jpeg' })
    if (upErr) { message.error('No se pudo subir la foto: ' + upErr.message); return }
    const { error } = await supabase.rpc('registrar_llegada', { p_schedule_id: shift.id, p_photo_path: path })
    if (error) { message.error(error.message); return }
    setCapturing(null)
    message.success('Llegada enviada. Espera la aprobación del administrador.')
    pushNotificationService.notify(['admin'], 'Llegada al turno', `${profile.full_name ?? 'Un empleado'} registró su llegada`, '/')
    fetchShifts()
  }

  if (loading) return <p style={{ color: 'var(--w-text-3)', fontFamily: 'var(--w-font)' }}>Cargando tus turnos…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <ModuleHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>}
        title="Mis turnos"
        subtitle={shifts.length === 0 ? 'Sin turnos próximos' : `${shifts.length} ${shifts.length === 1 ? 'turno asignado' : 'turnos asignados'}`}
      />

      {shifts.length === 0 ? (
        <StatePanel kind="empty" title="Aún no tienes turnos asignados" text="Cuando el administrador te asigne uno, aparecerá aquí." />
      ) : <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', alignItems: 'start' }}>{shifts.map(s => {
        const isToday = s.work_date === today
        return (
          <div key={s.id} style={{
            background: 'var(--w-surface)', borderRadius: 'var(--w-r-lg)', padding: '1rem 1.25rem',
            border: isToday ? '2px solid var(--w-accent)' : '1px solid var(--w-border)',
            boxShadow: 'var(--w-shadow-sm)', display: 'flex', flexDirection: 'column', gap: '0.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: isToday ? 'var(--w-accent-text)' : 'var(--w-text-3)', fontFamily: 'var(--w-font)' }}>
                {dayLabel(s.work_date, today)}
              </p>
              <Badge tone={franja(s.shift_start).tone}>{franja(s.shift_start).label}</Badge>
            </div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.75rem', color: 'var(--w-text)', fontFamily: 'var(--w-font)' }}>
              {hhmm(s.shift_start)} – {hhmm(s.shift_end)}
            </p>
            {isToday && (() => {
              const ck = checkins[s.id]
              if (!ck || ck.status === 'rejected') return (
                <>
                  {ck?.status === 'rejected' && (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--w-danger-text)', fontFamily: 'var(--w-font)' }}>
                      Llegada rechazada{ck.review_note ? `: ${ck.review_note}` : ''}. Toma otra foto.
                    </p>
                  )}
                  <Button size="lg" className="mt-2 w-full" onClick={() => setCapturing(s)}>Ya llegué · tomar foto</Button>
                </>
              )
              return (
                <div style={{ marginTop: '0.5rem' }}>
                  <Badge tone={ck.status === 'approved' ? 'success' : 'warning'}>
                    {ck.status === 'approved' ? 'Llegada aprobada' : 'Llegada enviada · esperando aprobación'}
                  </Badge>
                </div>
              )
            })()}
            {s.notes && (
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--w-text-2)', fontFamily: 'var(--w-font)' }}>{s.notes}</p>
            )}
          </div>
        )
      })}</div>}

      {capturing && (
        <CameraCapture
          title="Foto de llegada"
          onCapture={photo => sendArrival(capturing, photo)}
          onClose={() => setCapturing(null)}
        />
      )}
    </div>
  )
})
MyShifts.displayName = 'MyShifts'
