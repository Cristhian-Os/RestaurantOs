/**
 * Landing.tsx — Web de presentación de RestaurantOS
 * ───────────────────────────────────────────────────────────────
 * "Warm Editorial + Liquid Glass". Muy interactiva: parallax en el
 * hero (useScroll), reveals al hacer scroll (ScrollReveal) y un
 * selector de mesas en el plan Emprende.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useScroll, useTransform, useReducedMotion, AnimatePresence } from 'framer-motion'
import { ScrollReveal, ScrollRevealList, ScrollRevealItem } from '../components/ScrollReveal'
import { PLANS, type PlanTexto } from '../config/plans'
import { usePlanes, type PlanDB } from '../config/usePlanes'
import { TESTIMONIALS, FAQS } from '../config/content'
import { supabase } from '../services/supabaseClient'
import SupportChat from '../components/SupportChat'

const go = (path: string) => { window.location.href = path }

// Entra a la cuenta demo (datos de ejemplo, aislada por restaurante)
const enterDemo = async () => {
  await supabase.auth.signInWithPassword({ email: 'demo@demo.com', password: 'demo1234' })
  // onAuthStateChange en App detecta la sesión y renderiza el Dashboard
}

/* ── Ícono de check ── */
const Check = ({ color = 'var(--w-terra)' }: { color?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}
    style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }}>
    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* ═══════════════════ HERO con parallax ═══════════════════ */
