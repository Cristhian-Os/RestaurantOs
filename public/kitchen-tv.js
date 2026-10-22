// ─── CONFIG ──────────────────────────────────────────────────────────────────
var SUPABASE_URL = 'https://ifypeslrcdebvdqglywt.supabase.co'
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmeXBlc2xyY2RlYnZkcWdseXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyOTY3NjYsImV4cCI6MjA5NDg3Mjc2Nn0.MRQYCC_qIkdi32rNGpbE_Z2kKKyTO5d8bPWpatdEI_Q'

var WARN_SECS = 300     // el timer pasa a ámbar
var LATE_SECS = 600     // el timer pasa a rojo con fondo y suena un aviso
var POLL_MS   = 3000
// ─────────────────────────────────────────────────────────────────────────────

var orders = []
var timers = {}
var ws = null
var wsHeartbeat = null
var retryTimeout = null
var pollInterval = null
var lastSignature = ''
var busy = {}

// Categorías: color de cada producto según la categoría del plato (configurada en Menú).
var dishCategory = {}   // dish id -> value de categoría
var catMeta = {}        // value -> { label, color }
var DEFAULT_CAT_COLOR = {
  entrada: '#22D3EE', principal: '#A78BFA', postre: '#60A5FA', bebida: '#CBD5E1', especial: '#BEF264'
}
var NEUTRAL_COLOR = '#CBD5E1'

var TIPO_LABEL = { LOCAL: 'Mesa', LLEVAR: 'Para llevar', DOMICILIO: 'Domicilio', RAPPI: 'Rappi' }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function orderRef(o) {
  return '#' + (o.order_number_today != null ? o.order_number_today : o.id.slice(0, 8))
}

function destinoPedido(o) {
  if (o.table_num) return 'Mesa ' + o.table_num
  if (o.notes && o.notes.split(' · ').indexOf('Barra') !== -1) return 'Barra'
  return TIPO_LABEL[o.tipo_pedido] || o.tipo_pedido || 'Pedido'
}

function parseItems(raw) {
  try {
    var p = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(p) ? p : []
  } catch (e) { return [] }
}

function elapsedSecs(createdAt) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000))
}

function elapsedStr(createdAt) {
  var diff = elapsedSecs(createdAt)
  var m = Math.floor(diff / 60), s = diff % 60
  return m + ':' + (s < 10 ? '0' + s : s)
}

function esc(str) {
  if (str === null || str === undefined) return ''
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function closest(el, selector) {
  var fn = el && (el.matches || el.webkitMatchesSelector || el.msMatchesSelector)
  while (el && el.nodeType === 1) {
    if (fn.call(el, selector)) return el
    el = el.parentNode
    fn = el && el.nodeType === 1 && (el.matches || el.webkitMatchesSelector || el.msMatchesSelector)
  }
  return null
}

// Color de la categoría de un producto + color de texto legible encima + fondo suave.
function isHex(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) }

function itemColor(item) {
  var value = dishCategory[item.id]
  var c = (catMeta[value] && catMeta[value].color) || DEFAULT_CAT_COLOR[value] || NEUTRAL_COLOR
  return isHex(c) ? c : NEUTRAL_COLOR
}

function textOn(hex) {
  var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0A0A0A' : '#FFFFFF'
}

// Características del producto: opciones/comentario (item.notes ya trae el resumen);
// si no hay, se arma con tamaño y toppings.
function itemDetail(item) {
  if (item.notes) return String(item.notes)
  var parts = []
  if (item.size) parts.push(item.size)
  if (item.toppings && item.toppings.length) parts.push('+ ' + item.toppings.join(', + '))
  return parts.join(' · ')
}

function orderNote(order) {
  if (!order.notes) return ''
  return order.notes.split(' · ').filter(function(n) { return n !== 'Barra' }).join(' · ')
}

