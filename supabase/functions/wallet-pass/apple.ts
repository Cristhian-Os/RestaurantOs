// Apple Wallet: arma el archivo .pkpass (zip con pass.json + manifest.json + firma PKCS#7 desprendida).
// La firma usa el certificado "Pass Type ID" de la cuenta Apple Developer y el certificado intermedio WWDR.
// Sin esas credenciales la función no llega aquí (index.ts responde "no configurado").
import forge from 'node-forge'
import { zipSync } from 'fflate'
import type { PaseDatos } from './google.ts'

export interface AppleCfg { passTypeId: string; teamId: string; certPem: string; keyPem: string; wwdrPem: string }

// Íconos mínimos (cuadro naranja de la marca, 29 y 58 px). Apple exige icon.png dentro de todo pase.
const ICON_29 = 'iVBORw0KGgoAAAANSUhEUgAAAB0AAAAdCAIAAADZ8fBYAAAAJ0lEQVR4nGP4H8VAC0QTQ0fNHTV31NxRc0fNHTV31NxRc0fNJRsBAMpmbZ6Ej6RUAAAAAElFTkSuQmCC'
const ICON_58 = 'iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAIAAABu2d1/AAAAZUlEQVR4nO3OAQkAMAzAsOm8fx+7jHZQiIDMvjmEH9TV4Ad1NfhBXQ1+UFeDH9TV4Ad1NfhBXQ1+UFeDH9TV4Ad1NfhBXQ1+UFeDH9TV4Ad1NfhBXQ1+UFeDH9TV4Ad1NfhBXY0POku2hGsf8BoAAAAASUVORK5CYII='

const b64ToBytes = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0))
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const pem = (p: string) => p.replace(/\\n/g, '\n')
const bytesToBinary = (u8: Uint8Array) => { let s = ''; for (const c of u8) s += String.fromCharCode(c); return s }

function firmar(contenido: Uint8Array, cfg: AppleCfg): Uint8Array {
  const cert = forge.pki.certificateFromPem(pem(cfg.certPem))
  const wwdr = forge.pki.certificateFromPem(pem(cfg.wwdrPem))
  const key = forge.pki.privateKeyFromPem(pem(cfg.keyPem))
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(bytesToBinary(contenido))
  p7.addCertificate(cert)
  p7.addCertificate(wwdr)
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  })
  p7.sign({ detached: true })
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return Uint8Array.from(der, (c) => c.charCodeAt(0))
}

export async function applePkpass(cfg: AppleCfg, d: PaseDatos): Promise<Uint8Array> {
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeId,
    teamIdentifier: cfg.teamId,
    serialNumber: `fid-${d.token.slice(0, 24)}`,
    organizationName: d.restaurante,
    description: 'Tarjeta de fidelidad',
    logoText: d.restaurante,
    foregroundColor: 'rgb(255,255,255)',
    labelColor: 'rgb(255,255,255)',
    backgroundColor: 'rgb(255,90,0)',
    barcodes: [{ format: 'PKBarcodeFormatQR', message: d.urlTarjeta, messageEncoding: 'iso-8859-1' }],
    storeCard: {
      primaryFields: [{ key: 'nivel', label: 'NIVEL', value: d.nivel ?? 'Miembro' }],
      secondaryFields: [{ key: 'cliente', label: 'CLIENTE', value: d.nombre }],
      backFields: [{ key: 'puntos', label: 'Mis puntos', value: d.urlTarjeta, attributedValue: `<a href='${d.urlTarjeta}'>Ver mis puntos</a>` }],
    },
  }
  const enc = new TextEncoder()
  const archivos: Record<string, Uint8Array> = {
    'pass.json': enc.encode(JSON.stringify(pass)),
    'icon.png': b64ToBytes(ICON_29),
    'icon@2x.png': b64ToBytes(ICON_58),
  }
  const manifiesto: Record<string, string> = {}
  for (const [nombre, bytes] of Object.entries(archivos)) manifiesto[nombre] = hex(await crypto.subtle.digest('SHA-1', bytes))
  const manifiestoBytes = enc.encode(JSON.stringify(manifiesto))
  return zipSync({ ...archivos, 'manifest.json': manifiestoBytes, signature: firmar(manifiestoBytes, cfg) }, { level: 0 })
}
