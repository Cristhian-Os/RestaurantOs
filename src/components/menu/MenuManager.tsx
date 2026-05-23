/**
 * MenuManager.tsx
 * Panel del admin para gestionar el menú completo:
 * crear, editar, activar/desactivar platos sin tocar Supabase.
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'
import type { Dish, DishCategory } from '../../types'

const S = {
  neoOut:  { boxShadow: '8px 8px 16px rgba(163,177,198,0.65),-8px -8px 16px rgba(255,255,255,0.75)' },
  neoOutSm:{ boxShadow: '4px 4px 10px rgba(163,177,198,0.6),-4px -4px 10px rgba(255,255,255,0.7)' },
  neoIn:   { boxShadow: 'inset 6px 6px 12px rgba(163,177,198,0.6),inset -6px -6px 12px rgba(255,255,255,0.7)' },
  coral:   { boxShadow: '8px 8px 16px rgba(255,87,34,0.35),-4px -4px 12px rgba(255,255,255,0.6)' },
} as const

const CATEGORIES: { value: DishCategory; label: string; emoji: string }[] = [
  { value: 'entrada',   label: 'Entrada',    emoji: '🥗' },
  { value: 'principal', label: 'Principal',  emoji: '🍽️' },
  { value: 'postre',    label: 'Postre',     emoji: '🍰' },
  { value: 'bebida',    label: 'Bebida',     emoji: '🥤' },
  { value: 'especial',  label: 'Especial',   emoji: '⭐' },
]

interface DishForm {
  name:        string
  description: string
  price:       string
  category:    DishCategory
  tags:        string
  available:   boolean
}

const FORM_EMPTY: DishForm = {
  name: '', description: '', price: '', category: 'principal', tags: '', available: true
}

function dishToForm(d: Dish): DishForm {
  return {
    name:        d.name,
    description: d.description ?? '',
    price:       d.price.toString(),
    category:    d.category,
    tags:        (d.tags ?? []).join(', '),
    available:   d.available,
  }
}

export const MenuManager = memo(() => {
  const [dishes,      setDishes]    = useState<Dish[]>([])
  const [loading,     setLoading]   = useState(true)
  const [showForm,    setShowForm]  = useState(false)
  const [editingDish, setEditing]   = useState<Dish | null>(null)
  const [form,        setForm]      = useState<DishForm>(FORM_EMPTY)
  const [saving,      setSaving]    = useState(false)
  const [formError,   setFormError] = useState<string | null>(null)
  const [filterCat,   setFilterCat] = useState<DishCategory | 'all'>('all')
  const [search,      setSearch]    = useState('')

  const fetchDishes = useCallback(async () => {
    const { data } = await supabase.from('dishes').select('*').order('category').order('sort_order').order('name')
    setDishes(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchDishes() }, [fetchDishes])

  const openCreate = () => {
    setEditing(null)
    setForm(FORM_EMPTY)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (dish: Dish) => {
    setEditing(dish)
    setForm(dishToForm(dish))
    setFormError(null)
    setShowForm(true)
  }

  const validate = (): string | null => {
    if (!form.name.trim())    return 'El nombre es requerido'
    if (!form.price.trim() || isNaN(parseFloat(form.price)) || parseFloat(form.price) < 0)
      return 'El precio debe ser un número válido'
    return null
  }

  const handleSave = useCallback(async () => {
    const err = validate()
    if (err) { setFormError(err); return }
    setSaving(true)
    setFormError(null)

    const payload = {
      name:               form.name.trim(),
      description:        form.description.trim() || null,
      price:              parseFloat(form.price),
      category:           form.category,
      available:          form.available,
      availability_status: form.available ? 'available' : 'out_of_stock',
      tags:               form.tags.split(',').map(t => t.trim()).filter(Boolean),
    }

    try {
      if (editingDish) {
        const { error } = await supabase.from('dishes').update(payload).eq('id', editingDish.id)
        if (error) throw error
        message.success('✅ Plato actualizado')
      } else {
        const { error } = await supabase.from('dishes').insert([payload])
        if (error) throw error
        message.success('✅ Plato creado')
      }
      setShowForm(false)
      fetchDishes()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }, [form, editingDish, fetchDishes])

  const handleToggle = useCallback(async (dish: Dish) => {
    const newAvailable = !dish.available
    const { error } = await supabase.from('dishes').update({
      available:           newAvailable,
      availability_status: newAvailable ? 'available' : 'out_of_stock',
    }).eq('id', dish.id)
    if (error) message.error('Error: ' + error.message)
    else { message.success(newAvailable ? 'Plato activado' : 'Plato desactivado'); fetchDishes() }
  }, [fetchDishes])

  const handleDelete = useCallback(async (dish: Dish) => {
    if (!confirm(`¿Eliminar "${dish.name}"? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('dishes').delete().eq('id', dish.id)
    if (error) message.error('Error al eliminar: ' + error.message)
    else { message.success('Plato eliminado'); fetchDishes() }
  }, [fetchDishes])

  const filtered = dishes.filter(d => {
    if (filterCat !== 'all' && d.category !== filterCat) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q)
    }
    return true
  })

  const stats = {
    total:      dishes.length,
    activos:    dishes.filter(d => d.available).length,
    inactivos:  dishes.filter(d => !d.available).length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            🍽️ Gestión de Menú
          </h2>
          <p className="text-sm text-[#9CA3AF] mt-0.5">
            {stats.total} platos · {stats.activos} activos · {stats.inactivos} inactivos
          </p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={openCreate}
          className="flex items-center gap-2 text-sm font-bold text-white bg-[#FF5722] px-4 py-2.5 rounded-2xl"
          style={S.coral}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
            <path d="M12 4v16m-8-8h16"/>
          </svg>
          Nuevo plato
        </motion.button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total',     val: stats.total,    color: 'text-[#2D3561]'   },
          { label: 'Activos',   val: stats.activos,  color: 'text-emerald-600' },
          { label: 'Inactivos', val: stats.inactivos,color: 'text-red-500'     },
        ].map(s => (
          <div key={s.label} className="bg-[#E8EAF0] rounded-2xl p-3 text-center" style={S.neoOutSm}>
            <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-[10px] text-[#9CA3AF]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        <div className="bg-[#E8EAF0] rounded-2xl px-4 py-3 flex items-center gap-3" style={S.neoIn}>
          <span className="text-[#9CA3AF]">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar plato..."
            className="flex-1 bg-transparent text-sm text-[#2D3561] outline-none placeholder-[#9CA3AF]" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setFilterCat('all')}
            className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold"
            style={filterCat === 'all' ? { background: '#FF5722', color: 'white', ...S.coral } : { background: '#E8EAF0', color: '#6B7280', ...S.neoOutSm }}>
            Todos
          </button>
          {CATEGORIES.map(c => (
            <button key={c.value} onClick={() => setFilterCat(c.value)}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={filterCat === c.value ? { background: '#FF5722', color: 'white', ...S.coral } : { background: '#E8EAF0', color: '#6B7280', ...S.neoOutSm }}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Formulario */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35 }}
            className="overflow-hidden">
            <div className="bg-[#E8EAF0] rounded-3xl p-6" style={S.neoOut}>
              <h3 className="font-bold text-[#2D3561] mb-5">
                {editingDish ? `✏️ Editar: ${editingDish.name}` : '➕ Nuevo plato'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Nombre *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ej: Tacos de birria"
                    className="w-full bg-[#E0E3EC] rounded-xl px-4 py-3 text-sm text-[#2D3561] outline-none"
                    style={S.neoIn} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Descripción</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Breve descripción del plato..."
                    rows={2} maxLength={500}
                    className="w-full bg-[#E0E3EC] rounded-xl px-4 py-3 text-sm text-[#2D3561] outline-none resize-none"
                    style={S.neoIn} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Precio *</label>
                  <input type="number" step="0.01" min="0" value={form.price}
                    onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-[#E0E3EC] rounded-xl px-4 py-3 text-sm text-[#2D3561] outline-none"
                    style={S.neoIn} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Tags (separados por coma)</label>
                  <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
                    placeholder="vegano, sin gluten, picante"
                    className="w-full bg-[#E0E3EC] rounded-xl px-4 py-3 text-sm text-[#2D3561] outline-none"
                    style={S.neoIn} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Categoría *</label>
                  <div className="grid grid-cols-5 gap-2">
                    {CATEGORIES.map(c => (
                      <button key={c.value} onClick={() => setForm(p => ({ ...p, category: c.value }))}
                        className="py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1"
                        style={form.category === c.value ? { background: '#FF5722', color: 'white', ...S.coral } : { background: '#E8EAF0', color: '#6B7280', ...S.neoOutSm }}>
                        <span>{c.emoji}</span>
                        <span>{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`relative w-11 h-6 rounded-full transition-colors ${form.available ? 'bg-[#FF5722]' : 'bg-[#D1D5E0]'}`}
                      onClick={() => setForm(p => ({ ...p, available: !p.available }))}>
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.available ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-sm font-medium text-[#2D3561]">
                      {form.available ? '✅ Disponible en el menú' : '⏸️ No disponible'}
                    </span>
                  </label>
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-500 font-medium mt-3">⚠️ {formError}</p>
              )}

              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-[#6B7280]" style={S.neoOut}>
                  Cancelar
                </button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={saving}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#FF5722] ${saving ? 'opacity-70' : ''}`}
                  style={S.coral}>
                  {saving ? 'Guardando...' : editingDish ? 'Guardar cambios' : 'Crear plato'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista de platos */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-[#E8EAF0] rounded-2xl h-24 animate-pulse" style={S.neoOut} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#E8EAF0] rounded-3xl p-12 text-center" style={S.neoIn}>
          <p className="text-4xl mb-2">🍽️</p>
          <p className="font-bold text-[#2D3561]">Sin platos</p>
          <p className="text-sm text-[#9CA3AF] mt-1">Crea el primer plato del menú</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(dish => {
            const cat = CATEGORIES.find(c => c.value === dish.category)
            return (
              <motion.div key={dish.id} layout
                className={`bg-[#E8EAF0] rounded-2xl p-4 flex items-center gap-3 ${!dish.available ? 'opacity-60' : ''}`}
                style={S.neoOut}>
                {/* Emoji categoría */}
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={S.neoIn}>
                  {dish.image_url
                    ? <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover rounded-xl" loading="lazy" />
                    : cat?.emoji}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[#2D3561] text-sm truncate">{dish.name}</p>
                    {!dish.available && (
                      <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold shrink-0">OFF</span>
                    )}
                  </div>
                  <p className="text-xs text-[#9CA3AF] truncate">{dish.description}</p>
                  <p className="text-sm font-bold text-[#FF5722] mt-0.5">${dish.price.toFixed(2)}</p>
                </div>

                {/* Acciones */}
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => openEdit(dish)}
                    className="w-8 h-8 rounded-xl text-xs flex items-center justify-center text-[#6B7280]"
                    style={S.neoOutSm} title="Editar">✏️</button>
                  <button onClick={() => handleToggle(dish)}
                    className="w-8 h-8 rounded-xl text-xs flex items-center justify-center"
                    style={S.neoOutSm} title={dish.available ? 'Desactivar' : 'Activar'}>
                    {dish.available ? '⏸️' : '▶️'}
                  </button>
                  <button onClick={() => handleDelete(dish)}
                    className="w-8 h-8 rounded-xl text-xs flex items-center justify-center text-red-400"
                    style={S.neoOutSm} title="Eliminar">🗑️</button>
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
