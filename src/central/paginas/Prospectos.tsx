/**
 * Prospectos.tsx — Fase 2 del plan de crecimiento: lista de prospectos (CRM de 17 etapas), expediente comercial e historial.
 * Solo guarda y organiza información: no contacta a nadie. Las reglas (fuentes, campaña vigente, no contactar, ejemplos) las hace cumplir la base.
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { StatePanel } from '../../components/ui/StatePanel'
import { supabase } from '../../services/supabaseClient'
import { actualizarProspecto, agregarNota, cargarEjemplos, crearProspecto, crearTarea, ETAPAS, guardarExpediente, textoError, type Etapa } from '../acciones.ts'
import { leerLista } from '../importarLista.ts'
import { Enlace, useRuta } from '../navegacion.tsx'
import { AvisoHonesto, ErrorAccion, Kpi, Pagina, TituloBloque } from '../ui.tsx'

interface Prospecto {
  id: string; nombre_comercial: string; ciudad: string; segmento: string; fuente: string; fuente_url: string | null; correo: string | null; telefono: string | null; web: string | null
  etapa: Etapa; campana_id: string | null; necesidades_confirmadas: string; proxima_accion: string; proxima_accion_en: string | null; motivo_perdida: string | null; es_ficticio: boolean; created_at: string
}
interface Historial { id: number; created_at: string; tipo: string; de_etapa: string | null; a_etapa: string | null; detalle: string; actor_tipo: string }
interface Campana { id: string; nombre: string }

const ETQ = (e: string) => e.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const lineas = (v: unknown) => (Array.isArray(v) ? v.map(String).join('\n') : '')
const aLineas = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)
const texto = (v: unknown) => (typeof v === 'string' ? v : '')

function useHacer(despues: () => Promise<void>) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hacer = async (fn: () => Promise<string | null>) => {
    setOcupado(true); setError(null)
    const e = await fn()
    setOcupado(false); setError(e)
    if (!e) await despues()
    return e === null
  }
  return { ocupado, error, hacer }
}

/** Pegar una lista de negocios (por ejemplo de Google Maps): se lee el texto tal cual, sin IA, y se guardan como "prospecto identificado" con su fuente. */
function PegarLista({ alGuardar }: { alGuardar: () => Promise<void> }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [ciudad, setCiudad] = useState('Armenia')
  const [segmento, setSegmento] = useState('Restaurantes')
  const [ocupado, setOcupado] = useState(false)
  const [resumen, setResumen] = useState<string | null>(null)
  const { filas, descartadas } = leerLista(texto)
  const guardar = async () => {
    setOcupado(true); setResumen(null)
    const { data: camp } = await supabase.from('growth_autorizaciones').select('id').eq('tipo', 'campana').eq('estado', 'vigente').gt('vigente_hasta', new Date().toISOString()).limit(1)
    const campanaId = ((camp ?? [])[0] as { id: string } | undefined)?.id ?? null
    let ok = 0; const problemas: string[] = []
    for (const f of filas) {
      const e = await crearProspecto({ ...f, ciudad: ciudad.trim() || 'Armenia', segmento: segmento.trim(), fuente: 'Lista pegada por el dueño (Google Maps)', campana_id: campanaId })
      if (e === null) ok++; else problemas.push(`${f.nombre_comercial}: ${e}`)
    }
    setOcupado(false)
    setResumen(`Guardé ${ok} de ${filas.length}.${problemas.length ? ` No se guardaron: ${problemas.slice(0, 4).join(' · ')}${problemas.length > 4 ? '…' : ''}` : ''}`)
    if (ok > 0) { setTexto(''); await alGuardar() }
  }
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2"><p className="m-0 min-w-0 flex-1 font-bold text-[color:var(--w-text)]">Pegar una lista de negocios</p>
        <Button size="sm" variant={abierto ? 'ghost' : 'secondary'} onClick={() => setAbierto(!abierto)}>{abierto ? 'Cerrar' : 'Abrir'}</Button></div>
      {abierto && (<>
        <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">Una línea por negocio: <b>Nombre | dirección o barrio | enlace de Google Maps | teléfono</b>. Solo el nombre es obligatorio. Se lee el texto tal cual, sin IA, y cada negocio queda como "prospecto identificado" con su fuente. No se contacta a nadie.</p>
        <Textarea label="Tu lista" value={texto} onChange={e => setTexto(e.target.value)} rows={8} placeholder={'Pizzería Roma | Calle 14 #12-30, Centro | https://maps.app.goo.gl/...\nCafé del Parque | Parque Sucre'} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input label="Ciudad" value={ciudad} onChange={e => setCiudad(e.target.value)} maxLength={100} />
          <Input label="Tipo de negocio" value={segmento} onChange={e => setSegmento(e.target.value)} maxLength={100} />
        </div>
        {texto.trim() && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{filas.length} negocio(s) listos{descartadas.length ? ` · ${descartadas.length} descartada(s): ${descartadas.slice(0, 3).map(d => `${d.linea} (${d.motivo})`).join(' · ')}` : ''}</p>}
        {resumen && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">{resumen}</p>}
        <div><Button size="sm" loading={ocupado} disabled={filas.length === 0} onClick={() => void guardar()}>Guardar {filas.length || ''} prospecto(s)</Button></div>
      </>)}
    </Card>
  )
}

