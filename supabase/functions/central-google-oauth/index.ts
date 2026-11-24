// central-google-oauth: conecta UNA cuenta de Google Workspace (el buzón de ventas) con Central por OAuth, para correo y calendario.
//   · El dueño (con 2 pasos) guarda el ID y el secreto del cliente OAuth y pide el enlace de Google; Google vuelve aquí (GET) con un código de un solo uso.
//   · Solo se guarda un permiso revocable (refresh token) en platform_secrets, sin acceso desde la app. Nunca se devuelve ni se escribe en registros.
//   · Esta función NO envía correos ni crea citas: solo establece la conexión. Cada conexión, cambio y desconexión queda en la auditoría.
// Es pública a propósito (Google no puede mandar sesión); lo que la protege es el "estado" de un solo uso (15 min) y que solo el dueño puede iniciarlo.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, exigirDueno } from '../_shared/central_acceso.ts'
import { correoDeIdToken, crearEstado, estadoValido, paginaResultado, urlAutorizacion, validarCliente } from './logica.ts'

const K = { id: 'central_google_client_id', secreto: 'central_google_client_secret', refresh: 'central_google_refresh', cuenta: 'central_google_cuenta', estado: 'central_google_state' }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/central-google-oauth`
  const leer = async (k: string): Promise<string | null> => ((await admin.from('platform_secrets').select('value').eq('key', k).maybeSingle()).data?.value as string | undefined) ?? null
  const guardar = (k: string, v: string) => admin.from('platform_secrets').upsert({ key: k, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  const borrar = (k: string) => admin.from('platform_secrets').delete().eq('key', k)
  const html = (ok: boolean, msg: string, status = 200) => new Response(paginaResultado(ok, msg), {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" },
  })
  const out = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  const auditar = (actor: string | null, accion: string, detalle: Record<string, unknown>) =>
    admin.from('central_auditoria').insert({ actor_tipo: 'humano', actor_id: actor, accion, recurso: 'google', nivel: 'N3', resultado: 'ok', detalle })

  try {
    // ───────────── Vuelta de Google ─────────────
    if (req.method === 'GET') {
      const q = new URL(req.url).searchParams
      const code = q.get('code'), estado = q.get('state')
      if (q.get('error')) return html(false, 'Google no dio el permiso. Si fue un error tuyo, vuelve a intentarlo desde Central.', 400)
      if (!code || !estado) return html(false, 'Falta información de Google.', 400)
      const guardado = await leer(K.estado)
      await borrar(K.estado)                                   // de un solo uso, sirva o no
      if (!estadoValido(guardado, estado, Date.now())) return html(false, 'El enlace venció o no es válido. Vuelve a pulsar "Conectar con Google" en Central.', 400)
      const id = await leer(K.id), secreto = await leer(K.secreto)
      if (!id || !secreto) return html(false, 'Falta guardar el ID y el secreto del cliente en Central.', 400)
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: id, client_secret: secreto, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      })
      if (!r.ok) return html(false, 'Google rechazó el permiso. Revisa que el ID, el secreto y la dirección de retorno estén bien en Google Cloud.', 502)
      const j = await r.json() as { refresh_token?: string; scope?: string; id_token?: string }
      const permisos = String(j.scope ?? '')
      if (!j.refresh_token || !permisos.includes('gmail.send')) return html(false, 'Google no entregó todos los permisos (falta el de enviar correo). Vuelve a conectar y acepta todos.', 502)
      const correo = correoDeIdToken(j.id_token)
      if (!correo) return html(false, 'No se pudo confirmar qué cuenta se conectó.', 502)
      await guardar(K.refresh, j.refresh_token); await guardar(K.cuenta, correo)
      await auditar(null, 'google_conectar', { cuenta: correo, correo: permisos.includes('gmail.readonly'), calendario: permisos.includes('calendar') })
      return html(true, `Se conectó la cuenta ${correo}. Todavía no se envía nada: eso se activa aparte.`)
    }

    // ───────────── Acciones del panel (dueño con 2 pasos) ─────────────
    const cuerpo = await req.json().catch(() => null) as Record<string, unknown> | null
    const acceso = await exigirDueno(req, admin as never)
    if (!acceso.ok) return out({ ok: false, error: acceso.codigo, mensaje: 'Solo el dueño con su código de 2 pasos puede usar esto.' }, acceso.status)
    const accion = typeof cuerpo?.accion === 'string' ? cuerpo.accion : ''

    if (accion === 'estado') {
      return out({ ok: true, cliente: !!(await leer(K.id)) && !!(await leer(K.secreto)), conectado: !!(await leer(K.refresh)), cuenta: await leer(K.cuenta), redirect_uri: redirectUri })
    }
    if (accion === 'guardar_cliente') {
      const motivo = validarCliente(cuerpo?.id, cuerpo?.secreto)
      if (motivo) return out({ ok: false, error: 'peticion', mensaje: motivo }, 400)
      const eraOtro = (await leer(K.id)) !== String(cuerpo!.id).trim()
      await guardar(K.id, String(cuerpo!.id).trim()); await guardar(K.secreto, String(cuerpo!.secreto).trim())
      if (eraOtro) { await borrar(K.refresh); await borrar(K.cuenta) }      // otro cliente = otra conexión
      await auditar(acceso.userId, 'google_guardar_cliente', {})
      return out({ ok: true })
    }
    if (accion === 'url') {
      const id = await leer(K.id)
      if (!id || !(await leer(K.secreto))) return out({ ok: false, error: 'sin_cliente', mensaje: 'Primero guarda el ID y el secreto del cliente.' }, 409)
      const bytes = new Uint8Array(24); crypto.getRandomValues(bytes)
      const estado = crearEstado(Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''), Date.now())
      await guardar(K.estado, estado)
      return out({ ok: true, url: urlAutorizacion(id, redirectUri, estado) })
    }
    if (accion === 'desconectar') {
      const refresh = await leer(K.refresh)
      if (refresh) await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refresh }) }).catch(() => null)
      await borrar(K.refresh); await borrar(K.cuenta); await borrar(K.estado)
      await auditar(acceso.userId, 'google_desconectar', {})
      return out({ ok: true })
    }
    return out({ ok: false, error: 'peticion', mensaje: 'Acción desconocida.' }, 400)
  } catch {
    return req.method === 'GET' ? html(false, 'Algo falló en el servidor. Inténtalo de nuevo.', 500) : out({ ok: false, error: 'interno', mensaje: 'Algo falló en el servidor.' }, 500)
  }
})
