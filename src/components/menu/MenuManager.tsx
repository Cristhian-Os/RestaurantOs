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
import { VoiceButton } from '../VoiceButton'
import { VoiceMenuModal } from './VoiceMenuModal'
import { limpiarTranscripcion } from '../../services/voiceText'
import type { Dish, DishCategory, DishOptionGroup, OptionGroupV2 } from '../../types'
import { useMenuConfig } from '../../hooks/useMenuConfig'
import { gruposDe } from '../../services/menuOptions'
import { DishGroupsEditor, validarGrupos } from './DishGroupsEditor'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Toggle } from '../ui/Toggle'
import { ModuleHeader, StatCard } from '../tasks/ModuleHeader'

const S = {
  neoOut:  { border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-sm)' },
  neoOutSm:{ border: '1px solid var(--w-border-strong)' },
  neoIn:   { boxShadow: 'none', border: '1px solid var(--w-border)' },
  coral:   { boxShadow: 'var(--w-shadow-terra)' },
} as const

interface Category { value: string; label: string; emoji: string; color?: string }

interface PendingResena {
  id:             string
  cliente_nombre: string
  rating:         number
  comentario:     string | null
  created_at:     string
  dishes:         { name: string } | null
}
interface InteraccionRow {
  dish_id:           string
  likes_count:       number
  dislikes_count:    number
  rating_avg:        number | null
  rating_count:      number
  comentarios_count: number
  total_vendido:     number
  es_popular:        boolean
}
interface ReportedComment {
  id:              string
  cliente_nombre:  string
  texto:           string
  reportado_count: number
  created_at:      string
  dishes:          { name: string } | null
}

const DEFAULT_CATEGORIES: Category[] = [
  { value: 'entrada',   label: 'Entrada',   emoji: '🥗', color: '#10B981' },
  { value: 'principal', label: 'Principal', emoji: '🍽️', color: '#3B82F6' },
  { value: 'postre',    label: 'Postre',    emoji: '🍰', color: '#EC4899' },
  { value: 'bebida',    label: 'Bebida',    emoji: '🥤', color: '#06B6D4' },
  { value: 'especial',  label: 'Especial',  emoji: '⭐', color: '#F59E0B' },
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

const COLOR_PALETTE = [
  { name: 'Coral/Terracota', value: '#FF6B4A' },
  { name: 'Naranja', value: '#FF9500' },
  { name: 'Amarillo', value: '#F59E0B' },
  { name: 'Verde', value: '#10B981' },
  { name: 'Verde oscuro', value: '#059669' },
  { name: 'Azul', value: '#3B82F6' },
  { name: 'Azul oscuro', value: '#1e40af' },
  { name: 'Púrpura', value: '#A855F7' },
  { name: 'Rosa', value: '#EC4899' },
  { name: 'Rojo', value: '#DC2626' },
  { name: 'Marrón', value: '#92400E' },
  { name: 'Gris', value: '#6B7280' },
]

interface SizeRow { nombre: string; precio: string }
interface ToppingRow { nombre: string; precio: string }

interface DishForm {
  name:          string
  description:   string
  price:         string
  category:      DishCategory
  tags:          string
  available:     boolean
  has_sizes:     boolean
  sizes:         SizeRow[]
  heladoCount:   string   // nº de bolas de helado a elegir (0/'' = ninguna)
  quesoHelado:   boolean  // opción "Con queso / Con helado"
  quesoHeladoMulti: boolean  // permite elegir los dos a la vez (ej: el Salpicrem)
  jugoCount:     string   // nº de sabores de jugo a elegir (0/'' = ninguno)
  toppings:      ToppingRow[]   // toppings opcionales (precio 0 = gratis)
  gruposV2:      OptionGroupV2[]  // opciones universales (solo con options_v2 encendido)
  image_file?:   File | null
  image_preview? :string | null
}

const FORM_EMPTY: DishForm = {
  name:'', description:'', price:'', category:'principal',
  tags:'', available:true, has_sizes:false, sizes:[{ nombre:'', precio:'' }],
  heladoCount:'', quesoHelado:false, quesoHeladoMulti:false, jugoCount:'',
  toppings:[], gruposV2:[],
  image_file:null, image_preview:null,
}

// Construye el array de grupos de opciones a partir de los campos del formulario
function buildOptions(heladoCount: string, quesoHelado: boolean, quesoHeladoMulti: boolean, jugoCount: string): DishOptionGroup[] {
  const out: DishOptionGroup[] = []
  if (quesoHelado) {
    out.push({
      tipo: 'opcion', nombre: '¿Con qué lo quieres?',
      opciones: [{ label: 'Con queso' }, { label: 'Con helado', helado: 1 }],
      multiple: quesoHeladoMulti,
    })
  }
  const n = parseInt(heladoCount, 10)
  if (!quesoHelado && Number.isFinite(n) && n > 0) {
    out.push({ tipo: 'helado', nombre: n > 1 ? `Elige ${n} sabores de helado` : 'Elige el sabor del helado', cantidad: n })
  }
  const nj = parseInt(jugoCount, 10)
  if (Number.isFinite(nj) && nj > 0) {
    out.push({ tipo: 'jugo', nombre: nj > 1 ? `Elige ${nj} sabores de jugo` : 'Elige el sabor del jugo', cantidad: nj })
  }
  return out
}

function dishToForm(d: Dish): DishForm {
  const sizes = (d.sizes ?? []).map(s => ({ nombre: s.nombre, precio: String(s.precio) }))
  const opts = d.options ?? []
  const heladoGroup = opts.find(o => o.tipo === 'helado')
  const jugoGroup = opts.find(o => o.tipo === 'jugo')
  const quesoHeladoGroup = opts.find(o => o.tipo === 'opcion' && (o.opciones ?? []).some(c => c.helado))
  return {
    name:          d.name,
    description:   d.description ?? '',
    price:         d.price.toString(),
    category:      d.category,
    tags:          (d.tags ?? []).join(', '),
    available:     d.available,
    has_sizes:     d.has_sizes ?? false,
    sizes:         sizes.length > 0 ? sizes : [{ nombre:'', precio:'' }],
    heladoCount:   heladoGroup?.cantidad ? String(heladoGroup.cantidad) : '',
    quesoHelado:   !!quesoHeladoGroup,
    quesoHeladoMulti: !!quesoHeladoGroup?.multiple,
    jugoCount:     jugoGroup?.cantidad ? String(jugoGroup.cantidad) : '',
    toppings:      (d.toppings ?? []).map(t => ({ nombre: t.nombre, precio: String(t.precio ?? 0) })),
    gruposV2:      gruposDe(d),
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
  if (error) { message.error(`No se pudo subir la foto: ${error.message}`); return null }
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
        backgroundColor: 'var(--w-surface)',
        borderRadius: '1rem',
        padding: '0.75rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(10, 1fr)',
        gap: '0.2rem',
        width: 320,
        maxHeight: 280,
        overflowY: 'auto',
        boxShadow: 'var(--w-shadow-md)',
        border: '1px solid var(--w-border)',
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

// ── Portal para el color picker ──────────────────────────────
interface ColorPortalProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onSelect:  (c: string) => void
  onClose:   () => void
}
function ColorPortal({ anchorRef, onSelect, onClose }: ColorPortalProps) {
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const portalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8 + window.scrollY, left: r.left + window.scrollX })
    }
    const handleClick = (e: MouseEvent) => {
      if (portalRef.current && portalRef.current.contains(e.target as Node)) return
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
        left: Math.min(pos.left, window.innerWidth - 280),
        zIndex: 99999,
        backgroundColor: 'var(--w-surface)',
        borderRadius: '1rem',
        padding: '0.75rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.5rem',
        width: 260,
        boxShadow: 'var(--w-shadow-md)',
      }}
    >
      {COLOR_PALETTE.map(c => (
        <button
          key={c.value}
          onClick={() => { onSelect(c.value); onClose() }}
          title={c.name}
          style={{
            width: '100%',
            height: 44,
            borderRadius: '0.75rem',
            backgroundColor: c.value,
            border: '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.05)'
            e.currentTarget.style.borderColor = 'var(--w-border-strong)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        />
      ))}
    </div>,
    document.body
  )
}

