/**
 * ScheduleCalendar.tsx
 * Week-view schedule editor for a single employee.
 * CRUD on public.employee_schedules table.
 */
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'
import { StatCard, IconBubble } from '../tasks/ModuleHeader'

interface Schedule {
  id:          string
  employee_id: string
  work_date:   string
  shift_start: string
  shift_end:   string
  notes:       string | null
}

interface Props {
  employeeId:   string
  employeeName: string
  onClose:      () => void
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function getWeekDays(anchor: Date): Date[] {
  const start = new Date(anchor)
  start.setDate(start.getDate() - start.getDay()) // rewind to Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

// Franja del turno según la hora de entrada (solo etiqueta visual).
function periodo(start: string): { label: string; bg: string; fg: string } {
  const h = Number(start.slice(0, 2))
  if (h < 12) return { label: 'Mañana', bg: 'var(--w-success-bg)', fg: 'var(--w-success-text)' }
  if (h < 18) return { label: 'Tarde',  bg: 'var(--w-accent-soft)', fg: 'var(--w-accent-text)' }
  return { label: 'Noche', bg: 'var(--w-info-bg)', fg: 'var(--w-info-text)' }
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ScheduleCalendar({ employeeId, employeeName, onClose }: Props) {
  const [anchor,      setAnchor]    = useState(new Date())
  const [schedules,   setSchedules] = useState<Schedule[]>([])
  const [loading,     setLoading]   = useState(true)
  const [editingDate, setEditing]   = useState<string | null>(null)
  const [form,        setForm]      = useState({ start: '08:00', end: '17:00', notes: '' })
  const [saving,      setSaving]    = useState(false)
  const [deleting,    setDeleting]  = useState<string | null>(null)

  const weekDays  = getWeekDays(anchor)
  const weekStart = toISO(weekDays[0])
  const weekEnd   = toISO(weekDays[6])
  const todayISO  = toISO(new Date())

  const bg     = 'var(--w-surface)'
  const bgSurf = 'var(--w-surface-sunken)'
  const txt    = 'var(--w-text)'
  const txtSec = 'var(--w-text-2)'
  const txtMut = 'var(--w-text-3)'
  const acc    = 'var(--w-accent)'

  const shadowOut  = 'var(--w-shadow-sm)'
  const shadowIn   = 'inset 0 0 0 1px var(--w-border)'
  const shadowOutLg= 'var(--w-shadow-lg)'

  const fetchSchedules = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('employee_schedules')
      .select('*')
      .eq('employee_id', employeeId)
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd)
      .order('work_date')
    setSchedules(data || [])
    setLoading(false)
  }, [employeeId, weekStart, weekEnd])

  useEffect(() => { fetchSchedules() }, [fetchSchedules])

  const openEdit = (iso: string) => {
    const existing = schedules.find(s => s.work_date === iso)
    setForm(existing
      ? { start: existing.shift_start.slice(0, 5), end: existing.shift_end.slice(0, 5), notes: existing.notes || '' }
      : { start: '08:00', end: '17:00', notes: '' }
    )
    setEditing(iso)
  }

