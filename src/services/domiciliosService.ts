import { supabase } from './supabaseClient'

export type MetodoPago = 'transferencia' | 'contra_entrega'
export type PagoEstado = 'sin_definir' | 'pendiente_comprobante' | 'comprobante_enviado' | 'confirmado' | 'contra_entrega' | 'pagado_por_repartidor'

export interface Domicilio {
  id: string
  order_id: string
  contacto_nombre: string | null
  contacto_telefono: string | null
  direccion: string
  referencia: string | null
  costo_envio: number
  estado: string
  metodo_pago: MetodoPago | null
  pago_estado: PagoEstado
  comprobante_path: string | null
  pago_rechazo: string | null
  codigo_recogida: string | null
  repartidor_id: string | null
  intentos_codigo: number
  created_at: string
  orders: { total: number; order_number_today: number | null } | null
}

export interface RepartidorLite { id: string; nombre: string; activo: boolean }

export interface CobroRepartidor { pagar_restaurante: number; domicilio: number; cobrar_cliente: number }

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

export const domiciliosService = {
  async abiertos(): Promise<Domicilio[]> {
    const { data, error } = await supabase
      .from('domicilios')
      .select('id, order_id, contacto_nombre, contacto_telefono, direccion, referencia, costo_envio, estado, metodo_pago, pago_estado, comprobante_path, pago_rechazo, codigo_recogida, repartidor_id, intentos_codigo, created_at, orders(total, order_number_today)')
      .not('estado', 'in', '(entregado,cancelado,fallido)')
      .order('created_at', { ascending: true })
    fail(error)
    return (data ?? []) as unknown as Domicilio[]
  },

  /** Admin y cajero leen los repartidores (permiso de la base); los pausados solo sirven para mostrar el nombre. */
  async repartidores(): Promise<RepartidorLite[]> {
    const { data, error } = await supabase.from('repartidores').select('id, nombre, activo').order('nombre')
    fail(error)
    return (data ?? []) as RepartidorLite[]
  },
  async asignarRepartidor(id: string, repartidorId: string) {
    fail((await supabase.rpc('dom_asignar_repartidor', { p_id: id, p_repartidor_id: repartidorId })).error)
  },

  async crear(a: { orderId: string; direccion: string; referencia?: string; costoEnvio: number; nombre: string; telefono?: string; metodo: MetodoPago }) {
    const { error } = await supabase.rpc('dom_crear', {
      p_order_id: a.orderId, p_direccion: a.direccion, p_referencia: a.referencia || null,
      p_costo_envio: a.costoEnvio, p_contacto_nombre: a.nombre, p_contacto_telefono: a.telefono || null, p_metodo_pago: a.metodo,
    })
    fail(error)
  },

  async subirComprobante(d: Domicilio, file: File) {
    const { data: restaurantId, error: e0 } = await supabase.rpc('current_restaurant_id')
    fail(e0)
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${restaurantId}/${d.id}-${Date.now()}.${ext}`
    const up = await supabase.storage.from('comprobantes').upload(path, file, { contentType: file.type })
    fail(up.error)
    const { error } = await supabase.rpc('dom_adjuntar_comprobante', { p_id: d.id, p_path: path })
    fail(error)
  },

  async urlComprobante(path: string): Promise<string | null> {
    const { data } = await supabase.storage.from('comprobantes').createSignedUrl(path, 300)
    return data?.signedUrl ?? null
  },

  async confirmarPago(id: string) { fail((await supabase.rpc('dom_confirmar_pago', { p_id: id })).error) },
  async rechazarPago(id: string, motivo: string) { fail((await supabase.rpc('dom_rechazar_pago', { p_id: id, p_motivo: motivo })).error) },
  async cobroRepartidor(id: string): Promise<CobroRepartidor> {
    const { data, error } = await supabase.rpc('dom_cobro_repartidor', { p_id: id })
    fail(error)
    return data as CobroRepartidor
  },
  async cobrarRepartidor(id: string) { fail((await supabase.rpc('dom_cobrar_repartidor', { p_id: id })).error) },
  async cambiarEstado(id: string, estado: string, motivo?: string) {
    fail((await supabase.rpc('dom_cambiar_estado', { p_id: id, p_estado: estado, p_eta_min: null, p_motivo: motivo ?? null })).error)
  },
  /** true = cerró; false = código incorrecto */
  async cerrarConCodigo(id: string, codigo: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('dom_cerrar_entrega', { p_id: id, p_codigo: codigo })
    fail(error)
    return data === true
  },
  async cerrarSinCodigo(id: string, motivo: string) { fail((await supabase.rpc('dom_cerrar_sin_codigo', { p_id: id, p_motivo: motivo })).error) },
}
