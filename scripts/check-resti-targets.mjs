// Módulo B7: Resti solo puede señalar/pulsar botones de NAVEGACIÓN. Este script falla el build si no es así.
// Uso:  node scripts/check-resti-targets.mjs   (o  npm run check:resti)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const OCHO = ['card-ventas-hoy', 'card-pendientes', 'card-en-cocina', 'card-listas', 'card-completadas', 'card-mesas-activas', 'tab-nueva-orden', 'tab-mesas']
const CARPETAS_PROHIBIDAS = ['components/cashier/', 'components/billing/', 'components/orders/', 'components/platform/']
const PALABRAS = /cobrar|cancelar|eliminar|delete|pay|submit|save|confirm/i

/** Devuelve el texto de la etiqueta JSX que contiene la posición `pos` (desde su "<" hasta su ">" fuera de llaves). */
function etiquetaEn(texto, pos) {
  let ini = texto.lastIndexOf('<', pos)
  while (ini > 0 && !/[A-Za-z]/.test(texto[ini + 1] ?? '')) ini = texto.lastIndexOf('<', ini - 1)
  let prof = 0, fin = ini
  for (; fin < texto.length; fin++) {
    const c = texto[fin]
    if (c === '{') prof++
    else if (c === '}') prof--
    else if (c === '>' && prof === 0 && texto[fin - 1] !== '=') break
  }
  return texto.slice(ini, fin + 1)
}

/** Revisa un archivo. `ruta` con "/" como separador. */
export function revisar(ruta, texto, permitidos = OCHO) {
  const errores = [], hallados = []
  if (!texto.includes('data-resti-target')) return { errores, hallados }
  const lineas = texto.split('\n')
  const idsDinamicos = [...new Set(lineas.filter(l => /target/i.test(l) && !l.includes('data-resti-target'))
    .flatMap(l => [...l.matchAll(/['"`]((?:card|tab|btn)-[a-z0-9-]+)['"`]/g)].map(m => m[1])))]
  let offset = 0
  lineas.forEach((linea, i) => {
    const m = linea.match(/\sdata-resti-target=/)   // solo atributos JSX (no el selector del querySelector)
    const col = m ? m.index + 1 : -1
    if (col >= 0) {
      const pos = offset + col, etiqueta = etiquetaEn(texto, pos), n = i + 1
      const lit = etiqueta.match(/data-resti-target=(?:"([^"]+)"|\{['"`]([^'"`]+)['"`]\})/)
      const ids = lit ? [lit[1] ?? lit[2]] : idsDinamicos
      const resumen = etiqueta.replace(/\s+/g, ' ').slice(0, 70)
      for (const id of ids) {
        hallados.push({ ruta, linea: n, id, resumen })
        if (!permitidos.includes(id)) errores.push(`${ruta}:${n} el target "${id}" no está en RESTI_TARGETS`)
      }
      if (!ids.length) errores.push(`${ruta}:${n} data-resti-target sin id que se pueda verificar`)
      if (CARPETAS_PROHIBIDAS.some(c => ruta.includes(c))) errores.push(`${ruta}:${n} Resti no puede tener targets en esta carpeta`)
      if (/type\s*=\s*["']submit["']/.test(etiqueta)) errores.push(`${ruta}:${n} el target es un botón type="submit"`)
      const abiertos = (texto.slice(0, pos).match(/<form[\s>]/g) ?? []).length - (texto.slice(0, pos).match(/<\/form>/g) ?? []).length
      if (abiertos > 0) errores.push(`${ruta}:${n} el target está dentro de un <form>`)
      const peligro = etiqueta.match(PALABRAS)
      if (peligro) errores.push(`${ruta}:${n} el elemento contiene "${peligro[0]}" (acción de dinero, borrado o guardado)`)
    }
    offset += linea.length + 1
  })
  return { errores, hallados }
}

function archivos(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? archivos(p) : /\.(tsx|ts|jsx|js)$/.test(n) ? [p] : []
  })
}

function autoprueba() {
  const buenos = '<button onClick={() => onNavigate(\'kitchen\')} data-resti-target="card-listas">Listas</button>'
  const casos = [
    ['bueno', 'src/pages/A.tsx', buenos, false],
    ['botón Cobrar', 'src/pages/A.tsx', '<button onClick={cobrar} data-resti-target="card-listas">Cobrar</button>', true],
    ['id fuera de la lista', 'src/pages/A.tsx', '<button data-resti-target="btn-pagar">x</button>', true],
    ['botón submit', 'src/pages/A.tsx', '<button type="submit" data-resti-target="card-listas">x</button>', true],
    ['dentro de form', 'src/pages/A.tsx', '<form>\n' + buenos + '\n</form>', true],
    ['carpeta de caja', 'src/components/cashier/A.tsx', buenos, true],
  ]
  const fallos = casos.filter(([, ruta, src, debeFallar]) => (revisar(ruta, src).errores.length > 0) !== debeFallar).map(c => c[0])
  if (fallos.length) { console.error('AUTOPRUEBA FALLÓ en: ' + fallos.join(', ')); process.exit(1) }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('check-resti-targets.mjs')) {
  autoprueba()
  const fuente = readFileSync('src/lib/resti/targets.ts', 'utf8')
  const lista = [...(fuente.match(/RESTI_TARGETS\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1])
  const errores = []
  for (const id of lista) if (!OCHO.includes(id)) errores.push(`RESTI_TARGETS tiene un id fuera de los ocho: ${id}`)
  for (const id of OCHO) if (!lista.includes(id)) errores.push(`RESTI_TARGETS no tiene el id: ${id}`)
  const hallados = []
  for (const f of archivos('src')) {
    const r = revisar(relative('.', f).split(sep).join('/'), readFileSync(f, 'utf8'), lista)
    errores.push(...r.errores); hallados.push(...r.hallados)
  }
  console.log(`data-resti-target en el repo (${hallados.length}):`)
  for (const h of hallados) console.log(`  ${h.ruta}:${h.linea}  ${h.id}  ${h.resumen}`)
  const sinUsar = OCHO.filter(id => !hallados.some(h => h.id === id))
  if (sinUsar.length) console.log(`Sin elemento en el panel (no es error): ${sinUsar.join(', ')}`)
  if (errores.length) { console.error('\ncheck:resti FALLÓ:\n' + errores.map(e => '  ' + e).join('\n')); process.exit(1) }
  console.log('check:resti OK')
}