// ─── Sonido ──────────────────────────────────────────────────────────────────
// Los navegadores (y la TV) no dejan sonar audio hasta que alguien hace clic en la
// página. Mientras siga bloqueado se muestra el aviso arriba; cualquier clic lo activa.
var PATTERNS = {
  LOCAL:     { wave: 'triangle', gain: 0.9,  notes: [[659, 0, 0.28], [523, 0.3, 0.4], [659, 0.8, 0.28], [523, 1.1, 0.45]] },
  LLEVAR:    { wave: 'square',   gain: 0.35, notes: [[1047, 0, 0.12], [1047, 0.2, 0.12], [1047, 0.4, 0.12], [1397, 0.6, 0.4]] },
  DOMICILIO: { wave: 'sawtooth', gain: 0.3,  notes: [[1175, 0, 0.16], [988, 0.18, 0.16], [784, 0.36, 0.16], [659, 0.54, 0.16], [523, 0.72, 0.35]] },
  RAPPI:     { wave: 'square',   gain: 0.3,  notes: [[1568, 0, 0.07], [1245, 0.09, 0.07], [1568, 0.18, 0.07], [1245, 0.27, 0.07], [1568, 0.36, 0.07], [1245, 0.45, 0.07], [1568, 0.54, 0.25]] },
  LATE:      { wave: 'triangle', gain: 0.8,  notes: [[880, 0, 0.15], [880, 0.25, 0.15], [660, 0.5, 0.35]] }
}

var audioCtx = null

function getCtx() {
  if (audioCtx) return audioCtx
  var C = window.AudioContext || window.webkitAudioContext
  if (!C) return null
  try { audioCtx = new C() } catch (e) { return null }
  audioCtx.onstatechange = updateBanner
  return audioCtx
}

function isAudioLocked() { return !audioCtx || audioCtx.state !== 'running' }

function updateBanner() {
  document.getElementById('sound-banner').style.display = isAudioLocked() ? 'block' : 'none'
}

// Debe llamarse dentro de un clic/tecla de la persona.
function unlockAudio() {
  var c = getCtx()
  if (!c) return
  if (c.state !== 'running') {
    try {
      var p = c.resume()
      if (p && p.then) p.then(updateBanner, updateBanner)
    } catch (e) {}
  }
  try {
    var b = c.createBufferSource()
    b.buffer = c.createBuffer(1, 1, 22050)
    b.connect(c.destination)
    b.start(0)
  } catch (e) {}
  updateBanner()
}

function playPattern(name, repeats) {
  var c = audioCtx
  if (!c || c.state !== 'running') return false
  var p = PATTERNS[name] || PATTERNS.LOCAL
  var out = c.createDynamicsCompressor()
  out.connect(c.destination)
  var t0 = c.currentTime + 0.05
  var total = 0
  for (var i = 0; i < p.notes.length; i++) total = Math.max(total, p.notes[i][1] + p.notes[i][2])
  total += 0.35
  for (var rep = 0; rep < repeats; rep++) {
    for (var n = 0; n < p.notes.length; n++) {
      var note = p.notes[n]
      var o = c.createOscillator()
      var g = c.createGain()
      o.type = p.wave
      o.frequency.value = note[0]
      var at = t0 + rep * total + note[1]
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(p.gain, at + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, at + note[2])
      o.connect(g)
      g.connect(out)
      o.start(at)
      o.stop(at + note[2] + 0.02)
    }
  }
  return true
}

// Orden nueva: el patrón del tipo de pedido, dos veces seguidas para que se oiga con ruido.
function playOrderSound(tipo) { return playPattern(PATTERNS[tipo] ? tipo : 'LOCAL', 2) }
function playLateSound() { return playPattern('LATE', 1) }

function testSounds() {
  unlockAudio()
  var tipos = ['LOCAL', 'LLEVAR', 'DOMICILIO', 'RAPPI']
  for (var i = 0; i < tipos.length; i++) {
    (function(t, idx) {
      setTimeout(function() { playOrderSound(t); showFlash('Sonido: ' + TIPO_LABEL[t]) }, 300 + idx * 3300)
    })(tipos[i], i)
  }
}

