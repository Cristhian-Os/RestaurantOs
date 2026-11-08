/**
 * KitchenBoard.tsx — Tablero de cocina (kanban) en tiempo real, pensado para TV.
 * - Toda la tarjeta es un botón: clic = avanzar de estado (pendiente → en cocina → lista).
 * - Color de cada producto = color de su categoría (configurado en Menú).
 * - Notas de producto y de orden siempre completas, nunca recortadas.
 * - Cronómetro ámbar a los 5 min y rojo a los 10 (WARN_SECS / LATE_SECS).
 * - Si las órdenes no caben, la columna se compacta sola; lo que aún no quepa se cuenta en "+N más".
 * - Pie "TOTAL ACTIVO" con la suma de productos por preparar.
 */
import { destinoPedido } from '../../lib/destino'
import { cn } from '../../lib/cn'
import { useState, useEffect, useLayoutEffect, useCallback, useRef, memo } from 'react'
import { supabase } from '../../services/supabaseClient'
import { pushNotificationService } from '../../services/pushNotificationService'
import message from 'antd/es/message'
import { reimprimirComanda } from '../../lib/print/comandas'

// ─── Configuración ────────────────────────────────────────────
const WARN_SECS = 300   // el cronómetro pasa a ámbar
const LATE_SECS = 600   // el cronómetro pasa a rojo
const POLL_MS   = 4000  // respaldo por si el tiempo real se cae
const TV_MIN_WIDTH = 900

const DEFAULT_CAT_COLOR: Record<string, string> = {
  entrada: '#22D3EE', principal: '#A78BFA', postre: '#60A5FA', bebida: '#CBD5E1', especial: '#BEF264',
}
const NEUTRAL_COLOR = '#CBD5E1'
const TIPO_LABEL: Record<string, string> = { LOCAL: 'Mesa', LLEVAR: 'Para llevar', DOMICILIO: 'Domicilio', RAPPI: 'Rappi' }

interface OrderItem {
  id: string; name: string; price: number; quantity: number
  notes?: string; size?: string; toppings?: string[]; cancelled?: boolean
}
interface Order {
  id:         string
  table_num:  number | null
  customer_name: string | null
  tipo_pedido:string
  items:      OrderItem[]
  notes:      string | null
  status:     'pending' | 'cooking' | 'ready' | 'completed'
  paid_at?:   string | null
  created_at: string
  user_id:    string | null
  order_number_today?: number | null
}
type Status = Order['status']
type ColKey = 'pending' | 'cooking' | 'ready'

// Número secuencial del día; los pedidos anteriores a ese cambio usan el id corto.
const orderRef = (o: { id: string; order_number_today?: number | null }) =>
  `#${o.order_number_today ?? o.id.slice(0, 8)}`

const isHex = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)

// Texto legible (oscuro o blanco) sobre el color de la categoría.
function textOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0F1024' : '#FFFFFF'
}

// Color por tipo de pedido (solo cocina): se ve de lejos qué va a mesa, para llevar, domicilio o Rappi.
const TIPO_COLOR: Record<string, string> = { LOCAL: '#3B82F6', LLEVAR: '#22C55E', DOMICILIO: '#A855F7', RAPPI: '#EC4899' }

// Quita las etiquetas que sobran en la comanda ("Tamaño:", "Elige el sabor del helado:", "Toppings:"): cocina solo lee lo elegido.
const ETIQUETA = /^\s*(?:tama[ñn]o|toppings?|extras?|elige[^:]*|sabor(?:es)?(?: de helado)?)\s*:\s*/i
const limpiarNotas = (s: string) => s.split(' · ').map(p => p.replace(ETIQUETA, '').trim()).filter(Boolean).join(' · ')

// Características del producto: item.notes ya trae el resumen; si no, tamaño + toppings.
function itemDetail(item: OrderItem): string {
  if (item.notes) return limpiarNotas(String(item.notes))
  const parts: string[] = []
  if (item.size) parts.push(item.size)
  if (item.toppings?.length) parts.push('+ ' + item.toppings.join(', + '))
  return parts.join(' · ')
}

const orderNote = (o: Order) =>
  o.notes ? o.notes.split(' · ').filter(n => n !== 'Barra').join(' · ') : ''

const secsSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))

type Level = 'ok' | 'warn' | 'late' | 'ready'
const levelOf = (secs: number, ready: boolean): Level =>
  ready ? 'ready' : secs >= LATE_SECS ? 'late' : secs >= WARN_SECS ? 'warn' : 'ok'

