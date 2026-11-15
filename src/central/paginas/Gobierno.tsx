/**
 * Gobierno.tsx — integraciones, presupuestos y configuración de Central.
 * Honestidad ante todo: una integración no se marca "activa" desde la pantalla (la base lo impide sin adaptador real y
 * autorización registrada). Las llaves de IA y de Telegram se PEGAN aquí (campo oculto): viajan una sola vez al servidor, que las
 * guarda y nunca las devuelve; la pantalla solo muestra "Llave guardada". Los agentes jamás las ven.
 */
import { useEffect, useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { StatePanel } from '../../components/ui/StatePanel'
import { Toggle } from '../../components/ui/Toggle'
import { actualizarAgente, actualizarIntegracion, estadoConexiones, guardarConfig, guardarLlave, probarProveedor, probarTelegram, quitarLlave, type EstadoConexiones, type NombreLlave } from '../acciones.ts'
import { usd, type Integracion } from '../catalogo.ts'
import { useCentral, useIndices } from '../datos.tsx'
import { AgenteAvatar, AvisoHonesto, ErrorAccion, Kpi, Pagina, TituloBloque, useAccion } from '../ui.tsx'

const ETQ_ESTADO: Record<Integracion['estado'], string> = { no_conectada: 'No conectada', pendiente_autorizacion: 'Pendiente de autorización', activa: 'Activa' }
const TONO_ESTADO: Record<Integracion['estado'], Tone> = { no_conectada: 'neutral', pendiente_autorizacion: 'warning', activa: 'success' }
const ETQ_ADAPTADOR: Record<Integracion['adaptador'], string> = { ninguno: 'Sin adaptador', mock_local: 'Simulación local', real: 'Adaptador real' }

function TarjetaIntegracion({ i }: { i: Integracion }) {
  const { ocupado, error, ejecutar } = useAccion()
  const [notas, setNotas] = useState(i.notas)
  const pendiente = i.estado === 'pendiente_autorizacion'
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2"><p className="m-0 flex-1 font-bold text-[color:var(--w-text)]">{i.nombre}</p><Badge tone={TONO_ESTADO[i.estado]}>{ETQ_ESTADO[i.estado]}</Badge></div>
      <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{i.descripcion}</p>
      <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{ETQ_ADAPTADOR[i.adaptador]}. Permisos mínimos que pediría:</p>
      <ul className="m-0 list-disc pl-5 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{i.scopes.map(s => <li key={s}>{s}</li>)}</ul>
      <Textarea label="Notas" value={notas} onChange={e => setNotas(e.target.value)} rows={2} maxLength={2000} />
      <ErrorAccion texto={error} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={ocupado} disabled={notas === i.notas} onClick={() => void ejecutar(() => actualizarIntegracion(i.id, { notas }))}>Guardar notas</Button>
        {i.estado !== 'activa' && <Button size="sm" variant={pendiente ? 'ghost' : 'secondary'} loading={ocupado} onClick={() => void ejecutar(() => actualizarIntegracion(i.id, { estado: pendiente ? 'no_conectada' : 'pendiente_autorizacion' }))}>{pendiente ? 'Quitar de pendientes' : 'Marcar pendiente de autorización'}</Button>}
      </div>
    </Card>
  )
}

/** Botón "Probar": pide al servidor una prueba mínima y muestra el resultado (nunca la llave ni la respuesta cruda del proveedor). */
function BotonProbar({ texto, probar }: { texto: string; probar: () => Promise<{ ok: boolean; texto: string }> }) {
  const [cargando, setCargando] = useState(false)
  const [res, setRes] = useState<{ ok: boolean; texto: string } | null>(null)
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="secondary" loading={cargando} onClick={() => { setCargando(true); setRes(null); void probar().then(r => { setRes(r); setCargando(false) }) }}>{texto}</Button>
      {res && <p role="status" className={`m-0 text-[length:var(--w-fs-caption)] ${res.ok ? 'text-[color:var(--w-success)]' : 'text-[color:var(--w-danger)]'}`}>{res.texto}</p>}
    </div>
  )
}

const NOMBRE_LLAVE: Record<string, NombreLlave> = { claude: 'CENTRAL_CLAVE_CLAUDE', nvidia: 'CENTRAL_CLAVE_NVIDIA', deepseek: 'CENTRAL_CLAVE_DEEPSEEK' }

