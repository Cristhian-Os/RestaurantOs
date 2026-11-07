/**
 * AdminTasksView.tsx
 * Panel completo de gestión de tareas para el administrador.
 * Crear, asignar, seguir estado y revisar evidencias fotográficas.
 */
import { useState, useCallback, useMemo, memo, useRef } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase }          from '../../services/supabaseClient'
import { VoiceButton } from '../VoiceButton'
import { matchName } from '../../services/voiceMatch'
import message               from 'antd/es/message'
import Popconfirm            from 'antd/es/popconfirm'
import { useRealtimeTasks }  from './useRealtimeTasks'
import { ModuleHeader, StatCard, IconBubble } from './ModuleHeader'
import { Tabs } from '../ui/Tabs'
import { StatePanel } from '../ui/StatePanel'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import type { Tone } from '../ui/Badge'
import type { Task, TaskStatus, TaskPriority, Profile } from '../../types'


const ico = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24' } as const
const IcClock = () => <svg {...ico}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
const IcPlay  = () => <svg {...ico}><circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/></svg>
const IcCheck = () => <svg {...ico}><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>
const IcX     = () => <svg {...ico}><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>
const IcTasks = () => <svg {...ico}><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>

const TONE: Record<TaskStatus, Tone> = { pending: 'warning', in_progress: 'info', completed: 'success', rejected: 'danger' }
const ST_ICON: Record<TaskStatus, ReactNode> = { pending: <IcClock />, in_progress: <IcPlay />, completed: <IcCheck />, rejected: <IcX /> }

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]
const S = {
  neoOut:  { boxShadow: 'var(--w-shadow-sm)' },
  neoOutSm:{ boxShadow: 'var(--w-shadow-sm)' },
  neoIn:   { boxShadow: 'inset 0 0 0 1px var(--w-border)' },
  coral:   { boxShadow: 'var(--w-shadow-terra)' },
} as const

const STATUS_CFG: Record<TaskStatus, { label: string; color: string }> = {
  pending:     { label: 'Pendiente',   color: 'bg-[var(--w-warning-bg)] text-[color:var(--w-warning-text)]'    },
  in_progress: { label: 'En progreso', color: 'bg-[var(--w-info-bg)] text-[color:var(--w-info-text)]'      },
  completed:   { label: 'Completada',  color: 'bg-[var(--w-success-bg)] text-[color:var(--w-success-text)]'},
  rejected:    { label: 'Rechazada',   color: 'bg-[var(--w-danger-bg)] text-[color:var(--w-danger-text)]'        },
}

