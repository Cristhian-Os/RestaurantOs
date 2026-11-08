// Google Wallet: arma el enlace "Agregar a Google Wallet" (JWT firmado RS256 con la cuenta de servicio).
// La clase y el objeto van dentro del mismo JWT: Google los crea al guardar, sin llamadas extra a su API.
// Solo WebCrypto: no depende de Deno, así se puede probar en Node.

export interface PaseDatos {
  token: string          // qr_token del cliente (64 hex)
  restaurante: string
  nombre: string         // primer nombre
  nivel: string | null
  urlTarjeta: string     // https://…/tarjeta/<token>
  logoUrl: string        // https://…/logo.jpg (público)
}

export interface GoogleCfg { issuerId: string; saEmail: string; saKeyPem: string }

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const u8 = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b)
  let s = ''
  for (const c of u8) s += String.fromCharCode(c)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const pemToDer = (pem: string) => {
  const body = pem.replace(/\\n/g, '\n').replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
}

export async function googleSaveUrl(cfg: GoogleCfg, d: PaseDatos, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const classId = `${cfg.issuerId}.restaurantos_fidelidad`
  const objectId = `${cfg.issuerId}.${d.token.slice(0, 32)}`
  const texto = (language: string, value: string) => ({ defaultValue: { language, value } })

  const claims = {
    iss: cfg.saEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: nowSec,
    origins: [new URL(d.urlTarjeta).origin],
    payload: {
      loyaltyClasses: [{
        id: classId,
        issuerName: 'RestaurantOS',
        programName: 'Tarjeta de fidelidad',
        programLogo: { sourceUri: { uri: d.logoUrl }, contentDescription: texto('es', 'RestaurantOS') },
        hexBackgroundColor: '#FF5A00',
        reviewStatus: 'UNDER_REVIEW',
      }],
      loyaltyObjects: [{
        id: objectId,
        classId,
        state: 'ACTIVE',
        accountName: d.nombre,
        accountId: d.token.slice(0, 16),
        barcode: { type: 'QR_CODE', value: d.urlTarjeta },
        textModulesData: [
          { id: 'restaurante', header: 'Restaurante', body: d.restaurante },
          { id: 'nivel', header: 'Nivel', body: d.nivel ?? 'Miembro' },
        ],
        linksModuleData: { uris: [{ id: 'puntos', uri: d.urlTarjeta, description: 'Ver mis puntos' }] },
      }],
    },
  }

  const signing = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(cfg.saKeyPem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signing))
  return `https://pay.google.com/gp/v/save/${signing}.${b64url(sig)}`
}
