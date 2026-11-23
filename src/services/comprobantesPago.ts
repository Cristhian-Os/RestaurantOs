import { supabase } from './supabaseClient'

/** Sube la foto del comprobante de una transferencia cobrada en Caja y la ata al pago. No toca montos. */
export async function subirComprobantePago(pagoId: string, file: File): Promise<void> {
  const { data: restaurantId, error: e0 } = await supabase.rpc('current_restaurant_id')
  if (e0) throw new Error(e0.message)
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${restaurantId}/pago-${pagoId}-${Date.now()}.${ext}`
  const up = await supabase.storage.from('comprobantes').upload(path, file, { contentType: file.type })
  if (up.error) throw new Error(up.error.message)
  const { error } = await supabase.rpc('adjuntar_comprobante_pago', { p_pago_id: pagoId, p_path: path })
  if (error) throw new Error(error.message)
}
