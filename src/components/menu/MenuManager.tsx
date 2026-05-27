/**
 * MenuManager.tsx v3
 * CORRECCIONES:
 *  1. Emoji picker usa portal (ReactDOM.createPortal) → sin overflow-hidden
 *  2. Eliminación de platos: borra detalles_pedidos relacionados antes (FK ya es SET NULL en DB)
 *  3. Edición: payload incluye updated_at explícito y maneja errores con detalle
 *  4. Edición de emoji en categorías existentes
 *  5. Formulario sin overflow-hidden (animación via opacity+y transform)
 */
import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'
import type { Dish, DishCategory } from '../../types'

const S = {
  neoOut:  { boxShadow: 'var(--shadow-out)' },
  neoOutSm:{ boxShadow: 'var(--shadow-out-sm)' },
  neoIn:   { boxShadow: 'var(--shadow-in)' },
  coral:   { boxShadow: 'var(--shadow-coral)' },
} as const

interface Category { value: string; label: string; emoji: string }

const DEFAULT_CATEGORIES: Category[] = [
  { value: 'entrada',   label: 'Entrada',   emoji: '🥗' },
  { value: 'principal', label: 'Principal', emoji: '🍽️' },
  { value: 'postre',    label: 'Postre',    emoji: '🍰' },
  { value: 'bebida',    label: 'Bebida',    emoji: '🥤' },
  { value: 'especial',  label: 'Especial',  emoji: '⭐' },
]

const EMOJI_OPTIONS = [
  // 🥩 Carnes & Parrilla
  '🥩','🍖','🍗','🥓','🌭','🍔','🌮','🥙','🫕','🥘','🍲','🫙','🥚','🍳','🧆','🧈',
  // 🦀 Mariscos & Comida de Mar
  '🍣','🦀','🦞','🦐','🦑','🐙','🍤','🐟','🍱','🥟','🍜','🍝','🍚','🍛',
  // 🍰 Postres & Heladería
  '🍰','🎂','🧁','🍮','🍭','🍬','🍫','🍩','🍪','🥞','🧇','🍡','🍦','🍧','🍨','🍿','🍯',
  // 🍕 Comida Rápida
  '🍕','🍟','🫓','🥨','🧀','🥪','🌯','🫔',
  // 🥗 Fit & Saludable
  '🥗','🥦','🥕','🥑','🫑','🌽','🥒','🧄','🧅','🫛','🥬','🌿','🍃','🫚','🫘',
  // 🍎 Frutas
  '🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥭','🍍','🥥','🍌','🍐','🍈','🍉','🫐','🍅','🥝','🫒','🍆',
  // ☕ Bebidas & Cafetería
  '☕','🍵','🧃','🥤','🍷','🍸','🍹','🍺','🥂','🍾','🧋','🫖','🍶','🥛','🧉',
  // ⭐ Especiales & Comodines
  '⭐','✨','🔥','💎','🏆','🎉','👑','💫','🎊','🌟','🍽️',
]

interface DishForm {
  name:          string
  description:   string
  price:         string
  category:      DishCategory
  tags:          string
  available:     boolean
  has_sizes:     boolean
  image_file?:   File | null
  image_preview? :string | null
}

const FORM_EMPTY: DishForm = {
  name:'', description:'', price:'', category:'principal',
  tags:'', available:true, has_sizes:false, image_file:null, image_preview:null,
}

function dishToForm(d: Dish): DishForm {
  return {
    name:          d.name,
    description:   d.description ?? '',
    price:         d.price.toString(),
    category:      d.category,
    tags:          (d.tags ?? []).join(', '),
    available:     d.available,
    has_sizes:     d.has_sizes ?? false,
    image_file:    null,
    image_preview: d.image_url ?? null,
  }
}

function parseTags(raw: string): string[] {
  return raw.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0)
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

