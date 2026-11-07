/**
 * Landing.tsx — Web de presentación de RestaurantOS
 * ───────────────────────────────────────────────────────────────
 * Tokens --w-* (Guía Maestra v2): tarjetas blancas, botón naranja, Inter.
 * Réplica de la lámina oscura: barra flotante, hero con mockup CSS, pestañas, funciones y módulos.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../contexts/ThemeContext'
import { ScrollReveal, ScrollRevealList, ScrollRevealItem } from '../components/ScrollReveal'
import { PLANS, type PlanTexto } from '../config/plans'
import { usePlanes, type PlanDB } from '../config/usePlanes'
import { TESTIMONIALS, FAQS } from '../config/content'
import { supabase } from '../services/supabaseClient'
import SupportChat from '../components/SupportChat'

const go = (path: string) => { window.location.href = path }

// Estilos base con tokens --w-*
const card: CSSProperties = {
  background: 'var(--w-surface)', border: '1px solid var(--w-border)',
  borderRadius: 'var(--w-r-lg)', boxShadow: 'var(--w-shadow-sm)',
}
const accentBtn: CSSProperties = {
  background: 'var(--w-accent)', color: 'var(--w-on-accent)', border: 'none',
  borderRadius: 'var(--w-r-md)', minHeight: 'var(--w-tap)', cursor: 'pointer',
  fontFamily: 'var(--w-font)', fontWeight: 600,
}
const outlineBtn: CSSProperties = {
  background: 'var(--w-surface)', color: 'var(--w-text)', border: '1px solid var(--w-border-strong)',
  borderRadius: 'var(--w-r-md)', minHeight: 'var(--w-tap)', cursor: 'pointer',
  fontFamily: 'var(--w-font)', fontWeight: 600,
}
const SEC_PAD = 'clamp(3rem, 8vw, 6rem) 1.5rem'
const h2Style: CSSProperties = {
  textAlign: 'center', fontSize: 'clamp(1.75rem, 4.5vw, 2.5rem)', fontWeight: 700,
  lineHeight: 1.15, letterSpacing: '-0.02em', margin: '0 0 clamp(2rem, 5vw, 3.5rem)',
}
const textBtn: CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', minHeight: 'var(--w-tap)',
  padding: '0 0.75rem', fontFamily: 'var(--w-font)', fontWeight: 600, fontSize: 'var(--w-fs-body)',
}

/* Íconos de línea (24x24, trazo 1.75) */
const Ico = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
)
const ICONS = {
  qr:      <Ico><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></Ico>,
  mesas:   <Ico><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></Ico>,
  stock:   <Ico><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></Ico>,
  cocina:  <Ico><path d="M6 14a4 4 0 010-8 5 5 0 019.6-1A4.5 4.5 0 0118 14"/><path d="M6 14v6h12v-6M9 17h6"/></Ico>,
  caja:    <Ico><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v.01M18 14v.01"/></Ico>,
  metricas:<Ico><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></Ico>,
}

const kicker: CSSProperties = {
  fontWeight: 700, fontSize: 'var(--w-fs-caption)', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--w-accent-text)',
}

// Entra a la cuenta demo (datos de ejemplo, aislada por restaurante)
const enterDemo = async () => {
  const { error } = await supabase.auth.signInWithPassword({ email: 'demo@demo.com', password: 'CuentaDemo_1' })
  if (error) window.alert('No pudimos abrir la demo en este momento. Intenta de nuevo en unos minutos o pídela por WhatsApp.')
  // onAuthStateChange en App detecta la sesión y renderiza el Dashboard
}

/* ── Ícono de check ── */
const Check = ({ color = 'var(--w-accent-text)' }: { color?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}
    style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }}>
    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* ═══════════════════ HERO ═══════════════════ */
const CHECKS = ['Ventas en tiempo real', 'Control de inventario', 'Gestión de mesas', 'Reportes inteligentes']

