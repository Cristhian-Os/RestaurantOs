import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { inventoryService } from '../../services/inventoryService'
import Table from 'antd/es/table'
import Tag from 'antd/es/tag'
import Button from 'antd/es/button'
import message from 'antd/es/message'
import Empty from 'antd/es/empty'
import Spin from 'antd/es/spin'
import Statistic from 'antd/es/statistic'
import Row from 'antd/es/row'
import Col from 'antd/es/col'
import Card from 'antd/es/card'
import type { ListaCompras } from '../../types/inventory'

const S = {
  neoOut: { boxShadow: 'var(--shadow-out)' },
  neoOutSm: { boxShadow: 'var(--shadow-out-sm)' },
  coral: { boxShadow: 'var(--shadow-coral)' },
}

// Postgres numeric llega como string vía Supabase/PostgREST — nunca confiar en el tipo TS
const fmtCOP = (n: unknown) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')

export function ShoppingList() {
  const [filteredPriority, setFilteredPriority] = useState<'URGENTE' | 'ALTO' | 'NORMAL' | 'TODOS'>('TODOS')

  // Query: Lista de compras
  const listaQuery = useQuery({
    queryKey: ['shopping_list'],
    queryFn: () => inventoryService.getListaCompras(),
    refetchInterval: 1000 * 60 * 5, // Refrescar cada 5 minutos
    staleTime: 1000 * 60 * 2,
  })

  // Filtrar datos
  const filteredData = (listaQuery.data || []).filter((item) =>
    filteredPriority === 'TODOS' ? true : item.prioridad === filteredPriority
  )

  // Calcular totales
  const totalItems = filteredData.length
  const totalCost = filteredData.reduce((sum, item) => sum + Number(item.costo_total), 0)
  const urgenteCount = (listaQuery.data || []).filter((i) => i.prioridad === 'URGENTE').length
  const altoCount = (listaQuery.data || []).filter((i) => i.prioridad === 'ALTO').length

  // Descargar como CSV
  const handleDownloadCSV = () => {
    if (!filteredData.length) {
      message.warning('No hay datos para descargar')
      return
    }

    const headers = [
      'Ingrediente',
      'Unidad',
      'Stock Actual',
      'Stock Mínimo',
      'Cantidad Sugerida',
      'Costo Unitario',
      'Costo Total',
      'Prioridad',
    ]

    const rows = filteredData.map((item) => [
      item.nombre,
      item.unidad_medida,
      Number(item.stock_actual).toFixed(2),
      Number(item.stock_minimo).toFixed(2),
      Number(item.cantidad_sugerida).toFixed(2),
      Number(item.costo_unitario).toFixed(2),
      Number(item.costo_total).toFixed(2),
      item.prioridad,
    ])

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    link.setAttribute('href', url)
    link.setAttribute('download', `lista-compras-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)

    link.click()
    document.body.removeChild(link)

    message.success('Lista descargada como CSV')
  }

  // Descargar como JSON
  const handleDownloadJSON = () => {
    if (!filteredData.length) {
      message.warning('No hay datos para descargar')
      return
    }

    const json = JSON.stringify(
      filteredData.map((item) => ({
        ingrediente: item.nombre,
        unidad: item.unidad_medida,
        cantidad_sugerida: Number(item.cantidad_sugerida),
        costo_total: Number(item.costo_total),
        prioridad: item.prioridad,
      })),
      null,
      2
    )

    const blob = new Blob([json], { type: 'application/json' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    link.setAttribute('href', url)
    link.setAttribute('download', `lista-compras-${new Date().toISOString().split('T')[0]}.json`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)

    link.click()
    document.body.removeChild(link)

    message.success('Lista descargada como JSON')
  }

  // Columnas de tabla
  const columns = [
    {
      title: 'Ingrediente',
      dataIndex: 'nombre',
      key: 'nombre',
      width: 150,
      render: (text: string) => <span className="font-semibold text-neo-dark">{text}</span>,
    },
    {
      title: 'Unidad',
      dataIndex: 'unidad_medida',
      key: 'unidad',
      width: 80,
      render: (text: string) => <span className="text-sm text-neo-mid">{text}</span>,
    },
    {
      title: 'Stock Actual',
      dataIndex: 'stock_actual',
      key: 'stock_actual',
      width: 100,
      render: (val: number) => (
        <span className={Number(val) <= 0 ? 'text-red-600 font-bold' : 'text-neo-dark'}>
          {Number(val).toFixed(2)}
        </span>
      ),
      sorter: (a: ListaCompras, b: ListaCompras) => Number(a.stock_actual) - Number(b.stock_actual),
    },
    {
      title: 'Stock Mín.',
      dataIndex: 'stock_minimo',
      key: 'stock_minimo',
      width: 100,
      render: (val: number) => <span className="text-sm text-neo-mid">{Number(val).toFixed(2)}</span>,
    },
    {
      title: 'Qty Sugerida',
      dataIndex: 'cantidad_sugerida',
      key: 'cantidad_sugerida',
      width: 110,
      render: (val: number) => (
        <span className="font-bold text-neo-coral">{Number(val).toFixed(2)}</span>
      ),
    },
    {
      title: 'Costo Unit.',
      dataIndex: 'costo_unitario',
      key: 'costo_unitario',
      width: 100,
      render: (val: number) => (
        <span className="text-sm text-neo-dark">{fmtCOP(val)}</span>
      ),
    },
    {
      title: 'Costo Total',
      dataIndex: 'costo_total',
      key: 'costo_total',
      width: 110,
      render: (val: number) => (
        <span className="font-bold text-neo-dark">{fmtCOP(val)}</span>
      ),
      sorter: (a: ListaCompras, b: ListaCompras) => Number(a.costo_total) - Number(b.costo_total),
    },
    {
      title: 'Prioridad',
      dataIndex: 'prioridad',
      key: 'prioridad',
      width: 100,
      render: (val: 'URGENTE' | 'ALTO' | 'NORMAL') => {
        const colors = { URGENTE: 'red', ALTO: 'orange', NORMAL: 'green' }
        const icons = { URGENTE: '', ALTO: '', NORMAL: '' }
        return (
          <Tag color={colors[val]} className="cursor-pointer">
            {icons[val]} {val}
          </Tag>
        )
      },
      filters: [
        { text: 'Urgente', value: 'URGENTE' },
        { text: 'Alto', value: 'ALTO' },
        { text: 'Normal', value: 'NORMAL' },
      ],
      onFilter: (value: any, record: ListaCompras) => record.prioridad === value,
    },
  ]

  // Render
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-neo-dark mb-1">Lista de Compras Automática</h2>
          <p className="text-sm text-neo-mid">Generada automáticamente según stock de ingredientes</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleDownloadCSV} className="bg-neo-base text-neo-dark">
            CSV
          </Button>
          <Button onClick={handleDownloadJSON} className="bg-neo-base text-neo-dark">
            JSON
          </Button>
          <Button type="primary" onClick={() => listaQuery.refetch()} className="bg-neo-coral hover:bg-neo-coralDark">
            Refrescar
          </Button>
        </div>
      </div>

      {/* Métricas */}
      <Row gutter={16}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={S.neoOutSm}>
            <Statistic
              title="Items a Comprar"
              value={totalItems}
              prefix=""
              valueStyle={{ color: 'var(--text-primary)' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={S.coral}>
            <Statistic
              title="Costo Total"
              value={totalCost}
              formatter={(val) => fmtCOP(val)}
              valueStyle={{ color: 'var(--accent)' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={S.neoOutSm}>
            <Statistic
              title="Urgentes"
              value={urgenteCount}
              prefix=""
              valueStyle={{ color: '#dc2626' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={S.neoOutSm}>
            <Statistic
              title="Prioritarios"
              value={altoCount}
              prefix=""
              valueStyle={{ color: '#ea580c' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filtros */}
      <div className="flex gap-2">
        {['TODOS', 'URGENTE', 'ALTO', 'NORMAL'].map((priority) => (
          <Button
            key={priority}
            onClick={() => setFilteredPriority(priority as any)}
            type={filteredPriority === priority ? 'primary' : 'default'}
            className={
              filteredPriority === priority
                ? 'bg-neo-coral text-white'
                : 'bg-neo-base text-neo-dark'
            }
          >
            {priority === 'TODOS' && 'Todos'}
            {priority === 'URGENTE' && 'Urgentes'}
            {priority === 'ALTO' && 'Altos'}
            {priority === 'NORMAL' && 'Normales'}
            <span className="ml-1 font-bold">
              ({(listaQuery.data || []).filter((i) =>
                priority === 'TODOS' ? true : i.prioridad === priority
              ).length})
            </span>
          </Button>
        ))}
      </div>

      {/* Tabla */}
      <Spin spinning={listaQuery.isLoading}>
        <div className="rounded-3xl overflow-hidden" style={S.neoOut}>
          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey="id"
            pagination={{ pageSize: 15, showSizeChanger: true }}
            loading={listaQuery.isLoading}
            locale={{
              emptyText: <Empty description="Sin items para comprar" />,
            }}
            scroll={{ x: true }}
          />
        </div>
      </Spin>

      {/* Info */}
      {filteredData.length > 0 && (
        <div
          className="p-4 rounded-2xl bg-neo-light text-sm text-neo-mid"
          style={S.neoOutSm}
        >
          <strong>Total:</strong> {totalItems} ingredientes •{' '}
          <strong>Inversión:</strong> {fmtCOP(totalCost)} • Fecha:{' '}
          {new Date().toLocaleDateString('es-ES')}
        </div>
      )}
    </div>
  )
}
