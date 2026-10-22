/**
 * PagosVendedores.tsx — "Pagos a vendedores" (Anexo C, 7.2 a 7.4).
 * La app calcula, aprueba y registra el pago; la transferencia la haces tú en tu banco o Nequi.
 * Flujo: preparar el mes → revisar → cuenta de cobro → aprobar → registrar pago con comprobante → recibo en PDF.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { generarRecibo, type DatosRecibo } from '../../lib/reciboLiquidacion'
import { Campo, Modal, abrirPrivado, botonPrimario, botonSuave, campo, cop, fechaCorta, hoyBogotaISO, mesLargo, subirPrivado, suave, tarjeta } from './platformUi'

interface Deuda { vendedor_id: string; vendedor: string; codigo: string; activo: boolean; por_pagar_cop: number; congelado_cop: number; en_borrador_cop: number }
interface Liq {
  id: string; numero: string | null; vendedor_id: string; vendedor: string; codigo: string; periodo: string; total_bruto_cop: number; retencion_cop: number
  total_pagar_cop: number; estado: 'borrador' | 'aprobada' | 'pagada'; cuenta_cobro_numero: string | null; cuenta_cobro_ruta: string | null
  comprobante_ruta: string | null; recibo_ruta: string | null; aprobada_at: string | null; pagada_at: string | null; lineas: number
}
interface Linea { id: string; tipo: string; restaurante: string | null; fecha_pago: string | null; base_cop: number; porcentaje: number; monto_cop: number; estado: string; motivo: string | null }
type DetalleCompleto = Omit<Liq, 'vendedor' | 'lineas'> & {
  referencia_pago: string | null; medio_pago: string | null
  vendedor: { nombre: string; documento: string | null; codigo: string; tipo: string; contrato_version: string | null; firmado_at: string | null; medio_pago: string | null; datos_pago: string | null }
  lineas: Linea[]
}
const TIPOS: Record<string, string> = { bono_1: 'Bono 1', bono_2: 'Bono 2', recurrente: 'Mensual', ajuste: 'Ajuste por devolución' }
const ESTADOS: Record<string, string> = { borrador: 'Por revisar', aprobada: 'Aprobada, por pagar', pagada: 'Pagada' }

export function PagosVendedores() {
  const [deuda, setDeuda] = useState<Deuda[] | null>(null)
  const [liqs, setLiqs] = useState<Liq[]>([])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [mes, setMes] = useState(hoyBogotaISO().slice(0, 7))
  const [busy, setBusy] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [d, l] = await Promise.all([supabase.rpc('plataforma_deuda_vendedores'), supabase.rpc('plataforma_liquidaciones_listar')])
    if (d.error) { setError(d.error.message); return }
    setDeuda((d.data as Deuda[]) ?? [])
    if (l.error) { setMsg('No se pudieron cargar las liquidaciones: ' + l.error.message); return }
    setLiqs((l.data as Liq[]) ?? [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const preparar = async () => {
    setBusy(true); setMsg(null)
    const c = await supabase.rpc('calcular_comisiones', { p_periodo: null })
    if (c.error) { setMsg(c.error.message); setBusy(false); return }
    const l = await supabase.rpc('crear_liquidaciones', { p_periodo: mes + '-01' })
    setBusy(false)
    if (l.error) { setMsg(l.error.message); return }
    const cc = c.data as { creadas: number; omitidas_por_incumplimiento: number }
    const ll = l.data as { creadas: number; actualizadas: number; saldo_arrastrado: number }
    setMsg(`Comisiones nuevas: ${cc.creadas}. Liquidaciones creadas: ${ll.creadas}, completadas: ${ll.actualizadas}.${ll.saldo_arrastrado ? ` ${ll.saldo_arrastrado} vendedor(es) con saldo cero o negativo: se arrastra al mes siguiente.` : ''}${cc.omitidas_por_incumplimiento ? ` ${cc.omitidas_por_incumplimiento} pago(s) omitidos por incumplimiento.` : ''}`)
    cargar()
  }

  if (error) return <div style={{ ...tarjeta, color: 'var(--tag-red-text, #b91c1c)' }}>No se pudo cargar: {error}</div>
  if (!deuda) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>
  const totalDebido = deuda.reduce((s, d) => s + d.por_pagar_cop, 0)

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Pagos a vendedores</h2>
        <p style={{ ...suave, margin: '0.25rem 0 0' }}>La app calcula y registra; tú haces la transferencia desde tu banco o Nequi y luego registras el pago aquí.</p>
      </div>

      <div style={tarjeta}>
        <h3 style={{ margin: '0 0 0.5rem' }}>Se debe en total: {cop(totalDebido)}</h3>
        <div style={{ display: 'grid', gap: '0.375rem' }}>
          {deuda.filter(d => d.por_pagar_cop !== 0 || d.congelado_cop !== 0).length === 0 && <span style={suave}>Nadie tiene comisiones pendientes.</span>}
          {deuda.filter(d => d.por_pagar_cop !== 0 || d.congelado_cop !== 0).map(d => (
            <div key={d.vendedor_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.9375rem' }}>
              <span>{d.vendedor} <span style={suave}>({d.codigo}){d.activo ? '' : ' · código inactivo'}</span></span>
              <span><strong>{cop(d.por_pagar_cop)}</strong>{d.congelado_cop > 0 && <span style={{ ...suave, marginLeft: '0.5rem' }}>+ {cop(d.congelado_cop)} congelado</span>}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'end', marginTop: '0.875rem' }}>
          <Campo titulo="Mes a liquidar"><input style={{ ...campo, width: 'auto' }} type="month" value={mes} max={hoyBogotaISO().slice(0, 7)} onChange={e => setMes(e.target.value)} /></Campo>
          <button style={botonPrimario} disabled={busy} onClick={preparar}>{busy ? 'Calculando…' : 'Calcular comisiones y preparar liquidaciones'}</button>
        </div>
        <p style={{ ...suave, margin: '0.5rem 0 0' }}>Es seguro repetirlo: no duplica nada. Las liquidaciones nacen en “por revisar”.</p>
        {msg && <p role="status" style={{ fontSize: '0.875rem', margin: '0.5rem 0 0' }}>{msg}</p>}
      </div>

      {(['borrador', 'aprobada', 'pagada'] as const).map(est => {
        const filas = liqs.filter(l => l.estado === est)
        if (filas.length === 0) return null
        return (
          <div key={est} style={tarjeta}>
            <h3 style={{ margin: '0 0 0.5rem' }}>{ESTADOS[est]} ({filas.length})</h3>
            <div style={{ display: 'grid', gap: '0.375rem' }}>
              {filas.map(l => (
                <button key={l.id} onClick={() => setAbierta(l.id)} style={{ textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: '0.75rem', padding: '0.6rem 0.8rem', minHeight: '2.75rem', background: 'var(--bg-surface, #CDD0DC)', color: 'inherit', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span><strong>{l.vendedor}</strong> <span style={suave}>· {mesLargo(l.periodo)}{l.numero ? ` · ${l.numero}` : ''} · {l.lineas} líneas</span></span>
                  <strong>{cop(l.total_pagar_cop)}</strong>
                </button>
              ))}
            </div>
          </div>
        )
      })}
      {liqs.length === 0 && <div style={{ ...tarjeta, ...suave }}>Todavía no hay liquidaciones. Cuando haya pagos de suscripción de clientes con vendedor, prepáralas con el botón de arriba.</div>}
      {abierta && <DetalleLiquidacion id={abierta} onClose={() => setAbierta(null)} onCambio={cargar} />}
    </div>
  )
}

function DetalleLiquidacion({ id, onClose, onCambio }: { id: string; onClose: () => void; onCambio: () => void }) {
  const [d, setD] = useState<DetalleCompleto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [retencion, setRetencion] = useState('0')
  const [cuentaNum, setCuentaNum] = useState('')
  const [cuentaArchivo, setCuentaArchivo] = useState<File | null>(null)
  const [medio, setMedio] = useState('nequi')
  const [referencia, setReferencia] = useState('')
  const [comprobante, setComprobante] = useState<File | null>(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('plataforma_liquidacion_detalle', { p_id: id })
    if (error) { setMsg(error.message); return }
    const x = data as DetalleCompleto
    setD(x); setRetencion(String(x.retencion_cop)); setCuentaNum(x.cuenta_cobro_numero ?? ''); setMedio(x.vendedor.medio_pago ?? 'nequi')
  }, [id])
  useEffect(() => { cargar() }, [cargar])

  const ejecutar = async (f: () => Promise<void>) => {
    setBusy(true); setMsg(null)
    try { await f(); await cargar(); onCambio() } catch (e) { setMsg((e as Error).message) }
    setBusy(false)
  }

  const guardarDatos = () => ejecutar(async () => {
    let ruta: string | null = null
    if (cuentaArchivo) ruta = await subirPrivado('comprobantes-vendedores', `liq-${id}`, cuentaArchivo, cuentaArchivo.name)
    const { error } = await supabase.rpc('plataforma_liquidacion_editar', { p_id: id, p_retencion: Number(retencion.replace(/\D/g, '')) || 0, p_cuenta_numero: cuentaNum, p_cuenta_ruta: ruta })
    if (error) throw new Error(error.message)
    setCuentaArchivo(null); setMsg('Datos guardados')
  })
  const aprobar = () => ejecutar(async () => {
    if (!window.confirm('¿Aprobar esta liquidación? Se congelan los montos y ya no se podrá editar.')) return
    const { error } = await supabase.rpc('aprobar_liquidacion', { p_id: id })
    if (error) throw new Error(error.message)
    setMsg('Liquidación aprobada. Haz la transferencia y registra el pago.')
  })
  const anular = (l: Linea) => ejecutar(async () => {
    const motivo = window.prompt('¿Por qué quitas esta comisión? (obligatorio)')
    if (!motivo) return
    const { error } = await supabase.rpc('anular_comision', { p_id: l.id, p_motivo: motivo })
    if (error) throw new Error(error.message)
  })
  const pagar = () => ejecutar(async () => {
    if (!referencia.trim()) throw new Error('Escribe la referencia de la transferencia')
    if (!window.confirm(`¿Confirmas que ya transferiste ${cop(d?.total_pagar_cop)} a ${d?.vendedor.nombre}? No se puede registrar dos veces.`)) return
    let rutaComp: string | null = null
    if (comprobante) rutaComp = await subirPrivado('comprobantes-vendedores', `liq-${id}`, comprobante, comprobante.name)
    const { error } = await supabase.rpc('registrar_pago_liquidacion', { p_id: id, p_medio: medio, p_referencia: referencia.trim(), p_comprobante_ruta: rutaComp })
    if (error) throw new Error(error.message)
    // Ya pagada: se genera y guarda el recibo en PDF (un fallo aquí no deshace el pago; se puede reintentar).
    try { await crearRecibo() } catch (e) { setMsg('Pago registrado, pero el recibo falló: ' + (e as Error).message + '. Usa “Generar recibo”.'); return }
    setMsg('Pago registrado y recibo generado')
  })
  const crearRecibo = async () => {
    const { data, error } = await supabase.rpc('plataforma_liquidacion_detalle', { p_id: id })
    if (error) throw new Error(error.message)
    const x = data as DetalleCompleto
    if (!x.numero || !x.pagada_at) throw new Error('La liquidación aún no está pagada')
    const blob = generarRecibo({
      numero: x.numero, periodo: x.periodo, pagada_at: x.pagada_at, medio_pago: x.medio_pago, referencia_pago: x.referencia_pago, cuenta_cobro_numero: x.cuenta_cobro_numero,
      total_bruto_cop: x.total_bruto_cop, retencion_cop: x.retencion_cop, total_pagar_cop: x.total_pagar_cop, vendedor: x.vendedor, lineas: x.lineas,
    } as DatosRecibo)
    const ruta = await subirPrivado('comprobantes-vendedores', `liq-${id}`, blob, `recibo-${x.numero}.pdf`)
    const g = await supabase.rpc('plataforma_liquidacion_guardar_recibo', { p_id: id, p_ruta: ruta })
    if (g.error) throw new Error(g.error.message)
  }
  const regenerar = () => ejecutar(async () => { await crearRecibo(); setMsg('Recibo generado') })
  const abrir = (b: 'comprobantes-vendedores', r: string | null) => r && abrirPrivado(b, r).catch(e => setMsg((e as Error).message))
  const mensaje = () => {
    if (!d) return
    const t = `Hola ${d.vendedor.nombre}, te pagamos tu liquidación ${d.numero} de ${mesLargo(d.periodo)} por ${cop(d.total_pagar_cop)} (${d.medio_pago}, ref. ${d.referencia_pago}). Gracias por trabajar con RestaurantOS.`
    navigator.clipboard?.writeText(t); setMsg('Mensaje copiado: pégalo en WhatsApp con el recibo adjunto')
  }

  return (
    <Modal onClose={onClose}>
      {!d ? <p>{msg ?? 'Cargando…'}</p> : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>{d.vendedor.nombre} · {mesLargo(d.periodo)}</h3>
              <div style={suave}>{ESTADOS[d.estado]}{d.numero ? ` · ${d.numero}` : ''} · código {d.vendedor.codigo} · contrato {d.vendedor.contrato_version ?? '—'}</div>
            </div>
            <button style={botonSuave} onClick={onClose}>Cerrar</button>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0', display: 'grid', gap: '0.25rem', fontSize: '0.8125rem' }}>
            {d.lineas.map(l => (
              <li key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid var(--bg-surface, #CDD0DC)', paddingTop: '0.25rem', opacity: l.estado === 'anulada' ? 0.45 : 1 }}>
                <span>{TIPOS[l.tipo] ?? l.tipo} · {l.restaurante ?? '—'} · {fechaCorta(l.fecha_pago)} · base {cop(l.base_cop)} ({l.porcentaje}%){l.estado === 'anulada' ? ' · anulada' : ''}</span>
                <span><strong>{cop(l.monto_cop)}</strong>{d.estado === 'borrador' && l.estado !== 'anulada' && <button style={{ ...botonSuave, minHeight: '2rem', padding: '0.15rem 0.6rem', marginLeft: '0.5rem', fontSize: '0.75rem' }} onClick={() => anular(l)}>Quitar</button>}</span>
              </li>
            ))}
          </ul>
          <div style={{ fontSize: '0.9375rem' }}>
            Total comisiones: <strong>{cop(d.total_bruto_cop)}</strong> · Retención: <strong>{cop(d.retencion_cop)}</strong> · A pagar: <strong style={{ fontSize: '1.0625rem' }}>{cop(d.total_pagar_cop)}</strong>
          </div>

          {d.estado === 'borrador' && (
            <div style={{ marginTop: '0.875rem', display: 'grid', gap: '0.5rem' }}>
              <h4 style={{ margin: 0 }}>Cuenta de cobro y retención</h4>
              <p style={{ ...suave, margin: 0 }}>Pídele al vendedor su cuenta de cobro o factura y súbela. La retención en la fuente la define tu contador: el sistema no la calcula.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '0.5rem' }}>
                <Campo titulo="N.º de la cuenta de cobro"><input style={campo} value={cuentaNum} maxLength={60} onChange={e => setCuentaNum(e.target.value)} /></Campo>
                <Campo titulo={d.cuenta_cobro_ruta ? 'Cuenta de cobro (ya cargada; sube otra para cambiarla)' : 'Foto o PDF de la cuenta de cobro'}>
                  <input style={campo} type="file" accept="application/pdf,image/*" onChange={e => setCuentaArchivo(e.target.files?.[0] ?? null)} /></Campo>
                <Campo titulo="Retención en la fuente (COP)"><input style={campo} inputMode="numeric" value={retencion} onChange={e => setRetencion(e.target.value)} /></Campo>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button style={botonSuave} disabled={busy} onClick={guardarDatos}>Guardar datos</button>
                <button style={botonPrimario} disabled={busy || !d.cuenta_cobro_ruta || !d.cuenta_cobro_numero} onClick={aprobar}>Aprobar liquidación</button>
              </div>
              {(!d.cuenta_cobro_ruta || !d.cuenta_cobro_numero) && <span style={suave}>Para aprobar hay que guardar el número y el archivo de la cuenta de cobro.</span>}
            </div>
          )}

          {d.estado === 'aprobada' && (
            <div style={{ marginTop: '0.875rem', display: 'grid', gap: '0.5rem' }}>
              <h4 style={{ margin: 0 }}>Registrar el pago</h4>
              <p style={{ ...suave, margin: 0 }}>Primero haz la transferencia{d.vendedor.datos_pago ? <> a: <strong>{d.vendedor.datos_pago}</strong></> : ''}. Luego anótala aquí.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '0.5rem' }}>
                <Campo titulo="Medio de pago"><select style={campo} value={medio} onChange={e => setMedio(e.target.value)}><option value="nequi">Nequi</option><option value="bancolombia">Bancolombia</option><option value="otro">Otro</option></select></Campo>
                <Campo titulo="Referencia de la transferencia"><input style={campo} value={referencia} maxLength={120} onChange={e => setReferencia(e.target.value)} /></Campo>
                <Campo titulo="Foto del comprobante"><input style={campo} type="file" accept="application/pdf,image/*" onChange={e => setComprobante(e.target.files?.[0] ?? null)} /></Campo>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button style={botonPrimario} disabled={busy} onClick={pagar}>Registrar pago</button>
                <button style={botonSuave} onClick={() => abrir('comprobantes-vendedores', d.cuenta_cobro_ruta)}>Ver cuenta de cobro</button>
              </div>
            </div>
          )}

          {d.estado === 'pagada' && (
            <div style={{ marginTop: '0.875rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={suave}>Pagada el {fechaCorta(d.pagada_at)} por {d.medio_pago} · ref. {d.referencia_pago}</span>
              <button style={botonSuave} onClick={() => abrir('comprobantes-vendedores', d.cuenta_cobro_ruta)}>Cuenta de cobro</button>
              {d.comprobante_ruta && <button style={botonSuave} onClick={() => abrir('comprobantes-vendedores', d.comprobante_ruta)}>Comprobante</button>}
              {d.recibo_ruta
                ? <button style={botonPrimario} onClick={() => abrir('comprobantes-vendedores', d.recibo_ruta)}>Descargar recibo PDF</button>
                : <button style={botonPrimario} disabled={busy} onClick={regenerar}>Generar recibo</button>}
              <button style={botonSuave} onClick={mensaje}>Copiar mensaje para WhatsApp</button>
            </div>
          )}
          {msg && <p role="status" style={{ fontSize: '0.875rem', marginTop: '0.75rem' }}>{msg}</p>}
          <p style={{ ...suave, fontSize: '0.6875rem', marginTop: '0.75rem' }}>El recibo es un soporte interno de pago de comisiones; no reemplaza la cuenta de cobro ni la factura. Una liquidación pagada no se edita: los errores se corrigen con un ajuste en la siguiente.</p>
        </>
      )}
    </Modal>
  )
}
