/**
 * MenuAvailability.tsx — "Gestión del menú" del cajero.
 * Activa/desactiva, uno por uno, sabores (helado y jugo), toppings y
 * productos. Se refleja al instante en el menú del cliente y en las opciones
 * al armar pedidos (ambos escuchan restaurant_config y dishes en vivo).
 * Los sabores/toppings en sí los define el admin en Menú; aquí solo se marca
 * qué hay y qué se agotó.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { useMenuConfig } from '../../hooks/useMenuConfig'
import { orderCategories } from '../../services/menuOptions'
import type { Dish } from '../../types'

type Tipo = 'helado' | 'jugo' | 'topping'
type DishRow = Pick<Dish, 'id' | 'name' | 'category' | 'available' | 'availability_status' | 'toppings'>

const card: React.CSSProperties = {
  background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem',
  padding: '1.125rem', boxShadow: 'var(--w-shadow-sm)',
}

function Toggle({ label, on, busy, hint, onClick }: { label: string; on: boolean; busy?: boolean; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={busy} aria-pressed={on} title={hint}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.875rem', borderRadius: '9999px',
        cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--w-sans)', fontWeight: 600, fontSize: '0.875rem',
        border: on ? '1px solid transparent' : '1px dashed var(--w-line)',
        background: on ? 'var(--w-terra)' : 'var(--w-bg)', color: on ? '#fff' : 'var(--w-ink-mut)',
        textDecoration: on ? 'none' : 'line-through', opacity: busy ? 0.6 : 1,
      }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? '#fff' : 'var(--w-wine)', flexShrink: 0 }} />
      {label}
    </button>
  )
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={card}>
      <h3 className="ed-display" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{title}</h3>
      <p style={{ margin: '0.125rem 0 0.875rem', fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>{sub}</p>
      {children}
    </section>
  )
}

export function MenuAvailability() {
  const menu = useMenuConfig()
  const [dishes, setDishes] = useState<DishRow[]>([])
  const [busy, setBusy]     = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchDishes = useCallback(() => {
    supabase.from('dishes').select('id, name, category, available, availability_status, toppings')
      .neq('availability_status', 'discontinued').order('name')
      .then(({ data }) => setDishes((data as DishRow[] | null) ?? []))
  }, [])

  useEffect(() => {
    fetchDishes()
    let ch: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    supabase.rpc('current_restaurant_id').then(({ data: rid }) => {
      if (cancelled || !rid) return
      ch = supabase.channel(`menu-availability-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes', filter: `restaurant_id=eq.${rid}` }, fetchDishes)
        .subscribe()
    })
    return () => { cancelled = true; if (ch) supabase.removeChannel(ch) }
  }, [fetchDishes])

  // Toppings: uno por nombre (si se acaba el limón, se apaga en todos los productos)
  const toppings = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const d of dishes) for (const t of d.toppings ?? []) {
      if (t?.nombre) map.set(t.nombre, [...(map.get(t.nombre) ?? []), d.name])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [dishes])

  const catLabel = (c: string) => menu.categories.find(x => x.value === c)?.label ?? c
  const byCategory = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? dishes.filter(d => d.name.toLowerCase().includes(q)) : dishes
    return orderCategories([...new Set(list.map(d => d.category))], menu.categories)
      .map(c => [c, list.filter(d => d.category === c)] as const)
  }, [dishes, menu.categories, search])

  const toggleOpcion = async (tipo: Tipo, nombre: string, activo: boolean) => {
    setBusy(`${tipo}:${nombre}`)
    const { error } = await supabase.rpc('set_opcion_menu_activa', { p_tipo: tipo, p_nombre: nombre, p_activo: activo })
    setBusy(null)
    if (error) message.error('Error: ' + error.message)
    else message.success(`${nombre}: ${activo ? 'disponible' : 'agotado'}`)
  }

  const togglePlato = async (d: DishRow) => {
    setBusy(`dish:${d.id}`)
    const { error } = await supabase.rpc('set_plato_disponible', { p_dish_id: d.id, p_disponible: !d.available })
    setBusy(null)
    if (error) { message.error('Error: ' + error.message); return }
    setDishes(prev => prev.map(x => x.id === d.id ? { ...x, available: !d.available } : x))
    message.success(`${d.name}: ${!d.available ? 'disponible' : 'agotado'}`)
  }

  const flavorGroup = (tipo: 'helado' | 'jugo', all: string[], off: string[]) => all.length === 0
    ? <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>No hay sabores configurados (se agregan en Menú → Configurar).</p>
    : (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {all.map(f => {
          const on = !off.includes(f)
          return <Toggle key={f} label={f} on={on} busy={busy === `${tipo}:${f}`} onClick={() => toggleOpcion(tipo, f, !on)} />
        })}
      </div>
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: 'var(--w-sans)' }}>
      <div>
        <h2 className="ed-display" style={{ fontWeight: 600, fontSize: '1.875rem', margin: 0 }}>Gestión del menú</h2>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>
          Toca para marcar lo que se agotó (tachado) o volver a activarlo. El cambio se ve al instante en el menú del cliente y al tomar pedidos.
        </p>
      </div>

      <Section title="Sabores de helado" sub="Los que aparecen al elegir helado.">
        {flavorGroup('helado', menu.heladoFlavors, menu.heladoOff)}
      </Section>

      <Section title="Sabores de jugo" sub="Los que aparecen al elegir jugo.">
        {flavorGroup('jugo', menu.jugoFlavors, menu.jugoOff)}
      </Section>

      <Section title="Toppings" sub="Se activan o desactivan en todos los productos que los usan.">
        {toppings.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>Ningún producto tiene toppings.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {toppings.map(([nombre, platos]) => {
              const on = !menu.toppingsOff.includes(nombre)
              return <Toggle key={nombre} label={nombre} on={on} busy={busy === `topping:${nombre}`}
                hint={`En: ${platos.join(', ')}`} onClick={() => toggleOpcion('topping', nombre, !on)} />
            })}
          </div>
        )}
      </Section>

      <Section title="Productos" sub="Un producto agotado deja de aparecer en el menú y al tomar pedidos.">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..."
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '0.875rem', border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)', fontSize: '0.9375rem', outline: 'none', fontFamily: 'var(--w-sans)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {byCategory.map(([cat, list]) => (
            <div key={cat}>
              <p className="ed-kicker" style={{ margin: '0 0 0.5rem' }}>{catLabel(cat)}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {list.map(d => <Toggle key={d.id} label={d.name} on={d.available} busy={busy === `dish:${d.id}`} onClick={() => togglePlato(d)} />)}
              </div>
            </div>
          ))}
          {byCategory.length === 0 && <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>Sin productos.</p>}
        </div>
      </Section>
    </div>
  )
}
