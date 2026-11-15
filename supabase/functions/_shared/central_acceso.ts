// Puerta de acceso de las funciones de Central: solo el dueño (super_admin) con su código de 2 pasos (sesión aal2).
// Es la misma regla que central_autorizado() en la base de datos, repetida aquí porque estas funciones usan la llave de servicio.
import { leerAal } from '../central-agente/logica.ts'

type Cliente = { auth: { getUser: (jwt: string) => Promise<{ data: { user: { id: string } | null } }> }; from: (t: string) => any }

export type Acceso = { ok: true; userId: string } | { ok: false; status: number; codigo: 'sin_sesion' | 'sin_permiso' }

export async function exigirDueno(req: Request, admin: Cliente): Promise<Acceso> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401, codigo: 'sin_sesion' }
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user) return { ok: false, status: 401, codigo: 'sin_sesion' }
  const { data: perfil } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'super_admin' || leerAal(token) !== 'aal2') return { ok: false, status: 403, codigo: 'sin_permiso' }
  return { ok: true, userId: user.id }
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
