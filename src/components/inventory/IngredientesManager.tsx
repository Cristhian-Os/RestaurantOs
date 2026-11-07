/**
 * IngredientesManager.tsx
 * Alta de materias primas y registro de compras: el admin agrega un
 * ingrediente nuevo (nombre, unidad, costo, stock inicial) y registra
 * compras posteriores (suma al stock y actualiza el precio unitario).
 * También permite corregir a mano el stock, el stock mínimo y el costo unitario
 * de un ingrediente ya creado (conteo físico, errores de digitación).
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryService } from '../../services/inventoryService'
import message from 'antd/es/message'
import { VoiceButton } from '../VoiceButton'
import { limpiarTranscripcion } from '../../services/voiceText'
import { ModuleHeader, StatCard } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Input, Select } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { StatePanel } from '../ui/StatePanel'
import type { Ingrediente } from '../../types/inventory'

const UNIDADES = ['kg', 'litro', 'pieza', 'gramo', 'ml', 'paquete'] as const

const fmtCOP = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO')

type Nuevo = ReturnType<typeof emptyNuevo>
interface VoiceIngredientes {
  ingredientes: { nombre: string; unidad_medida: typeof UNIDADES[number]; stock_actual?: number; stock_minimo?: number; costo_unitario?: number }[]
}

const emptyNuevo = () => ({ nombre: '', unidad_medida: 'kg' as typeof UNIDADES[number], costo_unitario: '', stock_minimo: '', stock_actual: '' })

export function IngredientesManager() {
  const queryClient = useQueryClient()
  const [showNuevo, setShowNuevo] = useState(false)
  const [nuevo, setNuevo] = useState(emptyNuevo())
  // Ingredientes dictados que faltan por revisar: se cargan al formulario de a uno.
  const [pendientes, setPendientes] = useState<Nuevo[]>([])
  const [compraFor, setCompraFor] = useState<Ingrediente | null>(null)
  const [compraCantidad, setCompraCantidad] = useState('')
  const [compraPrecio, setCompraPrecio] = useState('')
  const [editFor, setEditFor] = useState<Ingrediente | null>(null)
  const [editStock, setEditStock] = useState('')
  const [editMinimo, setEditMinimo] = useState('')
  const [editCosto, setEditCosto] = useState('')

  const ingredientesQuery = useQuery({
    queryKey: ['ingredientes'],
    queryFn: () => inventoryService.getIngredientes(),
    staleTime: 1000 * 30,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ingredientes'] })

  const crearMutation = useMutation({
    mutationFn: () => inventoryService.createIngrediente({
      nombre: nuevo.nombre.trim(),
      unidad_medida: nuevo.unidad_medida,
      costo_unitario: parseFloat(nuevo.costo_unitario) || 0,
      stock_minimo: parseFloat(nuevo.stock_minimo) || 0,
      stock_actual: parseFloat(nuevo.stock_actual) || 0,
    }),
    onSuccess: () => {
      message.success(pendientes.length ? `Ingrediente creado · faltan ${pendientes.length}` : 'Ingrediente creado')
      if (pendientes.length) { setNuevo(pendientes[0]); setPendientes(pendientes.slice(1)) }
      else { setShowNuevo(false); setNuevo(emptyNuevo()) }
      invalidate()
    },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Error al crear'),
  })

  const compraMutation = useMutation({
    mutationFn: () => {
      if (!compraFor) throw new Error('Sin ingrediente')
      const cantidad = parseFloat(compraCantidad)
      const precio = parseFloat(compraPrecio)
      return inventoryService.updateIngrediente(compraFor.id, {
        stock_actual: Number(compraFor.stock_actual) + cantidad,
        costo_unitario: precio,
      })
    },
    onSuccess: () => {
      message.success('Compra registrada')
      setCompraFor(null); setCompraCantidad(''); setCompraPrecio('')
      invalidate()
    },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Error al registrar la compra'),
  })

  // Los tres valores se guardan en una sola actualización: o cambian todos o ninguno.
  const editMutation = useMutation({
    mutationFn: () => {
      if (!editFor) throw new Error('Sin ingrediente')
      return inventoryService.updateIngrediente(editFor.id, {
        stock_actual: parseFloat(editStock),
        stock_minimo: parseFloat(editMinimo),
        costo_unitario: parseFloat(editCosto),
      })
    },
    onSuccess: () => {
      message.success('Ingrediente actualizado')
      setEditFor(null)
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['shopping_list'] })
    },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Error al actualizar'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: string) => inventoryService.deleteIngrediente(id),
    onSuccess: () => { message.success('Ingrediente eliminado'); invalidate() },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Error al eliminar'),
  })

  const sustitutoMutation = useMutation({
    mutationFn: ({ id, sustituto_id }: { id: string; sustituto_id: string | null }) =>
      inventoryService.updateIngrediente(id, { sustituto_id }),
    onSuccess: () => invalidate(),
    onError: (e) => message.error(e instanceof Error ? e.message : 'Error al guardar el sustituto'),
  })

  const compraValida = useMemo(() => {
    const c = parseFloat(compraCantidad), p = parseFloat(compraPrecio)
    return c > 0 && p >= 0
  }, [compraCantidad, compraPrecio])

  const editValido = useMemo(() => {
    return [editStock, editMinimo, editCosto].every(v => v.trim() !== '' && Number.isFinite(parseFloat(v)) && parseFloat(v) >= 0)
  }, [editStock, editMinimo, editCosto])

  const openEdit = (ing: Ingrediente) => {
    setEditFor(ing)
    setEditStock(String(ing.stock_actual))
    setEditMinimo(String(ing.stock_minimo))
    setEditCosto(String(ing.costo_unitario))
  }

  const openCompra = (ing: Ingrediente) => {
    setCompraFor(ing)
    setCompraCantidad('')
    setCompraPrecio(String(ing.costo_unitario))
  }

  const ingredientes = ingredientesQuery.data ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <ModuleHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>}
        title="Ingredientes"
        subtitle="Agrega materias primas y registra compras (sube el stock y actualiza el precio)"
        actions={<>
          <VoiceButton<VoiceIngredientes> kind="ingredient" label="Dictar ingredientes" onResult={r => {
          const list: Nuevo[] = (r.ingredientes ?? []).map(i => ({
            nombre: i.nombre ?? '', unidad_medida: UNIDADES.includes(i.unidad_medida) ? i.unidad_medida : 'kg',
            costo_unitario: String(i.costo_unitario ?? ''), stock_minimo: String(i.stock_minimo ?? ''), stock_actual: String(i.stock_actual ?? ''),
          }))
          if (list.length === 0) { message.warning('No entendí ningún ingrediente'); return }
          setNuevo(list[0]); setPendientes(list.slice(1)); setShowNuevo(true)
        }} />
          <Button variant={showNuevo ? 'secondary' : 'primary'} onClick={() => { setShowNuevo(v => !v); setPendientes([]) }}>
            {showNuevo ? 'Cerrar' : '+ Nuevo ingrediente'}
          </Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        <StatCard label="Ingredientes" value={ingredientes.length} tone="accent" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>} />
        <StatCard label="Con stock bajo" value={ingredientes.filter(i => Number(i.stock_actual) <= Number(i.stock_minimo)).length} tone="danger" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/></svg>} />
        <StatCard label="Valor en stock" value={fmtCOP(ingredientes.reduce((n, i) => n + Number(i.stock_actual) * Number(i.costo_unitario), 0))} tone="success" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} />
      </div>

      {showNuevo && (
        <Card className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
            <div className="min-w-0 flex-1">
              <Input label="Nombre" value={nuevo.nombre} onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} placeholder="Ej: Queso mozzarella" />
            </div>
            <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => setNuevo(n => ({ ...n, nombre: limpiarTranscripcion(r.transcript) }))} />
          </div>
          <Select label="Unidad" value={nuevo.unidad_medida} onChange={e => setNuevo(n => ({ ...n, unidad_medida: e.target.value as typeof UNIDADES[number] }))}>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </Select>
          <Input label="Costo unitario" type="number" min={0} value={nuevo.costo_unitario} onChange={e => setNuevo(n => ({ ...n, costo_unitario: e.target.value }))} placeholder="0" />
          <Input label="Stock inicial" type="number" min={0} value={nuevo.stock_actual} onChange={e => setNuevo(n => ({ ...n, stock_actual: e.target.value }))} placeholder="0" />
          <Input label="Stock mínimo" type="number" min={0} value={nuevo.stock_minimo} onChange={e => setNuevo(n => ({ ...n, stock_minimo: e.target.value }))} placeholder="0" />
          <Button className="sm:col-span-2 lg:col-span-6 lg:justify-self-end" onClick={() => crearMutation.mutate()} disabled={!nuevo.nombre.trim()} loading={crearMutation.isPending}>
            {crearMutation.isPending ? 'Creando…' : 'Crear'}
          </Button>
        </Card>
      )}

      {ingredientesQuery.isLoading && <StatePanel kind="loading" />}
      {!ingredientesQuery.isLoading && ingredientes.length === 0 && (
        <StatePanel kind="empty" title="Sin ingredientes todavía" text="Agrega el primero con “Nuevo ingrediente”." />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {ingredientes.map(ing => {
          const bajo = Number(ing.stock_actual) <= Number(ing.stock_minimo)
          return (
            <Card key={ing.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-body-lg)]">{ing.nombre}</p>
                  <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
                    Mínimo {Number(ing.stock_minimo).toFixed(2)} · Costo {fmtCOP(Number(ing.costo_unitario))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-title)]">{Number(ing.stock_actual).toFixed(2)} {ing.unidad_medida}</span>
                  <Badge tone={bajo ? 'danger' : 'success'}>{bajo ? 'Stock bajo' : 'Stock OK'}</Badge>
                </div>
              </div>
              <label className="flex flex-col gap-1.5 text-[length:var(--w-fs-label)] font-semibold text-[color:var(--w-text)]">
                Si se agota, cambiar por
                <select
                  value={ing.sustituto_id ?? ''}
                  onChange={e => sustitutoMutation.mutate({ id: ing.id, sustituto_id: e.target.value || null })}
                  title="Si este ingrediente se agota, ofrecerlo como cambio al vender el plato (igual que un adicional)"
                  className="min-h-[44px] w-full rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] bg-[var(--w-surface)] px-3 font-normal text-[color:var(--w-text)] text-[length:var(--w-fs-body)] sm:max-w-xs"
                >
                  <option value="">— Sin cambio —</option>
                  {ingredientes.filter(o => o.id !== ing.id).map(o => (
                    <option key={o.id} value={o.id}>{o.nombre}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="min-h-[44px]" onClick={() => openCompra(ing)}>Registrar compra</Button>
                <Button size="sm" className="min-h-[44px]" variant="secondary" onClick={() => openEdit(ing)}>Editar</Button>
                <Button size="sm" className="min-h-[44px]" variant="danger" onClick={() => { if (window.confirm(`¿Eliminar ${ing.nombre}?`)) eliminarMutation.mutate(ing.id) }}>Eliminar</Button>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        open={!!editFor}
        onClose={() => setEditFor(null)}
        title="Editar ingrediente"
        footer={<>
          <Button variant="secondary" onClick={() => setEditFor(null)}>Cancelar</Button>
          <Button onClick={() => editMutation.mutate()} disabled={!editValido} loading={editMutation.isPending}>{editMutation.isPending ? 'Guardando…' : 'Guardar'}</Button>
        </>}
      >
        {editFor && (
          <div className="flex flex-col gap-3">
            <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{editFor.nombre} · unidad: {editFor.unidad_medida}</p>
            <Input label={`Stock actual (${editFor.unidad_medida})`} type="number" min={0} autoFocus value={editStock} onChange={e => setEditStock(e.target.value)} placeholder="0" />
            <Input label={`Stock mínimo (${editFor.unidad_medida})`} type="number" min={0} value={editMinimo} onChange={e => setEditMinimo(e.target.value)} placeholder="0" />
            <Input label="Costo unitario" type="number" min={0} value={editCosto} onChange={e => setEditCosto(e.target.value)} placeholder="0" />
          </div>
        )}
      </Modal>

      <Modal
        open={!!compraFor}
        onClose={() => setCompraFor(null)}
        title="Registrar compra"
        footer={<>
          <Button variant="secondary" onClick={() => setCompraFor(null)}>Cancelar</Button>
          <Button onClick={() => compraMutation.mutate()} disabled={!compraValida} loading={compraMutation.isPending}>{compraMutation.isPending ? 'Guardando…' : 'Registrar'}</Button>
        </>}
      >
        {compraFor && (
          <div className="flex flex-col gap-3">
            <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{compraFor.nombre} · stock actual: {Number(compraFor.stock_actual).toFixed(2)} {compraFor.unidad_medida}</p>
            <Input label={`Cantidad comprada (${compraFor.unidad_medida})`} type="number" min={0} autoFocus value={compraCantidad} onChange={e => setCompraCantidad(e.target.value)} placeholder="0" />
            <Input label="Precio unitario pagado" type="number" min={0} value={compraPrecio} onChange={e => setCompraPrecio(e.target.value)} placeholder="0" />
            {compraValida && (
              <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
                Total de esta compra: <b className="text-[color:var(--w-text)]">{fmtCOP(parseFloat(compraCantidad) * parseFloat(compraPrecio))}</b>
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