// Mockup de ejemplo hecho con HTML/CSS (no es una captura real ni datos reales)
function DashboardMock() {
  const side = ['Dashboard', 'Ventas', 'Pedidos', 'Mesas', 'Cocina', 'Inventario', 'Reportes']
  return (
    <div className="lp-mock" aria-hidden>
      <div className="lp-mock-side">
        {side.map((t, i) => <div key={t} className={i === 0 ? 'on' : ''}>{t}</div>)}
      </div>
      <div className="lp-mock-main">
        <div className="lp-mock-row">
          <div className="lp-mock-card"><small>Ventas hoy</small><b>$ 0.000.000</b></div>
          <div className="lp-mock-card"><small>Pedidos</small><b>00</b></div>
        </div>
        <div className="lp-mock-card" style={{ flex: 1 }}>
          <small>Evolución de ventas</small>
          <svg viewBox="0 0 200 60" preserveAspectRatio="none" style={{ width: '100%', height: 70 }}>
            <polyline points="0,50 30,38 60,44 90,26 120,32 150,14 200,6" fill="none" stroke="var(--w-accent)" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="lp-mock-note">Vista de ejemplo</div>
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="lp-hero">
      <div className="lp-hero-copy">
        <span className="lp-badge">✦ Sistema integral para restaurantes</span>
        <h1 className="lp-h1">Todo tu restaurante,<br /><span style={{ color: 'var(--w-accent-text)' }}>conectado</span></h1>
        <p className="lp-lead">Gestiona, controla y haz crecer tu negocio con una sola plataforma.</p>
        <ul className="lp-checks">
          {CHECKS.map(c => <li key={c}><Check />{c}</li>)}
        </ul>
        <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' }}>
          <button onClick={() => go('/registro')} style={{ ...accentBtn, minHeight: 52, padding: '0 1.75rem', fontSize: '1rem', boxShadow: 'var(--w-shadow-terra)' }}>
            Comenzar ahora →
          </button>
          <button onClick={enterDemo} className="lp-glass"
            style={{ ...outlineBtn, background: 'var(--w-glass-bg)', minHeight: 52, padding: '0 1.5rem', fontSize: '1rem' }}>
            ▶ Ver demo
          </button>
        </div>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <DashboardMock />
      </div>
    </section>
  )
}

/* Barra de pestañas (anclas a las secciones) */
const TABS = [
  { l: 'Características', h: '#caracteristicas' }, { l: 'Módulos', h: '#modulos' },
  { l: 'Planes y precios', h: '#planes' }, { l: 'Testimonios', h: '#testimonios' },
  { l: 'Soporte', h: '#faq' },
]
function TabBar() {
  return (
    <nav className="lp-tabs lp-glass" aria-label="Secciones">
      {TABS.map((t, i) => <a key={t.h} href={t.h} className={i === 0 ? 'on' : ''}>{t.l}</a>)}
    </nav>
  )
}

/* ═══════════════════ MÓDULOS ═══════════════════ */
const MODULOS = [
  { t: 'Dashboard', i: ICONS.metricas }, { t: 'Ventas', i: ICONS.caja }, { t: 'Pedidos', i: ICONS.qr },
  { t: 'Mesas', i: ICONS.mesas }, { t: 'Cocina', i: ICONS.cocina }, { t: 'Caja', i: ICONS.caja },
  { t: 'Inventario', i: ICONS.stock },
]
function Modulos() {
  return (
    <section id="modulos" className="lp-sec lp-modulos">
      <div>
        <span className="lp-badge">Todo en un solo lugar</span>
        <h2 style={{ ...h2Style, textAlign: 'left', margin: '0.75rem 0 0.5rem' }}>Módulos diseñados para ti</h2>
        <p style={{ color: 'var(--w-text-2)', margin: 0, lineHeight: 1.55 }}>Gestiona cada área de tu restaurante con la máxima eficiencia.</p>
      </div>
      <div className="lp-mods">
        {MODULOS.map((m, i) => (
          <div key={m.t} className={'lp-mod' + (i === 0 ? ' on' : '')}>{m.i}<span>{m.t}</span></div>
        ))}
        <button className="lp-mod" onClick={() => go('/registro')}><span>Ver más →</span></button>
      </div>
    </section>
  )
}

