/**
 * EmployeeTasksView.tsx
 * Vista de tareas para waiter, kitchen y cashier.
 * Muestra las tareas asignadas y permite enviar evidencia fotográfica.
 */
import { useState, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase }       from '../../services/supabaseClient'
import { EvidenceUpload } from './EvidenceUpload'
import { useRealtimeTasks } from './useRealtimeTasks'
import type { Task, TaskStatus, Profile } from '../../types'

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]
const S = {
  neoOut:  { boxShadow: '8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55)' },
  neoOutSm:{ boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)' },
  neoIn:   { boxShadow: 'inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5)' },
  coral:   { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
} as const

// ─── Configuración visual por estado y prioridad ─────────────
const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; emoji: string }> = {
  pending:     { label: 'Pendiente',   color: 'bg-amber-100 text-amber-700',   emoji: '⏳' },
  in_progress: { label: 'En progreso', color: 'bg-blue-100 text-blue-700',     emoji: '🔵' },
  completed:   { label: 'Completada',  color: 'bg-emerald-100 text-emerald-700', emoji: '✅' },
  rejected:    { label: 'Rechazada',   color: 'bg-red-100 text-red-600',       emoji: '❌' },
}

const PRIORITY_CONFIG = {
  low:    { label: 'Baja',     dot: 'bg-gray-400'    },
  medium: { label: 'Media',    dot: 'bg-blue-500'    },
  high:   { label: 'Alta',     dot: 'bg-orange-500'  },
  urgent: { label: 'Urgente',  dot: 'bg-red-500'     },
}

function formatDueDate(due: string | null): string {
  if (!due) return ''
  const d    = new Date(due)
  const now  = new Date()
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0)  return `⚠️ Venció hace ${Math.abs(diff)} días`
  if (diff === 0) return '🔴 Vence hoy'
  if (diff === 1) return '🟡 Vence mañana'
  return `📅 Vence en ${diff} días`
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
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'in_progress' })
      .eq('id', taskId)
      .eq('status', 'pending')
      .eq('assigned_to', profile.id)
    if (error) alert(getErrorMessage(error))
    else refetch()
  }, [profile.id, refetch])

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)
  const pending   = tasks.filter(t => t.status === 'pending').length
  const inProg    = tasks.filter(t => t.status === 'in_progress').length
  const completed = tasks.filter(t => t.status === 'completed').length

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Mis Tareas
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-0.5">Revisa y completa tus asignaciones</p>
        </div>
        <button onClick={refetch} className="flex items-center gap-2 text-sm font-semibold text-[#6B7280] px-4 py-2.5 rounded-2xl bg-[#D8DAE4]" style={S.neoOutSm}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pendientes',  value: pending,   color: 'text-amber-600'   },
          { label: 'En progreso', value: inProg,    color: 'text-blue-600'    },
          { label: 'Completadas', value: completed, color: 'text-emerald-600' },
        ].map(s => (
          <div key={s.label} className="bg-[#D8DAE4] rounded-2xl p-4 text-center" style={S.neoOutSm}>
            <p className={`text-2xl font-bold ${s.color}`} style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {s.value}
            </p>
            <p className="text-xs text-[#9CA3AF] font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
        {(['all', 'pending', 'in_progress', 'completed', 'rejected'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
            style={
              filter === f
                ? { background: '#FF5722', color: 'white', ...S.coral }
                : { background: '#D8DAE4', color: '#6B7280', ...S.neoOutSm }
            }
          >
            {f === 'all' ? 'Todas' : STATUS_CONFIG[f as TaskStatus].label}
          </button>
        ))}
      </div>

      {/* Lista de tareas */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-[#FF5722] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#D8DAE4] rounded-3xl p-12 text-center" style={S.neoIn}>
          <p className="text-4xl mb-3">🎉</p>
          <p className="font-bold text-[#2D3561]">Sin tareas</p>
          <p className="text-sm text-[#9CA3AF] mt-1">
            {filter === 'all' ? 'No tienes tareas asignadas' : 'Sin tareas en este estado'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
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
      className={`bg-[#D8DAE4] rounded-3xl p-5 ${isOverdue ? 'border-l-4 border-red-400' : ''}`}
      style={S.neoOut}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          {/* Prioridad */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`w-2 h-2 rounded-full ${pri.dot}`} />
            <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">{pri.label}</span>
          </div>
          <h3 className="font-bold text-[#2D3561] leading-snug" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            {task.title}
          </h3>
        </div>
        <span className={`${st.color} text-xs font-bold px-3 py-1 rounded-full shrink-0 flex items-center gap-1`}>
          {st.emoji} {st.label}
        </span>
      </div>

      {/* Descripción */}
      {task.description && (
        <p className="text-sm text-[#6B7280] mb-3 leading-relaxed">{task.description}</p>
      )}

      {/* Fecha límite */}
      {due && (
        <p className={`text-xs font-medium mb-4 ${isOverdue ? 'text-red-500' : 'text-[#9CA3AF]'}`}>{due}</p>
      )}

      {/* Acciones */}
      <div className="flex gap-2">
        {task.status === 'pending' && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onStart}
            className="flex-1 py-2.5 rounded-2xl text-xs font-bold text-white bg-[#FF5722]"
            style={S.coral}
          >
            🚀 Iniciar tarea
          </motion.button>
        )}

        {task.status === 'in_progress' && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onUploadEvidence}
            className="flex-1 py-2.5 rounded-2xl text-xs font-bold text-white bg-[#FF5722] flex items-center justify-center gap-2"
            style={S.coral}
          >
            📸 Enviar evidencia
          </motion.button>
        )}

        {task.status === 'rejected' && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onStart}
            className="flex-1 py-2.5 rounded-2xl text-xs font-bold text-orange-600 bg-[#D8DAE4]"
            style={S.neoOut}
          >
            🔄 Reintentar
          </motion.button>
        )}

        {task.status === 'completed' && (
          <div className="flex-1 py-2.5 rounded-2xl text-xs font-bold text-emerald-600 bg-[#D8DAE4] flex items-center justify-center gap-2" style={S.neoOut}>
            ✅ Completada con evidencia
          </div>
        )}
      </div>
    </div>
  )
})
EmployeeTaskCard.displayName = 'EmployeeTaskCard'