var flashTimeout = null
function showFlash(text) {
  var el = document.getElementById('new-flash')
  el.textContent = text
  el.style.display = 'block'
  clearTimeout(flashTimeout)
  flashTimeout = setTimeout(function() { el.style.display = 'none' }, 6000)
}

var unlockEvents = ['pointerdown', 'mousedown', 'mouseup', 'click', 'keydown', 'touchend']
for (var ue = 0; ue < unlockEvents.length; ue++) window.addEventListener(unlockEvents[ue], unlockAudio, false)

document.getElementById('sound-banner').onclick = function() {
  unlockAudio()
  setTimeout(function() { playOrderSound('LOCAL') }, 150)
}
document.getElementById('test-sound').onclick = testSounds

// Avisos: cada orden suena UNA vez. Lo que ya estaba al abrir la pantalla no suena.
var baselineDone = false
var heardNew = {}
var heardLate = {}

function checkAlerts(list) {
  var fresh = []
  for (var i = 0; i < list.length; i++) {
    var o = list[i]
    if (!baselineDone) {
      heardNew[o.id] = true
      if (o.status !== 'ready' && elapsedSecs(o.created_at) >= LATE_SECS) heardLate[o.id] = true
    } else if (o.status === 'pending' && !heardNew[o.id]) {
      heardNew[o.id] = true
      fresh.push(o)
    }
  }
  baselineDone = true
  if (fresh.length > 0) {
    showFlash(fresh.length === 1 ? 'Nueva orden ' + orderRef(fresh[0]) : fresh.length + ' órdenes nuevas')
    playOrderSound(fresh[0].tipo_pedido)
  }
}

// ─── Total activo — suma de productos por contar (pendientes + en cocina) ────
function buildTotals() {
  var counts = {}, colors = {}, keys = []
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].status !== 'pending' && orders[i].status !== 'cooking') continue
    var items = parseItems(orders[i].items)
    for (var j = 0; j < items.length; j++) {
      var it = items[j]
      if (it.cancelled) continue
      if (counts[it.name] === undefined) { counts[it.name] = 0; colors[it.name] = itemColor(it); keys.push(it.name) }
      counts[it.name] += (it.quantity || 1)
    }
  }
  var wrap = document.getElementById('totals')
  if (keys.length === 0) { wrap.style.display = 'none'; return }
  wrap.style.display = 'flex'
  keys.sort(function(a, b) { return counts[b] - counts[a] })
  var html = ''
  for (var n = 0; n < keys.length; n++) {
    var col = colors[keys[n]]
    html += '<div class="total-chip">'
      + '<span class="total-qty" style="background:' + col + ';color:' + textOn(col) + '">' + counts[keys[n]] + '</span>'
      + '<span class="total-name">' + esc(keys[n]) + '</span></div>'
  }
  var list = document.getElementById('totals-list')
  list.innerHTML = '<div id="totals-track">' + html + html + '</div>'
  // Se repite el conjunto hasta llenar el ancho, y la pista lleva dos mitades iguales (lazo sin saltos)
  var track = document.getElementById('totals-track')
  var half = track.offsetWidth / 2
  var reps = half > 0 ? Math.max(1, Math.ceil(list.offsetWidth / half)) : 1
  var one = '', r
  for (r = 0; r < reps; r++) one += html
  track.innerHTML = one + one
  var secs = Math.max(12, Math.round((track.offsetWidth / 2) / (window.innerWidth < 900 ? 70 : 110)))
  track.style.webkitAnimationDuration = secs + 's'
  track.style.animationDuration = secs + 's'
}

// ─── Timers ──────────────────────────────────────────────────────────────────
function timerClass(secs, isReady) {
  if (isReady) return 't-ready'
  if (secs >= LATE_SECS) return 't-late'
  if (secs >= WARN_SECS) return 't-warn'
  return 't-ok'
}

