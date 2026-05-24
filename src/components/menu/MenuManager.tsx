/**
 * MenuManager.tsx v2
 * - Fotos de platos (upload a Supabase Storage)
 * - Tags guardados correctamente como array
 * - Categorías editables
 * - Nombre del establecimiento dinámico
 */
import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'
import type { Dish, DishCategory } from '../../types'

const S = {
  neoOut:  { boxShadow: '8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55)' },
  neoOutSm:{ boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)' },
  neoIn:   { boxShadow: 'inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5)' },
  coral:   { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
} as const

// Categorías — editables en tiempo de ejecución
const DEFAULT_CATEGORIES: { value: DishCategory; label: string; emoji: string }[] = [
  { value: 'entrada',   label: 'Entrada',   emoji: '🥗' },
  { value: 'principal', label: 'Principal', emoji: '🍽️' },
  { value: 'postre',    label: 'Postre',    emoji: '🍰' },
  { value: 'bebida',    label: 'Bebida',    emoji: '🥤' },
  { value: 'especial',  label: 'Especial',  emoji: '⭐' },
]

interface DishForm {
  name:        string
  description: string
  price:       string
  category:    DishCategory
  tags:        string   // string separado por comas → se convierte a array al guardar
  available:   boolean
  image_file?: File | null
  image_preview?: string | null
}

const FORM_EMPTY: DishForm = {
  name:'', description:'', price:'', category:'principal',
  tags:'', available:true, image_file:null, image_preview:null,
}

function dishToForm(d: Dish): DishForm {
  return {
    name:          d.name,
    description:   d.description ?? '',
    price:         d.price.toString(),
    category:      d.category,
    tags:          (d.tags ?? []).join(', '),
    available:     d.available,
    image_file:    null,
    image_preview: d.image_url ?? null,
  }
}

/** Parsear tags: "vegano, Sin gluten , picante" → ['vegano','sin gluten','picante'] */
function parseTags(raw: string): string[] {
  return raw.split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0)
}

async function uploadDishImage(dishId: string, file: File): Promise<string | null> {
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `dishes/${dishId}.${ext}`
  const { error } = await supabase.storage
    .from('restaurant-assets')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) return null
  const { data: { publicUrl } } = supabase.storage
    .from('restaurant-assets').getPublicUrl(path)
  return publicUrl + `?v=${Date.now()}`
}