// ── Portal para el emoji picker (evita overflow-hidden) ──────
interface EmojiPortalProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onSelect:  (e: string) => void
  onClose:   () => void
}
function EmojiPortal({ anchorRef, onSelect, onClose }: EmojiPortalProps) {
  const [pos, setPos] = useState({ top: 0, left: 0 })
  // Ref al contenedor del portal para distinguir clicks DENTRO vs FUERA
  const portalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8 + window.scrollY, left: r.left + window.scrollX })
    }
    const handleClick = (e: MouseEvent) => {
      // Si el click fue DENTRO del portal → no cerrar (permite seleccionar emoji)
      if (portalRef.current && portalRef.current.contains(e.target as Node)) return
      // Si el click fue FUERA del anchor button → cerrar
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [anchorRef, onClose])

  return createPortal(
    <div
      ref={portalRef}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: pos.top,
        left: Math.min(pos.left, window.innerWidth - 320),
        zIndex: 99999,
        backgroundColor: 'var(--bg, #D8DAE4)',
        borderRadius: '1rem',
        padding: '0.75rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(10, 1fr)',
        gap: '0.2rem',
        width: 320,
        maxHeight: 280,
        overflowY: 'auto',
        boxShadow: 'var(--shadow-out)',
        border: '1px solid var(--glass-border, rgba(255,255,255,0.5))',
      }}
    >
      {EMOJI_OPTIONS.map(e => (
        <button
          key={e}
          onClick={() => { onSelect(e); onClose() }}
          style={{
            width: 28, height: 28, borderRadius: '0.4rem',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.1s ease',
          }}
          onMouseEnter={e2 => (e2.currentTarget.style.transform = 'scale(1.3)')}
          onMouseLeave={e2 => (e2.currentTarget.style.transform = 'scale(1)')}
        >
          {e}
        </button>
      ))}
    </div>,
    document.body
  )
}