// ─── Estilos (paleta propia, fondos opacos: la TV refleja) ─────
const CSS = `
.kb{--bg:var(--w-bg);--surface:var(--w-surface);--card:var(--w-surface-raised);--card-line:var(--w-border-strong);--inset:var(--w-surface-sunken);--ink:var(--w-text);--ink-soft:var(--w-text-2);--ink-note:var(--w-text);
  --pend:var(--w-accent-text);--cook:var(--w-info-text);--ready:var(--w-success-text);--warn:var(--w-warning-text);--late:var(--w-danger);--late-bg:var(--w-danger-bg);--late-fg:var(--w-danger-text);--paid-bg:var(--w-success-bg);--paid-fg:var(--w-success-text);
  --alert-bg:var(--w-warning-bg);--alert-fg:var(--w-warning-text);--on-accent:var(--w-on-accent);
  background:var(--bg);color:var(--ink);font-family:var(--w-font);font-size:14px;
  display:flex;flex-direction:column;min-height:100vh;box-sizing:border-box}
[data-theme="dark"] .kb{--on-accent:var(--w-bg)}
.kb *{box-sizing:border-box}
.kb.kb-tv{height:100vh;max-height:100vh;overflow:hidden;font-size:max(.8333vw,13px)}
.kb-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5em;min-height:4em;padding:.5em 2em;flex-shrink:0}
.kb-head h1{font-size:2.25em;font-weight:800;margin:0;line-height:1.1}
.kb-hl{display:flex;align-items:center;gap:.6em;min-width:0}
.kb-logo{flex-shrink:0;width:2.6em;height:2.6em;border-radius:.8em;background:var(--w-accent-soft);color:var(--w-accent-text);display:flex;align-items:center;justify-content:center}
.kb-logo svg{width:1.5em;height:1.5em}
.kb-hsub{margin:.1em 0 0;font-size:.875rem;font-weight:500;color:var(--ink-soft)}
.kb-pill{display:inline-flex;align-items:center;font-size:.6em;font-weight:700;padding:.3em .9em;border-radius:999px;background:var(--surface);border:.08em solid var(--card-line);color:var(--ink);box-shadow:var(--w-shadow-sm)}
.kb-head-r{display:flex;align-items:center;flex-wrap:wrap;gap:1.25em;font-size:1.75em;font-weight:700}
.kb-live{background:var(--w-success-bg);border-color:var(--ready);color:var(--ready)}
.kb-dot{width:.55em;height:.55em;border-radius:50%;background:var(--ready);margin-right:.4em;display:inline-block}
.kb-flash{background:var(--cook);color:var(--on-accent);font-weight:800;border-radius:999px;padding:.05em .7em}
.kb-btn{font:inherit;font-size:.6em;font-weight:700;color:var(--ink);background:var(--surface);border:.08em solid var(--w-border-strong);border-radius:var(--w-r-md);padding:.3em 1.1em;min-height:44px;cursor:pointer;box-shadow:var(--w-shadow-sm)}
.kb-grid{display:flex;flex:1;min-height:0;padding:.25em 1.5em .875em;gap:1.25em}
.kb-col{min-width:0;min-height:0;padding:0;border-radius:1.25em;border:.08em solid var(--card-line);background:var(--surface);box-shadow:var(--w-shadow-sm);display:flex;flex-direction:column;overflow:hidden}
.kb-col[data-col=pending] .kb-col-h{background:var(--w-text-3)}
.kb-col[data-col=pending]{flex:38 1 0}
.kb-col[data-col=cooking] .kb-col-h{background:var(--w-accent)}
.kb-col[data-col=cooking]{flex:38 1 0}
.kb-col[data-col=ready] .kb-col-h{background:var(--w-info)}
.kb-col[data-col=ready]{flex:24 1 0}
.kb-col-h{display:flex;align-items:center;justify-content:space-between;min-height:3.25em;padding:.4em .9em;margin-bottom:.625em;flex-shrink:0;white-space:nowrap;color:var(--on-accent)}
.kb-col-t{display:flex;align-items:baseline;min-width:0}
.kb-col-l{font-size:1.875em;font-weight:800;letter-spacing:.01em;color:var(--on-accent)}
.kb-col-hint{font-size:1.1875em;font-weight:600;color:var(--on-accent);opacity:.9;margin-left:.75em}
.kb-col-r{display:flex;align-items:center}
.kb-more{font-size:1.5em;font-weight:800;margin-right:.4em}
.kb-badge{width:2em;height:2em;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5em;font-weight:800;background:var(--on-accent)}
.kb-col[data-col=pending] .kb-badge{color:var(--w-text-3)}
.kb-col[data-col=cooking] .kb-badge{color:var(--w-accent)}
.kb-col[data-col=ready] .kb-badge{color:var(--w-info)}
.kb-col-h{--on-accent:#FFFFFF}
.kb-col-h .kb-badge{background:#FFFFFF}
.kb-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1em;padding:0 1.5em .75em;flex-shrink:0}
.kb-tv-off .kb-kpis{padding:0 0 .75em}
.kb-kpi{display:flex;align-items:center;gap:.9em;padding:.8em 1em;border-radius:1.1em;border:.08em solid var(--card-line);background:var(--surface);box-shadow:var(--w-shadow-sm)}
.kb-kpi-i{width:2.6em;height:2.6em;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff}
.kb-kpi-i svg{width:1.4em;height:1.4em}
.kb-kpi-l{font-size:1.05em;font-weight:600;color:var(--ink-soft);line-height:1.1}
.kb-kpi-n{font-size:2em;font-weight:800;line-height:1.05;color:var(--ink)}
.kb-cards{flex:1;min-height:0;position:relative;overflow:hidden;display:flex;flex-wrap:wrap;align-content:flex-start;padding:0 .75em .5em}
.kb-tv-off .kb-cards{overflow:visible}
/* Dentro de la app (con barra lateral) no hay caja de fondo: se funde con el fondo de la app. */
.kb.kb-tv-off{background:transparent;min-height:0;padding:0}
.kb-tv-off .kb-head{padding:.25em 0 .75em;min-height:0}
.kb-tv-off .kb-head h1{font-size:1.875em;font-family:var(--w-font)}
.kb-tv-off .kb-head-r{font-size:1.1em}
.kb-tv-off .kb-grid{padding:0}
.kb-tv-off .kb-none{background:transparent;border:0}
.kb-tv-off .kb-tot{margin-top:1em;border:.12em solid var(--card-line);border-radius:1.25em}
.kb-empty{width:100%;text-align:center;padding:2em 0;font-size:1.875em;font-weight:500;color:var(--ink-soft)}
.kb-tv-off .kb-card{width:100%}
.kb-card{box-shadow:var(--w-shadow-sm);width:calc(50% - .3125em);margin-bottom:.625em;padding:.625em;border-radius:1em;border:.19em solid var(--card-line);background:var(--card);text-align:left;font:inherit;color:inherit;display:block;outline:none}
.kb-card:nth-child(odd){margin-right:.625em}
.kb-card.clickable{cursor:pointer}
.kb-card.clickable:hover{filter:brightness(1.2)}
.kb-card.clickable:active{transform:scale(.97)}
.kb-card.clickable:focus-visible{border-color:var(--w-focus);box-shadow:0 0 0 .12em var(--w-focus)}
.kb-clock{display:block;font-size:1.25em;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--w-text-2)}
.kb-card.late{border-color:var(--late)}
.kb-card[data-tipo]{border-left:.5em solid var(--tipo)}
.kb-card[data-tipo] .kb-sub{color:var(--tipo);background:color-mix(in srgb,var(--tipo) 18%,transparent);padding:.1em .6em;border-radius:999px}
.kb-col[data-col=ready] .kb-card{width:100%;margin-right:0;padding:.5em .625em}
.kb-col[data-col=ready] .kb-card:nth-child(odd){margin-right:0}
.kb-r1{display:flex;align-items:center;justify-content:space-between}
.kb-title{flex:1;min-width:0;font-size:1.75em;font-weight:800;line-height:1.1;overflow-wrap:break-word;hyphens:auto;padding-right:.3em}
.kb-timer{flex-shrink:0;font-size:2.125em;font-weight:800;line-height:1;padding:.1em .25em;border-radius:.3em;font-variant-numeric:tabular-nums}
.kb-timer.ok{color:var(--pend)}.kb-timer.warn{color:var(--warn)}.kb-timer.ready{color:var(--ready)}
.kb-timer.late{color:var(--late-fg);background:var(--late-bg);border:.06em solid var(--late)}
.kb-r2{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:.3em}
.kb-sub{white-space:nowrap;font-size:1.125em;font-weight:800;letter-spacing:.03em;color:var(--pend);text-transform:uppercase}
.kb-tag{display:inline-block;font-size:.875em;font-weight:800;letter-spacing:.04em;padding:.06em .65em;border-radius:999px;white-space:nowrap}
.kb-tag.paid{background:var(--paid-bg);color:var(--paid-fg)}
.kb-tag.unpaid{background:var(--inset);color:var(--warn);border:.06em solid var(--warn)}
.kb-cancel{margin-left:.5em;font:inherit;font-size:.875em;font-weight:800;letter-spacing:.04em;color:var(--late-fg);background:var(--late-bg);border:.06em solid var(--late);border-radius:999px;padding:.06em .65em;cursor:pointer}
.kb-cancel:disabled{opacity:.6;cursor:not-allowed}
.kb-alert{margin-top:.3em;font-size:1.25em;font-weight:700;line-height:1.2;color:var(--alert-fg);background:var(--alert-bg);border-radius:.5em;padding:.2em .5em;overflow-wrap:anywhere}
.kb-items{margin-top:.3em;padding:.3em .5em;border-radius:.625em;background:var(--inset)}
.kb-item{padding:.12em .5em .12em .12em;border-radius:.625em}
.kb-item+.kb-item{margin-top:.19em}
.kb-item-m{display:flex;align-items:center}
.kb-qty{width:1.875em;height:1.875em;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.25em;font-weight:800;margin-right:.5em}
.kb-iname{flex:1;min-width:0;font-size:1.625em;font-weight:700;line-height:1.15;overflow-wrap:anywhere}
.kb-ix{margin-left:.5em;font:inherit;font-size:1em;line-height:1;color:var(--late-fg);background:var(--late-bg);border:.06em solid var(--late);border-radius:.4em;padding:.25em .5em;cursor:pointer}
.kb-ix:disabled{opacity:.6}
.kb-inote{margin-left:2.5em;font-size:1.25em;font-weight:500;line-height:1.2;color:var(--ink-note);overflow-wrap:anywhere}
.kb-chips{margin-top:.25em;display:flex;flex-wrap:wrap}
.kb-chip{display:flex;align-items:center;margin:0 .375em .375em 0;padding:.12em .75em .12em .12em;border-radius:.625em}
.kb-chip .kb-qty{width:1.5em;height:1.5em;font-size:1.1875em;margin-right:.45em}
.kb-chip-t{font-size:1.375em;font-weight:600;line-height:1.15}
.kb-hint{margin-top:.12em;font-size:1em;font-weight:600;color:var(--ink-soft)}
.kb-col.dense .kb-card{padding:.4375em .5em;margin-bottom:.4375em;border-width:.125em}
.kb-col.dense .kb-title{font-size:1.5em}
.kb-col.dense .kb-timer{font-size:1.75em;padding:0 .25em}
.kb-col.dense .kb-r2{margin-top:.12em}
.kb-col.dense .kb-sub{font-size:1em}
.kb-col.dense .kb-tag,.kb-col.dense .kb-cancel{font-size:.8125em;padding:0 .5em}
.kb-col.dense .kb-alert{font-size:1.125em;margin-top:.19em;padding:.12em .44em}
.kb-col.dense .kb-items{margin-top:.19em;padding:.19em .375em}
.kb-col.dense .kb-item{padding:0 .375em 0 .12em}
.kb-col.dense .kb-item+.kb-item{margin-top:.125em}
.kb-col.dense .kb-qty{width:1.625em;height:1.625em;font-size:1.125em;margin-right:.5em}
.kb-col.dense .kb-iname{font-size:1.4375em}
.kb-col.dense .kb-inote{margin-left:2.125em;font-size:1.125em;line-height:1.15}
.kb-col.dense .kb-chip{margin-bottom:.25em}
.kb-col.dense .kb-chip-t{font-size:1.1875em}
.kb-col.dense .kb-hint{display:none}
.kb-tot{flex-shrink:0;height:4.75em;overflow:hidden;background:var(--surface);border-top:.12em solid var(--card-line);display:flex;align-items:center}
.kb-tot-l{flex-shrink:0;position:relative;z-index:1;font-size:1.625em;font-weight:800;letter-spacing:.06em;color:var(--ink-soft);white-space:nowrap;padding:0 1.2em 0 1.23em;background:var(--surface);height:100%;display:flex;align-items:center;box-shadow:.6em 0 .6em -.2em var(--surface)}
.kb-tot-view{flex:1;min-width:0;overflow:hidden;white-space:nowrap}
.kb-tot-track{display:inline-flex;align-items:center;will-change:transform}
.kb-tot-track.run{animation:kb-marq var(--kb-dur,30s) linear infinite}
.kb-tot-set{display:inline-flex;align-items:center;flex-shrink:0;padding-left:2.25em}
.kb-tc{display:flex;align-items:center;margin-right:2.25em;white-space:nowrap}
.kb-tq{min-width:1.6em;height:1.6em;padding:0 .2em;border-radius:1em;display:flex;align-items:center;justify-content:center;font-size:1.875em;font-weight:800;margin-right:.45em}
.kb-tn{font-size:2.125em;font-weight:700}
@keyframes kb-marq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.kb-tot-track.run{animation-duration:120s}}
.kb-none{flex:1;margin:.625em 1.5em;background:var(--surface);border:.12em solid var(--card-line);border-radius:1.5em;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:3em 1em}
.kb-none p{font-size:2.5em;font-weight:700;margin:0}
.kb-none small{font-size:1.5em;color:var(--ink-soft);margin-top:.5em}
@media (max-width:${TV_MIN_WIDTH - 1}px){
  .kb.kb-tv{height:auto;max-height:none;min-height:100vh;overflow:visible;font-size:15px}
  .kb-kpis{padding:0 .75em .5em;gap:.5em}
  .kb-kpi{flex-direction:column;text-align:center;gap:.3em;padding:.6em .4em}
  .kb-kpi-l{font-size:.8em}
  .kb-grid{flex-direction:column;overflow:visible;padding:.5em .75em 1em;gap:.75em}
  .kb-head{padding:.5em .75em}
  .kb-head h1{font-size:1.5em}.kb-head-r{font-size:1em;gap:.75em}
  .kb-btn{font-size:.9em;min-height:44px;padding:.25em 1em}
  .kb-col,.kb-col[data-col]{flex:none;padding:0;border-radius:16px}
  .kb-col-h{height:auto;min-height:64px;margin:0;padding:12px 16px;cursor:pointer}
  .kb-col.open .kb-col-h{margin-bottom:12px}
  .kb-hsub{font-size:.8125rem}
  .kb-col-l{font-size:1.5em}
  .kb-col-hint,.kb-more{display:none}
  .kb-badge{font-size:1.4em}
  .kb-col-r:after{content:"\\25BE";font-size:1.6em;margin-left:.5em;color:inherit}
  .kb-col.open .kb-col-r:after{content:"\\25B4"}
  .kb-cards{display:none;overflow:visible;padding:0 12px 12px}
  .kb-col.open .kb-cards{display:block}
  .kb-card,.kb-card:nth-child(odd),.kb-col[data-col=ready] .kb-card{width:100%;margin-right:0}
  .kb-cancel,.kb-ix{min-height:44px}
  .kb-tot{height:42px}
  .kb-tot-l{font-size:11px;padding:0 .8em}
  .kb-tq{font-size:14px;min-width:24px;height:24px}
  .kb-tn{font-size:15px}
}
`

