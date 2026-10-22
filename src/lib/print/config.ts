/**
 * config.ts — lectura y guardado de la configuración de impresión (tabla restaurant_printing) y del encabezado del recibo.
 * Qué dispositivo es la "estación de impresión" se guarda SOLO en ese equipo (los permisos y la impresora son por equipo).
 */
import { supabase } from '../../services/supabaseClient'
import { normalizarConfig, type ConfigImpresion } from './configModelo.ts'
import type { Encabezado } from './tickets.ts'

export async function cargarConfig(): Promise<ConfigImpresion> {
  const { data } = await supabase.from('restaurant_printing').select('config').maybeSingle()
  return normalizarConfig(data?.config)
}

/** Solo el administrador puede guardar (lo exige la base). */
export async function guardarConfig(c: ConfigImpresion): Promise<string | null> {
  const { error } = await supabase.from('restaurant_printing').upsert({ config: normalizarConfig(c) }, { onConflict: 'restaurant_id' })
  return error ? error.message : null
}

export interface EncabezadoRecibo extends Encabezado { propinaSugeridaPct: number }

/** Nombre, razón social, NIT, dirección y teléfono (de los datos del restaurante) más el mensaje y el pie configurados. */
export async function cargarEncabezado(cfg: ConfigImpresion): Promise<EncabezadoRecibo> {
  const { data } = await supabase.rpc('datos_recibo')
  const d = (data ?? {}) as { nombre?: string; razon_social?: string | null; nit?: string | null; direccion?: string | null; telefono?: string | null }
  return {
    nombre: d.nombre ?? 'Mi restaurante', razonSocial: d.razon_social ?? null, nit: d.nit ?? null, direccion: d.direccion ?? null, telefono: d.telefono ?? null,
    mensaje: cfg.mensaje || null, pie: cfg.pie || null, propinaSugeridaPct: cfg.propinaSugeridaPct,
  }
}

const KEY_ESTACION = 'ros_print_estacion'
export const esEstacion = (): boolean => { try { return localStorage.getItem(KEY_ESTACION) === '1' } catch { return false } }
export const marcarEstacion = (v: boolean) => { try { if (v) localStorage.setItem(KEY_ESTACION, '1'); else localStorage.removeItem(KEY_ESTACION) } catch { /* sin almacenamiento: no se recuerda */ } }
