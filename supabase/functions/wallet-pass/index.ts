// Edge Function: wallet-pass  (PÚBLICA — verify_jwt = false)
// ─────────────────────────────────────────────────────────────────────────
// Entrega la tarjeta de fidelidad del cliente para Apple Wallet y Google Wallet.
//   GET ?tipo=estado                  → { google: bool, apple: bool }  (qué wallets están configuradas)
//   GET ?tipo=google&token=<64 hex>   → 302 a "Agregar a Google Wallet"
//   GET ?tipo=apple&token=<64 hex>    → archivo .pkpass
// El token es el mismo código largo del QR del cliente. Los datos salen de fid_tarjeta_publica
// (solo primer nombre, restaurante y nivel; nunca teléfono ni gasto). Límite de uso por token.
//
// Secretos (solo en Supabase, nunca en el repositorio). Sin ellos, esa wallet queda apagada:
//   APP_URL                       https://dominio-de-la-app (sin barra final)
//   GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL, GOOGLE_WALLET_SA_PRIVATE_KEY
//   APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT_PEM, APPLE_PASS_KEY_PEM, APPLE_WWDR_CERT_PEM
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { googleSaveUrl, type GoogleCfg, type PaseDatos } from './google.ts'
import { applePkpass, type AppleCfg } from './apple.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TOKEN = /^[0-9a-f]{64}$/
const env = (k: string) => Deno.env.get(k) ?? ''

function configuracion() {
  const appUrl = env('APP_URL').replace(/\/$/, '')
  const google: GoogleCfg | null = appUrl && env('GOOGLE_WALLET_ISSUER_ID') && env('GOOGLE_WALLET_SA_EMAIL') && env('GOOGLE_WALLET_SA_PRIVATE_KEY')
    ? { issuerId: env('GOOGLE_WALLET_ISSUER_ID'), saEmail: env('GOOGLE_WALLET_SA_EMAIL'), saKeyPem: env('GOOGLE_WALLET_SA_PRIVATE_KEY') }
    : null
  const apple: AppleCfg | null = appUrl && env('APPLE_PASS_TYPE_ID') && env('APPLE_TEAM_ID') && env('APPLE_PASS_CERT_PEM') && env('APPLE_PASS_KEY_PEM') && env('APPLE_WWDR_CERT_PEM')
    ? { passTypeId: env('APPLE_PASS_TYPE_ID'), teamId: env('APPLE_TEAM_ID'), certPem: env('APPLE_PASS_CERT_PEM'), keyPem: env('APPLE_PASS_KEY_PEM'), wwdrPem: env('APPLE_WWDR_CERT_PEM') }
    : null
  return { appUrl, google, apple }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return json({ error: 'método no permitido' }, 405)

  const q = new URL(req.url).searchParams
  const tipo = q.get('tipo')
  const { appUrl, google, apple } = configuracion()

  if (tipo === 'estado') return json({ google: !!google, apple: !!apple })
  if (tipo !== 'google' && tipo !== 'apple') return json({ error: 'tipo inválido' }, 400)

  const token = q.get('token') ?? ''
  if (!TOKEN.test(token)) return json({ error: 'código inválido' }, 400)
  if ((tipo === 'google' ? google : apple) === null) return json({ error: 'no_configurado' }, 503)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: permitido } = await admin.rpc('check_rate_limit', { p_key: `wallet:${token.slice(0, 16)}`, p_max: 10, p_window_seconds: 60 })
  if (permitido !== true) return json({ error: 'demasiados intentos, espera un momento' }, 429)

  const { data: tarjeta } = await admin.rpc('fid_tarjeta_publica', { p_token: token })
  if (!tarjeta) return json({ error: 'tarjeta no disponible' }, 404)

  const datos: PaseDatos = {
    token,
    restaurante: String(tarjeta.restaurante ?? 'Restaurante'),
    nombre: String(tarjeta.nombre ?? 'Cliente'),
    nivel: tarjeta.nivel ?? null,
    urlTarjeta: `${appUrl}/tarjeta/${token}`,
    logoUrl: `${appUrl}/logo.jpg`,
  }

  try {
    if (tipo === 'google') {
      return new Response(null, { status: 302, headers: { ...cors, Location: await googleSaveUrl(google!, datos) } })
    }
    const bytes = await applePkpass(apple!, datos)
    return new Response(bytes, {
      headers: { ...cors, 'Content-Type': 'application/vnd.apple.pkpass', 'Content-Disposition': 'attachment; filename="tarjeta.pkpass"' },
    })
  } catch (e) {
    console.error('wallet-pass', tipo, e instanceof Error ? e.message : e)
    return json({ error: 'no se pudo generar el pase' }, 500)
  }
})
