/**
 * TicketModal.tsx — ventana con la pre-cuenta o el recibo de un pedido: vista previa y 3 salidas
 * (imprimir, guardar PDF, WhatsApp). Imprimir nunca bloquea el cobro: si falla, avisa y deja "Reintentar".
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { armarTicket, registrarImpresion, type TicketListo } from '../../lib/print/datos'
import { abrirWhatsApp, compartirPdf, imprimirEnNavegador } from '../../lib/print/navegador'
import { renderHtml } from '../../lib/print/render'

const boton: React.CSSProperties = { border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9375rem', borderRadius: '0.75rem', padding: '0.7rem 1.1rem', minHeight: '2.75rem' }
const secundario: React.CSSProperties = { ...boton, flex: 1, background: 'rgba(120,110,95,0.12)', color: 'inherit' }

interface Props { tipo: 'precuenta' | 'recibo' | 'cierre'; orderId?: string; preparado?: TicketListo; automatico?: boolean; onClose: () => void }
const TITULO = { recibo: 'Recibo de pago', precuenta: 'Pre-cuenta', cierre: 'Cierre de caja' }

/** Pre-cuenta y recibo se arman desde `orderId`; el cierre llega ya armado en `preparado`. */
export function TicketModal({ tipo, orderId, preparado, automatico, onClose }: Props) {
  const [ticket, setTicket] = useState<TicketListo | null>(preparado ?? null)
  const [error, setError] = useState<string | null>(null)
  const [falloImpresion, setFalloImpresion] = useState<string | null>(null)
  const [imprimiendo, setImprimiendo] = useState(false)
  const yaAutomatico = useRef(false)

  useEffect(() => {
    if (preparado || tipo === 'cierre' || !orderId) return
    let vivo = true
    armarTicket(tipo, orderId).then(t => { if (vivo) setTicket(t) }).catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo armar el documento') })
    return () => { vivo = false }
  }, [tipo, orderId, preparado])

  const imprimir = useCallback(async (t: TicketListo) => {
    setImprimiendo(true); setFalloImpresion(null)
    try { await imprimirEnNavegador(t.modelo); void registrarImpresion(tipo, orderId ?? null, 'impreso') }
    catch (e) { const m = e instanceof Error ? e.message : 'error'; setFalloImpresion(m); void registrarImpresion(tipo, orderId ?? null, 'error', m) }
    finally { setImprimiendo(false) }
  }, [tipo, orderId])

  useEffect(() => { if (automatico && ticket && !yaAutomatico.current) { yaAutomatico.current = true; void imprimir(ticket) } }, [automatico, ticket, imprimir])

  const titulo = TITULO[tipo]
  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} onClick={e => { e.stopPropagation(); onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(30,35,60,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, maxHeight: '92vh', overflow: 'auto', background: '#fff', color: '#222', borderRadius: '1.25rem', padding: '1.125rem', display: 'grid', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '1.0625rem' }}>{titulo}{ticket?.numeroRecibo ? ` · N.º ${String(ticket.numeroRecibo).padStart(6, '0')}` : ''}</strong>
          <button onClick={onClose} aria-label="Cerrar" style={{ ...boton, background: 'transparent', padding: '0.25rem 0.75rem', fontSize: '1.25rem' }}>×</button>
        </div>

        {!ticket && !error && <p style={{ margin: 0 }}>Preparando…</p>}
        {error && <p role="alert" style={{ margin: 0, color: '#B0341D', fontWeight: 600 }}>{error}</p>}

        {ticket && (
          <>
            <iframe title="Vista previa" srcDoc={renderHtml(ticket.modelo)} style={{ width: '100%', height: '46vh', border: '1px solid #ddd', borderRadius: '0.75rem', background: '#fff' }} />
            {falloImpresion && (
              <p role="alert" style={{ margin: 0, color: '#B0341D', fontWeight: 600, fontSize: '0.875rem' }}>
                No se pudo imprimir: {falloImpresion}. El cobro quedó bien. Puedes reintentar o usar el PDF / WhatsApp.
              </p>
            )}
            <button style={{ ...boton, background: '#C2570C', color: '#fff', opacity: imprimiendo ? 0.7 : 1 }} disabled={imprimiendo} onClick={() => void imprimir(ticket)}>
              {imprimiendo ? 'Abriendo impresión…' : falloImpresion ? '↻ Reintentar impresión' : '🖨 Imprimir'}
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button style={secundario} onClick={() => void compartirPdf(ticket.modelo, titulo.toLowerCase().replace(/ /g, '-'))}>PDF</button>
              <button style={secundario} onClick={() => abrirWhatsApp(ticket.modelo, ticket.telefonoCliente)}>WhatsApp</button>
              <button style={secundario} onClick={onClose}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
