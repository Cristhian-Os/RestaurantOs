/**
 * useRealtimeTasks.ts
 * Hook compartido para suscripción en tiempo real a tareas.
 * Admin: todas las tareas. Empleado: solo las asignadas a él.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../services/supabaseClient'
import type { Task } from '../../types'

interface Options {
  userId?:  string   // si se pasa, filtra por assigned_to
  isAdmin?: boolean  // si true, trae todas las tareas
}

interface Return {
  tasks:   Task[]
  loading: boolean
  refetch: () => void
}

export function useRealtimeTasks({ userId, isAdmin = false }: Options): Return {
  const [tasks,   setTasks]   = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const isMounted = useRef(true)

  const fetchTasks = useCallback(async () => {
    try {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, role),
          evidence:task_evidence(id, photo_url, storage_path, notes, submitted_at, uploaded_by)
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      // Filtro por usuario si no es admin
      if (!isAdmin && userId) {
        query = query.eq('assigned_to', userId)
      }

      const { data, error } = await query
      if (error) throw error
      if (isMounted.current) setTasks((data ?? []) as Task[])
    } catch (e) {
      console.error('[useRealtimeTasks]', e)
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [userId, isAdmin])

  useEffect(() => {
    isMounted.current = true
    fetchTasks()

    const channel = supabase
      .channel(`tasks-${isAdmin ? 'admin' : userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        if (isMounted.current) fetchTasks()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_evidence' }, () => {
        if (isMounted.current) fetchTasks()
      })
      .subscribe()

    return () => {
      isMounted.current = false
      supabase.removeChannel(channel)
    }
  }, [fetchTasks, isAdmin, userId])

  return { tasks, loading, refetch: fetchTasks }
}
