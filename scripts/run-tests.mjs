// Ejecuta todas las pruebas unitarias *.test.ts (src y supabase/functions) con Node (>=22.6, quita los tipos solo).
// Uso: npm test
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const buscar = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (n === 'node_modules') continue
    statSync(p).isDirectory() ? buscar(p, out) : /\.test\.ts$/.test(n) && out.push(p)
  }
  return out
}
const archivos = ['src', 'supabase/functions'].flatMap((d) => buscar(d))
let fallos = 0
for (const f of archivos) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', f], { encoding: 'utf8' })
  if (r.status === 0) console.log('OK    ', f)
  else { fallos++; console.log('FALLA ', f); console.log((r.stdout + r.stderr).split('\n').slice(0, 8).join('\n')) }
}
console.log(`\n${archivos.length - fallos}/${archivos.length} archivos de prueba OK`)
process.exit(fallos ? 1 : 0)
