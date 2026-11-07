/**
 * ImpresionConfig.tsx — pantalla "Dispositivos e impresión" del administrador (Anexo H, 4).
 * Impresoras (nombre, ancho, copias, qué categorías imprime), cuándo imprimir, encabezado del recibo,
 * cuál es la estación de impresión de ESTE equipo y la página de prueba.
 */
import { ModuleHeader } from '../tasks/ModuleHeader'
import { Tabs } from '../ui/Tabs'
import { Toggle } from '../ui/Toggle'
import { useEffect, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { cargarConfig, esEstacion, guardarConfig, marcarEstacion } from '../../lib/print/config'
import { CONFIG_INICIAL, type ConfigImpresion, type Impresora } from '../../lib/print/configModelo'
import { paginaPrueba } from '../../lib/print/tickets'
import { compartirPdf, imprimirEnNavegador } from '../../lib/print/navegador'

interface Cat { value: string; label: string }
type Tab = 'impresoras' | 'comandas' | 'tickets' | 'estacion'

const campo: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', minHeight: '2.75rem', borderRadius: 'var(--w-r-md)', border: '1px solid var(--w-border-strong)', background: 'var(--w-surface)', color: 'var(--w-text)', fontFamily: 'var(--w-font)', fontSize: '0.9375rem' }
const caja: React.CSSProperties = { background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-r-lg)', padding: '1.125rem', display: 'grid', gap: '0.75rem', boxShadow: 'var(--w-shadow-sm)' }
const titulo: React.CSSProperties = { margin: 0, color: 'var(--w-text)', fontSize: 'var(--w-fs-title)', fontWeight: 700 }
const boton: React.CSSProperties = { border: 'none', cursor: 'pointer', fontFamily: 'var(--w-font)', fontWeight: 700, fontSize: '0.9375rem', borderRadius: 'var(--w-r-md)', padding: '0.7rem 1.1rem', minHeight: '2.75rem' }
const principal: React.CSSProperties = { ...boton, background: 'var(--w-accent)', color: 'var(--w-on-accent)' }
const claro: React.CSSProperties = { ...boton, background: 'var(--w-surface-sunken)', color: 'var(--w-text)', border: '1px solid var(--w-border)' }
const fila: React.CSSProperties = { display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }
const ayuda: React.CSSProperties = { display: 'block', fontWeight: 400, fontSize: '0.8125rem', color: 'var(--w-text-3)' }
const nuevoId = () => 'imp' + Math.random().toString(36).slice(2, 8)

const ico = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const D_IMPRESORA = 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z'

export function ImpresionConfig() {
  const [cfg, setCfg] = useState<ConfigImpresion | null>(null)
  const [cats, setCats] = useState<Cat[]>([])
  const [estacion, setEstacion] = useState(esEstacion())
  const [guardando, setGuardando] = useState(false)
  const [tab, setTab] = useState<Tab>('impresoras')

  useEffect(() => {
    (async () => {
      setCfg(await cargarConfig())
      const { data } = await supabase.from('restaurant_config').select('modules_enabled').maybeSingle()
      const lista = ((data?.modules_enabled as { categories?: { value?: string; label?: string }[] } | null)?.categories ?? [])
        .map(c => ({ value: c.value ?? c.label ?? '', label: c.label ?? c.value ?? '' })).filter(c => c.value)
      setCats(lista)
    })()
  }, [])

  if (!cfg) return <p>Cargando…</p>
  const cambiar = (p: Partial<ConfigImpresion>) => setCfg(c => (c ? { ...c, ...p } : c))
  const cambiarImp = (id: string, p: Partial<Impresora>) => cambiar({ impresoras: cfg.impresoras.map(i => (i.id === id ? { ...i, ...p } : i)) })

  const guardar = async () => {
    setGuardando(true)
    const err = await guardarConfig(cfg)
    setGuardando(false)
    if (err) message.error('No se pudo guardar: ' + err); else message.success('Configuración de impresión guardada')
  }
  const probar = async (imp: Impresora) => {
    try { await imprimirEnNavegador(paginaPrueba(imp.ancho, imp.nombre)) } catch { message.error('No se pudo abrir la impresión. Prueba con el PDF.') }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: '1rem', fontFamily: 'var(--w-font)' }}>
      <ModuleHeader
        icon={ico(D_IMPRESORA)}
        title="Dispositivos e impresión"
        subtitle="Configura tus impresoras, destinos y formatos. Funciona con cualquier impresora instalada en el equipo (térmica de 58 u 80 mm o normal); siempre puedes guardar el PDF o enviarlo por WhatsApp."
      />
      <Tabs label="Secciones de impresión" value={tab} onChange={setTab} items={[
        { key: 'impresoras', label: 'Impresoras', icon: ico(D_IMPRESORA) },
        { key: 'comandas', label: 'Comandas', icon: ico('M5 4h14v16H5zM9 9h6M9 13h6') },
        { key: 'tickets', label: 'Tickets', icon: ico('M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6') },
        { key: 'estacion', label: 'Este equipo', icon: ico('M4 5h16v11H4zM8 20h8M12 16v4') },
      ]} />

      {tab === 'impresoras' && (
        <div style={caja}>
          <h3 style={titulo}>Impresoras conectadas ({cfg.impresoras.length})</h3>
          {cfg.impresoras.length === 0 && <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--w-text-3)' }}>Aún no hay ninguna. Agrega una por cada lugar donde salen comandas (por ejemplo Cocina y Barra).</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.75rem' }}>
            {cfg.impresoras.map(imp => (
              <div key={imp.id} style={{ border: '1px solid var(--w-border)', borderRadius: 'var(--w-r-lg)', padding: '0.875rem', display: 'grid', gap: '0.625rem', background: 'var(--w-bg)' }}>
                <div style={{ ...fila, justifyContent: 'flex-start' }}>
                  <span aria-hidden style={{ width: 40, height: 40, borderRadius: 'var(--w-r-md)', background: 'var(--w-accent-soft)', color: 'var(--w-accent-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ width: 22, height: 22, display: 'inline-flex' }}>{ico(D_IMPRESORA)}</span>
                  </span>
                  <input style={campo} value={imp.nombre} maxLength={40} aria-label="Nombre de la impresora" placeholder="Nombre (Cocina, Barra…)" onChange={e => cambiarImp(imp.id, { nombre: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))', gap: '0.5rem' }}>
                  <select style={campo} value={imp.ancho} aria-label="Ancho del papel" onChange={e => cambiarImp(imp.id, { ancho: Number(e.target.value) === 80 ? 80 : 58 })}>
                    <option value={58}>Papel de 58 mm</option><option value={80}>Papel de 80 mm</option>
                  </select>
                  <select style={campo} value={imp.copias} aria-label="Copias" onChange={e => cambiarImp(imp.id, { copias: Number(e.target.value) })}>
                    {[1, 2, 3].map(n => <option key={n} value={n}>{n} {n === 1 ? 'copia' : 'copias'}</option>)}
                  </select>
                </div>
                <div>
                  <p style={{ margin: '0 0 0.375rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--w-text)' }}>
                    Qué categorías imprime {imp.categorias.length === 0 && <span style={{ fontWeight: 500, color: 'var(--w-text-3)' }}>(ninguna marcada = todo lo demás)</span>}
                  </p>
                  <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                    {cats.length === 0 && <span style={{ fontSize: '0.8125rem', color: 'var(--w-text-3)' }}>Tu menú aún no tiene categorías.</span>}
                    {cats.map(c => {
                      const on = imp.categorias.includes(c.value)
                      return (
                        <button key={c.value} type="button" aria-pressed={on} onClick={() => cambiarImp(imp.id, { categorias: on ? imp.categorias.filter(x => x !== c.value) : [...imp.categorias, c.value] })}
                          style={{ border: `1px solid ${on ? 'var(--w-accent)' : 'var(--w-border)'}`, background: on ? 'var(--w-accent)' : 'var(--w-surface)', color: on ? 'var(--w-on-accent)' : 'var(--w-text)', borderRadius: '999px', padding: '0.4rem 0.85rem', minHeight: '2.5rem', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div style={{ ...fila, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                    <Toggle checked={imp.activa} onChange={v => cambiarImp(imp.id, { activa: v })} label={'Activa: ' + imp.nombre} />
                    {imp.activa ? 'Activa' : 'Inactiva'}
                  </span>
                  <button style={{ ...claro, color: 'var(--w-danger-text)' }} onClick={() => cambiar({ impresoras: cfg.impresoras.filter(i => i.id !== imp.id) })}>Quitar</button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button style={claro} onClick={() => void probar(imp)}>Imprimir página de prueba</button>
                  <button style={claro} onClick={() => void compartirPdf(paginaPrueba(imp.ancho, imp.nombre), 'prueba-impresora')}>PDF de prueba</button>
                </div>
              </div>
            ))}
          </div>
          <div><button style={principal} disabled={cfg.impresoras.length >= 12} onClick={() => cambiar({ impresoras: [...cfg.impresoras, { id: nuevoId(), nombre: cfg.impresoras.length === 0 ? 'Cocina' : `Impresora ${cfg.impresoras.length + 1}`, ancho: 58, activa: true, categorias: [], copias: 1 }] })}>+ Agregar impresora</button></div>
        </div>
      )}

      {tab === 'comandas' && (
        <div style={caja}>
          <h3 style={titulo}>Impresión de comandas</h3>
          <div style={fila}>
            <span style={{ fontWeight: 600 }}>Imprimir la comanda sola cuando llega un pedido nuevo
              <span style={ayuda}>Solo lo hace el equipo marcado como estación de impresión. Si no, la comanda se imprime con un botón.</span>
            </span>
            <Toggle checked={cfg.comandaAutomatica} onChange={v => cambiar({ comandaAutomatica: v })} label="Imprimir comandas automáticamente" />
          </div>
        </div>
      )}

      {tab === 'tickets' && (
        <>
          <div style={caja}>
            <h3 style={titulo}>Recibo y pre-cuenta</h3>
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
            <h3 style={titulo}>Encabezado y pie del recibo</h3>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--w-text-3)' }}>El nombre, la razón social, el NIT, la dirección y el teléfono salen de los datos de tu restaurante (asistente de configuración).</p>
            <label style={{ display: 'grid', gap: '0.25rem', fontWeight: 600, fontSize: '0.875rem' }}>Mensaje de agradecimiento
              <input style={campo} maxLength={120} value={cfg.mensaje} onChange={e => cambiar({ mensaje: e.target.value })} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem', fontWeight: 600, fontSize: '0.875rem' }}>Pie legal
              <input style={campo} maxLength={160} value={cfg.pie} placeholder="Recibo de pago, no es factura electrónica" onChange={e => cambiar({ pie: e.target.value })} />
              <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--w-text-3)' }}>Déjalo vacío para usar el texto por defecto. Mientras no tengas facturación electrónica, el recibo debe decir que no es factura.</span>
            </label>
          </div>
        </>
      )}

      {tab === 'estacion' && (
        <div style={caja}>
          <h3 style={titulo}>Este equipo</h3>
          <div style={fila}>
            <span style={{ fontWeight: 600 }}>Este equipo es la estación de impresión
              <span style={ayuda}>Marca solo UN equipo (por ejemplo la tablet o el computador de la cocina) y déjalo con la app abierta. Se guarda en este equipo.</span>
            </span>
            <Toggle checked={estacion} onChange={v => { setEstacion(v); marcarEstacion(v) }} label="Este equipo es la estación de impresión" />
          </div>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--w-text-3)' }}>
            La impresión usa el diálogo del navegador: pedirá confirmar cada vez, salvo que abras el navegador en modo quiosco. La impresión rápida sin diálogo por USB o Bluetooth llegará cuando se pruebe con una impresora real.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <button style={{ ...principal, width: '100%', opacity: guardando ? 0.7 : 1 }} disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar cambios ✓'}</button>
        <button style={claro} onClick={() => setCfg(CONFIG_INICIAL)}>Empezar de cero</button>
      </div>
    </div>
  )
}
