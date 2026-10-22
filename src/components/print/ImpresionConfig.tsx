/**
 * ImpresionConfig.tsx — pantalla "Impresión" del administrador (Anexo H, 4).
 * Impresoras (nombre, ancho, copias, qué categorías imprime), cuándo imprimir, encabezado del recibo,
 * cuál es la estación de impresión de ESTE equipo y la página de prueba.
 */
import { useEffect, useRef, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { cargarConfig, esEstacion, guardarConfig, marcarEstacion } from '../../lib/print/config'
import { CONFIG_INICIAL, type ConfigImpresion, type Impresora } from '../../lib/print/configModelo'
import { paginaPrueba } from '../../lib/print/tickets'
import { compartirPdf, imprimirEnNavegador } from '../../lib/print/navegador'

interface Cat { value: string; label: string }

const campo: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', minHeight: '2.75rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', fontSize: '0.9375rem' }
const caja: React.CSSProperties = { background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '1.125rem', display: 'grid', gap: '0.75rem' }
const boton: React.CSSProperties = { border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', borderRadius: '0.75rem', padding: '0.7rem 1.1rem', minHeight: '2.75rem' }
const principal: React.CSSProperties = { ...boton, background: 'var(--w-terra)', color: '#fff' }
const claro: React.CSSProperties = { ...boton, background: 'var(--w-bg)', color: 'var(--w-ink)', border: '1px solid var(--w-line)' }
const nuevoId = () => 'imp' + Math.random().toString(36).slice(2, 8)

export function ImpresionConfig() {
  const [cfg, setCfg] = useState<ConfigImpresion | null>(null)
  const [cats, setCats] = useState<Cat[]>([])
  const [estacion, setEstacion] = useState(esEstacion())
  const [guardando, setGuardando] = useState(false)
  const lockGuardar = useRef(false)

  useEffect(() => {
    (async () => {
      setCfg(await cargarConfig())
      const { data, error } = await supabase.from('restaurant_config').select('modules_enabled').maybeSingle()
      if (error) message.error('No se pudieron leer las categorías: ' + error.message)
      const lista = ((data?.modules_enabled as { categories?: { value?: string; label?: string }[] } | null)?.categories ?? [])
        .map(c => ({ value: c.value ?? c.label ?? '', label: c.label ?? c.value ?? '' })).filter(c => c.value)
      setCats(lista)
    })()
  }, [])

  if (!cfg) return <p>Cargando…</p>
  const cambiar = (p: Partial<ConfigImpresion>) => setCfg(c => (c ? { ...c, ...p } : c))
  const cambiarImp = (id: string, p: Partial<Impresora>) => cambiar({ impresoras: cfg.impresoras.map(i => (i.id === id ? { ...i, ...p } : i)) })

  const guardar = async () => {
    if (lockGuardar.current) return
    lockGuardar.current = true
    setGuardando(true)
    const err = await guardarConfig(cfg).finally(() => { lockGuardar.current = false; setGuardando(false) })
    if (err) message.error('No se pudo guardar: ' + err); else message.success('Configuración de impresión guardada')
  }
  const probar = async (imp: Impresora) => {
    try { await imprimirEnNavegador(paginaPrueba(imp.ancho, imp.nombre)) } catch { message.error('No se pudo abrir la impresión. Prueba con el PDF.') }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: '1rem', fontFamily: 'var(--w-sans)' }}>
      <div>
        <h2 className="ed-display" style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, color: 'var(--w-ink)' }}>Impresión</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--w-ink-mut)', margin: '0.25rem 0 0' }}>
          Comandas para cocina o barra, pre-cuenta y recibo. Funciona con cualquier impresora que ya tengas instalada en el equipo (térmica de 58 u 80 mm o normal) y siempre puedes guardar el PDF o enviarlo por WhatsApp.
        </p>
      </div>

      <div style={caja}>
        <h3 style={{ margin: 0, color: 'var(--w-ink)' }}>Impresoras</h3>
        {cfg.impresoras.length === 0 && <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>Aún no hay ninguna. Agrega una por cada lugar donde salen comandas (por ejemplo Cocina y Barra).</p>}
        {cfg.impresoras.map(imp => (
          <div key={imp.id} style={{ border: '1px solid var(--w-line)', borderRadius: '1rem', padding: '0.875rem', display: 'grid', gap: '0.625rem', background: 'var(--w-bg)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))', gap: '0.5rem' }}>
              <input style={campo} value={imp.nombre} maxLength={40} aria-label="Nombre de la impresora" placeholder="Nombre (Cocina, Barra…)" onChange={e => cambiarImp(imp.id, { nombre: e.target.value })} />
              <select style={campo} value={imp.ancho} aria-label="Ancho del papel" onChange={e => cambiarImp(imp.id, { ancho: Number(e.target.value) === 80 ? 80 : 58 })}>
                <option value={58}>Papel de 58 mm</option><option value={80}>Papel de 80 mm</option>
              </select>
              <select style={campo} value={imp.copias} aria-label="Copias" onChange={e => cambiarImp(imp.id, { copias: Number(e.target.value) })}>
                {[1, 2, 3].map(n => <option key={n} value={n}>{n} {n === 1 ? 'copia' : 'copias'}</option>)}
              </select>
            </div>
            <div>
              <p style={{ margin: '0 0 0.375rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--w-ink)' }}>
                Qué categorías imprime {imp.categorias.length === 0 && <span style={{ fontWeight: 500, color: 'var(--w-ink-mut)' }}>(ninguna marcada = todo lo demás)</span>}
              </p>
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {cats.length === 0 && <span style={{ fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>Tu menú aún no tiene categorías.</span>}
                {cats.map(c => {
                  const on = imp.categorias.includes(c.value)
                  return (
                    <button key={c.value} type="button" aria-pressed={on} onClick={() => cambiarImp(imp.id, { categorias: on ? imp.categorias.filter(x => x !== c.value) : [...imp.categorias, c.value] })}
                      style={{ border: `1px solid ${on ? 'var(--w-terra)' : 'var(--w-line)'}`, background: on ? 'var(--w-terra)' : 'var(--w-surface)', color: on ? '#fff' : 'var(--w-ink)', borderRadius: '999px', padding: '0.4rem 0.85rem', minHeight: '2.5rem', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 600, minHeight: '2.75rem' }}>
                <input type="checkbox" checked={imp.activa} onChange={e => cambiarImp(imp.id, { activa: e.target.checked })} style={{ width: '1.25rem', height: '1.25rem' }} /> Activa
              </label>
              <button style={claro} onClick={() => void probar(imp)}>Imprimir página de prueba</button>
              <button style={claro} onClick={() => void compartirPdf(paginaPrueba(imp.ancho, imp.nombre), 'prueba-impresora')}>PDF de prueba</button>
              <button style={{ ...claro, color: 'var(--w-wine)', marginLeft: 'auto' }} onClick={() => cambiar({ impresoras: cfg.impresoras.filter(i => i.id !== imp.id) })}>Quitar</button>
            </div>
          </div>
        ))}
        <div><button style={claro} disabled={cfg.impresoras.length >= 12} onClick={() => cambiar({ impresoras: [...cfg.impresoras, { id: nuevoId(), nombre: cfg.impresoras.length === 0 ? 'Cocina' : `Impresora ${cfg.impresoras.length + 1}`, ancho: 58, activa: true, categorias: [], copias: 1 }] })}>+ Agregar impresora</button></div>
      </div>

      <div style={caja}>
        <h3 style={{ margin: 0, color: 'var(--w-ink)' }}>Cuándo imprimir</h3>
        <label style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', fontWeight: 600 }}>
          <input type="checkbox" checked={cfg.comandaAutomatica} onChange={e => cambiar({ comandaAutomatica: e.target.checked })} style={{ width: '1.25rem', height: '1.25rem', marginTop: '0.125rem' }} />
          <span>Imprimir la comanda sola cuando llega un pedido nuevo
            <span style={{ display: 'block', fontWeight: 400, fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>Solo lo hace el equipo marcado como estación de impresión (más abajo). Si no, la comanda se imprime con un botón.</span>
          </span>
        </label>
        <label style={{ display: 'grid', gap: '0.25rem', fontWeight: 600, fontSize: '0.875rem' }}>Recibo al cobrar
          <select style={campo} value={cfg.recibo} onChange={e => cambiar({ recibo: e.target.value as ConfigImpresion['recibo'] })}>
            <option value="preguntar">Preguntar cada vez</option><option value="siempre">Imprimir siempre</option><option value="nunca">No imprimir (solo si lo piden)</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: '0.25rem', fontWeight: 600, fontSize: '0.875rem' }}>Papel del recibo y de la pre-cuenta (impresora de caja)
          <select style={campo} value={cfg.anchoRecibo} onChange={e => cambiar({ anchoRecibo: Number(e.target.value) === 58 ? 58 : 80 })}>
            <option value={80}>80 mm</option><option value={58}>58 mm</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: '0.25rem', fontWeight: 600, fontSize: '0.875rem' }}>Propina sugerida en la pre-cuenta (% — 0 para no mostrarla; nunca es obligatoria)
          <input style={{ ...campo, maxWidth: '8rem' }} type="number" min={0} max={30} value={cfg.propinaSugeridaPct} onChange={e => cambiar({ propinaSugeridaPct: Number(e.target.value) })} />
        </label>
      </div>

      <div style={caja}>
        <h3 style={{ margin: 0, color: 'var(--w-ink)' }}>Encabezado y pie del recibo</h3>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>El nombre, la razón social, el NIT, la dirección y el teléfono salen de los datos de tu restaurante (asistente de configuración).</p>
        <label style={{ display: 'grid', gap: '0.25rem', fontWeight: 600, fontSize: '0.875rem' }}>Mensaje de agradecimiento
          <input style={campo} maxLength={120} value={cfg.mensaje} onChange={e => cambiar({ mensaje: e.target.value })} />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem', fontWeight: 600, fontSize: '0.875rem' }}>Pie legal
          <input style={campo} maxLength={160} value={cfg.pie} placeholder="Recibo de pago, no es factura electrónica" onChange={e => cambiar({ pie: e.target.value })} />
          <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--w-ink-mut)' }}>Déjalo vacío para usar el texto por defecto. Mientras no tengas facturación electrónica, el recibo debe decir que no es factura.</span>
        </label>
      </div>

      <div style={caja}>
        <h3 style={{ margin: 0, color: 'var(--w-ink)' }}>Este equipo</h3>
        <label style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', fontWeight: 600 }}>
          <input type="checkbox" checked={estacion} onChange={e => { setEstacion(e.target.checked); marcarEstacion(e.target.checked) }} style={{ width: '1.25rem', height: '1.25rem', marginTop: '0.125rem' }} />
          <span>Este equipo es la estación de impresión
            <span style={{ display: 'block', fontWeight: 400, fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>Marca solo UN equipo (por ejemplo la tablet o el computador de la cocina) y déjalo con la app abierta. Se guarda en este equipo.</span>
          </span>
        </label>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>
          La impresión usa el diálogo del navegador: pedirá confirmar cada vez, salvo que abras el navegador en modo quiosco. La impresión rápida sin diálogo por USB o Bluetooth llegará cuando se pruebe con una impresora real.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button style={{ ...principal, opacity: guardando ? 0.7 : 1 }} disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar configuración'}</button>
        <button style={claro} onClick={() => setCfg(CONFIG_INICIAL)}>Empezar de cero</button>
      </div>
    </div>
  )
}
