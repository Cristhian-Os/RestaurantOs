/**
 * EmployeeTasksView.tsx
 * Vista de tareas para waiter, kitchen y cashier.
 * Muestra las tareas asignadas y permite enviar evidencia fotográfica.
 */
import { useState, useCallback, memo } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase }       from '../../services/supabaseClient'
import { EvidenceUpload } from './EvidenceUpload'
import { useRealtimeTasks } from './useRealtimeTasks'
import { ModuleHeader, StatCard, IconBubble } from './ModuleHeader'
import { Tabs } from '../ui/Tabs'
import { StatePanel } from '../ui/StatePanel'
import { Badge } from '../ui/Badge'
import type { Tone } from '../ui/Badge'
import message from 'antd/es/message'
import type { Task, TaskStatus, Profile } from '../../types'


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

// ─── Configuración visual por estado y prioridad ─────────────
const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; emoji: string }> = {
  pending:     { label: 'Pendiente',   color: 'bg-[var(--w-warning-bg)] text-[color:var(--w-warning-text)]',   emoji: '' },
  in_progress: { label: 'En progreso', color: 'bg-[var(--w-info-bg)] text-[color:var(--w-info-text)]',     emoji: '' },
  completed:   { label: 'Completada',  color: 'bg-[var(--w-success-bg)] text-[color:var(--w-success-text)]', emoji: '' },
  rejected:    { label: 'Rechazada',   color: 'bg-[var(--w-danger-bg)] text-[color:var(--w-danger-text)]',       emoji: '' },
}

const PRIORITY_CONFIG = {
  low:    { label: 'Baja',     dot: 'bg-[var(--w-text-3)]'    },
  medium: { label: 'Media',    dot: 'bg-[var(--w-info)]'    },
  high:   { label: 'Alta',     dot: 'bg-[var(--w-warning)]'  },
  urgent: { label: 'Urgente',  dot: 'bg-[var(--w-danger)]'     },
}

function formatDueDate(due: string | null): string {
  if (!due) return ''
  const d    = new Date(due)
  const now  = new Date()
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0)  return `Venció hace ${Math.abs(diff)} días`
  if (diff === 0) return 'Vence hoy'
  if (diff === 1) return 'Vence mañana'
  return `Vence en ${diff} días`
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Error desconocido'
}

// ─── Componente ───────────────────────────────────────────────
interface EmployeeTasksViewProps { profile: Profile }