function updateTimers() {
  var els = document.querySelectorAll('[data-created]')
  var lateNow = false
  for (var i = 0; i < els.length; i++) {
    var el = els[i]
    var ca = el.getAttribute('data-created')
    var isReady = el.getAttribute('data-ready') === '1'
    var secs = elapsedSecs(ca)
    el.textContent = elapsedStr(ca)
    var cls = timerClass(secs, isReady)
    el.className = 'timer ' + cls
    var card = closest(el, '.card')
    if (card) {
      if (cls === 't-late') card.classList.add('late'); else card.classList.remove('late')
      var id = card.getAttribute('data-id')
      if (cls === 't-late' && !heardLate[id]) { heardLate[id] = true; lateNow = true }
    }
  }
  if (lateNow) { playLateSound(); showFlash('Orden demorada') }
}

function startTimers() {
  clearInterval(timers._global)
  timers._global = setInterval(updateTimers, 1000)
}

// ─── Render ──────────────────────────────────────────────────────────────────
function cardHtml(order, compact) {
  var items = parseItems(order.items)
  var isReady = order.status === 'ready'
  var next = order.status === 'pending' ? 'cooking' : (order.status === 'cooking' ? 'ready' : '')
  var secs = elapsedSecs(order.created_at)
  var cls = timerClass(secs, isReady)

  var itemsHtml = ''
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    if (item.cancelled) continue
    var color = itemColor(item)
    var fg = textOn(color)
    var tint = color + '26'
    var detail = itemDetail(item)
    var qty = '<span class="item-qty" style="background:' + color + ';color:' + fg + '">' + esc(item.quantity) + '</span>'
    if (compact) {
      itemsHtml += '<span class="chip" style="background:' + tint + '">' + qty
        + '<span class="chip-text">' + esc(item.name) + '</span></span>'
    } else {
      itemsHtml += '<div class="item" style="background:' + tint + '">'
        + '<div class="item-main">' + qty + '<span class="item-name">' + esc(item.name) + '</span></div>'
        + (detail ? '<div class="item-notes">' + esc(detail) + '</div>' : '')
        + '</div>'
    }
  }

  var note = orderNote(order)
  var title = destinoPedido(order) + (order.customer_name ? ' · ' + order.customer_name : '')
  var sub = (TIPO_LABEL[order.tipo_pedido] || order.tipo_pedido || '') + ' ' + orderRef(order)
  var cancelBtn = order.status === 'cooking' ? '<button class="btn-cancel" type="button" data-cancel="1">CANCELAR</button>' : ''

  return '<div class="card' + (cls === 't-late' ? ' late' : '') + (next ? ' clickable' : '') + '" data-id="' + esc(order.id) + '"'
    + (next ? ' data-next="' + next + '" role="button" tabindex="0"' : '') + '>'
    + '<div class="row1"><div class="title">' + esc(title) + '</div>'
    + '<div class="timer ' + cls + '" data-created="' + esc(order.created_at) + '"' + (isReady ? ' data-ready="1"' : '') + '>' + elapsedStr(order.created_at) + '</div></div>'
    + '<div class="row2"><span class="sub">' + esc(sub) + '</span>'
    + '<span><span class="badge ' + (order.paid_at ? 'paid' : 'unpaid') + '">' + (order.paid_at ? 'PAGADO' : 'POR COBRAR') + '</span>' + cancelBtn + '</span></div>'
    + (note ? '<div class="alert">' + esc(note) + '</div>' : '')
    + '<div class="' + (compact ? 'chips' : 'items') + '">' + itemsHtml + '</div>'
    + (isReady ? '<div class="ready-hint">Esperando cobro en caja</div>' : '')
    + '</div>'
}