export const MenuManager = memo(() => {
  const [dishes,      setDishes]      = useState<Dish[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [editing,     setEditing]     = useState<Dish | null>(null)
  const [form,        setForm]        = useState<DishForm>(FORM_EMPTY)
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState<string | null>(null)
  const [filterCat,   setFilterCat]   = useState<string>('all')
  const [search,      setSearch]      = useState('')
  const [bizName,     setBizName]     = useState('')
  const [savingName,  setSavingName]  = useState(false)
  const [showSettings,setShowSettings]= useState(false)
  const [tableCount,  setTableCount]  = useState('')
  const [savingTables,setSavingTables]= useState(false)
  const [categories,  setCategories]  = useState<Category[]>(DEFAULT_CATEGORIES)
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatEmoji, setNewCatEmoji] = useState('🍽️')
  const [savingCat,   setSavingCat]   = useState(false)
  const [editingCat,  setEditingCat]  = useState<string | null>(null)
  const [catLabel,    setCatLabel]    = useState('')
  // Confirmación de borrado inline (reemplaza window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Emoji pickers
  const [showNewCatPicker, setShowNewCatPicker] = useState(false)
  const [editEmojiForCat,  setEditEmojiForCat]  = useState<string | null>(null)
  const newCatEmojiRef  = useRef<HTMLButtonElement>(null)
  const editEmojiRefs   = useRef<Record<string, HTMLButtonElement | null>>({})
  const imageRef        = useRef<HTMLInputElement>(null)

  const fetchDishes = useCallback(async () => {
    const { data } = await supabase.from('dishes').select('*').order('category').order('sort_order').order('name')
    setDishes(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchDishes()
    supabase.from('restaurant_config').select('display_name, modules_enabled').single()
      .then(({ data }) => {
        if (data?.display_name) setBizName(data.display_name)
        const modules = data?.modules_enabled as Record<string, unknown> | null
        if (modules && typeof modules['table_count'] === 'number') {
          setTableCount(String(modules['table_count']))
        }
        if (modules && Array.isArray(modules['categories'])) {
          const saved = modules['categories'] as Category[]
          if (saved.length > 0) setCategories(saved)
        }
      })
  }, [fetchDishes])

  const openCreate = () => { setEditing(null); setForm(FORM_EMPTY); setFormError(null); setShowForm(true) }
  const openEdit   = (d: Dish) => {
    setEditing(d)
    setForm(dishToForm(d))
    setFormError(null)
    setShowForm(true)
    // Scroll al formulario
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100)
  }

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
      const tagsArray = parseTags(form.tags)
      const payload: Record<string, unknown> = {
        name:                form.name.trim(),
        description:         form.description.trim() || null,
        price,
        category:            form.category,
        tags:                tagsArray,
        available:           form.available,
        has_sizes:           form.has_sizes,
        availability_status: form.available ? 'available' : 'out_of_stock',
        updated_at:          new Date().toISOString(),
      }

      let dishId: string
      if (editing) {
        const { error } = await supabase.from('dishes').update(payload).eq('id', editing.id)
        if (error) throw new Error(`Error al actualizar: ${error.message} (código: ${error.code})`)
        dishId = editing.id
        message.success('✅ Plato actualizado')
      } else {
        const { data, error } = await supabase.from('dishes').insert(payload).select('id').single()
        if (error) throw new Error(`Error al crear: ${error.message}`)
        dishId = data.id
        message.success('✅ Plato creado')
      }

      if (form.image_file) {
        const imgUrl = await uploadDishImage(dishId, form.image_file)
        if (imgUrl) {
          await supabase.from('dishes').update({ image_url: imgUrl }).eq('id', dishId)
        }
      }

      setShowForm(false); setForm(FORM_EMPTY); fetchDishes()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al guardar'
      setFormError(msg)
      console.error('[MenuManager handleSave]', e)
    } finally {
      setSaving(false)
    }
  }, [form, editing, fetchDishes])

  const handleToggle = useCallback(async (d: Dish) => {
    const newAvail = !d.available
    const { error } = await supabase.from('dishes').update({
      available: newAvail,
      availability_status: newAvail ? 'available' : 'out_of_stock',
      updated_at: new Date().toISOString(),
    }).eq('id', d.id)
    if (error) { message.error('Error: ' + error.message); return }
    setDishes(prev => prev.map(x => x.id === d.id ? { ...x, available: newAvail } : x))
  }, [])

  // Primer click → pide confirmación inline; segundo click → borra
  const requestDelete = useCallback((id: string) => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    setConfirmDeleteId(id)
    // Auto-cancelar tras 4 s si no confirma
    confirmTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 4000)
  }, [])

  const handleDelete = useCallback(async (d: Dish) => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    setConfirmDeleteId(null)
    try {
      const { error } = await supabase.from('dishes').delete().eq('id', d.id)
      if (error) throw error
      message.success(`🗑️ "${d.name}" eliminado`)
      setDishes(prev => prev.filter(x => x.id !== d.id))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar'
      message.error(`❌ ${msg}`)
      console.error('[MenuManager delete]', e)
    }
  }, [])

  const persistCategories = async (cats: Category[]) => {
    const { data: cfg } = await supabase.from('restaurant_config').select('id, modules_enabled').single()
    if (!cfg) return
    const modules = (cfg.modules_enabled as Record<string, unknown>) ?? {}
    await supabase.from('restaurant_config')
      .update({ modules_enabled: { ...modules, categories: cats } })
      .eq('id', cfg.id)
  }

  const handleAddCategory = async () => {
    if (!newCatLabel.trim()) return
    const value = newCatLabel.trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
      || `cat_${Date.now()}`
    if (categories.find(c => c.value === value)) {
      message.warning('Ya existe una categoría con ese nombre')
      return
    }
    setSavingCat(true)
    const newCat: Category = { value, label: newCatLabel.trim(), emoji: newCatEmoji }
    const updated = [...categories, newCat]
    setCategories(updated)
    await persistCategories(updated)
    setNewCatLabel(''); setNewCatEmoji('🍽️'); setSavingCat(false)
    message.success(`Categoría "${newCat.label}" creada`)
  }

  const handleDeleteCategory = async (value: string) => {
    const inUse = dishes.some(d => d.category === value)
    if (inUse) { message.warning('No puedes eliminar una categoría que tiene platos asignados'); return }
    const updated = categories.filter(c => c.value !== value)
    setCategories(updated)
    await persistCategories(updated)
    message.success('Categoría eliminada')
  }

  // Guardar label de categoría
  const handleSaveCatLabel = async (catValue: string) => {
    if (!catLabel.trim()) return
    const updated = categories.map(c => c.value === catValue ? { ...c, label: catLabel.trim() } : c)
    setCategories(updated)
    await persistCategories(updated)
    setEditingCat(null)
    message.success('Categoría actualizada')
  }

  // Guardar emoji de categoría existente
  const handleSaveCatEmoji = async (catValue: string, emoji: string) => {
    const updated = categories.map(c => c.value === catValue ? { ...c, emoji } : c)
    setCategories(updated)
    await persistCategories(updated)
    setEditEmojiForCat(null)
    message.success('Emoji actualizado')
  }

  const handleSaveBizName = async () => {
    if (!bizName.trim()) return
    setSavingName(true)
    try {
      const { data: cfg } = await supabase.from('restaurant_config').select('id').single()
      if (cfg) {
        await supabase.from('restaurant_config').update({ display_name: bizName.trim() }).eq('id', cfg.id)
      }
      message.success('Nombre actualizado')
    } catch { message.error('Error al guardar nombre') }
    finally { setSavingName(false) }
  }

  const handleSaveTables = async () => {
    const n = parseInt(tableCount)
    if (isNaN(n) || n < 1) { message.error('Ingresa un número válido'); return }
    setSavingTables(true)
    try {
      const { data: existing } = await supabase.from('mesas').select('numero').order('numero')
      const existingNums  = (existing || []).map((m: { numero: number }) => m.numero)
      const toInsert      = Array.from({ length: n }, (_, i) => i + 1)
        .filter(x => !existingNums.includes(x))
        .map(numero => ({ numero, capacidad: 4, estado: 'libre', zona: 'principal', activa: true }))
      if (toInsert.length > 0) await supabase.from('mesas').insert(toInsert)
      const toDisable = existingNums.filter(x => x > n)
      if (toDisable.length > 0) await supabase.from('mesas').update({ activa: false }).in('numero', toDisable)
      message.success(`Mesas actualizadas (${n} mesas activas)`)
    } catch { message.error('Error al actualizar mesas') }
    finally { setSavingTables(false) }
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
    total:     dishes.length,
    activos:   dishes.filter(d => d.available).length,
    inactivos: dishes.filter(d => !d.available).length,
  }

  const bg    = 'var(--bg, #D8DAE4)'
  const bgSurf= 'var(--bg-surface, #CDD0DC)'
  const txt   = 'var(--text-primary, #2D3561)'
  const txtMid= 'var(--text-secondary, #5A617A)'
  const txtLt = 'var(--text-muted, #8B92AA)'
  const acc   = 'var(--accent, #FF5722)'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold" style={{ fontFamily: 'DM Sans, sans-serif', color: txt }}>
          🍽️ Menú
        </h2>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-2xl"
            style={{ backgroundColor: bg, color: txtMid, ...S.neoOutSm }}>
            ⚙️ Configurar
          </button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={openCreate}
            className="flex items-center gap-2 text-sm font-bold text-white px-4 py-2.5 rounded-2xl"
            style={{ backgroundColor: acc, ...S.coral }}>
            + Nuevo plato
          </motion.button>
        </div>
      </div>

      {/* Panel configuración — SIN overflow-hidden para evitar clipping */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="glass-card no-hover rounded-3xl p-6 space-y-5">
              <h3 className="font-bold" style={{ color: txt }}>⚙️ Configuración general</h3>

              {/* Nombre del establecimiento */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: txtLt }}>
                  Nombre del establecimiento
                </label>
                <div className="flex gap-2">
                  <input value={bizName} onChange={e => setBizName(e.target.value)}
                    placeholder="Ej: Heladería Doña María"
                    className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                  <button onClick={handleSaveBizName} disabled={savingName}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white shrink-0"
                    style={{ backgroundColor: acc, ...S.coral }}>
                    {savingName ? '...' : 'Guardar'}
                  </button>
                </div>
              </div>

              {/* Número de mesas */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: txtLt }}>
                  Número total de mesas
                </label>
                <div className="flex gap-2">
                  <input type="number" min="1" max="200" value={tableCount}
                    onChange={e => setTableCount(e.target.value)} placeholder="Ej: 15"
                    className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                  <button onClick={handleSaveTables} disabled={savingTables}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white shrink-0"
                    style={{ backgroundColor: acc, ...S.coral }}>
                    {savingTables ? '...' : 'Actualizar'}
                  </button>
                </div>
              </div>

              {/* Categorías */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: txtLt }}>
                  Categorías del menú
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  {categories.map(cat => (
                    <div key={cat.value}
                      className="flex items-center gap-2 rounded-xl px-3 py-2"
                      style={{ backgroundColor: bgSurf, ...S.neoIn }}>

                      {/* Emoji — editable */}
                      <button
                        ref={el => { editEmojiRefs.current[cat.value] = el }}
                        onClick={() => setEditEmojiForCat(editEmojiForCat === cat.value ? null : cat.value)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
                        title="Cambiar emoji"
                      >
                        {cat.emoji}
                      </button>

                      {/* Emoji portal para categoría existente */}
                      {editEmojiForCat === cat.value && (
                        <EmojiPortal
                          anchorRef={{ current: editEmojiRefs.current[cat.value] }}
                          onSelect={e => handleSaveCatEmoji(cat.value, e)}
                          onClose={() => setEditEmojiForCat(null)}
                        />
                      )}

                      {editingCat === cat.value
                        ? <>
                            <input value={catLabel} onChange={e => setCatLabel(e.target.value)}
                              className="flex-1 bg-transparent text-sm outline-none font-bold"
                              style={{ color: txt }}
                              autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSaveCatLabel(cat.value) }} />
                            <button onClick={() => handleSaveCatLabel(cat.value)}
                              style={{ color: acc, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}>✓</button>
                            <button onClick={() => setEditingCat(null)}
                              style={{ color: txtLt, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                          </>
                        : <>
                            <span className="flex-1 text-sm font-bold" style={{ color: txt }}>{cat.label}</span>
                            <button onClick={() => { setEditingCat(cat.value); setCatLabel(cat.label) }}
                              style={{ color: txtLt, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }} title="Editar nombre">✏️</button>
                            {!['entrada','principal','postre','bebida','especial'].includes(cat.value) && (
                              <button onClick={() => handleDeleteCategory(cat.value)}
                                style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }} title="Eliminar">🗑️</button>
                            )}
                          </>
                      }
                    </div>
                  ))}
                </div>

                {/* Nueva categoría */}
                <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: bgSurf, ...S.neoIn }}>
                  <p className="text-xs font-bold" style={{ color: txtLt }}>+ Nueva categoría</p>
                  <div className="flex gap-2">
                    {/* Botón emoji con portal */}
                    <button
                      ref={newCatEmojiRef}
                      onClick={() => setShowNewCatPicker(p => !p)}
                      className="w-11 h-11 rounded-xl text-xl flex items-center justify-center"
                      style={{ backgroundColor: bg, border: 'none', cursor: 'pointer', ...S.neoOutSm }}>
                      {newCatEmoji}
                    </button>

                    {showNewCatPicker && (
                      <EmojiPortal
                        anchorRef={newCatEmojiRef}
                        onSelect={e => setNewCatEmoji(e)}
                        onClose={() => setShowNewCatPicker(false)}
                      />
                    )}

                    <input value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)}
                      placeholder="Nombre de categoría"
                      onKeyDown={e => { if (e.key === 'Enter') handleAddCategory() }}
                      className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                      style={{ backgroundColor: bg, color: txt, border: 'none', ...S.neoIn }} />
                    <motion.button whileTap={{ scale: 0.95 }} onClick={handleAddCategory}
                      disabled={savingCat || !newCatLabel.trim()}
                      className="px-3 py-2 rounded-xl text-sm font-bold text-white shrink-0"
                      style={{
                        backgroundColor: !newCatLabel.trim() ? bgSurf : acc,
                        border: 'none', cursor: !newCatLabel.trim() ? 'not-allowed' : 'pointer',
                        ...(!newCatLabel.trim() ? S.neoIn : S.coral)
                      }}>
                      {savingCat ? '...' : '✓'}
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total',     val: stats.total,     color: txt         },
          { label: 'Activos',   val: stats.activos,   color: '#10B981'   },
          { label: 'Inactivos', val: stats.inactivos, color: '#EF4444'   },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-3 text-center" style={{ backgroundColor: bg, ...S.neoOutSm }}>
            <p className="text-xl font-bold" style={{ color: s.color }}>{s.val}</p>
            <p className="text-[10px]" style={{ color: txtLt }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: bg, ...S.neoIn }}>
          <span style={{ color: txtLt }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar plato o tag..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: txt }} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button onClick={() => setFilterCat('all')}
            className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold"
            style={filterCat === 'all' ? { background: acc, color: '#fff', ...S.coral } : { backgroundColor: bg, color: txtMid, ...S.neoOutSm }}>
            Todos
          </button>
          {categories.map(c => (
            <button key={c.value} onClick={() => setFilterCat(c.value)}
              className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold"
              style={filterCat === c.value ? { background: acc, color: '#fff', ...S.coral } : { backgroundColor: bg, color: txtMid, ...S.neoOutSm }}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Formulario — animado SIN overflow-hidden */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="glass-card no-hover rounded-3xl p-6">
              <h3 className="font-bold mb-5" style={{ color: txt }}>
                {editing ? `✏️ Editar: ${editing.name}` : '➕ Nuevo plato'}
              </h3>

              {/* Foto */}
              <div className="flex items-center gap-4 mb-5">
                <div onClick={() => imageRef.current?.click()}
                  className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 cursor-pointer flex items-center justify-center"
                  style={{ backgroundColor: bgSurf, ...S.neoIn }}>
                  {form.image_preview
                    ? <img src={form.image_preview} alt="preview" className="w-full h-full object-cover" />
                    : <span className="text-3xl">{categories.find(c => c.value === form.category)?.emoji ?? '🍽️'}</span>
                  }
                </div>
                <div>
                  <p className="text-xs font-bold" style={{ color: txt }}>Foto del plato</p>
                  <p className="text-xs mt-0.5" style={{ color: txtLt }}>JPG/PNG/WebP · máx 4MB</p>
                  <button onClick={() => imageRef.current?.click()}
                    className="text-xs font-bold mt-1"
                    style={{ color: acc, background: 'none', border: 'none', cursor: 'pointer' }}>
                    {form.image_preview ? 'Cambiar imagen' : 'Agregar imagen'}
                  </button>
                </div>
                <input ref={imageRef} type="file" accept="image/*" className="sr-only" onChange={handleImageChange} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: txtLt }}>Nombre *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ej: Sundae Tropical"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: txtLt }}>Descripción</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Breve descripción..." rows={2} maxLength={500}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                    style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: txtLt }}>Precio *</label>
                  <input type="number" step="0.01" min="0" value={form.price}
                    onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: txtLt }}>
                    Tags <span style={{ color: txtLt, fontWeight: 400, textTransform: 'none' }}>(separados por coma)</span>
                  </label>
                  <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
                    placeholder="vegano, sin gluten, picante"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                  {form.tags && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {parseTags(form.tags).map(t => (
                        <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: bgSurf, color: txtMid }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: txtLt }}>Categoría *</label>
                  <div className="grid grid-cols-5 gap-2">
                    {categories.map(c => (
                      <button key={c.value} onClick={() => setForm(p => ({ ...p, category: c.value }))}
                        className="py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all w-full"
                        style={form.category === c.value
                          ? { background: acc, color: 'white', ...S.coral }
                          : { backgroundColor: bg, color: txtMid, ...S.neoOutSm }}>
                        <span className="text-base leading-none">{c.emoji}</span>
                        <span className="truncate w-full text-center text-[10px]">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-2 flex flex-col gap-3">
                  {/* Disponibilidad */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`relative w-11 h-6 rounded-full transition-colors`}
                      style={{ backgroundColor: form.available ? acc : bgSurf }}
                      onClick={() => setForm(p => ({ ...p, available: !p.available }))}>
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.available ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-sm font-medium" style={{ color: txt }}>
                      {form.available ? '✅ Disponible en el menú' : '⏸️ No disponible'}
                    </span>
                  </label>

                  {/* Tamaños */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative w-11 h-6 rounded-full transition-colors"
                      style={{ backgroundColor: form.has_sizes ? acc : bgSurf }}
                      onClick={() => setForm(p => ({ ...p, has_sizes: !p.has_sizes }))}>
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.has_sizes ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <div>
                      <span className="text-sm font-medium" style={{ color: txt }}>
                        {form.has_sizes ? '📏 Tiene tamaños (Pequeño / Mediano / Grande)' : '1️⃣ Tamaño único'}
                      </span>
                      <p className="text-[11px]" style={{ color: txtLt }}>
                        {form.has_sizes ? 'El cliente podrá elegir tamaño al pedir' : 'Sin selector de tamaño para el cliente'}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {formError && <p className="text-xs text-red-500 font-medium mt-3">⚠️ {formError}</p>}

              <div className="flex gap-3 mt-5">
                <button onClick={() => { setShowForm(false); setForm(FORM_EMPTY) }}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold"
                  style={{ backgroundColor: bg, color: txtMid, ...S.neoOut }}>Cancelar</button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={saving}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                  style={{ backgroundColor: acc, opacity: saving ? 0.7 : 1, ...S.coral }}>
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
            <div key={i} className="rounded-2xl h-24 skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl p-12 text-center" style={{ backgroundColor: bg, ...S.neoIn }}>
          <p className="text-4xl mb-2">🍽️</p>
          <p className="font-bold" style={{ color: txt }}>Sin platos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(dish => {
            const cat = categories.find(c => c.value === dish.category)
            return (
              <motion.div key={dish.id} layout
                className={`glass-card-sm p-4 flex items-center gap-3 ${!dish.available ? 'opacity-60' : ''}`}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.15 }}>
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-2xl"
                  style={{ backgroundColor: bgSurf, ...S.neoIn }}>
                  {dish.image_url
                    ? <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" loading="lazy" />
                    : cat?.emoji
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm truncate" style={{ color: txt }}>{dish.name}</p>
                    {!dish.available && <span className="tag-sm tag-red shrink-0">OFF</span>}
                    {dish.has_sizes   && <span className="tag-sm tag-blue shrink-0">📏</span>}
                  </div>
                  {(dish.tags ?? []).length > 0 && (
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {(dish.tags ?? []).slice(0,3).map(t => (
                        <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: bgSurf, color: txtMid }}>#{t}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-sm font-bold mt-0.5" style={{ color: acc }}>${dish.price.toFixed(2)}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => openEdit(dish)}
                    className="w-8 h-8 rounded-xl text-xs flex items-center justify-center transition-transform hover:scale-110"
                    style={{ ...S.neoOutSm, color: txtMid }}>✏️</button>
                  <button onClick={() => handleToggle(dish)}
                    className="w-8 h-8 rounded-xl text-xs flex items-center justify-center transition-transform hover:scale-110"
                    style={S.neoOutSm}>{dish.available ? '⏸️' : '▶️'}</button>

                  {/* Borrado con confirmación inline — sin window.confirm */}
                  {confirmDeleteId === dish.id ? (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleDelete(dish)}
                        className="w-8 h-8 rounded-xl text-xs flex items-center justify-center font-bold text-white animate-pulse"
                        style={{ backgroundColor: '#EF4444', boxShadow: '0 0 0 2px #EF4444' }}
                        title="Confirmar eliminación">
                        ✓
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="w-8 h-8 rounded-xl text-xs flex items-center justify-center"
                        style={{ ...S.neoOutSm, color: txtMid }}
                        title="Cancelar">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => requestDelete(dish.id)}
                      className="w-8 h-8 rounded-xl text-xs flex items-center justify-center text-red-400 transition-transform hover:scale-110"
                      style={S.neoOutSm}
                      title="Eliminar plato">
                      🗑️
                    </button>
                  )}
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
