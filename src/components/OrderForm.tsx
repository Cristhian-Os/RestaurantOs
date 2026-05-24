import { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { offlineService } from '../services/offlineService'
import message from 'antd/es/message'
import Select from 'antd/es/select'
import Button from 'antd/es/button'
import Input from 'antd/es/input'
import InputNumber from 'antd/es/input-number'
import Alert from 'antd/es/alert'
import Spin from 'antd/es/spin'
import type { Order } from '../types'

const S = {
  neoOut: { boxShadow: '8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55)' },
  neoOutSm: { boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)' },
  coral: { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
}

interface OrderFormProps {
  onOrderCreated?: (order: Order) => void
}

type TipoPedido = 'LOCAL' | 'LLEVAR' | 'DOMICILIO' | 'RAPPI'

export function OrderForm({ onOrderCreated }: OrderFormProps) {
  const [userRole, setUserRole] = useState<string>('client')
  const [tipoPedido, setTipoPedido] = useState<TipoPedido>('LOCAL')
  const [tableNum, setTableNum] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Monitorear conectividad
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Obtener rol del usuario
  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile) setUserRole(profile.role)
      } catch (error) {
        console.error('Error fetching user role:', error)
      }
    }

    fetchUserRole()
  }, [])

  // Opciones de tipo de pedido según rol
  const getTipoPedidoOptions = () => {
    const base = [
      { value: 'LOCAL', label: '🍽️ Comer en el lugar' },
      { value: 'LLEVAR', label: '📦 Para llevar' },
      { value: 'DOMICILIO', label: '🚚 Domicilio' },
    ]

    // Solo admin y cashier pueden seleccionar RAPPI
    if (userRole === 'admin' || userRole === 'cashier') {
      base.push({ value: 'RAPPI', label: '🛵 Rappi' })
    }

    return base
  }

  // Crear orden
  const handleCreateOrder = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      // Validar rol
      if (userRole === 'waiter' && tipoPedido === 'RAPPI') {
        throw new Error('Los meseros no pueden crear órdenes RAPPI')
      }

      // FIX MENOR#1 — Validar número de mesa para pedidos locales
      if (tipoPedido === 'LOCAL' && !tableNum) {
        throw new Error('Debes ingresar el número de mesa para pedidos locales')
      }

      const newOrder: Partial<Order> = {
        user_id: user.id,
        items: JSON.stringify([]),
        total: 0,
        status: 'pending',
        tipo_pedido: tipoPedido,
        table_num: tipoPedido === 'LOCAL' ? tableNum : null,
        notes: notes || undefined,
      }

      if (isOnline) {
        // Crear en servidor
        const { data, error } = await supabase
          .from('orders')
          .insert([newOrder])
          .select()
          .single()

        if (error) throw error

        message.success(`✅ Orden ${tipoPedido} creada correctamente`)
        onOrderCreated?.(data)
      } else {
        // Guardar offline
        await offlineService.saveOrderLocally(newOrder as Order)
        message.warning(
          '📡 Orden guardada offline. Se sincronizará cuando vuelva la conexión.'
        )
      }

      // Limpiar formulario
      setTipoPedido('LOCAL')
      setTableNum(null)
      setNotes('')
    } catch (error) {
      message.error(
        `❌ Error: ${error instanceof Error ? error.message : 'Desconocido'}`
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Estado de conectividad */}
      {!isOnline && (
        <Alert
          message="📡 Modo Offline"
          description="Estás trabajando sin conexión. Las órdenes se sincronizarán automáticamente."
          type="warning"
          showIcon
        />
      )}

      {/* Formulario */}
      <div className="p-6 bg-neo-surface rounded-3xl space-y-4" style={S.neoOut}>
        <h3 className="text-xl font-bold text-neo-dark">📋 Nueva Orden</h3>

        {/* Tipo de Pedido */}
        <div>
          <label className="block text-sm font-semibold text-neo-dark mb-2">
            Tipo de Pedido
          </label>
          <Select
            value={tipoPedido}
            onChange={(v) => setTipoPedido(v as any)}
            options={getTipoPedidoOptions()}
            className="w-full"
          />
          {userRole === 'waiter' && (
            <p className="text-xs text-neo-mid mt-2">
              ℹ️ Como mesero, solo puedes crear órdenes locales, para llevar o a domicilio.
            </p>
          )}
        </div>

        {/* Mesa (Solo para LOCAL) */}
        {tipoPedido === 'LOCAL' && (
          <div>
            <label className="block text-sm font-semibold text-neo-dark mb-2">
              Número de Mesa
            </label>
            <InputNumber
              value={tableNum}
              onChange={(v) => setTableNum(typeof v === "number" ? v : Number(v) || 0)}
              placeholder="Ej: 5"
              min={1}
              max={99}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Notas */}
        <div>
          <label className="block text-sm font-semibold text-neo-dark mb-2">
            Notas (opcional)
          </label>
          <Input.TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: Sin picante, alergias, etc..."
            rows={2}
            maxLength={500}
          />
        </div>

        {/* Botón */}
        <Button
          type="primary"
          block
          loading={loading}
          onClick={handleCreateOrder}
          className="bg-neo-coral hover:bg-neo-coralDark h-10 text-lg font-bold"
          style={loading ? undefined : S.coral}
        >
          {isOnline ? '✅ Crear Orden' : '📡 Guardar Offline'}
        </Button>
      </div>

      {/* Info */}
      <div className="p-3 bg-neo-light rounded-2xl text-xs text-neo-mid">
        💡 La orden se puede editar después de crear. Ten cuidado con RAPPI — requiere permisos de administrador.
      </div>
    </div>
  )
}
