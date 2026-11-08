/**
 * FidelizacionView.tsx
 * Módulo de Fidelización. Administrador: Resumen + Clientes. Cajero: solo Clientes
 * (registrar, buscar, ver saldos y canjear). Todo lo que mueve puntos pasa por funciones
 * de la base; aquí solo se muestra y se llama.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import message from 'antd/es/message'
import { ModuleHeader, StatCard } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Input, Select } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { StatePanel } from '../ui/StatePanel'
import { Tabs } from '../ui/Tabs'
import { LectorCodigo } from './LectorCodigo'
import { formatCOP } from '../../config/billing'
import {
  fidelizacionService, telefonoLegible, telefonoConPais, PAISES, MOV_TEXTO,
  type Cliente, type RecompensaDisponible,
} from '../../services/fidelizacionService'

type Rol = 'admin' | 'cashier' | 'waiter'
type Vista = 'resumen' | 'clientes'

const DIA = 86_400_000
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo salió mal')
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const urlTarjeta = (token: string) => `${window.location.origin}/tarjeta/${token}`

const IconoHeader = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
)

export function FidelizacionView({ rol }: { rol: Rol }) {
  const [vista, setVista] = useState<Vista>(rol === 'admin' ? 'resumen' : 'clientes')
  const programa = useQuery({ queryKey: ['fid_programa'], queryFn: () => fidelizacionService.getPrograma() })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <ModuleHeader
        icon={IconoHeader}
        title={programa.data?.nombre_club || 'Fidelización'}
        subtitle="Clientes, puntos y recompensas"
      />
      {rol === 'admin' && (
        <Tabs label="Secciones de fidelización" value={vista} onChange={setVista}
          items={[{ key: 'resumen', label: 'Resumen' }, { key: 'clientes', label: 'Clientes' }]} />
      )}
      {rol !== 'admin' ? <Mostrador rol={rol} /> : vista === 'resumen' ? <Resumen /> : <Clientes rol={rol} />}
    </div>
  )
}

/* ───────────────────────── Resumen (solo administrador) ───────────────────────── */

function Resumen() {
  const qc = useQueryClient()
  const programa = useQuery({ queryKey: ['fid_programa'], queryFn: () => fidelizacionService.getPrograma() })
  const clientes = useQuery({ queryKey: ['fid_clientes'], queryFn: () => fidelizacionService.getClientes() })

  const activar = useMutation({
    mutationFn: (activo: boolean) => fidelizacionService.setProgramaActivo(programa.data ?? null, activo),
    onSuccess: (_d, activo) => {
      message.success(activo ? 'Programa activado' : 'Programa pausado')
      qc.invalidateQueries({ queryKey: ['fid_programa'] })
    },
    onError: e => message.error(errMsg(e)),
  })

  const datos = useMemo(() => {
    const lista = (clientes.data ?? []).filter(c => c.activo)
    const ahora = Date.now()
    const ctas = lista.map(c => c.fid_cuentas)
    return {
      total: lista.length,
      puntos: ctas.reduce((n, a) => n + (a?.puntos_saldo ?? 0), 0),
      visitas: ctas.reduce((n, a) => n + (a?.visitas ?? 0), 0),
      conMensajes: lista.filter(c => c.consentimiento_marketing).length,
      inactivos: lista.filter(c => c.fid_cuentas?.ultima_visita && ahora - new Date(c.fid_cuentas.ultima_visita).getTime() > 30 * DIA).length,
      mejores: [...lista].sort((a, b) => (b.fid_cuentas?.gasto_total ?? 0) - (a.fid_cuentas?.gasto_total ?? 0)).filter(c => (c.fid_cuentas?.gasto_total ?? 0) > 0).slice(0, 5),
    }
  }, [clientes.data])

  if (programa.isLoading || clientes.isLoading) return <StatePanel kind="loading" />
  if (programa.isError || clientes.isError) return <StatePanel kind="error" text="No se pudo cargar Fidelización." />

  const activo = programa.data?.activo ?? false

  return (
    <>
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-body-lg)]">
            Programa de puntos <Badge tone={activo ? 'success' : 'neutral'}>{activo ? 'Activo' : 'Pausado'}</Badge>
          </p>
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
            {programa.data
              ? `1 punto por cada ${formatCOP(Number(programa.data.monto_por_punto))} pagados.`
              : 'Todavía no está configurado.'}
            {' '}Mientras esté pausado no se suman puntos nuevos y la tarjeta del cliente no se muestra.
          </p>
        </div>
        <Button variant={activo ? 'secondary' : 'primary'} loading={activar.isPending} onClick={() => activar.mutate(!activo)}>
          {activo ? 'Pausar programa' : 'Activar programa'}
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Clientes" value={datos.total} tone="accent" />
        <StatCard label="Puntos en circulación" value={datos.puntos.toLocaleString('es-CO')} tone="info" />
        <StatCard label="Visitas registradas" value={datos.visitas.toLocaleString('es-CO')} tone="success" />
        <StatCard label="Aceptan mensajes" value={datos.conMensajes} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <p className="font-bold text-[color:var(--w-text)]">Mejores clientes</p>
          {datos.mejores.length === 0 && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Aparecerán cuando tus clientes compren.</p>}
          {datos.mejores.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-[length:var(--w-fs-body)]">
              <span className="min-w-0 truncate text-[color:var(--w-text)]">{c.nombre}</span>
              <span className="shrink-0 font-semibold text-[color:var(--w-text-2)]">{formatCOP(Number(c.fid_cuentas?.gasto_total ?? 0))}</span>
            </div>
          ))}
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="font-bold text-[color:var(--w-text)]">Clientes que no vuelven</p>
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
            {datos.inactivos === 0
              ? 'Nadie lleva más de 30 días sin volver.'
              : `${datos.inactivos} cliente${datos.inactivos === 1 ? '' : 's'} lleva${datos.inactivos === 1 ? '' : 'n'} más de 30 días sin volver.`}
          </p>
        </Card>
      </div>
    </>
  )
}

