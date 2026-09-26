/**
 * billing.ts — Configuración de pagos (Fase 3, Wompi · Colombia · COP)
 * ───────────────────────────────────────────────────────────────────────
 * Cobramos en PESOS COLOMBIANOS (COP). Wompi trabaja con "amount_in_cents"
 * (centavos): un peso son 100 centavos. Ej: $200.000 COP = 20.000.000 centavos.
 *
 * ⚠️ PRECIOS EN COP — CONFIRMAR CON EL DUEÑO. Los de abajo son un estimado
 * partiendo de los planes en USD ($50/$100/$170) a ~4.000 COP/USD. Ajústalos
 * al valor comercial real; la app y el cobro leen de aquí.
 */
import type { PlanId } from './plans'

/** Precio mensual de cada plan en PESOS colombianos (COP). */
export const PLAN_COP: Record<PlanId, number> = {
  emprende: 200_000,
  pro:      400_000,
  premium:  680_000,
}

/** Convierte pesos COP a centavos (lo que espera Wompi). */
export const copToCents = (cop: number): number => Math.round(cop * 100)

/** amount_in_cents por plan, listo para Wompi. */
export const planAmountInCents = (plan: PlanId): number => copToCents(PLAN_COP[plan])

/** Formatea un monto en COP para mostrar. Ej: 200000 → "$200.000". */
export function formatCOP(cop: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(cop)
}

/** Formatea centavos (de la BD) a COP legible. Ej: 20000000 → "$200.000". */
export function formatCentsCOP(cents: number): string {
  return formatCOP(Math.round(cents / 100))
}

/**
 * Abre el Checkout de Wompi (redirección web) con los parámetros firmados que
 * devuelve la Edge Function `wompi-init`. Es el método más simple y confiable:
 * lleva al usuario a la página segura de Wompi y vuelve a `redirectUrl`.
 */
export interface WompiCheckoutParams {
  publicKey:          string
  currency:           string
  amountInCents:      number
  reference:          string
  signatureIntegrity: string
  redirectUrl?:       string | null
  customerEmail?:     string | null
}

export function openWompiCheckout(p: WompiCheckoutParams): void {
  const q = new URLSearchParams({
    'public-key':          p.publicKey,
    currency:              p.currency,
    'amount-in-cents':     String(p.amountInCents),
    reference:             p.reference,
    'signature:integrity': p.signatureIntegrity,
  })
  if (p.redirectUrl)   q.set('redirect-url', p.redirectUrl)
  if (p.customerEmail) q.set('customer-data:email', p.customerEmail)
  // Sandbox y producción usan el mismo host de checkout; la llave define el entorno.
  window.location.href = `https://checkout.wompi.co/p/?${q.toString()}`
}

/** Estados posibles de una suscripción (reflejan la tabla subscriptions). */
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

/** ¿El restaurante puede usar la app? (trial y mora siguen con acceso). */
export function hasAccess(status: SubStatus | null | undefined): boolean {
  return status === 'trialing' || status === 'active' || status === 'past_due'
}
