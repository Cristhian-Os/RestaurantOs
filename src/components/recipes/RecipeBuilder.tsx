/**
 * RecipeBuilder.tsx — Flujo 100% manual y dinámico
 * El admin escribe libremente cada materia prima, su precio unitario y la
 * cantidad. Subtotal por línea y costo total se recalculan en tiempo real.
 * Sin selectores de ingredientes preestablecidos.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryService } from '../../services/inventoryService'
import message from 'antd/es/message'
import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import Select from 'antd/es/select'
import Spin from 'antd/es/spin'
import type { RecetaLine } from '../../types/inventory'

interface RecipeBuilderProps {
  productId?: string
  productName?: string
  onClose?: () => void
}

const fmtCOP = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO')

const emptyLine = (): RecetaLine => ({ nombre: '', costo_unitario: 0, cantidad_necesaria: 1, unidad: '' })

// — estilos de input cálidos (siguen el tema claro/oscuro) —
const inputBase: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: '0.625rem',
  padding: '0.55rem 0.7rem', color: 'var(--text-primary)', fontFamily: 'var(--w-sans, inherit)',
  fontSize: '0.875rem', outline: 'none', width: '100%', boxSizing: 'border-box',
}

export function RecipeBuilder({ productId: propProductId = '', productName: propProductName = 'Producto', onClose }: RecipeBuilderProps) {
  const queryClient = useQueryClient()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string>(propProductId)
  const [selectedProductName, setSelectedProductName] = useState<string>(propProductName)
  const [lines, setLines] = useState<RecetaLine[]>([emptyLine()])
  // Calculadora "compré X por $Y" → precio por unidad (ayuda con compras al por mayor, ej. tina de 10 litros)
  const [calcOpen, setCalcOpen] = useState<Record<number, boolean>>({})
  const [calcQty, setCalcQty] = useState<Record<number, string>>({})
  const [calcTotal, setCalcTotal] = useState<Record<number, string>>({})

  const productId = selectedProductId
  const productName = selectedProductName

  // ─── Productos disponibles (para elegir a cuál editar receta) ─
  const productosQuery = useQuery({
    queryKey: ['productos_disponibles'],
    queryFn: () => inventoryService.getProductosDisponibles(),
    staleTime: 1000 * 60 * 5,
    enabled: isModalVisible && !propProductId,
  })

  // ─── Receta actual del producto ───────────────────────────
  const recetaQuery = useQuery({
    queryKey: ['receta', productId],
    queryFn: () => inventoryService.getRecetasByProducto(productId),
    staleTime: 1000 * 60 * 5,
    enabled: !!productId && isModalVisible,
  })

  // Cargar las líneas guardadas al estado editable (o una fila vacía)
  useEffect(() => {
    setCalcOpen({}); setCalcQty({}); setCalcTotal({})
    if (!productId) { setLines([emptyLine()]); return }
    if (recetaQuery.data) {
      const loaded: RecetaLine[] = recetaQuery.data.map(r => ({
        id: r.id,
        nombre: r.nombre ?? '',
        costo_unitario: Number(r.costo_unitario) || 0,
        cantidad_necesaria: Number(r.cantidad_necesaria) || 0,
        unidad: r.unidad ?? '',
      }))
      setLines(loaded.length > 0 ? loaded : [emptyLine()])
    }
  }, [recetaQuery.data, productId])

  // ─── Total en vivo ────────────────────────────────────────
  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.costo_unitario) || 0) * (Number(l.cantidad_necesaria) || 0), 0),
    [lines],
  )
  const validLines = useMemo(
    () => lines.filter(l => l.nombre.trim() !== '' && l.cantidad_necesaria > 0).length,
    [lines],
  )

  // ─── Handlers de filas ────────────────────────────────────
  const updateLine = useCallback((idx: number, field: keyof RecetaLine, value: string | number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }, [])
  const addLine = useCallback(() => setLines(prev => [...prev, emptyLine()]), [])
  // Al quitar una fila, las que quedan después se recorren un índice — hay que
  // re-mapear el estado de la calculadora (que vive aparte, por índice) o se
  // queda pegado a la fila equivocada.
  const reindexAfterRemove = useCallback(<T,>(map: Record<number, T>, removedIdx: number): Record<number, T> => {
    const next: Record<number, T> = {}
    for (const [k, v] of Object.entries(map)) {
      const i = Number(k)
      if (i < removedIdx) next[i] = v
      else if (i > removedIdx) next[i - 1] = v
    }
    return next
  }, [])
  const removeLine = useCallback((idx: number) => {
    setLines(prev => {
      const next = prev.filter((_, i) => i !== idx)
      return next.length > 0 ? next : [emptyLine()]
    })
    setCalcOpen(prev => reindexAfterRemove(prev, idx))
    setCalcQty(prev => reindexAfterRemove(prev, idx))
    setCalcTotal(prev => reindexAfterRemove(prev, idx))
  }, [reindexAfterRemove])

  // Calculadora por línea: "compré X [unidad] por $Y" → precio unitario automático
  const toggleCalc = useCallback((idx: number) => {
    setCalcOpen(prev => ({ ...prev, [idx]: !prev[idx] }))
  }, [])
  const updateCalc = useCallback((idx: number, field: 'qty' | 'total', value: string) => {
    const qty   = parseFloat(field === 'qty'   ? value : calcQty[idx]   ?? '')
    const total = parseFloat(field === 'total' ? value : calcTotal[idx] ?? '')
    if (field === 'qty')   setCalcQty(prev => ({ ...prev, [idx]: value }))
    else                   setCalcTotal(prev => ({ ...prev, [idx]: value }))
    if (qty > 0 && total >= 0) {
      setLines(prev => prev.map((l, i) => i === idx ? { ...l, costo_unitario: total / qty } : l))
    }
  }, [calcQty, calcTotal])

  // ─── Guardar ──────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => inventoryService.saveRecetaLines(productId, lines),
    onSuccess: () => {
      message.success('Receta guardada')
      queryClient.invalidateQueries({ queryKey: ['receta', productId] })
      queryClient.invalidateQueries({ queryKey: ['productos_disponibles'] })
    },
    onError: (error) => message.error(`Error: ${error instanceof Error ? error.message : 'Desconocido'}`),
  })

  const resetAndClose = () => {
    setIsModalVisible(false)
    if (!propProductId) { setSelectedProductId(''); setSelectedProductName('Producto') }
    onClose?.()
  }

  // ─── Render ───────────────────────────────────────────────
  return (
    <>
      <Button type="primary" onClick={() => setIsModalVisible(true)}>
        Editar Receta
      </Button>

      <Modal
        title={`Receta manual: ${productName}`}
        open={isModalVisible}
        onCancel={resetAndClose}
        width={720}
        style={{ maxWidth: '94vw' }}
        footer={null}
        destroyOnClose
      >
        <Spin spinning={recetaQuery.isFetching && !!productId}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: 'var(--w-sans, inherit)' }}>

            {/* Seleccionar producto (si no viene por props) */}
            {!propProductId && (
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                  Producto
                </label>
                <Select
                  placeholder="Elige el producto para editar su receta..."
                  value={selectedProductId || undefined}
                  onChange={(val: string) => {
                    const prod = productosQuery.data?.find(p => p.id === val)
                    setSelectedProductId(val)
                    setSelectedProductName(prod?.name ?? 'Producto')
                  }}
                  loading={productosQuery.isLoading}
                  options={(productosQuery.data || []).map(p => ({ value: p.id, label: p.name }))}
                  style={{ width: '100%' }}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                />
              </div>
            )}

            {!productId ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                Selecciona un producto para escribir su receta.
              </div>
            ) : (
              <>
                {/* Encabezado + total en vivo */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
                    Materias primas
                  </h4>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--divider)', padding: '0.35rem 0.75rem', borderRadius: '0.625rem' }}>
                    Costo total:{' '}
                    <span style={{ color: 'var(--accent)', fontSize: '1.0625rem' }}>{fmtCOP(total)}</span>
                  </span>
                </div>
                <p style={{ margin: '-0.5rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  💡 ¿Compras al por mayor (ej. tina de 10 litros)? Toca 🧮 en la fila para calcular solo el precio por unidad.
                </p>

                {/* Cabecera de columnas (desktop) */}
                <div className="recipe-head" style={{ display: 'none', gap: '0.5rem', padding: '0 0.25rem', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <span style={{ flex: 3 }}>Materia prima</span>
                  <span style={{ flex: 1.4, textAlign: 'right' }}>Precio unit.</span>
                  <span style={{ flex: 1.2, textAlign: 'right' }}>Cantidad</span>
                  <span style={{ flex: 1.4, textAlign: 'right' }}>Subtotal</span>
                  <span style={{ width: 32 }} />
                </div>

                {/* Filas editables */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {lines.map((line, idx) => {
                    const subtotal = (Number(line.costo_unitario) || 0) * (Number(line.cantidad_necesaria) || 0)
                    return (
                      <div key={idx} className="recipe-row" style={{
                        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem',
                        background: 'var(--bg)', border: '1px solid var(--divider)', borderRadius: '0.875rem', padding: '0.625rem',
                      }}>
                        {/* Nombre libre */}
                        <input
                          type="text"
                          value={line.nombre}
                          onChange={e => updateLine(idx, 'nombre', e.target.value)}
                          placeholder="Ej: Harina, Leche, Fresa..."
                          style={{ ...inputBase, flex: 3, minWidth: 140 }}
                        />
                        {/* Precio unitario */}
                        <input
                          type="number" min={0} step={50} inputMode="decimal"
                          value={line.costo_unitario === 0 ? '' : line.costo_unitario}
                          onChange={e => updateLine(idx, 'costo_unitario', parseFloat(e.target.value) || 0)}
                          placeholder="Precio"
                          style={{ ...inputBase, flex: 1.4, minWidth: 90, textAlign: 'right' }}
                        />
                        {/* Cantidad */}
                        <input
                          type="number" min={0} step={0.1} inputMode="decimal"
                          value={line.cantidad_necesaria === 0 ? '' : line.cantidad_necesaria}
                          onChange={e => updateLine(idx, 'cantidad_necesaria', parseFloat(e.target.value) || 0)}
                          placeholder="Cant."
                          style={{ ...inputBase, flex: 1.2, minWidth: 76, textAlign: 'right' }}
                        />
                        {/* Subtotal (vivo) */}
                        <span style={{ flex: 1.4, minWidth: 80, textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontSize: '0.9375rem' }}>
                          {fmtCOP(subtotal)}
                        </span>
                        {/* Calculadora: compré X por $Y → precio unitario */}
                        <button
                          onClick={() => toggleCalc(idx)}
                          title="¿Compraste al por mayor? Calcula el precio por unidad"
                          style={{
                            width: 32, height: 32, flexShrink: 0, borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
                            border: `1px solid ${calcOpen[idx] ? 'var(--accent)' : 'var(--divider)'}`,
                            background: calcOpen[idx] ? 'var(--accent)' : 'transparent',
                          }}
                        >
                          🧮
                        </button>
                        {/* Quitar */}
                        <button
                          onClick={() => removeLine(idx)}
                          title="Quitar"
                          style={{ width: 32, height: 32, flexShrink: 0, borderRadius: '0.5rem', border: '1px solid var(--divider)', background: 'transparent', color: 'var(--w-wine, #b34)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                        >
                          ✕
                        </button>

                        {/* Panel de conversión (compra al por mayor → precio por unidad) */}
                        {calcOpen[idx] && (
                          <div style={{
                            flexBasis: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem',
                            padding: '0.625rem', marginTop: '0.25rem', borderRadius: '0.75rem',
                            background: 'var(--bg-surface)', border: '1px dashed var(--accent)',
                          }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Compré</span>
                            <input
                              type="number" min={0} step={0.1} inputMode="decimal"
                              value={calcQty[idx] ?? ''}
                              onChange={e => updateCalc(idx, 'qty', e.target.value)}
                              placeholder="ej: 10"
                              style={{ ...inputBase, width: 80 }}
                            />
                            <input
                              type="text"
                              value={line.unidad ?? ''}
                              onChange={e => updateLine(idx, 'unidad', e.target.value)}
                              placeholder="litros, kg, unid."
                              style={{ ...inputBase, width: 110 }}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>por</span>
                            <span style={{ fontSize: '0.875rem' }}>$</span>
                            <input
                              type="number" min={0} step={50} inputMode="decimal"
                              value={calcTotal[idx] ?? ''}
                              onChange={e => updateCalc(idx, 'total', e.target.value)}
                              placeholder="ej: 50000"
                              style={{ ...inputBase, width: 100 }}
                            />
                            {parseFloat(calcQty[idx] ?? '') > 0 && (
                              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent)' }}>
                                = {fmtCOP((parseFloat(calcTotal[idx] ?? '0') || 0) / parseFloat(calcQty[idx]))} por {line.unidad?.trim() || 'unidad'}
                                {' '}→ usa "Cantidad" para poner cuántos {line.unidad?.trim() || 'unidad(es)'} lleva este plato
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Agregar fila */}
                <button
                  onClick={addLine}
                  style={{ alignSelf: 'flex-start', padding: '0.55rem 1rem', borderRadius: '0.75rem', border: '1px dashed var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  + Agregar materia prima
                </button>

                {/* Resumen + guardar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--divider)' }}>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {validLines} materia(s) prima(s) · total <strong style={{ color: 'var(--accent)' }}>{fmtCOP(total)}</strong>
                  </p>
                  <Button
                    type="primary"
                    onClick={() => saveMutation.mutate()}
                    loading={saveMutation.isPending}
                    disabled={validLines === 0}
                  >
                    Guardar receta
                  </Button>
                </div>
              </>
            )}
          </div>
        </Spin>
      </Modal>

      <style>{`@media (min-width: 640px) { .recipe-head { display: flex !important; } .recipe-row { flex-wrap: nowrap !important; } }`}</style>
    </>
  )
}
