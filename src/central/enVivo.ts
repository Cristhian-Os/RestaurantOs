/**
 * enVivo.ts — hace que una pantalla de Central se actualice sola cuando cambian ciertas tablas (Supabase Realtime).
 * La pantalla pasa su propia función de recarga: así se conserva lo que ya hace al cargar. Varios cambios seguidos se juntan en una sola recarga,
 * y si la conexión se cae y vuelve, recarga una vez por si se perdió algo. RLS decide qué eventos le llegan a esta sesión.
 * Requiere que las tablas estén publicadas en Realtime (migraciones central_realtime*); si no lo están, la pantalla sigue funcionando como siempre.
 */
import { useEffect, useRef } from 'react'
import { supabase } from '../services/supabaseClient'

const ESPERA_AGRUPAR_MS = 400
let contador = 0

export function useEnVivo(tablas: readonly string[], alCambiar: () => unknown) {
  const ultimo = useRef(alCambiar)
  useEffect(() => { ultimo.current = alCambiar })
  const clave = tablas.join(',')
  useEffect(() => {
    let activo = true, yaConecto = false
    let temporizador: ReturnType<typeof setTimeout> | null = null
    const pedir = () => {
      if (temporizador) return
      temporizador = setTimeout(() => { temporizador = null; if (activo) void ultimo.current() }, ESPERA_AGRUPAR_MS)
    }
    let canal = supabase.channel(`central-vivo-${++contador}`)
    for (const tabla of clave.split(',')) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, pedir)
    canal.subscribe(s => {
      if (!activo || s !== 'SUBSCRIBED') return
      if (yaConecto) pedir()   // volvió tras una caída: se recarga una vez
      yaConecto = true
    })
    return () => { activo = false; if (temporizador) clearTimeout(temporizador); void supabase.removeChannel(canal) }
  }, [clave])
}
