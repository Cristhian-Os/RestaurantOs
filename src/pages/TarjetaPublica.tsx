/**
 * TarjetaPublica.tsx — /tarjeta/<código>
 * Lo que ve el cliente al escanear su QR: saldo, nivel y últimos movimientos.
 * No pide sesión. La base solo devuelve primer nombre y saldos (nunca teléfono ni gasto).
 */
import { useQuery } from '@tanstack/react-query'
import { Card } from '../components/ui/Card'
import { StatePanel } from '../components/ui/StatePanel'
import { fidelizacionService, getWalletEstado, walletUrl, MOV_TEXTO } from '../services/fidelizacionService'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

export default function TarjetaPublica() {
  const token = window.location.pathname.split('/').filter(Boolean)[1] ?? ''
  const { data, isLoading, isError } = useQuery({
    queryKey: ['tarjeta_publica', token],
    queryFn: () => fidelizacionService.getTarjetaPublica(token),
    retry: false,
  })

  const wallet = useQuery({ queryKey: ['wallet_estado'], queryFn: getWalletEstado, staleTime: 5 * 60_000 })
  const esApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
  // Cada celular ve su propia wallet: Apple en iPhone/Mac, Google en el resto.
  const tipoWallet = esApple ? (wallet.data?.apple ? 'apple' : null) : (wallet.data?.google ? 'google' : null)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-4 px-4 py-6" style={{ fontFamily: 'var(--w-font)', background: 'var(--w-bg)', color: 'var(--w-text)' }}>
      {isLoading && <StatePanel kind="loading" />}
      {(isError || (!isLoading && !data)) && (
        <StatePanel kind="empty" title="Tarjeta no disponible" text="El enlace no es válido o el programa de puntos está pausado." />
      )}
      {data && (
        <>
          <section
            className="flex flex-col gap-4 rounded-[var(--w-r-xl)] p-5"
            style={{ background: 'var(--w-accent)', color: 'var(--w-on-accent)', boxShadow: 'var(--w-shadow-md)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[length:var(--w-fs-label)] font-semibold opacity-90">{data.restaurante}</p>
                <p className="truncate font-bold text-[length:var(--w-fs-screen)]">Hola, {data.nombre}</p>
              </div>
              {data.nivel && <span className="shrink-0 rounded-[var(--w-r-pill)] bg-white/25 px-3 py-1 font-bold text-[length:var(--w-fs-label)]">{data.nivel}</span>}
            </div>
            <div className="flex gap-6">
              <div>
                <p className="font-bold leading-none text-[length:var(--w-fs-kpi)]">{data.puntos.toLocaleString('es-CO')}</p>
                <p className="text-[length:var(--w-fs-label)] opacity-90">puntos</p>
              </div>
              <div>
                <p className="font-bold leading-none text-[length:var(--w-fs-kpi)]">{data.sellos.toLocaleString('es-CO')}</p>
                <p className="text-[length:var(--w-fs-label)] opacity-90">sellos</p>
              </div>
            </div>
            {data.siguiente_nivel && data.puntos_para_siguiente != null && (
              <div className="flex flex-col gap-1.5">
                <div
                  role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, data.progreso_pct))}
                  aria-label={`Progreso hacia ${data.siguiente_nivel}`}
                  className="h-2 overflow-hidden rounded-full bg-white/30"
                >
                  <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(0, Math.min(100, data.progreso_pct))}%` }} />
                </div>
                <p className="text-[length:var(--w-fs-caption)] opacity-90">Te faltan {data.puntos_para_siguiente.toLocaleString('es-CO')} puntos para {data.siguiente_nivel}</p>
              </div>
            )}
          </section>

          {tipoWallet && (
            <a
              href={walletUrl(tipoWallet, token)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-[var(--w-r-md)] bg-black px-4 font-semibold text-white"
            >
              {tipoWallet === 'apple' ? 'Agregar a Apple Wallet' : 'Agregar a Google Wallet'}
            </a>
          )}

          {data.nivel_beneficios && (
            <Card>
              <p className="font-bold">Beneficios de tu nivel</p>
              <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{data.nivel_beneficios}</p>
            </Card>
          )}

          <Card className="flex flex-col gap-1">
            <p className="font-bold">Últimos movimientos</p>
            {data.movimientos.length === 0 && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Aún no tienes movimientos.</p>}
            {data.movimientos.map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-2 border-b border-[var(--w-border)] py-1.5 text-[length:var(--w-fs-label)] last:border-b-0">
                <span className="min-w-0 truncate text-[color:var(--w-text-2)]">{MOV_TEXTO[m.tipo]} · {fecha(m.fecha)}</span>
                <b className="shrink-0" style={{ color: m.cantidad > 0 ? 'var(--w-success-text)' : 'var(--w-danger-text)' }}>
                  {m.cantidad > 0 ? '+' : ''}{m.cantidad} {m.unidad}
                </b>
              </div>
            ))}
          </Card>
        </>
      )}
    </main>
  )
}
