// Valida el contraste WCAG de los tokens de src/styles/tokens.css (claro y oscuro).
// Uso: npm run check:contrast   → sale con código 1 si algún par no cumple.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')

function block(selector) {
  const start = css.indexOf(selector)
  return css.slice(start, css.indexOf('\n}', start))
}
function tokens(src) {
  const out = {}
  for (const m of src.matchAll(/--w-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2]
  return out
}
const light = tokens(block(':root,\n[data-theme="light"] {'))
const dark = { ...light, ...tokens(block('[data-theme="dark"] {')) }

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [texto, fondo, mínimo, descripción]  — 4.5 texto normal · 3 texto grande / controles
const PAIRS = [
  ['text', 'bg', 4.5, 'texto principal / fondo'],
  ['text', 'surface', 4.5, 'texto principal / tarjeta'],
  ['text-2', 'surface', 4.5, 'texto secundario / tarjeta'],
  ['text-2', 'bg', 4.5, 'texto secundario / fondo'],
  ['text-3', 'surface', 4.5, 'texto tenue / tarjeta'],
  ['text-3', 'bg', 4.5, 'texto tenue / fondo'],
  ['text-3', 'surface-sunken', 4.5, 'texto tenue / hundido'],
  // Decisión del dueño: texto blanco sobre #FF5A00 como las láminas (3,1:1). Se acepta solo
  // para texto de botón en negrita; por eso el mínimo aquí es 3 y no 4.5.
  ['on-accent', 'accent', 3, 'texto blanco sobre botón naranja (excepción aprobada, negrita)'],
  ['on-accent', 'accent-press', 3, 'texto blanco sobre botón naranja (presionado)'],
  ['accent-text', 'bg', 4.5, 'enlace naranja / fondo'],
  ['accent-text', 'surface', 4.5, 'enlace naranja / tarjeta'],
  ['accent-text', 'accent-soft', 4.5, 'texto naranja / selección tenue'],
  ['accent', 'surface', 3, 'icono o borde naranja / tarjeta (no texto)'],
  ['focus', 'bg', 3, 'aro de foco / fondo'],
  ['focus', 'surface', 3, 'aro de foco / tarjeta'],
  ['success-text', 'success-bg', 4.5, 'estado éxito'],
  ['warning-text', 'warning-bg', 4.5, 'estado alerta'],
  ['danger-text', 'danger-bg', 4.5, 'estado error'],
  ['info-text', 'info-bg', 4.5, 'estado info'],
]

let failed = 0
for (const [name, set] of [['CLARO', light], ['OSCURO', dark]]) {
  console.log(`\n${name}`)
  for (const [fg, bg, min, label] of PAIRS) {
    if (!set[fg] || !set[bg]) { console.log(`  ?? falta ${fg} o ${bg}`); failed++; continue }
    const r = ratio(set[fg], set[bg])
    const ok = r >= min
    if (!ok) failed++
    console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${r.toFixed(2).padStart(5)}:1 (mín ${min})  ${label}  [${set[fg]} / ${set[bg]}]`)
  }
}
console.log(failed ? `\n${failed} par(es) no cumplen` : '\nTodos los pares cumplen')
process.exit(failed ? 1 : 0)
