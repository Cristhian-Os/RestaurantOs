/**
 * AuthShell.tsx — marco compartido de Login, Signup y ResetPassword (lámina del Login).
 * Pantalla dividida: izquierda marca + funciones, derecha tarjeta de vidrio oscuro.
 * Siempre oscuro (como la lámina), con tokens --w-* solo para el naranja.
 * Fondo: degradados + resplandor en CSS (faltan las fotos de cocina, ver reporte).
 * Celular (<900px): una sola columna, solo la tarjeta con su logo.
 */
import type { ReactNode } from 'react'

const CSS = `
.au{min-height:100dvh;display:grid;grid-template-columns:1fr;font-family:var(--w-font);color:#F5F5F2;
  background:#0d0c0b;position:relative;overflow:hidden}
.au-left{display:none}
.au-right{display:flex;align-items:center;justify-content:center;padding:1.5rem 1rem;min-width:0}
.au-card{width:100%;max-width:460px;box-sizing:border-box;padding:clamp(1.25rem,5vw,2rem);border-radius:28px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.12);box-shadow:0 0 0 1px rgba(255,90,0,.25),0 0 48px rgba(255,90,0,.14),0 24px 60px rgba(0,0,0,.55);
  -webkit-backdrop-filter:blur(24px) saturate(140%);backdrop-filter:blur(24px) saturate(140%);text-align:center}
.au-logo{width:84px;height:84px;object-fit:contain;display:block;margin:0 auto .75rem;background:#fff;border-radius:20px;padding:6px;box-sizing:border-box}
.au-title{font-size:1.75rem;font-weight:700;letter-spacing:-.02em;margin:0;color:#fff}
.au-sub{font-size:.9375rem;color:#BDBDB7;margin:.375rem 0 1.5rem;overflow-wrap:anywhere}
.au-form{display:flex;flex-direction:column;gap:.875rem;text-align:left}
.au-field{display:flex;align-items:center;gap:.75rem;min-height:54px;padding:0 1rem;border-radius:16px;
  background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.14);color:#BDBDB7}
.au-field:focus-within{border-color:var(--w-accent);box-shadow:0 0 0 3px rgba(255,90,0,.25)}
.au-field svg{width:20px;height:20px;flex:none}
.au-field input{flex:1;min-width:0;background:none;border:none;outline:none;color:#F5F5F2;font:inherit;font-size:1rem;height:52px}
.au-field input::placeholder{color:#92928C}
.au-eye{background:none;border:none;color:#BDBDB7;cursor:pointer;display:flex;padding:8px;margin:-8px;min-width:44px;min-height:44px;align-items:center;justify-content:center}
.au-btn{display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;min-height:54px;border:none;border-radius:999px;cursor:pointer;
  font:inherit;font-size:1rem;font-weight:700;color:#fff;text-decoration:none;box-sizing:border-box;
  background:var(--w-accent);box-shadow:0 6px 22px rgba(255,90,0,.40)}
.au-btn:hover{background:var(--w-accent-hover)}
.au-btn:disabled{opacity:.7;cursor:wait}
.au-link{background:none;border:none;padding:0;cursor:pointer;font:inherit;font-size:.875rem;font-weight:600;color:#FF8A47;min-height:44px;display:inline-flex;align-items:center;text-decoration:none}
.au-link.mute{color:#BDBDB7}
.au-row{display:flex;justify-content:flex-end}
.au-err{background:rgba(217,45,32,.18);border:1px solid #FF6B5E;color:#FFB4AC;font-size:.875rem;font-weight:500;padding:.75rem 1rem;border-radius:14px}
.au-foot{margin:1.25rem 0 0;font-size:.9375rem;color:#BDBDB7}
.au-ok{width:56px;height:56px;border-radius:50%;background:var(--w-success);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;color:#fff}
.au-ok svg{width:26px;height:26px}
.au-plan{display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap;padding:.75rem 1rem;border-radius:14px;
  background:rgba(255,90,0,.14);border:1px solid rgba(255,90,0,.35);margin-bottom:1rem;text-align:left;font-size:.875rem}
@media (min-width:900px){
  .au{grid-template-columns:1.1fr 1fr}
  .au-left{display:flex;flex-direction:column;justify-content:space-between;padding:3rem 2.5rem 1.75rem;gap:2rem}
  .au-hero{display:flex;flex-direction:column;align-items:center;text-align:center}
  .au-hero img{width:clamp(150px,17vw,210px);height:auto;border-radius:22%}
  .au-brand{font-size:clamp(2.5rem,4.2vw,3.5rem);font-weight:700;letter-spacing:-.03em;margin:.5rem 0 0;color:#fff}
  .au-brand b{color:var(--w-accent);font-weight:700}
  .au-lema{font-size:clamp(1.25rem,2vw,1.75rem);font-weight:600;line-height:1.25;margin:1rem 0 0;color:#fff}
  .au-lema span{display:block;color:#FF7426}
  .au-feats{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;max-width:640px;margin:0 auto;width:100%}
  .au-feat{display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1rem .5rem;border-radius:18px;text-align:center;
    background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
    font-size:.9rem;line-height:1.25;font-weight:500}
  .au-feat svg{width:30px;height:30px;color:var(--w-accent)}
  .au-garant{display:flex;flex-wrap:wrap;justify-content:center;gap:.75rem 1.5rem;font-size:.8125rem;color:#E0E0DB}
  .au-garant span{display:inline-flex;align-items:center;gap:.5rem}
  .au-garant svg{width:18px;height:18px;color:var(--w-accent)}
  .au-right{padding:2rem 2.5rem}
}
`

