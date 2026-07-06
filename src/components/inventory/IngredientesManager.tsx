/**
 * IngredientesManager.tsx
 * Alta de materias primas y registro de compras: el admin agrega un
 * ingrediente nuevo (nombre, unidad, costo, stock inicial) y registra
 * compras posteriores (suma al stock y actualiza el precio unitario).
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryService } from '../../services/inventoryService'
import message from 'antd/es/message'
import type { Ingrediente } from '../../types/inventory'

const UNIDADES = ['kg', 'litro', 'pieza', 'gramo', 'ml', 'paquete'] as const

const fmtCOP = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO')

const inputBase: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: '0.625rem',
  padding: '0.55rem 0.7rem', color: 'var(--text-primary)', fontFamily: 'var(--w-sans, inherit)',
  fontSize: '0.875rem', outline: 'none', width: '100%', boxSizing: 'border-box',
}

const emptyNuevo = () => ({ nombre: '', unidad_medida: 'kg' as typeof UNIDADES[number], costo_unitario: '', stock_minimo: '', stock_actual: '' })

export function IngredientesManager() {
  const queryClient = useQueryClient()
  const [showNuevo, setShowNuevo] = useState(false)
  const [nuevo, setNuevo] = useState(emptyNuevo())
  const [compraFor, setCompraFor] = useState<Ingrediente | null>(null)
  const [compraCantidad, setCompraCantidad] = useState('')
  const [compraPrecio, setCompraPrecio] = useState('')

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
      message.success('Ingrediente creado')
      setShowNuevo(false); setNuevo(emptyNuevo())
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

  const eliminarMutation = useMutation({
    mutationFn: (id: string) => inventoryService.deleteIngrediente(id),
    onSuccess: () => { message.success('Ingrediente eliminado'); invalidate() },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Error al eliminar'),
  })

  const compraValida = useMemo(() => {
    const c = parseFloat(compraCantidad), p = parseFloat(compraPrecio)
    return c > 0 && p >= 0
  }, [compraCantidad, compraPrecio])

  const openCompra = (ing: Ingrediente) => {
    setCompraFor(ing)
    setCompraCantidad('')
    setCompraPrecio(String(ing.costo_unitario))
  }

  const ingredientes = ingredientesQuery.data ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: '1.5rem', color: 'var(--text-primary)', margin: 0 }}>Ingredientes</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Agrega materias primas y registra compras (sube el stock y actualiza el precio)
          </p>
        </div>
        <button onClick={() => setShowNuevo(v => !v)}
          style={{ padding: '0.625rem 1.125rem', borderRadius: '0.75rem', border: 'none', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', background: showNuevo ? 'var(--accent)' : 'var(--bg-surface)', color: showNuevo ? '#fff' : 'var(--text-primary)', boxShadow: 'var(--shadow-out-sm)' }}>
          + Nuevo ingrediente
        </button>
      </div>

      {showNuevo && (
        <div style={{ background: 'var(--bg)', borderRadius: '1.25rem', padding: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', boxShadow: 'var(--shadow-out)' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Nombre</label>
            <input value={nuevo.nombre} onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} style={inputBase} placeholder="Ej: Queso mozzarella" />
          </div>
          <div style={{ width: 110 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Unidad</label>
            <select value={nuevo.unidad_medida} onChange={e => setNuevo(n => ({ ...n, unidad_medida: e.target.value as typeof UNIDADES[number] }))} style={inputBase}>
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ width: 130 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Costo unitario</label>
            <input type="number" min={0} value={nuevo.costo_unitario} onChange={e => setNuevo(n => ({ ...n, costo_unitario: e.target.value }))} style={inputBase} placeholder="0" />
          </div>
          <div style={{ width: 120 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Stock inicial</label>
            <input type="number" min={0} value={nuevo.stock_actual} onChange={e => setNuevo(n => ({ ...n, stock_actual: e.target.value }))} style={inputBase} placeholder="0" />
          </div>
          <div style={{ width: 120 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Stock mínimo</label>
            <input type="number" min={0} value={nuevo.stock_minimo} onChange={e => setNuevo(n => ({ ...n, stock_minimo: e.target.value }))} style={inputBase} placeholder="0" />
          </div>
          <button onClick={() => crearMutation.mutate()} disabled={!nuevo.nombre.trim() || crearMutation.isPending}
            style={{ padding: '0.625rem 1.25rem', borderRadius: '0.75rem', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', opacity: !nuevo.nombre.trim() || crearMutation.isPending ? 0.6 : 1, boxShadow: 'var(--shadow-coral)' }}>
            {crearMutation.isPending ? 'Creando…' : 'Crear'}
          </button>
        </div>
      )}

      <div style={{ borderRadius: '1.25rem', overflow: 'hidden', boxShadow: 'var(--shadow-out)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-surface)' }}>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Ingrediente</th>
              <th style={{ padding: '0.75rem 1rem' }}>Stock</th>
              <th style={{ padding: '0.75rem 1rem' }}>Mínimo</th>
              <th style={{ padding: '0.75rem 1rem' }}>Costo unitario</th>
              <th style={{ padding: '0.75rem 1rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {ingredientesQuery.isLoading && (
              <tr><td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
            )}
            {!ingredientesQuery.isLoading && ingredientes.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Sin ingredientes todavía</td></tr>
            )}
            {ingredientes.map(ing => (
              <tr key={ing.id} style={{ borderTop: '1px solid var(--divider)' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{ing.nombre}</td>
                <td style={{ padding: '0.75rem 1rem', color: Number(ing.stock_actual) <= Number(ing.stock_minimo) ? '#DC2626' : 'var(--text-primary)', fontWeight: 700 }}>
                  {Number(ing.stock_actual).toFixed(2)} {ing.unidad_medida}
                </td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{Number(ing.stock_minimo).toFixed(2)}</td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)' }}>{fmtCOP(Number(ing.costo_unitario))}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => openCompra(ing)}
                    style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', marginRight: '0.5rem' }}>
                    Registrar compra
                  </button>
                  <button onClick={() => { if (window.confirm(`¿Eliminar ${ing.nombre}?`)) eliminarMutation.mutate(ing.id) }}
                    style={{ padding: '0.4rem 0.6rem', borderRadius: '0.5rem', border: 'none', background: 'rgba(239,68,68,0.12)', color: '#DC2626', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {compraFor && (
        <div onClick={() => setCompraFor(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg)', borderRadius: '1.25rem', padding: '1.5rem', width: '100%', maxWidth: 360, boxShadow: 'var(--shadow-out)' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>Registrar compra</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{compraFor.nombre} · stock actual: {Number(compraFor.stock_actual).toFixed(2)} {compraFor.unidad_medida}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Cantidad comprada ({compraFor.unidad_medida})</label>
                <input type="number" min={0} autoFocus value={compraCantidad} onChange={e => setCompraCantidad(e.target.value)} style={inputBase} placeholder="0" />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Precio unitario pagado</label>
                <input type="number" min={0} value={compraPrecio} onChange={e => setCompraPrecio(e.target.value)} style={inputBase} placeholder="0" />
              </div>
              {compraValida && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                  Total de esta compra: <b style={{ color: 'var(--text-primary)' }}>{fmtCOP(parseFloat(compraCantidad) * parseFloat(compraPrecio))}</b>
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button onClick={() => setCompraFor(null)} style={{ flex: 1, padding: '0.7rem', borderRadius: '0.75rem', border: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => compraMutation.mutate()} disabled={!compraValida || compraMutation.isPending}
                style={{ flex: 1, padding: '0.7rem', borderRadius: '0.75rem', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: !compraValida || compraMutation.isPending ? 0.6 : 1 }}>
                {compraMutation.isPending ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
