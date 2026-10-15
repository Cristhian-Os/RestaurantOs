/**
 * Signup.tsx — El registro público está cerrado.
 * ───────────────────────────────────────────────────────────────
 * Los restaurantes nuevos los crea el dueño de la plataforma después de que el cliente
 * paga (RPC `crear_restaurante`, solo super admin). Esta pantalla explica cómo pedir acceso.
 * Mismo lenguaje visual que Login (Warm Editorial + Liquid Glass).
 */
import { motion } from 'framer-motion'
import { PLANS, type PlanId } from '../config/plans'
import { CONTACTO_WHATSAPP } from '../config/content'

const go = (path: string) => { window.location.href = path }

export default function Signup() {
  const planId = new URLSearchParams(window.location.search).get('plan') as PlanId | null
  const plan = PLANS.find(p => p.id === planId) ?? null
  const digits = CONTACTO_WHATSAPP.replace(/\D/g, '')
  const texto = encodeURIComponent(`Hola, quiero activar RestaurantOS en mi restaurante${plan ? ` (plan ${plan.name})` : ''}.`)

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--w-bg)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      fontFamily: 'var(--w-sans)',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: '100%', maxWidth: 440 }}>

        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <button onClick={() => go('/')} className="w-press"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--w-ink-mut)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '1rem' }}>
            ← Volver al inicio
          </button>
          <h1 className="ed-display" style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>Activa tu restaurante</h1>
          <p className="ed-body" style={{ fontSize: '0.9rem', color: 'var(--w-ink-mut)', marginTop: '0.5rem' }}>
            El registro está cerrado: activamos cada restaurante con nuestro equipo.
          </p>
        </div>

        <div className="lg" style={{ padding: '1.75rem', borderRadius: '1.5rem' }}>
          {plan && (
            <div style={{ padding: '0.75rem 1rem', borderRadius: '0.875rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'color-mix(in oklch, var(--w-terra) 8%, transparent)' }}>
              <span className="ed-kicker" style={{ fontSize: '0.72rem' }}>Plan elegido</span>
              <span style={{ fontWeight: 700, color: 'var(--w-terra)' }}>{plan.name} · {plan.currency}{plan.price}/mes</span>
            </div>
          )}
          <p className="ed-body" style={{ fontSize: '0.95rem', lineHeight: 1.5, margin: '0 0 1.25rem', color: 'var(--w-ink)' }}>
            Te acompañamos en la instalación: dejamos tu restaurante configurado (menú, mesas, cocina y equipo) y te entregamos tu usuario de administrador.
          </p>
          {digits ? (
            <a href={`https://wa.me/${digits}?text=${texto}`} target="_blank" rel="noopener noreferrer" className="lg-accent w-press"
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none', width: '100%', boxSizing: 'border-box', padding: '0.95rem', fontWeight: 700, fontSize: '0.9375rem' }}>
              Escríbenos por WhatsApp
            </a>
          ) : (
            <p className="ed-body" style={{ fontSize: '0.9rem', color: 'var(--w-ink-mut)', margin: 0, textAlign: 'center' }}>
              Contáctanos para activar tu restaurante.
            </p>
          )}
        </div>

        <p className="ed-body" style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--w-ink-mut)', marginTop: '1.25rem' }}>
          ¿Ya tienes cuenta?{' '}
          <button onClick={() => go('/login')} style={{ color: 'var(--w-terra)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--w-sans)' }}>
            Inicia sesión
          </button>
        </p>
      </motion.div>
    </div>
  )
}
