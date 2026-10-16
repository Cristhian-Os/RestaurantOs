/**
 * CategoriasGastoEditor.tsx
 * Editor de las categorías de gastos del restaurante (solo admin; lo exige también la base de datos).
 *  • Agregar una categoría nueva.
 *  • Renombrar: cambia el nombre en todo el historial (los gastos guardan la clave, no el nombre).
 *  • Quitar = desactivar: deja de ofrecerse al registrar gastos, pero los gastos ya hechos conservan su nombre.
 */
import { forwardRef, useState, type HTMLAttributes } from 'react'
import { motion } from 'framer-motion'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { cn } from '../../lib/cn'
import { CATEGORIAS_GASTO, claveUnica, nombreIgual } from '../../services/gastosResumen'
import type { CategoriaFila } from '../../hooks/useCategoriasGasto'

const S = {
  neoOut:   { boxShadow: 'var(--shadow-out)' },
  neoOutSm: { boxShadow: 'var(--shadow-out-sm)' },
  neoIn:    { boxShadow: 'var(--shadow-in)' },
} as const

interface PostgrestLikeError { code?: string; message: string }

/** Traduce los errores de la base de datos a algo que el admin entienda. */
function textoError(e: PostgrestLikeError): string {
  if (e.code === '23505') return 'Ya existe una categoría con ese nombre'
  if (e.code === '42P01' || (/categorias_gasto/.test(e.message) && /does not exist|schema cache/.test(e.message))) {
    return 'Las categorías editables todavía no están habilitadas en la base de datos'
  }
  if (e.code === '42501' || /row-level security/i.test(e.message)) return 'Solo el administrador puede editar las categorías'
  return e.message
}

export interface CategoriasGastoEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  filas:        CategoriaFila[]
  usaSugeridas: boolean
  onClose:      () => void
  /** Se llama después de cada cambio guardado, para recargar las categorías. */
  onChanged:    () => void | Promise<void>
}

