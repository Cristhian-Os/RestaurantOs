/** Validación común de imágenes que se suben a Storage: MIME jpeg/png/webp y ≤ 5 MB. La extensión sale del MIME, no del nombre. */
export const MIME_IMAGEN: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const MAX_IMAGEN_BYTES = 5 * 1024 * 1024

export function validarImagen(file: File, maxBytes = MAX_IMAGEN_BYTES): { ext: string } | { error: string } {
  const ext = MIME_IMAGEN[file.type]
  if (!ext) {
    return { error: /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
      ? 'Las fotos HEIC no se admiten. Cambia la cámara a «Más compatible» (JPG) o toma una captura.'
      : 'La imagen debe ser JPG, PNG o WebP.' }
  }
  if (file.size > maxBytes) return { error: `La imagen pesa demasiado (máximo ${Math.round(maxBytes / 1024 / 1024)} MB).` }
  return { ext }
}