/** Campo para pegar una llave: se envía una vez al servidor y se borra de la pantalla; nunca se vuelve a mostrar. */
function CampoLlave({ nombre, etiqueta, guardada, origen, oculta = true, alCambiar }: {
  nombre: NombreLlave; etiqueta: string; guardada: boolean; origen: 'servidor' | 'panel' | null; oculta?: boolean; alCambiar: () => void
}) {
  const { ocupado, error, ejecutar } = useAccion()
  const [valor, setValor] = useState('')
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Input label={etiqueta} type={oculta ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={valor} onChange={e => setValor(e.target.value)}
            placeholder={guardada ? '•••••• guardada: pega otra para cambiarla' : 'Pega aquí'} />
        </div>
        <Button size="sm" variant="secondary" disabled={!valor.trim()} loading={ocupado} onClick={() => void ejecutar(async () => { const e = await guardarLlave(nombre, valor); if (!e) { setValor(''); alCambiar() } return e })}>Guardar</Button>
        {origen === 'panel' && <Button size="sm" variant="ghost" loading={ocupado} onClick={() => void ejecutar(async () => { const e = await quitarLlave(nombre); if (!e) alCambiar(); return e })}>Quitar</Button>}
      </div>
      {origen === 'servidor' && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Esta ya está guardada en el servidor (Supabase). Si pegas otra aquí, se usa la del servidor.</p>}
      <ErrorAccion texto={error} />
    </div>
  )
}

