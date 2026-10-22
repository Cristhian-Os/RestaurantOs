/**
 * comandas.ts — imprime comandas: a mano (REIMPRESIÓN) o sola en la "estación de impresión" (nueva / ADICIÓN / ANULADO).
 * Cada comanda automática se reserva primero en print_jobs con una clave única: si dos equipos están en modo estación,
 * solo uno la imprime. El reparto por impresora sale de las categorías de cada plato (cocina vs barra).
 * Imprime con el diálogo del navegador; sin impresión silenciosa un equipo de cocina debe abrirse con --kiosk-printing.
 */
import { supabase } from '../../services/supabaseClient'
import { cargarConfig } from './config'
import { registrarImpresion } from './datos'
import { repartirPorImpresora, type ConfigImpresion, type Impresora } from './configModelo.ts'
import { firmaItem, parseItems, pedidoDesdeFila, planearComandas, type FilaPedido } from './mapeo.ts'
import { imprimirEnNavegador } from './navegador'
import { buildTicket, type ItemPedido, type ModoComanda } from './tickets.ts'

const COLS = 'id, order_number_today, table_num, tipo_pedido, customer_name, items, created_at, paid_at, total, user_id'
type FilaOrden = FilaPedido & { user_id: string | null }
const SIN_IMPRESORAS: Impresora = { id: 'defecto', nombre: 'Cocina', ancho: 58, activa: true, categorias: [], copias: 1 }

const meseros = new Map<string, string | null>()
async function nombreMesero(id: string | null): Promise<string | null> {
  if (!id) return null
  if (!meseros.has(id)) { const { data } = await supabase.from('profiles').select('full_name').eq('id', id).maybeSingle(); meseros.set(id, (data as { full_name?: string } | null)?.full_name ?? null) }
  return meseros.get(id) ?? null
}

let categorias: Record<string, string> | null = null
async function categoriaDePlatos(): Promise<Record<string, string>> {
  if (!categorias) {
    const { data } = await supabase.from('dishes').select('id, category')
    categorias = Object.fromEntries(((data ?? []) as { id: string; category: string }[]).map(d => [d.id, d.category]))
  }
  return categorias
}

export interface Resultado { impresas: number; fallos: string[] }

const MAX_INTENTOS = 3            // tras 3 fallos seguidos ya no se reintenta solo: queda el aviso y el botón manual
const ESPERA_ERROR_MS = 30_000    // espera mínima (por intento) antes de reintentar un trabajo en error
const PENDIENTE_VIEJO_MS = 120_000 // un trabajo «pendiente» más viejo que esto se da por abandonado (la estación se cerró a medias)

/** Reserva el trabajo en print_jobs. Devuelve el nº de intento si ESTE equipo debe imprimir, o null si no (ya impreso, lo tiene otro, o se rindió). */
async function reservar(claveImp: string, base: Record<string, unknown>): Promise<number | null> {
  const ahora = new Date().toISOString()
  const { error } = await supabase.from('print_jobs').insert({ ...base, clave: claveImp, estado: 'pendiente', intentos: 1 })
  if (!error) return 1
  if (error.code !== '23505') return null                      // no se pudo reservar (red/permiso): no se imprime a ciegas, se reintenta en el siguiente ciclo
  // Ya existía: solo se retoma si falló (error) o quedó abandonado (pendiente viejo); si está impreso, no se repite.
  const { data: previo } = await supabase.from('print_jobs').select('estado, intentos, updated_at').eq('clave', claveImp).maybeSingle()
  const j = previo as { estado: string; intentos: number; updated_at: string } | null
  if (!j || j.estado === 'impreso') return null
  const edad = Date.now() - Date.parse(j.updated_at)
  const retomable = (j.estado === 'error' && j.intentos < MAX_INTENTOS && edad >= ESPERA_ERROR_MS * Math.max(1, j.intentos))
    || (j.estado === 'pendiente' && edad >= PENDIENTE_VIEJO_MS && j.intentos < MAX_INTENTOS)
  if (!retomable) return null
  // Toma atómica: solo gana quien encuentra la fila exactamente como la leyó (dos estaciones no la retoman a la vez).
  const { data: tomada } = await supabase.from('print_jobs')
    .update({ estado: 'pendiente', intentos: j.intentos + 1, error: null, detalle: base.detalle ?? null, updated_at: ahora })
    .eq('clave', claveImp).eq('estado', j.estado).eq('intentos', j.intentos).eq('updated_at', j.updated_at).select('id')
  return tomada && tomada.length > 0 ? j.intentos + 1 : null
}

/**
 * Reparte los platos por impresora e imprime una comanda por cada una. `clave` (solo automático) reserva el trabajo para que no se repita.
 * `solo` limita el reparto a esas impresoras (reintentar únicamente donde falló).
 */
