/**
 * SetupWizard.tsx — asistente de configuración de un restaurante nuevo (Anexo D del spec).
 * Pantalla completa para el admin cuando restaurant_config.onboarding_completed_at es nulo.
 * Un paso por pantalla; todo se puede omitir; el avance se guarda en restaurant_onboarding.
 * Las cargas en lote (mesas, proveedores, inventario, menú) usan funciones de la base de datos
 * que toman el restaurante de la sesión (nunca de lo que envía el navegador).
 */
import { useCallback, useEffect, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import BrandingManager from '../branding/BrandingManager'
import { MenuFotos } from './MenuFotos'
import type { NavView } from '../../pages/Dashboard'

type Fila = Record<string, string>
interface Col { key: string; label: string; ph?: string; unit?: boolean; num?: boolean; list?: boolean }
interface Resultado { creados: number; existentes: number; errores: { fila: number; motivo: string }[]; proveedores_no_encontrados?: string[] }

const PASOS = ['Tipo de negocio', 'Mesas', 'Proveedores', 'Inventario', 'Menú', 'Marca y datos', 'Equipo', 'Listo']
const UNIDADES = ['kg', 'gramo', 'litro', 'ml', 'pieza', 'paquete']

const TIPOS = [
  { id: 'heladeria', label: 'Heladería', emoji: '🍨' }, { id: 'cafeteria', label: 'Cafetería', emoji: '☕' },
  { id: 'comida_rapida', label: 'Comida rápida', emoji: '🍔' }, { id: 'pizzeria', label: 'Pizzería', emoji: '🍕' },
  { id: 'almuerzos', label: 'Almuerzos', emoji: '🍲' }, { id: 'parrilla', label: 'Parrilla', emoji: '🥩' },
  { id: 'otro', label: 'Otro', emoji: '🍽️' },
]

interface Pregunta { id: string; texto: string }
interface PlantillaActiva { key: string; nombre: string; emoji: string; preguntas: Pregunta[] }

const ing = (nombre: string, unidad: string): Fila => ({ nombre, unidad, stock_actual: '', stock_minimo: '', costo_unitario: '', proveedor: '' })
const plato = (nombre: string, categoria: string): Fila => ({ nombre, categoria, precio: '', descripcion: '' })

// Listas de ejemplo por tipo de negocio: el admin las ajusta antes de guardar (los precios van vacíos a propósito).
const SUGERIDOS: Record<string, { ingredientes: Fila[]; menu: Fila[] }> = {
  heladeria: {
    ingredientes: [ing('Leche', 'litro'), ing('Crema de leche', 'litro'), ing('Azúcar', 'kg'), ing('Fruta', 'kg'), ing('Helado de vainilla', 'litro'), ing('Leche condensada', 'litro'), ing('Conos', 'paquete'), ing('Vasos', 'paquete')],
    menu: [plato('Cholado clásico', 'Cholados'), plato('Copa de helado', 'Helados'), plato('Malteada', 'Bebidas'), plato('Jugo natural', 'Bebidas'), plato('Waffle con helado', 'Postres'), plato('Salpicón', 'Postres')],
  },
  cafeteria: {
    ingredientes: [ing('Café en grano', 'kg'), ing('Leche', 'litro'), ing('Azúcar', 'kg'), ing('Pan', 'pieza'), ing('Queso', 'kg'), ing('Vasos', 'paquete')],
    menu: [plato('Tinto', 'Bebidas'), plato('Capuchino', 'Bebidas'), plato('Café con leche', 'Bebidas'), plato('Croissant', 'Panadería'), plato('Sándwich', 'Comidas'), plato('Jugo natural', 'Bebidas')],
  },
  comida_rapida: {
    ingredientes: [ing('Pan de hamburguesa', 'pieza'), ing('Carne', 'kg'), ing('Queso', 'kg'), ing('Papa', 'kg'), ing('Salsas', 'litro'), ing('Aceite', 'litro')],
    menu: [plato('Hamburguesa', 'Principal'), plato('Perro caliente', 'Principal'), plato('Papas fritas', 'Acompañamientos'), plato('Gaseosa', 'Bebidas'), plato('Combo', 'Combos')],
  },
  pizzeria: {
    ingredientes: [ing('Harina', 'kg'), ing('Queso mozzarella', 'kg'), ing('Salsa de tomate', 'litro'), ing('Jamón', 'kg'), ing('Pepperoni', 'kg')],
    menu: [plato('Pizza personal', 'Pizzas'), plato('Pizza familiar', 'Pizzas'), plato('Calzone', 'Pizzas'), plato('Gaseosa', 'Bebidas')],
  },
  almuerzos: {
    ingredientes: [ing('Arroz', 'kg'), ing('Frijol', 'kg'), ing('Carne', 'kg'), ing('Pollo', 'kg'), ing('Plátano', 'kg'), ing('Aceite', 'litro')],
    menu: [plato('Almuerzo ejecutivo', 'Almuerzos'), plato('Sopa del día', 'Entradas'), plato('Jugo del día', 'Bebidas')],
  },
  parrilla: {
    ingredientes: [ing('Carne de res', 'kg'), ing('Cerdo', 'kg'), ing('Pollo', 'kg'), ing('Chorizo', 'kg'), ing('Carbón', 'kg'), ing('Papa', 'kg')],
    menu: [plato('Churrasco', 'Carnes'), plato('Costillas', 'Carnes'), plato('Chorizo', 'Carnes'), plato('Pechuga a la plancha', 'Carnes'), plato('Porción de papas', 'Acompañamientos')],
  },
  otro: { ingredientes: [], menu: [] },
}

const COLS_PROV: Col[] = [
  { key: 'nombre', label: 'Nombre', ph: 'Nombre *' }, { key: 'telefono', label: 'Teléfono', ph: 'Teléfono' },
  { key: 'correo', label: 'Correo', ph: 'Correo' }, { key: 'producto', label: 'Producto', ph: 'Qué provee' },
]
const COLS_ING: Col[] = [
  { key: 'nombre', label: 'Nombre', ph: 'Ingrediente *' }, { key: 'unidad', label: 'Unidad', unit: true },
  { key: 'stock_actual', label: 'Stock actual', ph: 'Cuánto tienes', num: true }, { key: 'stock_minimo', label: 'Stock mínimo', ph: 'Avisar bajo', num: true },
  { key: 'costo_unitario', label: 'Costo por unidad', ph: 'Costo', num: true }, { key: 'proveedor', label: 'Proveedor', ph: 'Proveedor' },
]
const COLS_MENU: Col[] = [
  { key: 'nombre', label: 'Nombre', ph: 'Plato *' }, { key: 'categoria', label: 'Categoría', ph: 'Categoría', list: true },
  { key: 'precio', label: 'Precio', ph: 'Precio *', num: true }, { key: 'descripcion', label: 'Descripción', ph: 'Descripción corta' },
]

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.875rem', borderRadius: '0.75rem', minHeight: '2.75rem',
  border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)',
  fontSize: '1rem', outline: 'none', fontFamily: 'var(--w-sans)',
}
const btn: React.CSSProperties = {
  border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem',
  borderRadius: '0.75rem', padding: '0.7rem 1.1rem', minHeight: '2.75rem',
}
const primary: React.CSSProperties = { ...btn, background: 'var(--w-terra)', color: '#fff' }
const ghost: React.CSSProperties = { ...btn, background: 'var(--w-bg)', color: 'var(--w-ink)', border: '1px solid var(--w-line)' }
const card: React.CSSProperties = { background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '1.125rem', boxShadow: 'var(--w-shadow-sm)' }

