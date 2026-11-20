import { cambioLocal, cuandoLegible, type MenuHorarioEstado } from '../../../lib/menuHorario'

interface Props {
  estado: MenuHorarioEstado | null
  /** 'cliente': tarjeta del menú público. 'personal': línea compacta para mesero/caja. */
  variante?: 'cliente' | 'personal'
}

/**
 * Qué menú rige ahora y cuándo llega el siguiente. Si el restaurante no usa menús por horario
 * (estado null o apagado) no dibuja nada: el menú se ve exactamente como siempre.
 */
export function BannerMenuHorario({ estado, variante = 'cliente' }: Props) {
  if (!estado?.activo) return null
  const menus = estado.menus ?? []
  const ahora = estado.hora_local
  const fin = cambioLocal(estado)
  const sig = estado.siguiente
  const nombres = menus.map(m => m.nombre).join(' + ')
  const descripciones = menus.map(m => m.descripcion).filter((d): d is string => !!d)
  const sigTxt = sig && ahora ? `${sig.menus.map(m => m.nombre).join(' + ')} ${cuandoLegible(ahora, sig.desde_local)}` : null
  const cambiaTxt = fin && ahora && menus.length > 0 ? cuandoLegible(ahora, fin) : null

  if (variante === 'personal') {
    return (
      <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.375rem 0.75rem', padding: '0.5rem 0.875rem', borderRadius: '0.875rem', background: 'var(--w-surface-sunken)', border: '1px solid var(--w-border)', fontSize: '0.8125rem', color: 'var(--w-text-2)', fontFamily: 'var(--w-font)' }}>
        <span style={{ fontWeight: 700, color: 'var(--w-text)' }}>
          {menus.length > 0 ? `Menú ahora: ${nombres}` : 'Ahora no hay menú por horario'}
        </span>
        {estado.modo === 'manual' && <span style={{ fontWeight: 700, color: 'var(--w-accent-text)' }}>· Control manual</span>}
        {cambiaTxt && <span>· Cambia {cambiaTxt}</span>}
        {!cambiaTxt && sigTxt && <span>· Sigue: {sigTxt}</span>}
      </div>
    )
  }

  return (
    <div className="menu-wrap" style={{ padding: '0 1rem', margin: '0 auto 1rem' }}>
      <div role="status" style={{ borderRadius: '1.25rem', padding: '1rem 1.125rem', background: 'var(--w-surface)', border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-sm)', fontFamily: 'var(--w-font)' }}>
        <p className="ed-kicker" style={{ margin: '0 0 0.25rem' }}>{menus.length > 0 ? 'Menú de ahora' : 'Menú por horarios'}</p>
        <p style={{ margin: 0, fontWeight: 800, fontSize: '1.25rem', lineHeight: 1.2, color: 'var(--w-text)' }}>
          {menus.length > 0 ? nombres : 'Ahora no hay un menú abierto'}
        </p>
        {descripciones.length > 0 && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--w-text-2)' }}>{descripciones.join(' · ')}</p>
        )}
        {menus.length === 0 && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--w-text-2)' }}>
            Por ahora solo están disponibles los productos de todo el día.
          </p>
        )}
        {(cambiaTxt || sigTxt) && (
          <p style={{ margin: '0.625rem 0 0', paddingTop: '0.625rem', borderTop: '1px solid var(--w-border)', fontSize: '0.8125rem', color: 'var(--w-text-3)' }}>
            {sigTxt
              ? <>Siguiente menú: <strong style={{ color: 'var(--w-text)' }}>{sigTxt}</strong></>
              : <>El menú cambia <strong style={{ color: 'var(--w-text)' }}>{cambiaTxt}</strong></>}
          </p>
        )}
      </div>
    </div>
  )
}