// ─── Cronómetro ───────────────────────────────────────────────
function useNowSecs(): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return Date.now()
}

const fmt = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

// Reloj de pared para que cocina sepa la hora (hora de Colombia, se actualiza cada segundo).
function KitchenClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const hora = now.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' }).replace(/\s/g, ' ')
  return <time className="kb-clock" dateTime={now.toISOString()} aria-label={`Hora actual ${hora}`}>{hora}</time>
}

// ─── Tarjeta de orden ─────────────────────────────────────────
interface CardProps {
  order: Order
  compact: boolean
  colorOf: (item: OrderItem) => string
  onAdvance: (id: string, next: Status) => void
  onRefresh: () => void
}

const OrderCard = memo(({ order, compact, colorOf, onAdvance, onRefresh }: CardProps) => {
  useNowSecs()
  const isReady = order.status === 'ready'
  const secs = secsSince(order.created_at)
  const level = levelOf(secs, isReady)
  const [busyItem, setBusyItem] = useState<number | null>(null)
  const [cancellingOrder, setCancellingOrder] = useState(false)

  const next: Status | null = order.status === 'pending' ? 'cooking' : order.status === 'cooking' ? 'ready' : null
  const note = orderNote(order)
  const title = destinoPedido(order) + (order.customer_name ? ` · ${order.customer_name}` : '')
  const sub = `${TIPO_LABEL[order.tipo_pedido] ?? order.tipo_pedido ?? ''} ${orderRef(order)}`

  const cancelItem = async (index: number) => {
    setBusyItem(index)
    try {
      const { error } = await supabase.rpc('cancelar_item_orden', { p_order_id: order.id, p_item_index: index })
      if (error) { message.error(error.message); return }
      message.success('Item cancelado')
      onRefresh()
    } finally { setBusyItem(null) }
  }

  const cancelOrder = async () => {
    if (!window.confirm('¿Cancelar todo el pedido?')) return
    setCancellingOrder(true)
    try {
      const { error } = await supabase.rpc('cancelar_orden', { p_order_id: order.id })
      if (error) { message.error(error.message); return }
      message.success('Pedido cancelado')
      onRefresh()
    } finally { setCancellingOrder(false) }
  }

  const imprimirComanda = async () => {
    try {
      const r = await reimprimirComanda(order.id)
      if (r.fallos.length) message.error(`No se pudo imprimir en ${r.fallos.join(', ')}. Toca 🖨 COMANDA para reintentar.`)
    } catch (e) { message.error(`No se pudo imprimir: ${e instanceof Error ? e.message : 'error'}`) }
  }

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const click = () => { if (next) onAdvance(order.id, next) }

  return (
    <div
      role={next ? 'button' : undefined}
      tabIndex={next ? 0 : undefined}
      aria-label={next ? `${title}: ${order.status === 'pending' ? 'iniciar preparación' : 'marcar listo'}` : undefined}
      onClick={click}
      onKeyDown={e => { if (next && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); click() } }}
      data-tipo={TIPO_COLOR[order.tipo_pedido] ? order.tipo_pedido : undefined}
      style={TIPO_COLOR[order.tipo_pedido] ? ({ '--tipo': TIPO_COLOR[order.tipo_pedido] } as React.CSSProperties) : undefined}
      className={cn('kb-card', next && 'clickable', level === 'late' && 'late')}>
      <div className="kb-r1">
        <div className="kb-title">{title}</div>
        <div className={cn('kb-timer', level)}>{fmt(secs)}</div>
      </div>
      <div className="kb-r2">
        <span className="kb-sub">{sub}</span>
        <span>
          <span className={cn('kb-tag', order.paid_at ? 'paid' : 'unpaid')}>{order.paid_at ? 'PAGADO' : 'POR COBRAR'}</span>
          <button type="button" className="kb-cancel" style={{ background: 'var(--inset)', color: 'var(--ink-soft)', border: '.06em solid var(--card-line)' }}
            onClick={e => { stop(e); void imprimirComanda() }}>🖨 COMANDA</button>
          {order.status === 'cooking' && (
            <button type="button" className="kb-cancel" disabled={cancellingOrder}
              onClick={e => { stop(e); void cancelOrder() }}>
              {cancellingOrder ? 'CANCELANDO…' : 'CANCELAR'}
            </button>
          )}
        </span>
      </div>
      {note && <div className="kb-alert">{note}</div>}
      <div className={compact ? 'kb-chips' : 'kb-items'}>
        {order.items.map((item, i) => {
          if (item.cancelled) return null
          const color = colorOf(item)
          const bg = `${color}26`
          const detail = itemDetail(item)
          const qty = <span className="kb-qty" style={{ background: color, color: textOn(color) }}>{item.quantity}</span>
          if (compact) {
            return (
              <span key={i} className="kb-chip" style={{ background: bg }}>
                {qty}<span className="kb-chip-t">{item.name}</span>
              </span>
            )
          }
          return (
            <div key={i} className="kb-item" style={{ background: bg }}>
              <div className="kb-item-m">
                {qty}
                <span className="kb-iname">{item.name}</span>
                {order.status === 'cooking' && (
                  <button type="button" className="kb-ix" disabled={busyItem === i} aria-label={`Cancelar ${item.name}`}
                    onClick={e => { stop(e); void cancelItem(i) }}>
                    {busyItem === i ? '…' : '✕'}
                  </button>
                )}
              </div>
              {detail && <div className="kb-inote">{detail}</div>}
            </div>
          )
        })}
      </div>
      {isReady && <div className="kb-hint">Esperando cobro en caja</div>}
    </div>
  )
})
OrderCard.displayName = 'OrderCard'

