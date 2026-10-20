/**
 * platformUi.tsx — piezas compartidas de las pantallas del panel de plataforma (vendedores, pagos, dinero, rendimiento).
 * Los archivos privados (contratos, cuentas de cobro, comprobantes, recibos) se suben a buckets privados y se ven con enlaces temporales.
 */
import { supabase } from '../../services/supabaseClient'

export const cop = (n: number | null | undefined) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n ?? 0))

export const fechaCorta = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const mesLargo = (s: string) => new Date(s.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

export const campo: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.8rem', borderRadius: '0.75rem', border: '1px solid var(--w-line)',
  background: 'var(--w-bg)', color: 'var(--w-ink)', fontSize: '0.9375rem', minHeight: '2.75rem', fontFamily: 'inherit',
}
export const boton: React.CSSProperties = {
  border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', borderRadius: '0.75rem', padding: '0.6rem 1rem', minHeight: '2.75rem', fontFamily: 'inherit',
}
export const botonPrimario: React.CSSProperties = { ...boton, background: 'var(--w-terra, #C2570C)', color: '#fff' }
export const botonSuave: React.CSSProperties = { ...boton, background: 'var(--bg-surface, #CDD0DC)', color: 'var(--text-primary, #2D3561)' }
export const etiqueta: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary, #6b7280)', display: 'block', marginBottom: '0.25rem' }
export const tarjeta: React.CSSProperties = { borderRadius: '1rem', padding: '1rem 1.25rem', background: 'var(--bg, #D8DAE4)', boxShadow: 'var(--shadow-out)', color: 'var(--text-primary, #2D3561)' }
export const suave: React.CSSProperties = { color: 'var(--text-secondary, #6b7280)', fontSize: '0.8125rem' }

export function Modal({ children, onClose, ancho = '44rem' }: { children: React.ReactNode; onClose: () => void; ancho?: string }) {
  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg, #D8DAE4)', color: 'var(--text-primary, #2D3561)', borderRadius: '1rem', width: '100%', maxWidth: ancho, padding: '1.25rem', margin: '1rem 0' }}>
        {children}
      </div>
    </div>
  )
}

export function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div><span style={etiqueta}>{titulo}</span>{children}</div>
}

/** Sube un archivo al bucket privado y devuelve su ruta. La carpeta raíz agrupa por vendedor o por liquidación. */
export async function subirPrivado(bucket: 'contratos-vendedores' | 'comprobantes-vendedores', carpeta: string, file: File | Blob, nombre: string): Promise<string> {
  const limpio = nombre.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-60) || 'archivo'
  const ahora = new Date()
  const ruta = `${carpeta}/${ahora.getFullYear()}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}-${limpio}`
  const { error } = await supabase.storage.from(bucket).upload(ruta, file, { upsert: false, contentType: (file as File).type || undefined })
  if (error) throw new Error('No pude subir el archivo: ' + error.message)
  return ruta
}

/** Abre un archivo privado en una pestaña nueva con un enlace que dura 5 minutos. */
export async function abrirPrivado(bucket: 'contratos-vendedores' | 'comprobantes-vendedores', ruta: string): Promise<void> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(ruta, 300)
  if (error || !data?.signedUrl) throw new Error('No pude abrir el archivo: ' + (error?.message ?? 'sin enlace'))
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

export const hoyBogotaISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
export const primerDiaMes = (iso: string) => iso.slice(0, 8) + '01'
