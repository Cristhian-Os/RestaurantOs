import { useEffect, useState } from 'react'
import { domiciliosService } from '../../services/domiciliosService'

/** Foto del comprobante de una transferencia (enlace temporal firmado). Toca para verla grande. */
export function Comprobante({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let vivo = true; domiciliosService.urlComprobante(path).then(u => { if (vivo) setUrl(u) }); return () => { vivo = false } }, [path])
  if (!url) return <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Cargando comprobante…</p>
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Comprobante de transferencia" className="max-h-56 w-full rounded-[var(--w-r-md)] object-contain" /></a>
}