// Muestra solo las tarjetas que caben COMPLETAS; el resto se cuenta en "+N más".
function fitColumn(cardsId, extraId) {
  var container = document.getElementById(cardsId)
  var col = container.parentNode
  var extra = document.getElementById(extraId)
  if (window.innerWidth < 900) {
    // Celular: se desplaza con el dedo, no se ocultan tarjetas
    var all = container.querySelectorAll('.card')
    for (var c = 0; c < all.length; c++) all[c].style.display = ''
    col.className = col.className.replace(' dense', '')
    extra.style.display = 'none'
    return
  }
  var hidden = layoutColumn(container, false)
  col.className = col.className.replace(' dense', '')
  hidden = layoutColumn(container, false)
  if (hidden > 0) {
    // No caben todas: se compacta la columna y se vuelve a intentar.
    col.className += ' dense'
    hidden = layoutColumn(container, true)
  }
  if (hidden > 0) { extra.textContent = '+' + hidden + ' más'; extra.style.display = 'block' }
  else { extra.style.display = 'none' }
}

// Deja visibles solo las tarjetas que caben completas; devuelve cuántas quedaron ocultas.
function layoutColumn(container) {
  var cards = container.querySelectorAll('.card')
  var i, hidden = 0, cut = false
  for (i = 0; i < cards.length; i++) cards[i].style.display = ''
  var limit = container.clientHeight
  for (i = 0; i < cards.length; i++) {
    if (cut) { cards[i].style.display = 'none'; hidden++; continue }
    if (i > 0 && cards[i].offsetTop + cards[i].offsetHeight > limit + 1) {
      cut = true
      cards[i].style.display = 'none'
      hidden++
    }
  }
  return hidden
}

function fitAll() {
  fitColumn('cards-pending', 'extra-pending')
  fitColumn('cards-cooking', 'extra-cooking')
  fitColumn('cards-ready',   'extra-ready')
}

function ordersSignature() {
  var s = []
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i]
    s.push(o.id + '|' + o.status + '|' + (o.paid_at ? 1 : 0) + '|' + (o.notes || '') + '|' + (o.customer_name || '') + '|' + JSON.stringify(o.items))
  }
  return s.join('~') + '#' + JSON.stringify(catMeta) + JSON.stringify(dishCategory)
}

function render(force) {
  var sig = ordersSignature()
  var changed = force || sig !== lastSignature
  lastSignature = sig

  var pending = [], cooking = [], ready = []
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i]
    if      (o.status === 'pending') pending.push(o)
    else if (o.status === 'cooking') cooking.push(o)
    else if (o.status === 'ready')   ready.push(o)
  }

  document.getElementById('loading').style.display = 'none'
  document.getElementById('error-box').style.display = 'none'

  var total = pending.length + cooking.length + ready.length
  document.getElementById('order-count').textContent = total + ' órdenes activas'

  if (total === 0) {
    document.getElementById('grid').style.display = 'none'
    document.getElementById('totals').style.display = 'none'
    document.getElementById('empty-state').style.display = 'flex'
    return
  }
  document.getElementById('empty-state').style.display = 'none'
  document.getElementById('grid').style.display = 'flex'

  if (!changed) return
  buildTotals()

  function renderCol(id, badgeId, list, compact) {
    document.getElementById(badgeId).textContent = list.length
    var container = document.getElementById(id)
    if (list.length === 0) {
      container.innerHTML = '<div class="col-empty">Sin órdenes</div>'
    } else {
      var html = ''
      for (var j = 0; j < list.length; j++) html += cardHtml(list[j], compact)
      container.innerHTML = html
    }
  }

  renderCol('cards-pending', 'badge-pending', pending, false)
  renderCol('cards-cooking', 'badge-cooking', cooking, false)
  renderCol('cards-ready',   'badge-ready',   ready,   true)

  fitAll()
  // Segunda pasada cuando el navegador ya asentó el layout (fuentes, escala).
  setTimeout(fitAll, 80)
  startTimers()
}

window.addEventListener('resize', function() { fitAll() })

// ─── Clics sobre las tarjetas (mouse, control remoto de la TV o teclado) ─────
function handleCardAction(card, target) {
  var id = card.getAttribute('data-id')
  if (target && closest(target, '[data-cancel]')) { cancelOrder(id); return }
  var next = card.getAttribute('data-next')
  if (next) advance(id, next)
}

document.getElementById('grid').addEventListener('click', function(e) {
  var card = closest(e.target, '.card')
  if (card) handleCardAction(card, e.target)
}, false)

