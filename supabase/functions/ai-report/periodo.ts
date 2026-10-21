// Último periodo COMPLETO en hora de Colombia (UTC-5 todo el año): semana lunes a domingo, o mes calendario.
// Lo decide el servidor: el navegador no elige fechas (así no se puede pedir reportes de cualquier rango para gastar IA).
const ymd = (d: Date) => d.toISOString().slice(0, 10)

export function periodo(tipo: 'semanal' | 'mensual', ahora = new Date()): { desde: string; hasta: string } {
  const bog = new Date(ahora.getTime() - 5 * 3600_000)
  const hoy = new Date(Date.UTC(bog.getUTCFullYear(), bog.getUTCMonth(), bog.getUTCDate()))
  if (tipo === 'semanal') {
    const lunes = new Date(hoy.getTime() - ((hoy.getUTCDay() + 6) % 7) * 86400_000)
    return { desde: ymd(new Date(lunes.getTime() - 7 * 86400_000)), hasta: ymd(new Date(lunes.getTime() - 86400_000)) }
  }
  const primero = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1))
  return { desde: ymd(new Date(Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth() - 1, 1))), hasta: ymd(new Date(primero.getTime() - 86400_000)) }
}
