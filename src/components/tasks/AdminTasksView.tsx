/**
 * AdminTasksView.tsx
 * Panel completo de gestión de tareas para el administrador.
 * Crear, asignar, seguir estado y revisar evidencias fotográficas.
 */
import { useState, useCallback, useMemo, memo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase }          from '../../services/supabaseClient'
import message               from 'antd/es/message'
import { useRealtimeTasks }  from './useRealtimeTasks'
import type { Task, TaskStatus, TaskPriority, Profile } from '../../types'

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]
const S = {
  neoOut:  { boxShadow: 'var(--shadow-out)' },
  neoOutSm:{ boxShadow: 'var(--shadow-out-sm)' },
  neoIn:   { boxShadow: 'var(--shadow-in)' },
  coral:   { boxShadow: 'var(--shadow-coral)' },
} as const

const STATUS_CFG: Record<TaskStatus, { label: string; color: string }> = {
  pending:     { label: 'Pendiente',   color: 'bg-amber-100 text-amber-700'    },
  in_progress: { label: 'En progreso', color: 'bg-blue-100 text-blue-700'      },
  completed:   { label: 'Completada',  color: 'bg-emerald-100 text-emerald-700'},
  rejected:    { label: 'Rechazada',   color: 'bg-red-100 text-red-600'        },
}

const PRIORITY_CFG: Record<TaskPriority, { label: string; dot: string }> = {
  low:    { label: 'Baja',    dot: 'bg-gray-400'   },
  medium: { label: 'Media',   dot: 'bg-blue-500'   },
  high:   { label: 'Alta',    dot: 'bg-orange-500' },
  urgent: { label: 'Urgente', dot: 'bg-red-500'    },
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Error desconocido'
}

// ─── Formulario nueva tarea ───────────────────────────────────
interface NewTaskForm {
  title:       string
  description: string
  assigned_to: string
  priority:    TaskPriority
  due_date:    string
}

const FORM_INITIAL: NewTaskForm = {
  title: '', description: '', assigned_to: '',
  priority: 'medium', due_date: '',
}

// ─── Componente principal ─────────────────────────────────────
interface AdminTasksViewProps { profile: Profile }

