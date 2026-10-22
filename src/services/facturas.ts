/**
 * facturas.ts — facturas de compra con foto (Anexo E).
 * Fotos en el bucket privado `facturas` (carpeta = id del restaurante), datos en `facturas_compra`.
 * Sin internet: la factura (fotos incluidas) queda en IndexedDB y se sube sola al volver la señal.
 * La subida es repetible: la ruta de cada foto sale del id de la factura y la función de la base
 * ignora un id ya guardado, así que un reintento nunca duplica.
 */
import { supabase } from './supabaseClient'

export interface Factura {
  id: string
  fecha: string
  proveedor_id: string | null
  monto: number
  nota: string | null
  fotos: string[]
  gasto_id: string | null
  registrado_por: string | null
  created_at: string
  proveedor_nombre: string | null
}

export interface NuevaFactura {
  id: string
  fecha: string
  proveedorId: string | null
  monto: number
  nota: string
  registrarGasto: boolean
  fotos: Blob[]
}

export interface FacturaPendiente extends NuevaFactura { restaurantId: string; error?: string }

export const MAX_FOTOS = 10
const MAX_LADO_PX = 1600
const MAX_BYTES = 5 * 1024 * 1024

/** Reduce la foto a 1600 px por el lado largo y la convierte a JPEG. */
export async function comprimirFoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Solo se aceptan imágenes (JPG, PNG o WebP).')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('No pude leer la foto. Prueba con otra en JPG o PNG.'))
      i.src = url
    })
    const ratio = Math.min(1, MAX_LADO_PX / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * ratio)
    canvas.height = Math.round(img.height * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No pude procesar la foto.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.82))
    if (!blob) throw new Error('No pude procesar la foto.')
    if (blob.size > MAX_BYTES) throw new Error('La foto sigue pesando más de 5 MB; toma una con menos detalle.')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

const rutaFoto = (rid: string, fecha: string, id: string, i: number) =>
  `${rid}/${fecha.slice(0, 4)}/${fecha.slice(5, 7)}/${id}-${i}.jpg`

/** Error de red (sin señal), distinto de un rechazo del servidor. */
function esErrorDeRed(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = String((e as { message?: string })?.message ?? e)
  return /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
}

async function subirYRegistrar(rid: string, n: NuevaFactura): Promise<void> {
  const rutas: string[] = []
  for (let i = 0; i < n.fotos.length; i++) {
    const ruta = rutaFoto(rid, n.fecha, n.id, i)
    const { error } = await supabase.storage.from('facturas').upload(ruta, n.fotos[i], { contentType: 'image/jpeg', upsert: false })
    // Si ya estaba (reintento), sirve igual.
    if (error && !/already exists|duplicate/i.test(error.message)) throw error
    rutas.push(ruta)
  }
  const { error } = await supabase.rpc('registrar_factura_compra', {
    p_id: n.id, p_fecha: n.fecha, p_proveedor_id: n.proveedorId, p_monto: n.monto,
    p_nota: n.nota.trim() || null, p_fotos: rutas, p_registrar_gasto: n.registrarGasto,
  })
  if (error) throw error
}

// ─── Cola local (IndexedDB) ──────────────────────────────────────────────────