export const EmployeeTasksView = memo<EmployeeTasksViewProps>(({ profile }) => {
  const { tasks, loading, refetch } = useRealtimeTasks({ userId: profile.id })
  const [activeUpload, setActiveUpload] = useState<string | null>(null)
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')

  const startTask = useCallback(async (taskId: string) => {
    // Acepta tareas pendientes Y rechazadas (para el botón "Reintentar")
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'in_progress' })
      .eq('id', taskId)
      .in('status', ['pending', 'rejected'])
      .eq('assigned_to', profile.id)
    if (error) message.error(getErrorMessage(error))
    else refetch()
  }, [profile.id, refetch])

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)
  const pending   = tasks.filter(t => t.status === 'pending').length
  const inProg    = tasks.filter(t => t.status === 'in_progress').length
  const completed = tasks.filter(t => t.status === 'completed').length

  return (
    <div className="mx-auto w-full max-w-6xl">
      <ModuleHeader
        icon={<IcTasks />}
        title="Mis tareas"
        subtitle="Revisa y completa tus asignaciones"
        actions={
          <button onClick={refetch} className="flex min-h-[44px] items-center gap-2 rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] bg-[var(--w-surface)] px-4 text-sm font-semibold text-[color:var(--w-text-2)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Actualizar
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total de tareas', value: tasks.length, tone: 'accent' as const, icon: <IcTasks /> },
          { label: 'Pendientes',  value: pending,   tone: 'warning' as const, icon: <IcClock />   },
          { label: 'En progreso', value: inProg,    tone: 'info' as const, icon: <IcPlay />    },
          { label: 'Completadas', value: completed, tone: 'success' as const, icon: <IcCheck /> },
        ].map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} tone={s.tone} icon={s.icon} />
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-5 max-w-full overflow-x-auto pb-1">
        <Tabs
          label="Filtrar tareas"
          value={filter}
          onChange={setFilter}
          items={[{ key: 'all' as const, label: `Todas (${tasks.length})`, icon: <IcTasks /> }, ...(['pending', 'in_progress', 'completed', 'rejected'] as const).map(k => ({ key: k, label: `${STATUS_CONFIG[k].label} (${tasks.filter(t => t.status === k).length})`, icon: ST_ICON[k] }))]}
        />
      </div>

      {/* Lista de tareas */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[var(--w-accent)] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <StatePanel
          kind="empty"
          title="Sin tareas"
          text={filter === 'all' ? 'No tienes tareas asignadas' : 'Sin tareas en este estado'}
        />
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {filtered.map((task, i) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: EASE }}
            >
              <EmployeeTaskCard
                task={task}
                onStart={() => startTask(task.id)}
                onUploadEvidence={() => setActiveUpload(task.id)}
              />

              {/* Panel de carga de evidencia inline */}
              <AnimatePresence>
                {activeUpload === task.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="mt-3 overflow-hidden"
                  >
                    <EvidenceUpload
                      taskId={task.id}
                      userId={profile.id}
                      taskTitle={task.title}
                      onSuccess={() => { setActiveUpload(null); refetch() }}
                      onCancel={() => setActiveUpload(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
})
EmployeeTasksView.displayName = 'EmployeeTasksView'

// ─── Tarjeta de tarea para empleado ──────────────────────────
interface EmployeeTaskCardProps {
  task:              Task
  onStart:           () => void
  onUploadEvidence:  () => void
}

const EmployeeTaskCard = memo<EmployeeTaskCardProps>(({ task, onStart, onUploadEvidence }) => {
  const st   = STATUS_CONFIG[task.status]
  const pri  = PRIORITY_CONFIG[task.priority]
  const due  = formatDueDate(task.due_date)
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'

  return (
    <div
      className={`bg-[var(--w-surface)] rounded-[var(--w-r-lg)] border border-[var(--w-border)] p-5 ${isOverdue ? 'border-l-4 border-[var(--w-danger)]' : ''}`}
      style={S.neoOut}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <IconBubble tone={TONE[task.status]} size={44}>{ST_ICON[task.status]}</IconBubble>
        <div className="min-w-0 flex-1">
          {/* Prioridad */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`w-2 h-2 rounded-full ${pri.dot}`} />
            <span className="text-[0.625rem] font-bold text-[color:var(--w-text-3)] uppercase tracking-wider">{pri.label}</span>
          </div>
          <h3 className="font-bold text-[color:var(--w-text)] leading-snug" style={{ fontFamily: 'var(--w-font)' }}>
            {task.title}
          </h3>
        </div>
        <Badge tone={TONE[task.status]} className="shrink-0">{st.label}</Badge>
      </div>

      {/* Descripción */}
      {task.description && (
        <p className="text-sm text-[color:var(--w-text-2)] mb-3 leading-relaxed">{task.description}</p>
      )}

      {/* Fecha límite */}
      {due && (
        <p className={`text-xs font-medium mb-4 ${isOverdue ? 'text-[color:var(--w-danger-text)]' : 'text-[color:var(--w-text-3)]'}`}>{due}</p>
      )}

      {/* Acciones */}
      <div className="flex gap-2">
        {task.status === 'pending' && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onStart}
            className="flex-1 min-h-[44px] rounded-[var(--w-r-md)] text-xs font-bold text-[color:var(--w-on-accent)] bg-[var(--w-accent)]"
            style={S.coral}
          >
            Iniciar tarea
          </motion.button>
        )}

        {task.status === 'in_progress' && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onUploadEvidence}
            className="flex-1 min-h-[44px] rounded-[var(--w-r-md)] text-xs font-bold text-[color:var(--w-on-accent)] bg-[var(--w-accent)] flex items-center justify-center gap-2"
            style={S.coral}
          >
            Enviar evidencia
          </motion.button>
        )}

        {task.status === 'rejected' && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onStart}
            className="flex-1 min-h-[44px] rounded-[var(--w-r-md)] text-xs font-bold text-[color:var(--w-warning-text)] bg-[var(--w-surface)] border border-[var(--w-border-strong)]"
            style={S.neoOut}
          >
            Reintentar
          </motion.button>
        )}

        {task.status === 'completed' && (
          <div className="flex-1 min-h-[44px] rounded-[var(--w-r-md)] text-xs font-bold text-[color:var(--w-success-text)] bg-[var(--w-surface)] border border-[var(--w-border-strong)] flex items-center justify-center gap-2" style={S.neoOut}>
            Completada con evidencia
          </div>
        )}
      </div>
    </div>
  )
})
EmployeeTaskCard.displayName = 'EmployeeTaskCard'