const ico = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24' } as const

const FEATS: { t: string; d: ReactNode }[] = [
  { t: 'Gestiona tus ventas', d: <path d="M4 20V13M10 20V8M16 20V11M22 20H2M20 20V4" /> },
  { t: 'Controla tu cocina', d: <path d="M3 18h18M5 18a7 7 0 0114 0M12 8V6M10 6h4" /> },
  { t: 'Administra tus mesas', d: <path d="M4 9h16M6 9v10M18 9v10M8 5h8M7 14h10" /> },
  { t: 'Gestiona tu inventario', d: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5" /> },
]

const GARANT: { t: string; d: ReactNode }[] = [
  { t: 'Seguro y confiable', d: <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3zM9 12l2 2 4-4" /> },
  { t: 'Acceso rápido', d: <path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" /> },
  { t: 'Soporte 24/7', d: <path d="M4 14v-2a8 8 0 0116 0v2M4 14h3v5H4zM17 14h3v5h-3zM17 19c0 1.5-2 2-5 2" /> },
  { t: 'Disponible en todos tus dispositivos', d: <path d="M7 18a4 4 0 010-8 5 5 0 019.6-1A4.5 4.5 0 0117 18H7z" /> },
]

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="au">
      <style>{CSS}</style>
      <section className="au-left" aria-hidden="false">
        <div className="au-hero">
          <img src="/brand/logo-oficial.png" alt="RestaurantOS" />
          <p className="au-brand">Restaurant<b>OS</b></p>
          <p className="au-lema">Toda tu operación,<span>un solo sistema</span></p>
        </div>
        <div className="au-feats">
          {FEATS.map(f => (
            <div key={f.t} className="au-feat">
              <svg {...ico} aria-hidden="true">{f.d}</svg>
              {f.t}
            </div>
          ))}
        </div>
        <div className="au-garant">
          {GARANT.map(g => (
            <span key={g.t}><svg {...ico} aria-hidden="true">{g.d}</svg>{g.t}</span>
          ))}
        </div>
      </section>
      <main className="au-right">{children}</main>
    </div>
  )
}

export const IconMail = () => <svg {...ico} aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
export const IconLock = () => <svg {...ico} aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
export const IconEye = ({ off }: { off: boolean }) => (
  <svg {...ico} width={20} height={20} aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
)