// ─── Columna: muestra solo las tarjetas que caben completas ────
interface ColumnProps {
  colKey: ColKey
  label: string
  hint?: string
  orders: Order[]
  fit: boolean
  colorOf: (item: OrderItem) => string
  onAdvance: (id: string, next: Status) => void
  onRefresh: () => void
}

const Column = memo(({ colKey, label, hint, orders, fit, colorOf, onAdvance, onRefresh }: ColumnProps) => {
  const colRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState(0)
  const [open, setOpen] = useState(false)

  // Mide después de cada render: oculta lo que se sale y compacta si hace falta.
  useLayoutEffect(() => {
    const col = colRef.current, box = cardsRef.current
    if (!col || !box) return
    const cards = Array.from(box.querySelectorAll<HTMLElement>('.kb-card'))
    const layout = () => {
      let h = 0, cut = false
      cards.forEach(c => { c.style.display = '' })
      const limit = box.clientHeight
      cards.forEach((c, i) => {
        if (cut) { c.style.display = 'none'; h++; return }
        if (i > 0 && c.offsetTop + c.offsetHeight > limit + 1) { cut = true; c.style.display = 'none'; h++ }
      })
      return h
    }
    if (!fit) {
      col.classList.remove('dense')
      cards.forEach(c => { c.style.display = '' })
      if (hidden !== 0) setHidden(0)
      return
    }
    col.classList.remove('dense')
    let h = layout()
    if (h > 0) { col.classList.add('dense'); h = layout() }
    if (h !== hidden) setHidden(h)
  })

  // El alto de la ventana o la hora cambian lo que cabe.
  const [, force] = useState(0)
  useEffect(() => {
    const on = () => force(n => n + 1)
    window.addEventListener('resize', on)
    const t = setInterval(on, 30000)
    return () => { window.removeEventListener('resize', on); clearInterval(t) }
  }, [])

  return (
    <div ref={colRef} className={cn('kb-col', open && 'open')} data-col={colKey}>
      {/* En celular la cabecera es una tarjeta: al tocarla se abren / cierran sus pedidos */}
      <div className="kb-col-h" onClick={() => setOpen(v => !v)}>
        <div className="kb-col-t">
          <span className="kb-col-l">{label}</span>
          {hint && <span className="kb-col-hint">{hint}</span>}
        </div>
        <div className="kb-col-r">
          {hidden > 0 && <span className="kb-more">+{hidden} más</span>}
          <span className="kb-badge">{orders.length}</span>
        </div>
      </div>
      <div ref={cardsRef} className="kb-cards">
        {orders.map(o => (
          <OrderCard key={o.id} order={o} compact={colKey === 'ready'} colorOf={colorOf} onAdvance={onAdvance} onRefresh={onRefresh} />
        ))}
        {orders.length === 0 && <div className="kb-empty">Sin órdenes</div>}
      </div>
    </div>
  )
})
Column.displayName = 'Column'

