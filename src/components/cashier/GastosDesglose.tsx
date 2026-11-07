/**
 * GastosDesglose.tsx
 * "¿En qué se gastó?": total de gastos agrupado por categoría, con barra de porcentaje,
 * y al tocar una categoría se ven los gastos individuales. Se usa en el corte diario
 * y en el mensual. Solo lee: recibe la lista de gastos ya cargada.
 */
import { forwardRef, useMemo, useState, type HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { categoriaKey, resumirPorCategoria, totalGastos, type Etiquetas, type GastoLite } from '../../services/gastosResumen'

export interface GastoDetalle extends GastoLite {
  id?:         string
  created_at?: string
}

export interface GastosDesgloseProps extends HTMLAttributes<HTMLDivElement> {
  gastos:   GastoDetalle[]
  /** 'dia' muestra la hora de cada gasto; 'mes' muestra día y hora. */
  periodo?: 'dia' | 'mes'
  /** Nombres personalizados de las categorías del restaurante (clave → nombre). */
  etiquetas?: Etiquetas
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

const cuando = (iso: string | undefined, periodo: 'dia' | 'mes') => {
  if (!iso) return ''
  const d = new Date(iso)
  const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
  if (periodo === 'dia') return hora
  return `${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })} · ${hora}`
}

export const GastosDesglose = forwardRef<HTMLDivElement, GastosDesgloseProps>(
  ({ gastos, periodo = 'dia', etiquetas, className, ...rest }, ref) => {
    const [abierta, setAbierta] = useState<string | null>(null)
    const resumen = useMemo(() => resumirPorCategoria(gastos, etiquetas), [gastos, etiquetas])
    const total = useMemo(() => totalGastos(gastos), [gastos])

    if (resumen.length === 0) return null

    return (
      <div ref={ref} className={cn('flex flex-col gap-2', className)} {...rest}>
        <p className="m-0 text-xs font-bold text-[color:var(--w-text-2)] uppercase tracking-wider">
          ¿En qué se gastó? · {fmt(total)}
        </p>
        {resumen.map(c => {
          const open = abierta === c.key
          const items = gastos
            .filter(g => categoriaKey(g.categoria) === c.key && Number(g.monto) > 0)
            .sort((a, b) => Number(b.monto) - Number(a.monto))
          return (
            <div key={c.key} className="bg-[var(--w-surface-sunken)] rounded-[var(--w-r-md)]" style={{ boxShadow: 'inset 0 0 0 1px var(--w-border)' }}>
              <button
                type="button"
                onClick={() => setAbierta(open ? null : c.key)}
                aria-expanded={open}
                className="w-full text-left px-3 py-2.5 bg-transparent border-none cursor-pointer min-h-[44px]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[color:var(--w-text)]">
                    {c.label}
                    <span className="ml-1.5 text-[length:var(--w-fs-caption)] font-normal text-[color:var(--w-text-3)]">({c.cantidad})</span>
                  </span>
                  <span className="text-sm font-bold text-[color:var(--w-danger-text)] shrink-0">
                    {fmt(c.total)}
                    <span className="ml-1.5 text-[length:var(--w-fs-caption)] font-normal text-[color:var(--w-text-3)]">{Math.round(c.porcentaje)}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-[var(--w-surface)] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--w-danger-bg)] border border-[var(--w-danger)]" style={{ width: `${Math.max(2, c.porcentaje)}%` }} />
                </div>
              </button>
              {open && (
                <div className="px-3 pb-2.5 flex flex-col gap-1 border-t border-[var(--w-border)] pt-2">
                  {items.map((g, i) => (
                    <div key={g.id ?? i} className="flex justify-between gap-3 text-xs">
                      <span className="text-[color:var(--w-text)] min-w-0">
                        <span className="break-words">{g.concepto}</span>
                        {g.created_at && <span className="ml-1.5 text-[color:var(--w-text-3)]">{cuando(g.created_at, periodo)}</span>}
                      </span>
                      <span className="font-semibold text-[color:var(--w-text-2)] shrink-0">{fmt(Number(g.monto))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  },
)
GastosDesglose.displayName = 'GastosDesglose'
