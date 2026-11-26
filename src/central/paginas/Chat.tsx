/**
 * Chat.tsx — una conversación de Central (mensajes + caja de texto). Sirve para el chat directo con un agente, los canales y Resti.
 * Tus mensajes se guardan a tu nombre. Si es un chat directo, el agente responde en "Simulación local" (texto armado con datos
 * reales, sin modelo de IA; la base solo deja guardarlo con esa marca desde la app). Si encendiste la IA en Integraciones y el agente
 * está conectado, responde la IA real: la pide y la guarda el servidor, con límites de gasto. Un canal solo guarda tus mensajes.
 * Los mensajes nuevos de la conversación aparecen solos (Realtime), sin recargar.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Button } from '../../components/ui/Button'
import { StatePanel } from '../../components/ui/StatePanel'
import { cn } from '../../lib/cn'
import { enviarMensaje, pedirRespuestaIA, textoError } from '../acciones.ts'
import { hace, type Agente, type Mensaje } from '../catalogo.ts'
import { ABIERTA, useCentral, useIndices } from '../datos.tsx'
import { respuestaSimulada } from '../simulacion.ts'
import { AgenteAvatar, ErrorAccion, Icono } from '../ui.tsx'

export function Chat({ conversacionId, agente, vacio }: { conversacionId: string; agente?: Agente; vacio?: string }) {
  const { datos, userId, recargar } = useCentral()
  const { depto } = useIndices()
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fin = useRef<HTMLDivElement>(null)
  // IA real solo si el dueño la encendió Y este agente está marcado como conectado; en cualquier otro caso, simulación local.
  const iaReal = !!agente && datos.config.ia_encendida === true && agente.proveedor_estado === 'activo'

  // `silencioso`: recarga por aviso en vivo; si falla, no borra los mensajes que ya se ven ni muestra error.
  const cargar = useCallback(async (silencioso = false) => {
    const { data, error: e } = await supabase.from('central_mensajes').select('*').eq('conversacion_id', conversacionId).order('id', { ascending: false }).limit(200)
    if (e) { if (!silencioso) { setError(textoError(e)); setMensajes([]) }; return }
    setMensajes(((data ?? []) as Mensaje[]).reverse())
  }, [conversacionId])

  useEffect(() => { setMensajes(null); setError(null); void cargar() }, [cargar])

  // En vivo: cuando se guarda un mensaje de esta conversación (por ti, desde otro aparato o la respuesta del agente), aparece solo.
  useEffect(() => {
    let activo = true, yaConecto = false
    let temporizador: ReturnType<typeof setTimeout> | null = null
    const pedir = () => { if (temporizador) return; temporizador = setTimeout(() => { temporizador = null; if (activo) void cargar(true) }, 150) }
    const canal = supabase.channel(`central-chat-${conversacionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'central_mensajes', filter: `conversacion_id=eq.${conversacionId}` }, pedir)
      .subscribe(s => {
        if (!activo || s !== 'SUBSCRIBED') return
        if (yaConecto) void cargar(true)   // volvió tras una caída: se pudo perder un mensaje
        yaConecto = true
      })
    return () => { activo = false; if (temporizador) clearTimeout(temporizador); void supabase.removeChannel(canal) }
  }, [conversacionId, cargar])
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }) }, [mensajes])

  const enviar = async () => {
    const t = texto.trim()
    if (!t || !userId || enviando) return
    setEnviando(true); setError(null)
    if (iaReal) {
      // IA real: se guarda tu mensaje, se muestra, y el SERVIDOR (que tiene las llaves y los límites de gasto) pide y guarda la respuesta.
      const e1 = await enviarMensaje(conversacionId, userId, t)
      if (e1) { setEnviando(false); setError(e1); return }
      setTexto(''); await cargar()
      const e2 = await pedirRespuestaIA(conversacionId)
      setEnviando(false)
      if (e2) setError(e2)
      await cargar(); void recargar()
      return
    }
    const area = agente ? depto(agente.departamento_id) : undefined
    const respuesta = agente
      ? {
          agenteId: agente.id,
          texto: respuestaSimulada(agente, area, t, {
            tareasAbiertas: datos.tareas.filter(x => ABIERTA(x.estado)).length,
            tareasDelArea: datos.tareas.filter(x => ABIERTA(x.estado) && x.departamento_id === agente.departamento_id).length,
            aprobacionesPendientes: datos.aprobaciones.filter(x => x.estado === 'pendiente').length,
            restaurantesActivos: datos.restaurantes.filter(x => x.activo).length,
            restaurantesTotal: datos.restaurantes.length,
          }),
        }
      : undefined
    const e = await enviarMensaje(conversacionId, userId, t, respuesta)
    setEnviando(false)
    if (e) { setError(e); return }
    setTexto('')
    await cargar()
    void recargar()
  }

  if (mensajes === null) return <StatePanel kind="loading" title="Cargando mensajes…" />
  const color = agente ? depto(agente.departamento_id)?.color ?? '#9CA3AF' : '#9CA3AF'
  return (
    <div className="flex min-h-[320px] flex-col gap-3">
      <div className="flex max-h-[52vh] min-h-[200px] flex-1 flex-col gap-2 overflow-y-auto rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] p-3" role="log" aria-live="polite" aria-label="Mensajes">
        {mensajes.length === 0 && <p className="m-auto max-w-[34ch] text-center text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{vacio ?? 'Todavía no hay mensajes. Escribe el primero.'}</p>}
        {mensajes.map(m => {
          const mio = m.autor_tipo === 'humano'
          return (
            <div key={m.id} className={cn('flex max-w-[88%] items-end gap-2', mio ? 'self-end flex-row-reverse' : 'self-start')}>
              {!mio && <AgenteAvatar color={color} size={30} />}
              <div className={cn('rounded-[var(--w-r-lg)] px-3 py-2', mio ? 'bg-[var(--w-accent)] text-[color:var(--w-on-accent)]' : 'bg-[var(--w-surface)] text-[color:var(--w-text)]')}>
                <p className="m-0 whitespace-pre-wrap break-words text-[length:var(--w-fs-body)]">{m.contenido}</p>
                <p className={cn('m-0 mt-1 text-[11px]', mio ? 'text-white/80' : 'text-[color:var(--w-text-3)]')}>
                  {m.modo === 'simulacion_local' ? 'Simulación local · ' : m.autor_tipo === 'agente' ? 'IA real · ' : ''}{hace(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={fin} />
      </div>
      <ErrorAccion texto={error} />
      <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); void enviar() }}>
        <label className="sr-only" htmlFor={`msg-${conversacionId}`}>Mensaje</label>
        <textarea id={`msg-${conversacionId}`} value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={4000} placeholder={agente ? `Escríbele a ${agente.nombre}…` : 'Escribe un mensaje…'}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() } }}
          className="min-h-[44px] flex-1 resize-none rounded-[var(--w-r-md)] border border-[var(--w-border-strong)] bg-[var(--w-surface)] px-3 py-2 text-[length:var(--w-fs-body)] text-[color:var(--w-text)] placeholder:text-[color:var(--w-text-3)]" />
        <Button type="submit" loading={enviando} disabled={!texto.trim()} aria-label="Enviar mensaje" icon={<Icono nombre="enviar" size={18} />}>Enviar</Button>
      </form>
    </div>
  )
}
