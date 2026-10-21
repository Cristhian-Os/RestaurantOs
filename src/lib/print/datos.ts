/**
 * datos.ts — lee de la base lo que necesita un ticket (pedido, pagos, mesero, número de recibo) y registra cada impresión.
 * Todo viene de lo que ya está guardado: aquí no se recalcula ningún total aparte.
 */
import { supabase } from '../../services/supabaseClient'
import { cargarConfig, cargarEncabezado } from './config'
import { pagosDesdeFilas, pedidoDesdeFila, type FilaPago, type FilaPedido } from './mapeo.ts'
import type { Modelo } from './modelo.ts'
import { buildTicket } from './tickets.ts'

export interface TicketListo { modelo: Modelo; telefonoCliente: string | null; numeroRecibo: number | null }

type FilaConMesero = FilaPedido & { user_id: string | null }

async function filaDe(orderId: string): Promise<{ fila: FilaConMesero; mesero: string | null; pagos: FilaPago[] }> {
  const { data: o, error } = await supabase.from('orders')
    .select('id, order_number_today, table_num, tipo_pedido, customer_name, items, created_at, paid_at, total, propina, payment_method, amount_paid, user_id')
    .eq('id', orderId).maybeSingle()
  if (error || !o) throw new Error('No se encontró el pedido')
  const fila = o as unknown as FilaConMesero
  const [prof, pagos] = await Promise.all([
    fila.user_id ? supabase.from('profiles').select('full_name').eq('id', fila.user_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('order_payments').select('payment_method, monto, propina, monto_recibido, cambio, comensal').eq('order_id', orderId).is('anulado_at', null).order('paid_at'),
  ])
  return { fila, mesero: (prof.data as { full_name?: string } | null)?.full_name ?? null, pagos: (pagos.data ?? []) as FilaPago[] }
}

/** Arma la pre-cuenta o el recibo de un pedido. El recibo exige que el pedido esté pagado y le asigna su número consecutivo (una sola vez). */
export async function armarTicket(tipo: 'precuenta' | 'recibo', orderId: string): Promise<TicketListo> {
  const cfg = await cargarConfig()
  const [encabezado, { fila, mesero, pagos }] = await Promise.all([cargarEncabezado(cfg), filaDe(orderId)])
  const pedido = pedidoDesdeFila(fila, mesero)
  if (tipo === 'precuenta') {
    return { modelo: buildTicket('precuenta', { encabezado, pedido, propinaSugeridaPct: cfg.propinaSugeridaPct }, cfg.anchoRecibo), telefonoCliente: null, numeroRecibo: null }
  }
  if (!fila.paid_at) throw new Error('Este pedido todavía no está pagado: usa la pre-cuenta')
  const { data: numero, error } = await supabase.rpc('numero_recibo_orden', { p_order_id: orderId })
  if (error) throw new Error(error.message)
  const n = Number(numero) || null
  const modelo = buildTicket('recibo', { encabezado, pedido, pagos: pagosDesdeFilas(pagos, fila), numeroRecibo: n, pagadoEn: fila.paid_at }, cfg.anchoRecibo)
  return { modelo, telefonoCliente: null, numeroRecibo: n }
}

/** Deja constancia de cada impresión (y de las que fallan, para poder reintentar). Nunca interrumpe lo que se está haciendo. */
export async function registrarImpresion(
  tipo: 'comanda' | 'precuenta' | 'recibo' | 'cierre' | 'prueba', orderId: string | null, estado: 'impreso' | 'error', error?: string,
  extra?: { clave?: string; estacion?: string; detalle?: unknown },
) {
  try {
    await supabase.from('print_jobs').insert({
      tipo, order_id: orderId, estado, intentos: 1, error: error ? error.slice(0, 300) : null,
      clave: extra?.clave ?? null, estacion: extra?.estacion ?? null, detalle: extra?.detalle ?? null,
    })
  } catch { /* el registro es secundario: si falla, no se avisa ni se bloquea nada */ }
}
