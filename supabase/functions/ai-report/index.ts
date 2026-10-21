// Edge Function: ai-report  (verify_jwt = true)
// Reporte semanal o mensual con IA para el administrador de un restaurante. Los números salen de `reporte_datos` (base de datos);
// la IA solo los redacta y el servidor valida que cada cifra exista en los datos (ver generar.ts).
// Seguridad: los datos se piden con el JWT de quien llama (la base exige ser administrador de ese restaurante); el periodo lo decide
// el servidor (último periodo completo), no el navegador; nada se genera si la IA está apagada para ese restaurante o se llegó al tope.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { callModel, costoUsd, MODELO_POR_DEFECTO, type ConfigProveedor } from './modelo.ts'
import { redactar } from './generar.ts'
import { periodo } from './periodo.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const COLUMNAS = 'id, tipo, periodo_desde, periodo_hasta, estado, resultado, datos, created_at'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const auth = req.headers.get('Authorization') ?? ''
    const body = await req.json().catch(() => ({}))
    const tipo = body?.tipo === 'mensual' ? 'mensual' : body?.tipo === 'semanal' ? 'semanal' : null
    if (!tipo) return json({ error: 'Tipo de reporte no válido' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user } } = await admin.auth.getUser(auth.replace('Bearer ', ''))
    const { data: rid } = await comoUsuario.rpc('current_restaurant_id')
    if (!user || !rid) return json({ error: 'No autorizado' }, 401)

    const { desde, hasta } = periodo(tipo)
    const { data: datos, error: eDatos } = await comoUsuario.rpc('reporte_datos', { p_desde: desde, p_hasta: hasta })
    if (eDatos || !datos) return json({ error: 'Solo el administrador puede generar reportes' }, 403)

    const { data: ok } = await admin.rpc('check_rate_limit', { p_key: `aireport:${user.id}`, p_max: 6, p_window_seconds: 3600 })
    if (ok === false) return json({ error: 'Demasiadas solicitudes. Intenta en un rato.' }, 429)

    const { data: cupo } = await admin.rpc('ai_cupo', { p_restaurant: rid, p_tipo: tipo, p_desde: desde, p_hasta: hasta })
    if (!cupo?.permitido) {
      if (cupo?.motivo === 'ya_existe') {
        const { data: previo } = await admin.from('ai_reports').select(COLUMNAS).eq('id', cupo.report_id).single()
        return json({ reporte: previo, existente: true })
      }
      if (cupo?.motivo === 'tope_global') return json({ error: 'Se alcanzó el límite de reportes con IA de este mes. Se renueva el próximo mes.', codigo: 'tope' }, 429)
      return json({ error: 'La IA todavía no está activa para tu restaurante.', codigo: 'apagada' }, 403)
    }
    if (!datos.ventas?.pedidos) return json({ sin_datos: true, mensaje: 'No hubo ventas en ese periodo, así que no hay nada que analizar.', periodo: { desde, hasta } })

    // Proveedor y claves: de la plataforma (platform_secrets), nunca del código ni del navegador
    const { data: filas } = await admin.from('platform_secrets').select('key, value').in('key', ['gemini_api_key', 'ai_proveedor', 'ai_modelo', 'ai_url_base', 'ai_api_key'])
    const s = Object.fromEntries((filas ?? []).map((f: { key: string; value: string }) => [f.key, f.value]))
    const cfg: ConfigProveedor = s.ai_proveedor === 'compatible'
      ? { proveedor: 'compatible', modelo: s.ai_modelo ?? '', clave: s.ai_api_key ?? '', urlBase: s.ai_url_base }
      : { proveedor: 'gemini', modelo: s.ai_modelo || MODELO_POR_DEFECTO, clave: s.gemini_api_key ?? '' }
    if (!cfg.clave) return json({ error: 'Config faltante' }, 500)
    const { data: precios } = await admin.from('platform_settings').select('clave, valor').in('clave', ['ai_precio_entrada_usd_millon', 'ai_precio_salida_usd_millon'])
    const p = Object.fromEntries((precios ?? []).map((x: { clave: string; valor: number }) => [x.clave, Number(x.valor)]))

    const g = await redactar(tipo, datos, pedido => callModel(cfg, pedido, fetch as never))
    const costo = costoUsd(g.tokensEntrada, g.tokensSalida, p.ai_precio_entrada_usd_millon ?? 0.3, p.ai_precio_salida_usd_millon ?? 2.5)

    if (g.tokensEntrada + g.tokensSalida > 0) {
      await admin.from('ai_usage').insert({ restaurant_id: rid, funcion: `reporte_${tipo}`, proveedor: g.proveedor, modelo: g.modelo, tokens_entrada: g.tokensEntrada, tokens_salida: g.tokensSalida, costo_usd: costo })
    }
    const { data: guardado, error: eGuardar } = await admin.from('ai_reports').insert({
      restaurant_id: rid, tipo, periodo_desde: desde, periodo_hasta: hasta, datos: g.datosEnviados, resultado: g.resultado, estado: g.estado,
      proveedor: g.proveedor, modelo: g.modelo, tokens_entrada: g.tokensEntrada, tokens_salida: g.tokensSalida, costo_usd: costo,
      intentos: g.intentos, error: g.error ? g.error.slice(0, 500) : null, origen: 'manual', pedido_por: user.id,
    }).select(COLUMNAS).single()
    if (eGuardar) {
      // Dos pedidos a la vez del mismo periodo: gana el primero
      const { data: previo } = await admin.from('ai_reports').select(COLUMNAS)
        .eq('restaurant_id', rid).eq('tipo', tipo).eq('periodo_desde', desde).eq('periodo_hasta', hasta).in('estado', ['ok', 'sin_redaccion']).maybeSingle()
      if (previo) return json({ reporte: previo, existente: true })
      console.error('ai_reports insert', eGuardar.message)
      return json({ error: 'No se pudo guardar el reporte' }, 500)
    }
    if (g.estado === 'error') return json({ error: 'La IA no está disponible ahora. Intenta de nuevo más tarde.', codigo: 'proveedor' }, 502)
    return json({ reporte: guardado })
  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
