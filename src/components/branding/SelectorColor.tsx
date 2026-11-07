/**
 * Selector de color con todo el espectro: un cuadro (claridad e intensidad) y una barra de tonos.
 * Se arrastra con el dedo o el mouse. `onCambio` va avisando mientras se arrastra; `onSoltar` una vez al soltar.
 * Los degradados de aquí dentro son del propio selector (muestran el espectro), no de la app.
 */
import { useEffect, useRef, useState, type PointerEvent as PE } from 'react'

type HSV = { h: number; s: number; v: number }

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n))

export function hexAHsv(hex: string): HSV {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max }
}

export function hsvAHex({ h, s, v }: HSV): string {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  const x = (n: number) => Math.round(f(n) * 255).toString(16).padStart(2, '0')
  return `#${x(5)}${x(3)}${x(1)}`.toUpperCase()
}

/** Segundo color del degradado: el mismo tono, más claro. */
export function aclarar(hex: string): string {
  const { h, s, v } = hexAHsv(hex)
  return hsvAHex({ h, s: s * 0.62, v: Math.min(1, v + (1 - v) * 0.45) })
}

interface Props { valor: string; onCambio: (hex: string) => void; onSoltar: (hex: string) => void }

export function SelectorColor({ valor, onCambio, onSoltar }: Props) {
  const [hsv, setHsv] = useState<HSV>(() => hexAHsv(valor))
  const cuadro = useRef<HTMLDivElement>(null)
  const barra = useRef<HTMLDivElement>(null)
  const ultimo = useRef(valor)

  // Si el color cambia desde fuera (p. ej. "Volver al naranja"), el selector lo sigue.
  useEffect(() => { if (valor.toUpperCase() !== ultimo.current.toUpperCase()) { setHsv(hexAHsv(valor)); ultimo.current = valor } }, [valor])

  const emitir = (n: HSV, soltar = false) => {
    setHsv(n)
    const hex = hsvAHex(n); ultimo.current = hex
    soltar ? onSoltar(hex) : onCambio(hex)
  }

  const mover = (e: PE, tipo: 'cuadro' | 'barra', soltar = false) => {
    const el = (tipo === 'cuadro' ? cuadro : barra).current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = clamp((e.clientX - r.left) / r.width), y = clamp((e.clientY - r.top) / r.height)
    emitir(tipo === 'cuadro' ? { ...hsv, s: x, v: 1 - y } : { ...hsv, h: x * 360 }, soltar)
  }

  const manejo = (tipo: 'cuadro' | 'barra') => ({
    onPointerDown: (e: PE) => { e.currentTarget.setPointerCapture(e.pointerId); mover(e, tipo) },
    onPointerMove: (e: PE) => { if (e.buttons) mover(e, tipo) },
    onPointerUp: (e: PE) => mover(e, tipo, true),
  })

  const tono = hsvAHex({ h: hsv.h, s: 1, v: 1 })
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
      <div ref={cuadro} {...manejo('cuadro')} role="group" aria-label="Elige la intensidad y la claridad del color"
        style={{ position: 'relative', height: 170, borderRadius: 14, cursor: 'crosshair', touchAction: 'none',
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${tono})`, border: '1px solid var(--w-border)' }}>
        <span aria-hidden style={{ position: 'absolute', left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, width: 22, height: 22, marginLeft: -11, marginTop: -11,
          borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 0 0 1.5px rgba(0,0,0,.45)', background: hsvAHex(hsv), pointerEvents: 'none' }} />
      </div>
      <div ref={barra} {...manejo('barra')} role="group" aria-label="Elige el tono"
        style={{ position: 'relative', height: 26, borderRadius: 13, cursor: 'pointer', touchAction: 'none', border: '1px solid var(--w-border)',
          background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}>
        <span aria-hidden style={{ position: 'absolute', left: `${(hsv.h / 360) * 100}%`, top: '50%', width: 26, height: 26, marginLeft: -13, marginTop: -13,
          borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 0 0 1.5px rgba(0,0,0,.45)', background: tono, pointerEvents: 'none' }} />
      </div>
    </div>
  )
}
