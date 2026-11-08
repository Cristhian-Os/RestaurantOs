/**
 * MesaQr — pedir desde el celular al escanear el QR de la mesa (`?mesa=N`).
 * El pedido NO va a cocina: queda esperando que el mesero lo acepte o rechace.
 * Sin sesión: todo pasa por funciones públicas (mesa_publica_estado, mesa_pedir_publico, mesa_llamar_mesero, mesa_pedir_cuenta, mesa_validar_codigo).
 * El precio nunca se manda desde aquí; el servidor lo calcula.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import { pushNotificationService } from '../../services/pushNotificationService'
import { formatCOP } from '../../config/billing'

export interface SolicitudMesa {
  id: string; estado: 'pendiente' | 'aceptado' | 'rechazado' | 'expirado'; motivo: string | null; total: number; created_at: string
  items: { name: string; quantity: number; price: number; notes: string | null }[]
}
export interface EstadoMesa {
  existe: boolean; mesa?: number; abierta?: boolean; autorizado?: boolean; bloqueada?: boolean
  solicitudes?: SolicitudMesa[]
  cuenta?: { lineas: { name: string; price: number; quantity: number }[]; total: number } | null
  llamadas?: { mesero: boolean; cuenta: boolean }
}
export type ResultadoEnvio = { ok: true } | { ok: false; error: 'codigo_requerido' | 'codigo_incorrecto' | 'bloqueada' | 'mensaje'; mensaje?: string }

const DEV_KEY = 'ros-mesa-dispositivo'
const COOLDOWN_MS = 60_000
let memoId: string | null = null
function dispositivoId(): string {
  try {
    let v = localStorage.getItem(DEV_KEY)
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(DEV_KEY, v) }
    return v
  } catch { return (memoId ??= crypto.randomUUID()) }
}

export type ItemPedido = Record<string, unknown>

export function useMesaQr(restaurantId: string | null, mesaStr: string, activo: boolean) {
  const [est, setEst] = useState<EstadoMesa | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cambio, setCambio] = useState(0)                // sube cuando el mesero responde un pedido
  const [hasta, setHasta] = useState<{ mesero: number; cuenta: number }>({ mesero: 0, cuenta: 0 })
  const [codigo, setCodigo] = useState('')               // código que el comensal ya escribió
  const prev = useRef<Map<string, string>>(new Map())
  const mesaNum = parseInt(mesaStr, 10)
  const valido = activo && !!restaurantId && Number.isInteger(mesaNum) && mesaNum >= 1
  const disp = dispositivoId()

  const refresh = useCallback(async () => {
    if (!valido || !restaurantId) return
    const { data, error } = await supabase.rpc('mesa_publica_estado', { p_restaurant: restaurantId, p_mesa: mesaNum, p_dispositivo: disp })
    if (error || !data) return
    const e = data as EstadoMesa
    setEst(e)
    let huboCambio = false
    for (const s of e.solicitudes ?? []) {
      const antes = prev.current.get(s.id)
      if (antes === 'pendiente' && s.estado !== 'pendiente') huboCambio = true
      prev.current.set(s.id, s.estado)
    }
    if (huboCambio) setCambio(c => c + 1)
  }, [valido, restaurantId, mesaNum, disp])

  useEffect(() => {
    if (!valido) return
    void refresh()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 4000)
    return () => clearInterval(t)
  }, [valido, refresh])

  const avisar = useCallback((m: string) => {
    setAviso(m)
    setTimeout(() => setAviso(a => (a === m ? null : a)), 5000)
  }, [])

  const enviar = useCallback(async (items: ItemPedido[], nombre: string): Promise<ResultadoEnvio> => {
    if (!valido || !restaurantId) return { ok: false, error: 'mensaje', mensaje: 'Mesa no disponible' }
    const { data, error } = await supabase.rpc('mesa_pedir_publico', {
      p_restaurant: restaurantId, p_mesa: mesaNum, p_dispositivo: disp, p_nombre: nombre.trim() || null, p_items: items, p_codigo: codigo || null,
    })
    if (error) return { ok: false, error: 'mensaje', mensaje: error.message }
    const r = data as { ok: boolean; error?: 'codigo_requerido' | 'codigo_incorrecto' | 'bloqueada' }
    if (!r.ok) return { ok: false, error: r.error ?? 'mensaje' }
    void refresh()
    // Aviso push al personal (best-effort: si falla, el pedido igual aparece en su pantalla)
    void pushNotificationService.notify(['waiter', 'cashier', 'admin'], `Mesa ${mesaNum} quiere pedir`, 'Abre "Pedidos de mesa" para aceptar o rechazar', '/', restaurantId)
    return { ok: true }
  }, [valido, restaurantId, mesaNum, disp, codigo, refresh])

  const validarCodigo = useCallback(async (c: string): Promise<boolean> => {
    if (!valido || !restaurantId) return false
    const { data } = await supabase.rpc('mesa_validar_codigo', { p_restaurant: restaurantId, p_mesa: mesaNum, p_dispositivo: disp, p_codigo: c.trim() })
    const r = data as { ok: boolean; error?: string } | null
    if (r?.ok) { setCodigo(c.trim()); await refresh(); return true }
    avisar(r?.error === 'bloqueada' ? 'Demasiados intentos. Espera 5 minutos o pide el código al mesero.' : 'Código incorrecto')
    await refresh()
    return false
  }, [valido, restaurantId, mesaNum, disp, refresh, avisar])

  const llamar = useCallback(async (tipo: 'mesero' | 'cuenta') => {
    if (!valido || !restaurantId) return
    if (Date.now() < hasta[tipo]) return
    const { data, error } = await supabase.rpc(tipo === 'mesero' ? 'mesa_llamar_mesero' : 'mesa_pedir_cuenta',
      { p_restaurant: restaurantId, p_mesa: mesaNum, p_dispositivo: disp, p_codigo: codigo || null })
    const r = data as { ok: boolean; ya?: boolean; error?: string } | null
    if (error || !r?.ok) {
      avisar(r?.error === 'sin_consumo' ? 'Aún no hay consumo en la mesa para pedir la cuenta.' : r?.error === 'codigo_requerido' ? 'Escribe el código de la mesa primero.' : 'No se pudo avisar. Intenta de nuevo.')
      return
    }
    setHasta(h => ({ ...h, [tipo]: Date.now() + COOLDOWN_MS }))
    avisar(tipo === 'mesero' ? 'Listo, avisamos al mesero. Ya viene.' : 'Listo, el mesero te trae la cuenta.')
    void pushNotificationService.notify(['waiter', 'cashier', 'admin'], tipo === 'mesero' ? `Mesa ${mesaNum} llama al mesero` : `Mesa ${mesaNum} pide la cuenta`, 'Revisa "Pedidos de mesa"', '/', restaurantId)
    void refresh()
  }, [valido, restaurantId, mesaNum, disp, codigo, hasta, avisar, refresh])

  return { est, activo: valido && est?.existe === true, aviso, cambio, hasta, enviar, validarCodigo, llamar, refresh }
}

export type MesaQr = ReturnType<typeof useMesaQr>

const ETIQUETA: Record<SolicitudMesa['estado'], { t: string; c: string }> = {
  pendiente: { t: 'Esperando al mesero…', c: 'var(--w-warning-text)' },
  aceptado:  { t: 'Aceptado: ya lo preparan', c: 'var(--w-success-text)' },
  rechazado: { t: 'Rechazado', c: 'var(--w-danger-text)' },
  expirado:  { t: 'Sin respuesta: llama al mesero', c: 'var(--w-text-3)' },
}

/** Franja bajo la cabecera: mesa + estado del último pedido. Toca para abrir "Mi mesa". */
export function MesaQrBanner({ qr, onAbrir }: { qr: MesaQr; onAbrir: () => void }) {
  const e = qr.est
  if (!qr.activo || !e) return null
  const ultima = e.solicitudes?.[0]
  const texto = e.abierta && !e.autorizado ? 'Mesa abierta: escribe el código' : ultima ? ETIQUETA[ultima.estado].t : 'Pide desde tu celular; el mesero confirma'
  return (
    <div className="menu-wrap" style={{ padding: '0 1rem', margin: '0 auto 0.75rem' }}>
      <button onClick={onAbrir} aria-label="Abrir mi mesa"
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '1rem', border: '1px solid var(--w-border)', background: 'var(--w-surface)', color: 'var(--w-text)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--w-font)' }}>
        <span style={{ fontWeight: 800, fontSize: '1rem', background: 'var(--w-accent)', color: 'var(--w-on-accent)', borderRadius: '0.75rem', padding: '0.375rem 0.75rem' }}>Mesa {e.mesa}</span>
        <span style={{ flex: 1, fontSize: '0.8125rem', color: ultima && e.autorizado ? ETIQUETA[ultima.estado].c : 'var(--w-text-2)', fontWeight: 600 }}>{texto}</span>
        <span aria-hidden style={{ color: 'var(--w-text-3)' }}>›</span>
      </button>
    </div>
  )
}