/* ═══════════════════ FUNCIONES ═══════════════════ */
const FEATURES = [
  { icon: ICONS.qr, t: 'Menú digital + QR', d: 'Tus clientes ven el menú y piden desde su celular.' },
  { icon: ICONS.mesas, t: 'Pedidos y mesas', d: 'Controla cada mesa y cada pedido en tiempo real.' },
  { icon: ICONS.stock, t: 'Inventario y recetas', d: 'Descuenta ingredientes automáticamente con cada venta.' },
  { icon: ICONS.cocina, t: 'Panel de cocina', d: 'La cocina ve los pedidos al instante, sin papeles.' },
  { icon: ICONS.caja, t: 'Corte de caja en Excel', d: 'Cierra el día con un reporte profesional descargable.' },
  { icon: ICONS.metricas, t: 'Métricas de ventas', d: 'Sabe cuánto vendes, qué se vende más y cuándo.' },
]

function Features() {
  return (
    <section id="caracteristicas" className="lp-sec lp-feat">
      <div>
        <span className="lp-badge">¿Por qué elegir RestaurantOS?</span>
        <h2 style={{ ...h2Style, textAlign: 'left', margin: '0.75rem 0 1rem' }}>Una solución completa para tu restaurante</h2>
        <p style={{ color: 'var(--w-text-2)', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
          Pedidos, mesas, inventario, cocina y caja en un solo lugar, pensado para el día a día de tu negocio.
        </p>
        <button onClick={() => go('/registro')} style={{ ...accentBtn, padding: '0 1.5rem' }}>Descubrir todas las funciones →</button>
      </div>
      <div className="lp-feat-grid">
        {FEATURES.map(f => (
          <div key={f.t} className="lp-fcard">
            <div style={{ color: 'var(--w-accent-text)', marginBottom: '0.75rem' }}>{f.icon}</div>
            <h3 style={{ fontSize: 'var(--w-fs-body)', fontWeight: 700, margin: '0 0 0.375rem' }}>{f.t}</h3>
            <p style={{ fontSize: 'var(--w-fs-label)', color: 'var(--w-text-2)', lineHeight: 1.5, margin: 0 }}>{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ═══════════════════ PLANES ═══════════════════ */
const fmtCOP = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

function PlanCard({ plan, db }: { plan: PlanTexto; db: PlanDB | null }) {
  const accent = plan.featured ? 'var(--w-accent-text)' : 'var(--w-text)'

  return (
    <div style={{
      ...card, padding: '1.75rem', borderRadius: 'var(--w-r-lg)', height: '100%',
      display: 'flex', flexDirection: 'column',
      border: plan.featured ? '2px solid var(--w-accent)' : '1px solid var(--w-border)',
      position: 'relative',
    }}>
      {plan.featured && (
        <span style={{
          position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
          padding: '0.3rem 0.9rem', borderRadius: 'var(--w-r-pill)', fontSize: 'var(--w-fs-caption)',
          fontWeight: 700, fontFamily: 'var(--w-font)', letterSpacing: '0.04em',
          background: 'var(--w-accent)', color: 'var(--w-on-accent)',
        }}>
          MÁS POPULAR
        </span>
      )}

      <h3 style={{ fontSize: 'var(--w-fs-screen)', fontWeight: 700, margin: '0 0 0.25rem', color: accent }}>{db?.nombre ?? '…'}</h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--w-text-3)', margin: '0 0 1.25rem' }}>{plan.tagline}</p>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem 0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'clamp(2.25rem, 6vw, 2.75rem)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>{db ? fmtCOP(db.mensual.base_cop) : '…'}</span>
          <span style={{ fontSize: '0.9rem', color: 'var(--w-text-3)', whiteSpace: 'nowrap' }}>+ IVA / mes</span>
        </div>
        {db && (
          <p style={{ fontSize: '0.8rem', color: 'var(--w-text-3)', margin: '0.4rem 0 0' }}>
            {fmtCOP(db.mensual.total_cop)} al mes con IVA incluido. Plan anual: {fmtCOP(db.anual.total_cop)} (pagas 10,5 meses y usas 12).
            {db.sede_extra_cop ? ` Cada sede adicional: ${fmtCOP(db.sede_extra_cop)} al mes.` : ''}
          </p>
        )}
        {db && db.max_mesas && (
          <p style={{ fontSize: '0.8rem', color: 'var(--w-text-3)', margin: '0.25rem 0 0' }}>
            Hasta {db.max_mesas} mesas y {db.max_usuarios} usuarios.
          </p>
        )}
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.75rem', display: 'flex', flexDirection: 'column', gap: '0.7rem', flex: 1 }}>
        {plan.features.map(f => (
          <li key={f} style={{ display: 'flex', gap: '0.6rem', fontSize: '0.9rem', color: 'var(--w-text-2)', fontFamily: 'var(--w-font)', lineHeight: 1.4 }}>
            <Check color={plan.featured ? 'var(--w-accent-text)' : 'var(--w-success)'} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button onClick={() => go(`/registro?plan=${plan.id}`)} disabled={db ? !db.disponible : false}
        style={{ ...(plan.featured ? accentBtn : outlineBtn), width: '100%', padding: '0.95rem', fontSize: '0.9375rem', cursor: db && !db.disponible ? 'not-allowed' : 'pointer', opacity: db && !db.disponible ? 0.6 : 1 }}>
        {db && !db.disponible ? 'Próximamente' : 'Solicitar este plan'}
      </button>
    </div>
  )
}

function Plans() {
  const { planes } = usePlanes()
  return (
    <section id="planes" style={{ padding: SEC_PAD, maxWidth: 1150, margin: '0 auto', scrollMarginTop: '5rem' }}>
      <ScrollReveal>
        <p style={{ ...kicker, textAlign: 'center', marginBottom: '0.75rem' }}>Planes claros, sin sorpresas</p>
        <h2 style={h2Style}>
          Elige el plan de tu restaurante
        </h2>
        <p style={{ textAlign: 'center', fontSize: '1rem', color: 'var(--w-text-3)', margin: '-1.5rem auto clamp(2rem, 5vw, 3.5rem)', maxWidth: 520 }}>
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
    <section id="testimonios" style={{ padding: SEC_PAD, maxWidth: 1100, margin: '0 auto', scrollMarginTop: '5rem' }}>
      <ScrollReveal>
        <p style={{ ...kicker, textAlign: 'center', marginBottom: '0.75rem' }}>Lo que dicen los restaurantes</p>
        <h2 style={h2Style}>
          Historias que saben bien
        </h2>
      </ScrollReveal>
      <ScrollRevealList stagger={0.1} className="landing-features">
        {TESTIMONIALS.map(t => (
          <ScrollRevealItem key={t.name}>
            <div style={{ ...card, padding: '1.5rem', borderRadius: 'var(--w-r-lg)', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ color: 'var(--w-warning)', fontSize: '1.1rem', marginBottom: '0.875rem', letterSpacing: '0.1em' }}>★★★★★</div>
              <p style={{ fontSize: '1rem', color: 'var(--w-text)', lineHeight: 1.6, margin: '0 0 1.5rem', flex: 1 }}>
                «{t.quote}»
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--w-accent)', color: 'var(--w-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontFamily: 'var(--w-font)', fontSize: '1.1rem', flexShrink: 0 }}>{t.initial}</div>
                <div>
                  <p style={{ fontWeight: 700, color: 'var(--w-text)', fontSize: '0.9rem', margin: 0, fontFamily: 'var(--w-font)' }}>{t.name}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--w-text-3)', margin: 0, fontFamily: 'var(--w-font)' }}>{t.role}</p>
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
    <div style={{ ...card, borderRadius: 'var(--w-r-md)', overflow: 'hidden', marginBottom: '0.75rem' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.9rem 1.25rem', minHeight: 'var(--w-tap)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--w-font)' }}>
        <span style={{ fontWeight: 600, color: 'var(--w-text)', fontSize: '0.975rem' }}>{q}</span>
        <motion.span animate={{ rotate: open ? 45 : 0 }} style={{ color: 'var(--w-accent-text)', fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>+</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} style={{ overflow: 'hidden' }}>
            <p style={{ fontSize: '0.925rem', color: 'var(--w-text-3)', lineHeight: 1.6, margin: 0, padding: '0 1.35rem 1.25rem' }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Faqs() {
  return (
    <section id="faq" style={{ padding: SEC_PAD, maxWidth: 760, margin: '0 auto', scrollMarginTop: '5rem' }}>
      <ScrollReveal>
        <p style={{ ...kicker, textAlign: 'center', marginBottom: '0.75rem' }}>¿Dudas?</p>
        <h2 style={h2Style}>
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
    <section id="contacto" style={{ padding: '0 1.5rem clamp(3rem, 8vw, 6rem)', scrollMarginTop: '5rem' }}>
      <ScrollReveal y={32}>
        <div style={{
          ...card, maxWidth: 900, margin: '0 auto', padding: 'clamp(2.5rem, 6vw, 4.5rem) 2rem',
          borderRadius: 'var(--w-r-xl)', textAlign: 'center', boxShadow: 'var(--w-shadow-md)',
        }}>
          <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.75rem)', fontWeight: 700, margin: '0 0 1rem', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            Activa tu restaurante
          </h2>
          <p style={{ fontSize: '1.05rem', color: 'var(--w-text-2)', margin: '0 auto 2rem', maxWidth: 480 }}>
            Lo instalamos contigo y lo dejamos listo para tomar pedidos.
          </p>
          <button onClick={() => go('/registro')} style={{ ...accentBtn, minHeight: 52, padding: '0 2rem', fontSize: '1rem' }}>
            Solicitar acceso
          </button>
        </div>
      </ScrollReveal>
    </section>
  )
}

/* ═══════════════════ LANDING ═══════════════════ */
const NAV = [
  { l: 'Inicio', h: '#inicio' }, { l: 'Características', h: '#caracteristicas' }, { l: 'Precios', h: '#planes' },
  { l: 'Testimonios', h: '#testimonios' }, { l: 'Contacto', h: '#contacto' }, { l: 'Preguntas Frecuentes', h: '#faq' },
]

const LP_CSS = `
.lp-sec{max-width:1200px;margin:0 auto;padding:clamp(2.5rem,6vw,4rem) 1.25rem;scroll-margin-top:5rem}
.lp-glass{background:var(--w-glass-bg);border:1px solid var(--w-glass-border);box-shadow:0 0 0 1px var(--w-glass-ring);backdrop-filter:blur(var(--w-glass-blur)) saturate(var(--w-glass-saturate));-webkit-backdrop-filter:blur(var(--w-glass-blur)) saturate(var(--w-glass-saturate))}
.lp-top{position:sticky;top:0.75rem;z-index:50;margin:0.75rem auto 0;max-width:1200px;padding:0 0.75rem}
.lp-nav{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding:0.4rem 0.5rem 0.4rem 0.875rem;border-radius:var(--w-r-pill)}
.lp-links{display:none;align-items:center;gap:0.25rem}
.lp-links a{padding:0.5rem 0.85rem;border-radius:var(--w-r-pill);color:var(--w-text);text-decoration:none;font-size:var(--w-fs-label);font-weight:500;white-space:nowrap}
.lp-links a.on{background:var(--w-accent);color:var(--w-on-accent);font-weight:600}
.lp-menu{position:relative}
.lp-menu summary{list-style:none;cursor:pointer;min-height:var(--w-tap);min-width:var(--w-tap);display:flex;align-items:center;justify-content:center;font-size:1.25rem}
.lp-menu summary::-webkit-details-marker{display:none}
.lp-menu-p{position:absolute;right:0;top:calc(100% + 0.5rem);min-width:220px;padding:0.5rem;border-radius:var(--w-r-lg);display:flex;flex-direction:column}
.lp-menu-p a,.lp-menu-p button{padding:0.75rem;min-height:var(--w-tap);color:var(--w-text);text-decoration:none;background:none;border:none;text-align:left;font:inherit;font-size:var(--w-fs-body);cursor:pointer}
.lp-toggle{min-width:var(--w-tap);min-height:var(--w-tap);border-radius:var(--w-r-pill);background:transparent;border:none;cursor:pointer;color:var(--w-text);font-size:1.1rem}
.lp-badge{display:inline-flex;align-items:center;gap:0.5rem;padding:0.4rem 0.9rem;border-radius:var(--w-r-pill);font-size:var(--w-fs-label);font-weight:600;color:var(--w-accent-text);background:var(--w-accent-soft);border:1px solid color-mix(in srgb,var(--w-accent) 40%,transparent)}
.lp-hero{position:relative;padding:3rem 1.25rem;display:grid;grid-template-columns:1fr;gap:2rem;max-width:1200px;margin-inline:auto;align-items:center}
.lp-bg{position:absolute;inset:0 0 auto 0;height:900px;z-index:0;pointer-events:none;background:radial-gradient(60% 50% at 85% 20%,rgba(255,90,0,.28),transparent 70%),radial-gradient(45% 40% at 5% 95%,rgba(255,90,0,.20),transparent 70%),radial-gradient(40% 35% at 50% 0%,rgba(255,150,60,.10),transparent 70%)}
.lp-hero,.lp-tabs,.lp-sec{position:relative;z-index:1}
.lp-top{position:sticky;z-index:50}
.lp-h1{font-size:clamp(2.4rem,7vw,4.5rem);font-weight:800;line-height:1.02;letter-spacing:-0.035em;margin:1.25rem 0 1rem}
.lp-lead{font-size:clamp(1.05rem,2.4vw,1.35rem);color:var(--w-text-2);line-height:1.5;max-width:30rem;margin:0 0 1.5rem}
.lp-checks{list-style:none;padding:0;margin:0 0 1.75rem;display:grid;grid-template-columns:1fr 1fr;gap:0.6rem 1.25rem;max-width:32rem}
.lp-checks li{display:flex;gap:0.5rem;align-items:flex-start;font-size:var(--w-fs-label);color:var(--w-text-2)}
.lp-mock{display:flex;border-radius:var(--w-r-xl);overflow:hidden;background:var(--w-surface);border:1px solid var(--w-border-strong);box-shadow:var(--w-shadow-lg),0 0 80px rgba(255,90,0,.18);min-height:260px;font-size:11px}
.lp-mock-side{width:28%;padding:0.75rem 0.5rem;background:var(--w-surface-sunken);display:flex;flex-direction:column;gap:0.25rem;color:var(--w-text-3)}
.lp-mock-side div{padding:0.4rem 0.5rem;border-radius:var(--w-r-sm)}
.lp-mock-side .on{background:var(--w-accent);color:var(--w-on-accent);font-weight:600}
.lp-mock-main{flex:1;padding:0.75rem;display:flex;flex-direction:column;gap:0.5rem}
.lp-mock-row{display:flex;gap:0.5rem}
.lp-mock-card{flex:1;padding:0.6rem;border-radius:var(--w-r-md);background:var(--w-surface-raised);border:1px solid var(--w-border);display:flex;flex-direction:column;gap:0.25rem}
.lp-mock-card small{color:var(--w-text-3)}.lp-mock-card b{font-size:1.1rem}
.lp-mock-note{align-self:flex-end;color:var(--w-text-3);font-size:10px}
.lp-tabs{display:flex;gap:0.25rem;overflow-x:auto;max-width:1160px;margin:0 1.25rem;padding:0.4rem;border-radius:var(--w-r-pill)}
.lp-tabs a{flex:1 0 auto;text-align:center;padding:0.7rem 1.1rem;border-radius:var(--w-r-pill);color:var(--w-text);text-decoration:none;font-size:var(--w-fs-label);font-weight:500;white-space:nowrap}
.lp-tabs a.on{background:var(--w-accent);color:var(--w-on-accent);font-weight:600}
.lp-feat{display:grid;grid-template-columns:1fr;gap:2rem;align-items:center}
.lp-feat-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem}
.lp-fcard{padding:1.1rem;border-radius:var(--w-r-lg);background:var(--w-surface);border:1px solid var(--w-border);box-shadow:var(--w-shadow-sm)}
.lp-modulos{display:grid;grid-template-columns:1fr;gap:1.5rem;align-items:center}
.lp-mods{display:grid;grid-template-columns:repeat(4,1fr);gap:0.6rem}
.lp-mod{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.4rem;min-height:84px;padding:0.5rem;border-radius:var(--w-r-lg);background:var(--w-surface);border:1px solid var(--w-border);color:var(--w-text);font:inherit;font-size:var(--w-fs-label);font-weight:500;cursor:default}
button.lp-mod{cursor:pointer}
.lp-mod.on{background:var(--w-accent);color:var(--w-on-accent);border-color:var(--w-accent);font-weight:600;box-shadow:var(--w-shadow-terra)}
@media(max-width:470px){
 .lp-brand-name{display:none}
 .lp-cta{padding:0 0.8rem !important}
}
@media(min-width:1100px){
 .lp-links{display:flex}.lp-menu{display:none}
}
@media(min-width:900px){
 .lp-hero{grid-template-columns:1.1fr 1fr;padding-top:4rem}
 .lp-feat{grid-template-columns:1fr 1.6fr}.lp-feat-grid{grid-template-columns:repeat(3,1fr)}
 .lp-modulos{grid-template-columns:1fr 1.7fr}.lp-mods{grid-template-columns:repeat(8,1fr)}
 .lp-tabs{margin-inline:auto}
}
`

export default function Landing() {
  const { theme, setTheme } = useTheme()
  // La lámina es oscura: si el visitante nunca eligió tema, arrancamos en oscuro
  useEffect(() => {
    let guardado: string | null = null
    try { guardado = localStorage.getItem('ros_theme') } catch { /* sin acceso a localStorage */ }
    if (!guardado) void setTheme('dark')
  }, [setTheme])
  const alternar = () => void setTheme(theme === 'dark' ? 'light' : 'dark')

  return (
    <div id="inicio" style={{ background: 'var(--w-bg)', color: 'var(--w-text)', fontFamily: 'var(--w-font)', minHeight: '100vh', position: 'relative', overflowX: 'clip' }}>
      <style>{LP_CSS}</style>
      <div className="lp-bg" />

      {/* Barra superior flotante */}
      <header className="lp-top">
        <div className="lp-nav lp-glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <img src="/brand/logo-oficial.png" alt="RestaurantOS"
              style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0, borderRadius: 9 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span className="lp-brand-name" style={{ fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>RestaurantOS</span>
          </div>
          <nav className="lp-links" aria-label="Principal">
            {NAV.map((n, i) => <a key={n.h} href={n.h} className={i === 0 ? 'on' : ''}>{n.l}</a>)}
            <a href="/login" onClick={e => { e.preventDefault(); go('/login') }}>Iniciar sesión</a>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <button className="lp-toggle" onClick={alternar} aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}>
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <button className="lp-cta" onClick={() => go('/registro')} style={{ ...accentBtn, padding: '0 1.1rem', fontSize: 'var(--w-fs-label)', whiteSpace: 'nowrap', borderRadius: 'var(--w-r-pill)' }}>
              Comenzar ahora
            </button>
            <details className="lp-menu">
              <summary aria-label="Menú">☰</summary>
              <div className="lp-menu-p lp-glass">
                {NAV.map(n => <a key={n.h} href={n.h}>{n.l}</a>)}
                <button onClick={() => go('/login')}>Iniciar sesión</button>
              </div>
            </details>
          </div>
        </div>
      </header>

      <Hero />
      <TabBar />
      <Features />
      <Modulos />
      <Plans />
      <Testimonials />
      <Faqs />
      <ActivaCTA />

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--w-border)', padding: '2.5rem 1.5rem 2rem', background: 'var(--w-surface)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <img src="/brand/logo-oficial.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 9 }} />
            <span style={{ fontSize: 'var(--w-fs-title)', fontWeight: 700 }}>RestaurantOS</span>
          </div>
          <p style={{ fontSize: 'var(--w-fs-label)', color: 'var(--w-text-3)', margin: 0 }}>Hecho para restaurantes que crecen</p>
          <div style={{ display: 'flex', gap: '0.5rem 1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => go('/terminos')} style={{ ...textBtn, fontSize: 'var(--w-fs-label)', color: 'var(--w-text-2)', fontWeight: 500 }}>Términos y condiciones</button>
            <button onClick={() => go('/privacidad')} style={{ ...textBtn, fontSize: 'var(--w-fs-label)', color: 'var(--w-text-2)', fontWeight: 500 }}>Política de privacidad</button>
          </div>
          <p style={{ fontSize: 'var(--w-fs-caption)', color: 'var(--w-text-3)', margin: 0 }}>
            © {new Date().getFullYear()} RestaurantOS
          </p>
        </div>
      </footer>

      <SupportChat modo="landing" />
    </div>
  )
}
