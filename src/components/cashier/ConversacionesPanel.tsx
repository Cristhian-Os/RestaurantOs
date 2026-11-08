/**
 * ConversacionesPanel.tsx — conversaciones de WhatsApp con el bot (administrador y cajero).
 * Las que necesitan a una persona salen primero. El teléfono llega ya enmascarado para el cajero.
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import message from 'antd/es/message'
import { ModuleHeader } from '../tasks/ModuleHeader'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Tabs } from '../ui/Tabs'
import { StatePanel } from '../ui/StatePanel'
import { conversacionesService, type Conversacion, type MensajeConv } from '../../services/conversacionesService'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo salió mal')
const hora = (iso: string) => new Date(iso).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'America/Bogota' })
type Filtro = 'todas' | 'persona' | 'abiertas'

const ORIGEN: Record<string, string> = { bot: 'Bot', manual: 'Equipo', sistema: 'Sistema', campana: 'Campaña', arm: 'Sistema' }
const ICONO = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 0113 3h.5a8.5 8.5 0 018 8z" /></svg>

function Hilo({ c, onVolver, onCambio }: { c: Conversacion; onVolver: () => void; onCambio: () => void }) {
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  const fin = useRef<HTMLDivElement>(null)
  const msgs = useQuery({ queryKey: ['wa_conv_msgs', c.id], queryFn: () => conversacionesService.mensajes(c.id), refetchInterval: 15000 })
  useEffect(() => { fin.current?.scrollIntoView?.({ block: 'nearest' }) }, [msgs.data])

  const tras = (ok: string) => () => { message.success(ok); qc.invalidateQueries({ queryKey: ['wa_conv_msgs', c.id] }); onCambio() }
  const responder = useMutation({
    mutationFn: () => conversacionesService.responder(c.id, texto.trim()),
    onSuccess: () => { setTexto(''); tras('Mensaje enviado')() },
    onError: e => message.error(errMsg(e).includes('24') ? errMsg(e) : `No se pudo enviar: ${errMsg(e)}`),
  })
  const devolver = useMutation({ mutationFn: () => conversacionesService.devolverBot(c.id), onSuccess: tras('Listo: el bot sigue con esta conversación'), onError: e => message.error(errMsg(e)) })
  const cerrar = useMutation({ mutationFn: () => conversacionesService.cerrar(c.id), onSuccess: () => { tras('Conversación cerrada')(); onVolver() }, onError: e => message.error(errMsg(e)) })
  const cerrada = c.estado === 'cerrada'

  return (
    <Card className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onVolver} className="md:hidden">← Volver</Button>
          <div className="min-w-0">
            <p className="truncate font-bold">{c.nombre ?? 'Cliente'}</p>
            <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{c.telefono}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.estado === 'esperando_humano' && <Button size="sm" variant="secondary" loading={devolver.isPending} onClick={() => devolver.mutate()}>Devolver al bot</Button>}
          {!cerrada && <Button size="sm" variant="ghost" loading={cerrar.isPending} onClick={() => cerrar.mutate()}>Cerrar</Button>}
        </div>
      </div>
      {c.pedido_en_curso && <p className="text-[length:var(--w-fs-caption)] text-[color:var(--w-info-text)]">Tiene un pedido en curso</p>}

      <div className="flex max-h-[420px] min-h-[160px] flex-col gap-2 overflow-y-auto rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] p-3">
        {msgs.isLoading && <StatePanel kind="loading" />}
        {msgs.isError && <p className="text-[color:var(--w-danger-text)]">No se pudieron cargar los mensajes.</p>}
        {(msgs.data ?? []).map((m: MensajeConv) => {
          const mio = m.direccion === 'saliente'
          return (
            <div key={m.id} className={mio ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
              <p className={`max-w-[85%] whitespace-pre-wrap rounded-[var(--w-r-md)] px-3 py-2 text-[length:var(--w-fs-body)] ${mio ? 'bg-[var(--w-accent-soft)] text-[color:var(--w-text)]' : 'border border-[var(--w-border)] bg-[var(--w-surface)] text-[color:var(--w-text)]'}`}>
                {m.texto ?? `(${m.tipo})`}
              </p>
              <span className="mt-0.5 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{mio ? `${ORIGEN[m.origen] ?? 'Equipo'} · ` : ''}{hora(m.created_at)}</span>
            </div>
          )
        })}
        <div ref={fin} />
      </div>

      {cerrada ? <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Esta conversación está cerrada.</p> : (
        <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); if (texto.trim()) responder.mutate() }}>
          <textarea aria-label="Tu respuesta" rows={2} maxLength={1000} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe tu respuesta…"
            className="min-h-[44px] w-full rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] bg-[var(--w-surface)] px-3 py-2 text-[length:var(--w-fs-body)] text-[color:var(--w-text)]" />
          <div className="flex justify-end"><Button type="submit" disabled={!texto.trim()} loading={responder.isPending}>Enviar</Button></div>
        </form>
      )}
    </Card>
  )
}

export function ConversacionesPanel() {
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [selId, setSelId] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['wa_conversaciones'], queryFn: () => conversacionesService.lista(), refetchInterval: 15000 })

  const todas = [...(q.data ?? [])].sort((a, b) =>
    Number(b.estado === 'esperando_humano') - Number(a.estado === 'esperando_humano') || Date.parse(b.ultimo_mensaje_at) - Date.parse(a.ultimo_mensaje_at))
  const lista = todas.filter(c => filtro === 'todas' || (filtro === 'persona' ? c.estado === 'esperando_humano' : c.estado === 'abierta'))
  const sel = todas.find(c => c.id === selId) ?? null
  const nPersona = todas.filter(c => c.estado === 'esperando_humano').length

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4" style={{ fontFamily: 'var(--w-font)' }}>
      <ModuleHeader icon={ICONO} title="Conversaciones" subtitle="Lo que tus clientes escriben por WhatsApp" />
      <div className="overflow-x-auto">
        <Tabs label="Filtrar conversaciones" value={filtro} onChange={setFiltro} items={[
          { key: 'todas', label: 'Todas' }, { key: 'persona', label: `Necesitan persona${nPersona ? ` (${nPersona})` : ''}` }, { key: 'abiertas', label: 'Abiertas' },
        ]} />
      </div>
      {q.isLoading ? <StatePanel kind="loading" /> : q.isError ? <StatePanel kind="error" /> : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[320px_1fr]">
          <div className={`flex flex-col gap-2 ${sel ? 'hidden md:flex' : ''}`}>
            {lista.length === 0 && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">No hay conversaciones en esta lista.</p>}
            {lista.map(c => (
              <button key={c.id} type="button" onClick={() => setSelId(c.id)} aria-pressed={c.id === selId}
                className={`flex flex-col gap-1 rounded-[var(--w-r-lg)] border p-3 text-left ${c.id === selId ? 'border-[var(--w-accent)] bg-[var(--w-accent-soft)]' : 'border-[var(--w-border)] bg-[var(--w-surface)]'}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{c.nombre ?? c.telefono}</span>
                  <span className="shrink-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{hora(c.ultimo_mensaje_at)}</span>
                </span>
                {c.nombre && <span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{c.telefono}</span>}
                <span className="truncate text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{c.ultimo_texto ?? '—'}</span>
                <span className="flex flex-wrap gap-1.5">
                  {c.estado === 'esperando_humano' && <Badge tone="warning">Necesita a una persona</Badge>}
                  {c.estado === 'cerrada' && <Badge tone="neutral">Cerrada</Badge>}
                  {c.pedido_en_curso && <Badge tone="info">Pedido en curso</Badge>}
                </span>
              </button>
            ))}
          </div>
          <div className={sel ? '' : 'hidden md:block'}>
            {sel ? <Hilo key={sel.id} c={sel} onVolver={() => setSelId(null)} onCambio={() => qc.invalidateQueries({ queryKey: ['wa_conversaciones'] })} />
              : <Card><p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Elige una conversación para ver los mensajes.</p></Card>}
          </div>
        </div>
      )}
    </div>
  )
}