  const handleSave = async (iso: string) => {
    if (!form.start || !form.end)   { message.warning('Indica hora de inicio y fin'); return }
    if (form.start >= form.end)     { message.warning('El inicio debe ser antes del fin'); return }
    setSaving(true)
    try {
      const existing = schedules.find(s => s.work_date === iso)
      if (existing) {
        const { error } = await supabase.from('employee_schedules')
          .update({ shift_start: form.start, shift_end: form.end, notes: form.notes || null, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('employee_schedules')
          .insert({ employee_id: employeeId, work_date: iso, shift_start: form.start, shift_end: form.end, notes: form.notes || null })
        if (error) throw error
      }
      message.success('Turno guardado')
      setEditing(null)
      await fetchSchedules()
    } catch (e) {
      message.error('Error: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setSaving(false) }
  }

  const handleDelete = async (iso: string) => {
    const existing = schedules.find(s => s.work_date === iso)
    if (!existing) return
    setDeleting(iso)
    try {
      const { error } = await supabase.from('employee_schedules').delete().eq('id', existing.id)
      if (error) throw error
      message.success('Turno eliminado')
      await fetchSchedules()
    } catch (e) {
      message.error('Error: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setDeleting(null) }
  }

  const prevWeek = () => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d) }
  const nextWeek = () => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d) }

  const weekLabel = `${weekDays[0].toLocaleDateString('es', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('es', { month: 'short', day: 'numeric', year: 'numeric' })}`

  // Weekly shift summary
  const assignedDays = schedules.length
  const totalHours = schedules.reduce((sum, s) => {
    const [sh, sm] = s.shift_start.split(':').map(Number)
    const [eh, em] = s.shift_end.split(':').map(Number)
    return sum + (eh * 60 + em - sh * 60 - sm) / 60
  }, 0)

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'var(--w-overlay)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'var(--w-font)' }}>
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 480, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', borderRadius: 'var(--w-r-xl)', padding: '1.5rem', background: 'var(--w-surface-raised)', border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-lg)' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <IconBubble tone="accent" size={44}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            </IconBubble>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontFamily: 'var(--w-font)', fontWeight: 700, fontSize: 'var(--w-fs-screen)', color: txt, margin: 0 }}>Horario semanal</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--w-text-3)', fontWeight: 600, margin: '0.125rem 0 0' }}>{employeeName}</p>
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: txtMut, fontSize: '1.375rem', lineHeight: 1, width: 44, height: 44, borderRadius: 'var(--w-r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {/* ── Resumen de la semana ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
          <StatCard label="Días con turno" value={assignedDays} tone="accent"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>} />
          <StatCard label="Horas por semana" value={`${totalHours.toFixed(1)} h`} tone="success"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>} />
        </div>

        {/* ── Week navigation ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.125rem', padding: '0.625rem 0.875rem', backgroundColor: bgSurf, borderRadius: 'var(--w-r-md)', boxShadow: shadowIn }}>
          <button onClick={prevWeek}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: txtSec, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8125rem', minHeight: 44, padding: '0 0.5rem', borderRadius: 'var(--w-r-md)' }}>
            ‹ Anterior
          </button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: txt, margin: 0 }}>{weekLabel}</p>
            <button onClick={() => setAnchor(new Date())}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: acc, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.6875rem', padding: 0 }}>
              Ir a hoy
            </button>
          </div>
          <button onClick={nextWeek}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: txtSec, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8125rem', minHeight: 44, padding: '0 0.5rem', borderRadius: 'var(--w-r-md)' }}>
            Siguiente ›
          </button>
        </div>

        {/* ── Day rows ── */}
        {loading
          ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${acc}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {weekDays.map(day => {
                const iso      = toISO(day)
                const shift    = schedules.find(s => s.work_date === iso)
                const isToday  = iso === todayISO
                const isEditing = editingDate === iso

                return (
                  <div key={iso}
                    style={{
                      padding: '0.875rem 1rem', background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-r-lg)', boxShadow: 'var(--w-shadow-sm)',
                      ...(isToday && { border: `2px solid ${acc}`, background: 'var(--w-accent-soft)' }),
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {/* Day number */}
                      <div style={{ minWidth: 52, padding: '0.375rem 0', textAlign: 'center', borderRadius: 'var(--w-r-md)', background: isToday ? acc : 'var(--w-surface-sunken)' }}>
                        <p style={{ fontSize: '0.625rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: isToday ? 'var(--w-on-accent)' : txtMut, margin: 0 }}>
                          {DAY_NAMES[day.getDay()]}
                        </p>
                        <p style={{ fontSize: '1.375rem', fontWeight: 800, color: isToday ? 'var(--w-on-accent)' : txt, lineHeight: 1, margin: '0.125rem 0 0' }}>
                          {day.getDate()}
                        </p>
                      </div>

                      {/* Shift display */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {shift ? (
                          <div>
                            <p style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', fontSize: '0.875rem', fontWeight: 700, color: periodo(shift.shift_start).fg, background: periodo(shift.shift_start).bg, borderRadius: 'var(--w-r-pill)', padding: '0.25rem 0.75rem', margin: 0 }}>
                              {shift.shift_start.slice(0, 5)} – {shift.shift_end.slice(0, 5)}
                              <span style={{ fontWeight: 600, fontSize: '0.75rem' }}>({periodo(shift.shift_start).label})</span>
                            </p>
                            {shift.notes && (
                              <p style={{ fontSize: '0.7rem', color: txtMut, margin: '0.125rem 0 0', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                {shift.notes}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p style={{ fontSize: '0.8125rem', color: txtMut, fontStyle: 'italic', margin: 0 }}>Sin turno asignado</p>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '0.3125rem', flexShrink: 0 }}>
                        <button
                          onClick={() => isEditing ? setEditing(null) : openEdit(iso)}
                          style={{ minHeight: 44, padding: '0 0.875rem', borderRadius: 'var(--w-r-md)', border: '1px solid var(--w-border-strong)', cursor: 'pointer', backgroundColor: isEditing ? bgSurf : bg, color: acc, fontWeight: 700, fontSize: '0.75rem', fontFamily: 'inherit', boxShadow: isEditing ? shadowIn : shadowOut, transition: 'box-shadow 0.15s ease' }}>
                          {isEditing ? 'Cancelar' : shift ? 'Editar' : '+ Turno'}
                        </button>
                        {shift && !isEditing && (
                          <button onClick={() => handleDelete(iso)} disabled={deleting === iso}
                            title="Eliminar turno" aria-label="Eliminar turno"
                            style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', padding: '0 0.5rem', borderRadius: 'var(--w-r-md)', border: '1px solid var(--w-border-strong)', cursor: deleting === iso ? 'wait' : 'pointer', backgroundColor: bg, color: 'var(--w-danger-text)', fontWeight: 700, fontSize: '0.75rem', boxShadow: shadowOut, opacity: deleting === iso ? 0.45 : 1, display: 'flex', alignItems: 'center' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline edit form */}
                    <AnimatePresence>
                      {isEditing && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: `1px solid var(--w-border)` }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.625rem' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.3125rem' }}>Entrada</label>
                              <input type="time" value={form.start} onChange={e => setForm(p => ({ ...p, start: e.target.value }))}
                                style={{ width: '100%', minHeight: 44, padding: '0.5rem 0.75rem', borderRadius: 'var(--w-r-md)', border: 'none', backgroundColor: bgSurf, color: txt, fontSize: '0.875rem', fontFamily: 'inherit', boxShadow: shadowIn }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.3125rem' }}>Salida</label>
                              <input type="time" value={form.end} onChange={e => setForm(p => ({ ...p, end: e.target.value }))}
                                style={{ width: '100%', minHeight: 44, padding: '0.5rem 0.75rem', borderRadius: 'var(--w-r-md)', border: 'none', backgroundColor: bgSurf, color: txt, fontSize: '0.875rem', fontFamily: 'inherit', boxShadow: shadowIn }} />
                            </div>
                          </div>
                          <input
                            value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                            placeholder="Notas opcionales (turno doble, cubrir ausencia...)"
                            style={{ width: '100%', minHeight: 44, padding: '0.5rem 0.75rem', borderRadius: 'var(--w-r-md)', border: 'none', backgroundColor: bgSurf, color: txt, fontSize: '0.8125rem', fontFamily: 'inherit', boxShadow: shadowIn, marginBottom: '0.625rem', boxSizing: 'border-box' }} />
                          <button onClick={() => handleSave(iso)} disabled={saving}
                            style={{ width: '100%', minHeight: 44, padding: '0.625rem', borderRadius: 'var(--w-r-md)', border: 'none', cursor: saving ? 'wait' : 'pointer', backgroundColor: acc, color: 'var(--w-on-accent)', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.875rem', opacity: saving ? 0.7 : 1, transition: 'opacity 0.15s ease' }}>
                            {saving ? 'Guardando...' : 'Guardar turno ✓'}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>
          )
        }

        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </motion.div>
    </motion.div>
  )
}