async function imprimirReparto(cfg: ConfigImpresion, fila: FilaOrden, items: ItemPedido[], modo: ModoComanda, clave: string | null, detalle?: unknown, solo?: string[]): Promise<Resultado> {
  const pedido = pedidoDesdeFila(fila, await nombreMesero(fila.user_id))
  const cats = await categoriaDePlatos()
  const reparto = repartirPorImpresora(items, cfg.impresoras.some(i => i.activa) ? cfg.impresoras : [SIN_IMPRESORAS], it => cats[it.id ?? ''])
    .filter(r => !solo || solo.includes(r.impresora.nombre))
  const res: Resultado = { impresas: 0, fallos: [] }
  for (const { impresora, items: suyos } of reparto) {
    const claveImp = clave ? `${clave}:${impresora.id}` : null
    let intento = 1
    if (claveImp) {
      const r = await reservar(claveImp, { tipo: 'comanda', order_id: fila.id, estacion: impresora.nombre, detalle })
      if (r === null) continue                                  // otra estación la tomó, ya salió, o no se pudo reservar
      intento = r
    }
    try {
      for (let c = 0; c < impresora.copias; c++) await imprimirEnNavegador(buildTicket('comanda', { pedido, estacion: impresora.nombre, modo, items: suyos }, impresora.ancho))
      res.impresas++
      if (claveImp) {
        // Si esta marca falla, el trabajo queda «pendiente» y se retomaría pasado un rato: se intenta dos veces.
        for (let k = 0; k < 2; k++) {
          const { error } = await supabase.from('print_jobs').update({ estado: 'impreso', intentos: intento, error: null, updated_at: new Date().toISOString() }).eq('clave', claveImp)
          if (!error) break
        }
      } else void registrarImpresion('comanda', fila.id, 'impreso', undefined, { estacion: impresora.nombre })
    } catch (e) {
      const m = e instanceof Error ? e.message : 'error'
      res.fallos.push(impresora.nombre)
      if (claveImp) await supabase.from('print_jobs').update({ estado: 'error', intentos: intento, error: m.slice(0, 300), updated_at: new Date().toISOString() }).eq('clave', claveImp)
      else void registrarImpresion('comanda', fila.id, 'error', m, { estacion: impresora.nombre })
    }
  }
  return res
}

async function filaDe(orderId: string): Promise<FilaOrden> {
  const { data, error } = await supabase.from('orders').select(COLS).eq('id', orderId).maybeSingle()
  if (error || !data) throw new Error('No se encontró el pedido')
  return data as unknown as FilaOrden
}

/** Botón "Comanda" del tablero: vuelve a imprimir todo el pedido, marcado como REIMPRESIÓN. */
export async function reimprimirComanda(orderId: string, solo?: string[]): Promise<Resultado> {
  const [cfg, fila] = await Promise.all([cargarConfig(), filaDe(orderId)])
  return imprimirReparto(cfg, fila, parseItems(fila.items), 'reimpresion', null, undefined, solo)
}

/**
 * Estación de impresión: vigila los pedidos y saca solas las comandas (nueva, ADICIÓN, ANULADO).
 * `avisar` recibe los fallos con un `reintentar`. Devuelve la función que la apaga.
 */