const DB = 'facturas-pendientes'
const STORE = 'facturas'

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function conStore<T>(modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrirDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, modo)
    const req = f(tx.objectStore(STORE))
    tx.oncomplete = () => { db.close(); resolve(req.result) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export const pendientes = {
  listar: () => conStore<FacturaPendiente[]>('readonly', s => s.getAll()).catch(() => [] as FacturaPendiente[]),
  guardar: (p: FacturaPendiente) => conStore('readwrite', s => s.put(p)),
  quitar: (id: string) => conStore('readwrite', s => s.delete(id)),
}

/** Guarda la factura. Devuelve 'subida' o 'pendiente' (quedó en el dispositivo por falta de internet). */
export async function guardarFactura(rid: string, n: NuevaFactura): Promise<'subida' | 'pendiente'> {
  try {
    await subirYRegistrar(rid, n)
    return 'subida'
  } catch (e) {
    if (!esErrorDeRed(e)) throw e
    await pendientes.guardar({ ...n, restaurantId: rid })
    return 'pendiente'
  }
}

/** Sube las facturas guardadas en el dispositivo. Una rechazada por el servidor queda marcada con su error. */
export async function sincronizarPendientes(): Promise<{ subidas: number; fallidas: number }> {
  let subidas = 0
  let fallidas = 0
  for (const p of await pendientes.listar()) {
    try {
      await subirYRegistrar(p.restaurantId, p)
      await pendientes.quitar(p.id)
      subidas++
    } catch (e) {
      if (esErrorDeRed(e)) break
      fallidas++
      await pendientes.guardar({ ...p, error: (e as { message?: string }).message ?? 'Error desconocido' })
    }
  }
  return { subidas, fallidas }
}

// ─── Lectura y edición ───────────────────────────────────────────────────────

type Fila = Omit<Factura, 'proveedor_nombre'> & { proveedores: { nombre: string } | null }

export async function listarFacturas(desde: string, hasta: string): Promise<Factura[]> {
  const { data, error } = await supabase.from('facturas_compra')
    .select('id, fecha, proveedor_id, monto, nota, fotos, gasto_id, registrado_por, created_at, proveedores(nombre)')
    .gte('fecha', desde).lte('fecha', hasta)
    .order('fecha', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as Fila[]).map(({ proveedores, ...f }) => ({
    ...f, monto: Number(f.monto), proveedor_nombre: proveedores?.nombre ?? null,
  }))
}

/** Enlaces temporales (1 hora) a las fotos; la clave es la ruta. */
export async function enlacesFotos(rutas: string[]): Promise<Record<string, string>> {
  if (rutas.length === 0) return {}
  const { data, error } = await supabase.storage.from('facturas').createSignedUrls(rutas, 3600)
  if (error) throw new Error(error.message)
  const out: Record<string, string> = {}
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  return out
}

export async function nombresDeUsuarios(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids)
  const out: Record<string, string> = {}
  for (const p of data ?? []) if (p.full_name) out[p.id as string] = p.full_name as string
  return out
}

export async function editarFactura(f: { id: string; fecha: string; proveedorId: string | null; monto: number; nota: string }): Promise<void> {
  const { error } = await supabase.rpc('editar_factura_compra', {
    p_id: f.id, p_fecha: f.fecha, p_proveedor_id: f.proveedorId, p_monto: f.monto, p_nota: f.nota.trim() || null,
  })
  if (error) throw new Error(error.message)
}

/** Borra la factura y sus fotos. El gasto de caja, si lo hubo, se conserva (el dinero ya se gastó). */
export async function eliminarFactura(f: Factura): Promise<void> {
  const { data, error } = await supabase.from('facturas_compra').delete().eq('id', f.id).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('No se pudo eliminar (¿ya no existe o no tienes permiso?).')
  await supabase.storage.from('facturas').remove(f.fotos)
}

export async function crearProveedorRapido(nombre: string): Promise<{ id: string; nombre: string }> {
  const { data, error } = await supabase.from('proveedores').insert({ nombre: nombre.trim() }).select('id, nombre').single()
  if (error) throw new Error(error.message)
  return data as { id: string; nombre: string }
}

export async function exportarExcel(facturas: Factura[], nombres: Record<string, string>, desde: string, hasta: string): Promise<void> {
  const XLSX = await import('xlsx')
  const filas = facturas.map(f => ({
    Fecha: f.fecha,
    Proveedor: f.proveedor_nombre ?? '',
    Monto: f.monto,
    Nota: f.nota ?? '',
    'Subida por': (f.registrado_por && nombres[f.registrado_por]) || '',
    'Registrada como gasto': f.gasto_id ? 'Sí' : 'No',
    Fotos: f.fotos.length,
  }))
  filas.push({ Fecha: 'TOTAL', Proveedor: '', Monto: facturas.reduce((s, f) => s + f.monto, 0), Nota: '', 'Subida por': '', 'Registrada como gasto': '', Fotos: 0 })
  const ws = XLSX.utils.json_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Facturas')
  XLSX.writeFile(wb, `facturas_${desde}_a_${hasta}.xlsx`)
}
