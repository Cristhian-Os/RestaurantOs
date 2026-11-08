/**
 * CerebroBot.tsx — "Cerebro del bot" (solo administrador): lo que el bot de WhatsApp sabe de tu restaurante
 * y una caja para probarlo. La prueba no sale a WhatsApp ni crea pedidos reales; el chat vive solo en pantalla.
 */
import { useRef, useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import message from 'antd/es/message'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Input, Textarea } from '../ui/Field'
import { Toggle } from '../ui/Toggle'
import { formatCOP } from '../../config/billing'
import { whatsappConfigService, type BotRespuesta, type CerebroBot as Cerebro, type WaConfig } from '../../services/whatsappConfigService'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo salió mal')
const AYUDA = 'text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]'

const LIM = { bot_nombre: 60, bot_tono: 200, bot_info: 4000, horario: 500, cobertura: 500, datos_transferencia: 500, bot_bienvenida: 300 } as const
type Texto = keyof typeof LIM

export function CerebroBot({ cfg }: { cfg: WaConfig | null }) {
  const qc = useQueryClient()
  const [t, setT] = useState<Record<Texto, string>>({
    bot_nombre: cfg?.bot_nombre ?? '', bot_tono: cfg?.bot_tono ?? '', bot_info: cfg?.bot_info ?? '', horario: cfg?.horario ?? '',
    cobertura: cfg?.cobertura ?? '', datos_transferencia: cfg?.datos_transferencia ?? '', bot_bienvenida: cfg?.bot_bienvenida ?? '',
  })
  const [pedidos, setPedidos] = useState(cfg?.bot_pedidos ?? false)
  const [tarifa, setTarifa] = useState(String(cfg?.tarifa_domicilio ?? 0))
  const [minimo, setMinimo] = useState(String(cfg?.pedido_minimo ?? 0))
  const set = (k: Texto) => (e: { target: { value: string } }) => setT(p => ({ ...p, [k]: e.target.value }))

  const entero = (s: string) => /^\d{1,9}$/.test(s.trim())
  const errTexto = (k: Texto) => (t[k].length > LIM[k] ? `Máximo ${LIM[k]} letras.` : undefined)
  const errTarifa = entero(tarifa) ? undefined : 'Escribe solo números, sin puntos ni signos.'
  const errMinimo = entero(minimo) ? undefined : 'Escribe solo números, sin puntos ni signos.'
  const hayError = (Object.keys(LIM) as Texto[]).some(k => errTexto(k)) || !!errTarifa || !!errMinimo

  const guardar = useMutation({
    mutationFn: () => {
      const v = (k: Texto) => t[k].trim() || null
      const c: Cerebro = {
        bot_pedidos: pedidos, bot_nombre: v('bot_nombre'), bot_tono: v('bot_tono'), bot_info: v('bot_info'), horario: v('horario'),
        tarifa_domicilio: Number(tarifa), cobertura: v('cobertura'), datos_transferencia: v('datos_transferencia'),
        bot_bienvenida: v('bot_bienvenida'), pedido_minimo: Number(minimo),
      }
      return whatsappConfigService.guardarCerebro(cfg, c)
    },
    onSuccess: () => { message.success('Cerebro del bot guardado'); qc.invalidateQueries({ queryKey: ['wa_config'] }) },
    onError: e => message.error(errMsg(e)),
  })

  const modoBot = cfg?.modo === 'bot'

  return (
    <>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-bold">Cerebro del bot</p>
          <p className={AYUDA}>Aquí le cuentas al bot cómo es tu restaurante para que atienda a tus clientes por WhatsApp como lo harías tú.</p>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] p-3">
          <div className="min-w-0">
            <p className="font-semibold">El bot toma pedidos</p>
            <p className={AYUDA}>Si lo enciendes, el bot recibe pedidos por WhatsApp y los pasa a tu caja. Si lo apagas, solo responde preguntas.</p>
          </div>
          <Toggle checked={pedidos} onChange={setPedidos} label="El bot toma pedidos" />
        </div>
        {pedidos && !modoBot && (
          <p role="alert" className="rounded-[var(--w-r-md)] bg-[var(--w-warning-bg)] p-3 text-[length:var(--w-fs-label)] text-[color:var(--w-warning-text)]">
            Ojo: el bot solo toma pedidos cuando WhatsApp está en modo «bot» y las llaves de Meta están cargadas. Hoy tu modo es «{cfg?.modo ?? 'desactivado'}», así que todavía no atenderá a nadie. Pídele a Cristhian que lo active.
          </p>
        )}

        <Input label="Nombre del bot" hint={`Ejemplo: Dany, tu asistente. · ${t.bot_nombre.length}/${LIM.bot_nombre}`} error={errTexto('bot_nombre')}
          value={t.bot_nombre} onChange={set('bot_nombre')} placeholder="Dany" />
        <Input label="Tono con que habla" hint={`Ejemplo: Amable y cercano, con emojis, tratando de tú. · ${t.bot_tono.length}/${LIM.bot_tono}`} error={errTexto('bot_tono')}
          value={t.bot_tono} onChange={set('bot_tono')} placeholder="Amable, cercano y breve" />
        <Textarea label="Cuéntale al bot sobre tu restaurante" rows={9} error={errTexto('bot_info')} value={t.bot_info} onChange={set('bot_info')}
          hint={`Escribe como si le explicaras a un empleado nuevo. ${t.bot_info.length}/${LIM.bot_info}`}
          placeholder={'Nuestra historia: somos una heladería familiar de Armenia desde 2015.\nAlergias: el cholado lleva leche condensada; el mango biche puede tener trazas de maní.\nPromos fijas: los martes, 2x1 en conos sencillos.\nPolíticas: no hacemos cambios de pedidos ya preparados.'} />
        <Input label="Horario" hint={`Ejemplo: Lunes a sábado 2 pm a 10 pm; domingos 2 pm a 9 pm. · ${t.horario.length}/${LIM.horario}`} error={errTexto('horario')}
          value={t.horario} onChange={set('horario')} placeholder="Lunes a sábado 2 pm a 10 pm" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Valor del domicilio (en pesos)" inputMode="numeric" hint="Lo que cobras por llevar el pedido. Pon 0 si es gratis." error={errTarifa}
            value={tarifa} onChange={e => setTarifa(e.target.value)} />
          <Input label="Pedido mínimo (en pesos)" inputMode="numeric" hint="Compra mínima para domicilio. Pon 0 si no hay mínimo." error={errMinimo}
            value={minimo} onChange={e => setMinimo(e.target.value)} />
        </div>
        <Input label="Zona de cobertura" hint={`Ejemplo: Centro, Norte y La Castellana en Armenia. · ${t.cobertura.length}/${LIM.cobertura}`} error={errTexto('cobertura')}
          value={t.cobertura} onChange={set('cobertura')} placeholder="Barrios o zonas donde llegas" />
        <Textarea label="Datos para pagar por transferencia" rows={3} error={errTexto('datos_transferencia')} value={t.datos_transferencia} onChange={set('datos_transferencia')}
          hint={`Ejemplo: Nequi 300 123 4567 a nombre de Dany. · ${t.datos_transferencia.length}/${LIM.datos_transferencia}`} placeholder="Nequi 300 123 4567 a nombre de..." />
        <Textarea label="Mensaje de bienvenida" rows={2} error={errTexto('bot_bienvenida')} value={t.bot_bienvenida} onChange={set('bot_bienvenida')}
          hint={`Lo primero que lee el cliente. Ejemplo: ¡Hola! Soy Dany, ¿qué se te antoja hoy? · ${t.bot_bienvenida.length}/${LIM.bot_bienvenida}`} placeholder="¡Hola! Soy el asistente de..." />
        <div className="flex justify-end">
          <Button onClick={() => guardar.mutate()} disabled={hayError} loading={guardar.isPending}>Guardar cerebro</Button>
        </div>
      </Card>
      <ProbarBot />
    </>
  )
}

