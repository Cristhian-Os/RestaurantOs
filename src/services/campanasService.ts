/**
 * campanasService.ts
 * Campañas de promoción por WhatsApp. Todo pasa por funciones de la base (fid_campana*):
 * ellas validan rol, consentimiento, plantilla aprobada y tope de frecuencia. Aquí no se decide nada.
 */
import { supabase } from './supabaseClient'

export type EstadoCampana = 'borrador' | 'pendiente_aprobacion' | 'aprobada' | 'enviando' | 'enviada' | 'rechazada' | 'cancelada'
export type TipoPublico = 'todos' | 'inactivos' | 'mejores' | 'cumple_semana' | 'manual'

export interface Segmento {
  tipo: TipoPublico
  dias?: number
  limite?: number
  cliente_ids?: string[]
}

export interface Campana {
  id: string
  nombre: string
  objetivo: string | null
  segmento: Segmento
  plantilla_id: string | null
  plantilla_nombre: string | null
  variables: Record<string, string>
  estado: EstadoCampana
  programada_para: string | null
  rechazo_motivo: string | null
  creado_por_yo: boolean
  created_at: string
  solicitada_at: string | null
  aprobada_at: string | null
  elegibles_al_aprobar: number | null
}

export interface Audiencia {
  en_publico: number
  elegibles: number
  excluidos: { sin_consentimiento: number; baja: number; sin_telefono: number; duplicado: number; tope_frecuencia: number }
}

export interface Estadisticas {
  estado: EstadoCampana
  elegibles: number
  en_cola: number
  enviados: number
  entregados: number
  leidos: number
  fallidos: number
  cancelados: number
  bajas_posteriores: number
}

export interface PlantillaPromo {
  id: string
  nombre: string
  cuerpo: string
  variables: string[]
}

export interface EstadoWhatsapp {
  puede_enviar: boolean
  motivo: string | null
  plantillas_aprobadas: number
}

export interface BorradorCampana {
  id: string | null
  nombre: string
  objetivo: string
  segmento: Segmento
  plantilla_id: string | null
  variables: Record<string, string>
  programada_para: string | null
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const campanasService = {
  lista: async () => (await rpc<Campana[] | null>('fid_campanas_lista')) ?? [],
  estadoWhatsapp: () => rpc<EstadoWhatsapp>('fid_campanas_whatsapp_estado'),
  config: () => rpc<{ promo_max: number; promo_dias: number }>('fid_campanas_config_obtener'),
  guardarConfig: (promo_max: number, promo_dias: number) =>
    rpc<void>('fid_campanas_config_guardar', { p_promo_max: promo_max, p_promo_dias: promo_dias }),
  plantillas: async (): Promise<PlantillaPromo[]> => {
    const { data, error } = await supabase.from('wa_plantillas').select('id,nombre,cuerpo,variables')
      .eq('categoria', 'marketing').eq('activa', true).eq('estado_meta', 'aprobada').order('nombre')
    if (error) throw new Error(error.message)
    return (data ?? []) as PlantillaPromo[]
  },
  audiencia: (segmento: Segmento, campanaId: string | null) =>
    rpc<Audiencia>('fid_campana_audiencia', { p_segmento: segmento, p_campana_id: campanaId }),
  vistaPrevia: (plantillaId: string, variables: Record<string, string>) =>
    rpc<string>('fid_campana_vista_previa', { p_plantilla_id: plantillaId, p_variables: variables, p_cliente_id: null }),
  guardar: (b: BorradorCampana) =>
    rpc<string>('fid_campana_guardar', {
      p_id: b.id, p_nombre: b.nombre, p_objetivo: b.objetivo || null, p_segmento: b.segmento,
      p_plantilla_id: b.plantilla_id, p_variables: b.variables, p_programada_para: b.programada_para,
    }),
  enviarAAprobacion: (id: string) => rpc<{ elegibles: number }>('fid_campana_enviar_a_aprobacion', { p_id: id }),
  aprobar: (id: string) => rpc<{ estado: EstadoCampana; encolados: number; ya_aprobada: boolean }>('fid_campana_aprobar', { p_id: id }),
  rechazar: (id: string, motivo: string) => rpc<void>('fid_campana_rechazar', { p_id: id, p_motivo: motivo }),
  cancelar: (id: string) => rpc<{ detenidos: number }>('fid_campana_cancelar', { p_id: id }),
  estadisticas: (id: string) => rpc<Estadisticas>('fid_campana_estadisticas', { p_id: id }),
}
