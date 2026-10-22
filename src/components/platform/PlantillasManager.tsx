/**
 * PlantillasManager.tsx — pestaña "Plantillas" del panel de plataforma (Anexo B, 3.2). Solo super admin con 2 pasos.
 * Lista las plantillas por tipo de negocio (estado, versión, cuántos restaurantes la aplicaron) y permite
 * crear, duplicar, editar, activar o desactivar y volver a una versión anterior.
 * Editar una plantilla nunca modifica a los restaurantes que ya la aplicaron: ellos tienen su copia.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import type { OptionGroupV2, OptionItem } from '../../types'
import type { ListMap } from '../../services/menuOptions'
import { DishGroupsEditor } from '../menu/DishGroupsEditor'

interface Cat { value: string; label: string; emoji?: string }
interface Lista { key: string; nombre: string; items: OptionItem[] }
interface Plato { nombre: string; categoria: string; precio: 0; grupos: string[] }
interface Pregunta { id: string; texto: string }
interface Fila { key: string; nombre: string; descripcion: string | null; activo: boolean; version: number; updated_at: string; aplicada_en: number }
interface Version { version: number; nota: string | null; created_at: string }
type GrupoPlantilla = Omit<OptionGroupV2, 'v'>

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

const bg = 'var(--bg, #D8DAE4)', bgSurf = 'var(--bg-surface, #CDD0DC)', txt = 'var(--text-primary, #2D3561)', txtSec = 'var(--text-secondary, #6b7280)'
const acc = 'var(--w-terra, #C2570C)'
const caja: React.CSSProperties = { borderRadius: '1rem', padding: '1.25rem', backgroundColor: bg, boxShadow: 'var(--shadow-out)' }
const campo: React.CSSProperties = { boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: '0.75rem', border: '1px solid var(--w-line, #ccc)', background: 'var(--w-bg, #fff)', color: 'var(--w-ink, #222)', fontSize: '0.9375rem', minWidth: 0 }
const boton = (primario = false): React.CSSProperties => ({ border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8125rem', borderRadius: '0.75rem', padding: '0.5rem 0.9rem', minHeight: '2.5rem', background: primario ? acc : bgSurf, color: primario ? '#fff' : txt })
const h3: React.CSSProperties = { fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: txtSec, margin: '1.25rem 0 0.5rem', fontWeight: 700 }

function Editor({ inicial, esNueva, onVolver }: { inicial: { key: string; nombre: string; descripcion: string; payload: Record<string, unknown> }; esNueva: boolean; onVolver: (recargar: boolean) => void }) {
  const p = inicial.payload as { categorias?: Cat[]; listas?: Lista[]; grupos_tipicos?: GrupoPlantilla[]; platos_ejemplo?: Plato[]; preguntas?: Pregunta[] }
  const [key, setKey] = useState(inicial.key)
  const [nombre, setNombre] = useState(inicial.nombre)
  const [descripcion, setDescripcion] = useState(inicial.descripcion)
  const [cats, setCats] = useState<Cat[]>(p.categorias ?? [])
  const [listas, setListas] = useState<Lista[]>(p.listas ?? [])
  const [grupos, setGrupos] = useState<OptionGroupV2[]>((p.grupos_tipicos ?? []).map(g => ({ ...g, v: 2 as const })))
  const [platos, setPlatos] = useState<Plato[]>(p.platos_ejemplo ?? [])
  const [preguntas, setPreguntas] = useState<Pregunta[]>(p.preguntas ?? [])
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [versiones, setVersiones] = useState<Version[]>([])

  useEffect(() => {
    if (esNueva) return
    supabase.from('restaurant_template_versions').select('version, nota, created_at').eq('template_key', inicial.key).order('version', { ascending: false })
      .then(({ data }) => setVersiones((data as Version[]) ?? []))
  }, [esNueva, inicial.key])

  const mapa: ListMap = useMemo(() => Object.fromEntries(listas.map(l => [l.key, l.items])), [listas])
  const nombresLista = useMemo(() => Object.fromEntries(listas.map(l => [l.key, l.nombre])), [listas])

  const cambiarGrupos = (nuevos: OptionGroupV2[]) => {
    const ids = new Set(nuevos.map(g => g.id))
    setGrupos(nuevos)
    setPlatos(ps => ps.map(pl => ({ ...pl, grupos: pl.grupos.filter(g => ids.has(g)) })))   // un plato no puede apuntar a un grupo borrado
  }
  const quitarLista = (k: string) => {
    const usan = grupos.filter(g => 'lista' in g.fuente && g.fuente.lista === k).map(g => g.nombre)
    if (usan.length > 0) { setError(`No se puede quitar: la usan los grupos ${usan.join(', ')}. Cámbialos primero.`); return }
    setError(null); setListas(ls => ls.filter(l => l.key !== k))
  }
  const quitarCategoria = (v: string) => {
    if (platos.some(pl => pl.categoria === v)) { setError('No se puede quitar la categoría: hay platos de ejemplo que la usan. Cámbialos primero.'); return }
    setError(null); setCats(cs => cs.filter(c => c.value !== v))
  }

  const guardar = async () => {
    setError(null)
    const kk = esNueva ? slug(key) : key
    if (!kk) { setError('Escribe el identificador de la plantilla (por ejemplo "panaderia")'); return }
    const payload = {
      categorias: cats,
      listas: listas.map(l => ({ key: l.key, nombre: l.nombre, items: l.items.map(i => ({ label: i.label.trim(), precio_extra: Number(i.precio_extra) || 0 })) })),
      grupos_tipicos: grupos.map(({ v: _v, ...g }) => g),
      platos_ejemplo: platos.map(pl => ({ ...pl, precio: 0 })),
      preguntas: preguntas.filter(q => q.texto.trim()).map(q => ({ id: q.id, texto: q.texto.trim() })),
    }
    setGuardando(true)
    if (esNueva) {
      // Una plantilla nueva (o duplicada) nunca pisa una existente con la misma clave
      const { data: ya, error: eYa } = await supabase.from('restaurant_templates').select('key').eq('key', kk).maybeSingle()
      if (eYa) { setGuardando(false); setError(eYa.message); return }
      if (ya) { setGuardando(false); setError(`Ya existe una plantilla con el identificador "${kk}". Cámbialo para no sobrescribirla.`); return }
    }
    const { data, error: e } = await supabase.rpc('plataforma_guardar_plantilla', {
      p_key: kk, p_nombre: nombre.trim(), p_descripcion: descripcion.trim(), p_payload: payload, p_nota: nota.trim() || null,
    })
    setGuardando(false)
    if (e) { setError(e.message); return }
    window.alert(`Guardada como versión ${data}. Los restaurantes que ya la aplicaron no cambian.`)
    onVolver(true)
  }

  const restaurar = async (v: number) => {
    if (!window.confirm(`¿Volver a la versión ${v}? Se guarda como una versión nueva; el historial no se borra.`)) return
    const { error: e } = await supabase.rpc('plataforma_restaurar_version_plantilla', { p_key: key, p_version: v })
    if (e) { setError(e.message); return }
    onVolver(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={boton()} onClick={() => onVolver(false)}>← Volver a la lista</button>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: txt }}>{esNueva ? 'Nueva plantilla' : `Editar: ${inicial.nombre}`}</h2>
      </div>
      {error && <div role="alert" style={{ ...caja, color: 'var(--tag-red-text, #b91c1c)', boxShadow: 'var(--shadow-in)' }}>{error}</div>}

      <div style={caja}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: '0.5rem' }}>
          <input style={campo} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre (ej. Heladería)" aria-label="Nombre de la plantilla" />
          <input style={{ ...campo, opacity: esNueva ? 1 : 0.6 }} value={key} disabled={!esNueva} onChange={e => setKey(e.target.value)}
            placeholder="Identificador (ej. heladeria)" aria-label="Identificador" />
        </div>
        <textarea style={{ ...campo, width: '100%', marginTop: '0.5rem', resize: 'vertical' }} rows={2} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción corta" aria-label="Descripción" />

        <h3 style={h3}>Categorías del menú</h3>
        {cats.map((c, i) => (
          <div key={c.value} style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.375rem' }}>
            <input style={{ ...campo, width: '4rem', textAlign: 'center' }} value={c.emoji ?? ''} maxLength={4} aria-label="Emoji" onChange={e => setCats(cs => cs.map((x, k) => k === i ? { ...x, emoji: e.target.value } : x))} />
            <input style={{ ...campo, flex: 1 }} value={c.label} aria-label="Nombre de la categoría" onChange={e => setCats(cs => cs.map((x, k) => k === i ? { ...x, label: e.target.value } : x))} />
            <button style={boton()} aria-label="Quitar categoría" onClick={() => quitarCategoria(c.value)}>✕</button>
          </div>
        ))}
        <button style={boton()} onClick={() => {
          const base = slug(`categoria_${cats.length + 1}`); let v = base, n = 2
          while (cats.some(c => c.value === v)) v = `${base}_${n++}`
          setCats(cs => [...cs, { value: v, label: 'Nueva categoría', emoji: '🍽️' }])
        }}>+ Agregar categoría</button>

        <h3 style={h3}>Listas de opciones</h3>
        <p style={{ fontSize: '0.8125rem', color: txtSec, margin: '0 0 0.5rem' }}>Cada lista se copia al restaurante (sabores, salsas, leches…). El precio extra va en cero salvo que sea una regla casi universal.</p>
        {listas.map((l, li) => (
          <details key={l.key} style={{ borderTop: `1px solid ${bgSurf}`, padding: '0.4rem 0' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: txt }}>{l.nombre} <span style={{ color: txtSec, fontWeight: 400, fontSize: '0.8125rem' }}>· {l.items.length} opciones · {l.key}</span></summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.5rem' }}>
              <input style={campo} value={l.nombre} aria-label="Nombre de la lista" onChange={e => setListas(ls => ls.map((x, k) => k === li ? { ...x, nombre: e.target.value } : x))} />
              {l.items.map((it, ii) => (
                <div key={ii} style={{ display: 'flex', gap: '0.375rem' }}>
                  <input style={{ ...campo, flex: 1 }} value={it.label} aria-label="Opción" onChange={e => setListas(ls => ls.map((x, k) => k === li ? { ...x, items: x.items.map((y, n) => n === ii ? { ...y, label: e.target.value } : y) } : x))} />
                  <input type="number" min={0} step={100} style={{ ...campo, width: '6rem' }} value={it.precio_extra ?? 0} aria-label="Precio extra"
                    onChange={e => setListas(ls => ls.map((x, k) => k === li ? { ...x, items: x.items.map((y, n) => n === ii ? { ...y, precio_extra: Math.max(0, Number(e.target.value) || 0) } : y) } : x))} />
                  <button style={boton()} aria-label="Quitar opción" onClick={() => setListas(ls => ls.map((x, k) => k === li ? { ...x, items: x.items.filter((_, n) => n !== ii) } : x))}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                <button style={boton()} onClick={() => setListas(ls => ls.map((x, k) => k === li ? { ...x, items: [...x.items, { label: '', precio_extra: 0 }] } : x))}>+ Agregar opción</button>
                <button style={boton()} onClick={() => quitarLista(l.key)}>Quitar esta lista</button>
              </div>
            </div>
          </details>
        ))}
        <button style={{ ...boton(), marginTop: '0.5rem' }} onClick={() => {
          const nom = window.prompt('Nombre de la lista nueva (ej. Salsas)')?.trim()
          if (!nom) return
          let k = slug(nom), n = 2
          while (listas.some(l => l.key === k)) k = `${slug(nom)}_${n++}`
          setListas(ls => [...ls, { key: k, nombre: nom, items: [] }])
        }}>+ Agregar lista</button>

        <h3 style={h3}>Grupos de opciones de los platos</h3>
        <DishGroupsEditor groups={grupos} onChange={cambiarGrupos} listas={mapa} listaNombres={nombresLista}
          theme={{ bg, bgSurf, acc, txt, txtLt: txtSec }} />

        <h3 style={h3}>Platos de ejemplo <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(sin precio: el restaurante los pone)</span></h3>
        {platos.map((pl, i) => (
          <div key={i} style={{ borderRadius: '0.75rem', padding: '0.625rem', backgroundColor: bgSurf, marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              <input style={{ ...campo, flex: '1 1 12rem' }} value={pl.nombre} aria-label="Nombre del plato" onChange={e => setPlatos(ps => ps.map((x, k) => k === i ? { ...x, nombre: e.target.value } : x))} />
              <select style={campo} value={pl.categoria} aria-label="Categoría del plato" onChange={e => setPlatos(ps => ps.map((x, k) => k === i ? { ...x, categoria: e.target.value } : x))}>
                {cats.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <button style={boton()} aria-label="Quitar plato" onClick={() => setPlatos(ps => ps.filter((_, k) => k !== i))}>✕</button>
            </div>
            {grupos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 0.75rem', marginTop: '0.5rem', fontSize: '0.8125rem', color: txt }}>
                {grupos.map(g => (
                  <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <input type="checkbox" checked={pl.grupos.includes(g.id)}
                      onChange={e => setPlatos(ps => ps.map((x, k) => k === i ? { ...x, grupos: e.target.checked ? [...x.grupos, g.id] : x.grupos.filter(y => y !== g.id) } : x))} />
                    {g.nombre || '(sin nombre)'}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        <button style={boton()} disabled={cats.length === 0} onClick={() => setPlatos(ps => [...ps, { nombre: '', categoria: cats[0].value, precio: 0, grupos: [] }])}>+ Agregar plato de ejemplo</button>

        <h3 style={h3}>Preguntas para el administrador <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(aparecen en el asistente, con una casilla abierta cada una)</span></h3>
        {preguntas.map((q, i) => (
          <div key={q.id} style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.375rem' }}>
            <textarea style={{ ...campo, flex: 1, resize: 'vertical' }} rows={2} maxLength={600} value={q.texto} aria-label={`Pregunta ${i + 1}`}
              onChange={e => setPreguntas(qs => qs.map((x, k) => k === i ? { ...x, texto: e.target.value } : x))} />
            <button style={boton()} aria-label="Quitar pregunta" onClick={() => setPreguntas(qs => qs.filter((_, k) => k !== i))}>✕</button>
          </div>
        ))}
        <button style={boton()} onClick={() => {
          let n = preguntas.length + 1
          while (preguntas.some(q => q.id === `p${n}`)) n++
          setPreguntas(qs => [...qs, { id: `p${n}`, texto: '' }])
        }}>+ Agregar pregunta</button>

        <h3 style={h3}>Vista previa: el menú que recibe un restaurante nuevo</h3>
        <div style={{ borderRadius: '0.75rem', padding: '0.75rem', backgroundColor: bgSurf }}>
          {cats.map(c => {
            const ps = platos.filter(pl => pl.categoria === c.value)
            return (
              <div key={c.value} style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 700, color: txt }}>{c.emoji} {c.label}</div>
                {ps.length === 0 ? <div style={{ fontSize: '0.8125rem', color: txtSec }}>Sin platos de ejemplo</div> : ps.map((pl, i) => (
                  <div key={i} style={{ fontSize: '0.875rem', color: txt, marginLeft: '1rem' }}>
                    {pl.nombre || '(sin nombre)'} <span style={{ color: txtSec }}>· $0 (agotado hasta poner el precio){pl.grupos.length > 0 ? ` · elige: ${pl.grupos.map(g => grupos.find(x => x.id === g)?.nombre).filter(Boolean).join(', ')}` : ''}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        <h3 style={h3}>Guardar</h3>
        <input style={{ ...campo, width: '100%' }} value={nota} onChange={e => setNota(e.target.value)} maxLength={200} placeholder="¿Qué cambiaste? (opcional, queda en el historial)" aria-label="Nota de la versión" />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <button style={{ ...boton(true), opacity: guardando ? 0.7 : 1 }} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar nueva versión'}</button>
          <button style={boton()} onClick={() => onVolver(false)}>Cancelar</button>
        </div>
      </div>

      {versiones.length > 0 && (
        <div style={caja}>
          <h3 style={{ ...h3, marginTop: 0 }}>Historial de versiones</h3>
          {versiones.map(v => (
            <div key={v.version} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.25rem 0', fontSize: '0.875rem', color: txt }}>
              <strong>Versión {v.version}</strong>
              <span style={{ color: txtSec }}>{new Date(v.created_at).toLocaleString('es-CO')}{v.nota ? ` · ${v.nota}` : ''}</span>
              <button style={{ ...boton(), minHeight: '2rem', padding: '0.2rem 0.6rem' }} onClick={() => restaurar(v.version)}>Volver a esta versión</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function PlantillasManager() {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<{ key: string; nombre: string; descripcion: string; payload: Record<string, unknown>; nueva: boolean } | null>(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('plataforma_listar_plantillas')
    if (e) { setError(e.message); return }
    setError(null); setFilas((data as Fila[]) ?? [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const abrir = async (key: string, duplicar = false) => {
    const { data, error: e } = await supabase.from('restaurant_templates').select('key, nombre, descripcion, payload').eq('key', key).single()
    if (e || !data) { setError(e?.message ?? 'No se encontró la plantilla'); return }
    // Clave libre para la copia: si "_copia" ya existe se numera (_copia2, _copia3…)
    const usadas = new Set((filas ?? []).map(f => f.key))
    let copia = `${data.key}_copia`.slice(0, 40), n = 2
    while (duplicar && usadas.has(copia)) { copia = `${data.key}_copia${n++}`.slice(0, 40) }
    if (duplicar && copia !== `${data.key}_copia`.slice(0, 40)) setError(`Ya existía "${data.key}_copia"; la copia se llamará "${copia}".`)
    setEditando(duplicar
      ? { key: copia, nombre: `${data.nombre} (copia)`, descripcion: data.descripcion ?? '', payload: data.payload as Record<string, unknown>, nueva: true }
      : { key: data.key, nombre: data.nombre, descripcion: data.descripcion ?? '', payload: data.payload as Record<string, unknown>, nueva: false })
  }
  const alternar = async (f: Fila) => {
    const aviso = f.activo
      ? `¿Desactivar "${f.nombre}"? Dejará de ofrecerse a restaurantes nuevos. Los que ya la aplicaron no cambian.`
      : `¿Activar "${f.nombre}"? Los administradores podrán elegirla en el asistente y agregarla a su restaurante.`
    if (!window.confirm(aviso)) return
    const { error: e } = await supabase.rpc('plataforma_set_plantilla_activa', { p_key: f.key, p_activo: !f.activo })
    if (e) { setError(e.message); return }
    cargar()
  }

  if (editando) return (
    <Editor key={editando.key + editando.nueva} inicial={editando} esNueva={editando.nueva} onVolver={recargar => { setEditando(null); if (recargar) cargar() }} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: txt }}>Plantillas por tipo de negocio {filas && `(${filas.length})`}</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: txtSec, maxWidth: '40rem' }}>
            Cada plantilla es una copia que recibe el restaurante: categorías, listas de opciones y platos de ejemplo sin precio.
            Las nuevas nacen inactivas. Lo que cambies aquí solo afecta a quienes la apliquen después.
          </p>
        </div>
        <button style={boton(true)} onClick={() => setEditando({ key: '', nombre: '', descripcion: '', payload: {}, nueva: true })}>+ Nueva plantilla</button>
      </div>
      {error && <div role="alert" style={{ ...caja, color: 'var(--tag-red-text, #b91c1c)', boxShadow: 'var(--shadow-in)' }}>{error}</div>}
      {!filas ? <div style={{ padding: '2rem', textAlign: 'center', color: txtSec }}>Cargando…</div> : filas.length === 0 ? (
        <div style={{ ...caja, textAlign: 'center', color: txtSec }}>Todavía no hay plantillas cargadas.</div>
      ) : filas.map(f => (
        <div key={f.key} style={{ ...caja, display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', opacity: f.activo ? 1 : 0.85 }}>
          <div style={{ minWidth: '12rem', flex: '1 1 14rem' }}>
            <div style={{ fontWeight: 700, color: txt }}>
              {f.nombre}
              <span style={{ marginLeft: '0.5rem', fontSize: '0.625rem', fontWeight: 700, padding: '0.0625rem 0.4rem', borderRadius: '9999px', border: '1px solid currentColor', color: f.activo ? 'var(--w-olive, #2f6b3d)' : txtSec }}>{f.activo ? 'ACTIVA' : 'INACTIVA'}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: txtSec }}>{f.key} · versión {f.version} · {f.aplicada_en} restaurante{f.aplicada_en === 1 ? '' : 's'} la {f.aplicada_en === 1 ? 'aplicó' : 'aplicaron'}</div>
            {f.descripcion && <div style={{ fontSize: '0.8125rem', color: txtSec, marginTop: '0.25rem' }}>{f.descripcion}</div>}
          </div>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            <button style={boton()} onClick={() => abrir(f.key)}>Editar</button>
            <button style={boton()} onClick={() => abrir(f.key, true)}>Duplicar</button>
            <button style={boton(!f.activo)} onClick={() => alternar(f)}>{f.activo ? 'Desactivar' : 'Activar'}</button>
          </div>
        </div>
      ))}
    </div>
  )
}
