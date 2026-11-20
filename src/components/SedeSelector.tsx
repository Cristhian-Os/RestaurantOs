import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { cambiarSede } from '../lib/sedeDispositivo'

interface Sede { id: string; nombre: string; actual: boolean }

/** Selector de sede: solo aparece si el usuario es dueño de una cuenta con más de una sede. */
export default function SedeSelector({ style }: { style?: React.CSSProperties }) {
  const [sedes, setSedes] = useState<Sede[]>([])

  useEffect(() => {
    supabase.rpc('mis_sedes').then(({ data }) => { if (Array.isArray(data)) setSedes(data as Sede[]) })
  }, [])

  if (sedes.length < 2) return null

  async function cambiar(id: string) {
    const error = await cambiarSede(id)   // cambia la sede de este aparato y la recuerda
    if (!error) window.location.reload()   // todo el panel se recarga con la sede nueva
  }

  return (
    <select aria-label="Sede" value={sedes.find(s => s.actual)?.id ?? ''} onChange={e => cambiar(e.target.value)} style={style}>
      {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
    </select>
  )
}
