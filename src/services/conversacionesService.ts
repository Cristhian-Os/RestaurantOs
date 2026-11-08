/**
 * conversacionesService.ts
 * Conversaciones de WhatsApp del bot (administrador y cajero). Todo pasa por funciones de la base;
 * el teléfono ya llega enmascarado para el cajero: aquí nunca se intenta mostrar más.
 */
import { supabase } from './supabaseClient'

export type EstadoConv = 'abierta' | 'esperando_humano' | 'cerrada'

export interface Conversacion {
  id: string
  telefono: string
  nombre: string | null
  tipo_contacto: string
  estado: EstadoConv
  ultimo_mensaje_at: string
  ultimo_texto: string | null
  pedido_en_curso: boolean
}

export interface MensajeConv {
  id: string
  direccion: 'entrante' | 'saliente'
  tipo: string
  texto: string | null
  origen: 'cliente' | 'bot' | 'manual' | 'sistema' | 'campana' | 'arm'
  estado: string
  created_at: string
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const conversacionesService = {
  lista: async (estado: EstadoConv | null = null) =>
    (await rpc<Conversacion[] | null>('wa_conversaciones_lista', { p_estado: estado, p_limite: 100 })) ?? [],
  mensajes: async (id: string) =>
    (await rpc<MensajeConv[] | null>('wa_conversacion_mensajes', { p_id: id, p_limite: 200 })) ?? [],
  responder: (id: string, texto: string) => rpc<string>('wa_conversacion_responder', { p_id: id, p_texto: texto }),
  devolverBot: (id: string) => rpc<void>('wa_conversacion_devolver_bot', { p_id: id }),
  cerrar: (id: string) => rpc<void>('wa_conversacion_cerrar', { p_id: id }),
}
