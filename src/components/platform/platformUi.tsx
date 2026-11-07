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
  width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.8rem', borderRadius: 'var(--w-r-md)', border: '1px solid var(--w-border-strong)',
  background: 'var(--w-surface)', color: 'var(--w-text)', fontSize: 'var(--w-fs-body)', minHeight: '2.75rem', fontFamily: 'inherit',
}
export const boton: React.CSSProperties = {
  border: '1px solid var(--w-border-strong)', cursor: 'pointer', fontWeight: 600, fontSize: 'var(--w-fs-body)', borderRadius: 'var(--w-r-md)', padding: '0.6rem 1rem', minHeight: '2.75rem', fontFamily: 'inherit',
}
export const botonPrimario: React.CSSProperties = { ...boton, border: 'none', background: 'var(--w-accent)', color: 'var(--w-on-accent)', fontWeight: 700 }
export const botonSuave: React.CSSProperties = { ...boton, background: 'var(--w-surface)', color: 'var(--w-text)' }
export const etiqueta: React.CSSProperties = { fontSize: 'var(--w-fs-label)', fontWeight: 600, color: 'var(--w-text-2)', display: 'block', marginBottom: '0.25rem' }
export const tarjeta: React.CSSProperties = { borderRadius: 'var(--w-r-lg)', padding: '1rem 1.25rem', background: 'var(--w-surface)', border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-sm)', color: 'var(--w-text)' }
export const suave: React.CSSProperties = { color: 'var(--w-text-2)', fontSize: 'var(--w-fs-label)' }

/** Encabezado de módulo de las láminas: icono naranja + título + subtítulo (+ acción a la derecha). */
export function EncabezadoModulo({ icono, titulo, subtitulo, acciones }: { icono: React.ReactNode; titulo: string; subtitulo?: string; acciones?: React.ReactNode }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
      <div aria-hidden style={{ width: 44, height: 44, borderRadius: 'var(--w-r-md)', background: 'var(--w-accent-soft)', color: 'var(--w-accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.375rem', flexShrink: 0 }}>
        {icono}
      </div>
      <div style={{ flex: '1 1 12rem', minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 'var(--w-fs-screen)', fontWeight: 700, lineHeight: 1.15, color: 'var(--w-text)' }}>{titulo}</h1>
        {subtitulo && <p style={{ margin: '0.125rem 0 0', fontSize: 'var(--w-fs-label)', color: 'var(--w-text-3)' }}>{subtitulo}</p>}
      </div>
      {acciones}
    </header>
  )
}

export function Modal({ children, onClose, ancho = '44rem' }: { children: React.ReactNode; onClose: () => void; ancho?: string }) {
  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'var(--w-overlay)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--w-surface-raised)', color: 'var(--w-text)', border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-lg)', borderRadius: 'var(--w-r-xl)', width: '100%', maxWidth: ancho, padding: '1.25rem', margin: '1rem 0' }}>
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
