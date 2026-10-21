// Redacta el reporte con la IA y lo valida. Lógica pura: el modelo entra como función, así se prueba sin red.
//  1) Se limpian los datos (sin campos de personas) antes de enviarlos.  2) Se pide el JSON.  3) Se valida forma y cifras.
//  4) Si falla, un reintento diciéndole qué estuvo mal.  5) Si vuelve a fallar: se muestran solo los datos, sin redacción.
import type { PedidoModelo, RespuestaModelo } from './modelo.ts'
import { instrucciones, mensajeCorreccion, mensajeDatos, type TipoReporte } from './prompt.ts'
import { cifrasInventadas, limpiarPersonales, tieneCorreo, validarEsquema, type Resultado } from './validar.ts'

export interface Generacion {
  estado: 'ok' | 'sin_redaccion' | 'error'
  resultado: Resultado | null
  error: string | null
  intentos: number
  tokensEntrada: number
  tokensSalida: number
  proveedor: string | null
  modelo: string | null
  datosEnviados: unknown
}

export async function redactar(tipo: TipoReporte, datos: unknown, llamar: (p: PedidoModelo) => Promise<RespuestaModelo>): Promise<Generacion> {
  const limpios = limpiarPersonales(datos)
  const g: Generacion = { estado: 'error', resultado: null, error: null, intentos: 0, tokensEntrada: 0, tokensSalida: 0, proveedor: null, modelo: null, datosEnviados: limpios }
  if (tieneCorreo(limpios)) { g.error = 'Los datos contienen un correo: no se envían a la IA'; return g }
  const sistema = instrucciones(tipo)
  let usuario = mensajeDatos(tipo, limpios)
  let hubo = false
  for (let i = 1; i <= 2; i++) {
    g.intentos = i
    let r: RespuestaModelo
    try { r = await llamar({ sistema, usuario }) } catch (e) { g.error = e instanceof Error ? e.message : 'Falló el proveedor'; continue }
    hubo = true
    g.tokensEntrada += r.tokensEntrada; g.tokensSalida += r.tokensSalida; g.proveedor = r.proveedor; g.modelo = r.modelo
    const v = validarEsquema(r.texto)
    if (!v.ok) { g.error = v.error; usuario = `${mensajeDatos(tipo, limpios)}\n\n${mensajeCorreccion(v.error, [])}`; continue }
    const malas = cifrasInventadas(v.r, limpios)
    if (malas.length) { g.error = `Cifras que no están en los datos: ${malas.join(', ')}`; usuario = `${mensajeDatos(tipo, limpios)}\n\n${mensajeCorreccion('usaste cifras que no existen', malas)}`; continue }
    g.estado = 'ok'; g.resultado = v.r; g.error = null
    return g
  }
  g.estado = hubo ? 'sin_redaccion' : 'error'
  return g
}
