// Menús por franjas horarias — lógica pura (sin red). El SERVIDOR decide qué menú rige y a qué precio;
// aquí solo se interpreta lo que él devuelve y se dibuja la programación semanal.

export interface MenuHorarioPlato {
  dish_id: string
  menu_id?: string | null
  menu_nombre?: string | null
  precio_especial?: number | null
  precios_tamano?: Record<string, number> | null
  todo_el_dia?: boolean
}

export interface MenuVigente {
  id: string
  nombre: string
  descripcion?: string | null
  color?: string | null
  origen: 'horario' | 'extendido' | 'forzado'
}

export interface ControlManual {
  id: string
  tipo: 'forzar' | 'extender' | 'suspender'
  menu_id: string
  hasta: string | null
  nota: string | null
}

export interface MenuHorarioEstado {
  activo: boolean
  zona?: string
  hora_servidor: string
  hora_local?: string
  modo?: 'automatico' | 'manual'
  manual?: ControlManual[] | null
  menus?: MenuVigente[]
  platos?: MenuHorarioPlato[]
  cambia_en?: string | null
  siguiente?: { desde: string; desde_local: string; menus: { id: string; nombre: string }[] } | null
}

// Filas de las tablas (lo que lee el administrador)
export interface MenuHorarioFila {
  id: string
  nombre: string
  descripcion: string | null
  estado: 'activo' | 'pausado' | 'inactivo'
  mostrar_en_qr: boolean
  fecha_inicio: string | null
  fecha_fin: string | null
  prioridad: number
  color: string | null
}
export interface FranjaFila {
  id: string
  menu_id: string
  dias: number[]
  dia_especial_id: string | null
  hora_inicio: string   // 'HH:MM:SS'
  hora_fin: string
}
export interface ProductoMenuFila {
  menu_id: string
  dish_id: string
  precio_especial: number | null
  precios_tamano: Record<string, number>
  sort_order: number
}
export interface DiaEspecialFila { id: string; fecha: string; nombre: string }

/** Plato mínimo que se filtra y reprecia. */
export interface PlatoBase {
  id: string
  price: number
  has_sizes?: boolean
  sizes?: { nombre: string; precio: number }[]
}

/**
 * Aplica el menú vigente a una lista de platos:
 *  - interruptor apagado (o sin estado todavía) → la lista queda IGUAL (el restaurante funciona como siempre);
 *  - encendido → solo se ven los platos del menú vigente (o "todo el día") y con su precio de menú;
 *  - mostrarTodo (personal con autorización del admin): se ven todos, y los que tienen precio de menú lo usan.
 */
export function aplicarMenuHorario<T extends PlatoBase>(
  platos: T[], estado: MenuHorarioEstado | null | undefined, opts: { mostrarTodo?: boolean } = {},
): T[] {
  if (!estado || !estado.activo) return platos
  const porPlato = new Map<string, MenuHorarioPlato>()
  for (const p of estado.platos ?? []) porPlato.set(p.dish_id, p)
  const visibles = opts.mostrarTodo ? platos : platos.filter(d => porPlato.has(d.id))
  return visibles.map(d => {
    const info = porPlato.get(d.id)
    if (!info) return d
    let precio = d.price
    let sizes = d.sizes
    if (d.has_sizes && sizes && info.precios_tamano) {
      sizes = sizes.map(s => (info.precios_tamano?.[s.nombre] != null ? { ...s, precio: Number(info.precios_tamano[s.nombre]) } : s))
    } else if (!d.has_sizes && info.precio_especial != null) {
      precio = Number(info.precio_especial)
    }
    return precio === d.price && sizes === d.sizes ? d : { ...d, price: precio, sizes }
  })
}

/** Milisegundos hasta el próximo cambio, medidos con el reloj del SERVIDOR (no el del dispositivo). */
export function msHastaCambio(estado: MenuHorarioEstado | null | undefined, ahoraCliente: number, recibidoEn: number): number | null {
  if (!estado?.activo || !estado.cambia_en) return null
  const offset = new Date(estado.hora_servidor).getTime() - recibidoEn   // servidor − dispositivo
  const ms = new Date(estado.cambia_en).getTime() - (ahoraCliente + offset)
  return Number.isFinite(ms) ? Math.max(ms, 0) : null
}