export const AdminTasksView = memo<AdminTasksViewProps>(({ profile }) => {
  const { tasks, loading, refetch } = useRealtimeTasks({ isAdmin: true })
  const [showForm,     setShowForm]   = useState(false)
  const [form,         setForm]       = useState<NewTaskForm>(FORM_INITIAL)
  const [creating,     setCreating]   = useState(false)
  const [formError,    setFormError]  = useState<string | null>(null)
  const [filterStatus, setFilter]     = useState<TaskStatus | 'all'>('all')
  const [evidenceTask, setEvidenceTask] = useState<Task | null>(null)
  const [employees,    setEmployees]  = useState<Profile[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const loadedEmployees = useRef(false)

  // Cargar empleados con manejo de error y reintentos
  const loadEmployees = useCallback(async (force = false) => {
    if (loadedEmployees.current && !force) return
    loadedEmployees.current = true
    setLoadingEmployees(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['waiter', 'kitchen', 'cashier'])
        .order('full_name')
      if (error) throw error
      setEmployees((data ?? []) as Profile[])
    } catch (e) {
      console.error('Error loading employees:', e)
      loadedEmployees.current = false // permitir reintento
    } finally {
      setLoadingEmployees(false)
    }
  }, [])

  const handleOpenForm = useCallback(() => {
    setShowForm(true)
    loadEmployees()
  }, [loadEmployees])

  const handleCreate = useCallback(async () => {
    setFormError(null)
    if (!form.title.trim())    { setFormError('El título es requerido');       return }
    if (!form.assigned_to)     { setFormError('Selecciona un empleado');       return }

    setCreating(true)
    try {
      const { error } = await supabase.from('tasks').insert({
        title:       form.title.trim(),
        description: form.description.trim() || null,
        assigned_to: form.assigned_to,
        created_by:  profile.id,
        priority:    form.priority,
        due_date:    form.due_date || null,
        status:      'pending',
      })
      if (error) throw error
      setForm(FORM_INITIAL)
      setShowForm(false)
      refetch()
    } catch (e) {
      setFormError(getErrorMessage(e))
    } finally {
      setCreating(false)
    }
  }, [form, profile.id, refetch])

  const handleRejectTask = useCallback(async (taskId: string) => {
    const { error } = await supabase.from('tasks').update({ status: 'rejected' }).eq('id', taskId)
    if (error) message.error('Error al rechazar: ' + error.message)
    else refetch()
  }, [refetch])

  const handleApproveTask = useCallback(async (taskId: string) => {
    const { error } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', taskId)
    if (error) message.error('Error al aprobar: ' + error.message)
    else refetch()
  }, [refetch])

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!confirm('¿Eliminar esta tarea? Esta acción no se puede deshacer.')) return
    // FIX SEC#2 — manejo de error en eliminación
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) {
      console.error('Error deleting task:', error)
      // message import needed — use browser alert as fallback
      message.error('Error al eliminar: ' + error.message)
    } else {
      refetch()
    }
  }, [refetch])

  const filtered = useMemo(() =>
    filterStatus === 'all' ? tasks : tasks.filter(t => t.status === filterStatus),
    [tasks, filterStatus]
  )

  const stats = useMemo(() => ({
    total:     tasks.length,
    pending:   tasks.filter(t => t.status === 'pending').length,
    inProg:    tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    rejected:  tasks.filter(t => t.status === 'rejected').length,
  }), [tasks])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Gestión de Tareas
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-0.5">{stats.total} tareas en total</p>
        </div>
        <div className="flex gap-3">
          <button onClick={refetch} className="flex items-center gap-2 text-sm font-semibold text-[#6B7280] px-4 py-2.5 rounded-2xl bg-[#D8DAE4]" style={S.neoOutSm}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Actualizar
          </button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleOpenForm}
            className="flex items-center gap-2 text-sm font-bold text-white bg-[#FF5722] px-5 py-2.5 rounded-2xl"
            style={S.coral}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
              <path d="M12 4v16m-8-8h16"/>
            </svg>
            Nueva tarea
          </motion.button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Pendientes',   value: stats.pending,   color: 'text-amber-600' },
          { label: 'En progreso',  value: stats.inProg,    color: 'text-blue-600'  },
          { label: 'Completadas',  value: stats.completed, color: 'text-emerald-600' },
          { label: 'Rechazadas',   value: stats.rejected,  color: 'text-red-500'   },
        ].map(s => (
          <div key={s.label} className="bg-[#D8DAE4] rounded-2xl p-4 text-center" style={S.neoOutSm}>
            <p className={`text-2xl font-bold ${s.color}`} style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {s.value}
            </p>
            <p className="text-xs text-[#9CA3AF] font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Formulario nueva tarea */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="mb-6"
            style={{ overflow: 'visible' }}
          >
            <div className="bg-[#D8DAE4] rounded-3xl p-6" style={S.neoOut}>
              <h2 className="font-bold text-[#2D3561] mb-5" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                Nueva tarea
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Título */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Título *</label>
                  <input
                    value={form.title}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Ej: Limpiar área de cocina"
                    maxLength={200}
                    className="w-full bg-[#CDD0DC] rounded-xl px-4 py-3 text-sm text-[#2D3561] border-none outline-none"
                    style={S.neoIn}
                  />
                </div>
                {/* Descripción */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Descripción</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Detalles de la tarea..."
                    maxLength={1000}
                    rows={2}
                    className="w-full bg-[#CDD0DC] rounded-xl px-4 py-3 text-sm text-[#2D3561] border-none outline-none resize-none"
                    style={S.neoIn}
                  />
                </div>
                {/* Empleado */}
                <div>
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">
                    Asignar a *
                    {loadingEmployees && <span className="ml-2 text-[#FF5722] normal-case font-normal">cargando...</span>}
                  </label>
                  <select
                    value={form.assigned_to}
                    onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}
                    className="w-full bg-[#CDD0DC] rounded-xl px-4 py-3 text-sm text-[#2D3561] border-none outline-none"
                    style={S.neoIn}
                    disabled={loadingEmployees}
                  >
                    <option value="">
                      {loadingEmployees ? 'Cargando empleados...' : 'Seleccionar empleado'}
                    </option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name ?? emp.id.slice(-6)} ({emp.role})
                      </option>
                    ))}
                  </select>
                  {!loadingEmployees && employees.length === 0 && (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      No se encontraron empleados.{' '}
                      <button
                        type="button"
                        onClick={() => loadEmployees(true)}
                        className="underline text-[#FF5722]"
                      >
                        Reintentar
                      </button>
                    </p>
                  )}
                </div>
                {/* Prioridad */}
                <div>
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Prioridad</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(p => ({ ...p, priority: e.target.value as TaskPriority }))}
                    className="w-full bg-[#CDD0DC] rounded-xl px-4 py-3 text-sm text-[#2D3561] border-none outline-none"
                    style={S.neoIn}
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
                {/* Fecha límite */}
                <div>
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Fecha límite</label>
                  <input
                    type="datetime-local"
                    value={form.due_date}
                    onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                    className="w-full bg-[#CDD0DC] rounded-xl px-4 py-3 text-sm text-[#2D3561] border-none outline-none"
                    style={S.neoIn}
                  />
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-500 font-medium mb-4 flex items-center gap-1.5">
                  <span></span> {formError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowForm(false); setForm(FORM_INITIAL); setFormError(null) }}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-[#6B7280] bg-[#D8DAE4]"
                  style={S.neoOut}
                >
                  Cancelar
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCreate}
                  disabled={creating}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#FF5722] ${creating ? 'opacity-70' : ''}`}
                  style={S.coral}
                >
                  {creating ? 'Creando...' : 'Crear tarea'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filtros */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
        {(['all', 'pending', 'in_progress', 'completed', 'rejected'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
            style={
              filterStatus === f
                ? { background: 'var(--accent)', color: 'white', ...S.coral }
                : { background: 'var(--bg)', color: 'var(--text-secondary)', ...S.neoOutSm }
            }
          >
            {f === 'all' ? 'Todas' : STATUS_CFG[f as TaskStatus].label}
          </button>
        ))}
      </div>

      {/* Tabla de tareas */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#FF5722] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#D8DAE4] rounded-3xl p-12 text-center" style={S.neoIn}>
          <p className="text-4xl mb-3"></p>
          <p className="font-bold text-[#2D3561]">Sin tareas</p>
          <p className="text-sm text-[#9CA3AF] mt-1">Crea la primera tarea para tu equipo</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((task, i) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.35, ease: EASE }}
            >
              <AdminTaskCard
                task={task}
                onViewEvidence={() => setEvidenceTask(task)}
                onReject={() => handleRejectTask(task.id)}
                onApprove={() => handleApproveTask(task.id)}
                onDelete={() => handleDeleteTask(task.id)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal de evidencia */}
      <AnimatePresence>
        {evidenceTask && (
          <EvidenceModal
            task={evidenceTask}
            onClose={() => setEvidenceTask(null)}
            onReject={() => { handleRejectTask(evidenceTask.id); setEvidenceTask(null) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
})
AdminTasksView.displayName = 'AdminTasksView'

// ─── Tarjeta de tarea admin ───────────────────────────────────
interface AdminTaskCardProps {
  task:           Task
  onViewEvidence: () => void
  onReject:       () => void
  onApprove:      () => void
  onDelete:       () => void
}

const AdminTaskCard = memo<AdminTaskCardProps>(({ task, onViewEvidence, onReject, onApprove, onDelete }) => {
  const st  = STATUS_CFG[task.status]
  const pri = PRIORITY_CFG[task.priority]
  const evidenceCount = task.evidence?.length ?? 0

  return (
    <div className="bg-[#D8DAE4] rounded-2xl p-5" style={S.neoOut}>
      <div className="flex items-start gap-3">
        {/* Prioridad dot */}
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${pri.dot}`} />

        <div className="flex-1 min-w-0">
          {/* Título + estado */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-bold text-[#2D3561] text-sm leading-snug" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {task.title}
            </p>
            <span className={`${st.color} text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0`}>
              {st.label}
            </span>
          </div>

          {/* Asignado a */}
          <p className="text-xs text-[#9CA3AF] mb-2">
            {(task as { assignee_name?: string }).assignee_name ?? 'Sin asignar'} · {pri.label}
            {task.due_date && (
              <span className="ml-2">
                · {new Date(task.due_date).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
              </span>
            )}
          </p>

          {/* Descripción */}
          {task.description && (
            <p className="text-xs text-[#6B7280] mb-3 line-clamp-2">{task.description}</p>
          )}

          {/* Acciones */}
          <div className="flex gap-2 flex-wrap">
            {evidenceCount > 0 && (
              <button
                onClick={onViewEvidence}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-[#D8DAE4] px-3 py-1.5 rounded-xl"
                style={S.neoOutSm}
              >
                Ver evidencia ({evidenceCount})
              </button>
            )}

            {task.status === 'completed' && evidenceCount > 0 && (
              <button
                onClick={onReject}
                className="text-xs font-bold text-red-500 bg-[#D8DAE4] px-3 py-1.5 rounded-xl"
                style={S.neoOutSm}
              >
                Rechazar
              </button>
            )}

            <button
              onClick={onDelete}
              title="Eliminar tarea"
              aria-label="Eliminar tarea"
              className="text-xs font-bold text-[#9CA3AF] bg-[#D8DAE4] px-3 py-1.5 rounded-xl ml-auto flex items-center"
              style={S.neoOutSm}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})
AdminTaskCard.displayName = 'AdminTaskCard'

// ─── Modal de evidencia ───────────────────────────────────────
interface EvidenceModalProps {
  task:     Task
  onClose:  () => void
  onReject: () => void
}

const EvidenceModal = memo<EvidenceModalProps>(({ task, onClose, onReject }) => {
  const evidence = task.evidence ?? []

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#2D3561]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#D8DAE4] rounded-3xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto"
        style={S.neoOut}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs font-bold text-[#FF5722] uppercase tracking-wider mb-1">Evidencia fotográfica</p>
            <h3 className="font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {task.title}
            </h3>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {(task as { assignee_name?: string }).assignee_name ?? '—'}
            </p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] p-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Fotos */}
        <div className="flex flex-col gap-5">
          {evidence.length === 0 ? (
            <p className="text-center text-[#9CA3AF] py-8">Sin evidencia enviada</p>
          ) : (
            evidence.map(ev => (
              <div key={ev.id} className="flex flex-col gap-3">
                {/* Foto */}
                <div className="w-full rounded-2xl overflow-hidden" style={S.neoIn}>
                  <a href={ev.photo_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={ev.photo_url}
                      alt="Evidencia"
                      className="w-full h-56 object-cover hover:opacity-90 transition-opacity"
                      loading="lazy"
                    />
                  </a>
                </div>
                {/* Metadata */}
                <div className="flex justify-between text-xs text-[#9CA3AF]">
                  <span>{new Date(ev.submitted_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <a
                    href={ev.photo_url}
                    download
                    className="text-[#FF5722] font-bold"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                   Descargar
                  </a>
                </div>
                {ev.notes && (
                  <p className="text-xs text-[#6B7280] bg-[#CDD0DC] rounded-xl px-3 py-2" style={S.neoIn}>
                    {ev.notes}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Acciones */}
        {evidence.length > 0 && task.status !== 'rejected' && (
          <div className="flex gap-3 mt-5">
            <button
              onClick={onReject}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-red-500 bg-[#D8DAE4]"
              style={S.neoOut}
            >
              Rechazar evidencia
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-emerald-600 bg-[#D8DAE4]"
              style={S.neoOut}
            >
              Aceptar
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
})
EvidenceModal.displayName = 'EvidenceModal'