/* ───────────────────────── Clientes ───────────────────────── */

function Clientes({ rol }: { rol: Rol }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [nuevoAbierto, setNuevoAbierto] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)

  const clientes = useQuery({ queryKey: ['fid_clientes'], queryFn: () => fidelizacionService.getClientes(), staleTime: 15_000 })
  const niveles = useQuery({ queryKey: ['fid_niveles'], queryFn: () => fidelizacionService.getNiveles() })

  const nivelNombre = (id: string | null | undefined) => niveles.data?.find(n => n.id === id)?.nombre ?? null

  const visibles = useMemo(() => {
    const lista = clientes.data ?? []
    const t = q.trim()
    if (!t) return lista
    const dig = t.replace(/\D/g, '')
    return lista.filter(c => norm(c.nombre).includes(norm(t)) || (dig.length >= 3 && (c.telefono ?? '').includes(dig)))
  }, [clientes.data, q])

  const sel = clientes.data?.find(c => c.id === selId) ?? null

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Input type="search" label="Buscar cliente" placeholder="Nombre o teléfono…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Button onClick={() => setNuevoAbierto(true)}>+ Nuevo cliente</Button>
      </div>

      {clientes.isLoading && <StatePanel kind="loading" />}
      {clientes.isError && <StatePanel kind="error" text="No se pudieron cargar los clientes." />}
      {clientes.isSuccess && (clientes.data?.length ?? 0) === 0 && (
        <StatePanel kind="empty" title="Sin clientes todavía" text="Registra el primero con “Nuevo cliente”." />
      )}
      {clientes.isSuccess && (clientes.data?.length ?? 0) > 0 && visibles.length === 0 && (
        <StatePanel kind="empty" title="Sin resultados" text={`Ningún cliente coincide con “${q.trim()}”.`} />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {visibles.map(c => {
          const a = c.fid_cuentas
          return (
            <button key={c.id} type="button" onClick={() => setSelId(c.id)} className="text-left">
              <Card className="flex flex-col gap-2 transition-colors hover:bg-[var(--w-surface-sunken)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-body-lg)]">{c.nombre}</p>
                    <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{telefonoLegible(c.telefono)}</p>
                  </div>
                  {nivelNombre(a?.nivel_id) && <Badge tone="accent">{nivelNombre(a?.nivel_id)}</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
                  <span><b className="text-[color:var(--w-text)]">{a?.puntos_saldo ?? 0}</b> puntos</span>
                  <span><b className="text-[color:var(--w-text)]">{a?.sellos_saldo ?? 0}</b> sellos</span>
                  <span>{a?.visitas ?? 0} visitas</span>
                  <span>Última: {fecha(a?.ultima_visita ?? null)}</span>
                </div>
              </Card>
            </button>
          )
        })}
      </div>

      <NuevoClienteModal
        open={nuevoAbierto}
        onClose={() => setNuevoAbierto(false)}
        onCreado={id => { setNuevoAbierto(false); qc.invalidateQueries({ queryKey: ['fid_clientes'] }); setSelId(id) }}
      />
      <DetalleModal cliente={sel} rol={rol} nivel={nivelNombre(sel?.fid_cuentas?.nivel_id)} onClose={() => setSelId(null)} />
    </>
  )
}

/* ───────────────────────── Nuevo cliente ───────────────────────── */

function NuevoClienteModal({ open, onClose, onCreado, origen }: { open: boolean; onClose: () => void; onCreado: (id: string) => void; origen?: 'caja' | 'mesa' }) {
  const vacio = { nombre: '', pais: '57', telefono: '', correo: '', cumpleanos: '', consentimiento: false }
  const [f, setF] = useState(vacio)

  const crear = useMutation({
    mutationFn: () => fidelizacionService.registrarCliente({
      nombre: f.nombre.trim(), telefono: telefonoConPais(f.pais, f.telefono), correo: f.correo, cumpleanos: f.cumpleanos, consentimiento: f.consentimiento, origen,
    }),
    onSuccess: id => { message.success('Cliente registrado'); setF(vacio); onCreado(id) },
    onError: e => message.error(errMsg(e)),
  })

  return (
    <Modal open={open} onClose={onClose} title="Nuevo cliente"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => crear.mutate()} disabled={f.nombre.trim().length < 2} loading={crear.isPending}>Registrar</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <Input label="Nombre" required autoFocus value={f.nombre} onChange={e => setF(v => ({ ...v, nombre: e.target.value }))} />
        <div className="grid grid-cols-[minmax(0,10rem)_1fr] items-start gap-2">
          <Select label="País" value={f.pais} onChange={e => setF(v => ({ ...v, pais: e.target.value }))}>
            {PAISES.map(p => <option key={p.cc} value={p.cc}>{p.nombre} (+{p.cc})</option>)}
            <option value="otro">Otro país</option>
          </Select>
          <Input
            label="Celular" type="tel" inputMode={f.pais === 'otro' ? 'tel' : 'numeric'}
            hint={f.pais === 'otro' ? 'Escríbelo completo con + y el país. Ej: +49 1512 3456789' : 'Sin el indicativo del país.'}
            value={f.telefono} onChange={e => setF(v => ({ ...v, telefono: e.target.value }))}
          />
        </div>
        <Input label="Correo (opcional)" type="email" value={f.correo} onChange={e => setF(v => ({ ...v, correo: e.target.value }))} />
        <Input label="Cumpleaños (opcional)" type="date" value={f.cumpleanos} onChange={e => setF(v => ({ ...v, cumpleanos: e.target.value }))} />
        <label className="flex items-start gap-3 text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={f.consentimiento} onChange={e => setF(v => ({ ...v, consentimiento: e.target.checked }))} />
          <span>El cliente aceptó recibir promociones por WhatsApp. <span className="text-[color:var(--w-text-3)]">Márcalo solo si lo dijo claramente.</span></span>
        </label>
      </div>
    </Modal>
  )
}