// ─── Presentación ────────────────────────────────────────────────────────────
export const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0]   // la semana empieza el lunes

/** '14:30:00' → '2:30 p. m.' */
export function formatoHora(h: string): string {
  const [hh, mm] = h.split(':').map(Number)
  const suf = hh < 12 ? 'a. m.' : 'p. m.'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(mm ?? 0).padStart(2, '0')} ${suf}`
}

export function hhmm(h: string): string { return h.slice(0, 5) }
export function aMinutos(h: string): number { const [hh, mm] = h.split(':').map(Number); return hh * 60 + (mm || 0) }

export function rangoHoras(ini: string, fin: string): string {
  return aMinutos(ini) === aMinutos(fin) ? '24 horas' : `${formatoHora(ini)} – ${formatoHora(fin)}`
}

/** [1,2,3,4,5] → 'Lun a Vie'; [0,6] → 'Sáb y Dom'; todos → 'Todos los días'. */
export function resumenDias(dias: number[]): string {
  const s = [...new Set(dias)]
  if (s.length === 7) return 'Todos los días'
  if (s.length === 0) return 'Sin días'
  const orden = ORDEN_SEMANA.filter(d => s.includes(d))
  // tramos consecutivos en orden lunes→domingo
  const tramos: number[][] = []
  for (const d of orden) {
    const ult = tramos[tramos.length - 1]
    if (ult && ORDEN_SEMANA.indexOf(d) === ORDEN_SEMANA.indexOf(ult[ult.length - 1]) + 1) ult.push(d)
    else tramos.push([d])
  }
  const txt = tramos.map(t => (t.length >= 3 ? `${DIAS_CORTO[t[0]]} a ${DIAS_CORTO[t[t.length - 1]]}` : t.map(d => DIAS_CORTO[d]).join(' y ')))
  return txt.length > 1 ? `${txt.slice(0, -1).join(', ')} y ${txt[txt.length - 1]}` : txt[0]
}

/** 'hace' legible para un plazo: 90 min → '1 h 30 min'. */
export function duracionLegible(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  if (h >= 24) { const d = Math.floor(h / 24); return `${d} d${h % 24 ? ` ${h % 24} h` : ''}` }
  return m ? `${h} h ${m} min` : `${h} h`
}

// ─── Programación semanal (espejo de la lógica del servidor, solo para dibujar) ──
export interface Segmento { menuId: string; ini: number; fin: number }   // minutos 0..1440 dentro de un día

/**
 * Para cada día de la semana (0=domingo…6=sábado) devuelve los tramos en que rige cada menú ACTIVO.
 * Una franja que cruza la medianoche cuenta para el día en que EMPIEZA y se corta en dos tramos
 * (hasta las 24:00 del día de inicio y desde las 00:00 del día siguiente).
 * Solo dibuja franjas semanales: los días especiales y los controles manuales no se muestran aquí.
 */
export function programacionSemanal(menus: MenuHorarioFila[], franjas: FranjaFila[]): Record<number, Segmento[]> {
  const sem: Record<number, Segmento[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
  const activos = new Set(menus.filter(m => m.estado === 'activo').map(m => m.id))
  for (const f of franjas) {
    if (!activos.has(f.menu_id) || f.dia_especial_id) continue
    const ini = aMinutos(f.hora_inicio), fin = aMinutos(f.hora_fin)
    for (const d of f.dias) {
      if (fin > ini) sem[d].push({ menuId: f.menu_id, ini, fin })
      else {   // cruza la medianoche (o 24 h si ini === fin)
        sem[d].push({ menuId: f.menu_id, ini, fin: 1440 })
        if (fin > 0) sem[(d + 1) % 7].push({ menuId: f.menu_id, ini: 0, fin })
      }
    }
  }
  for (const d of Object.keys(sem)) sem[Number(d)].sort((a, b) => a.ini - b.ini || a.fin - b.fin)
  return sem
}

/** Pares de menús que se pisan en algún tramo (aviso al administrador; el servidor desempata por prioridad). */
export function solapamientos(menus: MenuHorarioFila[], franjas: FranjaFila[]): { a: string; b: string; dia: number }[] {
  const sem = programacionSemanal(menus, franjas)
  const out: { a: string; b: string; dia: number }[] = []
  const visto = new Set<string>()
  for (const d of Object.keys(sem).map(Number)) {
    const segs = sem[d]
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const x = segs[i], y = segs[j]
      if (x.menuId !== y.menuId && x.ini < y.fin && y.ini < x.fin) {
        const k = [x.menuId, y.menuId].sort().join('|')
        if (!visto.has(k)) { visto.add(k); out.push({ a: x.menuId, b: y.menuId, dia: d }) }
      }
    }
  }
  return out
}

/** Hora local del restaurante en que cambia la franja ('YYYY-MM-DDTHH:MM'), a partir del estado del servidor. */
export function cambioLocal(estado: MenuHorarioEstado | null | undefined): string | null {
  if (!estado?.activo || !estado.cambia_en || !estado.hora_local) return null
  const delta = new Date(estado.cambia_en).getTime() - new Date(estado.hora_servidor).getTime()
  const t = Date.parse(estado.hora_local + 'Z') + delta   // 'Z' solo para hacer cuentas: es hora local, no UTC
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16) : null
}

/** 'hoy a las 6:00 a. m.' · 'mañana a las 6:00 a. m.' · 'el lunes a las 1:00 p. m.' (ambas horas LOCALES del restaurante). */
export function cuandoLegible(ahoraLocal: string, otraLocal: string): string {
  const [d1, ] = ahoraLocal.split('T'); const [d2, t2] = otraLocal.split('T')
  const u = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) }
  const dias = Math.round((u(d2) - u(d1)) / 86400000)
  const hora = formatoHora(t2)
  const art = Number(t2.split(':')[0]) % 12 === 1 ? 'a la' : 'a las'
  if (dias <= 0) return `hoy ${art} ${hora}`
  if (dias === 1) return `mañana ${art} ${hora}`
  return `el ${DIAS_LARGO[new Date(u(d2)).getUTCDay()].toLowerCase()} ${art} ${hora}`
}

// Zonas horarias ofrecidas (el servidor valida cualquier nombre IANA; esta lista es solo la ayuda para elegir)
export const ZONAS_COMUNES: { id: string; nombre: string }[] = [
  { id: 'America/Bogota', nombre: 'Colombia (Bogotá)' },
  { id: 'America/Mexico_City', nombre: 'México (Ciudad de México)' },
  { id: 'America/Lima', nombre: 'Perú (Lima)' },
  { id: 'America/Guayaquil', nombre: 'Ecuador (Guayaquil)' },
  { id: 'America/Panama', nombre: 'Panamá' },
  { id: 'America/Caracas', nombre: 'Venezuela (Caracas)' },
  { id: 'America/La_Paz', nombre: 'Bolivia (La Paz)' },
  { id: 'America/Santiago', nombre: 'Chile (Santiago)' },
  { id: 'America/Argentina/Buenos_Aires', nombre: 'Argentina (Buenos Aires)' },
  { id: 'America/Montevideo', nombre: 'Uruguay (Montevideo)' },
  { id: 'America/Asuncion', nombre: 'Paraguay (Asunción)' },
  { id: 'America/Sao_Paulo', nombre: 'Brasil (São Paulo)' },
  { id: 'America/Costa_Rica', nombre: 'Costa Rica' },
  { id: 'America/Guatemala', nombre: 'Guatemala' },
  { id: 'America/Santo_Domingo', nombre: 'República Dominicana' },
  { id: 'America/Puerto_Rico', nombre: 'Puerto Rico' },
  { id: 'America/New_York', nombre: 'EE. UU. (Este)' },
  { id: 'America/Chicago', nombre: 'EE. UU. (Centro)' },
  { id: 'America/Los_Angeles', nombre: 'EE. UU. (Pacífico)' },
  { id: 'Europe/Madrid', nombre: 'España (Madrid)' },
]