// ─── TOTAL ACTIVO: carrusel horizontal continuo (como el ticker de noticias) ───
const TICKER_PX_PER_SEC = 110

const TotalsTicker = memo(({ totals }: { totals: [string, { qty: number; color: string }][] }) => {
  const viewRef = useRef<HTMLDivElement>(null)
  const setRef = useRef<HTMLDivElement>(null)
  const [copies, setCopies] = useState(1)
  const [dur, setDur] = useState(30)
  const key = totals.map(([n, t]) => `${n}:${t.qty}:${t.color}`).join('|')

  // Siempre se mueve: si los productos no llenan el ancho, se repiten hasta llenarlo
  // para que el bucle no deje huecos. Cada mitad de la pista mide al menos el ancho visible.
  useLayoutEffect(() => {
    const measure = () => {
      const view = viewRef.current, one = setRef.current
      if (!view || !one) return
      const w = one.scrollWidth
      if (w <= 0) return
      const k = Math.max(1, Math.ceil(view.clientWidth / w))
      setCopies(k)
      setDur(Math.max(12, Math.round((w * k) / TICKER_PX_PER_SEC)))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [key])

  const half = (hidden: boolean) =>
    Array.from({ length: copies }, (_, c) => (
      <div key={`${hidden ? 'b' : 'a'}${c}`} className="kb-tot-set"
        ref={!hidden && c === 0 ? setRef : undefined} aria-hidden={hidden || c > 0 || undefined}>
        {totals.map(([name, t]) => (
          <div key={name} className="kb-tc">
            <span className="kb-tq" style={{ background: t.color, color: textOn(t.color) }}>{t.qty}</span>
            <span className="kb-tn">{name}</span>
          </div>
        ))}
      </div>
    ))

  return (
    <div className="kb-tot">
      <div className="kb-tot-l">TOTAL ACTIVO</div>
      <div className="kb-tot-view" ref={viewRef}>
        <div className="kb-tot-track run" style={{ ['--kb-dur' as string]: `${dur}s` }}>
          {half(false)}
          {half(true)}
        </div>
      </div>
    </div>
  )
})
TotalsTicker.displayName = 'TotalsTicker'

// ─── Board ────────────────────────────────────────────────────
interface BoardProps {
  /** Pantalla completa para TV (sin márgenes de la app). */
  tv?: boolean
  /** Si se pasa, el encabezado muestra botones de menú/cierre de sesión (modo TV sin chrome). */
  onMenu?: () => void
  onLogout?: () => void
}

export const KitchenBoard = memo(({ tv = false, onMenu, onLogout }: BoardProps) => {
  const [orders,   setOrders]  = useState<Order[]>([])
  const [loading,  setLoading] = useState(true)
  const [wide,     setWide]    = useState(() => typeof window === 'undefined' || window.innerWidth >= TV_MIN_WIDTH)
  const [dishCat,  setDishCat] = useState<Record<string, string>>({})
  const [catColor, setCatColor] = useState<Record<string, string>>({})
  const prevCount = useRef(0)

  useEffect(() => {
    const on = () => setWide(window.innerWidth >= TV_MIN_WIDTH)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  // Colores por categoría: plato → categoría (dishes) y categoría → color (configuración del menú).
  useEffect(() => {
    let cancelled = false
    supabase.from('dishes').select('id, category').then(({ data }) => {
      if (cancelled || !data) return
      const map: Record<string, string> = {}
      data.forEach((d: { id: string; category: string }) => { map[d.id] = d.category })
      setDishCat(map)
    })
    supabase.from('restaurant_config').select('modules_enabled').single().then(({ data }) => {
      if (cancelled) return
      const cats = (data?.modules_enabled as { categories?: { value: string; color?: string }[] } | null)?.categories
      const map: Record<string, string> = {}
      cats?.forEach(c => { if (c?.value && isHex(c.color)) map[c.value] = c.color })
      setCatColor(map)
    })
    return () => { cancelled = true }
  }, [])

  const colorOf = useCallback((item: OrderItem): string => {
    const cat = dishCat[item.id]
    const c = catColor[cat] ?? DEFAULT_CAT_COLOR[cat] ?? NEUTRAL_COLOR
    return isHex(c) ? c : NEUTRAL_COLOR
  }, [dishCat, catColor])

  const parseOrder = (o: any): Order => ({
    ...o,
    items: (() => { try { const p = typeof o.items === 'string' ? JSON.parse(o.items) : o.items; return Array.isArray(p) ? p : [] } catch { return [] } })()
  })

  const fetchOrders = useCallback(async () => {
    // Cocina ve el pedido apenas se crea, sin esperar el cobro en Caja;
    // cada tarjeta avisa si ya está pagado o pendiente de pago (paid_at).
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['pending','cooking','ready'])
      .eq('en_espera_pago', false)   // domicilio por transferencia: no pasa a cocina hasta que Caja confirme el pago
      .order('created_at', { ascending: true })
    if (!error) {
      const parsed = (data || []).map(parseOrder)
      setOrders(prev => {
        if (prevCount.current > 0 && parsed.filter(o => o.status === 'pending').length >
            prev.filter(o => o.status === 'pending').length) {
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
        }
        prevCount.current = parsed.length
        return parsed
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOrders()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    // Filtrar el realtime por restaurant_id: sin esto, la cocina de CUALQUIER
    // restaurante recibe (y reacciona a) los cambios de pedidos de TODOS los demás.
    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (cancelled || !rid) return
      channel = supabase
        .channel('kitchen-board-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` }, fetchOrders)
        .subscribe()
    })
    // Respaldo: si el WebSocket de la TV se cae, igual se actualiza.
    const poll = setInterval(fetchOrders, POLL_MS)
    return () => { cancelled = true; clearInterval(poll); if (channel) supabase.removeChannel(channel) }
  }, [fetchOrders])

  const handleAdvance = useCallback(async (orderId: string, nextStatus: Status) => {
    const order = orders.find(o => o.id === orderId)
    // Se refleja al instante; el servidor confirma enseguida (y revierte si falla).
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o))
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId)
    if (error) { message.error('Error al actualizar: ' + error.message); fetchOrders(); return }
    fetchOrders()
    if (nextStatus === 'ready') {
      const dest = order?.table_num ? `Mesa ${order.table_num}` : 'Pedido'
      message.success({ content: `${dest} — pedido listo. Notificando a los meseros...`, duration: 5 })
      // Todos los meseros (cualquiera puede ir a buscarlo) + admin + quien lo tomó.
      pushNotificationService.notify(
        ['admin', 'waiter'], 'Pedido listo',
        `${order ? orderRef(order) : 'Pedido'} listo para servir${order?.table_num ? ` en Mesa ${order.table_num}` : ''}`, '/',
        undefined, order?.user_id ? [order.user_id] : undefined,
      )
    }
  }, [fetchOrders, orders])

  const pending = orders.filter(o => o.status === 'pending')
  const cooking = orders.filter(o => o.status === 'cooking')
  const ready   = orders.filter(o => o.status === 'ready')

  // TOTAL ACTIVO: productos de las órdenes por preparar (pendientes + en cocina)
  const totals = (() => {
    const map = new Map<string, { qty: number; color: string }>()
    orders.filter(o => o.status === 'pending' || o.status === 'cooking').forEach(o =>
      o.items.forEach(it => {
        if (it.cancelled) return
        const cur = map.get(it.name)
        if (cur) cur.qty += it.quantity || 1
        else map.set(it.name, { qty: it.quantity || 1, color: colorOf(it) })
      }))
    return Array.from(map.entries()).sort((a, b) => b[1].qty - a[1].qty)
  })()

  const fit = tv && wide

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '5rem 0', minHeight: tv ? '100vh' : undefined }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid var(--w-accent)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  const colProps = { fit, colorOf, onAdvance: handleAdvance, onRefresh: fetchOrders }

  return (
    <div className={cn('kb', tv ? 'kb-tv' : 'kb-tv-off')}>
      <style>{CSS}</style>
      <div className="kb-head">
        <div className="kb-hl">
          <span className="kb-logo" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 14a4 4 0 1 1 1.5-7.7A4 4 0 0 1 16 6a4 4 0 0 1 1 7.9V19H7z"/><path d="M7 16h10"/></svg>
          </span>
          <div>
            <h1>Cocina</h1>
            <KitchenClock />
          </div>
        </div>
        <div className="kb-head-r">
          <span className="kb-pill">{orders.length} órdenes activas</span>
          <span className="kb-pill kb-live"><span className="kb-dot" />En vivo</span>
          <button type="button" className="kb-btn" onClick={fetchOrders}>Actualizar</button>
          {onMenu && <button type="button" className="kb-btn" onClick={onMenu}>Menú</button>}
          {onLogout && <button type="button" className="kb-btn" onClick={onLogout}>Salir</button>}
        </div>
      </div>

      <div className="kb-kpis">
        <div className="kb-kpi"><span className="kb-kpi-i" style={{ background: 'var(--w-accent)' }} aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9"/></svg></span><div><div className="kb-kpi-l">En cocina</div><div className="kb-kpi-n">{cooking.length}</div></div></div>
        <div className="kb-kpi"><span className="kb-kpi-i" style={{ background: 'var(--w-info)' }} aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10"/></svg></span><div><div className="kb-kpi-l">Listos para servir</div><div className="kb-kpi-n">{ready.length}</div></div></div>
        <div className="kb-kpi"><span className="kb-kpi-i" style={{ background: 'var(--w-text-3)' }} aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span><div><div className="kb-kpi-l">En espera</div><div className="kb-kpi-n">{pending.length}</div></div></div>
      </div>

      {orders.length === 0 ? (
        <div className="kb-none">
          <p>Sin órdenes activas</p>
          <small>Las nuevas órdenes aparecerán aquí al instante</small>
        </div>
      ) : (
        <div className="kb-grid">
          <Column colKey="pending" label="En espera" hint="clic: iniciar"     orders={pending} {...colProps} />
          <Column colKey="cooking" label="En cocina"  hint="clic: marcar listo" orders={cooking} {...colProps} />
          <Column colKey="ready"   label="Listas"                               orders={ready}   {...colProps} />
        </div>
      )}

      {totals.length > 0 && <TotalsTicker totals={totals} />}
    </div>
  )
})
KitchenBoard.displayName = 'KitchenBoard'