const PRIORITY_CFG: Record<TaskPriority, { label: string; dot: string }> = {
  low:    { label: 'Baja',    dot: 'bg-[var(--w-text-3)]'   },
  medium: { label: 'Media',   dot: 'bg-[var(--w-info)]'   },
  high:   { label: 'Alta',    dot: 'bg-[var(--w-warning)]' },
  urgent: { label: 'Urgente', dot: 'bg-[var(--w-danger)]'    },
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

interface VoiceTask { transcript: string; title: string; description?: string; assignee_name?: string; priority: TaskPriority; due_date?: string }

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

  // Lo dictado llena el formulario; el admin lo revisa/corrige y pulsa Crear.
  const fillFromVoice = useCallback((r: VoiceTask) => {
    const emp = matchName(r.assignee_name, employees, e => e.full_name ?? '')
    setForm(p => ({
      title: r.title?.trim() || p.title,
      description: r.description?.trim() || p.description,
      assigned_to: emp?.id ?? p.assigned_to,
      priority: (['low', 'medium', 'high', 'urgent'] as const).includes(r.priority) ? r.priority : p.priority,
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(r.due_date ?? '') ? r.due_date : p.due_date,
    }))
    if (r.assignee_name && !emp) message.warning('No encontré al empleado "' + r.assignee_name + '". Elígelo en la lista.')
  }, [employees])

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
    // La confirmación la maneja el Popconfirm del botón (estilo de la app)
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) {
      console.error('Error deleting task:', error)
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

  const pct = (n: number) => (stats.total === 0 ? 0 : Math.round((n / stats.total) * 100))

  return (
    <div>
      <ModuleHeader
        icon={<IcTasks />}
        title="Gestión de tareas"
        subtitle={`${stats.total} tareas en total`}
        actions={<>
          <button onClick={refetch} className="flex min-h-[44px] items-center gap-2 rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] bg-[var(--w-surface)] px-4 text-sm font-semibold text-[color:var(--w-text-2)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Actualizar
          </button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleOpenForm}
            className="flex min-h-[44px] items-center gap-2 rounded-[var(--w-r-md)] bg-[var(--w-accent)] px-5 text-sm font-semibold text-[color:var(--w-on-accent)]"
            style={S.coral}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
              <path d="M12 4v16m-8-8h16"/>
            </svg>
            Nueva tarea
          </motion.button>
        </>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total de tareas', value: stats.total,     tone: 'accent' as const,  icon: <IcTasks /> },
          { label: 'En progreso',     value: stats.inProg,    tone: 'info' as const,    icon: <IcPlay />  },
          { label: 'Pendientes',      value: stats.pending,   tone: 'warning' as const, icon: <IcClock /> },
          { label: 'Completadas',     value: stats.completed, tone: 'success' as const, icon: <IcCheck /> },
          ...(stats.rejected > 0 ? [{ label: 'Rechazadas', value: stats.rejected, tone: 'danger' as const, icon: <IcX /> }] : []),
        ].map(c => (
          <StatCard key={c.label} label={c.label} value={c.value} tone={c.tone} icon={c.icon} />
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
            <div className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] border border-[var(--w-border)] p-6" style={S.neoOut}>
              <div className="flex items-center justify-between mb-5 gap-3">
                <h2 className="font-bold text-[color:var(--w-text)]" style={{ fontFamily: 'var(--w-font)' }}>
                  Nueva tarea
                </h2>
                <VoiceButton<VoiceTask>
                  kind="task" label="Dictar tarea"
                  context={() => ({ employees: employees.map(e => e.full_name), today: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) })}
                  onResult={fillFromVoice}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Título */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-[color:var(--w-text-3)] uppercase tracking-wider">Título *</label>
                    <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => setForm(p => ({ ...p, title: (p.title ? p.title + ' ' : '') + r.transcript.trim() }))} />
                  </div>
                  <input
                    value={form.title}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Ej: Limpiar área de cocina"
                    maxLength={200}
                    className="w-full bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-4 py-3 text-sm text-[color:var(--w-text)] border border-[var(--w-border)]"
                    style={S.neoIn}
                  />
                </div>
                {/* Descripción */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-[color:var(--w-text-3)] uppercase tracking-wider">Descripción</label>
                    <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => setForm(p => ({ ...p, description: (p.description ? p.description + ' ' : '') + r.transcript.trim() }))} />
                  </div>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Detalles de la tarea..."
                    maxLength={1000}
                    rows={2}
                    className="w-full bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-4 py-3 text-sm text-[color:var(--w-text)] border border-[var(--w-border)] resize-none"
                    style={S.neoIn}
                  />
                </div>
                {/* Empleado */}
                <div>
                  <label className="block text-xs font-bold text-[color:var(--w-text-3)] uppercase tracking-wider mb-2">
                    Asignar a *
                    {loadingEmployees && <span className="ml-2 text-[color:var(--w-accent-text)] normal-case font-normal">cargando...</span>}
                  </label>
                  <select
                    value={form.assigned_to}
                    onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}
                    className="w-full bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-4 py-3 text-sm text-[color:var(--w-text)] border border-[var(--w-border)]"
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
                    <p className="text-xs text-[color:var(--w-danger-text)] mt-1 flex items-center gap-1">
                      No se encontraron empleados.{' '}
                      <button
                        type="button"
                        onClick={() => loadEmployees(true)}
                        className="underline text-[color:var(--w-accent-text)]"
                      >
                        Reintentar
                      </button>
                    </p>
                  )}
                </div>
                {/* Prioridad */}
                <div>
                  <label className="block text-xs font-bold text-[color:var(--w-text-3)] uppercase tracking-wider mb-2">Prioridad</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(p => ({ ...p, priority: e.target.value as TaskPriority }))}
                    className="w-full bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-4 py-3 text-sm text-[color:var(--w-text)] border border-[var(--w-border)]"
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
                  <label className="block text-xs font-bold text-[color:var(--w-text-3)] uppercase tracking-wider mb-2">Fecha límite</label>
                  <input
                    type="datetime-local"
                    value={form.due_date}
                    onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                    className="w-full bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-4 py-3 text-sm text-[color:var(--w-text)] border border-[var(--w-border)]"
                    style={S.neoIn}
                  />
                </div>
              </div>

              {formError && (
                <p className="text-xs text-[color:var(--w-danger-text)] font-medium mb-4 flex items-center gap-1.5">
                  <span></span> {formError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowForm(false); setForm(FORM_INITIAL); setFormError(null) }}
                  className="flex-1 min-h-[44px] rounded-[var(--w-r-md)] text-sm font-bold text-[color:var(--w-text-2)] bg-[var(--w-surface)] border border-[var(--w-border-strong)]"
                  style={S.neoOut}
                >
                  Cancelar
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCreate}
                  disabled={creating}
                  className={`flex-1 min-h-[44px] rounded-[var(--w-r-md)] text-sm font-bold text-[color:var(--w-on-accent)] bg-[var(--w-accent)] ${creating ? 'opacity-70' : ''}`}
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
      <div className="mb-5 max-w-full overflow-x-auto pb-1">
        <Tabs
          label="Filtrar tareas"
          value={filterStatus}
          onChange={setFilter}
          items={[{ key: 'all' as const, label: `Todas (${stats.total})`, icon: <IcTasks /> }, ...(['pending', 'in_progress', 'completed', 'rejected'] as const).map(k => ({ key: k, label: `${STATUS_CFG[k].label} (${tasks.filter(t => t.status === k).length})`, icon: ST_ICON[k] }))]}
        />
      </div>

      {/* Lista de tareas + resumen */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[var(--w-accent)] border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          {filtered.length === 0 ? (
            <StatePanel kind="empty" title="Sin tareas" text="Crea la primera tarea para tu equipo" />
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

          <Card className="p-5" aria-label="Resumen de tareas">
            <h2 className="mb-4 font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-title)]" style={{ fontFamily: 'var(--w-font)' }}>Resumen</h2>
            <div
              className="relative mx-auto mb-4 h-[132px] w-[132px] rounded-full"
              style={{ background: stats.total === 0 ? 'var(--w-surface-sunken)' : `conic-gradient(var(--w-success) 0 ${pct(stats.completed)}%, var(--w-info) 0 ${pct(stats.completed + stats.inProg)}%, var(--w-warning) 0 ${pct(stats.completed + stats.inProg + stats.pending)}%, var(--w-danger) 0 100%)` }}
            >
              <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-[var(--w-surface)]">
                <span className="font-bold leading-none text-[color:var(--w-text)] text-[length:var(--w-fs-kpi)]">{pct(stats.completed)}%</span>
                <span className="mt-1 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Completadas</span>
              </div>
            </div>
            <ul className="grid gap-2 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
              {([['Completadas', stats.completed, 'success'], ['En progreso', stats.inProg, 'info'], ['Pendientes', stats.pending, 'warning'], ['Rechazadas', stats.rejected, 'danger']] as const).map(([l, n, c]) => (
                <li key={l} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: `var(--w-${c})` }} />{l}</span>
                  <span className="font-bold text-[color:var(--w-text)]">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
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
    <div className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] border border-[var(--w-border)] p-5" style={S.neoOut}>
      <div className="flex items-start gap-3">
        <IconBubble tone={TONE[task.status]} size={44}>{ST_ICON[task.status]}</IconBubble>

        <div className="flex-1 min-w-0">
          {/* Título + estado */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-bold text-[color:var(--w-text)] text-sm leading-snug" style={{ fontFamily: 'var(--w-font)' }}>
              {task.title}
            </p>
            <Badge tone={TONE[task.status]} className="shrink-0">{st.label}</Badge>
          </div>

          {/* Asignado a */}
          <p className="text-xs text-[color:var(--w-text-3)] mb-2">
            {(task as { assignee_name?: string }).assignee_name ?? 'Sin asignar'} · <span aria-hidden className={`inline-block h-2 w-2 rounded-full align-middle ${pri.dot}`} /> {pri.label}
            {task.due_date && (
              <span className="ml-2">
                · {new Date(task.due_date).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
              </span>
            )}
          </p>

          {/* Descripción */}
          {task.description && (
            <p className="text-xs text-[color:var(--w-text-2)] mb-3 line-clamp-2">{task.description}</p>
          )}

          {/* Acciones */}
          <div className="flex gap-2 flex-wrap">
            {evidenceCount > 0 && (
              <button
                onClick={onViewEvidence}
                className="flex items-center gap-1.5 text-xs font-bold text-[color:var(--w-info-text)] bg-[var(--w-surface)] border border-[var(--w-border-strong)] min-h-[44px] px-3 rounded-[var(--w-r-md)]"
                style={S.neoOutSm}
              >
                Ver evidencia ({evidenceCount})
              </button>
            )}

            {task.status === 'completed' && evidenceCount > 0 && (
              <button
                onClick={onReject}
                className="text-xs font-bold text-[color:var(--w-danger-text)] bg-[var(--w-surface)] border border-[var(--w-border-strong)] min-h-[44px] px-3 rounded-[var(--w-r-md)]"
                style={S.neoOutSm}
              >
                Rechazar
              </button>
            )}

            <Popconfirm
              title="¿Eliminar esta tarea?"
              description="Esta acción no se puede deshacer."
              onConfirm={onDelete}
              okText="Sí, eliminar"
              cancelText="Cancelar"
              okButtonProps={{ danger: true }}
            >
              <button
                title="Eliminar tarea"
                aria-label="Eliminar tarea"
                className="text-xs font-bold text-[color:var(--w-text-3)] bg-[var(--w-surface)] border border-[var(--w-border-strong)] min-h-[44px] px-3 rounded-[var(--w-r-md)] ml-auto flex items-center"
                style={S.neoOutSm}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
              </button>
            </Popconfirm>
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
      className="fixed inset-0 bg-[var(--w-overlay)] backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={e => e.stopPropagation()}
        className="bg-[var(--w-surface)] rounded-[var(--w-r-lg)] border border-[var(--w-border)] p-6 w-full max-w-md max-h-[80vh] overflow-y-auto"
        style={S.neoOut}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs font-bold text-[color:var(--w-accent-text)] uppercase tracking-wider mb-1">Evidencia fotográfica</p>
            <h3 className="font-bold text-[color:var(--w-text)]" style={{ fontFamily: 'var(--w-font)' }}>
              {task.title}
            </h3>
            <p className="text-xs text-[color:var(--w-text-3)] mt-0.5">
              {(task as { assignee_name?: string }).assignee_name ?? '—'}
            </p>
          </div>
          <button onClick={onClose} className="text-[color:var(--w-text-3)] p-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Fotos */}
        <div className="flex flex-col gap-5">
          {evidence.length === 0 ? (
            <p className="text-center text-[color:var(--w-text-3)] py-8">Sin evidencia enviada</p>
          ) : (
            evidence.map(ev => (
              <div key={ev.id} className="flex flex-col gap-3">
                {/* Foto */}
                <div className="w-full rounded-[var(--w-r-md)] overflow-hidden" style={S.neoIn}>
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
                <div className="flex justify-between text-xs text-[color:var(--w-text-3)]">
                  <span>{new Date(ev.submitted_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <a
                    href={ev.photo_url}
                    download
                    className="text-[color:var(--w-accent-text)] font-bold"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                   Descargar
                  </a>
                </div>
                {ev.notes && (
                  <p className="text-xs text-[color:var(--w-text-2)] bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 py-2" style={S.neoIn}>
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
              className="flex-1 min-h-[44px] rounded-[var(--w-r-md)] text-sm font-bold text-[color:var(--w-danger-text)] bg-[var(--w-surface)] border border-[var(--w-border-strong)]"
              style={S.neoOut}
            >
              Rechazar evidencia
            </button>
            <button
              onClick={onClose}
              className="flex-1 min-h-[44px] rounded-[var(--w-r-md)] text-sm font-bold text-[color:var(--w-success-text)] bg-[var(--w-surface)] border border-[var(--w-border-strong)]"
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
