// Genera public/funciones.json a partir de docs/funciones/manifiesto.json y del código real.
// Para cada función: ¿siguen existiendo sus rutas? y una "huella" (resumen del contenido) para detectar que el código cambió.
// Corre en cada build (Vercel). NUNCA rompe el build: si algo falla, avisa y sale con éxito.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const archivosDe = ruta => {
  const abs = join(raiz, ruta)
  if (!existsSync(abs)) return null
  if (!statSync(abs).isDirectory()) return [abs]
  const salida = []
  const ir = d => { for (const n of readdirSync(d).sort()) { const p = join(d, n); statSync(p).isDirectory() ? ir(p) : salida.push(p) } }
  ir(abs)
  return salida
}

try {
  const manifiesto = JSON.parse(readFileSync(join(raiz, 'docs/funciones/manifiesto.json'), 'utf8'))
  const funciones = manifiesto.funciones.map(f => {
    const h = createHash('sha1')
    let existe = true
    for (const ruta of f.evidencia) {
      const archivos = archivosDe(ruta)
      if (!archivos || archivos.length === 0) { existe = false; continue }
      for (const a of archivos) { h.update(relative(raiz, a)); h.update(readFileSync(a)) }
    }
    return { id: f.id, nombre: f.nombre, area: f.area, evidencia: f.evidencia, existe, huella: h.digest('hex').slice(0, 12) }
  })
  mkdirSync(join(raiz, 'public'), { recursive: true })
  writeFileSync(join(raiz, 'public/funciones.json'), JSON.stringify({ generado: new Date().toISOString(), commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null, funciones }))
  const faltan = funciones.filter(f => !f.existe).map(f => f.id)
  console.log(`funciones.json: ${funciones.length} funciones${faltan.length ? `; SIN rutas: ${faltan.join(', ')}` : ''}`)
} catch (e) {
  console.warn('funciones.json no se generó:', e instanceof Error ? e.message : e)
}
