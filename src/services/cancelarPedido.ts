/**
 * cancelarPedido.ts — único camino para cancelar un pedido completo (Caja y Cocina).
 * Avisa si el pedido ya tiene pagos (hay que anularlos primero), pide confirmación y muestra
 * el mensaje REAL del servidor si lo rechaza. Nunca usa alert().
 */
import message from 'antd/es/message'
import Modal from 'antd/es/modal'
import { supabase } from './supabaseClient'

const confirmar = (title: string, content: string) =>
  new Promise<boolean>(resolve => {
    Modal.confirm({
      title, content, okText: 'Sí, cancelar pedido', cancelText: 'No',
      okButtonProps: { danger: true },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })

const MENSAJE_PEDIDO_PAGADO =
  'Este pedido ya está pagado. Anula primero los pagos en caja (Pagos de hoy) y luego cancélalo.'

/** Devuelve true si el pedido quedó cancelado. */
export async function cancelarPedido(
  orderId: string,
  opts: { pagado?: boolean; enPreparacion?: boolean } = {},
): Promise<boolean> {
  // ¿Tiene pagos vigentes? Si la consulta no se puede hacer (permisos/red) decide el servidor al cancelar.
  let tienePagos = !!opts.pagado
  if (!tienePagos) {
    const { count, error } = await supabase.from('order_payments')
      .select('id', { count: 'exact', head: true }).eq('order_id', orderId).is('anulado_at', null)
    if (!error && (count ?? 0) > 0) tienePagos = true
  }
  if (tienePagos) {
    Modal.warning({ title: 'No se puede cancelar', content: MENSAJE_PEDIDO_PAGADO, okText: 'Entendido' })
    return false
  }

  const ok = await confirmar(
    '¿Cancelar todo el pedido?',
    opts.enPreparacion ? 'El pedido ya está en preparación en cocina.' : 'Esta acción no se puede deshacer.',
  )
  if (!ok) return false

  try {
    const { error } = await supabase.rpc('cancelar_orden', { p_order_id: orderId })
    if (error) { message.error(error.message); return false }
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'No se pudo cancelar el pedido')
    return false
  }
  message.success('Pedido cancelado')
  return true
}
