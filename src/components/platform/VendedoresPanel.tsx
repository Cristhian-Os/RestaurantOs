/**
 * VendedoresPanel.tsx — vendedores y aliados con su contrato (Anexo C, 5.1 y 6.3).
 * El código es el identificador del contrato firmado: sin contrato adjunto no se crea ni se activa. Todo cambio pide motivo y queda
 * en el registro de cambios. Los vendedores no tienen acceso a la app; aquí solo ves tú.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Campo, Modal, abrirPrivado, boton, botonPrimario, botonSuave, campo, cop, fechaCorta, subirPrivado, suave, tarjeta } from './platformUi'

interface Vendedor {
  id: string; tipo: 'vendedor' | 'aliado'; nombre: string; codigo: string; correo: string | null; telefono: string | null; documento: string | null
  activo: boolean; contrato_ruta: string | null; contrato_version: string | null; firmado_at: string | null; vigente_hasta: string | null
  terminos: { bono_meses?: number; recurrente_pct?: number; recurrente_meses?: number } | null
  motivo_estado: string | null; causa_estado: string | null; medio_pago: string | null; datos_pago: string | null; notas: string | null
  restaurantes: number; restaurantes_activos: number; prospectos: number; por_pagar_cop: number; codigo_en_uso: boolean
}
interface Ajuste { clave: string; valor: number; descripcion: string | null }
interface Prospecto { id: string; vendedor_id: string; nombre_negocio: string; ciudad: string | null; contacto: string | null; etapa: string; fecha_registro: string; vence_at: string }

const ETAPAS = ['prospecto', 'demo', 'prueba', 'cerrado', 'perdido']
const VACIO = {
  tipo: 'vendedor', nombre: '', codigo: '', correo: '', telefono: '', documento: '', medio_pago: '', datos_pago: '', notas: '',
  contrato_version: '', firmado_at: '', vigente_hasta: '', condiciones: false, bono_meses: '1', recurrente_pct: '10', recurrente_meses: '12', motivo: '',
}

export function VendedoresPanel() {
  const [lista, setLista] = useState<Vendedor[] | null>(null)
  const [ajustes, setAjustes] = useState<Ajuste[]>([])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState<{ id: string | null; orig: Vendedor | null } | null>(null)
  const [estado, setEstado] = useState<Vendedor | null>(null)
  const [prosp, setProsp] = useState<Vendedor | null>(null)
  const [editAjuste, setEditAjuste] = useState<Record<string, string>>({})
  const [motivoAjuste, setMotivoAjuste] = useState('')

  const cargar = useCallback(async () => {
    const [v, s] = await Promise.all([supabase.rpc('plataforma_vendedores_listar'), supabase.rpc('plataforma_settings_listar')])
    if (v.error) { setError(v.error.message); return }
    setLista((v.data as Vendedor[]) ?? [])
    if (s.error) { setMsg('No se pudieron cargar las condiciones generales: ' + s.error.message); return }
    setAjustes((s.data as Ajuste[]) ?? [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardarAjuste = async (a: Ajuste) => {
    const crudo = (editAjuste[a.clave] ?? '').trim().replace(',', '.')
    // Un campo vacío no es 0: no se guarda nada
    if (crudo === '') { setMsg('Escribe un valor para esta condición'); return }
    const nuevo = Number(crudo)
    if (!Number.isFinite(nuevo) || nuevo < 0) { setMsg('El valor debe ser un número mayor o igual a 0'); return }
    if (/pct|porcentaje|%/i.test(a.clave + ' ' + (a.descripcion ?? '')) && nuevo > 100) { setMsg('Un porcentaje va entre 0 y 100'); return }
    const { error: e } = await supabase.rpc('plataforma_settings_guardar', { p_clave: a.clave, p_valor: nuevo, p_motivo: motivoAjuste })
    if (e) { setMsg(e.message); return }
    setEditAjuste(x => { const c = { ...x }; delete c[a.clave]; return c }); setMotivoAjuste(''); setMsg('Condición guardada'); cargar()
  }
  const copiar = (v: Vendedor) => {
    const url = `${window.location.origin}/registro?v=${v.codigo}`
    navigator.clipboard?.writeText(url).then(() => setMsg(`Enlace copiado: ${url}`)).catch(() => setMsg(`No se pudo copiar. Enlace: ${url}`))
  }
  const verContrato = (v: Vendedor) => v.contrato_ruta && abrirPrivado('contratos-vendedores', v.contrato_ruta).catch(e => setMsg((e as Error).message))

  if (error) return <div style={{ ...tarjeta, color: 'var(--tag-red-text, #b91c1c)' }}>No se pudo cargar: {error}</div>
  if (!lista) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Vendedores y aliados</h2>
          <p style={{ ...suave, margin: '0.25rem 0 0' }}>Cada código pertenece a un contrato firmado. Trabajan en su tiempo libre y solo ganan comisiones; aquí no hay metas ni horarios.</p>
        </div>
        <button style={botonPrimario} onClick={() => setForm({ id: null, orig: null })}>+ Nuevo vendedor o aliado</button>
      </div>
      {msg && <div role="status" style={{ ...tarjeta, padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{msg}</div>}

      {lista.length === 0 && <div style={{ ...tarjeta, ...suave }}>Todavía no hay vendedores ni aliados. Crea el primero con su contrato firmado.</div>}
      {lista.map(v => (
        <div key={v.id} style={{ ...tarjeta, opacity: v.activo ? 1 : 0.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: '1.0625rem' }}>{v.nombre}</strong>{' '}
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '0.1rem 0.5rem', borderRadius: '9999px', background: v.tipo === 'aliado' ? 'var(--tag-purple-bg)' : 'var(--bg-surface, #CDD0DC)' }}>{v.tipo === 'aliado' ? 'ALIADO' : 'VENDEDOR'}</span>{' '}
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '0.1rem 0.5rem', borderRadius: '9999px', background: v.activo ? '#cdeccd' : '#f5cfcf', color: v.activo ? '#1b5e20' : '#8c1d18' }}>{v.activo ? 'CÓDIGO ACTIVO' : 'CÓDIGO INACTIVO'}</span>
              <div style={{ fontSize: '0.9375rem', marginTop: '0.25rem' }}>Código: <strong style={{ fontFamily: 'monospace' }}>{v.codigo}</strong></div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.8125rem' }}>
              <div><strong>{cop(v.por_pagar_cop)}</strong> por pagar</div>
              <div style={suave}>{v.restaurantes} restaurantes ({v.restaurantes_activos} activos) · {v.prospectos} prospectos</div>
            </div>
          </div>
          <div style={{ ...suave, marginTop: '0.5rem' }}>
            Contrato {v.contrato_version ?? '—'} · firmado {fechaCorta(v.firmado_at)} · vigencia {v.vigente_hasta ? `hasta ${fechaCorta(v.vigente_hasta)}` : 'sin vencimiento'}
            {v.terminos && <> · condiciones: {[v.terminos.bono_meses != null && `bono ${v.terminos.bono_meses} mes`, v.terminos.recurrente_pct != null && `${v.terminos.recurrente_pct}% recurrente`, v.terminos.recurrente_meses != null && `${v.terminos.recurrente_meses} meses`].filter(Boolean).join(', ')}</>}
            {!v.activo && v.motivo_estado && <><br />Motivo ({v.causa_estado === 'incumplimiento' ? 'incumplimiento' : 'término normal'}): {v.motivo_estado}</>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <button style={botonSuave} onClick={() => verContrato(v)}>Ver contrato</button>
            <button style={botonSuave} onClick={() => copiar(v)}>Copiar enlace de referido</button>
            <button style={botonSuave} onClick={() => setProsp(v)}>Prospectos</button>
            <button style={botonSuave} onClick={() => setForm({ id: v.id, orig: v })}>Editar</button>
            <button style={{ ...boton, background: v.activo ? '#b3261e' : '#2e7d32', color: '#fff' }} onClick={() => setEstado(v)}>{v.activo ? 'Desactivar código' : 'Activar código'}</button>
          </div>
        </div>
      ))}

      <div style={tarjeta}>
        <h3 style={{ margin: '0 0 0.25rem' }}>Condiciones generales</h3>
        <p style={{ ...suave, margin: '0 0 0.75rem' }}>Valen para contratos nuevos. Los restaurantes ya atribuidos conservan las condiciones con las que llegaron, y las liquidaciones aprobadas no se recalculan.</p>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {ajustes.map(a => (
            <div key={a.clave} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 14rem', fontSize: '0.8125rem' }}>{a.descripcion ?? a.clave}</span>
              <input style={{ ...campo, width: '6rem' }} inputMode="decimal" aria-label={a.clave} value={editAjuste[a.clave] ?? String(a.valor)}
                onChange={e => setEditAjuste(x => ({ ...x, [a.clave]: e.target.value }))} />
              {editAjuste[a.clave] !== undefined && editAjuste[a.clave] !== String(a.valor) && (
                <>
                  <input style={{ ...campo, width: '12rem' }} placeholder="Motivo" value={motivoAjuste} onChange={e => setMotivoAjuste(e.target.value)} />
                  <button style={botonPrimario} onClick={() => guardarAjuste(a)}>Guardar</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {form && <FormularioVendedor id={form.id} orig={form.orig} onClose={() => setForm(null)} onHecho={() => { setForm(null); cargar() }} />}
      {estado && <EstadoCodigo v={estado} onClose={() => setEstado(null)} onHecho={() => { setEstado(null); cargar() }} />}
      {prosp && <Prospectos v={prosp} onClose={() => { setProsp(null); cargar() }} />}
    </div>
  )
}

function FormularioVendedor({ id, orig, onClose, onHecho }: { id: string | null; orig: Vendedor | null; onClose: () => void; onHecho: () => void }) {
  const [f, setF] = useState(orig ? {
    tipo: orig.tipo, nombre: orig.nombre, codigo: orig.codigo, correo: orig.correo ?? '', telefono: orig.telefono ?? '', documento: orig.documento ?? '',
    medio_pago: orig.medio_pago ?? '', datos_pago: orig.datos_pago ?? '', notas: orig.notas ?? '', contrato_version: orig.contrato_version ?? '',
    firmado_at: orig.firmado_at ?? '', vigente_hasta: orig.vigente_hasta ?? '', condiciones: !!orig.terminos,
    bono_meses: String(orig.terminos?.bono_meses ?? 1), recurrente_pct: String(orig.terminos?.recurrente_pct ?? 10), recurrente_meses: String(orig.terminos?.recurrente_meses ?? 12), motivo: '',
  } : VACIO)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const set = (k: keyof typeof VACIO, v: string | boolean) => setF(x => ({ ...x, [k]: v }))

  const guardar = async () => {
    setMsg(null)
    if (f.nombre.trim().length < 2) { setMsg('Escribe el nombre'); return }
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,23}$/.test(f.codigo.trim())) { setMsg('El código usa letras, números y guiones (ejemplo ANA-24)'); return }
    if (!id && (!archivo || !f.contrato_version.trim() || !f.firmado_at)) { setMsg('Sin contrato firmado no se puede crear: adjunta el PDF, la versión y la fecha de firma'); return }
    if (f.condiciones) {
      const campos: [string, string, number][] = [['Meses de bono', f.bono_meses, 120], ['% recurrente', f.recurrente_pct, 100], ['Meses de recurrente', f.recurrente_meses, 120]]
      for (const [nom, val, max] of campos) {
        const t = val.trim().replace(',', '.')
        const n = Number(t)
        if (t === '' || !Number.isFinite(n) || n < 0 || n > max) { setMsg(`${nom}: escribe un número entre 0 y ${max} (no puede quedar vacío)`); return }
      }
    }
    const terminos = f.condiciones ? { bono_meses: Number(f.bono_meses.replace(',', '.')), recurrente_pct: Number(f.recurrente_pct.replace(',', '.')), recurrente_meses: Number(f.recurrente_meses.replace(',', '.')) } : null
    setBusy(true)
    try {
      const datos: Record<string, unknown> = {
        tipo: f.tipo, nombre: f.nombre.trim(), codigo: f.codigo.trim().toUpperCase(), correo: f.correo, telefono: f.telefono, documento: f.documento,
        medio_pago: f.medio_pago, datos_pago: f.datos_pago, notas: f.notas,
      }
      let ruta: string | null = null
      if (archivo) ruta = await subirPrivado('contratos-vendedores', crypto.randomUUID(), archivo, archivo.name)
      if (!id) {
        Object.assign(datos, { contrato_ruta: ruta, contrato_version: f.contrato_version.trim(), firmado_at: f.firmado_at, vigente_hasta: f.vigente_hasta, terminos })
      } else if (orig) {
        // En una edición solo se manda lo que cambió; contrato, condiciones y vigencia exigen motivo.
        const cambios: Record<string, unknown> = {}
        for (const k of ['tipo', 'nombre', 'codigo', 'correo', 'telefono', 'documento', 'medio_pago', 'datos_pago', 'notas'] as const) {
          const antes = (orig as unknown as Record<string, string | null>)[k] ?? ''
          if (String(datos[k] ?? '') !== antes) cambios[k] = datos[k]
        }
        if (ruta) cambios.contrato_ruta = ruta
        if (f.contrato_version !== (orig.contrato_version ?? '')) cambios.contrato_version = f.contrato_version.trim()
        if (f.firmado_at !== (orig.firmado_at ?? '')) cambios.firmado_at = f.firmado_at
        if (f.vigente_hasta !== (orig.vigente_hasta ?? '')) cambios.vigente_hasta = f.vigente_hasta
        if (JSON.stringify(terminos) !== JSON.stringify(orig.terminos)) cambios.terminos = terminos
        if (Object.keys(cambios).length === 0) { setMsg('No hay cambios'); setBusy(false); return }
        Object.keys(datos).forEach(k => delete datos[k]); Object.assign(datos, cambios)
      }
      const { error } = await supabase.rpc('plataforma_vendedor_guardar', { p_id: id, p_datos: datos, p_motivo: f.motivo.trim() || null })
      if (error) throw new Error(error.message)
      onHecho()
    } catch (e) { setMsg((e as Error).message) }
    setBusy(false)
  }

  return (
    <Modal onClose={onClose}>
      <h3 style={{ margin: '0 0 0.75rem' }}>{id ? 'Editar' : 'Nuevo'} vendedor o aliado</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '0.5rem' }}>
        <Campo titulo="Tipo"><select style={campo} value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="vendedor">Vendedor (bono + recurrente)</option><option value="aliado">Aliado (solo recurrente)</option></select></Campo>
        <Campo titulo="Nombre"><input style={campo} value={f.nombre} maxLength={120} onChange={e => set('nombre', e.target.value)} /></Campo>
        <Campo titulo={orig?.codigo_en_uso ? 'Código (ya tuvo registros: no se cambia)' : 'Código'}>
          <input style={{ ...campo, fontFamily: 'monospace' }} value={f.codigo} maxLength={24} disabled={!!orig?.codigo_en_uso} onChange={e => set('codigo', e.target.value.toUpperCase())} placeholder="ANA-24" /></Campo>
        <Campo titulo="Documento"><input style={campo} value={f.documento} maxLength={40} onChange={e => set('documento', e.target.value)} /></Campo>
        <Campo titulo="Correo"><input style={campo} type="email" value={f.correo} maxLength={160} onChange={e => set('correo', e.target.value)} /></Campo>
        <Campo titulo="Teléfono"><input style={campo} type="tel" value={f.telefono} maxLength={40} onChange={e => set('telefono', e.target.value)} /></Campo>
        <Campo titulo="Medio de pago"><select style={campo} value={f.medio_pago} onChange={e => set('medio_pago', e.target.value)}><option value="">Sin definir</option><option value="nequi">Nequi</option><option value="bancolombia">Bancolombia</option><option value="otro">Otro</option></select></Campo>
        <Campo titulo="Datos de pago (solo tú los ves)"><input style={campo} value={f.datos_pago} maxLength={300} onChange={e => set('datos_pago', e.target.value)} placeholder="Número de cuenta o Nequi" /></Campo>
      </div>

      <h4 style={{ margin: '1rem 0 0.5rem' }}>Contrato firmado</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '0.5rem' }}>
        <Campo titulo={id ? 'Nuevo PDF del contrato (opcional)' : 'PDF o foto del contrato firmado'}>
          <input style={campo} type="file" accept="application/pdf,image/*" onChange={e => setArchivo(e.target.files?.[0] ?? null)} /></Campo>
        <Campo titulo="Versión del contrato"><input style={campo} value={f.contrato_version} maxLength={40} onChange={e => set('contrato_version', e.target.value)} placeholder="v1" /></Campo>
        <Campo titulo="Fecha de firma"><input style={campo} type="date" value={f.firmado_at} onChange={e => set('firmado_at', e.target.value)} /></Campo>
        <Campo titulo="Vigente hasta (opcional)"><input style={campo} type="date" value={f.vigente_hasta} onChange={e => set('vigente_hasta', e.target.value)} /></Campo>
      </div>
      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.75rem 0 0.5rem', fontSize: '0.875rem' }}>
        <input type="checkbox" checked={f.condiciones} onChange={e => set('condiciones', e.target.checked)} />
        Este contrato tiene condiciones distintas a las generales
      </label>
      {f.condiciones && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))', gap: '0.5rem' }}>
          <Campo titulo="Meses de bono"><input style={campo} inputMode="decimal" value={f.bono_meses} onChange={e => set('bono_meses', e.target.value)} /></Campo>
          <Campo titulo="% recurrente"><input style={campo} inputMode="decimal" value={f.recurrente_pct} onChange={e => set('recurrente_pct', e.target.value)} /></Campo>
          <Campo titulo="Meses de recurrente"><input style={campo} inputMode="numeric" value={f.recurrente_meses} onChange={e => set('recurrente_meses', e.target.value)} /></Campo>
        </div>
      )}
      <div style={{ marginTop: '0.75rem' }}><Campo titulo="Notas"><input style={campo} value={f.notas} maxLength={2000} onChange={e => set('notas', e.target.value)} /></Campo></div>
      {id && <div style={{ marginTop: '0.5rem' }}><Campo titulo="Motivo (obligatorio si cambias contrato, condiciones o vigencia)"><input style={campo} value={f.motivo} maxLength={500} onChange={e => set('motivo', e.target.value)} /></Campo></div>}
      {msg && <p role="alert" style={{ color: 'var(--tag-red-text, #b91c1c)', fontSize: '0.875rem' }}>{msg}</p>}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
        <button style={botonSuave} onClick={onClose}>Cancelar</button>
        <button style={botonPrimario} disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </Modal>
  )
}

function EstadoCodigo({ v, onClose, onHecho }: { v: Vendedor; onClose: () => void; onHecho: () => void }) {
  const [causa, setCausa] = useState('termino_normal')
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const activar = !v.activo
  const aplicar = async () => {
    if (!motivo.trim()) { setMsg('Escribe el motivo'); return }
    if (!window.confirm(activar ? `¿Activar el código ${v.codigo}?` : `¿Desactivar el código ${v.codigo}? Los clientes ya atribuidos siguen siendo suyos${causa === 'incumplimiento' ? ', pero se congela lo que no se ha pagado' : ''}.`)) return
    const { error } = await supabase.rpc('plataforma_vendedor_estado', { p_id: v.id, p_activo: activar, p_causa: activar ? null : causa, p_motivo: motivo.trim() })
    if (error) { setMsg(error.message); return }
    onHecho()
  }
  return (
    <Modal onClose={onClose} ancho="30rem">
      <h3 style={{ margin: '0 0 0.5rem' }}>{activar ? 'Activar' : 'Desactivar'} el código {v.codigo}</h3>
      {!activar && (
        <>
          <p style={{ ...suave, margin: '0 0 0.5rem' }}>Los registros nuevos con este código ya no se atribuyen. Los clientes ya atribuidos y sus comisiones ganadas se mantienen.</p>
          <Campo titulo="Causa">
            <select style={campo} value={causa} onChange={e => setCausa(e.target.value)}>
              <option value="termino_normal">Término normal (se mantiene lo ganado)</option>
              <option value="incumplimiento">Incumplimiento (se congela lo no pagado)</option>
            </select>
          </Campo>
        </>
      )}
      <div style={{ marginTop: '0.5rem' }}><Campo titulo="Motivo"><input style={campo} value={motivo} maxLength={500} onChange={e => setMotivo(e.target.value)} /></Campo></div>
      {msg && <p role="alert" style={{ color: 'var(--tag-red-text, #b91c1c)', fontSize: '0.875rem' }}>{msg}</p>}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
        <button style={botonSuave} onClick={onClose}>Cancelar</button>
        <button style={{ ...boton, background: activar ? '#2e7d32' : '#b3261e', color: '#fff' }} onClick={aplicar}>{activar ? 'Activar' : 'Desactivar'}</button>
      </div>
    </Modal>
  )
}

function Prospectos({ v, onClose }: { v: Vendedor; onClose: () => void }) {
  const [lista, setLista] = useState<Prospecto[]>([])
  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [contacto, setContacto] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('plataforma_prospectos_listar', { p_vendedor: v.id })
    if (error) { setMsg('No se pudieron cargar los prospectos: ' + error.message); return }
    setLista((data as Prospecto[]) ?? [])
  }, [v.id])
  useEffect(() => { cargar() }, [cargar])
  const agregar = async () => {
    if (nombre.trim().length < 2) { setMsg('Escribe el nombre del negocio'); return }
    const { error } = await supabase.rpc('plataforma_prospecto_agregar', { p_vendedor: v.id, p_nombre: nombre, p_ciudad: ciudad, p_contacto: contacto })
    if (error) { setMsg(error.message); return }
    setNombre(''); setCiudad(''); setContacto(''); setMsg(null); cargar()
  }
  const etapa = async (p: Prospecto, e: string) => {
    const { error } = await supabase.rpc('plataforma_prospecto_actualizar', { p_id: p.id, p_etapa: e, p_restaurant_id: null })
    if (error) setMsg(error.message); else cargar()
  }
  return (
    <Modal onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Prospectos de {v.nombre}</h3><button style={botonSuave} onClick={onClose}>Cerrar</button></div>
      <p style={{ ...suave }}>Negocios que registra este vendedor. Cada uno vence a los 60 días. Si dos vendedores registran el mismo negocio, gana el primer registro.</p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input style={{ ...campo, flex: '2 1 12rem', width: 'auto' }} placeholder="Nombre del negocio" value={nombre} onChange={e => setNombre(e.target.value)} />
        <input style={{ ...campo, flex: '1 1 8rem', width: 'auto' }} placeholder="Ciudad" value={ciudad} onChange={e => setCiudad(e.target.value)} />
        <input style={{ ...campo, flex: '1 1 8rem', width: 'auto' }} placeholder="Contacto" value={contacto} onChange={e => setContacto(e.target.value)} />
        <button style={botonPrimario} onClick={agregar}>Agregar</button>
      </div>
      {msg && <p role="alert" style={{ color: 'var(--tag-red-text, #b91c1c)', fontSize: '0.875rem' }}>{msg}</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0', display: 'grid', gap: '0.375rem' }}>
        {lista.length === 0 && <li style={suave}>Sin prospectos todavía.</li>}
        {lista.map(p => (
          <li key={p.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--bg-surface, #CDD0DC)', paddingTop: '0.375rem' }}>
            <span style={{ flex: '1 1 12rem' }}><strong>{p.nombre_negocio}</strong> <span style={suave}>{p.ciudad ?? ''} · registrado {fechaCorta(p.fecha_registro)} · vence {fechaCorta(p.vence_at)}</span></span>
            <select style={{ ...campo, width: 'auto', minHeight: '2.25rem', padding: '0.25rem 0.5rem' }} value={p.etapa} aria-label={`Etapa de ${p.nombre_negocio}`} onChange={e => etapa(p, e.target.value)}>
              {ETAPAS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
