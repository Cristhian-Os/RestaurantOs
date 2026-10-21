/**
 * imagen.ts — validación y reducción de fotos en el navegador antes de subirlas (Anexo D, 3.4 y 5).
 * Solo JPEG, PNG o WebP de hasta 5 MB; se reducen a un máximo de 1600 px y se guardan como JPEG.
 */
export const MAX_FOTO_BYTES = 5 * 1024 * 1024

export function validarImagen(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return `“${file.name}”: solo se aceptan fotos JPEG, PNG o WebP`
  if (file.size > MAX_FOTO_BYTES) return `“${file.name}” pesa más de 5 MB`
  return null
}

export async function comprimirImagen(file: File, max = 1600, calidad = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * k)); canvas.height = Math.max(1, Math.round(bmp.height * k))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la foto')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)   // los PNG con fondo transparente quedan sobre blanco
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return await new Promise<Blob>((ok, mal) => canvas.toBlob(b => (b ? ok(b) : mal(new Error('No se pudo comprimir la foto'))), 'image/jpeg', calidad))
}