// Celular: tocar la cabecera abre / cierra esa tarjeta (Pendientes, En cocina, Listas)
document.getElementById('grid').addEventListener('click', function(e) {
  if (window.innerWidth >= 900) return
  var head = closest(e.target, '.col-header')
  if (!head) return
  var col = head.parentNode
  col.className = / open\b/.test(col.className) ? col.className.replace(' open', '') : col.className + ' open'
}, false)

document.getElementById('grid').addEventListener('keydown', function(e) {
  if (e.key !== 'Enter' && e.key !== ' ' && e.keyCode !== 13 && e.keyCode !== 32) return
  var card = closest(e.target, '.card')
  if (card && card === e.target) { e.preventDefault(); handleCardAction(card, null) }
}, false)

// ─── API ─────────────────────────────────────────────────────────────────────
// ─── API: funciones seguras. La clave de la TV (?k=...) identifica al restaurante ───
var TV_TOKEN = ''
var themeForced = false

function rpc(name, body, ok, fail) {
  var req = new XMLHttpRequest()
  req.open('POST', SUPABASE_URL + '/rest/v1/rpc/' + name, true)
  req.setRequestHeader('apikey', SUPABASE_ANON_KEY)
  req.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_ANON_KEY)
  req.setRequestHeader('Content-Type', 'application/json')
  req.onload = function() {
    var data = null
    try { data = JSON.parse(req.responseText) } catch (e) {}
    if (req.status >= 200 && req.status < 300) ok(data)
    else fail(req.status, data)
  }
  req.onerror = function() { fail(0, null) }
  req.send(JSON.stringify(body))
}

function applyMeta(data) {
  var d = data.dishes || []
  for (var i = 0; i < d.length; i++) dishCategory[d[i].id] = d[i].category
  var mods = data.modules_enabled
  if (!mods) return
  if (mods.theme && !themeForced) applyThemeValue(mods.theme)
  if (mods.categories && mods.categories.length) {
    for (var j = 0; j < mods.categories.length; j++) {
      var c = mods.categories[j]
      if (c && c.value) catMeta[c.value] = { label: c.label, color: c.color }
    }
  }
}

function fetchOrders() {
  rpc('tv_cocina_datos', { p_token: TV_TOKEN }, function(data) {
    if (!data) { showError('Error al procesar datos'); return }
    document.getElementById('error-box').style.display = 'none'
    applyMeta(data)
    orders = data.orders || []
    setStatus('en vivo', true)
    checkAlerts(orders)
    render(false)
  }, function(status, data) {
    setStatus('sin conexión', false)
    if (status === 0) showError('Sin conexión al servidor')
    else if (data && data.message && data.message.indexOf('Clave de TV') === 0) showError('Clave de TV no válida. Pide la dirección nueva al administrador.')
    else showError('Error HTTP ' + status)
  })
}

function advance(orderId, nextStatus) {
  if (busy[orderId]) return
  busy[orderId] = true
  setTimeout(function() { delete busy[orderId] }, 800)
  // Se actualiza al instante en pantalla; el servidor confirma enseguida.
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].id === orderId) { orders[i].status = nextStatus; break }
  }
  render(false)
  rpc('tv_cocina_avanzar', { p_token: TV_TOKEN, p_order_id: orderId, p_status: nextStatus },
    function() { fetchOrders() },
    function() { alert('Error al actualizar pedido'); fetchOrders() })
}

function cancelOrder(orderId) {
  if (!confirm('¿Cancelar todo el pedido?')) return
  rpc('tv_cocina_cancelar', { p_token: TV_TOKEN, p_order_id: orderId },
    function(res) {
      if (res && res.status === 'pagado') alert('Este pedido ya está pagado. Pídele a caja que lo anule.')
      fetchOrders()
    },
    function() { alert('Error al cancelar') })
}

// ─── Polling — fuente principal de actualizaciones ───────────────────────────
function startPolling() {
  if (pollInterval) clearInterval(pollInterval)
  pollInterval = setInterval(fetchOrders, POLL_MS)
}

