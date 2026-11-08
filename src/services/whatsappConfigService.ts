/**
 * whatsappConfigService.ts
 * Configuración del administrador: número de WhatsApp del restaurante y empresas/personas de reparto.
 * Las tablas (wa_config, repartidores) solo las escribe el administrador (RLS). No se borra nada: se desactiva.
 * Los teléfonos se guardan solo con dígitos e indicativo del país (ej. 573001234567).
 */
import { supabase } from './supabaseClient'

export interface WaConfig {
  restaurant_id: string
  modo: 'desactivado' | 'manual' | 'bot'
  numero_negocio: string | null
  bot_pedidos?: boolean
  bot_nombre?: string | null
  bot_tono?: string | null
  bot_info?: string | null
  horario?: string | null
  tarifa_domicilio?: number
  cobertura?: string | null
  datos_transferencia?: string | null
  bot_bienvenida?: string | null
  pedido_minimo?: number
  minutos_confirmar_entrega?: number
}

/** Campos del "Cerebro del bot" que el administrador edita. */
export type CerebroBot = Required<Pick<WaConfig,
  'bot_pedidos' | 'bot_nombre' | 'bot_tono' | 'bot_info' | 'horario' | 'tarifa_domicilio' | 'cobertura' | 'datos_transferencia' | 'bot_bienvenida' | 'pedido_minimo'>>

export interface BotRespuesta {
  respuesta: string
  estado: string
  resumen: { items: { nombre: string; cantidad: number; subtotal: number }[]; domicilio: number; total: number } | null
  aviso?: string
}

export interface Repartidor {
  id: string
  nombre: string
  telefono: string
  activo: boolean
}

/** Traduce los errores técnicos de la base a algo que el administrador entienda. */
function fail(error: { message: string } | null): void {
  if (!error) return
  if (error.message.includes('duplicate key')) throw new Error('Ese número ya está registrado.')
  if (error.message.includes('check constraint')) throw new Error('Revisa el número: debe tener entre 8 y 15 dígitos con el indicativo del país.')
  throw new Error(error.message)
}

export const whatsappConfigService = {
  async getConfig(): Promise<WaConfig | null> {
    const { data, error } = await supabase.from('wa_config').select('restaurant_id,modo,numero_negocio,bot_pedidos,bot_nombre,bot_tono,bot_info,horario,tarifa_domicilio,cobertura,datos_transferencia,bot_bienvenida,pedido_minimo,minutos_confirmar_entrega').maybeSingle()
    fail(error)
    return data as WaConfig | null
  },

  /** Guarda el "Cerebro del bot". Si todavía no hay fila de configuración, la crea. */
  async guardarCerebro(actual: WaConfig | null, c: CerebroBot): Promise<void> {
    if (!actual) {
      const { error } = await supabase.from('wa_config').insert(c)
      fail(error)
      return
    }
    const { error } = await supabase.from('wa_config').update(c).eq('restaurant_id', actual.restaurant_id)
    fail(error)
  },

  /** Prueba el bot en un cuaderno aparte: no sale a WhatsApp ni crea pedidos reales. */
  async probarBot(mensaje: string, reiniciar = false): Promise<BotRespuesta> {
    const { data, error } = await supabase.functions.invoke('whatsapp-bot-probar', { body: { mensaje, reiniciar } })
    if (error) {
      let detalle = ''
      try { detalle = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error ?? '' } catch { /* sin detalle */ }
      throw new Error(detalle || 'El bot no está listo: revisa que esté en modo bot y que las llaves de WhatsApp estén cargadas.')
    }
    return data as BotRespuesta
  },

  /** Guarda el número del negocio. El modo no cambia: el bot sigue apagado hasta conectar la API. */
  async setNumeroNegocio(actual: WaConfig | null, numero: string | null): Promise<void> {
    if (!actual) {
      const { error } = await supabase.from('wa_config').insert({ numero_negocio: numero })
      fail(error)
      return
    }
    const { error } = await supabase.from('wa_config').update({ numero_negocio: numero }).eq('restaurant_id', actual.restaurant_id)
    fail(error)
  },

  /** Minutos que el bot espera antes de preguntarle al repartidor si ya entregó (5 a 120). */
  async setMinutosConfirmar(actual: WaConfig | null, minutos: number): Promise<void> {
    if (!Number.isInteger(minutos) || minutos < 5 || minutos > 120) throw new Error('Escribe un número de minutos entre 5 y 120.')
    if (!actual) {
      const { error } = await supabase.from('wa_config').insert({ minutos_confirmar_entrega: minutos })
      fail(error)
      return
    }
    const { error } = await supabase.from('wa_config').update({ minutos_confirmar_entrega: minutos }).eq('restaurant_id', actual.restaurant_id)
    fail(error)
  },

  async getRepartidores(): Promise<Repartidor[]> {
    const { data, error } = await supabase
      .from('repartidores').select('id,nombre,telefono,activo').order('activo', { ascending: false }).order('nombre')
    fail(error)
    return (data ?? []) as Repartidor[]
  },

  async crearRepartidor(nombre: string, telefono: string): Promise<void> {
    const { error } = await supabase.from('repartidores').insert({ nombre: nombre.trim(), telefono })
    fail(error)
  },

  async editarRepartidor(id: string, cambios: Partial<Pick<Repartidor, 'nombre' | 'telefono' | 'activo'>>): Promise<void> {
    const { error } = await supabase.from('repartidores').update(cambios).eq('id', id)
    fail(error)
  },
}
