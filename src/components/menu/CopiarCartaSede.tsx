import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

interface Sede { id: string; nombre: string; actual: boolean }
interface Foto { plato: string; origen: string }
interface Resultado { platos: number; ingredientes: number; recetas: number; proveedores: number; listas: number; fotos: Foto[] }

const BUCKET = 'restaurant-assets'

/**
 * Copiar la carta de otra sede de la misma cuenta. Solo aparece para el dueño con 2 sedes o más
 * y solo cuando la sede actual no tiene platos (la copia no mezcla ni duplica).
 * Después de copiar en el servidor duplica las fotos, para que cambiar una foto en una sede no cambie la otra.
 */
export function CopiarCartaSede({ cartaVacia }: { cartaVacia: boolean }) {
  const [sedes, setSedes] = useState<Sede[]>([])
  const [abierto, setAbierto] = useState(false)
  const [origen, setOrigen] = useState('')
  const [copiando, setCopiando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ r: Resultado; fotosFallidas: number } | null>(null)

  useEffect(() => {
    supabase.rpc('mis_sedes').then(({ data }) => { if (Array.isArray(data)) setSedes(data as Sede[]) })
  }, [])

  const otras = sedes.filter(s => !s.actual)
  if (!cartaVacia || otras.length === 0) return null

  async function duplicarFotos(fotos: Foto[]): Promise<number> {
    let fallidas = 0
    for (const f of fotos) {
      const ext = f.origen.split('.').pop()?.toLowerCase() || 'jpg'
      const destino = `dishes/${f.plato}.${ext}`
      const { error: e1 } = await supabase.storage.from(BUCKET).copy(f.origen, destino)
      if (e1) { fallidas++; continue }   // el plato conserva la foto de la otra sede; se ve igual
      const url = supabase.storage.from(BUCKET).getPublicUrl(destino).data.publicUrl + `?v=${Date.now()}`
      const { error: e2 } = await supabase.from('dishes').update({ image_url: url }).eq('id', f.plato)
      if (e2) fallidas++
    }
    return fallidas
  }

  async function copiar() {
    if (!origen) return
    setCopiando(true); setError(null)
    const { data, error: e } = await supabase.rpc('copiar_carta_de_sede', { p_origen: origen })
    if (e || !data) { setError(e?.message ?? 'No se pudo copiar la carta'); setCopiando(false); return }
    const r = data as Resultado
    const fotosFallidas = await duplicarFotos(r.fotos ?? [])
    setHecho({ r, fotosFallidas })
    setCopiando(false)
  }

  const cerrar = () => {
    if (copiando) return
    if (hecho) { window.location.reload(); return }   // el menú se recarga con la carta nueva
    setAbierto(false); setError(null); setOrigen('')
  }

  return (
    <>
      <div className="flex flex-col items-center gap-3 rounded-[var(--w-r-lg)] border border-dashed border-[var(--w-border-strong)] px-6 py-6 text-center"
        style={{ fontFamily: 'var(--w-font)' }}>
        <p className="font-semibold text-[color:var(--w-text)]">¿Esta sede vende lo mismo que otra?</p>
        <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
          Copia la carta completa y luego edita o borra lo que no se venda aquí.
        </p>
        <Button onClick={() => setAbierto(true)}>Copiar carta de otra sede</Button>
      </div>

      <Modal open={abierto} onClose={cerrar} title={hecho ? 'Carta copiada' : 'Copiar carta de otra sede'}
        footer={hecho
          ? <Button onClick={cerrar}>Ver mi carta</Button>
          : <>
              <Button variant="secondary" onClick={cerrar} disabled={copiando}>Cancelar</Button>
              <Button onClick={copiar} loading={copiando} disabled={!origen}>Copiar carta</Button>
            </>}>
        {hecho ? (
          <div className="space-y-2 text-[color:var(--w-text)]">
            <p>Se copiaron {hecho.r.platos} platos, {hecho.r.ingredientes} ingredientes, {hecho.r.recetas} líneas de receta,
              {' '}{hecho.r.proveedores} proveedores y {hecho.r.listas} listas de opciones.</p>
            <p className="text-[color:var(--w-text-2)]">El inventario de esta sede empieza en 0: registra lo que tienes aquí.</p>
            {hecho.fotosFallidas > 0 && (
              <p className="text-[color:var(--w-text-2)]">
                {hecho.fotosFallidas} fotos no se pudieron duplicar. Se ven igual, pero si cambias esa foto en la otra sede,
                también cambia aquí. Súbela de nuevo en el plato para separarla.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-[color:var(--w-text)]">
            <p className="text-[color:var(--w-text-2)]">
              Se copian platos, categorías, opciones, proveedores, ingredientes y recetas. El inventario empieza en 0.
              Lo copiado es independiente: cambiarlo aquí no cambia la otra sede.
            </p>
            <fieldset className="space-y-2">
              <legend className="mb-1 font-semibold">¿De qué sede?</legend>
              {otras.map(s => (
                <label key={s.id}
                  className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] px-3">
                  <input type="radio" name="sede-origen" value={s.id} checked={origen === s.id}
                    onChange={() => setOrigen(s.id)} disabled={copiando} />
                  <span>{s.nombre}</span>
                </label>
              ))}
            </fieldset>
            {error && <p role="alert" className="text-[color:var(--w-danger-text)]">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  )
}