export const CategoriasGastoEditor = forwardRef<HTMLDivElement, CategoriasGastoEditorProps>(
  ({ filas, usaSugeridas, onClose, onChanged, className, ...rest }, ref) => {
    const [nuevo, setNuevo]     = useState('')
    const [drafts, setDrafts]   = useState<Record<string, string>>({})
    const [saving, setSaving]   = useState(false)

    const run = async (fn: () => PromiseLike<{ error: PostgrestLikeError | null }>, okMsg?: string): Promise<boolean> => {
      setSaving(true)
      const { error } = await fn()
      setSaving(false)
      if (error) { message.error(textoError(error)); return false }
      if (okMsg) message.success(okMsg)
      await onChanged()
      return true
    }

    const crearSugeridas = () => run(
      () => supabase.from('categorias_gasto').insert(CATEGORIAS_GASTO.map((c, i) => ({ clave: c.key, nombre: c.label, orden: i + 1 }))),
      'Categorías creadas',
    )

    const agregar = async () => {
      const nombre = nuevo.trim()
      if (!nombre) { message.error('Escribe el nombre de la categoría'); return }
      if (filas.some(f => nombreIgual(f.nombre, nombre))) { message.error('Ya existe una categoría con ese nombre'); return }
      const clave = claveUnica(nombre, filas.map(f => f.clave))
      const orden = filas.reduce((m, f) => Math.max(m, f.orden), 0) + 1
      const ok = await run(() => supabase.from('categorias_gasto').insert({ clave, nombre, orden }), 'Categoría agregada')
      if (ok) setNuevo('')
    }

    const renombrar = async (f: CategoriaFila) => {
      const nombre = (drafts[f.id] ?? f.nombre).trim()
      if (!nombre) { message.error('El nombre no puede quedar vacío'); return }
      if (nombre === f.nombre) return
      if (filas.some(o => o.id !== f.id && nombreIgual(o.nombre, nombre))) { message.error('Ya existe una categoría con ese nombre'); return }
      const ok = await run(() => supabase.from('categorias_gasto').update({ nombre }).eq('id', f.id), 'Nombre actualizado')
      if (ok) setDrafts(d => { const { [f.id]: _quitado, ...resto } = d; return resto })
    }

    const alternar = (f: CategoriaFila) => run(
      () => supabase.from('categorias_gasto').update({ activa: !f.activa }).eq('id', f.id),
      f.activa ? 'Categoría quitada · los gastos anteriores la conservan' : 'Categoría reactivada',
    )

    const boton = 'px-3 min-h-[44px] rounded-xl text-xs font-bold border-none cursor-pointer disabled:opacity-50'

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        className="fixed inset-0 bg-[#2D3561]/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="bg-[#CDD0DC] w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-4" style={S.neoOut}>
          <div ref={ref} className={cn('flex flex-col gap-3', className)} {...rest}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 font-bold text-[#2D3561] text-lg">Categorías de gastos</h3>
              <button type="button" onClick={onClose} aria-label="Cerrar"
                className="w-9 h-9 rounded-xl border-none cursor-pointer bg-[#D8DAE4] text-[#6B7280] text-lg" style={S.neoOutSm}>✕</button>
            </div>

            <p className="m-0 text-xs text-[#6B7280]">
              Así se agrupan los gastos en el corte diario, el mensual y el historial. Si cambias un nombre, cambia también en los gastos anteriores.
            </p>

            {usaSugeridas && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex flex-col gap-2">
                <p className="m-0 text-xs text-amber-800">
                  Todavía no tienes categorías propias: se están usando las sugeridas. Créalas para poder editarlas.
                </p>
                <button type="button" disabled={saving} onClick={() => void crearSugeridas()}
                  className={cn(boton, 'bg-[#FF5722] text-white')}>
                  {saving ? 'Creando…' : 'Crear las categorías sugeridas'}
                </button>
              </div>
            )}

            {filas.map(f => {
              const valor = drafts[f.id] ?? f.nombre
              const cambio = valor.trim() !== f.nombre
              return (
                <div key={f.id} className={cn('flex items-center gap-2 bg-[#D8DAE4] rounded-2xl p-2', !f.activa && 'opacity-60')} style={S.neoOutSm}>
                  <input value={valor} maxLength={60} aria-label={`Nombre de la categoría ${f.nombre}`}
                    onChange={e => setDrafts(d => ({ ...d, [f.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') void renombrar(f) }}
                    className="flex-1 min-w-0 min-h-[44px] bg-[#CDD0DC] rounded-xl px-3 text-sm font-semibold text-[#2D3561] outline-none" style={S.neoIn} />
                  {cambio ? (
                    <button type="button" disabled={saving} onClick={() => void renombrar(f)} className={cn(boton, 'bg-[#FF5722] text-white')}>Guardar</button>
                  ) : (
                    <button type="button" disabled={saving} onClick={() => void alternar(f)}
                      className={cn(boton, 'bg-[#CDD0DC]', f.activa ? 'text-red-600' : 'text-emerald-700')}>
                      {f.activa ? 'Quitar' : 'Reactivar'}
                    </button>
                  )}
                </div>
              )
            })}

            <div className="flex gap-2 items-end">
              <div className="flex-1 min-w-0">
                <label className="block text-[0.625rem] font-bold text-[#9CA3AF] uppercase mb-1">Nueva categoría</label>
                <input value={nuevo} maxLength={60} placeholder="Ej: Publicidad" onChange={e => setNuevo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void agregar() }}
                  className="w-full min-h-[44px] bg-[#CDD0DC] rounded-xl px-3 text-sm text-[#2D3561] outline-none" style={S.neoIn} />
              </div>
              <button type="button" disabled={saving || usaSugeridas} onClick={() => void agregar()}
                className={cn(boton, 'bg-[#FF5722] text-white')}>Agregar</button>
            </div>
            {usaSugeridas && <p className="m-0 text-[0.6875rem] text-[#9CA3AF]">Primero crea las sugeridas y luego podrás agregar las tuyas.</p>}
          </div>
        </motion.div>
      </motion.div>
    )
  },
)
CategoriasGastoEditor.displayName = 'CategoriasGastoEditor'
