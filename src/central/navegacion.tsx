/**
 * navegacion.tsx — enrutamiento de Central (/central/<seccion>/<id>) sin librerías: history.pushState + popstate.
 * Las reglas de las rutas están en rutas.ts (con prueba). Un enlace normal (clic con Ctrl, nueva pestaña) sigue funcionando.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { parseRuta, rutaAPath, type Ruta, type Seccion } from './rutas.ts'

interface Ctx { ruta: Ruta; ir: (seccion: Seccion, id?: string | null) => void }
const RutaCtx = createContext<Ctx | null>(null)

export function RutaProvider({ children }: { children: ReactNode }) {
  const [ruta, setRuta] = useState<Ruta>(() => parseRuta(window.location.pathname))
  useEffect(() => {
    const alRetroceder = () => setRuta(parseRuta(window.location.pathname))
    window.addEventListener('popstate', alRetroceder)
    return () => window.removeEventListener('popstate', alRetroceder)
  }, [])
  const ir = useCallback((seccion: Seccion, id?: string | null) => {
    const destino = rutaAPath(seccion, id)
    if (destino !== window.location.pathname) window.history.pushState({}, '', destino)
    setRuta(parseRuta(destino))
    window.scrollTo(0, 0)
  }, [])
  const valor = useMemo(() => ({ ruta, ir }), [ruta, ir])
  return <RutaCtx.Provider value={valor}>{children}</RutaCtx.Provider>
}

export function useRuta(): Ctx {
  const c = useContext(RutaCtx)
  if (!c) throw new Error('useRuta fuera de RutaProvider')
  return c
}

export function Enlace({ a, id, children, onClick, ...resto }: { a: Seccion; id?: string | null; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const { ir } = useRuta()
  return (
    <a
      {...resto}
      href={rutaAPath(a, id)}
      onClick={e => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        ir(a, id)
      }}
    >
      {children}
    </a>
  )
}