export const MenuManager = memo(() => {
  const menuCfg = useMenuConfig()
  const v2 = menuCfg.optionsV2   // opciones universales (interruptor por restaurante)
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
  // Sabores de helado disponibles (config)
  const [flavors,     setFlavors]     = useState<string[]>([])
  const [newFlavor,   setNewFlavor]   = useState('')
  // Sabores de jugos disponibles (config)
  const [jugoFlavors, setJugoFlavors] = useState<string[]>([])
  const [newJugoFlavor, setNewJugoFlavor] = useState('')
  // Confirmación de borrado inline (reemplaza window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Emoji pickers
  const [showNewCatPicker, setShowNewCatPicker] = useState(false)
  const [editEmojiForCat,  setEditEmojiForCat]  = useState<string | null>(null)
  const newCatEmojiRef  = useRef<HTMLButtonElement>(null)
  const editEmojiRefs   = useRef<Record<string, HTMLButtonElement | null>>({})
  // Color pickers
  const [editColorForCat, setEditColorForCat]   = useState<string | null>(null)
  const [newCatColor,     setNewCatColor]       = useState('#FF6B4A')
  const editColorRefs   = useRef<Record<string, HTMLButtonElement | null>>({})
  const imageRef        = useRef<HTMLInputElement>(null)

  // Interacciones de comensales: likes + reseñas (moderación)
  const [showReviews,     setShowReviews]     = useState(false)
  const [loadingReviews,  setLoadingReviews]  = useState(false)
  const [pendingReviews,  setPendingReviews]  = useState<PendingResena[]>([])
  const [socialOverview,  setSocialOverview]  = useState<InteraccionRow[]>([])
  const [moderatingId,    setModeratingId]    = useState<string | null>(null)
  const [reportedComments,setReportedComments]= useState<ReportedComment[]>([])

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
        if (modules && Array.isArray(modules['helado_flavors'])) {
          setFlavors((modules['helado_flavors'] as string[]).filter(Boolean))
        }
        if (modules && Array.isArray(modules['jugo_flavors'])) {
          setJugoFlavors((modules['jugo_flavors'] as string[]).filter(Boolean))
        }
      })
  }, [fetchDishes])

  const fetchReviews = useCallback(async () => {
    setLoadingReviews(true)
    const { data: restaurantId } = await supabase.rpc('current_restaurant_id')
    const [pendRes, overviewRes, reportedRes] = await Promise.all([
      supabase.from('resenas_platos')
        .select('id, cliente_nombre, rating, comentario, created_at, dishes(name)')
        .eq('estado', 'pendiente').order('created_at'),
      restaurantId
        ? supabase.rpc('obtener_interacciones_platos', { p_restaurant_id: restaurantId })
        : Promise.resolve({ data: null }),
      supabase.from('comentarios_platos')
        .select('id, cliente_nombre, texto, reportado_count, created_at, dishes(name)')
        .eq('estado', 'visible').gt('reportado_count', 0).order('reportado_count', { ascending: false }),
    ])
    setPendingReviews((pendRes.data as unknown as PendingResena[] | null) ?? [])
    setSocialOverview(((overviewRes.data as InteraccionRow[] | null) ?? []).filter(r => r.likes_count > 0 || r.dislikes_count > 0 || r.rating_count > 0 || r.comentarios_count > 0))
    setReportedComments((reportedRes.data as unknown as ReportedComment[] | null) ?? [])
    setLoadingReviews(false)
  }, [])

  useEffect(() => { fetchReviews() }, [fetchReviews])
  useEffect(() => { if (showReviews) fetchReviews() }, [showReviews, fetchReviews])

  const moderarResena = async (id: string, estado: 'aprobada' | 'rechazada') => {
    setModeratingId(id)
    const { error } = await supabase.from('resenas_platos').update({ estado }).eq('id', id)
    setModeratingId(null)
    if (error) { message.error(error.message); return }
    setPendingReviews(prev => prev.filter(r => r.id !== id))
    if (estado === 'aprobada') fetchReviews()
  }

  const moderarComentario = async (id: string, accion: 'ocultar' | 'ignorar') => {
    setModeratingId(id)
    const { error } = await supabase.from('comentarios_platos')
      .update(accion === 'ocultar' ? { estado: 'oculto' } : { reportado_count: 0 })
      .eq('id', id)
    setModeratingId(null)
    if (error) { message.error(error.message); return }
    setReportedComments(prev => prev.filter(c => c.id !== id))
    if (accion === 'ocultar') fetchReviews()
  }

  const [showVoiceMenu, setShowVoiceMenu] = useState(false)
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
    if (v2) {
      const problema = validarGrupos(form.gruposV2, menuCfg.listas)
      if (problema) { setFormError(problema); return }
    }

    // Precio: por tamaños (cada uno con su precio) o precio único
    let price = parseFloat(form.price)
    let sizesPayload: { nombre: string; precio: number }[] = []
    if (form.has_sizes) {
      sizesPayload = form.sizes
        .map(s => ({ nombre: s.nombre.trim(), precio: parseFloat(s.precio) }))
        .filter(s => s.nombre !== '' && !isNaN(s.precio) && s.precio >= 0)
      if (sizesPayload.length === 0) {
        setFormError('Agrega al menos un tamaño con nombre y precio'); return
      }
      price = Math.min(...sizesPayload.map(s => s.precio))  // precio base = el menor (para "desde $X")
    } else {
      if (isNaN(price) || price < 0) { setFormError('El precio debe ser un número válido'); return }
    }
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
        sizes:               sizesPayload,
        options:             v2 ? form.gruposV2 : buildOptions(form.heladoCount, form.quesoHelado, form.quesoHeladoMulti, form.jugoCount),
        toppings:            form.toppings
          .map(t => ({ nombre: t.nombre.trim(), precio: Math.max(0, parseFloat(t.precio) || 0) }))
          .filter((t, i, arr) => t.nombre !== '' && arr.findIndex(x => x.nombre === t.nombre) === i),
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
  }, [form, editing, fetchDishes, v2, menuCfg.listas])

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
    const newCat: Category = { value, label: newCatLabel.trim(), emoji: newCatEmoji, color: newCatColor }
    const updated = [...categories, newCat]
    setCategories(updated)
    await persistCategories(updated)
    setNewCatLabel(''); setNewCatEmoji('🍽️'); setNewCatColor('#FF6B4A'); setSavingCat(false)
    message.success(`Categoría "${newCat.label}" creada`)
  }

  const handleDeleteCategory = async (value: string) => {
    const cat = categories.find(c => c.value === value)
    const dishesInCat = dishes.filter(d => d.category === value)
    const confirmMsg = dishesInCat.length > 0
      ? `¿Eliminar la categoría "${cat?.label}" y sus ${dishesInCat.length} plato(s)? Esta acción no se puede deshacer.`
      : `¿Eliminar la categoría "${cat?.label}"?`
    if (!window.confirm(confirmMsg)) return

    try {
      if (dishesInCat.length > 0) {
        const { error } = await supabase.from('dishes').delete().eq('category', value)
        if (error) throw error
        setDishes(prev => prev.filter(d => d.category !== value))
      }
      const updated = categories.filter(c => c.value !== value)
      setCategories(updated)
      await persistCategories(updated)
      message.success('Categoría eliminada')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar categoría'
      message.error(`❌ ${msg}`)
      console.error('[MenuManager deleteCategory]', e)
    }
  }

  // Mover categoría arriba/abajo: este orden es el que ve el cliente en el menú
  const handleMoveCategory = async (index: number, dir: -1 | 1) => {
    const to = index + dir
    if (to < 0 || to >= categories.length) return
    const updated = [...categories]
    ;[updated[index], updated[to]] = [updated[to], updated[index]]
    setCategories(updated)
    await persistCategories(updated)
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

  // Guardar color de categoría existente
  const handleSaveCatColor = async (catValue: string, color: string) => {
    const updated = categories.map(c => c.value === catValue ? { ...c, color } : c)
    setCategories(updated)
    await persistCategories(updated)
    setEditColorForCat(null)
    message.success('Color actualizado')
  }

  // ── Sabores de helado (config.helado_flavors) ──────────────
  const persistFlavors = async (list: string[]) => {
    const { data: cfg } = await supabase.from('restaurant_config').select('id, modules_enabled').single()
    if (!cfg) return
    const modules = (cfg.modules_enabled as Record<string, unknown>) ?? {}
    await supabase.from('restaurant_config')
      .update({ modules_enabled: { ...modules, helado_flavors: list } })
      .eq('id', cfg.id)
  }

  const handleAddFlavor = async () => {
    const name = newFlavor.trim()
    if (!name) return
    if (flavors.some(f => f.toLowerCase() === name.toLowerCase())) {
      message.warning('Ese sabor ya está en la lista'); return
    }
    const updated = [...flavors, name]
    setFlavors(updated); setNewFlavor('')
    await persistFlavors(updated)
    message.success(`Sabor "${name}" agregado`)
  }

  const handleDeleteFlavor = async (name: string) => {
    const updated = flavors.filter(f => f !== name)
    setFlavors(updated)
    await persistFlavors(updated)
    message.success('Sabor eliminado')
  }

  // ── Sabores de jugos (config.jugo_flavors) ──────────────────
  const persistJugoFlavors = async (list: string[]) => {
    const { data: cfg } = await supabase.from('restaurant_config').select('id, modules_enabled').single()
    if (!cfg) return
    const modules = (cfg.modules_enabled as Record<string, unknown>) ?? {}
    await supabase.from('restaurant_config')
      .update({ modules_enabled: { ...modules, jugo_flavors: list } })
      .eq('id', cfg.id)
  }

  const handleAddJugoFlavor = async () => {
    const name = newJugoFlavor.trim()
    if (!name) return
    if (jugoFlavors.some(f => f.toLowerCase() === name.toLowerCase())) {
      message.warning('Ese sabor ya está en la lista'); return
    }
    const updated = [...jugoFlavors, name]
    setJugoFlavors(updated); setNewJugoFlavor('')
    await persistJugoFlavors(updated)
    message.success(`Sabor "${name}" agregado`)
  }

  const handleDeleteJugoFlavor = async (name: string) => {
    const updated = jugoFlavors.filter(f => f !== name)
    setJugoFlavors(updated)
    await persistJugoFlavors(updated)
    message.success('Sabor eliminado')
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

  const bg    = 'var(--w-surface)'
  const bgSurf= 'var(--w-surface-sunken)'
  const txt   = 'var(--w-text)'
  const txtMid= 'var(--w-text-2)'
  const txtLt = 'var(--w-text-3)'
  const acc   = 'var(--w-accent)'

  return (
    <div className="space-y-6">
      {/* Encabezado de módulo */}
      <ModuleHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 8h3v10"/></svg>}
        title="Menú"
        subtitle="Administra tus platos, categorías y reseñas."
        actions={<>
          <Button variant="secondary" onClick={() => setShowReviews(!showReviews)}>
            💬 Reseñas{(pendingReviews.length + reportedComments.length) > 0 ? ` (${pendingReviews.length + reportedComments.length})` : ''}
          </Button>
          <Button variant="secondary" onClick={() => setShowSettings(!showSettings)}>⚙️ Configurar</Button>
          <Button variant="secondary" onClick={() => setShowVoiceMenu(true)}>🎙️ Menú por voz</Button>
          <Button onClick={openCreate}>+ Nuevo plato</Button>
        </>}
      />

      {showVoiceMenu && (
        <VoiceMenuModal categories={categories} onSaved={fetchDishes} onClose={() => setShowVoiceMenu(false)} />
      )}

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
            <div className="bg-[var(--w-surface)] border border-[var(--w-border)] shadow-[var(--w-shadow-sm)] rounded-[var(--w-r-xl)] p-6 space-y-5">
              <h3 className="font-bold" style={{ color: txt }}>⚙️ Configuración general</h3>

              {/* Nombre del establecimiento */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: txtLt }}>
                  Nombre del establecimiento
                </label>
                <div className="flex gap-2">
                  <input value={bizName} onChange={e => setBizName(e.target.value)}
                    placeholder="Ej: Heladería Doña María"
                    className="flex-1 rounded-[var(--w-r-md)] px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                  <button onClick={handleSaveBizName} disabled={savingName}
                    className="px-4 py-2 rounded-[var(--w-r-md)] text-sm font-bold text-[color:var(--w-on-accent)] shrink-0"
                    style={{ backgroundColor: acc, ...S.coral }}>
                    {savingName ? '...' : 'Guardar'}
                  </button>
                </div>
              </div>

              {/* Número de mesas */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: txtLt }}>
                  Número total de mesas
                </label>
                <div className="flex gap-2">
                  <input type="number" min="1" max="200" value={tableCount}
                    onChange={e => setTableCount(e.target.value)} placeholder="Ej: 15"
                    className="flex-1 rounded-[var(--w-r-md)] px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                  <button onClick={handleSaveTables} disabled={savingTables}
                    className="px-4 py-2 rounded-[var(--w-r-md)] text-sm font-bold text-[color:var(--w-on-accent)] shrink-0"
                    style={{ backgroundColor: acc, ...S.coral }}>
                    {savingTables ? '...' : 'Actualizar'}
                  </button>
                </div>
              </div>

              {/* Categorías */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: txtLt }}>
                  Categorías del menú
                </label>
                <p className="text-xs mb-2" style={{ color: txtLt }}>
                  Usa ▲▼ para cambiar el orden en que aparecen en el menú del cliente y al tomar pedidos.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  {categories.map((cat, idx) => (
                    <div key={cat.value}
                      className="flex items-center gap-2 rounded-[var(--w-r-md)] px-3 py-2"
                      style={{ backgroundColor: bgSurf, ...S.neoIn }}>

                      <span className="flex flex-col shrink-0">
                        <button onClick={() => handleMoveCategory(idx, -1)} disabled={idx === 0} title="Subir" aria-label={`Subir ${cat.label}`}
                          style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: txtMid, opacity: idx === 0 ? 0.3 : 1, fontSize: '0.75rem', lineHeight: 1, padding: '0.125rem 0.25rem' }}>▲</button>
                        <button onClick={() => handleMoveCategory(idx, 1)} disabled={idx === categories.length - 1} title="Bajar" aria-label={`Bajar ${cat.label}`}
                          style={{ background: 'none', border: 'none', cursor: idx === categories.length - 1 ? 'default' : 'pointer', color: txtMid, opacity: idx === categories.length - 1 ? 0.3 : 1, fontSize: '0.75rem', lineHeight: 1, padding: '0.125rem 0.25rem' }}>▼</button>
                      </span>
                      <span className="text-xs font-bold shrink-0" style={{ color: txtLt, minWidth: '1.25rem' }}>{idx + 1}.</span>

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

                      {/* Color — editable */}
                      <button
                        ref={el => { editColorRefs.current[cat.value] = el }}
                        onClick={() => setEditColorForCat(editColorForCat === cat.value ? null : cat.value)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '0.4rem',
                          backgroundColor: cat.color || '#FF6B4A',
                          border: 'none',
                          cursor: 'pointer',
                          boxShadow: 'var(--w-shadow-sm)',
                        }}
                        title="Cambiar color"
                      />

                      {/* Color portal para categoría existente */}
                      {editColorForCat === cat.value && (
                        <ColorPortal
                          anchorRef={{ current: editColorRefs.current[cat.value] }}
                          onSelect={c => handleSaveCatColor(cat.value, c)}
                          onClose={() => setEditColorForCat(null)}
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
                            <button onClick={() => handleDeleteCategory(cat.value)}
                              style={{ color: 'var(--w-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }} title="Eliminar">🗑️</button>
                          </>
                      }
                    </div>
                  ))}
                </div>

                {/* Nueva categoría */}
                <div className="rounded-[var(--w-r-md)] p-3 space-y-2" style={{ backgroundColor: bgSurf, ...S.neoIn }}>
                  <p className="text-[length:var(--w-fs-label)] font-semibold" style={{ color: txtMid }}>+ Nueva categoría</p>
                  <div className="flex gap-2">
                    {/* Botón emoji con portal */}
                    <button
                      ref={newCatEmojiRef}
                      onClick={() => setShowNewCatPicker(p => !p)}
                      className="w-11 h-11 rounded-[var(--w-r-md)] text-xl flex items-center justify-center"
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

                    {/* Botón color con portal */}
                    <button
                      ref={el => { if (el) editColorRefs.current['new'] = el }}
                      onClick={() => setEditColorForCat(editColorForCat === 'new' ? null : 'new')}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '0.75rem',
                        backgroundColor: newCatColor,
                        border: 'none',
                        cursor: 'pointer',
                        ...S.neoOutSm,
                      }}
                      title="Cambiar color"
                    />

                    {editColorForCat === 'new' && (
                      <ColorPortal
                        anchorRef={{ current: editColorRefs.current['new'] }}
                        onSelect={c => setNewCatColor(c)}
                        onClose={() => setEditColorForCat(null)}
                      />
                    )}

                    <input value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)}
                      placeholder="Nombre de categoría"
                      onKeyDown={e => { if (e.key === 'Enter') handleAddCategory() }}
                      className="flex-1 rounded-[var(--w-r-md)] px-3 py-2 text-sm outline-none"
                      style={{ backgroundColor: bg, color: txt, border: 'none', ...S.neoIn }} />
                    <motion.button whileTap={{ scale: 0.95 }} onClick={handleAddCategory}
                      disabled={savingCat || !newCatLabel.trim()}
                      className="px-3 py-2 rounded-[var(--w-r-md)] text-sm font-bold text-[color:var(--w-on-accent)] shrink-0"
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

              {v2 && (
                <div className="rounded-[var(--w-r-md)] p-3" style={{ backgroundColor: bgSurf, ...S.neoIn }}>
                  <p className="text-xs font-bold mb-1" style={{ color: txtLt }}>Sabores y opciones</p>
                  <p className="text-xs" style={{ color: txt }}>
                    Tus sabores, leches, salsas y demás opciones ahora se administran en <strong>Listas y opciones</strong> (menú de la izquierda). Los cambios que hagas ahí valen para todos los platos que usan cada lista.
                  </p>
                </div>
              )}
              {!v2 && (<>
              {/* Sabores de helado */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: txtLt }}>
                  Sabores de helado
                </label>
                <p className="text-xs mb-2" style={{ color: txtLt }}>
                  Estos sabores aparecen para que el cliente elija en los platos que llevan helado.
                </p>
                {flavors.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {flavors.map(f => (
                      <span key={f}
                        className="flex items-center gap-2 rounded-full pl-3 pr-2 py-1.5 text-sm font-semibold"
                        style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }}>
                        {f}
                        <button onClick={() => handleDeleteFlavor(f)} title="Eliminar"
                          style={{ color: 'var(--w-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1 }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="rounded-[var(--w-r-md)] p-3 space-y-2" style={{ backgroundColor: bgSurf, ...S.neoIn }}>
                  <p className="text-[length:var(--w-fs-label)] font-semibold" style={{ color: txtMid }}>+ Nuevo sabor</p>
                  <div className="flex gap-2">
                    <input value={newFlavor} onChange={e => setNewFlavor(e.target.value)}
                      placeholder="Ej: Ron con pasas"
                      onKeyDown={e => { if (e.key === 'Enter') handleAddFlavor() }}
                      className="flex-1 rounded-[var(--w-r-md)] px-3 py-2 text-sm outline-none"
                      style={{ backgroundColor: bg, color: txt, border: 'none', ...S.neoIn }} />
                    <motion.button whileTap={{ scale: 0.95 }} onClick={handleAddFlavor}
                      disabled={!newFlavor.trim()}
                      className="px-3 py-2 rounded-[var(--w-r-md)] text-sm font-bold text-[color:var(--w-on-accent)] shrink-0"
                      style={{
                        backgroundColor: !newFlavor.trim() ? bg : acc,
                        border: 'none', cursor: !newFlavor.trim() ? 'not-allowed' : 'pointer',
                        ...(!newFlavor.trim() ? S.neoIn : S.coral)
                      }}>
                      ✓
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Sabores de jugos */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: txtLt }}>
                  Sabores de jugos
                </label>
                <p className="text-xs mb-2" style={{ color: txtLt }}>
                  Estos sabores aparecen para que el cliente elija en los platos que llevan jugo.
                </p>
                {jugoFlavors.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {jugoFlavors.map(f => (
                      <span key={f}
                        className="flex items-center gap-2 rounded-full pl-3 pr-2 py-1.5 text-sm font-semibold"
                        style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }}>
                        {f}
                        <button onClick={() => handleDeleteJugoFlavor(f)} title="Eliminar"
                          style={{ color: 'var(--w-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1 }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="rounded-[var(--w-r-md)] p-3 space-y-2" style={{ backgroundColor: bgSurf, ...S.neoIn }}>
                  <p className="text-[length:var(--w-fs-label)] font-semibold" style={{ color: txtMid }}>+ Nuevo sabor</p>
                  <div className="flex gap-2">
                    <input value={newJugoFlavor} onChange={e => setNewJugoFlavor(e.target.value)}
                      placeholder="Ej: Mango"
                      onKeyDown={e => { if (e.key === 'Enter') handleAddJugoFlavor() }}
                      className="flex-1 rounded-[var(--w-r-md)] px-3 py-2 text-sm outline-none"
                      style={{ backgroundColor: bg, color: txt, border: 'none', ...S.neoIn }} />
                    <motion.button whileTap={{ scale: 0.95 }} onClick={handleAddJugoFlavor}
                      disabled={!newJugoFlavor.trim()}
                      className="px-3 py-2 rounded-[var(--w-r-md)] text-sm font-bold text-[color:var(--w-on-accent)] shrink-0"
                      style={{
                        backgroundColor: !newJugoFlavor.trim() ? bg : acc,
                        border: 'none', cursor: !newJugoFlavor.trim() ? 'not-allowed' : 'pointer',
                        ...(!newJugoFlavor.trim() ? S.neoIn : S.coral)
                      }}>
                      ✓
                    </motion.button>
                  </div>
                </div>
              </div>
              </>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panel de interacciones: likes + reseñas de comensales */}
      <AnimatePresence>
        {showReviews && (
          <motion.div key="reviews" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
            <div className="bg-[var(--w-surface)] border border-[var(--w-border)] shadow-[var(--w-shadow-sm)] rounded-[var(--w-r-xl)] p-6 space-y-5">
              <h3 className="font-bold" style={{ color: txt }}>💬 Interacciones de comensales</h3>

              <div>
                <p className="text-xs font-bold mb-2" style={{ color: txtLt }}>
                  Reseñas pendientes de aprobar {pendingReviews.length > 0 && `(${pendingReviews.length})`}
                </p>
                {loadingReviews ? (
                  <p className="text-sm" style={{ color: txtLt }}>Cargando...</p>
                ) : pendingReviews.length === 0 ? (
                  <p className="text-sm" style={{ color: txtLt }}>No hay reseñas esperando aprobación.</p>
                ) : (
                  <div className="space-y-2">
                    {pendingReviews.map(r => (
                      <div key={r.id} className="rounded-[var(--w-r-md)] p-3" style={{ backgroundColor: bgSurf, ...S.neoIn }}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-bold" style={{ color: txt }}>{r.dishes?.name ?? 'Plato'}</span>
                          <span style={{ fontSize: '0.75rem' }}>{'⭐'.repeat(r.rating)}</span>
                        </div>
                        <p className="text-xs mb-1" style={{ color: txtMid }}>— {r.cliente_nombre}</p>
                        {r.comentario && <p className="text-sm mb-2" style={{ color: txt }}>{r.comentario}</p>}
                        <div className="flex gap-2">
                          <button disabled={moderatingId === r.id} onClick={() => moderarResena(r.id, 'aprobada')}
                            className="text-xs font-bold px-3 py-1.5 rounded-[var(--w-r-md)]" style={{ backgroundColor: 'var(--w-success-bg)', color: 'var(--w-success-text)', border: '1px solid var(--w-success)' }}>
                            ✓ Aprobar
                          </button>
                          <button disabled={moderatingId === r.id} onClick={() => moderarResena(r.id, 'rechazada')}
                            className="text-xs font-bold px-3 py-1.5 rounded-[var(--w-r-md)]" style={{ backgroundColor: 'var(--w-danger-bg)', color: 'var(--w-danger-text)', border: '1px solid var(--w-danger)' }}>
                            ✕ Rechazar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-bold mb-2" style={{ color: txtLt }}>
                  Comentarios reportados {reportedComments.length > 0 && `(${reportedComments.length})`}
                </p>
                {reportedComments.length === 0 ? (
                  <p className="text-sm" style={{ color: txtLt }}>Nadie ha reportado comentarios.</p>
                ) : (
                  <div className="space-y-2">
                    {reportedComments.map(c => (
                      <div key={c.id} className="rounded-[var(--w-r-md)] p-3" style={{ backgroundColor: bgSurf, ...S.neoIn }}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-bold" style={{ color: txt }}>{c.dishes?.name ?? 'Plato'}</span>
                          <span className="text-xs font-bold" style={{ color: 'var(--w-danger)' }}>🚩 {c.reportado_count}</span>
                        </div>
                        <p className="text-xs mb-1" style={{ color: txtMid }}>— {c.cliente_nombre}</p>
                        <p className="text-sm mb-2" style={{ color: txt }}>{c.texto}</p>
                        <div className="flex gap-2">
                          <button disabled={moderatingId === c.id} onClick={() => moderarComentario(c.id, 'ocultar')}
                            className="text-xs font-bold px-3 py-1.5 rounded-[var(--w-r-md)]" style={{ backgroundColor: 'var(--w-danger-bg)', color: 'var(--w-danger-text)', border: '1px solid var(--w-danger)' }}>
                            Ocultar
                          </button>
                          <button disabled={moderatingId === c.id} onClick={() => moderarComentario(c.id, 'ignorar')}
                            className="text-xs font-bold px-3 py-1.5 rounded-[var(--w-r-md)]" style={{ backgroundColor: bg, color: txtMid }}>
                            Ignorar reporte
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {socialOverview.length > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: txtLt }}>
                    Qué gusta y qué no, por plato
                  </p>
                  <div className="space-y-1.5">
                    {socialOverview.map(row => {
                      const dishName = dishes.find(d => d.id === row.dish_id)?.name ?? 'Plato'
                      return (
                        <div key={row.dish_id} className="flex items-center justify-between text-sm rounded-[var(--w-r-md)] px-3 py-2" style={{ backgroundColor: bgSurf }}>
                          <span style={{ color: txt }}>{row.es_popular && '🔥 '}{dishName}</span>
                          <span style={{ color: txtMid }}>
                            ❤️ {row.likes_count}  ·  👎 {row.dislikes_count}
                            {row.rating_count > 0 && `  ·  ⭐ ${row.rating_avg} (${row.rating_count})`}
                            {row.comentarios_count > 0 && `  ·  💬 ${row.comentarios_count}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        <StatCard label="Platos totales" value={stats.total} tone="accent" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 8h3v10"/></svg>} />
        <StatCard label="Activos" value={stats.activos} tone="success" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10"/></svg>} />
        <StatCard label="Inactivos" value={stats.inactivos} tone="warning" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5v14M15 5v14"/></svg>} />
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        <div className="flex min-h-[44px] items-center gap-3 rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] bg-[var(--w-surface)] px-4">
          <span style={{ color: txtLt }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar plato o tag..."
            aria-label="Buscar plato"
            className="min-h-[44px] flex-1 bg-transparent text-sm outline-none"
            style={{ color: txt }} />
        </div>
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
          {[{ value: 'all', emoji: '', label: 'Todos' }, ...categories].map(c => {
            const on = filterCat === c.value
            return (
              <button key={c.value} onClick={() => setFilterCat(c.value)} aria-pressed={on}
                className="min-h-[44px] shrink-0 whitespace-nowrap rounded-[var(--w-r-pill)] px-4 text-sm font-semibold transition-colors"
                style={on
                  ? { background: acc, color: 'var(--w-on-accent)' }
                  : { backgroundColor: bgSurf, color: txtMid }}>
                {c.emoji} {c.label}
              </button>
            )
          })}
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
            <div className="bg-[var(--w-surface)] border border-[var(--w-border)] shadow-[var(--w-shadow-sm)] rounded-[var(--w-r-xl)] p-6">
              <h3 className="mb-1 flex items-center gap-2 font-bold" style={{ color: txt, fontSize: 'var(--w-fs-title)' }}>
                <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-[var(--w-r-sm)] bg-[var(--w-accent-soft)] text-[color:var(--w-accent-text)]">
                  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 8h3v10"/></svg>
                </span>
                {editing ? 'Editar plato' : 'Agregar nuevo plato'}
              </h3>
              <p className="mb-5" style={{ color: txtLt, fontSize: 'var(--w-fs-label)' }}>
                {editing ? `Actualiza la información de ${editing.name} en tu menú` : 'Completa la información del plato para agregarlo al menú'}
              </p>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_17rem]">
              {/* Foto */}
              <div className="lg:col-start-2 lg:row-start-1">
                <div onClick={() => imageRef.current?.click()} role="button" tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') imageRef.current?.click() }}
                  className="flex min-h-[11rem] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--w-r-lg)] border border-dashed border-[var(--w-border-strong)] text-center"
                  style={{ backgroundColor: bgSurf }}>
                  {form.image_preview
                    ? <img src={form.image_preview} alt="preview" className="h-44 w-full object-cover" />
                    : <>
                        <span className="text-4xl">{categories.find(c => c.value === form.category)?.emoji ?? '🍽️'}</span>
                        <p className="text-sm font-bold" style={{ color: txt }}>Subir imagen</p>
                        <p className="text-xs" style={{ color: txtLt }}>JPG/PNG/WebP · máx 4MB</p>
                      </>
                  }
                </div>
                {form.image_preview && (
                  <button onClick={() => imageRef.current?.click()}
                    className="mt-2 min-h-[44px] w-full rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] text-xs font-bold"
                    style={{ color: txtMid, background: bg, cursor: 'pointer' }}>
                    Cambiar imagen
                  </button>
                )}
                <input ref={imageRef} type="file" accept="image/*" className="sr-only" onChange={handleImageChange} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:col-start-1 lg:row-start-1">
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[length:var(--w-fs-label)] font-semibold" style={{ color: txtMid }}>Nombre *</label>
                    <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => setForm(p => ({ ...p, name: limpiarTranscripcion(r.transcript) }))} />
                  </div>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ej: Sundae Tropical"
                    className="w-full rounded-[var(--w-r-md)] px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[length:var(--w-fs-label)] font-semibold" style={{ color: txtMid }}>Descripción</label>
                    <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => setForm(p => ({ ...p, description: ((p.description ? p.description + ' ' : '') + r.transcript.trim()).slice(0, 500) }))} />
                  </div>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Breve descripción..." rows={2} maxLength={500}
                    className="w-full rounded-[var(--w-r-md)] px-4 py-3 text-sm outline-none resize-none"
                    style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                </div>
                {!form.has_sizes && (
                  <div>
                    <label className="block text-xs font-bold mb-2" style={{ color: txtLt }}>Precio *</label>
                    <input type="number" step="0.01" min="0" value={form.price}
                      onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                      placeholder="0"
                      className="w-full rounded-[var(--w-r-md)] px-4 py-3 text-sm outline-none"
                      style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: txtLt }}>
                    Tags <span style={{ color: txtLt, fontWeight: 400, textTransform: 'none' }}>(separados por coma)</span>
                  </label>
                  <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
                    placeholder="vegano, sin gluten, picante"
                    className="w-full rounded-[var(--w-r-md)] px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: bgSurf, color: txt, ...S.neoIn }} />
                  {form.tags && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {parseTags(form.tags).map(t => (
                        <span key={t} className="text-[0.625rem] font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: bgSurf, color: txtMid }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold mb-2" style={{ color: txtLt }}>Categoría *</label>
                  <div className="grid grid-cols-5 gap-2">
                    {categories.map(c => (
                      <button key={c.value} onClick={() => setForm(p => ({ ...p, category: c.value }))}
                        className="py-2.5 rounded-[var(--w-r-md)] text-xs font-bold flex flex-col items-center gap-1 transition-all w-full"
                        style={form.category === c.value
                          ? { background: acc, color: 'var(--w-on-accent)', ...S.coral }
                          : { backgroundColor: bg, color: txtMid, ...S.neoOutSm }}>
                        <span className="text-base leading-none">{c.emoji}</span>
                        <span className="truncate w-full text-center text-[0.625rem]">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-2 flex flex-col gap-3">
                  {/* Disponibilidad */}
                  <div className="flex items-center gap-3">
                    <Toggle checked={form.available} label="Plato disponible" onChange={v => setForm(p => ({ ...p, available: v }))} />
                    <span className="text-sm font-medium" style={{ color: txt }}>
                      {form.available ? 'Plato disponible en el menú' : 'Plato no disponible'}
                    </span>
                  </div>

                  {/* Tamaños */}
                  <div className="flex items-center gap-3">
                    <Toggle checked={form.has_sizes} label="Tiene tamaños" onChange={v => setForm(p => ({ ...p, has_sizes: v }))} />
                    <div>
                      <span className="text-sm font-medium" style={{ color: txt }}>
                        {form.has_sizes ? '📏 Tiene tamaños (Pequeño / Mediano / Grande)' : '1️⃣ Tamaño único'}
                      </span>
                      <p className="text-[0.6875rem]" style={{ color: txtLt }}>
                        {form.has_sizes ? 'El cliente elige tamaño y paga el precio de ese tamaño' : 'Sin selector de tamaño para el cliente'}
                      </p>
                    </div>
                  </div>

                  {/* Editor de tamaños con precio */}
                  {form.has_sizes && (
                    <div className="rounded-[var(--w-r-md)] p-3 flex flex-col gap-2" style={{ backgroundColor: bgSurf, ...S.neoIn }}>
                      <p className="text-[length:var(--w-fs-label)] font-semibold" style={{ color: txtMid }}>Tamaños y precios</p>
                      {form.sizes.map((s, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input value={s.nombre}
                            onChange={e => setForm(p => ({ ...p, sizes: p.sizes.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x) }))}
                            placeholder="Tamaño (ej: Pequeño)"
                            className="flex-1 rounded-[var(--w-r-md)] px-3 py-2 text-sm outline-none min-w-0"
                            style={{ backgroundColor: bg, color: txt, ...S.neoOutSm }} />
                          <input type="number" min="0" value={s.precio}
                            onChange={e => setForm(p => ({ ...p, sizes: p.sizes.map((x, j) => j === i ? { ...x, precio: e.target.value } : x) }))}
                            placeholder="Precio"
                            className="w-24 rounded-[var(--w-r-md)] px-3 py-2 text-sm outline-none text-right"
                            style={{ backgroundColor: bg, color: txt, ...S.neoOutSm }} />
                          <button onClick={() => setForm(p => ({ ...p, sizes: p.sizes.length > 1 ? p.sizes.filter((_, j) => j !== i) : p.sizes }))}
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" title="Quitar"
                            style={{ color: 'var(--w-danger)', backgroundColor: bg, ...S.neoOutSm }}>✕</button>
                        </div>
                      ))}
                      <button onClick={() => setForm(p => ({ ...p, sizes: [...p.sizes, { nombre: '', precio: '' }] }))}
                        className="self-start text-xs font-bold px-3 py-1.5 rounded-[var(--w-r-md)]"
                        style={{ color: acc, backgroundColor: bg, ...S.neoOutSm }}>
                        + Agregar tamaño
                      </button>
                    </div>
                  )}

                  {/* ── Opciones: helado / queso ── */}
                  <div className="pt-3 mt-1 border-t" style={{ borderColor: bgSurf }}>
                    <p className="text-xs font-bold mb-1" style={{ color: txtLt }}>Opciones del plato</p>
                    <p className="text-[0.6875rem] mb-3" style={{ color: txtLt }}>
                      Los sabores de helado y de jugos se gestionan en ⚙️ Ajustes → “Sabores de helado” / “Sabores de jugos”.
                    </p>

                    {v2 && (
                      <div className="mb-3">
                        <DishGroupsEditor groups={form.gruposV2} onChange={g => setForm(p => ({ ...p, gruposV2: g }))}
                          listas={menuCfg.listas} listaNombres={menuCfg.listaNombres} theme={{ bg, bgSurf, acc, txt, txtLt }} />
                      </div>
                    )}
                    {!v2 && (<>
                    {/* Opción Queso / Helado */}
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                      <div className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                        style={{ backgroundColor: form.quesoHelado ? acc : bgSurf }}
                        onClick={() => setForm(p => ({ ...p, quesoHelado: !p.quesoHelado }))}>
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-[var(--w-on-accent)] shadow transition-transform ${form.quesoHelado ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                      <div>
                        <span className="text-sm font-medium" style={{ color: txt }}>Opción “Con queso / Con helado”</span>
                        <p className="text-[0.6875rem]" style={{ color: txtLt }}>
                          El cliente elige queso o helado; si elige helado, escoge 1 sabor (ej: el Mix).
                        </p>
                      </div>
                    </label>

                    {/* Permitir los dos a la vez (solo tiene sentido si la opción queso/helado está activa) */}
                    {form.quesoHelado && (
                      <label className="flex items-center gap-3 cursor-pointer mb-3 ml-4">
                        <div className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                          style={{ backgroundColor: form.quesoHeladoMulti ? acc : bgSurf }}
                          onClick={() => setForm(p => ({ ...p, quesoHeladoMulti: !p.quesoHeladoMulti }))}>
                          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-[var(--w-on-accent)] shadow transition-transform ${form.quesoHeladoMulti ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </div>
                        <div>
                          <span className="text-sm font-medium" style={{ color: txt }}>Permitir elegir los dos</span>
                          <p className="text-[0.6875rem]" style={{ color: txtLt }}>
                            El cliente puede pedir queso Y helado juntos, no solo uno de los dos (ej: el Salpicrem).
                          </p>
                        </div>
                      </label>
                    )}

                    {/* Bolas de helado a elegir (solo si no usa la opción queso/helado) */}
                    {!form.quesoHelado && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <span className="text-sm font-medium" style={{ color: txt }}>Sabores de helado a elegir</span>
                          <p className="text-[0.6875rem]" style={{ color: txtLt }}>
                            Ej: Banana Split = 3 · Vaso Doble = 2 · Cono Sencillo = 1 · (0 = sin helado)
                          </p>
                        </div>
                        <input type="number" min="0" max="6" value={form.heladoCount}
                          onChange={e => setForm(p => ({ ...p, heladoCount: e.target.value }))}
                          placeholder="0"
                          className="w-20 rounded-[var(--w-r-md)] px-3 py-2 text-sm outline-none text-center shrink-0"
                          style={{ backgroundColor: bg, color: txt, ...S.neoOutSm }} />
                      </div>
                    )}
                    </>)}

                    {/* Toppings opcionales del plato (el cliente marca los que quiera) */}
                    <div className="mt-3 mb-3 rounded-[var(--w-r-md)] p-3 flex flex-col gap-2" style={{ backgroundColor: bgSurf, ...S.neoIn }}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[length:var(--w-fs-label)] font-semibold" style={{ color: txtMid }}>Toppings (opcionales)</p>
                        <VoiceButton<{ toppings: { nombre: string; precio: number }[] }> kind="topping" label="Dictar toppings"
                          onResult={r => setForm(p => ({ ...p, toppings: [...p.toppings, ...(r.toppings ?? []).filter(t => !p.toppings.some(x => x.nombre.toLowerCase() === t.nombre.toLowerCase())).map(t => ({ nombre: t.nombre, precio: String(t.precio ?? 0) }))] }))} />
                      </div>
                      <p className="text-[0.6875rem]" style={{ color: txtLt }}>Precio 0 = gratis. Caja puede marcarlos agotados en “Gestión menú”.</p>
                      {form.toppings.map((t, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input value={t.nombre}
                            onChange={e => setForm(p => ({ ...p, toppings: p.toppings.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x) }))}
                            placeholder="Topping (ej: Leche condensada)"
                            className="flex-1 rounded-[var(--w-r-md)] px-3 py-2 text-sm outline-none min-w-0"
                            style={{ backgroundColor: bg, color: txt, ...S.neoOutSm }} />
                          <input type="number" min="0" value={t.precio}
                            onChange={e => setForm(p => ({ ...p, toppings: p.toppings.map((x, j) => j === i ? { ...x, precio: e.target.value } : x) }))}
                            placeholder="0"
                            className="w-24 rounded-[var(--w-r-md)] px-3 py-2 text-sm outline-none text-right"
                            style={{ backgroundColor: bg, color: txt, ...S.neoOutSm }} />
                          <button onClick={() => setForm(p => ({ ...p, toppings: p.toppings.filter((_, j) => j !== i) }))}
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" title="Quitar"
                            style={{ color: 'var(--w-danger)', backgroundColor: bg, ...S.neoOutSm }}>✕</button>
                        </div>
                      ))}
                      <button onClick={() => setForm(p => ({ ...p, toppings: [...p.toppings, { nombre: '', precio: '0' }] }))}
                        className="self-start text-xs font-bold px-3 py-1.5 rounded-[var(--w-r-md)]"
                        style={{ color: acc, backgroundColor: bg, ...S.neoOutSm }}>
                        + Agregar topping
                      </button>
                    </div>

                    {/* Sabores de jugo a elegir (ej: jugos naturales) */}
                    {!v2 && (
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex-1">
                        <span className="text-sm font-medium" style={{ color: txt }}>Sabores de jugo a elegir</span>
                        <p className="text-[0.6875rem]" style={{ color: txtLt }}>
                          Ej: Jugo natural = 1 · Jugo mixto = 2 · (0 = sin jugo). Sabores en ⚙️ Ajustes → “Sabores de jugos”.
                        </p>
                      </div>
                      <input type="number" min="0" max="6" value={form.jugoCount}
                        onChange={e => setForm(p => ({ ...p, jugoCount: e.target.value }))}
                        placeholder="0"
                        className="w-20 rounded-[var(--w-r-md)] px-3 py-2 text-sm outline-none text-center shrink-0"
                        style={{ backgroundColor: bg, color: txt, ...S.neoOutSm }} />
                    </div>
                    )}
                  </div>
                </div>
              </div>
              </div>

              {formError && <p className="text-xs text-[color:var(--w-danger-text)] font-medium mt-3">⚠️ {formError}</p>}

              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="secondary" className="sm:min-w-[9rem]" onClick={() => { setShowForm(false); setForm(FORM_EMPTY) }}>✕ Cancelar</Button>
                <Button className="w-full sm:w-auto sm:min-w-[12rem]" onClick={handleSave} loading={saving}>
                  {saving ? 'Guardando...' : editing ? 'Actualizar plato ✓' : 'Guardar plato ✓'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(6)].map((_,i) => (
            <div key={i} className="rounded-[var(--w-r-md)] h-24 skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[var(--w-r-xl)] p-12 text-center" style={{ backgroundColor: bg, ...S.neoIn }}>
          <p className="text-4xl mb-2">🍽️</p>
          <p className="font-bold" style={{ color: txt }}>Sin platos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(dish => {
            const cat = categories.find(c => c.value === dish.category)
            const btn = 'flex h-11 w-11 items-center justify-center rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] bg-[var(--w-surface)] text-base'
            return (
              <motion.div key={dish.id} layout
                className={`overflow-hidden rounded-[var(--w-r-lg)] border border-[var(--w-border)] bg-[var(--w-surface)] shadow-[var(--w-shadow-sm)] ${!dish.available ? 'opacity-70' : ''}`}
                transition={{ duration: 0.15 }}>
                <div className="flex h-36 items-center justify-center text-5xl" style={{ backgroundColor: bgSurf }}>
                  {dish.image_url
                    ? <img src={dish.image_url} alt={dish.name} className="h-full w-full object-cover" loading="lazy" />
                    : cat?.emoji}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold" style={{ color: txt, fontSize: 'var(--w-fs-body-lg)' }}>{dish.name}</p>
                    <p className="shrink-0 font-bold" style={{ color: txt, fontSize: 'var(--w-fs-body-lg)' }}>${dish.price.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={dish.available ? 'success' : 'danger'}>{dish.available ? 'Disponible' : 'No disponible'}</Badge>
                    {cat && <Badge tone="neutral">{cat.emoji} {cat.label}</Badge>}
                    {dish.has_sizes && <Badge tone="info">Tamaños</Badge>}
                    {(dish.options ?? []).length > 0 && <Badge tone="info">Opciones</Badge>}
                    {(dish.tags ?? []).slice(0, 3).map(t => <Badge key={t} tone="neutral">#{t}</Badge>)}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => openEdit(dish)} className={btn} style={{ color: txtMid }} aria-label="Editar plato" title="Editar">✏️</button>
                    <span className="ml-auto"><Toggle checked={dish.available} label={dish.available ? 'Pausar plato' : 'Activar plato'} onChange={() => handleToggle(dish)} /></span>
                    {/* Borrado con confirmación inline — sin window.confirm */}
                    {confirmDeleteId === dish.id ? (
                      <>
                        <button onClick={() => handleDelete(dish)} className={btn + ' animate-pulse font-bold'}
                          style={{ backgroundColor: 'var(--w-danger-bg)', color: 'var(--w-danger-text)', borderColor: 'var(--w-danger)' }}
                          aria-label="Confirmar eliminación" title="Confirmar eliminación">✓</button>
                        <button onClick={() => setConfirmDeleteId(null)} className={btn} style={{ color: txtMid }} aria-label="Cancelar" title="Cancelar">✕</button>
                      </>
                    ) : (
                      <button onClick={() => requestDelete(dish.id)} className={btn} style={{ color: 'var(--w-danger-text)' }} aria-label="Eliminar plato" title="Eliminar plato">🗑️</button>
                    )}
                  </div>
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
