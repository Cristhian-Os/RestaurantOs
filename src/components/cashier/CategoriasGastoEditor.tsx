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

const FX = {
  card:  { border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-sm)' },
  soft:  { boxShadow: 'var(--w-shadow-sm)' },
  field: { border: '1px solid var(--w-border)' },
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

    const boton = 'px-3 min-h-[44px] rounded-[var(--w-r-md)] text-xs font-bold border-none cursor-pointer disabled:opacity-50'

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        className="fixed inset-0 bg-[var(--w-overlay)] z-50 flex items-end sm:items-center justify-center sm:p-4">
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="bg-[var(--w-surface-raised)] w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-[var(--w-r-xl)] sm:rounded-[var(--w-r-xl)] p-5" style={FX.card}>
          <div ref={ref} className={cn('flex flex-col gap-3', className)} {...rest}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 font-bold text-[color:var(--w-text)] text-lg">Categorías de gastos</h3>
              <button type="button" onClick={onClose} aria-label="Cerrar"
                className="w-9 h-9 rounded-[var(--w-r-md)] border-none cursor-pointer bg-[var(--w-surface)] text-[color:var(--w-text-2)] text-lg" style={FX.soft}>✕</button>
            </div>

            <p className="m-0 text-xs text-[color:var(--w-text-2)]">
              Así se agrupan los gastos en el corte diario, el mensual y el historial. Si cambias un nombre, cambia también en los gastos anteriores.
            </p>

            {usaSugeridas && (
              <div className="bg-[var(--w-warning-bg)] border border-[var(--w-warning)] rounded-[var(--w-r-lg)] p-3 flex flex-col gap-2">
                <p className="m-0 text-xs text-[color:var(--w-warning-text)]">
                  Todavía no tienes categorías propias: se están usando las sugeridas. Créalas para poder editarlas.
                </p>
                <button type="button" disabled={saving} onClick={() => void crearSugeridas()}
                  className={cn(boton, 'bg-[var(--w-accent)] text-[color:var(--w-on-accent)]')}>
                  {saving ? 'Creando…' : 'Crear las categorías sugeridas'}
                </button>
              </div>
            )}

            {filas.map(f => {
              const valor = drafts[f.id] ?? f.nombre
              const cambio = valor.trim() !== f.nombre
              return (
                <div key={f.id} className={cn('flex items-center gap-2 bg-[var(--w-surface)] rounded-[var(--w-r-lg)] p-2', !f.activa && 'opacity-60')} style={FX.soft}>
                  <input value={valor} maxLength={60} aria-label={`Nombre de la categoría ${f.nombre}`}
                    onChange={e => setDrafts(d => ({ ...d, [f.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') void renombrar(f) }}
                    className="flex-1 min-w-0 min-h-[44px] bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 text-sm font-semibold text-[color:var(--w-text)] outline-none" style={FX.field} />
                  {cambio ? (
                    <button type="button" disabled={saving} onClick={() => void renombrar(f)} className={cn(boton, 'bg-[var(--w-accent)] text-[color:var(--w-on-accent)]')}>Guardar</button>
                  ) : (
                    <button type="button" disabled={saving} onClick={() => void alternar(f)}
                      className={cn(boton, 'bg-[var(--w-surface-sunken)]', f.activa ? 'text-[color:var(--w-danger-text)]' : 'text-[color:var(--w-success-text)]')}>
                      {f.activa ? 'Quitar' : 'Reactivar'}
                    </button>
                  )}
                </div>
              )
            })}

            <div className="flex gap-2 items-end">
              <div className="flex-1 min-w-0">
                <label className="block text-[length:var(--w-fs-caption)] font-bold text-[color:var(--w-text-3)] uppercase mb-1">Nueva categoría</label>
                <input value={nuevo} maxLength={60} placeholder="Ej: Publicidad" onChange={e => setNuevo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void agregar() }}
                  className="w-full min-h-[44px] bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)] px-3 text-sm text-[color:var(--w-text)] outline-none" style={FX.field} />
              </div>
              <button type="button" disabled={saving || usaSugeridas} onClick={() => void agregar()}
                className={cn(boton, 'bg-[var(--w-accent)] text-[color:var(--w-on-accent)]')}>Agregar</button>
            </div>
            {usaSugeridas && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Primero crea las sugeridas y luego podrás agregar las tuyas.</p>}
          </div>
        </motion.div>
      </motion.div>
    )
  },
)
CategoriasGastoEditor.displayName = 'CategoriasGastoEditor'
