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
import { parseItems, pedidoDesdeFila, planearComandas, type FilaPedido } from './mapeo.ts'
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

/** Reparte los platos por impresora e imprime una comanda por cada una. `clave` (solo automático) reserva el trabajo para que no se repita. */
async function imprimirReparto(cfg: ConfigImpresion, fila: FilaOrden, items: ItemPedido[], modo: ModoComanda, clave: string | null, detalle?: unknown): Promise<Resultado> {
  const pedido = pedidoDesdeFila(fila, await nombreMesero(fila.user_id))
  const cats = await categoriaDePlatos()
  const reparto = repartirPorImpresora(items, cfg.impresoras.some(i => i.activa) ? cfg.impresoras : [SIN_IMPRESORAS], it => cats[it.id ?? ''])
  const res: Resultado = { impresas: 0, fallos: [] }
  for (const { impresora, items: suyos } of reparto) {
    const claveImp = clave ? `${clave}:${impresora.id}` : null
    if (claveImp) {
      const { error } = await supabase.from('print_jobs').insert({ tipo: 'comanda', order_id: fila.id, clave: claveImp, estacion: impresora.nombre, estado: 'pendiente', detalle })
      if (error?.code === '23505') continue                    // otra estación ya la tomó
    }
    try {
      for (let c = 0; c < impresora.copias; c++) await imprimirEnNavegador(buildTicket('comanda', { pedido, estacion: impresora.nombre, modo, items: suyos }, impresora.ancho))
      res.impresas++
      if (claveImp) await supabase.from('print_jobs').update({ estado: 'impreso', intentos: 1 }).eq('clave', claveImp)
      else void registrarImpresion('comanda', fila.id, 'impreso', undefined, { estacion: impresora.nombre })
    } catch (e) {
      const m = e instanceof Error ? e.message : 'error'
      res.fallos.push(impresora.nombre)
      if (claveImp) await supabase.from('print_jobs').update({ estado: 'error', intentos: 1, error: m.slice(0, 300) }).eq('clave', claveImp)
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
export async function reimprimirComanda(orderId: string): Promise<Resultado> {
  const [cfg, fila] = await Promise.all([cargarConfig(), filaDe(orderId)])
  return imprimirReparto(cfg, fila, parseItems(fila.items), 'reimpresion', null)
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
      const [{ data: jobs }, { data: activos }] = await Promise.all([
        supabase.from('print_jobs').select('order_id, clave, detalle').eq('tipo', 'comanda').gte('created_at', desde),
        supabase.from('orders').select(COLS).in('status', ['pending', 'cooking']).gte('created_at', desde),
      ])
      const hechos = new Map<string, number>(), anulados = new Set<string>()
      for (const j of (jobs ?? []) as { order_id: string; clave: string | null; detalle: { hasta?: number } | null }[]) {
        if (j.clave?.startsWith('a:')) anulados.add(j.order_id)
        else hechos.set(j.order_id, Math.max(hechos.get(j.order_id) ?? 0, Number(j.detalle?.hasta) || 0))
      }
      const filas = (activos ?? []) as unknown as FilaOrden[]
      const trabajos = planearComandas(filas, hechos, inicio)
      const resultados: [FilaOrden, Resultado][] = []
      for (const t of trabajos) {
        const fila = filas.find(f => f.id === t.orderId)!
        resultados.push([fila, await imprimirReparto(cfg, fila, parseItems(fila.items).slice(t.desde, t.hasta), t.modo, `c:${t.orderId}:${t.desde}-${t.hasta}`, { desde: t.desde, hasta: t.hasta })])
      }
      // Pedidos que ya salieron a cocina y luego se cancelaron: la cocina recibe un ANULADO.
      const ids = [...hechos.keys()].filter(id => !anulados.has(id))
      if (ids.length) {
        const { data: cancelados } = await supabase.from('orders').select(COLS).in('id', ids).eq('status', 'cancelled')
        for (const fila of (cancelados ?? []) as unknown as FilaOrden[]) resultados.push([fila, await imprimirReparto(cfg, fila, parseItems(fila.items), 'anulado', `a:${fila.id}`)])
      }
      for (const [fila, r] of resultados) if (r.fallos.length) avisar(`No se pudo imprimir la comanda de ${fila.table_num ? `Mesa ${fila.table_num}` : `pedido #${fila.order_number_today ?? ''}`} en ${r.fallos.join(', ')}.`, () => { void reimprimirComanda(fila.id) })
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
