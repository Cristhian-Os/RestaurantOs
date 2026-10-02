// Destino de un pedido para mostrar en cajero/cocina/mesero.
// El QR de barra agrega el segmento "Barra" a las notas del pedido (separadas por ' · ') (ver PublicMenu).
export const BARRA_NOTE = 'Barra'

export function destinoPedido(o: { table_num: number | null; notes?: string | null; tipo_pedido?: string | null }) {
  if (o.table_num) return `Mesa ${o.table_num}`
  if (o.notes?.split(' · ').includes(BARRA_NOTE)) return BARRA_NOTE
  return o.tipo_pedido ?? 'Pedido'
}
