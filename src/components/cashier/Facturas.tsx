/**
 * Facturas.tsx — facturas de compra con foto (Anexo E).
 * Admin y cajero suben y consultan; solo el admin edita y elimina (también lo exige la base).
 * Las fotos son privadas: se ven con enlaces temporales. La foto es un soporte interno.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { formatCOP } from '../../config/billing'
import { hoyBogota } from '../../services/menuOptions'
import type { Profile } from '../../types'
import {
  MAX_FOTOS, comprimirFoto, crearProveedorRapido, editarFactura, eliminarFactura, enlacesFotos, exportarExcel,
  guardarFactura, listarFacturas, nombresDeUsuarios, pendientes, sincronizarPendientes,
  type Factura, type FacturaPendiente,
} from '../../services/facturas'

interface Proveedor { id: string; nombre: string }

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.875rem', borderRadius: '0.75rem',
  border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)',
  fontSize: '0.9375rem', outline: 'none', fontFamily: 'var(--w-sans)',
}
const btn: React.CSSProperties = {
  border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.875rem',
  borderRadius: '0.75rem', padding: '0.65rem 1rem',
}
const primario: React.CSSProperties = { ...btn, background: 'var(--w-terracotta, #c4552d)', color: '#fff' }
const suave: React.CSSProperties = { ...btn, background: 'var(--w-line)', color: 'var(--w-ink)' }
const label: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 700, color: 'var(--w-ink-soft, #777)', display: 'block', marginBottom: '0.25rem' }

const primeroDeMes = () => hoyBogota().slice(0, 8) + '01'
const fechaCorta = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })

function Modal({ children, onClose, ancho = '34rem' }: { children: React.ReactNode; onClose: () => void; ancho?: string }) {
  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--w-card, #fff)', borderRadius: '1rem', width: '100%', maxWidth: ancho, maxHeight: '92vh', overflowY: 'auto', padding: '1.25rem' }}>
        {children}
      </div>
    </div>
  )
}

function SelectorProveedor({ valor, onChange, proveedores, onCreado }: {
  valor: string; onChange: (id: string) => void; proveedores: Proveedor[]; onCreado: (p: Proveedor) => void
}) {
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const crear = async () => {
    if (!nombre.trim()) return
    try {
      const p = await crearProveedorRapido(nombre)
      onCreado(p); onChange(p.id); setCreando(false); setNombre('')
    } catch (e) { message.error((e as Error).message) }
  }
  if (creando) {
    return (
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        <input style={input} value={nombre} maxLength={120} placeholder="Nombre del proveedor nuevo" onChange={e => setNombre(e.target.value)} />
        <button type="button" style={primario} onClick={crear}>Crear</button>
        <button type="button" style={suave} onClick={() => setCreando(false)}>×</button>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: '0.375rem' }}>
      <select style={input} value={valor} onChange={e => onChange(e.target.value)} aria-label="Proveedor">
        <option value="">Sin proveedor</option>
        {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <button type="button" style={suave} onClick={() => setCreando(true)}>+ Nuevo</button>
    </div>
  )
}

// ─── Subir una factura ───────────────────────────────────────────────────────

function SubirFactura({ rid, proveedores, onProveedor, onClose, onHecho }: {
  rid: string; proveedores: Proveedor[]; onProveedor: (p: Proveedor) => void; onClose: () => void; onHecho: () => void
}) {
  const [fotos, setFotos] = useState<{ blob: Blob; url: string }[]>([])
  const [fecha, setFecha] = useState(hoyBogota())
  const [proveedorId, setProveedorId] = useState('')
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [gasto, setGasto] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])
  useEffect(() => () => { urls.current.forEach(u => URL.revokeObjectURL(u)) }, [])

  const agregar = async (lista: FileList | null) => {
    if (!lista || lista.length === 0) return
    setProcesando(true)
    try {
      const nuevas: { blob: Blob; url: string }[] = []
      for (const f of Array.from(lista)) {
        if (fotos.length + nuevas.length >= MAX_FOTOS) { message.warning(`Máximo ${MAX_FOTOS} fotos por factura`); break }
        const blob = await comprimirFoto(f)
        const url = URL.createObjectURL(blob)
        urls.current.push(url)
        nuevas.push({ blob, url })
      }
      setFotos(prev => [...prev, ...nuevas])
    } catch (e) { message.error((e as Error).message) }
    setProcesando(false)
  }

  const guardar = async () => {
    const valor = Number(monto.replace(/[^\d.]/g, ''))
    if (fotos.length === 0) { message.error('Agrega al menos una foto'); return }
    if (!monto.trim() || !Number.isFinite(valor) || valor < 0) { message.error('Escribe el monto total de la factura'); return }
    if (gasto && valor <= 0) { message.error('Para registrar el gasto el monto debe ser mayor a cero'); return }
    setGuardando(true)
    try {
      const r = await guardarFactura(rid, {
        id: crypto.randomUUID(), fecha, proveedorId: proveedorId || null, monto: valor, nota,
        registrarGasto: gasto, fotos: fotos.map(f => f.blob),
      })
      if (r === 'subida') message.success(gasto ? 'Factura guardada y gasto registrado' : 'Factura guardada')
      else message.warning('Sin internet: la factura quedó en este dispositivo y se subirá sola al volver la señal')
      onHecho(); onClose()
    } catch (e) { message.error('No se pudo guardar: ' + (e as Error).message) }
    setGuardando(false)
  }

  return (
    <Modal onClose={onClose}>
      <h3 style={{ margin: '0 0 0.75rem', fontFamily: 'var(--w-serif, inherit)' }}>Subir factura</h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" style={primario} disabled={procesando} onClick={() => camara.current?.click()}>📷 Tomar foto</button>
        <button type="button" style={suave} disabled={procesando} onClick={() => galeria.current?.click()}>🖼️ Elegir de la galería</button>
        <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={e => { agregar(e.target.files); e.target.value = '' }} />
        <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={e => { agregar(e.target.files); e.target.value = '' }} />
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--w-ink-soft, #777)', margin: '0.5rem 0' }}>
        {procesando ? 'Preparando foto…' : `${fotos.length} de ${MAX_FOTOS} fotos. Si la factura tiene varias páginas, agrégalas todas.`}
      </p>
      {fotos.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {fotos.map((f, i) => (
            <div key={f.url} style={{ position: 'relative', flex: '0 0 auto' }}>
              <img src={f.url} alt={`Página ${i + 1}`} style={{ height: '6rem', borderRadius: '0.5rem', display: 'block' }} />
              <button type="button" aria-label="Quitar foto" onClick={() => setFotos(p => p.filter((_, j) => j !== i))}
                style={{ ...btn, position: 'absolute', top: 2, right: 2, padding: '0.1rem 0.45rem', background: 'rgba(0,0,0,0.65)', color: '#fff' }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: '0.625rem', marginTop: '0.5rem' }}>
        <div><span style={label}>Fecha</span><input style={input} type="date" value={fecha} max={hoyBogota()} onChange={e => setFecha(e.target.value)} /></div>
        <div><span style={label}>Proveedor</span>
          <SelectorProveedor valor={proveedorId} onChange={setProveedorId} proveedores={proveedores} onCreado={onProveedor} /></div>
        <div><span style={label}>Monto total (COP)</span>
          <input style={input} inputMode="numeric" value={monto} placeholder="Ej: 85000" onChange={e => setMonto(e.target.value)} /></div>
        <div><span style={label}>Nota (opcional)</span>
          <input style={input} value={nota} maxLength={500} placeholder="Ej: compra de frutas de la semana" onChange={e => setNota(e.target.value)} /></div>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
          <input type="checkbox" checked={gasto} onChange={e => setGasto(e.target.checked)} />
          Registrar también como gasto de caja
        </label>
      </div>
      <p style={{ fontSize: '0.6875rem', color: 'var(--w-ink-soft, #777)', margin: '0.75rem 0' }}>
        La foto es un soporte interno; no reemplaza la factura electrónica ni el soporte contable que exige la DIAN.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button type="button" style={suave} onClick={onClose}>Cancelar</button>
        <button type="button" style={primario} disabled={guardando || procesando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar factura'}</button>
      </div>
    </Modal>
  )
}

// ─── Detalle, zoom, edición y eliminación ────────────────────────────────────

function DetalleFactura({ f, esAdmin, proveedores, onProveedor, enlaces, quien, onClose, onCambio }: {
  f: Factura; esAdmin: boolean; proveedores: Proveedor[]; onProveedor: (p: Proveedor) => void
  enlaces: Record<string, string>; quien: string; onClose: () => void; onCambio: () => void
}) {
  const [zoom, setZoom] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [fecha, setFecha] = useState(f.fecha)
  const [proveedorId, setProveedorId] = useState(f.proveedor_id ?? '')
  const [monto, setMonto] = useState(String(f.monto))
  const [nota, setNota] = useState(f.nota ?? '')
  const [ocupado, setOcupado] = useState(false)

  const guardar = async () => {
    const valor = Number(monto.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(valor) || valor < 0) { message.error('Monto inválido'); return }
    setOcupado(true)
    try {
      await editarFactura({ id: f.id, fecha, proveedorId: proveedorId || null, monto: valor, nota })
      message.success('Factura actualizada'); onCambio(); onClose()
    } catch (e) { message.error((e as Error).message) }
    setOcupado(false)
  }
  const borrar = async () => {
    if (!window.confirm('¿Eliminar esta factura y sus fotos? No se puede deshacer. El gasto de caja, si lo hubo, se conserva.')) return
    setOcupado(true)
    try { await eliminarFactura(f); message.success('Factura eliminada'); onCambio(); onClose() }
    catch (e) { message.error((e as Error).message) }
    setOcupado(false)
  }

  return (
    <Modal onClose={onClose} ancho="46rem">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--w-serif, inherit)' }}>{f.proveedor_nombre ?? 'Sin proveedor'} · {formatCOP(f.monto)}</h3>
        <button type="button" style={suave} onClick={onClose}>Cerrar</button>
      </div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--w-ink-soft, #777)', margin: '0.25rem 0 0.75rem' }}>
        {fechaCorta(f.fecha)}{quien ? ` · subida por ${quien}` : ''}{f.gasto_id ? ' · registrada como gasto de caja' : ''}
        {f.nota ? <><br />{f.nota}</> : null}
      </p>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {f.fotos.map((ruta, i) => enlaces[ruta] ? (
          <div key={ruta}>
            <div style={{ overflow: 'auto', maxHeight: zoom === ruta ? '70vh' : undefined, borderRadius: '0.5rem', border: '1px solid var(--w-line)' }}>
              <img src={enlaces[ruta]} alt={`Factura, página ${i + 1}`} onClick={() => setZoom(z => z === ruta ? null : ruta)}
                style={{ display: 'block', width: zoom === ruta ? '220%' : '100%', maxWidth: zoom === ruta ? 'none' : '100%', cursor: zoom === ruta ? 'zoom-out' : 'zoom-in' }} />
            </div>
            <a href={enlaces[ruta]} download={`factura-${f.fecha}-${i + 1}.jpg`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '0.75rem', color: 'var(--w-terracotta, #c4552d)' }}>Descargar foto {f.fotos.length > 1 ? i + 1 : ''}</a>
          </div>
        ) : <p key={ruta} style={{ fontSize: '0.8125rem' }}>No pude cargar la foto {i + 1}.</p>)}
      </div>
      {esAdmin && !editando && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="button" style={suave} onClick={() => setEditando(true)}>Editar datos</button>
          <button type="button" style={{ ...btn, background: '#b3261e', color: '#fff' }} disabled={ocupado} onClick={borrar}>Eliminar</button>
        </div>
      )}
      {esAdmin && editando && (
        <div style={{ display: 'grid', gap: '0.625rem', marginTop: '1rem' }}>
          <div><span style={label}>Fecha</span><input style={input} type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></div>
          <div><span style={label}>Proveedor</span>
            <SelectorProveedor valor={proveedorId} onChange={setProveedorId} proveedores={proveedores} onCreado={onProveedor} /></div>
          <div><span style={label}>Monto total (COP)</span><input style={input} inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} /></div>
          <div><span style={label}>Nota</span><input style={input} value={nota} maxLength={500} onChange={e => setNota(e.target.value)} /></div>
          {f.gasto_id && <p style={{ fontSize: '0.75rem', margin: 0 }}>Esta factura tiene un gasto de caja: el cambio de monto y proveedor también se aplica al gasto.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" style={suave} onClick={() => setEditando(false)}>Cancelar</button>
            <button type="button" style={primario} disabled={ocupado} onClick={guardar}>Guardar cambios</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Pantalla principal ──────────────────────────────────────────────────────

export function Facturas({ profile }: { profile: Profile }) {
  const esAdmin = profile.role === 'admin'
  const [rid, setRid] = useState<string | null>(null)
  const [desde, setDesde] = useState(primeroDeMes())
  const [hasta, setHasta] = useState(hoyBogota())
  const [filtroProv, setFiltroProv] = useState('')
  const [minMonto, setMinMonto] = useState('')
  const [maxMonto, setMaxMonto] = useState('')
  const [lista, setLista] = useState<Factura[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [enlaces, setEnlaces] = useState<Record<string, string>>({})
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [cola, setCola] = useState<FacturaPendiente[]>([])
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [abierta, setAbierta] = useState<Factura | null>(null)
  const [subir, setSubir] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('restaurant_id').eq('id', profile.id).maybeSingle()
      .then(({ data }) => setRid((data?.restaurant_id as string | null) ?? null))
    supabase.from('proveedores').select('id, nombre').order('nombre').then(({ data }) => setProveedores((data ?? []) as Proveedor[]))
  }, [profile.id])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const filas = await listarFacturas(desde, hasta)
      setLista(filas)
      setCola(await pendientes.listar())
      const [links, quien] = await Promise.all([
        enlacesFotos(filas.map(f => f.fotos[0]).filter(Boolean)),
        nombresDeUsuarios([...new Set(filas.map(f => f.registrado_por).filter((x): x is string => !!x))]),
      ])
      setEnlaces(prev => ({ ...prev, ...links }))
      setNombres(quien)
    } catch (e) { message.error('No pude cargar las facturas: ' + (e as Error).message) }
    setCargando(false)
  }, [desde, hasta])

  useEffect(() => { cargar() }, [cargar])

  const subirPendientes = useCallback(async () => {
    setSubiendo(true)
    const { subidas, fallidas } = await sincronizarPendientes()
    setSubiendo(false)
    if (subidas > 0) message.success(`${subidas} factura(s) pendiente(s) subida(s)`)
    if (fallidas > 0) message.error(`${fallidas} factura(s) fueron rechazadas; revisa el detalle en el aviso amarillo`)
    cargar()
  }, [cargar])

  useEffect(() => {
    const alVolver = () => { subirPendientes() }
    window.addEventListener('online', alVolver)
    if (navigator.onLine) pendientes.listar().then(c => { if (c.length > 0) subirPendientes() })
    return () => window.removeEventListener('online', alVolver)
  }, [subirPendientes])

  const visibles = useMemo(() => lista.filter(f =>
    (!filtroProv || f.proveedor_id === filtroProv) &&
    (!minMonto || f.monto >= Number(minMonto)) &&
    (!maxMonto || f.monto <= Number(maxMonto))), [lista, filtroProv, minMonto, maxMonto])
  const total = visibles.reduce((s, f) => s + f.monto, 0)

  const abrir = async (f: Factura) => {
    try { const links = await enlacesFotos(f.fotos); setEnlaces(prev => ({ ...prev, ...links })); setAbierta(f) }
    catch (e) { message.error((e as Error).message) }
  }
  const sumarProveedor = (p: Proveedor) => setProveedores(prev => [...prev, p].sort((a, b) => a.nombre.localeCompare(b.nombre)))

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--w-serif, inherit)' }}>Facturas de compra</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--w-ink-soft, #777)' }}>
            Soporte interno con foto. No reemplaza la factura electrónica ni el soporte contable de la DIAN.
          </p>
        </div>
        <button type="button" style={primario} disabled={!rid} onClick={() => setSubir(true)}>+ Subir factura</button>
      </div>

      {cola.length > 0 && (
        <div style={{ background: '#fff4d6', color: '#5c4400', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
          <strong>Pendiente de subir ({cola.length}):</strong> estas facturas están guardadas en este dispositivo y se subirán cuando haya señal.
          {cola.filter(c => c.error).map(c => <div key={c.id}>· {fechaCorta(c.fecha)} {formatCOP(c.monto)}: {c.error}</div>)}
          <div style={{ marginTop: '0.5rem' }}>
            <button type="button" style={suave} disabled={subiendo} onClick={subirPendientes}>{subiendo ? 'Subiendo…' : 'Intentar subir ahora'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))', gap: '0.5rem' }}>
        <div><span style={label}>Desde</span><input style={input} type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></div>
        <div><span style={label}>Hasta</span><input style={input} type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} /></div>
        <div><span style={label}>Proveedor</span>
          <select style={input} value={filtroProv} onChange={e => setFiltroProv(e.target.value)} aria-label="Filtrar por proveedor">
            <option value="">Todos</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select></div>
        <div><span style={label}>Monto mínimo</span><input style={input} inputMode="numeric" value={minMonto} onChange={e => setMinMonto(e.target.value.replace(/\D/g, ''))} /></div>
        <div><span style={label}>Monto máximo</span><input style={input} inputMode="numeric" value={maxMonto} onChange={e => setMaxMonto(e.target.value.replace(/\D/g, ''))} /></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <strong>{visibles.length} factura(s) · Total {formatCOP(total)}</strong>
        <button type="button" style={suave} disabled={visibles.length === 0}
          onClick={() => exportarExcel(visibles, nombres, desde, hasta).catch(e => message.error((e as Error).message))}>Descargar Excel</button>
      </div>

      {cargando ? <p>Cargando…</p> : visibles.length === 0 ? (
        <p style={{ color: 'var(--w-ink-soft, #777)' }}>No hay facturas en este periodo. Usa “Subir factura” para guardar la primera.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10.5rem, 1fr))', gap: '0.75rem' }}>
          {visibles.map(f => (
            <button key={f.id} type="button" onClick={() => abrir(f)}
              style={{ textAlign: 'left', padding: 0, cursor: 'pointer', border: '1px solid var(--w-line)', borderRadius: '0.875rem', overflow: 'hidden', background: 'var(--w-card, #fff)', fontFamily: 'var(--w-sans)' }}>
              <div style={{ height: '8rem', background: 'var(--w-line)' }}>
                {enlaces[f.fotos[0]] && <img src={enlaces[f.fotos[0]]} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
              <div style={{ padding: '0.5rem 0.625rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{formatCOP(f.monto)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--w-ink-soft, #777)' }}>
                  {fechaCorta(f.fecha)}<br />{f.proveedor_nombre ?? 'Sin proveedor'}{f.fotos.length > 1 ? ` · ${f.fotos.length} fotos` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {subir && rid && <SubirFactura rid={rid} proveedores={proveedores} onProveedor={sumarProveedor} onClose={() => setSubir(false)} onHecho={cargar} />}
      {abierta && <DetalleFactura f={abierta} esAdmin={esAdmin} proveedores={proveedores} onProveedor={sumarProveedor} enlaces={enlaces}
        quien={abierta.registrado_por ? nombres[abierta.registrado_por] ?? '' : ''} onClose={() => setAbierta(null)} onCambio={cargar} />}
    </div>
  )
}
