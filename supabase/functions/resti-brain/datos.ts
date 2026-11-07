// Datos del negocio que Resti puede consultar (solo lectura): se calculan aquí con lo que devuelve la base, nunca los inventa el modelo.
// Lógica pura (sin red): agrega ventas por día, platos más vendidos, stock bajo, mesas y tareas.
export interface OrdenFila { total: unknown; created_at: string; items: unknown; status?: string; tipo_pedido?: string | null; payment_method?: string | null }
export interface IngredienteFila { nombre: string; unidad_medida?: string | null; stock_actual: unknown; stock_minimo: unknown }

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const BOGOTA_MS = 5 * 3600_000
/** Día calendario en hora de Colombia (UTC-5 todo el año), como YYYY-MM-DD. */
export const diaBogota = (d: Date | string) => new Date(new Date(d).getTime() - BOGOTA_MS).toISOString().slice(0, 10)

/** items llega como lista o como texto JSON de una lista; cualquier otra cosa = sin platos. */
export function leerItems(raw: unknown): { name: string; quantity: number }[] {
  let v = raw
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return [] } }
  if (!Array.isArray(v)) return []
  return v.map((i: any) => ({ name: String(i?.name ?? '').trim().slice(0, 80), quantity: Math.max(0, Math.min(999, num(i?.quantity) || 1)) })).filter(i => i.name)
}

export interface ResumenDatos {
  ventas_ayer: number; pedidos_ayer: number
  ventas_ultimos_7_dias: number; pedidos_ultimos_7_dias: number
  ventas_por_dia: { dia: string; ventas: number }[]
  platos_mas_vendidos_7_dias: { plato: string; unidades: number }[]
  stock_bajo: { ingrediente: string; stock: number; minimo: number; unidad: string }[]
  mesas: { ocupadas: number; total: number }
  tareas_pendientes: number
}

/** `ordenes`: pedidos COMPLETADOS de los últimos 7 días (la base ya filtra). Se excluye Rappi igual que las métricas del panel. */
export function resumirDatos(o: { ordenes: OrdenFila[]; ingredientes: IngredienteFila[]; mesas: { estado: string }[]; tareasPendientes: number; ahora?: Date }): ResumenDatos {
  const ahora = o.ahora ?? new Date()
  const hoy = diaBogota(ahora), ayer = diaBogota(new Date(ahora.getTime() - 86400_000))
  const porDia = new Map<string, number>(), platos = new Map<string, number>()
  let v7 = 0, p7 = 0, vAyer = 0, pAyer = 0
  for (const x of o.ordenes) {
    if (String(x.tipo_pedido ?? '').toUpperCase() === 'RAPPI' || String(x.payment_method ?? '').toLowerCase() === 'rappi') continue
    const dia = diaBogota(x.created_at), t = num(x.total)
    porDia.set(dia, (porDia.get(dia) ?? 0) + t); v7 += t; p7++
    if (dia === ayer) { vAyer += t; pAyer++ }
    for (const i of leerItems(x.items)) platos.set(i.name, (platos.get(i.name) ?? 0) + i.quantity)
  }
  return {
    ventas_ayer: Math.round(vAyer), pedidos_ayer: pAyer,
    ventas_ultimos_7_dias: Math.round(v7), pedidos_ultimos_7_dias: p7,
    ventas_por_dia: [...porDia.entries()].filter(([d]) => d !== hoy || true).sort((a, b) => a[0].localeCompare(b[0])).map(([dia, ventas]) => ({ dia, ventas: Math.round(ventas) })),
    platos_mas_vendidos_7_dias: [...platos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([plato, unidades]) => ({ plato, unidades })),
    stock_bajo: o.ingredientes.filter(i => num(i.stock_minimo) > 0 && num(i.stock_actual) <= num(i.stock_minimo)).sort((a, b) => num(a.stock_actual) / num(a.stock_minimo) - num(b.stock_actual) / num(b.stock_minimo)).slice(0, 10)
      .map(i => ({ ingrediente: String(i.nombre).slice(0, 60), stock: num(i.stock_actual), minimo: num(i.stock_minimo), unidad: String(i.unidad_medida ?? '') })),
    mesas: { ocupadas: o.mesas.filter(m => m.estado === 'ocupada').length, total: o.mesas.length },
    tareas_pendientes: Math.max(0, Math.round(o.tareasPendientes)),
  }
}