function useAhora(activo: boolean) {
  const [n, setN] = useState(Date.now())
  useEffect(() => { if (!activo) return; const t = setInterval(() => setN(Date.now()), 1000); return () => clearInterval(t) }, [activo])
  return n
}

const caja: React.CSSProperties = { background: 'var(--w-surface-sunken)', border: '1px solid var(--w-border)', borderRadius: '1.125rem', padding: '1rem', marginBottom: '1rem' }
const titulo: React.CSSProperties = { fontFamily: 'var(--w-font)', fontWeight: 700, fontSize: '1rem', color: 'var(--w-text)', margin: '0 0 0.5rem' }

/** Hoja "Mi mesa": código, estado de pedidos, lo que se ha pedido y botones de llamar / cuenta. */
export function MesaQrSheet({ qr, abierto, onCerrar }: { qr: MesaQr; abierto: boolean; onCerrar: () => void }) {
  const e = qr.est
  const [cod, setCod] = useState('')
  const [probando, setProbando] = useState(false)
  const ahora = useAhora(abierto)
  if (!e || !qr.activo) return null
  const pedirCodigo = !!e.abierta && !e.autorizado
  const seg = (t: 'mesero' | 'cuenta') => Math.max(0, Math.ceil((qr.hasta[t] - ahora) / 1000))
  const boton = (t: 'mesero' | 'cuenta', texto: string, ya: boolean) => {
    const s = seg(t)
    return (
      <button key={t} disabled={s > 0} onClick={() => void qr.llamar(t)}
        style={{ flex: 1, minHeight: 52, padding: '0.75rem', borderRadius: 'var(--w-r-md)', border: '1px solid var(--w-border-strong)', background: t === 'cuenta' ? 'var(--w-accent)' : 'var(--w-surface)', color: t === 'cuenta' ? 'var(--w-on-accent)' : 'var(--w-text)', fontWeight: 700, fontFamily: 'var(--w-font)', fontSize: '0.9375rem', cursor: s > 0 ? 'default' : 'pointer', opacity: s > 0 ? 0.6 : 1 }}>
        {s > 0 ? `Avisado (${s}s)` : ya ? `${texto} (ya avisaste)` : texto}
      </button>
    )
  }
  return (
    <AnimatePresence>
      {abierto && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCerrar}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'oklch(0.25 0.03 55 / 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 480, damping: 42, mass: 0.85 }}
            onClick={ev => ev.stopPropagation()} role="dialog" aria-label={`Mesa ${e.mesa}`}
            className="bg-[var(--w-surface)] border border-[var(--w-border)] shadow-[var(--w-shadow-lg)]"
            style={{ width: '100%', maxWidth: 480, borderRadius: '1.75rem 1.75rem 0 0', padding: '1.5rem', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <h3 style={{ flex: 1, fontFamily: 'var(--w-font)', fontWeight: 700, fontSize: '1.375rem', color: 'var(--w-text)', margin: 0 }}>Mesa {e.mesa}</h3>
              <button onClick={onCerrar} aria-label="Cerrar" style={{ width: 40, height: 40, borderRadius: '0.875rem', border: '1px solid var(--w-border)', background: 'var(--w-surface-sunken)', color: 'var(--w-text)', cursor: 'pointer' }}>✕</button>
            </div>

            {qr.aviso && <div role="status" style={{ ...caja, padding: '0.75rem 1rem', color: 'var(--w-text)', fontWeight: 600, fontSize: '0.875rem' }}>{qr.aviso}</div>}

            {pedirCodigo ? (
              <div style={caja}>
                <p style={titulo}>Esta mesa ya está abierta</p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--w-text-2)', margin: '0 0 0.75rem' }}>
                  {e.bloqueada ? 'Demasiados intentos. Espera 5 minutos o pide ayuda al mesero.' : 'Escribe el código de 4 dígitos de la mesa. Te lo da el mesero o quien abrió la mesa.'}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input inputMode="numeric" pattern="[0-9]*" maxLength={4} value={cod} onChange={ev => setCod(ev.target.value.replace(/\D/g, ''))} placeholder="0000" aria-label="Código de la mesa"
                    style={{ flex: 1, minWidth: 0, textAlign: 'center', letterSpacing: '0.4em', fontSize: '1.25rem', fontWeight: 700, padding: '0.75rem', borderRadius: '0.875rem', border: '1px solid var(--w-border)', background: 'var(--w-surface)', color: 'var(--w-text)' }} />
                  <button disabled={cod.length !== 4 || probando || !!e.bloqueada}
                    onClick={async () => { setProbando(true); const ok = await qr.validarCodigo(cod); setProbando(false); if (ok) setCod('') }}
                    style={{ padding: '0 1.25rem', borderRadius: 'var(--w-r-md)', border: 'none', background: 'var(--w-accent)', color: 'var(--w-on-accent)', fontWeight: 700, cursor: 'pointer', opacity: cod.length !== 4 || e.bloqueada ? 0.5 : 1 }}>Entrar</button>
                </div>
              </div>
            ) : (
              <>
                {(e.solicitudes?.length ?? 0) > 0 && (
                  <div style={caja}>
                    <p style={titulo}>Tus pedidos</p>
                    {e.solicitudes!.slice(0, 4).map(s => (
                      <div key={s.id} style={{ padding: '0.5rem 0', borderTop: '1px solid var(--w-border)' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: ETIQUETA[s.estado].c }}>
                          {ETIQUETA[s.estado].t}{s.estado === 'rechazado' && s.motivo ? `: ${s.motivo}` : ''}
                        </p>
                        <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: 'var(--w-text-2)' }}>
                          {s.items.map(i => `${i.quantity}× ${i.name}`).join(', ')} · {formatCOP(s.total)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div style={caja}>
                  <p style={titulo}>Lo que habéis pedido</p>
                  {(e.cuenta?.lineas.length ?? 0) === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--w-text-3)' }}>Todavía no hay pedidos aceptados en la mesa.</p>
                  ) : (
                    <>
                      {e.cuenta!.lineas.map((l, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--w-text)', padding: '0.25rem 0' }}>
                          <span>{l.quantity}× {l.name}</span><span style={{ fontWeight: 700 }}>{formatCOP(l.price * l.quantity)}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '0.625rem', marginTop: '0.375rem', borderTop: '1px solid var(--w-border)' }}>
                        <span style={{ fontWeight: 700, color: 'var(--w-text)' }}>Total de la mesa</span>
                        <span style={{ fontWeight: 800, fontSize: '1.375rem', color: 'var(--w-accent-text)' }}>{formatCOP(e.cuenta!.total)}</span>
                      </div>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.625rem' }}>
                  {boton('mesero', 'Llamar al mesero', !!e.llamadas?.mesero)}
                  {boton('cuenta', 'Pedir la cuenta', !!e.llamadas?.cuenta)}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