function Hero() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })
  const yBlob1  = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 180])
  const yBlob2  = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -140])
  const yText   = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 90])
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, reduce ? 1 : 0])

  return (
    <section ref={ref} className="landing-hero">
      {/* Blobs decorativos con parallax (el contenedor los desvanece abajo para evitar un corte duro) */}
      <div className="landing-hero-bg" aria-hidden="true">
      <motion.div style={{
        position: 'absolute', top: '-8%', left: '-10%', width: 'min(420px, 90vw)', height: 'min(420px, 90vw)',
        borderRadius: '50%', y: yBlob1, filter: 'blur(70px)', zIndex: 0,
        background: 'radial-gradient(circle, color-mix(in oklch, var(--w-terra) 40%, transparent), transparent 70%)',
      }} />
      <motion.div style={{
        position: 'absolute', bottom: '-12%', right: '-8%', width: 'min(480px, 100vw)', height: 'min(480px, 100vw)',
        borderRadius: '50%', y: yBlob2, filter: 'blur(80px)', zIndex: 0,
        background: 'radial-gradient(circle, color-mix(in oklch, var(--w-saffron) 45%, transparent), transparent 70%)',
      }} />
      </div>

      <motion.div className="landing-hero-inner" style={{ y: yText, opacity }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <span className="lg landing-badge">
            ✦ Instalación acompañada — activamos tu restaurante
          </span>
        </motion.div>

        <motion.h1 className="ed-display landing-hero-title"
          initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}>
          El sistema que tu<br className="landing-br" /> restaurante merece
        </motion.h1>

        <motion.p className="ed-body landing-hero-sub"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}>
          Pedidos, mesas, inventario, cocina y caja en un solo lugar.
          Moderno, rápido y hecho para el día a día de tu negocio.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.28 }}
          className="landing-cta-row">
          <button onClick={() => go('/registro')} className="lg-accent w-press"
            style={{ padding: '1rem 1.75rem', border: 'none', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
            Solicitar acceso
          </button>
          <button onClick={enterDemo} className="lg w-press"
            style={{ padding: '1rem 1.75rem', border: 'none', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', color: 'var(--w-ink)', background: 'transparent' }}>
            Ver demo
          </button>
        </motion.div>
      </motion.div>
    </section>
  )
}

/* ═══════════════════ CÓMO FUNCIONA ═══════════════════ */
const STEPS = [
  { n: '01', t: 'Regístrate', d: 'Crea tu restaurante en menos de un minuto. Te damos tu propio dominio y menú.' },
  { n: '02', t: 'Configura tu menú', d: 'Sube tus platos, precios y arma tu carta. Genera el QR para tus mesas.' },
  { n: '03', t: 'Empieza a vender', d: 'Recibe pedidos, controla la cocina y haz tu corte de caja en Excel.' },
]

function HowItWorks() {
  return (
    <section className="landing-section">
      <ScrollReveal>
        <p className="ed-kicker" style={{ textAlign: 'center', color: 'var(--w-terra)', marginBottom: '0.75rem' }}>Simple de verdad</p>
        <h2 className="ed-display" style={{ textAlign: 'center', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 600, margin: '0 0 3.5rem' }}>
          En 3 pasos estás vendiendo
        </h2>
      </ScrollReveal>
      <ScrollRevealList stagger={0.12} className="landing-steps">
        {STEPS.map(s => (
          <ScrollRevealItem key={s.n}>
            <div className="lg" style={{ padding: 'clamp(1.25rem, 4vw, 2rem)', borderRadius: '1.5rem', height: '100%' }}>
              <div className="ed-display" style={{ fontSize: '2.75rem', color: 'var(--w-terra)', fontWeight: 600, lineHeight: 1, marginBottom: '1rem' }}>{s.n}</div>
              <h3 className="ed-display" style={{ fontSize: '1.375rem', fontWeight: 600, margin: '0 0 0.5rem' }}>{s.t}</h3>
              <p className="ed-body" style={{ fontSize: '0.9375rem', color: 'var(--w-ink-mut)', lineHeight: 1.6, margin: 0 }}>{s.d}</p>
            </div>
          </ScrollRevealItem>
        ))}
      </ScrollRevealList>
    </section>
  )
}

/* ═══════════════════ FUNCIONES ═══════════════════ */
const FEATURES = [
  { icon: '🍽️', t: 'Menú digital + QR', d: 'Tus clientes ven el menú y piden desde su celular.' },
  { icon: '📋', t: 'Pedidos y mesas', d: 'Controla cada mesa y cada pedido en tiempo real.' },
  { icon: '📦', t: 'Inventario y recetas', d: 'Descuenta ingredientes automáticamente con cada venta.' },
  { icon: '👨‍🍳', t: 'Panel de cocina', d: 'La cocina ve los pedidos al instante, sin papeles.' },
  { icon: '💵', t: 'Corte de caja en Excel', d: 'Cierra el día con un reporte profesional descargable.' },
  { icon: '📊', t: 'Métricas de ventas', d: 'Sabe cuánto vendes, qué se vende más y cuándo.' },
]

function Features() {
  return (
    <section style={{ background: 'color-mix(in oklch, var(--w-terra) 5%, var(--w-bg))' }}>
      <div className="landing-section">
        <ScrollReveal>
          <p className="ed-kicker" style={{ textAlign: 'center', color: 'var(--w-terra)', marginBottom: '0.75rem' }}>Todo lo que necesitas</p>
          <h2 className="ed-display" style={{ textAlign: 'center', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 600, margin: '0 0 3.5rem' }}>
            Una app, tu restaurante completo
          </h2>
        </ScrollReveal>
        <ScrollRevealList stagger={0.07} className="landing-features">
          {FEATURES.map(f => (
            <ScrollRevealItem key={f.t}>
              <div className="lg w-lift" style={{ padding: '1.75rem', borderRadius: '1.25rem', height: '100%' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.875rem' }}>{f.icon}</div>
                <h3 className="ed-display" style={{ fontSize: '1.1875rem', fontWeight: 600, margin: '0 0 0.375rem' }}>{f.t}</h3>
                <p className="ed-body" style={{ fontSize: '0.9rem', color: 'var(--w-ink-mut)', lineHeight: 1.55, margin: 0 }}>{f.d}</p>
              </div>
            </ScrollRevealItem>
          ))}
        </ScrollRevealList>
      </div>
    </section>
  )
}

/* ═══════════════════ PLANES ═══════════════════ */
const fmtCOP = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

function PlanCard({ plan, db }: { plan: PlanTexto; db: PlanDB | null }) {
  const accent = plan.featured ? 'var(--w-terra)' : 'var(--w-ink)'

  return (
    <div className="lg" style={{
      padding: 'clamp(1.5rem, 4vw, 2rem)', borderRadius: '1.75rem', height: '100%',
      display: 'flex', flexDirection: 'column', overflow: 'visible',
      border: plan.featured ? '2px solid var(--w-terra)' : '1px solid var(--w-line)',
      position: 'relative',
    }}>
      {plan.featured && (
        <span className="lg-accent" style={{
          position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
          padding: '0.3rem 0.9rem', borderRadius: '2rem', fontSize: '0.72rem',
          fontWeight: 700, fontFamily: 'var(--w-sans)', letterSpacing: '0.04em',
        }}>
          MÁS POPULAR
        </span>
      )}

      <h3 className="ed-display" style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 0.25rem', color: accent }}>{db?.nombre ?? '…'}</h3>
      <p className="ed-body" style={{ fontSize: '0.875rem', color: 'var(--w-ink-mut)', margin: '0 0 1.25rem' }}>{plan.tagline}</p>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem 0.5rem', flexWrap: 'wrap' }}>
          <span className="ed-display" style={{ fontSize: 'clamp(2.25rem, 8vw, 3rem)', fontWeight: 600, lineHeight: 1 }}>{db ? fmtCOP(db.mensual.base_cop) : '…'}</span>
          <span className="ed-body" style={{ fontSize: '0.9rem', color: 'var(--w-ink-mut)', whiteSpace: 'nowrap' }}>+ IVA / mes</span>
        </div>
        {db && (
          <p className="ed-body" style={{ fontSize: '0.8rem', color: 'var(--w-ink-mut)', margin: '0.4rem 0 0' }}>
            {fmtCOP(db.mensual.total_cop)} al mes con IVA incluido. Plan anual: {fmtCOP(db.anual.total_cop)} (pagas 10,5 meses y usas 12).
            {db.sede_extra_cop ? ` Cada sede adicional: ${fmtCOP(db.sede_extra_cop)} al mes.` : ''}
          </p>
        )}
        {db && db.max_mesas && (
          <p className="ed-body" style={{ fontSize: '0.8rem', color: 'var(--w-ink-mut)', margin: '0.25rem 0 0' }}>
            Hasta {db.max_mesas} mesas y {db.max_usuarios} usuarios.
          </p>
        )}
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.75rem', display: 'flex', flexDirection: 'column', gap: '0.7rem', flex: 1 }}>
        {plan.features.map(f => (
          <li key={f} style={{ display: 'flex', gap: '0.6rem', fontSize: '0.9rem', color: 'var(--w-ink-soft)', fontFamily: 'var(--w-sans)', lineHeight: 1.4 }}>
            <Check color={plan.featured ? 'var(--w-terra)' : 'var(--w-olive)'} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button onClick={() => go(`/registro?plan=${plan.id}`)} disabled={db ? !db.disponible : false}
        className={plan.featured ? 'lg-accent w-press' : 'lg w-press'}
        style={{ width: '100%', padding: '0.95rem', border: plan.featured ? 'none' : '1px solid var(--w-line)', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.9375rem', cursor: db && !db.disponible ? 'not-allowed' : 'pointer', opacity: db && !db.disponible ? 0.6 : 1, color: plan.featured ? undefined : 'var(--w-ink)', background: plan.featured ? undefined : 'transparent' }}>
        {db && !db.disponible ? 'Próximamente' : 'Solicitar este plan'}
      </button>
    </div>
  )
}

function Plans() {
  const { planes } = usePlanes()
  return (
    <section id="planes" className="landing-section landing-section--wide">
      <ScrollReveal>
        <p className="ed-kicker" style={{ textAlign: 'center', color: 'var(--w-terra)', marginBottom: '0.75rem' }}>Planes claros, sin sorpresas</p>
        <h2 className="ed-display" style={{ textAlign: 'center', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 600, margin: '0 0 0.75rem' }}>
          Elige el plan de tu restaurante
        </h2>
        <p className="ed-body" style={{ textAlign: 'center', fontSize: '1rem', color: 'var(--w-ink-mut)', margin: '0 auto 3.5rem', maxWidth: 520 }}>
          Elige tu plan y activamos tu restaurante. Cambia o cancela cuando quieras.
        </p>
      </ScrollReveal>
      <div className="landing-plans">
        {PLANS.map((p, i) => (
          <ScrollReveal key={p.id} delay={i * 0.1} y={32}>
            <PlanCard plan={p} db={planes?.find(x => x.id === p.id) ?? null} />
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}

/* ═══════════════════ RESEÑAS ═══════════════════ */
function Testimonials() {
  return (
    <section className="landing-section">
      <ScrollReveal>
        <p className="ed-kicker" style={{ textAlign: 'center', color: 'var(--w-terra)', marginBottom: '0.75rem' }}>Lo que dicen los restaurantes</p>
        <h2 className="ed-display" style={{ textAlign: 'center', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 600, margin: '0 0 3.5rem' }}>
          Historias que saben bien
        </h2>
      </ScrollReveal>
      <ScrollRevealList stagger={0.1} className="landing-features landing-testimonials">
        {TESTIMONIALS.map(t => (
          <ScrollRevealItem key={t.name}>
            <div className="lg" style={{ padding: 'clamp(1.25rem, 4vw, 2rem)', borderRadius: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ color: 'var(--w-saffron)', fontSize: '1.1rem', marginBottom: '0.875rem', letterSpacing: '0.1em' }}>★★★★★</div>
              <p className="ed-body" style={{ fontSize: '1rem', color: 'var(--w-ink)', lineHeight: 1.6, margin: '0 0 1.5rem', flex: 1, fontStyle: 'italic' }}>
                «{t.quote}»
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--w-terra)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontFamily: 'var(--w-display)', fontSize: '1.1rem', flexShrink: 0 }}>{t.initial}</div>
                <div>
                  <p style={{ fontWeight: 700, color: 'var(--w-ink)', fontSize: '0.9rem', margin: 0, fontFamily: 'var(--w-sans)' }}>{t.name}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--w-ink-mut)', margin: 0, fontFamily: 'var(--w-sans)' }}>{t.role}</p>
                </div>
              </div>
            </div>
          </ScrollRevealItem>
        ))}
      </ScrollRevealList>
    </section>
  )
}

/* ═══════════════════ FAQ (acordeón) ═══════════════════ */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="lg" style={{ borderRadius: '1rem', overflow: 'hidden', marginBottom: '0.75rem' }}>
      <button onClick={() => setOpen(o => !o)} className="w-press"
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1.15rem 1.35rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--w-sans)' }}>
        <span style={{ fontWeight: 600, color: 'var(--w-ink)', fontSize: '0.975rem' }}>{q}</span>
        <motion.span animate={{ rotate: open ? 45 : 0 }} style={{ color: 'var(--w-terra)', fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>+</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} style={{ overflow: 'hidden' }}>
            <p className="ed-body" style={{ fontSize: '0.925rem', color: 'var(--w-ink-mut)', lineHeight: 1.6, margin: 0, padding: '0 1.35rem 1.25rem' }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Faqs() {
  return (
    <section className="landing-section landing-section--narrow">
      <ScrollReveal>
        <p className="ed-kicker" style={{ textAlign: 'center', color: 'var(--w-terra)', marginBottom: '0.75rem' }}>¿Dudas?</p>
        <h2 className="ed-display" style={{ textAlign: 'center', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 600, margin: '0 0 3rem' }}>
          Preguntas frecuentes
        </h2>
      </ScrollReveal>
      <ScrollReveal y={20}>
        <div>{FAQS.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}</div>
      </ScrollReveal>
    </section>
  )
}

/* ═══════════════════ CTA FINAL ═══════════════════ */
function ActivaCTA() {
  return (
    <section style={{ padding: '2rem 1.25rem 6rem' }}>
      <ScrollReveal y={32}>
        <div className="lg landing-cta-box" style={{
          padding: 'clamp(2.25rem, 6vw, 4.5rem) clamp(1.25rem, 4vw, 2rem)',
          borderRadius: '2rem', textAlign: 'center',
          background: 'linear-gradient(135deg, color-mix(in oklch, var(--w-terra) 12%, var(--w-surface)), color-mix(in oklch, var(--w-saffron) 12%, var(--w-surface)))',
        }}>
          <h2 className="ed-display" style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', fontWeight: 600, margin: '0 0 1rem', lineHeight: 1.05 }}>
            Activa tu restaurante
          </h2>
          <p className="ed-body" style={{ fontSize: '1.05rem', color: 'var(--w-ink-mut)', margin: '0 auto 2rem', maxWidth: 480 }}>
            Lo instalamos contigo y lo dejamos listo para tomar pedidos.
          </p>
          <button onClick={() => go('/registro')} className="lg-accent w-press"
            style={{ padding: '1.05rem 2.25rem', border: 'none', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer' }}>
            Solicitar acceso
          </button>
        </div>
      </ScrollReveal>
    </section>
  )
}

/* ═══════════════════ HEADER (escritorio + menú móvil) ═══════════════════ */
const navBtn: CSSProperties = {
  padding: '0.6rem 1rem', border: 'none',
  fontFamily: 'var(--w-sans)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
}
// Botones "fantasma" (texto); los de acento conservan el degradado de .lg-accent
const navGhost: CSSProperties = { ...navBtn, background: 'transparent' }

function Header() {
  const [open, setOpen] = useState(false)
  const close = (fn: () => void) => () => { setOpen(false); fn() }

  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <div className="landing-brand">
          <div className="landing-brand-logo">
            <img src="/logo.jpg" alt="RestaurantOS" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <span className="ed-display landing-brand-name">RestaurantOS</span>
        </div>

        {/* ≥768px: acciones en línea */}
        <nav className="landing-nav-desktop" aria-label="Principal">
          <button onClick={enterDemo} className="w-press" style={{ ...navGhost, color: 'var(--w-terra)' }}>Ver demo</button>
          <button onClick={() => go('/login')} className="w-press" style={{ ...navGhost, color: 'var(--w-ink)' }}>Iniciar sesión</button>
          <button onClick={() => go('/registro')} className="lg-accent w-press" style={{ ...navBtn, padding: '0.6rem 1.1rem', fontWeight: 700 }}>Solicitar acceso</button>
        </nav>

        {/* <768px: CTA compacto (≥480px) + botón de menú */}
        <div className="landing-nav-mobile">
          <button onClick={() => go('/registro')} className="lg-accent w-press landing-nav-cta"
            style={{ ...navBtn, padding: '0.65rem 1rem', fontWeight: 700, minHeight: 44, alignItems: 'center', whiteSpace: 'nowrap' }}>
            Solicitar acceso
          </button>
          <button type="button" className="landing-menu-btn w-press" aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open} aria-controls="landing-menu" onClick={() => setOpen(o => !o)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 22, height: 22 }} aria-hidden="true">
              {open
                ? <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div id="landing-menu" className="landing-menu">
          <button className="landing-menu-item landing-menu-item--accent" onClick={close(enterDemo)}>Ver demo</button>
          <button className="landing-menu-item" onClick={close(() => go('/login'))}>Iniciar sesión</button>
          <button className="lg-accent landing-menu-cta" onClick={close(() => go('/registro'))}>Solicitar acceso</button>
        </div>
      )}
    </header>
  )
}

/* ═══════════════════ LANDING ═══════════════════ */
export default function Landing() {
  // Escala tipográfica para PC/TV: solo mientras la landing está visible
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('landing-active')
    return () => root.classList.remove('landing-active')
  }, [])

  return (
    <div style={{ background: 'var(--w-bg)', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', minHeight: '100vh', overflowX: 'clip' }}>
      <Header />

      <Hero />
      <HowItWorks />
      <Features />
      <Plans />
      <Testimonials />
      <Faqs />
      <ActivaCTA />

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--w-line)', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
        <p className="ed-kicker" style={{ color: 'var(--w-ink-mut)', letterSpacing: '0.14em', margin: 0 }}>
          RestaurantOS · Hecho para restaurantes que crecen
        </p>
        <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center', flexWrap: 'wrap', margin: '1rem 0 0.5rem' }}>
          <button onClick={() => go('/terminos')} style={{ fontSize: '0.8rem', color: 'var(--w-ink-mut)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)' }}>Términos y condiciones</button>
          <button onClick={() => go('/privacidad')} style={{ fontSize: '0.8rem', color: 'var(--w-ink-mut)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)' }}>Política de privacidad</button>
        </div>
        <p className="ed-body" style={{ fontSize: '0.8rem', color: 'var(--w-ink-mut)', marginTop: '0.25rem' }}>
          © {new Date().getFullYear()} RestaurantOS
        </p>
      </footer>

      <SupportChat modo="landing" />
    </div>
  )
}
