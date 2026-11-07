import { useEffect, useState } from 'react'

/** Ancho bajo el cual el Dashboard muestra la píldora inferior (igual que `isPhone` en Dashboard). */
export const ANCHO_PILDORA = 900

/** true mientras la píldora flotante está visible; se actualiza al girar o cambiar el tamaño de la ventana. */
export function useNavFlotante(): boolean {
  const [on, setOn] = useState(() => window.innerWidth < ANCHO_PILDORA)
  useEffect(() => {
    const f = () => setOn(window.innerWidth < ANCHO_PILDORA)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return on
}
