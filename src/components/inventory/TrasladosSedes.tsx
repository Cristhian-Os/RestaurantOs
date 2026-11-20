import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../services/supabaseClient'
import { Button } from '../ui/Button'
import { Input, Select } from '../ui/Field'
import { Modal } from '../ui/Modal'
import type { Ingrediente } from '../../types/inventory'

interface Sede { id: string; nombre: string; actual: boolean }
interface Traslado {
  id: string; created_at: string; origen_id: string; origen_nombre: string; destino_nombre: string
  ingrediente_nombre: string; unidad_medida: string; cantidad: number; nota: string | null
}

/** Sedes de la misma cuenta. Se comparte entre todas las tarjetas de ingredientes (una sola consulta). */
function useSedes() {
  const q = useQuery({
    queryKey: ['mis_sedes'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mis_sedes')
      if (error) throw error
      return (Array.isArray(data) ? data : []) as Sede[]
    },
  })
  return q.data ?? []
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Botón "Pasar a otra sede" de un ingrediente. Solo aparece si la cuenta tiene otra sede. */
export function TrasladarIngrediente({ ingrediente, onHecho }: { ingrediente: Ingrediente; onHecho: () => void }) {
  const otras = useSedes().filter(s => !s.actual)
  const [abierto, setAbierto] = useState(false)
  const [destino, setDestino] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  if (otras.length === 0) return null

  const stock = Number(ingrediente.stock_actual)
  const cant = Number(cantidad)
  const valido = !!destino && cant > 0 && cant <= stock

  const abrir = () => { setDestino(otras.length === 1 ? otras[0].id : ''); setCantidad(''); setNota(''); setError(null); setHecho(null); setAbierto(true) }
  const cerrar = () => { if (!enviando) setAbierto(false) }

  async function pasar() {
    setEnviando(true); setError(null)
    const { data, error: e } = await supabase.rpc('trasladar_ingrediente', {
      p_destino: destino, p_ingrediente: ingrediente.id, p_cantidad: cant, p_nota: nota.trim() || null,
    })
    setEnviando(false)
    if (e || !data) { setError(e?.message ?? 'No se pudo pasar el ingrediente'); return }
    const r = data as { cantidad: number; unidad: string; destino: string; creado_en_destino: boolean }
    setHecho(`Pasaste ${r.cantidad} ${r.unidad} de ${ingrediente.nombre} a ${r.destino}.` +
      (r.creado_en_destino ? ' Ese ingrediente no existía allí y se creó.' : ''))
    onHecho()
  }

  return (
    <>
      <Button size="sm" className="min-h-[44px]" variant="secondary" onClick={abrir} disabled={stock <= 0}>Pasar a otra sede</Button>
      <Modal open={abierto} onClose={cerrar} title={hecho ? 'Listo' : `Pasar ${ingrediente.nombre} a otra sede`}
        footer={hecho
          ? <Button onClick={() => setAbierto(false)}>Cerrar</Button>
          : <>
              <Button variant="secondary" onClick={cerrar} disabled={enviando}>Cancelar</Button>
              <Button onClick={pasar} loading={enviando} disabled={!valido}>Pasar</Button>
            </>}>
        {hecho ? (
          <p className="text-[color:var(--w-text)]">{hecho}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-[color:var(--w-text-2)]">
              Tienes {stock.toFixed(2)} {ingrediente.unidad_medida}. Lo que pases se resta aquí y se suma en la otra sede.
            </p>
            <Select label="¿A qué sede?" value={destino} onChange={e => setDestino(e.target.value)} disabled={enviando}>
              <option value="">— Elige una sede —</option>
              {otras.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
            <Input label={`Cantidad (${ingrediente.unidad_medida})`} type="number" inputMode="decimal" min="0" step="any"
              value={cantidad} onChange={e => setCantidad(e.target.value)} disabled={enviando}
              error={cant > stock ? `Solo tienes ${stock.toFixed(2)}` : undefined} />
            <Input label="Nota (opcional)" value={nota} onChange={e => setNota(e.target.value)} disabled={enviando} maxLength={120} />
            {error && <p role="alert" className="text-[color:var(--w-danger-text)]">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  )
}

/** Botón "Traslados" del encabezado: últimos traslados que salieron o entraron a esta sede. */
export function HistorialTraslados() {
  const sedes = useSedes()
  const otras = sedes.filter(s => !s.actual)
  const sedeActual = sedes.find(s => s.actual)
  const [abierto, setAbierto] = useState(false)
  const q = useQuery({
    queryKey: ['traslados_ingredientes'],
    enabled: abierto,
    queryFn: async () => {
      const { data, error } = await supabase.from('traslados_ingredientes')
        .select('id, created_at, origen_id, origen_nombre, destino_nombre, ingrediente_nombre, unidad_medida, cantidad, nota')
        .order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return (data ?? []) as Traslado[]
    },
  })
  if (otras.length === 0) return null
  return (
    <>
      <Button variant="secondary" onClick={() => setAbierto(true)}>Traslados</Button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title="Traslados entre sedes"
        footer={<Button onClick={() => setAbierto(false)}>Cerrar</Button>}>
        {q.isLoading && <p className="text-[color:var(--w-text-2)]">Cargando…</p>}
        {q.isError && <p role="alert" className="text-[color:var(--w-danger-text)]">No se pudo cargar el historial.</p>}
        {q.data && q.data.length === 0 && <p className="text-[color:var(--w-text-2)]">Todavía no has pasado ingredientes entre sedes.</p>}
        <ul className="space-y-2">
          {(q.data ?? []).map(t => {
            const salio = sedeActual ? t.origen_id === sedeActual.id : true
            return (
              <li key={t.id} className="rounded-[var(--w-r-md)] border border-[var(--w-border)] px-3 py-2 text-[color:var(--w-text)]">
                <p className="font-semibold">{Number(t.cantidad)} {t.unidad_medida} de {t.ingrediente_nombre}</p>
                <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
                  {salio ? 'Salió' : 'Entró'} · {t.origen_nombre} → {t.destino_nombre} · {fecha(t.created_at)}
                </p>
                {t.nota && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{t.nota}</p>}
              </li>
            )
          })}
        </ul>
      </Modal>
    </>
  )
}
