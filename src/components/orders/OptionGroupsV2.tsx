/**
 * OptionGroupsV2 — grupos de opciones del modelo universal (Anexo B), para el constructor de
 * producto de caja/mesero y del menú del cliente. Dibuja los grupos del plato (los heredados
 * llegan convertidos por gruposDe) y escribe la selección en sel.grupos.
 */
import type { CSSProperties } from 'react'
import type { ItemSel, OptionGroupV2, OptionItem } from '../../types'
import { itemsDeGrupo, itemsVisibles, maxDeGrupo, subKey, toggleIn, type ListMap } from '../../services/menuOptions'

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`

interface Props {
  groups:    OptionGroupV2[]
  listas:    ListMap
  sel:       ItemSel
  setSel:    (fn: (s: ItemSel) => ItemSel) => void
  chip:      (active: boolean) => CSSProperties
  kicker:    { className?: string; style?: CSSProperties }
  hint:      { className?: string; style?: CSSProperties }
  groupGap?: string
}

const textoElige = (g: OptionGroupV2) => {
  const max = maxDeGrupo(g)
  const min = g.requerido ? Math.max(1, g.min) : g.min
  if (g.modo === 'single') return g.requerido ? '' : ' · opcional'
  if (min === max) return ` · elige ${max}`
  return min > 0 ? ` · elige de ${min} a ${max}` : ` · hasta ${max}`
}

export function OptionGroupsV2({ groups, listas, sel, setSel, chip, kicker, hint, groupGap = '1.25rem' }: Props) {
  const setGrupo = (key: string, vals: string[], limpiar: string[] = []) => setSel(s => {
    const grupos = { ...(s.grupos ?? {}) }
    for (const k of limpiar) delete grupos[k]
    if (vals.length) grupos[key] = vals; else delete grupos[key]
    return { ...s, grupos }
  })

  const pick = (g: OptionGroupV2, it: OptionItem) => {
    const cur = sel.grupos?.[g.id] ?? []
    const on = cur.includes(it.label)
    if (on) {
      if (g.requerido && g.modo === 'single') return            // en una elección obligatoria se cambia, no se quita
      setGrupo(g.id, cur.filter(x => x !== it.label), [subKey(g.id, it.label)])
      return
    }
    if (g.modo === 'single' || maxDeGrupo(g) === 1) {         // "elige 1": tocar otra opción reemplaza la anterior
      setGrupo(g.id, [it.label], cur.map(x => subKey(g.id, x)))
      return
    }
    if (cur.length >= maxDeGrupo(g)) return
    setGrupo(g.id, toggleIn(cur, it.label))
  }

  return (
    <>
      {groups.map(g => {
        const cur = sel.grupos?.[g.id] ?? []
        const items = itemsVisibles(g, listas, cur)
        const full = g.modo === 'multi' && maxDeGrupo(g) > 1 && cur.length >= maxDeGrupo(g)
        return (
          <div key={g.id} style={{ marginBottom: groupGap }}>
            <p className={kicker.className} style={kicker.style}>{g.nombre}{textoElige(g)}</p>
            {items.length === 0 ? (
              <p className={hint.className} style={hint.style}>(No hay opciones disponibles ahora)</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {items.map(it => {
                  const on = cur.includes(it.label)
                  const extra = Number(it.precio_extra) || 0
                  return (
                    <button key={it.label} onClick={() => pick(g, it)} disabled={!on && full}
                      style={{ ...chip(on), opacity: !on && full ? 0.45 : 1 }}>
                      {g.modo === 'multi' && on ? '✓ ' : ''}{it.label}{extra > 0 ? ` · +${fmt(extra)}` : ''}
                    </button>
                  )
                })}
              </div>
            )}
            {g.modo === 'multi' && maxDeGrupo(g) > 1 && (
              <p className={hint.className} style={{ ...hint.style, marginTop: '0.375rem' }}>{cur.length} / {maxDeGrupo(g)}</p>
            )}

            {/* Sub-elección de un ítem (ej. "Con helado" pide sus sabores) */}
            {cur.map(label => {
              const it = itemsDeGrupo(g, listas).find(x => x.label === label)
              if (!it?.sub) return null
              const key = subKey(g.id, label)
              const subSel = sel.grupos?.[key] ?? []
              const opciones = (listas[it.sub.lista] ?? []).filter(x => x.activo !== false || subSel.includes(x.label))
              const cant = it.sub.cantidad
              return (
                <div key={key} style={{ marginTop: '0.875rem' }}>
                  <p className={hint.className} style={{ ...hint.style, marginBottom: '0.5rem' }}>
                    {label}: elige {cant === 1 ? 'una opción' : `hasta ${cant} opciones`}
                  </p>
                  {opciones.length === 0 ? (
                    <p className={hint.className} style={hint.style}>(No hay opciones disponibles ahora)</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {opciones.map(o => {
                        const on = subSel.includes(o.label)
                        const lleno = subSel.length >= cant
                        return (
                          <button key={o.label} disabled={!on && lleno}
                            onClick={() => setGrupo(key, on ? subSel.filter(x => x !== o.label) : [...subSel, o.label])}
                            style={{ ...chip(on), opacity: !on && lleno ? 0.45 : 1 }}>
                            {on ? '✓ ' : ''}{o.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <p className={hint.className} style={{ ...hint.style, marginTop: '0.375rem' }}>{subSel.length} / {cant}</p>
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
