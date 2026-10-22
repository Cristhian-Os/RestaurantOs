/**
 * RecetasPaso.tsx — Paso "Recetas" del asistente (Anexo D, 3.5): qué ingredientes lleva cada plato.
 * Es lo que hace que el inventario se descuente solo al vender y que el dueño vea cuánto le deja cada plato.
 * Un plato a la vez, con costo y margen en vivo. Las cantidades se guardan SIEMPRE en la unidad del ingrediente
 * (al vender, el sistema resta la cantidad de la receta directo del inventario), por eso aquí se convierten
 * kg<->gramo y litro<->ml y no se permiten combinaciones imposibles (pieza contra kg).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { numEsCO, limpiarTxt } from './numeros'

interface Plato { id: string; name: string; price: number }
interface Ing { id: string; nombre: string; unidad_medida: string; costo_unitario: number }
interface Receta { producto_id: string; ingrediente_id: string; cantidad_necesaria: number }
interface Linea { ingId: string; cantidad: string; unidad: string }

// Para convertir una cantidad escrita en la unidad de la receta a la unidad del ingrediente: FACTOR[unidadIngrediente][unidadReceta]
const FACTOR: Record<string, Record<string, number>> = {
  kg: { kg: 1, gramo: 0.001 }, gramo: { gramo: 1, kg: 1000 }, litro: { litro: 1, ml: 0.001 }, ml: { ml: 1, litro: 1000 }, pieza: { pieza: 1 }, paquete: { paquete: 1 },
}
const UNIDADES = ['kg', 'gramo', 'litro', 'ml', 'pieza', 'paquete']
const num = numEsCO
const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
// Todo lo que viene de un archivo es texto: nunca se interpreta como fórmula.
const limpiar = limpiarTxt

const btn: React.CSSProperties = { border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', borderRadius: '0.75rem', padding: '0.7rem 1.1rem', minHeight: '2.75rem' }
const primary: React.CSSProperties = { ...btn, background: 'var(--w-terra)', color: '#fff' }
const ghost: React.CSSProperties = { ...btn, background: 'var(--w-bg)', color: 'var(--w-ink)', border: '1px solid var(--w-line)' }
const card: React.CSSProperties = { background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '0.875rem' }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', borderRadius: '0.75rem', minHeight: '2.75rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)', fontSize: '1rem', fontFamily: 'var(--w-sans)' }

export function RecetasPaso({ rid, onListo }: { rid: string; onListo: () => void }) {
  const [platos, setPlatos] = useState<Plato[] | null>(null)
  const [ings, setIngs] = useState<Ing[]>([])
  const [recetas, setRecetas] = useState<Receta[]>([])
  const [abierto, setAbierto] = useState<string | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [guardando, setGuardando] = useState(false)
  const [nuevo, setNuevo] = useState<{ nombre: string; unidad: string; costo: string } | null>(null)
  const [excel, setExcel] = useState(false)
  const [texto, setTexto] = useState('')
  const [erroresExcel, setErroresExcel] = useState<{ fila: number; motivo: string }[]>([])

  const cargar = useCallback(async () => {
    const [{ data: d }, { data: i }, { data: r }] = await Promise.all([
      supabase.from('dishes').select('id, name, price').eq('restaurant_id', rid).order('name'),
      supabase.from('ingredientes').select('id, nombre, unidad_medida, costo_unitario').eq('restaurant_id', rid).order('nombre'),
      supabase.from('recetas').select('producto_id, ingrediente_id, cantidad_necesaria').eq('restaurant_id', rid),
    ])
    setPlatos((d ?? []).map(x => ({ ...x, price: Number(x.price) })) as Plato[])
    setIngs((i ?? []).map(x => ({ ...x, costo_unitario: Number(x.costo_unitario) })) as Ing[])
    setRecetas((r ?? []).map(x => ({ ...x, cantidad_necesaria: Number(x.cantidad_necesaria) })) as Receta[])
  }, [rid])
  useEffect(() => { void cargar() }, [cargar])

  const ingPorId = useMemo(() => new Map(ings.map(i => [i.id, i])), [ings])
  const conReceta = useMemo(() => new Set(recetas.map(r => r.producto_id)), [recetas])

  const abrir = (p: Plato) => {
    setAbierto(p.id)
    setLineas(recetas.filter(r => r.producto_id === p.id).map(r => ({ ingId: r.ingrediente_id, cantidad: String(r.cantidad_necesaria), unidad: ingPorId.get(r.ingrediente_id)?.unidad_medida ?? 'pieza' })))
  }

  const plato = platos?.find(p => p.id === abierto) ?? null
  // Costo en vivo: cantidad (convertida a la unidad del ingrediente) por el costo de esa unidad
  const detalle = lineas.map(l => {
    const ing = ingPorId.get(l.ingId); const f = ing ? FACTOR[ing.unidad_medida]?.[l.unidad] : undefined
    const cant = num(l.cantidad)
    return { ing, f, cant, enUnidadIng: f && cant > 0 ? cant * f : 0, costo: ing && f && cant > 0 ? cant * f * ing.costo_unitario : 0 }
  })
  const costo = detalle.reduce((s, x) => s + x.costo, 0)
  const margen = plato && plato.price > 0 ? ((plato.price - costo) / plato.price) * 100 : null
  const colorMargen = margen === null ? 'var(--w-ink-mut)' : margen >= 50 ? '#1D7A46' : margen >= 30 ? '#B7791F' : '#B0341D'
  const sinCosto = detalle.some(x => x.ing && x.ing.costo_unitario === 0)

  const cambiar = (i: number, k: keyof Linea, v: string) => setLineas(ls => ls.map((l, j) => {
    if (j !== i) return l
    const n = { ...l, [k]: v }
    if (k === 'ingId') n.unidad = ingPorId.get(v)?.unidad_medida ?? l.unidad
    return n
  }))

  const guardarReceta = async () => {
    if (!plato) return
    const validas = detalle.map((d, i) => ({ d, l: lineas[i] })).filter(x => x.l.ingId)
    const mala = validas.find(x => !x.d.f || !(x.d.cant > 0))
    if (mala) { message.error(!mala.d.f ? `No se puede pasar de ${mala.l.unidad} a ${mala.d.ing?.unidad_medida} en “${mala.d.ing?.nombre}”` : `Pon una cantidad mayor que 0 en “${mala.d.ing?.nombre}”`); return }
    setGuardando(true)
    const { error } = await supabase.rpc('guardar_receta_manual', {
      p_producto_id: plato.id,
      p_lineas: validas.map(x => ({ ingrediente_id: x.l.ingId, nombre: x.d.ing!.nombre, costo_unitario: x.d.ing!.costo_unitario, unidad: x.d.ing!.unidad_medida, cantidad_necesaria: x.d.enUnidadIng })),
    })
    setGuardando(false)
    if (error) { message.error('No se pudo guardar la receta: ' + error.message); return }
    message.success(`Receta de “${plato.name}” guardada`)
    setAbierto(null); await cargar()
  }

  const crearIngrediente = async () => {
    if (!nuevo || !nuevo.nombre.trim()) { message.warning('Escribe el nombre del ingrediente'); return }
    const { data, error } = await supabase.rpc('importar_ingredientes', { p_filas: [{ nombre: nuevo.nombre.trim(), unidad: nuevo.unidad, stock_actual: '0', stock_minimo: '0', costo_unitario: String(num(nuevo.costo) || 0) }] })
    const res = data as { creados: number; existentes: number; errores: { motivo: string }[] } | null
    if (error || !res || res.errores.length) { message.error(error?.message ?? res?.errores[0]?.motivo ?? 'No se pudo crear'); return }
    if (res.existentes) message.info('Ese ingrediente ya existía')
    setNuevo(null); await cargar()
  }

  const plantillaCsv = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['plato,ingrediente,cantidad,unidad\n'], { type: 'text/csv;charset=utf-8' }))
    a.download = 'plantilla_recetas.csv'; a.click(); URL.revokeObjectURL(a.href)
  }
  const filasDeMatriz = (m: unknown[][]) => {
    const encabezado = (m[0] ?? []).map(c => String(c ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim())
    const tiene = encabezado.includes('plato')
    const idx = (k: string, def: number) => (tiene ? encabezado.indexOf(k) : def)
    const datos = tiene ? m.slice(1) : m
    if (datos.length > 500) message.warning(`El archivo tiene ${datos.length} filas: solo se cargaron las primeras 500. Súbelo en partes para el resto.`)
    return datos.slice(0, 500).map(r => ({ plato: limpiar(r[idx('plato', 0)]), ingrediente: limpiar(r[idx('ingrediente', 1)]), cantidad: limpiar(r[idx('cantidad', 2)]), unidad: limpiar(r[idx('unidad', 3)]) }))
      .filter(f => f.plato || f.ingrediente)
  }
  const importar = async (filas: ReturnType<typeof filasDeMatriz>) => {
    if (filas.length === 0) { message.warning('No encontré filas. El orden es: plato, ingrediente, cantidad, unidad'); return }
    setGuardando(true)
    const { data, error } = await supabase.rpc('importar_recetas', { p_filas: filas })
    setGuardando(false)
    if (error) { message.error('No se pudo importar: ' + error.message); return }
    const res = data as { platos: number; lineas: number; errores: { fila: number; motivo: string }[] }
    setErroresExcel(res.errores)
    if (res.errores.length === 0) { message.success(`${res.platos} receta${res.platos === 1 ? '' : 's'} guardada${res.platos === 1 ? '' : 's'}`); setTexto(''); setExcel(false); await cargar() }
  }
  const subirArchivo = async (file: File | undefined) => {
    if (!file) return
    if (!/\.(xlsx|csv)$/i.test(file.name)) { message.error('Solo archivos .xlsx o .csv'); return }
    if (file.size > 2 * 1024 * 1024) { message.error('El archivo pesa más de 2 MB'); return }
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer())
      await importar(filasDeMatriz(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false })))
    } catch { message.error('No pude leer el archivo') }
  }
  const usarTexto = () => {
    const sep = texto.includes('\t') ? '\t' : texto.includes(';') ? ';' : ','
    void importar(filasDeMatriz(texto.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(sep))))
  }

  if (platos === null) return <p>Cargando…</p>
  if (platos.length === 0 || ings.length === 0) return (
    <div style={card}>
      <p style={{ margin: '0 0 0.75rem' }}>{platos.length === 0 ? 'Todavía no tienes platos.' : 'Todavía no tienes ingredientes en el inventario.'} Las recetas conectan cada plato con sus ingredientes; puedes volver a este paso cuando los tengas, o hacerlo después desde Inventario → Recetas.</p>
      <button style={primary} onClick={onListo}>Continuar</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <div style={{ ...card, display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '12rem' }}>
          <strong>{conReceta.size} de {platos.length} platos con receta</strong>
          <div style={{ height: '0.5rem', borderRadius: '999px', background: 'var(--w-bg)', marginTop: '0.375rem', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((conReceta.size / platos.length) * 100)}%`, height: '100%', background: 'var(--w-terra)' }} />
          </div>
        </div>
        <button style={ghost} onClick={() => setExcel(e => !e)}>📋 Cargar por Excel</button>
      </div>

      {excel && (
        <div style={card}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>
            Columnas: <b>plato · ingrediente · cantidad · unidad</b>. El plato y el ingrediente deben existir con ese nombre. Si hay un error no se guarda nada y te digo qué fila corregir. Reemplaza la receta de cada plato que aparezca.
          </p>
          <textarea style={{ ...input, minHeight: '6rem' }} value={texto} onChange={e => setTexto(e.target.value)} aria-label="Filas pegadas" />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button style={primary} disabled={guardando} onClick={usarTexto}>Importar lo pegado</button>
            <label style={{ ...ghost, display: 'inline-flex', alignItems: 'center' }}>Subir archivo (.xlsx / .csv)
              <input type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={e => { void subirArchivo(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            <button style={ghost} onClick={plantillaCsv}>⬇ Plantilla</button>
          </div>
          {erroresExcel.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <strong style={{ color: 'var(--w-wine)' }}>No se guardó nada. Corrige estas filas:</strong>
              {erroresExcel.map((e, i) => <p key={i} style={{ margin: '0.125rem 0', fontSize: '0.875rem' }}>Fila {e.fila}: {e.motivo}</p>)}
            </div>
          )}
        </div>
      )}

      {!plato && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: '0.5rem' }}>
          {platos.map(p => (
            <button key={p.id} onClick={() => abrir(p)} style={{ ...card, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--w-ink)', border: conReceta.has(p.id) ? '1px solid #1D7A46' : '1px solid var(--w-line)', minHeight: '3.5rem' }}>
              <strong>{p.name}</strong>
              <div style={{ fontSize: '0.8125rem', color: conReceta.has(p.id) ? '#1D7A46' : 'var(--w-ink-mut)' }}>{conReceta.has(p.id) ? '✔ Con receta' : 'Sin receta · toca para agregarla'} · {cop(p.price)}</div>
            </button>
          ))}
        </div>
      )}

      {plato && (
        <div style={card}>
          <h3 style={{ margin: '0 0 0.25rem' }}>¿Qué lleva “{plato.name}”?</h3>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>Escribe cuánto de cada ingrediente usas en <b>un</b> plato. Cada vez que lo vendas, se descuenta solo del inventario.</p>
          {lineas.map((l, i) => {
            const ing = ingPorId.get(l.ingId); const compat = ing ? Object.keys(FACTOR[ing.unidad_medida] ?? {}) : UNIDADES
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(8.5rem, 1fr))', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                <select style={input} value={l.ingId} aria-label="Ingrediente" onChange={e => cambiar(i, 'ingId', e.target.value)}>
                  <option value="">Elegir ingrediente…</option>
                  {ings.map(x => <option key={x.id} value={x.id}>{x.nombre} ({x.unidad_medida})</option>)}
                </select>
                <input style={input} inputMode="decimal" placeholder="Cantidad" aria-label="Cantidad" value={l.cantidad} onChange={e => cambiar(i, 'cantidad', e.target.value)} />
                <select style={input} value={l.unidad} aria-label="Unidad" onChange={e => cambiar(i, 'unidad', e.target.value)}>
                  {compat.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <button style={{ ...ghost, color: 'var(--w-wine)' }} onClick={() => setLineas(ls => ls.filter((_, j) => j !== i))} aria-label="Quitar ingrediente">Quitar</button>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0' }}>
            <button style={ghost} onClick={() => setLineas(ls => [...ls, { ingId: '', cantidad: '', unidad: 'pieza' }])}>+ Agregar ingrediente</button>
            <button style={ghost} onClick={() => setNuevo({ nombre: '', unidad: 'kg', costo: '' })}>+ Crear ingrediente nuevo</button>
          </div>
          {nuevo && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(8.5rem, 1fr))', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input style={input} placeholder="Nombre" aria-label="Nombre del ingrediente nuevo" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
              <select style={input} value={nuevo.unidad} aria-label="Unidad del ingrediente nuevo" onChange={e => setNuevo({ ...nuevo, unidad: e.target.value })}>{UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}</select>
              <input style={input} inputMode="decimal" placeholder="Costo por unidad" aria-label="Costo del ingrediente nuevo" value={nuevo.costo} onChange={e => setNuevo({ ...nuevo, costo: e.target.value })} />
              <button style={primary} onClick={() => void crearIngrediente()}>Crear</button>
            </div>
          )}
          <div style={{ padding: '0.625rem 0.75rem', borderRadius: '0.75rem', background: 'var(--w-bg)', border: `1px solid ${colorMargen}`, marginBottom: '0.75rem' }}>
            <strong>Costo del plato: {cop(costo)}</strong>{' · '}Precio: {cop(plato.price)}{' · '}
            <strong style={{ color: colorMargen }}>{margen === null ? 'Sin precio' : `Margen ${Math.round(margen)}% (te deja ${cop(plato.price - costo)})`}</strong>
            {sinCosto && <div style={{ fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>Algún ingrediente no tiene costo en el inventario: el margen puede verse mejor de lo real.</div>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button style={{ ...primary, opacity: guardando ? 0.7 : 1 }} disabled={guardando} onClick={() => void guardarReceta()}>Guardar receta</button>
            <button style={ghost} onClick={() => setAbierto(null)}>Volver a la lista</button>
          </div>
        </div>
      )}

      {!plato && <div><button style={primary} onClick={onListo}>Continuar</button></div>}
    </div>
  )
}