export function iniciarEstacion(avisar: (mensaje: string, reintentar: () => void) => void): () => void {
  const inicio = Date.now()
  let ocupado = false, parado = false
  const revisar = async () => {
    if (ocupado || parado) return
    ocupado = true
    try {
      const cfg = await cargarConfig()
      if (!cfg.comandaAutomatica || !cfg.impresoras.some(i => i.activa)) return
      const desde = new Date(Date.now() - 12 * 3600_000).toISOString()
      const [{ data: jobs, error: jobsErr }, { data: activos, error: actErr }] = await Promise.all([
        supabase.from('print_jobs').select('order_id, clave, estado, detalle, created_at').eq('tipo', 'comanda').gte('created_at', desde).order('created_at', { ascending: true }),
        supabase.from('orders').select(COLS).in('status', ['pending', 'cooking']).gte('created_at', desde),
      ])
      if (jobsErr || actErr) return                              // sin datos completos no se planea nada (se evitan reimpresiones por error)

      // Solo cuentan los trabajos YA IMPRESOS: uno en error o pendiente viejo se vuelve a intentar.
      type Job = { order_id: string; clave: string | null; estado: string; detalle: { desde?: number; hasta?: number; firmas?: string[] } | null }
      const lista = (jobs ?? []) as Job[]
      const anulados = new Set<string>(), cambiosHechos = new Map<string, number>()
      const firmas = new Map<string, string[]>()
      // Un tramo [desde, hasta) del pedido está completo solo si TODAS sus impresoras salieron bien.
      const tramos = new Map<string, { orden: string; desde: number; hasta: number; ok: boolean }>()
      const sinTramo = new Map<string, number>()                 // trabajos viejos sin detalle de tramo: se usa su «hasta»
      for (const j of lista) {
        const ok = j.estado === 'impreso'
        if (j.clave?.startsWith('a:')) { if (ok) anulados.add(j.order_id); continue }
        if (j.clave?.startsWith('x:')) { if (ok) cambiosHechos.set(j.order_id, (cambiosHechos.get(j.order_id) ?? 0) + 1) }
        const d = j.detalle
        if (ok && d?.firmas) d.firmas.forEach((f, k) => { const arr = firmas.get(j.order_id) ?? []; arr[(d.desde ?? 0) + k] = f; firmas.set(j.order_id, arr) })
        if (j.clave?.startsWith('x:')) continue
        if (typeof d?.desde === 'number' && typeof d?.hasta === 'number') {
          const k = `${j.order_id}|${d.desde}|${d.hasta}`
          const prev = tramos.get(k)
          tramos.set(k, { orden: j.order_id, desde: d.desde, hasta: d.hasta, ok: (prev ? prev.ok : true) && ok })
        } else if (ok) sinTramo.set(j.order_id, Math.max(sinTramo.get(j.order_id) ?? 0, Number(d?.hasta) || 0))
      }
      const hechos = new Map<string, number>(sinTramo)
      for (const t of tramos.values()) {
        if (!t.ok) continue
        if (t.desde <= (hechos.get(t.orden) ?? 0)) hechos.set(t.orden, Math.max(hechos.get(t.orden) ?? 0, t.hasta))
      }
      // Recorre de nuevo por si los tramos llegaron desordenados.
      for (let pasada = 0; pasada < 3; pasada++) for (const t of tramos.values()) if (t.ok && t.desde <= (hechos.get(t.orden) ?? 0)) hechos.set(t.orden, Math.max(hechos.get(t.orden) ?? 0, t.hasta))

      const filas = (activos ?? []) as unknown as FilaOrden[]
      const trabajos = planearComandas(filas, hechos, inicio, firmas)
      const resultados: [FilaOrden, Resultado][] = []
      for (const t of trabajos) {
        const fila = filas.find(f => f.id === t.orderId)!
        const todos = parseItems(fila.items)
        if (t.modo === 'cambio') {
          // Comanda de CAMBIO: solo los platos editados o cancelados. La clave lleva un consecutivo por pedido.
          const huellas = todos.map(firmaItem)
          const seq = cambiosHechos.get(t.orderId) ?? 0
          resultados.push([fila, await imprimirReparto(cfg, fila, (t.indices ?? []).map(i => todos[i]), 'cambio', `x:${t.orderId}:${seq}`, { desde: 0, hasta: todos.length, firmas: huellas })])
        } else {
          const tramo = todos.slice(t.desde, t.hasta)
          resultados.push([fila, await imprimirReparto(cfg, fila, tramo, t.modo, `c:${t.orderId}:${t.desde}-${t.hasta}`, { desde: t.desde, hasta: t.hasta, firmas: tramo.map(firmaItem) })])
        }
      }
      // Pedidos que ya salieron a cocina y luego se cancelaron: la cocina recibe un ANULADO.
      const ids = [...hechos.keys()].filter(id => !anulados.has(id))
      if (ids.length) {
        const { data: cancelados } = await supabase.from('orders').select(COLS).in('id', ids).eq('status', 'cancelled')
        for (const fila of (cancelados ?? []) as unknown as FilaOrden[]) resultados.push([fila, await imprimirReparto(cfg, fila, parseItems(fila.items), 'anulado', `a:${fila.id}`)])
      }
      for (const [fila, r] of resultados) if (r.fallos.length) avisar(`No se pudo imprimir la comanda de ${fila.table_num ? `Mesa ${fila.table_num}` : `pedido #${fila.order_number_today ?? ''}`} en ${r.fallos.join(', ')}.`, () => { void reimprimirComanda(fila.id, r.fallos) })
    } catch { /* sin red o sin permiso: se reintenta en el siguiente ciclo */ } finally { ocupado = false }
  }

  let canal: ReturnType<typeof supabase.channel> | null = null
  void supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
    if (parado || !rid) return
    canal = supabase.channel('estacion-impresion').on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` }, () => { void revisar() }).subscribe()
  })
  const ciclo = setInterval(() => { void revisar() }, 15_000)   // respaldo si el tiempo real se cae
  void revisar()
  return () => { parado = true; clearInterval(ciclo); if (canal) supabase.removeChannel(canal) }
}