/* ───────────────────────── Detalle del cliente ───────────────────────── */

function DetalleModal({ cliente, rol, nivel, onClose }: { cliente: Cliente | null; rol: Rol; nivel: string | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [qr, setQr] = useState<string | null>(null)
  const [ajuste, setAjuste] = useState({ cantidad: '', motivo: '', unidad: 'puntos' as 'puntos' | 'sellos' })

  const id = cliente?.id
  const token = cliente?.qr_token

  useEffect(() => {
    setQr(null)
    if (!token) return
    let vivo = true
    QRCode.toDataURL(urlTarjeta(token), { width: 220, margin: 1 }).then(u => { if (vivo) setQr(u) }).catch(() => { /* sin QR: queda el enlace */ })
    return () => { vivo = false }
  }, [token])

  const movs = useQuery({ queryKey: ['fid_movs', id], queryFn: () => fidelizacionService.getMovimientos(id!), enabled: !!id })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['fid_clientes'] })
    qc.invalidateQueries({ queryKey: ['fid_movs', id] })
  }

  const ajustar = useMutation({
    mutationFn: () => fidelizacionService.ajustarSaldo(id!, parseInt(ajuste.cantidad, 10), ajuste.motivo.trim(), ajuste.unidad),
    onSuccess: () => { message.success('Saldo ajustado'); setAjuste(a => ({ ...a, cantidad: '', motivo: '' })); refrescar() },
    onError: e => message.error(errMsg(e)),
  })

  const copiar = async () => {
    if (!token) return
    try { await navigator.clipboard.writeText(urlTarjeta(token)); message.success('Enlace copiado') }
    catch { message.error('No se pudo copiar') }
  }

  const a = cliente?.fid_cuentas
  const ajusteValido = Number.isInteger(parseInt(ajuste.cantidad, 10)) && parseInt(ajuste.cantidad, 10) !== 0 && ajuste.motivo.trim().length >= 3

  return (
    <Modal open={!!cliente} onClose={onClose} title={cliente?.nombre ?? 'Cliente'}>
      {cliente && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
            <span>{telefonoLegible(cliente.telefono)}</span>
            {cliente.correo && <span>· {cliente.correo}</span>}
            {nivel && <Badge tone="accent">{nivel}</Badge>}
            <Badge tone={cliente.consentimiento_marketing ? 'success' : 'neutral'}>{cliente.consentimiento_marketing ? 'Acepta mensajes' : 'Sin permiso de mensajes'}</Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Dato t="Puntos" v={a?.puntos_saldo ?? 0} />
            <Dato t="Sellos" v={a?.sellos_saldo ?? 0} />
            <Dato t="Visitas" v={a?.visitas ?? 0} />
          </div>
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
            Ha gastado {formatCOP(Number(a?.gasto_total ?? 0))} · Última visita: {fecha(a?.ultima_visita ?? null)}
          </p>

          <PremiosCanjeables clienteId={cliente.id} onCanjeado={refrescar} />

          <section className="flex flex-col items-center gap-2">
            <p className="self-start font-bold text-[color:var(--w-text)]">Tarjeta digital</p>
            {qr
              ? <img src={qr} alt={`Código QR de ${cliente.nombre}`} width={180} height={180} className="rounded-[var(--w-r-md)] bg-white p-2" />
              : <div className="h-[180px] w-[180px] animate-pulse rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)]" />}
            <Button variant="secondary" size="sm" onClick={copiar}>Copiar enlace de la tarjeta</Button>
          </section>

          <section className="flex flex-col gap-1">
            <p className="font-bold text-[color:var(--w-text)]">Últimos movimientos</p>
            {movs.isSuccess && movs.data.length === 0 && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Sin movimientos todavía.</p>}
            {(movs.data ?? []).map(m => (
              <div key={m.id} className="flex items-center justify-between gap-2 border-b border-[var(--w-border)] py-1.5 text-[length:var(--w-fs-label)]">
                <span className="min-w-0 truncate text-[color:var(--w-text-2)]">{MOV_TEXTO[m.tipo]}{m.motivo ? ` · ${m.motivo}` : ''} · {fecha(m.created_at)}</span>
                <b className="shrink-0" style={{ color: m.cantidad > 0 ? 'var(--w-success-text)' : 'var(--w-danger-text)' }}>
                  {m.cantidad > 0 ? '+' : ''}{m.cantidad} {m.unidad}
                </b>
              </div>
            ))}
          </section>

          {rol === 'admin' && (
            <section className="flex flex-col gap-2 rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] p-3">
              <p className="font-bold text-[color:var(--w-text)]">Ajustar saldo</p>
              <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Usa un número negativo para restar. Queda anotado con tu nombre.</p>
              <div className="grid grid-cols-2 gap-2">
                <Input label="Cantidad" type="number" value={ajuste.cantidad} onChange={e => setAjuste(x => ({ ...x, cantidad: e.target.value }))} />
                <Select label="Unidad" value={ajuste.unidad} onChange={e => setAjuste(x => ({ ...x, unidad: e.target.value as 'puntos' | 'sellos' }))}>
                  <option value="puntos">Puntos</option>
                  <option value="sellos">Sellos</option>
                </Select>
              </div>
              <Input label="Motivo" value={ajuste.motivo} onChange={e => setAjuste(x => ({ ...x, motivo: e.target.value }))} placeholder="Ej: error de digitación" />
              <Button variant="secondary" disabled={!ajusteValido} loading={ajustar.isPending} onClick={() => ajustar.mutate()}>Aplicar ajuste</Button>
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ───────────────────────── Mostrador (cajero y mesero) ───────────────────────── */
// Solo nombre, nivel, puntos/sellos y los últimos 4 dígitos. Sin compras, gasto ni teléfono completo
// (la base ya devuelve el teléfono tapado; aquí no hay forma de pedirlo completo).

/** Si pegan o leen el enlace de la tarjeta, se busca por el código que trae; si no, por lo escrito. */
const terminoDe = (q: string) => /tarjeta\/([0-9a-f]{64})/i.exec(q)?.[1] ?? q.trim()

function Mostrador({ rol }: { rol: 'cashier' | 'waiter' }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [nuevoAbierto, setNuevoAbierto] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const [lectorAbierto, setLectorAbierto] = useState(false)
  const termino = terminoDe(q)
  const res = useQuery({
    queryKey: ['fid_buscar', termino], queryFn: () => fidelizacionService.buscar(termino), enabled: termino.length >= 2, staleTime: 10_000,
  })

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Input type="search" label="Buscar cliente" placeholder="Nombre, últimos 4 del celular o código…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Button variant="secondary" onClick={() => setLectorAbierto(true)}>Leer código</Button>
        <Button onClick={() => setNuevoAbierto(true)}>+ Nuevo cliente</Button>
      </div>

      {termino.length < 2 && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Escribe el nombre, los últimos 4 números del celular o lee el código de su tarjeta.</p>}
      {res.isFetching && <StatePanel kind="loading" />}
      {res.isError && <StatePanel kind="error" text="No se pudo buscar." />}
      {res.isSuccess && !res.isFetching && res.data.length === 0 && (
        <StatePanel kind="empty" title="Sin resultados" text="Si es un cliente nuevo, regístralo con “Nuevo cliente”." />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {(res.data ?? []).map(c => (
          <button key={c.id} type="button" onClick={() => setSelId(c.id)} className="text-left">
            <Card className="flex flex-col gap-2 transition-colors hover:bg-[var(--w-surface-sunken)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-body-lg)]">{c.nombre}</p>
                  <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{c.telefono ?? 'Sin teléfono'}</p>
                </div>
                {c.nivel && <Badge tone="accent">{c.nivel}</Badge>}
              </div>
              <div className="flex gap-4 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
                <span><b className="text-[color:var(--w-text)]">{c.puntos_saldo}</b> puntos</span>
                <span><b className="text-[color:var(--w-text)]">{c.sellos_saldo}</b> sellos</span>
              </div>
            </Card>
          </button>
        ))}
      </div>

      <NuevoClienteModal
        open={nuevoAbierto}
        origen={rol === 'waiter' ? 'mesa' : 'caja'}
        onClose={() => setNuevoAbierto(false)}
        onCreado={id => { setNuevoAbierto(false); qc.invalidateQueries({ queryKey: ['fid_buscar'] }); setSelId(id) }}
      />
      <LectorCodigo open={lectorAbierto} onClose={() => setLectorAbierto(false)} onLeido={t => { setLectorAbierto(false); setQ(t) }} />
      <FichaModal id={selId} rol={rol} onClose={() => setSelId(null)} />
    </>
  )
}

function FichaModal({ id, rol, onClose }: { id: string | null; rol: 'cashier' | 'waiter'; onClose: () => void }) {
  const qc = useQueryClient()
  const ficha = useQuery({ queryKey: ['fid_ficha', id], queryFn: () => fidelizacionService.getFicha(id!), enabled: !!id })
  const c = ficha.data

  return (
    <Modal open={!!id} onClose={onClose} title={c?.nombre ?? 'Cliente'}>
      {ficha.isLoading && <StatePanel kind="loading" />}
      {c && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
            <span>{c.telefono ?? 'Sin teléfono'}</span>
            {c.nivel && <Badge tone="accent">{c.nivel}</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <Dato t="Puntos" v={c.puntos_saldo} />
            <Dato t="Sellos" v={c.sellos_saldo} />
          </div>
          {rol === 'cashier' ? (
            <PremiosCanjeables clienteId={c.id} onCanjeado={() => { qc.invalidateQueries({ queryKey: ['fid_ficha', id] }); qc.invalidateQueries({ queryKey: ['fid_buscar'] }) }} />
          ) : (
            <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Los canjes los hace el cajero.</p>
          )}
        </div>
      )}
    </Modal>
  )
}

/** Premios de un cliente: el cajero ve cuáles puede canjear ya y por qué los demás no. La clave del canje se conserva en los reintentos para no cobrar dos veces. */
function PremiosCanjeables({ clienteId, onCanjeado }: { clienteId: string; onCanjeado: () => void }) {
  const qc = useQueryClient()
  const claves = useRef<Record<string, string>>({})
  const premios = useQuery({ queryKey: ['fid_premios', clienteId], queryFn: () => fidelizacionService.getRecompensasDisponibles(clienteId) })

  const canjear = useMutation({
    mutationFn: (r: RecompensaDisponible) => {
      // La misma clave en cada reintento del mismo canje: si la red falla, no se cobra dos veces.
      const k = (claves.current[r.id] ??= `canje-${clienteId}-${r.id}-${crypto.randomUUID()}`)
      return fidelizacionService.canjear(clienteId, r.id, k)
    },
    onSuccess: (_d, r) => {
      delete claves.current[r.id]; message.success(`Canjeado: ${r.nombre}`)
      qc.invalidateQueries({ queryKey: ['fid_premios', clienteId] }); onCanjeado()
    },
    onError: e => message.error(errMsg(e)),
  })

  return (
    <section className="flex flex-col gap-2">
      <p className="font-bold text-[color:var(--w-text)]">Canjear recompensa</p>
      {premios.isLoading && <StatePanel kind="loading" />}
      {premios.isError && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-danger-text)]">No se pudieron cargar las recompensas.</p>}
      {premios.isSuccess && premios.data.length === 0 && (
        <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Todavía no hay recompensas activas.</p>
      )}
      {(premios.data ?? []).map(r => (
        <div key={r.id} className="flex items-center justify-between gap-2 rounded-[var(--w-r-md)] border border-[var(--w-border)] px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-[color:var(--w-text)]">{r.nombre}</p>
            <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">
              {r.costo} {r.unidad}{r.disponible ? '' : ` · ${r.motivo}`}
            </p>
          </div>
          <Button size="sm" disabled={!r.disponible || canjear.isPending}
            onClick={() => { if (window.confirm(`¿Canjear “${r.nombre}” por ${r.costo} ${r.unidad}?`)) canjear.mutate(r) }}>
            {r.disponible ? 'Canjear' : 'No aplica'}
          </Button>
        </div>
      ))}
    </section>
  )
}

function Dato({ t, v }: { t: string; v: number }) {
  return (
    <div className="rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] py-2">
      <p className="font-bold text-[color:var(--w-text)] text-[length:var(--w-fs-title)]">{v.toLocaleString('es-CO')}</p>
      <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{t}</p>
    </div>
  )
}
