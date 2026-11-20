import { useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Button } from '../ui/Button'
import { Input } from '../ui/Field'
import { Modal } from '../ui/Modal'

/**
 * "Agregar sede": el dueño crea otra sede de su cuenta. El servidor (crear_sede) valida que sea el dueño,
 * que el plan permita más sedes y registra el cobro adicional desde la 3.ª. La sede nueva nace vacía:
 * luego se le copia la carta desde el menú. La sede activa no cambia.
 */
export function AgregarSede() {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ nombre: string; cargo: number | null } | null>(null)

  const abrir = () => { setNombre(''); setError(null); setHecho(null); setAbierto(true) }
  const cerrar = () => {
    if (creando) return
    if (hecho) { window.location.reload(); return }   // la lista de sedes se recarga con la nueva
    setAbierto(false)
  }

  async function crear() {
    const limpio = nombre.trim()
    if (limpio.length < 2) return
    setCreando(true); setError(null)
    const { data, error: e } = await supabase.rpc('crear_sede', { p_nombre: limpio })
    setCreando(false)
    if (e || !data) { setError(e?.message ?? 'No se pudo crear la sede'); return }
    const r = data as { cargo_adicional_cop: number | null }
    setHecho({ nombre: limpio, cargo: r.cargo_adicional_cop ?? null })
  }

  return (
    <>
      <Button size="sm" onClick={abrir}>Agregar sede</Button>
      <Modal open={abierto} onClose={cerrar} title={hecho ? 'Sede creada' : 'Agregar sede'}
        footer={hecho
          ? <Button onClick={cerrar}>Listo</Button>
          : <>
              <Button variant="secondary" onClick={cerrar} disabled={creando}>Cancelar</Button>
              <Button onClick={crear} loading={creando} disabled={nombre.trim().length < 2}>Crear sede</Button>
            </>}>
        {hecho ? (
          <div className="space-y-2 text-[color:var(--w-text)]">
            <p>{hecho.nombre} ya existe. Está vacía: entra a ella desde “Mis sedes” y copia la carta desde el menú.</p>
            {hecho.cargo != null && (
              <p className="text-[color:var(--w-text-2)]">Esta sede tiene un cargo adicional registrado de {hecho.cargo.toLocaleString('es-CO')} COP al mes.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[color:var(--w-text-2)]">Escribe el nombre de la nueva sede. Empieza vacía; después le copias la carta de otra sede.</p>
            <Input label="Nombre de la sede" value={nombre} onChange={e => setNombre(e.target.value)} disabled={creando} maxLength={60} />
            {error && <p role="alert" className="text-[color:var(--w-danger-text)]">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  )
}
