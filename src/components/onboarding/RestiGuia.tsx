/** Resti guiando el asistente de configuración: sprite + globo con lo que pregunta, propone o resume, y botones de confirmación. */
import type { ReactNode } from 'react'
import { RestiSprite, type RestiPose } from '../resti/RestiSprite'

const globo: React.CSSProperties = {
  flex: 1, minWidth: 0, background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem',
  padding: '0.75rem 1rem', boxShadow: 'var(--w-shadow-sm)', fontFamily: 'var(--w-sans)', color: 'var(--w-ink)', fontSize: '0.9375rem', lineHeight: 1.4,
}
const boton: React.CSSProperties = {
  border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem',
  borderRadius: '0.75rem', padding: '0.7rem 1.1rem', minHeight: '2.75rem',
}

export function RestiGuia({ texto, pose = 'wave', children }: { texto: string; pose?: RestiPose; children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', margin: '0 0 1rem' }}>
      <div style={{ flexShrink: 0 }}><RestiSprite pose={pose} width={64} /></div>
      <div style={globo}>
        <p style={{ margin: 0 }}>{texto}</p>
        {children}
      </div>
    </div>
  )
}

/** Resumen antes de una carga en lote: nada se guarda hasta que el administrador confirma. */
export function RestiConfirma({ resumen, ocupado, onConfirmar, onRevisar }: { resumen: string; ocupado?: boolean; onConfirmar: () => void; onRevisar: () => void }) {
  return (
    <RestiGuia texto={`${resumen} ¿Confirmas?`} pose="click">
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.625rem' }}>
        <button style={{ ...boton, background: 'var(--w-terra)', color: '#fff', opacity: ocupado ? 0.7 : 1 }} disabled={ocupado} onClick={onConfirmar}>Sí, guardar</button>
        <button style={{ ...boton, background: 'var(--w-bg)', color: 'var(--w-ink)', border: '1px solid var(--w-line)' }} disabled={ocupado} onClick={onRevisar}>Quiero revisar</button>
      </div>
    </RestiGuia>
  )
}
