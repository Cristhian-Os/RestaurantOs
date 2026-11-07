/**
 * PlatformInicio.tsx — "qué necesita atención hoy" (Anexo C, sección 6, pantalla 1).
 * Tarjetas con los resultados de plataforma_atencion(); cada elemento abre la ficha del restaurante.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { FichaRestaurante, SEMAFORO } from './FichaRestaurante'

interface Item { id: string; nombre: string; [k: string]: unknown }
interface Atencion {
  pruebas_por_vencer: (Item & { vence: string })[]
  sin_pedidos_7d: (Item & { ultimo_pedido: string | null; estado: string })[]
  pagos_fallidos: (Item & { estado: string; gracia_hasta: string | null })[]
  acciones_de_hoy: (Item & { accion: string | null; fecha: string })[]
  codigos_a_revisar: (Item & { codigo: string | null; estado: string })[]
  liquidaciones_por_aprobar: { id: string; vendedor: string; total: number; periodo: string; vencida: boolean }[]
  contratos_por_vencer: { id: string; vendedor: string; vence: string }[]
  opiniones_urgentes?: { id: string; numero: number; restaurante: string; titulo: string; fecha: string }[]
  semaforo: { verde: number; amarillo: number; rojo: number; gris: number }
}

const fecha = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : 'nunca')

function Tarjeta({ titulo, vacio, items, detalle, onAbrir }: {
  titulo: string; vacio: string; items: Item[]; detalle: (i: Item) => string; onAbrir?: (id: string) => void
}) {
  return (
    <div style={{ borderRadius: 'var(--w-r-lg)', padding: '1rem 1.25rem', background: 'var(--w-surface)', border: '1px solid var(--w-border)', boxShadow: 'var(--w-shadow-sm)', alignSelf: 'start' }}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: 'var(--w-fs-title)', fontWeight: 700, color: 'var(--w-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {titulo} {items.length > 0 && <span style={{ background: 'var(--w-accent)', color: 'var(--w-on-accent)', borderRadius: 'var(--w-r-pill)', padding: '0.05rem 0.55rem', fontSize: 'var(--w-fs-caption)', fontWeight: 700 }}>{items.length}</span>}
      </h3>
      {items.length === 0
        ? <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--w-text-2)' }}>{vacio}</p>
        : <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.375rem' }}>
            {items.map(i => (
              <li key={i.id + detalle(i)}>
                {(() => {
                  const st = { width: '100%', textAlign: 'left' as const, border: 'none', background: 'var(--w-surface-sunken)', color: 'var(--w-text)', borderRadius: 'var(--w-r-md)', padding: '0.6rem 0.8rem', minHeight: '2.75rem', fontFamily: 'inherit' }
                  const cuerpo = <><strong>{i.nombre}</strong><br /><span style={{ fontSize: '0.8125rem' }}>{detalle(i)}</span></>
                  return onAbrir
                    ? <button type="button" onClick={() => onAbrir(i.id)} style={{ ...st, cursor: 'pointer' }}>{cuerpo}</button>
                    : <div style={st}>{cuerpo}</div>
                })()}
              </li>
            ))}
          </ul>}
    </div>
  )
}

export function PlatformInicio() {
  const [a, setA] = useState<Atencion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  const cargar = useCallback(() => {
    supabase.rpc('plataforma_atencion').then(({ data, error: e }) => {
      if (e) { setError(e.message); return }
      setA(data as Atencion)
    })
  }, [])
  useEffect(() => { cargar() }, [cargar])

  if (error) return <div style={{ padding: '1.25rem', color: 'var(--w-danger-text)' }}>No se pudo cargar: {error}</div>
  if (!a) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>

  return (
    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 20rem), 1fr))' }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: 'var(--w-fs-screen)', fontWeight: 700, color: 'var(--w-text)' }}>¿Qué necesita atención hoy?</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: 'var(--w-fs-label)', fontWeight: 600, color: 'var(--w-text)' }}>
          {(['verde', 'amarillo', 'rojo', 'gris'] as const).map(k => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-r-pill)', padding: '0.25rem 0.75rem' }}>
              <span style={{ width: '0.75rem', height: '0.75rem', borderRadius: '50%', background: SEMAFORO[k].color }} aria-hidden />
              {a.semaforo[k]} {SEMAFORO[k].texto.toLowerCase()}
            </span>
          ))}
        </div>
      </div>
      <Tarjeta titulo="Opiniones urgentes sin revisar" vacio="No hay opiniones urgentes."
        items={(a.opiniones_urgentes ?? []).map(o => ({ id: o.id, nombre: `#${o.numero} · ${o.restaurante}`, titulo: o.titulo, fecha: o.fecha }))}
        detalle={i => `${String(i.titulo)} · ${fecha(String(i.fecha))} — ábrela en “Opiniones”`} />
      <Tarjeta titulo="Acciones pendientes" vacio="Nada pendiente para hoy." items={a.acciones_de_hoy} onAbrir={setAbierto}
        detalle={i => `${(i as Atencion['acciones_de_hoy'][number]).accion ?? 'Sin descripción'} · ${fecha((i as Atencion['acciones_de_hoy'][number]).fecha)}`} />
      <Tarjeta titulo="Pruebas que vencen en 3 días" vacio="Ninguna prueba vence pronto." items={a.pruebas_por_vencer} onAbrir={setAbierto}
        detalle={i => `Vence el ${fecha((i as Atencion['pruebas_por_vencer'][number]).vence)}`} />
      <Tarjeta titulo="Sin pedidos en más de 7 días" vacio="Todos los restaurantes activos están usando la app." items={a.sin_pedidos_7d} onAbrir={setAbierto}
        detalle={i => `Último pedido: ${fecha((i as Atencion['sin_pedidos_7d'][number]).ultimo_pedido)} · ${(i as Atencion['sin_pedidos_7d'][number]).estado}`} />
      <Tarjeta titulo="Pagos atrasados" vacio="No hay pagos atrasados." items={a.pagos_fallidos} onAbrir={setAbierto}
        detalle={i => `Gracia hasta ${fecha((i as Atencion['pagos_fallidos'][number]).gracia_hasta)}`} />
      <Tarjeta titulo="Códigos de vendedor por revisar" vacio="Ningún código inválido." items={a.codigos_a_revisar} onAbrir={setAbierto}
        detalle={i => `Código ${(i as Atencion['codigos_a_revisar'][number]).codigo ?? '—'}: ${(i as Atencion['codigos_a_revisar'][number]).estado === 'invalido' ? 'no existe' : 'inactivo'}`} />
      <Tarjeta titulo="Liquidaciones a vendedores por pagar" vacio="No hay liquidaciones pendientes."
        items={(a.liquidaciones_por_aprobar ?? []).map(l => ({ id: l.id, nombre: l.vendedor, total: l.total, vencida: l.vencida, periodo: l.periodo }))}
        detalle={i => `${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(i.total))}${i.vencida ? ' · VENCIDA' : ''} — ábrela en “Pagos a vendedores”`} />
      <Tarjeta titulo="Contratos por vencer (30 días)" vacio="Ningún contrato vence pronto."
        items={(a.contratos_por_vencer ?? []).map(c => ({ id: c.id, nombre: c.vendedor, vence: c.vence }))}
        detalle={i => `Vence el ${fecha(String(i.vence))} — renuévalo en “Vendedores”`} />
      {abierto && <FichaRestaurante id={abierto} onClose={() => setAbierto(null)} onCambio={cargar} />}
    </div>
  )
}