interface Burbuja { de: 'yo' | 'bot'; texto: string }

function ProbarBot() {
  const [chat, setChat] = useState<Burbuja[]>([])
  const [texto, setTexto] = useState('')
  const [ultima, setUltima] = useState<BotRespuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fin = useRef<HTMLDivElement>(null)
  const nuevo = useRef(false)
  useEffect(() => { fin.current?.scrollIntoView?.({ block: 'nearest' }) }, [chat, ultima])

  const enviar = useMutation({
    mutationFn: ({ m, reiniciar }: { m: string; reiniciar?: boolean }) => whatsappConfigService.probarBot(m, reiniciar),
    onSuccess: r => { setError(null); setUltima(r); setChat(c => [...c, { de: 'bot', texto: r.respuesta }]) },
    onError: e => setError(errMsg(e)),
  })
  const manda = () => {
    const m = texto.trim()
    if (!m || enviar.isPending) return
    setChat(c => [...c, { de: 'yo', texto: m }]); setTexto(''); setError(null)
    enviar.mutate({ m, reiniciar: nuevo.current }); nuevo.current = false
  }
  const reiniciar = () => {
    setChat([]); setUltima(null); setError(null); setTexto('')
    enviar.reset()
    nuevo.current = true // el próximo mensaje le dice al servidor que empiece de cero
  }
  const r = ultima?.resumen

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-bold">Probar el bot</p>
          <p className={AYUDA}>Escríbele como si fueras un cliente. Es una prueba: no se envía nada por WhatsApp ni se crea ningún pedido real. Guarda el cerebro antes para probar los cambios.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={reiniciar}>Reiniciar</Button>
      </div>

      <div className="flex max-h-[360px] min-h-[140px] flex-col gap-2 overflow-y-auto rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] p-3" aria-live="polite">
        {chat.length === 0 && <p className={AYUDA}>Aún no hay mensajes. Prueba con «Hola, ¿qué tienen hoy?».</p>}
        {chat.map((b, i) => (
          <div key={i} className={b.de === 'yo' ? 'flex justify-end' : 'flex justify-start'}>
            <p className={`max-w-[85%] whitespace-pre-wrap rounded-[var(--w-r-md)] px-3 py-2 text-[length:var(--w-fs-body)] ${b.de === 'yo' ? 'bg-[var(--w-accent)] text-[color:var(--w-on-accent)]' : 'bg-[var(--w-surface)] text-[color:var(--w-text)] border border-[var(--w-border)]'}`}>{b.texto}</p>
          </div>
        ))}
        {enviar.isPending && <p className={AYUDA}>El bot está escribiendo…</p>}
        <div ref={fin} />
      </div>

      {error && <p role="alert" className="rounded-[var(--w-r-md)] bg-[var(--w-danger-bg)] p-3 text-[length:var(--w-fs-label)] text-[color:var(--w-danger-text)]">{error}</p>}

      {r && (
        <div className="flex flex-col gap-2 rounded-[var(--w-r-md)] border border-[var(--w-border)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Resumen del pedido</p>
            <Badge tone="info">{ultima?.aviso ?? 'Pedido de prueba: no se creó'}</Badge>
          </div>
          {r.items.map((it, i) => (
            <p key={i} className="flex justify-between gap-2 text-[length:var(--w-fs-label)]"><span>{it.cantidad} × {it.nombre}</span><span>{formatCOP(it.subtotal)}</span></p>
          ))}
          <p className="flex justify-between gap-2 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]"><span>Domicilio</span><span>{formatCOP(r.domicilio)}</span></p>
          <p className="flex justify-between gap-2 font-bold"><span>Total</span><span>{formatCOP(r.total)}</span></p>
        </div>
      )}

      <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); manda() }}>
        <div className="min-w-0 flex-1">
          <Input label="Tu mensaje de prueba" value={texto} onChange={e => setTexto(e.target.value)} maxLength={500} placeholder="Escribe aquí…" />
        </div>
        <Button type="submit" disabled={!texto.trim()} loading={enviar.isPending}>Enviar</Button>
      </form>
    </Card>
  )
}