// Todo lo que viene de un archivo o del portapapeles es texto: nunca se interpreta como fórmula.
const limpiar = (v: unknown) => String(v ?? '').trim().replace(/^[=+@]+/, '')
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
// "12.000" (miles) y "3,5" (decimal) como se escriben en Colombia
const numTxt = (v: string) => {
  const t = v.replace(/[$\s]/g, '')
  return /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.')
}

function aFilas(matriz: unknown[][], cols: Col[]): Fila[] {
  if (matriz.length === 0) return []
  const head = (matriz[0] ?? []).map(c => norm(String(c ?? '')))
  const idx = cols.map(c => head.findIndex(h => h === norm(c.key) || h === norm(c.label)))
  const conEncabezado = idx[0] >= 0
  return (conEncabezado ? matriz.slice(1) : matriz).slice(0, 500)
    .map(r => Object.fromEntries(cols.map((c, i) => [c.key, limpiar((r ?? [])[conEncabezado ? idx[i] : i])])) as Fila)
    .filter(f => f[cols[0].key])
}

// ── Tabla de carga: filas editables + pegar desde Excel / subir .xlsx o .csv + lista sugerida ──
function CargaTabla({ cols, rpc, sugeridos, categorias, validar, onGuardado }: {
  cols: Col[]; rpc: string; sugeridos: Fila[]; categorias?: string[]
  validar?: (f: Fila[]) => string | null; onGuardado: () => void
}) {
  const vacia = (): Fila => Object.fromEntries(cols.map(c => [c.key, c.unit ? 'pieza' : '']))
  const [filas, setFilas] = useState<Fila[]>([vacia()])
  const [pegar, setPegar] = useState(false)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string[]>([])
  const nombreKey = cols[0].key

  const cambiar = (i: number, k: string, v: string) => setFilas(fs => fs.map((f, j) => j === i ? { ...f, [k]: v } : f))
  const agregarFilas = (nuevas: Fila[]) => setFilas(fs => [...fs.filter(f => f[nombreKey]?.trim()), ...nuevas].slice(0, 500))

  const usarTexto = () => {
    const lineas = texto.split(/\r?\n/).filter(l => l.trim())
    const sep = texto.includes('\t') ? '\t' : texto.includes(';') ? ';' : ','
    const f = aFilas(lineas.map(l => l.split(sep)), cols)
    if (f.length === 0) { message.warning('No encontré filas. Pega las columnas en este orden: ' + cols.map(c => c.label).join(', ')); return }
    agregarFilas(f); setTexto(''); setPegar(false)
  }

  const subirArchivo = async (file: File | undefined) => {
    if (!file) return
    if (!/\.(xlsx|csv)$/i.test(file.name)) { message.error('Solo archivos .xlsx o .csv'); return }
    if (file.size > 2 * 1024 * 1024) { message.error('El archivo pesa más de 2 MB'); return }
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer())
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false })
      const f = aFilas(matriz, cols)
      if (f.length === 0) { message.warning('El archivo no tiene filas con nombre'); return }
      agregarFilas(f)
    } catch { message.error('No pude leer el archivo') }
  }

  const plantilla = () => {
    const csv = cols.map(c => c.key).join(',') + '\n'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `plantilla_${rpc.replace('importar_', '')}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const guardar = async () => {
    const validas = filas.filter(f => limpiar(f[nombreKey]))
    if (validas.length === 0) { message.warning('Agrega al menos una fila'); return }
    const lista = validas.map(f => Object.fromEntries(cols.map(c => [c.key, c.num ? numTxt(limpiar(f[c.key])) : limpiar(f[c.key])])) as Fila)
    const problema = validar?.(lista)
    if (problema) { message.error(problema); return }
    setGuardando(true)
    const { data, error } = await supabase.rpc(rpc, { p_filas: lista })
    setGuardando(false)
    if (error) { message.error('No se pudo guardar: ' + error.message); return }
    const res = data as Resultado
    const lineas = res.errores.map(e => `“${lista[e.fila - 1]?.[nombreKey] ?? 'fila ' + e.fila}”: ${e.motivo}`)
    if (res.proveedores_no_encontrados?.length) lineas.push('Proveedores que no existen (quedaron sin proveedor): ' + res.proveedores_no_encontrados.join(', '))
    setAviso(lineas)
    const malas = new Set(res.errores.map(e => e.fila - 1))
    setFilas(malas.size ? validas.filter((_, i) => malas.has(i)) : [vacia()])
    message.success(`${res.creados} guardados${res.existentes ? `, ${res.existentes} ya existían` : ''}`)
    if (malas.size === 0) onGuardado()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {sugeridos.length > 0 && <button style={ghost} onClick={() => agregarFilas(sugeridos.map(s => ({ ...vacia(), ...s })))}>✨ Usar lista sugerida</button>}
        <button style={ghost} onClick={() => setPegar(p => !p)}>📋 Pegar o subir Excel / CSV</button>
        <button style={ghost} onClick={plantilla}>⬇ Plantilla</button>
      </div>
      {pegar && (
        <div style={card}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>
            Copia las filas desde Excel y pégalas aquí. Orden de columnas: <b>{cols.map(c => c.label).join(' · ')}</b>
          </p>
          <textarea style={{ ...input, minHeight: '6rem' }} value={texto} onChange={e => setTexto(e.target.value)} aria-label="Filas pegadas" />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem', alignItems: 'center' }}>
            <button style={primary} onClick={usarTexto}>Agregar filas</button>
            <label style={{ ...ghost, display: 'inline-flex', alignItems: 'center' }}>
              Subir archivo (.xlsx / .csv)
              <input type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={e => { subirArchivo(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          </div>
        </div>
      )}
      {filas.map((f, i) => (
        <div key={i} style={{ ...card, padding: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(9.5rem, 1fr))', gap: '0.5rem', alignItems: 'center' }}>
          {cols.map(c => c.unit ? (
            <select key={c.key} style={input} value={f[c.key]} aria-label={c.label} onChange={e => cambiar(i, c.key, e.target.value)}>
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          ) : (
            <input key={c.key} style={input} value={f[c.key] ?? ''} placeholder={c.ph} aria-label={c.label}
              inputMode={c.num ? 'decimal' : undefined} list={c.list ? 'wiz-cats' : undefined} maxLength={c.key === 'descripcion' ? 500 : 120}
              onChange={e => cambiar(i, c.key, e.target.value)} />
          ))}
          <button style={{ ...ghost, color: 'var(--w-wine)' }} onClick={() => setFilas(fs => fs.length > 1 ? fs.filter((_, j) => j !== i) : [vacia()])} aria-label="Quitar fila">Quitar</button>
        </div>
      ))}
      {categorias && <datalist id="wiz-cats">{categorias.map(c => <option key={c} value={c} />)}</datalist>}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button style={ghost} onClick={() => setFilas(fs => [...fs, vacia()])}>+ Otra fila</button>
        <button style={{ ...primary, opacity: guardando ? 0.7 : 1 }} disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : `Guardar ${filas.filter(f => limpiar(f[nombreKey])).length || ''} y continuar`}
        </button>
      </div>
      {aviso.length > 0 && (
        <div style={{ ...card, borderColor: 'var(--w-wine)' }}>
          <p style={{ margin: '0 0 0.375rem', fontWeight: 700 }}>Revisa estas filas (las demás ya quedaron guardadas):</p>
          {aviso.map((a, i) => <p key={i} style={{ margin: '0.125rem 0', fontSize: '0.875rem' }}>{a}</p>)}
        </div>
      )}
    </div>
  )
}

const Titulo = ({ t, s }: { t: string; s: string }) => (
  <div style={{ marginBottom: '1rem' }}>
    <h2 className="ed-display" style={{ fontWeight: 600, fontSize: '1.75rem', margin: 0 }}>{t}</h2>
    <p style={{ margin: '0.25rem 0 0', fontSize: '0.9375rem', color: 'var(--w-ink-mut)' }}>{s}</p>
  </div>
)

export function SetupWizard({ onClose, onFinished }: { onClose: (ir?: NavView) => void; onFinished: () => void }) {
  const [rid, setRid] = useState<string | null>(null)
  const [paso, setPaso] = useState(1)
  const [hecho, setHecho] = useState<Record<string, boolean>>({})
  const [cargando, setCargando] = useState(true)
  // Tipos de negocio elegidos (puede ser más de uno: ej. heladería y cafetería). El primero es el principal.
  const [tipos, setTipos] = useState<string[]>([])
  const tipo = tipos[0] ?? ''
  // Plantillas activas de la plataforma (si hay, reemplazan las tarjetas fijas) y preguntas de cada una
  const [plantillas, setPlantillas] = useState<PlantillaActiva[]>([])
  const [sub, setSub] = useState<'tipo' | 'preguntas'>('tipo')
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [ciudad, setCiudad] = useState('')
  const [razon, setRazon] = useState('')
  const [nit, setNit] = useState('')
  const [mesas, setMesas] = useState('6')
  const [soloDomicilio, setSoloDomicilio] = useState(false)
  const [categorias, setCategorias] = useState<string[]>(['Entrada', 'Principal', 'Postre', 'Bebida', 'Especial'])
  const [resumen, setResumen] = useState<Record<string, number>>({})
  const [slug, setSlug] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [subMenu, setSubMenu] = useState<'carga' | 'fotos'>('carga')

  useEffect(() => {
    (async () => {
      const { data: id } = await supabase.rpc('current_restaurant_id')
      setRid((id as string) ?? null)
      const [{ data: ob }, { data: cfg }, { data: fis }, { data: pls }, { data: resp }] = await Promise.all([
        supabase.from('restaurant_onboarding').select('current_step, steps_done').maybeSingle(),
        supabase.from('restaurant_config').select('business_type, ciudad, modules_enabled, plantillas_aplicadas').maybeSingle(),
        supabase.from('restaurant_fiscal').select('razon_social, nit').maybeSingle(),
        supabase.from('restaurant_templates').select('key, nombre, payload').eq('activo', true).order('nombre'),
        supabase.from('restaurant_template_answers').select('template_key, pregunta_id, respuesta'),
      ])
      setPlantillas((pls ?? []).map(p => {
        const pay = (p.payload ?? {}) as { categorias?: { emoji?: string }[]; preguntas?: Pregunta[] }
        return { key: p.key as string, nombre: p.nombre as string, emoji: pay.categorias?.find(c => c.emoji)?.emoji ?? '🍽️', preguntas: pay.preguntas ?? [] }
      }))
      setRespuestas(Object.fromEntries((resp ?? []).map(r => [`${r.template_key}|${r.pregunta_id}`, r.respuesta as string])))
      if (ob) { setPaso(Math.min(Math.max(ob.current_step ?? 1, 1), PASOS.length)); setHecho((ob.steps_done as Record<string, boolean>) ?? {}) }
      if (fis) { setRazon(fis.razon_social ?? ''); setNit(fis.nit ?? '') }
      if (cfg) {
        const aplicadas = (cfg.plantillas_aplicadas as string[] | null) ?? []
        setTipos([...new Set([cfg.business_type, ...aplicadas].filter((x): x is string => !!x))]); setCiudad(cfg.ciudad ?? '')
        const cats = (cfg.modules_enabled as { categories?: { label?: string }[] } | null)?.categories
        if (cats?.length) setCategorias(cats.map(c => c.label ?? '').filter(Boolean))
      }
      setCargando(false)
    })()
  }, [])

  const guardarProgreso = useCallback(async (n: number, h: Record<string, boolean>) => {
    if (!rid) return
    await supabase.from('restaurant_onboarding').upsert({ restaurant_id: rid, current_step: n, steps_done: h, updated_at: new Date().toISOString() })
  }, [rid])

  const irA = (n: number, marcar?: boolean) => {
    const h = marcar === undefined ? hecho : { ...hecho, [String(paso)]: marcar }
    const destino = Math.min(Math.max(n, 1), PASOS.length)
    setHecho(h); setPaso(destino); guardarProgreso(destino, h)
  }
  const siguiente = (marcar: boolean) => irA(paso + 1, marcar)

  // Resumen del último paso
  useEffect(() => {
    if (paso !== PASOS.length) return
    ;(async () => {
      const n = async (t: string) => (await supabase.from(t).select('id', { count: 'exact', head: true })).count ?? 0
      const [mesasN, prov, ings, platos, recetas] = await Promise.all([n('mesas'), n('proveedores'), n('ingredientes'), n('dishes'), n('recetas')])
      setResumen({ mesas: mesasN, proveedores: prov, ingredientes: ings, platos, recetas })
      const { data } = await supabase.from('restaurants').select('slug').maybeSingle()
      setSlug((data?.slug as string) ?? null)
    })()
  }, [paso])

  const elegidas = plantillas.filter(p => tipos.includes(p.key))
  const alternar = (id: string) => setTipos(ts => ts.includes(id) ? ts.filter(x => x !== id) : [...ts, id])

  const guardarRespuestas = async () => {
    const filas = elegidas.flatMap(p => p.preguntas.map(q => ({
      plantilla: p.key, pregunta_id: q.id, pregunta: q.texto, respuesta: respuestas[`${p.key}|${q.id}`] ?? '',
    })))
    setGuardando(true)
    const { error } = await supabase.rpc('guardar_respuestas_plantilla', { p_respuestas: filas })
    setGuardando(false)
    if (error) { message.error('No se pudieron guardar las respuestas: ' + error.message); return }
    setSub('tipo'); siguiente(true)
  }

  const guardarTipo = async () => {
    if (tipos.length === 0) { message.warning('Elige el tipo de negocio'); return }
    setGuardando(true)
    const { error } = await supabase.from('restaurant_config')
      .update({ business_type: tipos[0], ciudad: ciudad.trim() || null }).eq('restaurant_id', rid)
    // Razón social y NIT van en una tabla privada: restaurant_config la lee cualquier visitante.
    const { error: errFiscal } = await supabase.from('restaurant_fiscal')
      .upsert({ restaurant_id: rid, razon_social: razon.trim() || null, nit: nit.trim() || null, updated_at: new Date().toISOString() })
    if (error || errFiscal) { setGuardando(false); message.error('No se pudo guardar: ' + (error ?? errFiscal)!.message); return }
    // Plantillas activas elegidas: copian categorías, listas de opciones y platos de ejemplo (idempotente, no pisa lo editado)
    for (const p of elegidas) {
      const { error: errPl } = await supabase.rpc('aplicar_plantilla', { p_key: p.key })
      if (errPl) message.warning(`No se pudo agregar la plantilla ${p.nombre}: ${errPl.message}`)
    }
    setGuardando(false)
    if (elegidas.some(p => p.preguntas.length > 0)) { setSub('preguntas'); return }
    siguiente(true)
  }

  const guardarMesas = async () => {
    const n = Number(mesas)
    if (!Number.isInteger(n) || n < 0 || n > 100) { message.warning('Escribe un número de mesas entre 0 y 100'); return }
    setGuardando(true)
    const { error } = await supabase.rpc('crear_mesas', { p_cantidad: n })
    setGuardando(false)
    if (error) { message.error('No se pudieron crear las mesas: ' + error.message); return }
    siguiente(true)
  }

  const terminar = async () => {
    setGuardando(true)
    const { error } = await supabase.from('restaurant_config').update({ onboarding_completed_at: new Date().toISOString() }).eq('restaurant_id', rid)
    setGuardando(false)
    if (error) { message.error('No se pudo terminar: ' + error.message); return }
    onFinished()
  }

  const sug = SUGERIDOS[tipo || 'otro'] ?? SUGERIDOS.otro
  const pct = Math.round((paso / PASOS.length) * 100)

  const pendiente = (ok: boolean, txt: string, ir?: NavView) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.375rem 0' }}>
      <span style={{ fontWeight: 800, color: ok ? 'var(--w-olive)' : 'var(--w-ink-mut)' }}>{ok ? '✓' : '○'}</span>
      <span style={{ flex: 1, minWidth: '10rem' }}>{txt}</span>
      {!ok && ir && <button style={ghost} onClick={() => onClose(ir)}>Hacerlo ahora</button>}
    </div>
  )

  return (
    <div role="dialog" aria-modal="true" aria-label="Configura tu restaurante"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--w-bg)', overflowY: 'auto', fontFamily: 'var(--w-sans)', color: 'var(--w-ink)' }}>
      <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '1rem 1rem 6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <p className="ed-kicker" style={{ margin: 0 }}>Paso {paso} de {PASOS.length} · {PASOS[paso - 1]}</p>
          <button style={ghost} onClick={() => onClose()}>Cerrar y seguir después</button>
        </div>
        <div style={{ height: '0.5rem', borderRadius: '999px', background: 'var(--w-line)', margin: '0.75rem 0 1.25rem', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--w-terra)', transition: 'width 0.3s' }} />
        </div>

        {cargando ? <p style={{ color: 'var(--w-ink-mut)' }}>Cargando…</p> : (<>
          {paso === 1 && sub === 'preguntas' && (<>
            <Titulo t="Cuéntanos de tu negocio" s="Estas preguntas nos ayudan a dejar tu menú y tus opciones como las necesitas. Responde lo que sepas con tus palabras; puedes dejar en blanco lo que no." />
            {elegidas.filter(p => p.preguntas.length > 0).map(p => (
              <div key={p.key} style={{ ...card, marginBottom: '0.75rem' }}>
                <p className="ed-kicker" style={{ margin: '0 0 0.75rem' }}>{p.emoji} {p.nombre}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  {p.preguntas.map((q, i) => {
                    const id = `preg-${p.key}-${q.id}`
                    return (
                      <div key={q.id}>
                        <label htmlFor={id} style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem' }}>{i + 1}. {q.texto}</label>
                        <textarea id={id} rows={2} maxLength={2000} placeholder="Escribe tu respuesta aquí"
                          value={respuestas[`${p.key}|${q.id}`] ?? ''}
                          onChange={e => setRespuestas(r => ({ ...r, [`${p.key}|${q.id}`]: e.target.value }))}
                          style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--w-sans)' }} />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>
              Tus respuestas las lee el equipo de RestaurantOS para ajustar tu configuración. No son obligatorias y las puedes cambiar después.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <button style={{ ...primary, opacity: guardando ? 0.7 : 1 }} disabled={guardando} onClick={guardarRespuestas}>Guardar respuestas y continuar</button>
              <button style={ghost} onClick={() => { setSub('tipo'); siguiente(true) }}>Omitir las preguntas</button>
              <button style={ghost} onClick={() => setSub('tipo')}>← Cambiar tipo de negocio</button>
            </div>
          </>)}

          {paso === 1 && sub === 'tipo' && (<>
            <Titulo t="¿Qué tipo de negocio tienes?" s={plantillas.length > 0
              ? 'Puedes elegir más de uno (por ejemplo heladería y cafetería). Con esto te dejamos categorías, listas de opciones y platos de ejemplo para que solo pongas tus precios.'
              : 'Con esto te sugerimos listas de ejemplo para el inventario y el menú.'} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))', gap: '0.625rem' }}>
              {(plantillas.length > 0
                ? [...plantillas.map(p => ({ id: p.key, label: p.nombre, emoji: p.emoji })), { id: 'otro', label: 'Otro', emoji: '🍽️' }]
                : TIPOS
              ).map(t => (
                <button key={t.id} onClick={() => (plantillas.length > 0 ? alternar(t.id) : setTipos([t.id]))} aria-pressed={tipos.includes(t.id)}
                  style={{ ...card, cursor: 'pointer', textAlign: 'center', borderColor: tipos.includes(t.id) ? 'var(--w-terra)' : 'var(--w-line)', borderWidth: tipos.includes(t.id) ? 2 : 1, minHeight: '5.5rem', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', fontWeight: 700 }}>
                  <div style={{ fontSize: '1.75rem' }}>{t.emoji}</div>{t.label}
                </button>
              ))}
            </div>
            <div style={{ ...card, marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '0.5rem' }}>
              <input style={input} value={ciudad} placeholder="Ciudad" aria-label="Ciudad" maxLength={80} onChange={e => setCiudad(e.target.value)} />
              <input style={input} value={razon} placeholder="Razón social (opcional)" aria-label="Razón social" maxLength={120} onChange={e => setRazon(e.target.value)} />
              <input style={input} value={nit} placeholder="NIT (opcional)" aria-label="NIT" maxLength={30} onChange={e => setNit(e.target.value)} />
            </div>
            <div style={{ marginTop: '1rem' }}><button style={{ ...primary, opacity: guardando ? 0.7 : 1 }} disabled={guardando} onClick={guardarTipo}>Guardar y continuar</button></div>
          </>)}

          {paso === 2 && (<>
            <Titulo t="Mesas" s="Se crean numeradas del 1 en adelante. Si ya tienes algunas, no se repiten." />
            <div style={card}>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', fontWeight: 600 }}>
                <input type="checkbox" checked={soloDomicilio} onChange={e => setSoloDomicilio(e.target.checked)} style={{ width: '1.25rem', height: '1.25rem' }} />
                Solo vendo por domicilio y para llevar (sin mesas)
              </label>
              {!soloDomicilio && <input style={{ ...input, maxWidth: '12rem' }} type="number" min={0} max={100} value={mesas} aria-label="Cantidad de mesas" onChange={e => setMesas(e.target.value)} />}
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button style={{ ...primary, opacity: guardando ? 0.7 : 1 }} disabled={guardando} onClick={() => soloDomicilio ? siguiente(true) : guardarMesas()}>Guardar y continuar</button>
            </div>
          </>)}

          {paso === 3 && (<>
            <Titulo t="Proveedores" s="A quién le compras. Después puedes asignar un proveedor a cada ingrediente." />
            <CargaTabla key="prov" cols={COLS_PROV} rpc="importar_proveedores" sugeridos={[]} onGuardado={() => siguiente(true)} />
          </>)}

          {paso === 4 && (<>
            <Titulo t="Inventario" s="Los ingredientes que usas, con su unidad, cuánto tienes, el mínimo para avisarte y su costo." />
            <CargaTabla key="ing" cols={COLS_ING} rpc="importar_ingredientes" sugeridos={sug.ingredientes} onGuardado={() => siguiente(true)} />
          </>)}

          {paso === 5 && (<>
            {subMenu === 'carga' ? (<>
              <Titulo t="Menú" s="Tus platos con categoría, precio y descripción. En la siguiente pantalla les pones foto." />
              <CargaTabla key="menu" cols={COLS_MENU} rpc="importar_menu" sugeridos={sug.menu} categorias={categorias}
                validar={f => f.some(x => !(Number(x.precio) > 0)) ? 'Ponle precio a todos los platos (mayor que 0)' : null}
                onGuardado={() => setSubMenu('fotos')} />
              <div style={{ marginTop: '0.75rem' }}><button style={ghost} onClick={() => setSubMenu('fotos')}>Ya tengo mis platos: ir a las fotos →</button></div>
            </>) : (<>
              <Titulo t="Fotos y descripciones" s="Una foto y una descripción corta hacen que tus platos se vendan más. Todo es opcional." />
              {rid && <MenuFotos rid={rid} onListo={() => { setSubMenu('carga'); siguiente(true) }} />}
              <div style={{ marginTop: '0.75rem' }}><button style={ghost} onClick={() => setSubMenu('carga')}>← Volver a la lista de platos</button></div>
            </>)}
          </>)}

          {paso === 6 && (<>
            <Titulo t="Marca y datos del restaurante" s="Logo, colores, eslogan, portada, dirección, WhatsApp, horario y propina sugerida." />
            <BrandingManager />
            <div style={{ marginTop: '1rem' }}><button style={primary} onClick={() => siguiente(true)}>Continuar</button></div>
          </>)}

          {paso === 7 && (<>
            <Titulo t="Tu equipo" s="Crea los usuarios de cajero, mesero y cocina. Es opcional y lo puedes hacer cuando quieras." />
            <div style={card}>
              <p style={{ margin: '0 0 0.75rem' }}>Cada persona entra con su correo y su contraseña, y ve solo lo de su rol.</p>
              <button style={primary} onClick={() => { guardarProgreso(paso, { ...hecho, [String(paso)]: true }); onClose('team') }}>Crear mi equipo ahora</button>
            </div>
          </>)}

          {paso === 8 && (<>
            <Titulo t="¡Listo!" s="Esto es lo que quedó configurado y lo que falta." />
            <div style={card}>
              {pendiente(!!tipo, 'Tipo de negocio')}
              {pendiente((resumen.mesas ?? 0) > 0 || soloDomicilio, `Mesas (${resumen.mesas ?? 0})`)}
              {pendiente((resumen.proveedores ?? 0) > 0, `Proveedores (${resumen.proveedores ?? 0})`, 'proveedores')}
              {pendiente((resumen.ingredientes ?? 0) > 0, `Inventario (${resumen.ingredientes ?? 0} ingredientes)`, 'inventory')}
              {pendiente((resumen.platos ?? 0) > 0, `Menú (${resumen.platos ?? 0} platos). Falta subir las fotos en Menú`, 'menu')}
              {pendiente((resumen.recetas ?? 0) > 0, `Recetas (${resumen.recetas ?? 0}). Conectan cada plato con sus ingredientes para descontar el inventario solo`, 'inventory')}
            </div>
            {slug && (
              <div style={{ ...card, marginTop: '0.75rem' }}>
                <p style={{ margin: '0 0 0.375rem', fontWeight: 700 }}>Tu menú público</p>
                <a href={`/menu/${slug}`} target="_blank" rel="noreferrer" style={{ color: 'var(--w-terra)', fontWeight: 700, wordBreak: 'break-all' }}>{window.location.origin}/menu/{slug}</a>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>Los códigos QR para las mesas los imprimes desde Menú.</p>
              </div>
            )}
            <div style={{ marginTop: '1rem' }}><button style={{ ...primary, opacity: guardando ? 0.7 : 1 }} disabled={guardando} onClick={terminar}>Terminar configuración</button></div>
          </>)}

          {paso < PASOS.length && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              {paso > 1 && <button style={ghost} onClick={() => irA(paso - 1)}>← Atrás</button>}
              <button style={ghost} onClick={() => siguiente(false)}>Omitir por ahora</button>
            </div>
          )}
          {paso === PASOS.length && <div style={{ marginTop: '1rem' }}><button style={ghost} onClick={() => irA(paso - 1)}>← Atrás</button></div>}
        </>)}
      </div>
    </div>
  )
}