export const MenuManager = memo(() => {
  const [dishes,     setDishes]    = useState<Dish[]>([])
  const [loading,    setLoading]   = useState(true)
  const [showForm,   setShowForm]  = useState(false)
  const [editing,    setEditing]   = useState<Dish | null>(null)
  const [form,       setForm]      = useState<DishForm>(FORM_EMPTY)
  const [saving,     setSaving]    = useState(false)
  const [formError,  setFormError] = useState<string | null>(null)
  const [filterCat,  setFilterCat] = useState<DishCategory | 'all'>('all')
  const [search,     setSearch]    = useState('')
  // Nombre del establecimiento
  const [bizName,    setBizName]   = useState('')
  const [savingName, setSavingName]= useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // Número de mesas
  const [tableCount, setTableCount] = useState('')
  const [savingTables, setSavingTables] = useState(false)
  // Categorías editables
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [editingCat, setEditingCat] = useState<DishCategory | null>(null)
  const [catLabel,   setCatLabel]   = useState('')
  const imageRef = useRef<HTMLInputElement>(null)

  const fetchDishes = useCallback(async () => {
    const { data } = await supabase.from('dishes').select('*').order('category').order('sort_order').order('name')
    setDishes(data || [])
    setLoading(false)
  }, [])

  // Cargar nombre y config desde Supabase
  useEffect(() => {
    fetchDishes()
    // Cargar configuración del restaurante
    supabase.from('restaurant_config').select('display_name, modules_enabled').single()
      .then(({ data }) => {
        if (data?.display_name) setBizName(data.display_name)
        const modules = data?.modules_enabled as Record<string, unknown> | null
        if (modules && typeof modules['table_count'] === 'number') {
          setTableCount(String(modules['table_count']))
        }
      })
  }, [fetchDishes])

  const openCreate = () => { setEditing(null); setForm(FORM_EMPTY); setFormError(null); setShowForm(true) }
  const openEdit   = (d: Dish) => { setEditing(d); setForm(dishToForm(d)); setFormError(null); setShowForm(true) }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { message.error('La imagen debe ser menor a 4MB'); return }
    const preview = URL.createObjectURL(file)
    setForm(p => ({ ...p, image_file: file, image_preview: preview }))
    e.target.value = ''
  }

  const handleSave = useCallback(async () => {
    if (!form.name.trim())    { setFormError('El nombre es requerido'); return }
    const price = parseFloat(form.price)
    if (isNaN(price) || price < 0) { setFormError('El precio debe ser un número válido'); return }
    setSaving(true); setFormError(null)

    try {
      const tagsArray = parseTags(form.tags)  // ← conversión correcta a array
      const payload: Record<string, unknown> = {
        name:        form.name.trim(),
        description: form.description.trim() || null,
        price,
        category:    form.category,
        tags:        tagsArray,
        available:   form.available,
        availability_status: form.available ? 'available' : 'out_of_stock',
      }

      let dishId: string
      if (editing) {
        const { error } = await supabase.from('dishes').update(payload).eq('id', editing.id)
        if (error) throw error
        dishId = editing.id
        message.success('Plato actualizado')
      } else {
        const { data, error } = await supabase.from('dishes').insert(payload).select('id').single()
        if (error) throw error
        dishId = data.id
        message.success('Plato creado')
      }

      // Subir imagen si hay nueva
      if (form.image_file) {
        const imgUrl = await uploadDishImage(dishId, form.image_file)
        if (imgUrl) {
          await supabase.from('dishes').update({ image_url: imgUrl }).eq('id', dishId)
        }
      }

      setShowForm(false); setForm(FORM_EMPTY); fetchDishes()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }, [form, editing, fetchDishes])

  const handleToggle = useCallback(async (d: Dish) => {
    const newAvail = !d.available
    const { error } = await supabase.from('dishes').update({
      available: newAvail,
      availability_status: newAvail ? 'available' : 'out_of_stock',
    }).eq('id', d.id)
    if (error) { message.error('Error: ' + error.message); return }
    setDishes(prev => prev.map(x => x.id === d.id ? { ...x, available: newAvail } : x))
  }, [])

  const handleDelete = useCallback(async (d: Dish) => {
    if (!window.confirm(`¿Eliminar "${d.name}"?`)) return
    const { error } = await supabase.from('dishes').delete().eq('id', d.id)
    if (error) { message.error('Error: ' + error.message); return }
    message.success('Plato eliminado')
    setDishes(prev => prev.filter(x => x.id !== d.id))
  }, [])

  // Guardar nombre del establecimiento
  const handleSaveBizName = async () => {
    if (!bizName.trim()) return
    setSavingName(true)
    try {
      // Intentar update primero, si no existe hacer insert
      const { error: updError } = await supabase.from('restaurant_config')
        .update({ display_name: bizName.trim() })
        .eq('id', (await supabase.from('restaurant_config').select('id').single()).data?.id ?? '')
      if (updError) {
        await supabase.from('restaurant_config').insert({ display_name: bizName.trim() })
      }
      message.success('Nombre actualizado')
    } catch {
      message.error('Error al guardar nombre')
    } finally {
      setSavingName(false)
    }
  }

  // Guardar número de mesas
  const handleSaveTables = async () => {
    const n = parseInt(tableCount)
    if (isNaN(n) || n < 1) { message.error('Ingresa un número válido'); return }
    setSavingTables(true)
    // Crear/actualizar mesas en la tabla mesas
    try {
      const { data: existing } = await supabase.from('mesas').select('numero').order('numero')
      const existingNums = (existing || []).map((m: { numero: number }) => m.numero)
      const desiredNums  = Array.from({ length: n }, (_, i) => i + 1)
      // Insertar las que faltan
      const toInsert = desiredNums.filter(x => !existingNums.includes(x))
        .map(numero => ({ numero, capacidad: 4, estado: 'libre', zona: 'principal', activa: true }))
      if (toInsert.length > 0) {
        await supabase.from('mesas').insert(toInsert)
      }
      // Desactivar las que sobran
      const toDisable = existingNums.filter(x => x > n)
      if (toDisable.length > 0) {
        await supabase.from('mesas').update({ activa: false }).in('numero', toDisable)
      }
      message.success(`Mesas actualizadas (${n} mesas activas)`)
    } catch { message.error('Error al actualizar mesas') }
    finally  { setSavingTables(false) }
  }

  // Guardar label de categoría
  const handleSaveCatLabel = (catValue: DishCategory) => {
    if (!catLabel.trim()) return
    setCategories(prev => prev.map(c => c.value === catValue ? { ...c, label: catLabel.trim() } : c))
    setEditingCat(null)
    message.success('Categoría actualizada')
  }

  const filtered = dishes.filter(d => {
    if (filterCat !== 'all' && d.category !== filterCat) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q) ||
             (d.tags ?? []).some(t => t.toLowerCase().includes(q))
    }
    return true
  })
  const stats = {
    total:    dishes.length,
    activos:  dishes.filter(d => d.available).length,
    inactivos:dishes.filter(d => !d.available).length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          🍽️ Menú
        </h2>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-2xl"
            style={{ backgroundColor: '#D8DAE4', color: '#5A617A', ...S.neoOutSm }}>
            ⚙️ Configurar
          </button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={openCreate}
            className="flex items-center gap-2 text-sm font-bold text-white bg-[#FF5722] px-4 py-2.5 rounded-2xl"
            style={S.coral}>
            + Nuevo plato
          </motion.button>
        </div>
      </div>

      {/* Panel configuración */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }}
            exit={{ opacity:0, height:0 }} className="overflow-hidden">
            <div className="rounded-3xl p-6 space-y-5" style={{ backgroundColor: '#D8DAE4', ...S.neoOut }}>
              <h3 className="font-bold text-[#2D3561]">⚙️ Configuración general</h3>

              {/* Nombre del establecimiento */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>
                  Nombre del establecimiento
                </label>
                <div className="flex gap-2">
                  <input value={bizName} onChange={e => setBizName(e.target.value)}
                    placeholder="Ej: Heladería Doña María"
                    className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                  <button onClick={handleSaveBizName} disabled={savingName}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#FF5722] shrink-0"
                    style={S.coral}>
                    {savingName ? '...' : 'Guardar'}
                  </button>
                </div>
                <p className="text-[10px] mt-1" style={{ color: '#8B92AA' }}>Se refleja en el menú digital de clientes</p>
              </div>

              {/* Número de mesas */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>
                  Número total de mesas
                </label>
                <div className="flex gap-2">
                  <input type="number" min="1" max="200" value={tableCount} onChange={e => setTableCount(e.target.value)}
                    placeholder="Ej: 15"
                    className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                  <button onClick={handleSaveTables} disabled={savingTables}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#FF5722] shrink-0"
                    style={S.coral}>
                    {savingTables ? '...' : 'Actualizar'}
                  </button>
                </div>
              </div>

              {/* Categorías editables */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>
                  Categorías del menú
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {categories.map(cat => (
                    <div key={cat.value} className="flex items-center gap-2 rounded-xl px-3 py-2"
                      style={{ backgroundColor: '#CDD0DC', ...S.neoIn }}>
                      <span>{cat.emoji}</span>
                      {editingCat === cat.value
                        ? <>
                            <input value={catLabel} onChange={e => setCatLabel(e.target.value)}
                              className="flex-1 bg-transparent text-sm outline-none font-bold"
                              style={{ color: '#2D3561' }}
                              autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSaveCatLabel(cat.value) }} />
                            <button onClick={() => handleSaveCatLabel(cat.value)}
                              style={{ color: '#FF5722', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}>✓</button>
                            <button onClick={() => setEditingCat(null)}
                              style={{ color: '#8B92AA', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                          </>
                        : <>
                            <span className="flex-1 text-sm font-bold text-[#2D3561]">{cat.label}</span>
                            <button onClick={() => { setEditingCat(cat.value); setCatLabel(cat.label) }}
                              style={{ color: '#8B92AA', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
                          </>
                      }
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total',     val: stats.total,     color: 'text-[#2D3561]'   },
          { label: 'Activos',   val: stats.activos,   color: 'text-emerald-600' },
          { label: 'Inactivos', val: stats.inactivos, color: 'text-red-500'     },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-3 text-center" style={{ backgroundColor: '#D8DAE4', ...S.neoOutSm }}>
            <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-[10px]" style={{ color: '#8B92AA' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#D8DAE4', ...S.neoIn }}>
          <span style={{ color: '#8B92AA' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar plato o tag..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: '#2D3561' }} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setFilterCat('all')}
            className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold"
            style={filterCat === 'all' ? { background: '#FF5722', color: 'white', ...S.coral } : { backgroundColor: '#D8DAE4', color: '#5A617A', ...S.neoOutSm }}>
            Todos
          </button>
          {categories.map(c => (
            <button key={c.value} onClick={() => setFilterCat(c.value)}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={filterCat === c.value ? { background: '#FF5722', color: 'white', ...S.coral } : { backgroundColor: '#D8DAE4', color: '#5A617A', ...S.neoOutSm }}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Formulario */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }}
            exit={{ opacity:0, height:0 }} transition={{ duration:0.35 }} className="overflow-hidden">
            <div className="rounded-3xl p-6" style={{ backgroundColor: '#D8DAE4', ...S.neoOut }}>
              <h3 className="font-bold text-[#2D3561] mb-5">
                {editing ? `✏️ Editar: ${editing.name}` : '➕ Nuevo plato'}
              </h3>

              {/* Foto del plato */}
              <div className="flex items-center gap-4 mb-5">
                <div onClick={() => imageRef.current?.click()}
                  className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 cursor-pointer flex items-center justify-center"
                  style={{ backgroundColor: '#CDD0DC', ...S.neoIn }}>
                  {form.image_preview
                    ? <img src={form.image_preview} alt="preview" className="w-full h-full object-cover" />
                    : <span className="text-3xl">{categories.find(c => c.value === form.category)?.emoji ?? '🍽️'}</span>
                  }
                </div>
                <div>
                  <p className="text-xs font-bold text-[#2D3561]">Foto del plato</p>
                  <p className="text-xs mt-0.5" style={{ color: '#8B92AA' }}>JPG/PNG/WebP · máx 4MB</p>
                  <button onClick={() => imageRef.current?.click()}
                    className="text-xs font-bold mt-1" style={{ color: '#FF5722', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {form.image_preview ? 'Cambiar imagen' : 'Agregar imagen'}
                  </button>
                </div>
                <input ref={imageRef} type="file" accept="image/*" className="sr-only" onChange={handleImageChange} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Nombre *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ej: Sundae Tropical"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Descripción</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Breve descripción del plato..." rows={2} maxLength={500}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Precio *</label>
                  <input type="number" step="0.01" min="0" value={form.price}
                    onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>
                    Tags <span style={{ color: '#8B92AA', fontWeight: 400, textTransform: 'none' }}>(separados por coma)</span>
                  </label>
                  <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
                    placeholder="vegano, sin gluten, picante"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                  {form.tags && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {parseTags(form.tags).map(t => (
                        <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#CDD0DC', color: '#5A617A' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Categoría *</label>
                  <div className="grid grid-cols-5 gap-2">
                    {categories.map(c => (
                      <button key={c.value} onClick={() => setForm(p => ({ ...p, category: c.value }))}
                        className="py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1"
                        style={form.category === c.value ? { background: '#FF5722', color: 'white', ...S.coral } : { backgroundColor: '#D8DAE4', color: '#5A617A', ...S.neoOutSm }}>
                        <span>{c.emoji}</span><span>{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`relative w-11 h-6 rounded-full transition-colors ${form.available ? 'bg-[#FF5722]' : 'bg-[#CDD0DC]'}`}
                      onClick={() => setForm(p => ({ ...p, available: !p.available }))}>
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.available ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-sm font-medium text-[#2D3561]">
                      {form.available ? '✅ Disponible en el menú' : '⏸️ No disponible'}
                    </span>
                  </label>
                </div>
              </div>

              {formError && <p className="text-xs text-red-500 font-medium mt-3">⚠️ {formError}</p>}

              <div className="flex gap-3 mt-5">
                <button onClick={() => { setShowForm(false); setForm(FORM_EMPTY) }}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold"
                  style={{ backgroundColor: '#D8DAE4', color: '#5A617A', ...S.neoOut }}>Cancelar</button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={saving}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#FF5722] ${saving ? 'opacity-70' : ''}`}
                  style={S.coral}>
                  {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear plato'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(6)].map((_,i) => (
            <div key={i} className="rounded-2xl h-24 animate-pulse" style={{ backgroundColor: '#D8DAE4', ...S.neoOut }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl p-12 text-center" style={{ backgroundColor: '#D8DAE4', ...S.neoIn }}>
          <p className="text-4xl mb-2">🍽️</p>
          <p className="font-bold text-[#2D3561]">Sin platos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(dish => {
            const cat = categories.find(c => c.value === dish.category)
            return (
              <motion.div key={dish.id} layout
                className={`rounded-2xl p-4 flex items-center gap-3 ${!dish.available ? 'opacity-60' : ''}`}
                style={{ backgroundColor: '#D8DAE4', ...S.neoOut }}>
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-2xl"
                  style={{ backgroundColor: '#CDD0DC', ...S.neoIn }}>
                  {dish.image_url
                    ? <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" loading="lazy" />
                    : cat?.emoji
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[#2D3561] text-sm truncate">{dish.name}</p>
                    {!dish.available && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold shrink-0">OFF</span>}
                  </div>
                  {(dish.tags ?? []).length > 0 && (
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {(dish.tags ?? []).slice(0,3).map(t => (
                        <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: '#CDD0DC', color: '#5A617A' }}>#{t}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-sm font-bold text-[#FF5722] mt-0.5">${dish.price.toFixed(2)}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => openEdit(dish)}
                    className="w-8 h-8 rounded-xl text-xs flex items-center justify-center"
                    style={{ ...S.neoOutSm, color: '#5A617A' }}>✏️</button>
                  <button onClick={() => handleToggle(dish)}
                    className="w-8 h-8 rounded-xl text-xs flex items-center justify-center"
                    style={S.neoOutSm}>{dish.available ? '⏸️' : '▶️'}</button>
                  <button onClick={() => handleDelete(dish)}
                    className="w-8 h-8 rounded-xl text-xs flex items-center justify-center text-red-400"
                    style={S.neoOutSm}>🗑️</button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
})
MenuManager.displayName = 'MenuManager'