/** Panel de IA: interruptor general, tope de gasto, modelo por defecto y las llaves (se pegan aquí y solo las ve el servidor). */
function PanelIA() {
  const { datos } = useCentral()
  const { ocupado, error, ejecutar } = useAccion()
  const [est, setEst] = useState<EstadoConexiones | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const encendida = datos.config.ia_encendida === true
  const tope = Number(datos.config.ia_tope_mensual_usd ?? 0)
  const [topeTxt, setTopeTxt] = useState(String(tope))
  const topeNum = Number(topeTxt)
  const topeValido = topeTxt.trim() !== '' && Number.isFinite(topeNum) && topeNum >= 0
  const modelo = typeof datos.config.ia_modelo_defecto === 'string' ? (datos.config.ia_modelo_defecto as string) : 'claude'
  const [version, setVersion] = useState(0)
  const recargarEstado = () => setVersion(v => v + 1)
  useEffect(() => {
    let vivo = true
    void estadoConexiones().then(r => { if (!vivo) return; if (r.ok === true) { setEst(r.datos); setFallo(null) } else setFallo(r.mensaje) })
    return () => { vivo = false }
  }, [version])
  const llaveDe = (id: string) => est?.proveedores.find(p => p.id === id)?.llave === true
  const puedeEncender = tope > 0 && llaveDe(modelo)
  return (
    <Card className="flex flex-col gap-4">
      <TituloBloque>Panel de IA (modelos que dan voz a los agentes)</TituloBloque>
      <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Los agentes solo conversan y proponen: tú apruebas. Si algo sale mal, apaga el interruptor y todo se detiene al instante.</p>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <Toggle checked={encendida} disabled={ocupado || (!encendida && !puedeEncender)} onChange={v => void ejecutar(() => guardarConfig('ia_encendida', v))} label="IA encendida" />
          <span className="font-semibold text-[color:var(--w-text)]">{encendida ? 'IA encendida' : 'IA apagada'}</span>
        </div>
        {!encendida && !puedeEncender && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Para encenderla: fija un tope de gasto mayor a 0 y guarda la llave del modelo en el servidor (mira la guía).</p>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44"><Input label="Tope mensual (USD)" inputMode="decimal" value={topeTxt} onChange={e => setTopeTxt(e.target.value)} error={topeValido ? undefined : 'Número mayor o igual a 0'} hint="0 = no se gasta nada" /></div>
        <Button size="sm" variant="secondary" disabled={!topeValido || topeNum === tope} loading={ocupado} onClick={() => void ejecutar(() => guardarConfig('ia_tope_mensual_usd', topeNum))}>Guardar tope</Button>
      </div>
      <Opcion clave="ia_modelo_defecto" titulo="Modelo principal" ayuda="Claude es el principal. NVIDIA da acceso a DeepSeek y otros; DeepSeek directo es la alternativa." opciones={[['claude', 'Claude (Anthropic)'], ['nvidia', 'NVIDIA (DeepSeek y otros)'], ['deepseek', 'DeepSeek directo']]} />
      <ErrorAccion texto={error} />
      {fallo && <AvisoHonesto>{fallo}</AvisoHonesto>}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {(est?.proveedores ?? []).map(p => (
          <li key={p.id} className="flex flex-col gap-2 border-b border-[var(--w-border)] pb-3 last:border-0">
            <div className="flex flex-wrap items-start gap-3">
              <span className="min-w-[160px] flex-1"><span className="block font-semibold text-[color:var(--w-text)]">{p.nombre}</span><span className="block text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Modelo: {p.modelo}</span></span>
              <Badge tone={p.llave ? 'success' : 'neutral'}>{p.llave ? 'Llave guardada' : 'Falta la llave'}</Badge>
              <BotonProbar texto="Probar" probar={() => probarProveedor(p.id)} />
            </div>
            {NOMBRE_LLAVE[p.id] && <CampoLlave nombre={NOMBRE_LLAVE[p.id]} etiqueta="Llave de API" guardada={p.llave} origen={p.origen} alCambiar={recargarEstado} />}
          </li>
        ))}
        {est && (
          <li className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start gap-3">
              <span className="min-w-[160px] flex-1"><span className="block font-semibold text-[color:var(--w-text)]">Telegram (avisos)</span><span className="block text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Solo envía avisos a tu chat</span></span>
              <Badge tone={est.telegram.token && est.telegram.chat ? 'success' : 'neutral'}>{est.telegram.token && est.telegram.chat ? 'Configurado' : 'Falta configurar'}</Badge>
              <BotonProbar texto="Enviar prueba" probar={probarTelegram} />
            </div>
            <CampoLlave nombre="CENTRAL_TELEGRAM_TOKEN" etiqueta="Token del bot (BotFather)" guardada={est.telegram.token} origen={est.telegram.origenToken} alCambiar={recargarEstado} />
            <CampoLlave nombre="CENTRAL_TELEGRAM_CHAT_ID" etiqueta="Tu chat_id (número)" guardada={est.telegram.chat} origen={est.telegram.origenChat} oculta={false} alCambiar={recargarEstado} />
          </li>
        )}
      </ul>
    </Card>
  )
}

export function Integraciones() {
  const { datos } = useCentral()
  return (
    <Pagina titulo="Integraciones" subtitulo="Modelos de IA, avisos y redes sociales, todo apagado hasta que tú lo conectes">
      <AvisoHonesto>Nada se conecta solo. Pega aquí tus llaves: el servidor las guarda y no se vuelven a mostrar ni las ven los agentes (para cambiar una, pega otra). En redes sociales los agentes solo preparan borradores: publicar siempre lo decide una persona.</AvisoHonesto>
      <PanelIA />
      {datos.integraciones.length === 0 ? <StatePanel kind="empty" title="Sin integraciones registradas" /> : <div className="grid gap-4 md:grid-cols-2">{datos.integraciones.map(i => <TarjetaIntegracion key={i.id} i={i} />)}</div>}
    </Pagina>
  )
}

function FilaPresupuesto({ id, nombre, color, valor }: { id: string; nombre: string; color: string; valor: number }) {
  const { ocupado, error, ejecutar } = useAccion()
  const [v, setV] = useState(String(valor))
  const num = Number(v)
  const valido = v.trim() !== '' && Number.isFinite(num) && num >= 0
  return (
    <li className="flex flex-wrap items-end gap-3 border-b border-[var(--w-border)] pb-3 last:border-0">
      <span className="flex min-w-[140px] flex-1 items-center gap-2"><AgenteAvatar color={color} size={32} /><span className="font-semibold text-[color:var(--w-text)]">{nombre}</span></span>
      <div className="w-40"><Input label="Mensual (USD)" inputMode="numeric" value={v} onChange={e => setV(e.target.value)} error={valido ? undefined : 'Número mayor o igual a 0'} /></div>
      <Button size="sm" variant="secondary" disabled={!valido || num === valor} loading={ocupado} onClick={() => void ejecutar(() => actualizarAgente(id, { presupuesto_mensual: num }))}>Guardar</Button>
      <ErrorAccion texto={error} />
    </li>
  )
}

export function Presupuestos() {
  const { datos } = useCentral()
  const { depto } = useIndices()
  const mes = new Date().toISOString().slice(0, 7)
  const consumoMes = datos.consumo.filter(c => c.periodo.startsWith(mes))
  const gastado = consumoMes.reduce((s, c) => s + Number(c.costo), 0)
  const tokens = consumoMes.reduce((s, c) => s + Number(c.tokens), 0)
  const total = datos.agentes.reduce((s, a) => s + Number(a.presupuesto_mensual), 0)
  return (
    <Pagina titulo="Presupuestos" subtitulo="Límite mensual por agente y consumo de modelos de IA">
      <AvisoHonesto>Los modelos de IA cobran en dólares (USD). El consumo lo registra el servidor (no esta pantalla) cada vez que un agente responde; con la IA apagada es cero. El tope general se fija en Integraciones.</AvisoHonesto>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi etiqueta="Presupuesto mensual total" valor={usd(total)} detalle={`${datos.agentes.filter(a => Number(a.presupuesto_mensual) > 0).length} agentes con presupuesto`} icono="dinero" />
        <Kpi etiqueta="Consumo del mes" valor={usd(gastado)} detalle={`${tokens.toLocaleString('es-CO')} tokens`} icono="mundo" />
        <Kpi etiqueta="Disponible" valor={usd(Math.max(0, total - gastado))} detalle={total ? `${Math.round((gastado / total) * 100)}% usado` : 'Sin presupuesto asignado'} icono="escudo" />
      </div>
      <Card className="flex flex-col gap-3">
        <TituloBloque>Presupuesto por agente</TituloBloque>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">{datos.agentes.map(a => <FilaPresupuesto key={`${a.id}-${a.presupuesto_mensual}`} id={a.id} nombre={a.nombre} color={depto(a.departamento_id)?.color ?? '#9CA3AF'} valor={Number(a.presupuesto_mensual)} />)}</ul>
      </Card>
    </Pagina>
  )
}

function Opcion({ clave, titulo, ayuda, opciones }: { clave: string; titulo: string; ayuda?: string; opciones: [string, string][] }) {
  const { datos } = useCentral()
  const { ocupado, error, ejecutar } = useAccion()
  const actual = typeof datos.config[clave] === 'string' ? (datos.config[clave] as string) : opciones[0][0]
  return (
    <div className="flex flex-col gap-1">
      <Select label={titulo} hint={ayuda} value={actual} disabled={ocupado} onChange={e => void ejecutar(() => guardarConfig(clave, e.target.value))}>
        {opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </Select>
      <ErrorAccion texto={error} />
    </div>
  )
}

function Interruptor({ clave, titulo, ayuda, porDefecto }: { clave: string; titulo: string; ayuda?: string; porDefecto: boolean }) {
  const { datos } = useCentral()
  const { ocupado, error, ejecutar } = useAccion()
  const actual = typeof datos.config[clave] === 'boolean' ? (datos.config[clave] as boolean) : porDefecto
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3"><Toggle checked={actual} disabled={ocupado} onChange={v => void ejecutar(() => guardarConfig(clave, v))} label={titulo} /><span className="text-[color:var(--w-text)]">{titulo}</span></div>
      {ayuda && <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{ayuda}</p>}
      <ErrorAccion texto={error} />
    </div>
  )
}

export function Configuracion() {
  return (
    <Pagina titulo="Configuración" subtitulo="Cómo se ve y se comporta Central">
      <Card className="flex flex-col gap-4">
        <TituloBloque>Oficina</TituloBloque>
        <Opcion clave="modo_oficina" titulo="Vista de la oficina" ayuda="Si tu equipo no puede mostrar 3D, Central cambia sola al plano 2D." opciones={[['3d', 'Oficina en 3D'], ['2d', 'Plano 2D']]} />
        <Opcion clave="iluminacion" titulo="Iluminación" opciones={[['auto', 'Automática (según la hora)'], ['dia', 'Día'], ['noche', 'Noche']]} />
        <Opcion clave="calidad_grafica" titulo="Calidad gráfica" ayuda="“Automática” baja sola la calidad en celulares y equipos modestos." opciones={[['auto', 'Automática'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja (más ligera)']]} />
      </Card>
      <Card className="flex flex-col gap-4">
        <TituloBloque>Avisos y sonido</TituloBloque>
        <Interruptor clave="notificaciones" titulo="Avisos dentro de Central" porDefecto ayuda="La campana y las aprobaciones pendientes." />
        <Interruptor clave="sonido" titulo="Sonido" porDefecto={false} ayuda="Efectos de sonido de la oficina." />
        <Opcion clave="idioma" titulo="Idioma" opciones={[['es', 'Español']]} />
      </Card>
      <Card className="flex flex-col gap-2">
        <TituloBloque>Voz</TituloBloque>
        <p className="m-0 text-[color:var(--w-text-2)]">Hablar con los agentes por voz está <b>pendiente de configuración</b>: necesita un proveedor de voz que todavía no está conectado.</p>
      </Card>
      <Card className="flex flex-col gap-2">
        <TituloBloque>Seguridad</TituloBloque>
        <p className="m-0 text-[color:var(--w-text-2)]">Central solo abre para el superadministrador con código de 2 pasos. El servidor lo comprueba en cada consulta y cada entrada queda en la auditoría. Esto no se puede cambiar desde esta pantalla.</p>
      </Card>
    </Pagina>
  )
}