function setStatus(text, ok) {
  document.getElementById('status-text').textContent = text
  document.getElementById('status-text').style.color = ok ? 'var(--ready)' : 'var(--late)'
  document.getElementById('status-dot').style.background = ok ? 'var(--ready)' : 'var(--late)'
}

function showError(msg) {
  document.getElementById('loading').style.display = 'none'
  document.getElementById('error-box').style.display = 'block'
  document.getElementById('error-msg').textContent = msg
}

// ─── Keep-awake ───────────────────────────────────────────────────────────────
function keepAwake() {
  // 1. Wake Lock API (Chrome 84+)
  if ('wakeLock' in navigator) {
    var requestLock = function() { navigator.wakeLock.request('screen').catch(function() {}) }
    requestLock()
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') requestLock()
    })
  }

  // 2. Video mudo en loop (mantiene actividad de media)
  try {
    var v = document.createElement('video')
    v.setAttribute('loop',''); v.setAttribute('muted',''); v.setAttribute('playsinline','')
    v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0'
    v.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAA0NtZGF0AAACrAYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0MiByMjM4OSA5NTZjOGQ4IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNCAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiBicmFtZXM9MyBvcGVuX2dvcD0wIHdlaWdodHA9MiByZWxsb2M9MSB3ZWlnaHRiPTEga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAA3//728P4FNjuaAAAABWWIhAA='
    document.body.appendChild(v)
    v.play().catch(function() {})
  } catch (e) {}

  // 3. Scroll micro — simula actividad visual
  setInterval(function() { window.scrollBy(0,1); window.scrollBy(0,-1) }, 20000)

  // 4. MouseEvent sintético — engaña a WebOS haciéndole creer que hay usuario activo
  var ghost = document.createElement('input')
  ghost.style.cssText = 'position:fixed;opacity:0;width:1px;height:1px;top:0;left:0;pointer-events:none'
  ghost.setAttribute('readonly', '')
  document.body.appendChild(ghost)
  setInterval(function() {
    try {
      ghost.focus(); ghost.blur()
      var evt = document.createEvent('MouseEvents')
      evt.initMouseEvent('mousemove', true, true, window, 0, 1, 1, 1, 1, false, false, false, false, 0, null)
      document.dispatchEvent(evt)
    } catch (e) {}
  }, 15000)

  // 5. Red de seguridad cada 30 min. Recargar la página BORRA el permiso de audio
  //    (hace falta un clic nuevo), así que solo se recarga si el sonido ya estaba
  //    bloqueado. Con el sonido activo se refrescan los datos sin recargar.
  setInterval(function() {
    if (isAudioLocked()) { location.reload(); return }
    fetchOrders()
  }, 30 * 60 * 1000)
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function getUrlParams() {
  var params = {}
  var search = window.location.search.slice(1).split('&')
  for (var i = 0; i < search.length; i++) {
    var p = search[i].split('=')
    if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '')
  }
  return params
}

function applyThemeValue(t) {
  // WebOS Chromium 79 ignora setAttribute('data-theme','dark').
  // El CSS ya tiene el oscuro como :root por defecto.
  // Solo necesitamos intervenir cuando el tema es 'light'.
  if (t === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  }
}

var keepAwakeStarted = false

function init() {
  var params = getUrlParams()
  TV_TOKEN = params.k || ''
  updateBanner()
  // ?theme=light/dark como override manual (para casos de prueba)
  if (params.theme === 'light' || params.theme === 'dark') {
    themeForced = true
    applyThemeValue(params.theme)
  }
  if (!TV_TOKEN) { showError('Falta la clave de la TV en la dirección (?k=...)'); return }
  fetchOrders()
  startPolling()
  if (!keepAwakeStarted) { keepAwakeStarted = true; keepAwake() }
}

init()

// El botón Reintentar ya no usa onclick en línea (la CSP no permite scripts en línea).
document.getElementById('retry-btn').addEventListener('click', function() { init() })
