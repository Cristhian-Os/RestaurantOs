/**
 * Signup.tsx — El registro público está cerrado.
 * ───────────────────────────────────────────────────────────────
 * Los restaurantes nuevos los crea el dueño de la plataforma después de que el cliente
 * paga (RPC `crear_restaurante`, solo super admin). Esta pantalla explica cómo pedir acceso.
 * Mismo lenguaje visual que Login (tokens --w-*).
 */
import { motion } from 'framer-motion'
import { PLANS, type PlanId } from '../config/plans'
import { usePlanes } from '../config/usePlanes'
import { CONTACTO_WHATSAPP } from '../config/content'
import { AuthShell } from './AuthShell'

const go = (path: string) => { window.location.href = path }

const REF_KEY = 'restaurantos_referido'
const ORIGENES_REDES = ['instagram', 'tiktok', 'facebook', 'whatsapp']

function leerReferido(): { codigo: string | null; origen: string | null } {
  const q = new URLSearchParams(window.location.search)
  const v = (q.get('v') ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24)
  const o = (q.get('o') ?? '').toLowerCase()
  try {
    if (v || ORIGENES_REDES.includes(o)) {
      localStorage.setItem(REF_KEY, JSON.stringify({ codigo: v || null, origen: ORIGENES_REDES.includes(o) ? o : null }))
    }
    const guardado = JSON.parse(localStorage.getItem(REF_KEY) ?? 'null') as { codigo: string | null; origen: string | null } | null
    if (guardado) return { codigo: guardado.codigo ?? null, origen: guardado.origen ?? null }
  } catch { /* sin almacenamiento: solo vale lo de este enlace */ }
  return { codigo: v || null, origen: ORIGENES_REDES.includes(o) ? o : null }
}

export default function Signup() {
  const planId = new URLSearchParams(window.location.search).get('plan') as PlanId | null
  const { planes } = usePlanes()
  const plan = PLANS.some(p => p.id === planId) ? planes?.find(p => p.id === planId) ?? null : null
  const digits = CONTACTO_WHATSAPP.replace(/\D/g, '')
  // Enlaces de seguimiento: ?v=CODIGO (vendedor/aliado) u ?o=instagram|tiktok|facebook|whatsapp. Se guardan al abrir la página
  // por si la persona escribe después, y van en el mensaje para que el dueño los vea al crear el restaurante.
  const { codigo, origen } = leerReferido()
  const referido = codigo ? ` Código: ${codigo}.` : origen ? ` Me enteré por ${origen}.` : ''
  const texto = encodeURIComponent(`Hola, quiero activar RestaurantOS en mi restaurante${plan ? ` (plan ${plan.nombre})` : ''}.${referido}`)

  return (
    <AuthShell>
      <motion.div className="au-card"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        <img className="au-logo" src="/brand/logo-oficial.png" alt="RestaurantOS" />
        <h1 className="au-title">Activa tu restaurante</h1>
        <p className="au-sub">El registro está cerrado: activamos cada restaurante con nuestro equipo.</p>

        {plan && (
          <div className="au-plan">
            <span style={{ fontWeight: 600, color: '#BDBDB7' }}>Plan elegido</span>
            <span style={{ fontWeight: 700, color: '#FF8A47' }}>{plan.nombre} · ${plan.mensual.total_cop.toLocaleString('es-CO')}/mes con IVA</span>
          </div>
        )}
        <p style={{ fontSize: '0.9375rem', lineHeight: 1.5, margin: '0 0 1.25rem', color: '#BDBDB7', textAlign: 'left' }}>
          Te acompañamos en la instalación: dejamos tu restaurante configurado (menú, mesas, cocina y equipo) y te entregamos tu usuario de administrador.
        </p>
        {digits ? (
          <a className="au-btn" href={`https://wa.me/${digits}?text=${texto}`} target="_blank" rel="noopener noreferrer">
            Escríbenos por WhatsApp
          </a>
        ) : (
          <p style={{ fontSize: '0.9375rem', color: '#BDBDB7', margin: 0 }}>Contáctanos para activar tu restaurante.</p>
        )}

        <p className="au-foot">
          ¿Ya tienes cuenta?{' '}
          <button className="au-link" onClick={() => go('/login')}>Inicia sesión</button>
        </p>
      </motion.div>
    </AuthShell>
  )
}
