import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../services/supabaseClient'
import { inventoryService } from '../../services/inventoryService'
import message from 'antd/es/message'
import Button from 'antd/es/button'
import Modal from 'antd/es/modal'
import Table from 'antd/es/table'
import Select from 'antd/es/select'
import InputNumber from 'antd/es/input-number'
import Space from 'antd/es/space'
import Spin from 'antd/es/spin'
import Popconfirm from 'antd/es/popconfirm'
import type { Ingrediente, Receta } from '../../types/inventory'

const S = {
  neoOut: { boxShadow: '8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55)' },
  neoOutSm: { boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)' },
  coral: { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
}

interface RecipeBuilderProps {
  productId?: string
  productName?: string
  onClose?: () => void
}

export function RecipeBuilder({ productId = '', productName = 'Producto', onClose }: RecipeBuilderProps) {
  const queryClient = useQueryClient()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [selectedIngrediente, setSelectedIngrediente] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState<number | null>(1)
  const [totalRecipeCost, setTotalRecipeCost] = useState(0)

  // ─── Query: Ingredientes disponibles ──────────────────────
  const ingredientesQuery = useQuery({
    queryKey: ['ingredientes'],
    queryFn: () => inventoryService.getIngredientes(),
    staleTime: 1000 * 60 * 5,
  })

  // ─── Query: Receta actual ─────────────────────────────────
  const recetaQuery = useQuery({
    queryKey: ['receta', productId],
    queryFn: () => inventoryService.getRecetasByProducto(productId),
    staleTime: 1000 * 60 * 5,
  })

  // ─── Mutation: Agregar ingrediente ────────────────────────
  const addIngredienteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIngrediente || !cantidad) {
        throw new Error('Selecciona ingrediente y cantidad')
      }
      return await inventoryService.addIngredienteToReceta({
        producto_id: productId,
        ingrediente_id: selectedIngrediente,
        cantidad_necesaria: cantidad,
      })
    },
    onSuccess: () => {
      message.success('✅ Ingrediente agregado a receta')
      setSelectedIngrediente(null)
      setCantidad(1)
      queryClient.invalidateQueries({ queryKey: ['receta', productId] })
    },
    onError: (error) => {
      message.error(
        `❌ Error: ${error instanceof Error ? error.message : 'Desconocido'}`
      )
    },
  })

  // ─── Mutation: Remover ingrediente ───────────────────────
  const removeIngredienteMutation = useMutation({
    mutationFn: (recetaId: string) =>
      inventoryService.removeIngredienteFromReceta(recetaId),
    onSuccess: () => {
      message.success('✅ Ingrediente removido')
      queryClient.invalidateQueries({ queryKey: ['receta', productId] })
    },
    onError: (error) => {
      message.error(
        `❌ Error: ${error instanceof Error ? error.message : 'Desconocido'}`
      )
    },
  })

  // ─── Calcular costo total de la receta ────────────────────
  useEffect(() => {
    if (!recetaQuery.data || !ingredientesQuery.data) return

    const totalCost = recetaQuery.data.reduce((sum, receta) => {
      const ing = ingredientesQuery.data.find((i) => i.id === receta.ingrediente_id)
      return sum + (ing ? ing.costo_unitario * receta.cantidad_necesaria : 0)
    }, 0)

    setTotalRecipeCost(totalCost)
  }, [recetaQuery.data, ingredientesQuery.data])

  // ─── Columnas de tabla ────────────────────────────────────
  const columns = [
    {
      title: 'Ingrediente',
      dataIndex: 'ingrediente_id',
      key: 'nombre',
      render: (id: string) => {
        const ing = ingredientesQuery.data?.find((i) => i.id === id)
        return ing ? (
          <span className="font-semibold text-neo-dark">{ing.nombre}</span>
        ) : (
          'Desconocido'
        )
      },
    },
    {
      title: 'Unidad',
      dataIndex: 'ingrediente_id',
      key: 'unidad',
      render: (id: string) => {
        const ing = ingredientesQuery.data?.find((i) => i.id === id)
        return ing ? <span className="text-sm text-neo-mid">{ing.unidad_medida}</span> : '-'
      },
    },
    {
      title: 'Cantidad',
      dataIndex: 'cantidad_necesaria',
      key: 'cantidad',
      render: (val: number) => (
        <span className="font-bold text-neo-dark">{val.toFixed(3)}</span>
      ),
    },
    {
      title: 'Costo Unitario',
      dataIndex: 'ingrediente_id',
      key: 'costo_unit',
      render: (id: string) => {
        const ing = ingredientesQuery.data?.find((i) => i.id === id)
        return ing ? (
          <span className="text-neo-dark">${ing.costo_unitario.toFixed(2)}</span>
        ) : (
          '-'
        )
      },
    },
    {
      title: 'Subtotal',
      key: 'subtotal',
      render: (_: any, record: Receta) => {
        const ing = ingredientesQuery.data?.find((i) => i.id === record.ingrediente_id)
        const subtotal = ing ? ing.costo_unitario * record.cantidad_necesaria : 0
        return <span className="font-bold text-neo-coral">${subtotal.toFixed(2)}</span>
      },
    },
    {
      title: 'Acción',
      key: 'action',
      width: 100,
      render: (_: any, record: Receta) => (
        <Popconfirm
          title="Eliminar ingrediente"
          description="¿Seguro? Esta acción es irreversible."
          onConfirm={() => removeIngredienteMutation.mutate(record.id)}
          okText="Sí"
          cancelText="No"
        >
          <Button
            danger
            size="small"
            loading={removeIngredienteMutation.isPending}
          >
            🗑️
          </Button>
        </Popconfirm>
      ),
    },
  ]

  // ─── Render ───────────────────────────────────────────────
  return (
    <>
      <Button
        type="primary"
        onClick={() => setIsModalVisible(true)}
        className="bg-neo-coral hover:bg-neo-coralDark"
      >
        📝 Editar Receta
      </Button>

      <Modal
        title={`📋 Receta: ${productName}`}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          onClose?.()
        }}
        width={900}
        footer={null}
      >
        <Spin spinning={recetaQuery.isLoading}>
          <div className="space-y-6">
            {/* Sección: Agregar Ingrediente */}
            <div
              className="p-5 bg-neo-surface rounded-3xl border-2 border-neo-light"
              style={S.neoOut}
            >
              <h4 className="text-lg font-bold text-neo-dark mb-4">➕ Agregar Ingrediente</h4>

              <Space.Compact style={{ width: '100%' }}>
                <div style={{ flex: 2 }}>
                  <Select
                    placeholder="Selecciona ingrediente..."
                    value={selectedIngrediente}
                    onChange={setSelectedIngrediente}
                    options={(ingredientesQuery.data || []).map((ing) => ({
                      value: ing.id,
                      label: `${ing.nombre} (${ing.unidad_medida}) • $${ing.costo_unitario.toFixed(2)}/u`,
                    }))}
                    status={!selectedIngrediente && selectedIngrediente !== null ? 'error' : ''}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <InputNumber
                    placeholder="Cantidad"
                    value={cantidad}
                    onChange={(v) => setCantidad(typeof v === "number" ? v : Number(v) || 1)}
                    min={0.01}
                    step={0.1}
                    precision={3}
                    style={{ width: '100%' }}
                  />
                </div>

                <Button
                  type="primary"
                  onClick={() => addIngredienteMutation.mutate()}
                  loading={addIngredienteMutation.isPending}
                  className="bg-neo-coral hover:bg-neo-coralDark"
                >
                  ✅ Agregar
                </Button>
              </Space.Compact>
            </div>

            {/* Tabla: Ingredientes Actuales */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-lg font-bold text-neo-dark">📦 Ingredientes</h4>
                <span className="text-sm bg-neo-base px-3 py-1 rounded-xl text-neo-dark font-bold">
                  Costo Total: <span className="text-neo-coral">${totalRecipeCost.toFixed(2)}</span>
                </span>
              </div>

              <div
                className="rounded-3xl overflow-hidden"
                style={S.neoOutSm}
              >
                <Table
                  columns={columns}
                  dataSource={recetaQuery.data || []}
                  rowKey="id"
                  pagination={{ pageSize: 8, simple: true }}
                  loading={recetaQuery.isLoading}
                  locale={{
                    emptyText: '📭 Sin ingredientes. Agrega algunos arriba.',
                  }}
                />
              </div>
            </div>

            {/* Resumen */}
            {(recetaQuery.data?.length || 0) > 0 && (
              <div className="p-4 bg-neo-light rounded-2xl text-sm text-neo-mid">
                ℹ️ Esta receta usa <strong>{recetaQuery.data?.length || 0}</strong> ingredientes
                y tiene un costo total de <strong className="text-neo-coral">${totalRecipeCost.toFixed(2)}</strong>
              </div>
            )}
          </div>
        </Spin>
      </Modal>
    </>
  )
}