function Lista() {
  const [filas, setFilas] = useState<Prospecto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<string>('todas')
  const [nuevo, setNuevo] = useState(false)
  const [f, setF] = useState({ nombre: '', ciudad: 'Armenia', segmento: '', fuente: '', url: '', correo: '', telefono: '', web: '' })
  const recargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('growth_prospectos').select('*').order('created_at', { ascending: false })
    if (e) setError(textoError(e)); else { setError(null); setFilas((data ?? []) as Prospecto[]) }
  }, [])
  useEffect(() => { void recargar() }, [recargar])
  const { ocupado, error: errAccion, hacer } = useHacer(recargar)
  const campo = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }))
  const reales = filas?.filter(p => !p.es_ficticio) ?? []
  const visibles = (filas ?? []).filter(p => filtro === 'todas' || p.etapa === filtro)
  const conteo = (e: string) => (filas ?? []).filter(p => p.etapa === e).length
  return (
    <Pagina titulo="Prospectos" subtitulo="Restaurantes que podrían ser clientes, con su expediente y su historial.">
      <AvisoHonesto tono="warning">Aquí solo se organiza la información. Todavía no se contacta a nadie: para pasar a "Contactado" hace falta una campaña activa, y los ejemplos nunca se pueden contactar.</AvisoHonesto>
      <PegarLista alGuardar={recargar} />
      {error && <ErrorAccion texto={error} />}
      {!filas ? <StatePanel kind="loading" title="Cargando…" /> : (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi etiqueta="Prospectos reales" valor={reales.length} icono="agentes" />
          <Kpi etiqueta="De ejemplo" valor={filas.length - reales.length} icono="biblioteca" />
          <Kpi etiqueta="Investigados" valor={reales.filter(p => p.etapa !== 'prospecto_identificado').length} icono="memoria" />
          <Kpi etiqueta="Contactados" valor={reales.filter(p => ['contactado', 'conversacion_iniciada', 'calificado'].includes(p.etapa)).length} icono="enviar" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setNuevo(v => !v)}>{nuevo ? 'Cerrar' : 'Nuevo prospecto'}</Button>
          {filas.every(p => !p.es_ficticio) && <Button size="sm" variant="secondary" loading={ocupado} onClick={() => void hacer(cargarEjemplos)}>Cargar 3 ejemplos</Button>}
        </div>
        {nuevo && (
          <Card className="flex flex-col gap-2">
            <Input label="Nombre comercial" value={f.nombre} onChange={campo('nombre')} maxLength={160} required />
            <Input label="Ciudad" value={f.ciudad} onChange={campo('ciudad')} maxLength={100} />
            <Input label="Segmento (cafetería, pizzería…)" value={f.segmento} onChange={campo('segmento')} maxLength={100} />
            <Input label="¿De dónde salió? (fuente pública)" value={f.fuente} onChange={campo('fuente')} maxLength={300} required hint="Ej. Google Maps, Instagram del negocio, página web" />
            <Input label="Enlace de la fuente (opcional)" value={f.url} onChange={campo('url')} maxLength={500} />
            <Input label="Correo comercial público (opcional)" value={f.correo} onChange={campo('correo')} maxLength={200} />
            <Input label="Teléfono comercial público (opcional)" value={f.telefono} onChange={campo('telefono')} maxLength={40} />
            <Input label="Página web (opcional)" value={f.web} onChange={campo('web')} maxLength={300} />
            <ErrorAccion texto={errAccion} />
            <div><Button size="sm" loading={ocupado} disabled={f.nombre.trim().length < 2 || f.fuente.trim().length < 3}
              onClick={() => void hacer(() => crearProspecto({ nombre_comercial: f.nombre, ciudad: f.ciudad, segmento: f.segmento, fuente: f.fuente, fuente_url: f.url, correo: f.correo, telefono: f.telefono, web: f.web })).then(ok => ok && (setNuevo(false), setF(p => ({ ...p, nombre: '', segmento: '', fuente: '', url: '', correo: '', telefono: '', web: '' }))))}>Guardar prospecto</Button></div>
          </Card>
        )}
        <Select label="Filtrar por etapa" value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option value="todas">Todas ({filas.length})</option>
          {ETAPAS.filter(e => conteo(e) > 0).map(e => <option key={e} value={e}>{ETQ(e)} ({conteo(e)})</option>)}
        </Select>
        {visibles.length === 0 && <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">No hay prospectos todavía.</p>}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visibles.map(p => (
            <Enlace key={p.id} a="prospectos" id={p.id} className="no-underline">
              <Card className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2"><p className="m-0 min-w-0 flex-1 font-bold text-[color:var(--w-text)] [overflow-wrap:anywhere]">{p.nombre_comercial}</p>{p.es_ficticio && <Badge tone="warning">Ejemplo</Badge>}<Badge tone={p.etapa === 'no_contactar' || p.etapa === 'perdido' ? 'danger' : 'info'}>{ETQ(p.etapa)}</Badge></div>
                <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{p.ciudad || 'Sin ciudad'} · {p.segmento || 'Sin segmento'} · fuente: {p.fuente}</p>
              </Card>
            </Enlace>
          ))}
        </div>
      </>)}
    </Pagina>
  )
}

