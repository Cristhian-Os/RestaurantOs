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

const PAGE = 100

interface Return {
  tasks:    Task[]
  loading:  boolean
  refetch:  () => void
  hasMore:  boolean      // puede haber tareas más antiguas sin cargar
  loadMore: () => void   // carga otras 100
  error:    string | null
}

export function useRealtimeTasks({ userId, isAdmin = false }: Options): Return {
  const [tasks,   setTasks]   = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const isMounted = useRef(true)
  const limitRef  = useRef(PAGE)

  const fetchTasks = useCallback(async () => {
    try {
      let query = supabase
        .from('tasks_with_profiles')
        .select(`
          *,
          evidence:task_evidence(id, photo_url, storage_path, notes, submitted_at, uploaded_by)
        `)
        .order('created_at', { ascending: false })
        .limit(limitRef.current)

      // Filtro por usuario si no es admin
      if (!isAdmin && userId) {
        query = query.eq('assigned_to', userId)
      }

      const { data, error } = await query
      if (error) throw error
      if (isMounted.current) {
        setTasks((data ?? []) as Task[])
        setHasMore((data ?? []).length >= limitRef.current)
        setError(null)
      }
    } catch (e) {
      console.error('[useRealtimeTasks]', e)
      if (isMounted.current) setError('No se pudieron cargar las tareas')
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [userId, isAdmin])

  useEffect(() => {
    isMounted.current = true
    fetchTasks()

    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    // Filtrado por restaurant_id: sin esto, cualquier restaurante recibe el
    // realtime de tareas/evidencias de TODOS los demás (fuga de datos + ruido).
    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (cancelled || !rid) return
      channel = supabase
        .channel(`tasks-${isAdmin ? 'admin' : userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `restaurant_id=eq.${rid}` }, () => {
          if (isMounted.current) fetchTasks()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_evidence', filter: `restaurant_id=eq.${rid}` }, () => {
          if (isMounted.current) fetchTasks()
        })
        .subscribe()
    })

    return () => {
      isMounted.current = false
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [fetchTasks, isAdmin, userId])

  const loadMore = useCallback(() => { limitRef.current += PAGE; fetchTasks() }, [fetchTasks])

  return { tasks, loading, refetch: fetchTasks, hasMore, loadMore, error }
}
