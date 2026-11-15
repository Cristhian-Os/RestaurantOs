/**
 * Conversaciones.tsx — canales (General y uno por área) y chats directos con agentes. Elegir una conversación abre su chat.
 * En los canales solo se guardan tus mensajes: los agentes todavía no participan en ellos.
 */
import { useMemo } from 'react'
import { Card } from '../../components/ui/Card'
import { StatePanel } from '../../components/ui/StatePanel'
import { cn } from '../../lib/cn'
import type { Conversacion } from '../catalogo.ts'
import { useCentral, useIndices } from '../datos.tsx'
import { Enlace, useRuta } from '../navegacion.tsx'
import { AgenteAvatar, AvisoHonesto, Icono, Pagina, Punto } from '../ui.tsx'
import { Chat } from './Chat'

export function Conversaciones() {
  const { datos } = useCentral()
  const { ruta } = useRuta()
  const { depto, agente } = useIndices()
  const lista = useMemo(() => {
    const orden = { canal_institucional: 0, canal_departamento: 1, canal_interdepartamental: 2, grupo_temporal: 3, reunion: 4, directo: 5 } as const
    return [...datos.conversaciones].sort((a, b) => orden[a.tipo] - orden[b.tipo] || a.titulo.localeCompare(b.titulo, 'es'))
  }, [datos.conversaciones])
  const activa: Conversacion | undefined = lista.find(c => c.id === ruta.id) ?? lista[0]
  const nombre = (c: Conversacion) => (c.tipo === 'directo' ? agente(c.agente_id)?.nombre ?? c.titulo : c.titulo)
  const color = (c: Conversacion) => depto(c.departamento_id)?.color ?? depto(agente(c.agente_id)?.departamento_id)?.color ?? '#9CA3AF'
  const dirAgente = activa?.tipo === 'directo' ? agente(activa.agente_id) : undefined

  return (
    <Pagina titulo="Conversaciones" subtitulo="Canales institucionales y chats directos con los agentes">
      <AvisoHonesto>Tus mensajes se guardan a tu nombre. Los agentes aún no están conectados a un modelo de IA: en un chat directo responden en <b>simulación local</b>; en los canales todavía no participan.</AvisoHonesto>
      {lista.length === 0 ? <StatePanel kind="empty" title="Sin conversaciones" /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <nav aria-label="Conversaciones" className="flex max-h-[60vh] flex-row gap-2 overflow-x-auto lg:max-h-none lg:flex-col lg:overflow-visible">
            {lista.map(c => (
              <Enlace key={c.id} a="conversaciones" id={c.id} className={cn('flex min-h-[48px] shrink-0 items-center gap-2 rounded-[var(--w-r-md)] border px-3 font-semibold lg:shrink',
                activa?.id === c.id ? 'border-[var(--w-accent)] bg-[var(--w-accent-soft)] text-[color:var(--w-accent-text)]' : 'border-[var(--w-border)] bg-[var(--w-surface)] text-[color:var(--w-text-2)]')}>
                {c.tipo === 'directo' ? <AgenteAvatar color={color(c)} size={28} /> : <Punto color={color(c)} size={10} />}
                <span className="truncate">{c.tipo.startsWith('canal') ? '# ' : ''}{nombre(c)}</span>
              </Enlace>
            ))}
          </nav>
          <Card className="flex min-w-0 flex-col gap-3">
            {activa && (
              <>
                <p className="m-0 flex items-center gap-2 font-bold text-[color:var(--w-text)]"><Icono nombre="chat" size={20} />{activa.tipo.startsWith('canal') ? '# ' : ''}{nombre(activa)}</p>
                <Chat key={activa.id} conversacionId={activa.id} agente={dirAgente} vacio={activa.tipo === 'directo' ? 'Saluda para empezar.' : 'Todavía no hay mensajes en este canal.'} />
              </>
            )}
          </Card>
        </div>
      )}
    </Pagina>
  )
}