/** Paquete de llamada: arma, con lo que ya está guardado, lo que el fundador necesita para llamar. No marca ni envía nada. */
function PaqueteLlamada({ p, form, hacer, ocupado }: { p: Prospecto; form: Record<string, string>; hacer: (fn: () => Promise<string | null>) => Promise<boolean>; ocupado: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const ln = (t: string, v: string) => (v.trim() ? `${t}:\n${v.trim()}\n` : '')
  const paquete = [
    `LLAMADA A ${p.nombre_comercial} (${p.ciudad || 'sin ciudad'}${p.telefono ? ` · ${p.telefono}` : ''})`, `Etapa: ${ETQ(p.etapa)}`, '',
    ln('Resumen', form.resumen), ln('Frase de apertura', form.apertura), ln('Hechos verificados', form.hechos), ln('Posibles necesidades por validar', form.hipotesis),
    ln('Preguntas de diagnóstico', form.preguntas), ln('Guion', form.guion), ln('Objeciones previsibles', form.objeciones),
  ].filter(x => x !== '').join('\n')
  const completo = !!(form.resumen.trim() || form.guion.trim() || form.hechos.trim())
  return (
    <Card className="flex flex-col gap-2">
      <TituloBloque>Paquete de llamada</TituloBloque>
      {!completo ? <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Llena y guarda el expediente (resumen, guion o hechos) para armar el paquete.</p>
        : <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] p-3 font-[inherit] text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{paquete}</pre>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={!completo} onClick={() => { void navigator.clipboard?.writeText(paquete).then(() => setCopiado(true)).catch(() => setCopiado(false)) }}>{copiado ? 'Copiado' : 'Copiar'}</Button>
        <Button size="sm" variant="secondary" loading={ocupado} onClick={() => void hacer(() => crearTarea({ titulo: `Llamar a ${p.nombre_comercial}`.slice(0, 160), descripcion: paquete.slice(0, 3900), prioridad: 'P2', nivel_requerido: 'N0' }))}>Crear tarea para mí</Button>
      </div>
    </Card>
  )
}

function Detalle({ id }: { id: string }) {
  const [p, setP] = useState<Prospecto | null | undefined>(undefined)
  const [hist, setHist] = useState<Historial[]>([])
  const [campanas, setCampanas] = useState<Campana[]>([])
  const [exp, setExp] = useState<Record<string, Record<string, unknown>>>({ investigacion: {}, ventas: {}, fundador: {} })
  const recargar = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('growth_prospectos').select('*').eq('id', id).maybeSingle(),
      supabase.from('growth_historial').select('*').eq('prospecto_id', id).order('id', { ascending: false }).limit(50),
      supabase.from('growth_expedientes').select('*').eq('prospecto_id', id).maybeSingle(),
      supabase.from('growth_autorizaciones').select('id, nombre, estado, vigente_hasta').eq('tipo', 'campana').eq('estado', 'vigente'),
    ])
    setP((a.data as Prospecto | null) ?? null); setHist((b.data ?? []) as Historial[])
    if (c.data) setExp({ investigacion: c.data.investigacion ?? {}, ventas: c.data.ventas ?? {}, fundador: c.data.fundador ?? {} })
    setCampanas(((d.data ?? []) as (Campana & { vigente_hasta: string })[]).filter(x => new Date(x.vigente_hasta) > new Date()))
  }, [id])
  useEffect(() => { void recargar() }, [recargar])
  const { ocupado, error, hacer } = useHacer(recargar)

  const [etapa, setEtapa] = useState<Etapa>('prospecto_identificado')
  const [motivo, setMotivo] = useState('')
  const [cuando, setCuando] = useState('')
  const [campana, setCampana] = useState('')
  const [nota, setNota] = useState('')
  const [form, setForm] = useState({ hechos: '', hipotesis: '', fuentes: '', confianza: 'media', faltantes: '', oportunidad: '', apertura: '', preguntas: '', mensaje: '', objeciones: '', resumen: '', guion: '' })
  useEffect(() => {
    if (!p) return
    setEtapa(p.etapa); setCampana(p.campana_id ?? '')
    const i = exp.investigacion, v = exp.ventas, fu = exp.fundador
    setForm({ hechos: lineas(i.hechos), hipotesis: lineas(i.hipotesis), fuentes: lineas(i.fuentes), confianza: texto(i.confianza) || 'media', faltantes: lineas(i.faltantes),
      oportunidad: texto(v.oportunidad), apertura: texto(v.frase_apertura), preguntas: lineas(v.preguntas), mensaje: texto(v.mensaje_inicial), objeciones: lineas(v.objeciones), resumen: texto(fu.resumen), guion: texto(fu.guion) })
  }, [p, exp])
  const campo = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(x => ({ ...x, [k]: e.target.value }))

  if (p === undefined) return <StatePanel kind="loading" title="Cargando…" />
  if (p === null) return <Pagina titulo="Prospecto no encontrado"><Enlace a="prospectos">← Volver a prospectos</Enlace></Pagina>

  const cambiarEtapa = () => hacer(() => actualizarProspecto(p.id, {
    etapa, ...(etapa === 'perdido' ? { motivo_perdida: motivo } : {}), ...(etapa === 'demostracion_confirmada' && cuando ? { proxima_accion_en: new Date(cuando).toISOString() } : {}),
    ...(etapa === 'contactado' ? { campana_id: campana || null } : {}),
  }))
  const guardar = () => hacer(() => guardarExpediente(p.id, {
    investigacion: { hechos: aLineas(form.hechos), hipotesis: aLineas(form.hipotesis), fuentes: aLineas(form.fuentes), confianza: form.confianza, faltantes: aLineas(form.faltantes) },
    ventas: { oportunidad: form.oportunidad, frase_apertura: form.apertura, preguntas: aLineas(form.preguntas), mensaje_inicial: form.mensaje, objeciones: aLineas(form.objeciones) },
    fundador: { resumen: form.resumen, guion: form.guion },
  }))
  return (
    <Pagina titulo={p.nombre_comercial} subtitulo={`${p.ciudad || 'Sin ciudad'} · ${p.segmento || 'Sin segmento'} · fuente: ${p.fuente}`} acciones={<Enlace a="prospectos">← Todos</Enlace>}>
      {p.es_ficticio && <AvisoHonesto tono="warning">Prospecto de ejemplo: sirve para practicar y nunca se puede contactar.</AvisoHonesto>}
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2"><TituloBloque>Etapa</TituloBloque><Badge tone="info">{ETQ(p.etapa)}</Badge></div>
        <p className="m-0 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{[p.correo, p.telefono, p.web].filter(Boolean).join(' · ') || 'Sin datos de contacto públicos'}</p>
        <Select label="Mover a" value={etapa} onChange={e => setEtapa(e.target.value as Etapa)}>{ETAPAS.map(e => <option key={e} value={e}>{ETQ(e)}</option>)}</Select>
        {etapa === 'perdido' && <Input label="Motivo de pérdida" value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} />}
        {etapa === 'demostracion_confirmada' && <Input label="Fecha y hora que el prospecto aceptó" type="datetime-local" value={cuando} onChange={e => setCuando(e.target.value)} />}
        {etapa === 'contactado' && (
          <Select label="Campaña vigente" value={campana} onChange={e => setCampana(e.target.value)}>
            <option value="">— elige —</option>{campanas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
        )}
        <ErrorAccion texto={error} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={ocupado} disabled={etapa === p.etapa} onClick={() => void cambiarEtapa()}>Cambiar etapa</Button>
          <Button size="sm" variant="secondary" loading={ocupado} onClick={() => void hacer(() => crearTarea({ titulo: `Mateo: avanzar con ${p.nombre_comercial}`.slice(0, 160), descripcion: `Prospecto en etapa ${ETQ(p.etapa)}. Revisar su expediente en Prospectos.`, prioridad: 'P2', nivel_requerido: 'N0', responsable_agente_id: 'mateo', departamento_id: 'ventas' }))}>Crear tarea para Mateo</Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <TituloBloque>Expediente comercial</TituloBloque>
        <AvisoHonesto>Separa lo que sabes (hechos, con fuente) de lo que supones. Nunca atribuyas un problema al restaurante sin confirmarlo: escríbelo como "posible necesidad por validar".</AvisoHonesto>
        <Textarea label="Hechos verificados (uno por línea)" value={form.hechos} onChange={campo('hechos')} rows={3} />
        <Textarea label="Hipótesis: posibles necesidades por validar (una por línea)" value={form.hipotesis} onChange={campo('hipotesis')} rows={3} />
        <Textarea label="Fuentes con fecha (una por línea, mínimo una)" value={form.fuentes} onChange={campo('fuentes')} rows={2} hint="Ej. instagram.com/negocio — 19 nov 2026" />
        <Select label="Confianza de la investigación" value={form.confianza} onChange={campo('confianza')}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></Select>
        <Textarea label="Datos que faltan (uno por línea)" value={form.faltantes} onChange={campo('faltantes')} rows={2} />
        <Textarea label="Ventas: oportunidad y por qué" value={form.oportunidad} onChange={campo('oportunidad')} rows={2} />
        <Textarea label="Frase de apertura basada en un dato real" value={form.apertura} onChange={campo('apertura')} rows={2} />
        <Textarea label="Preguntas de diagnóstico (una por línea)" value={form.preguntas} onChange={campo('preguntas')} rows={3} />
        <Textarea label="Mensaje inicial (borrador, no se envía solo)" value={form.mensaje} onChange={campo('mensaje')} rows={3} />
        <Textarea label="Objeciones previsibles (una por línea)" value={form.objeciones} onChange={campo('objeciones')} rows={2} />
        <Textarea label="Para el fundador: resumen" value={form.resumen} onChange={campo('resumen')} rows={2} />
        <Textarea label="Para el fundador: guion de llamada" value={form.guion} onChange={campo('guion')} rows={3} />
        <div><Button size="sm" loading={ocupado} onClick={() => void guardar()}>Guardar expediente</Button></div>
      </Card>

      <PaqueteLlamada p={p} form={form} hacer={hacer} ocupado={ocupado} />

      <Card className="flex flex-col gap-2">
        <TituloBloque>Historial</TituloBloque>
        <Textarea label="Agregar nota" value={nota} onChange={e => setNota(e.target.value)} rows={2} maxLength={2000} />
        <div><Button size="sm" variant="secondary" loading={ocupado} disabled={nota.trim().length < 2} onClick={() => void hacer(() => agregarNota(p.id, nota)).then(ok => ok && setNota(''))}>Guardar nota</Button></div>
        {hist.map(h => (
          <p key={h.id} className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
            <span className="text-[color:var(--w-text-3)]">{fecha(h.created_at)} · {h.actor_tipo}</span><br />
            {h.tipo === 'etapa' ? `${ETQ(h.de_etapa ?? '')} → ${ETQ(h.a_etapa ?? '')}` : h.detalle}
          </p>
        ))}
      </Card>
    </Pagina>
  )
}

export function Prospectos() {
  const { ruta } = useRuta()
  return ruta.id ? <Detalle id={ruta.id} /> : <Lista />
}
