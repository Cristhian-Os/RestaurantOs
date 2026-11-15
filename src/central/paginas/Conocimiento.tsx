/**
 * Conocimiento.tsx — Biblioteca (documentos con versiones) y Memoria institucional (4 capas).
 * Cada cambio guarda la versión anterior (la base lo hace sola). La memoria de un restaurante queda ligada a ESE restaurante
 * y se muestra con su nombre: nunca se mezcla con la de otro.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { StatePanel } from '../../components/ui/StatePanel'
import { Tabs } from '../../components/ui/Tabs'
import { guardarDocumento, guardarMemoria } from '../acciones.ts'
import { fechaHora, hace, type Documento, type Memoria as MemoriaT } from '../catalogo.ts'
import { useCentral, useIndices } from '../datos.tsx'
import { ErrorAccion, Pagina, useAccion } from '../ui.tsx'

const TONO_CONF: Record<string, Tone> = { alta: 'success', media: 'warning', baja: 'danger' }
const TIPOS_DOC = ['nota', 'politica', 'procedimiento', 'informe', 'acta', 'contrato', 'otro']
const CAPAS: Record<MemoriaT['capa'], string> = { operativa: 'Operativa', permanente: 'Permanente', institucional: 'Institucional', historica: 'Histórica' }
const CAPA_AYUDA: Record<MemoriaT['capa'], string> = {
  operativa: 'Lo que se está trabajando ahora; se renueva seguido.',
  permanente: 'Reglas y decisiones que no cambian cada semana.',
  institucional: 'Cómo está organizada la empresa y por qué.',
  historica: 'Lo que ya pasó y vale la pena recordar.',
}

function Versiones({ id, version }: { id: string; version: number }) {
  const [filas, setFilas] = useState<{ id: number; version: number; created_at: string; datos: { titulo?: string; contenido?: string } }[] | null>(null)
  useEffect(() => {
    let vivo = true
    supabase.from('central_versiones').select('id, version, created_at, datos').eq('registro_id', id).order('version', { ascending: false }).limit(20)
      .then(({ data }) => { if (vivo) setFilas((data ?? []) as never) }, () => { if (vivo) setFilas([]) })
    return () => { vivo = false }
  }, [id, version])
  if (!filas) return <StatePanel kind="loading" />
  if (!filas.length) return <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Esta es la primera versión: todavía no hay anteriores.</p>
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {filas.map(f => (
        <li key={f.id}><details className="rounded-[var(--w-r-md)] border border-[var(--w-border)] px-3 py-2">
          <summary className="min-h-[36px] cursor-pointer text-[color:var(--w-text)]">Versión {f.version} · {fechaHora(f.created_at)}</summary>
          <p className="m-0 mt-2 whitespace-pre-wrap text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{f.datos?.contenido || '(vacía)'}</p>
        </details></li>
      ))}
    </ul>
  )
}

function EditorDocumento({ doc, abierto, onCerrar }: { doc: Documento | null; abierto: boolean; onCerrar: () => void }) {
  const { datos } = useCentral()
  const { ocupado, error, ejecutar, limpiar } = useAccion()
  const [f, setF] = useState({ titulo: '', tipo: 'nota', contenido: '', depto: '', conf: 'media', proc: '' })
  useEffect(() => { if (abierto) setF(doc ? { titulo: doc.titulo, tipo: doc.tipo, contenido: doc.contenido, depto: doc.departamento_id ?? '', conf: doc.confiabilidad, proc: doc.procedencia } : { titulo: '', tipo: 'nota', contenido: '', depto: '', conf: 'media', proc: '' }) }, [abierto, doc])
  return (
    <Modal open={abierto} onClose={() => { limpiar(); onCerrar() }} title={doc ? `Editar documento (v${doc.version})` : 'Nuevo documento'}
      footer={<Button disabled={f.titulo.trim().length < 2} loading={ocupado} onClick={async () => { if (await ejecutar(() => guardarDocumento(doc?.id ?? null, { titulo: f.titulo, tipo: f.tipo, contenido: f.contenido, departamento_id: f.depto || null, confiabilidad: f.conf, procedencia: f.proc }))) onCerrar() }}>Guardar</Button>}>
      <div className="flex flex-col gap-3">
        <Input label="Título" value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} required maxLength={160} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Tipo" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{TIPOS_DOC.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}</Select>
          <Select label="Departamento" value={f.depto} onChange={e => setF({ ...f, depto: e.target.value })}><option value="">General</option>{datos.departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</Select>
          <Select label="Confiabilidad" value={f.conf} onChange={e => setF({ ...f, conf: e.target.value })}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></Select>
          <Input label="Procedencia" value={f.proc} onChange={e => setF({ ...f, proc: e.target.value })} maxLength={300} hint="De dónde sale esta información." />
        </div>
        <Textarea label="Contenido" value={f.contenido} onChange={e => setF({ ...f, contenido: e.target.value })} rows={8} maxLength={50000} />
        {doc && <div><p className="m-0 mb-1 font-semibold text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">Versiones anteriores</p><Versiones id={doc.id} version={doc.version} /></div>}
        <ErrorAccion texto={error} />
      </div>
    </Modal>
  )
}

export function Biblioteca() {
  const { datos } = useCentral()
  const { depto } = useIndices()
  const [q, setQ] = useState(''); const [sel, setSel] = useState<Documento | null>(null); const [abierto, setAbierto] = useState(false)
  const lista = datos.documentos.filter(d => !q || `${d.titulo} ${d.contenido}`.toLowerCase().includes(q.toLowerCase()))
  const abrir = (d: Documento | null) => { setSel(d); setAbierto(true) }
  return (
    <Pagina titulo="Biblioteca" subtitulo="Políticas, procedimientos, informes y actas de Central" acciones={<Button onClick={() => abrir(null)}>Nuevo documento</Button>}>
      <div className="max-w-md"><Input label="Buscar" value={q} onChange={e => setQ(e.target.value)} placeholder="Título o contenido…" /></div>
      {lista.length === 0 ? <StatePanel kind="empty" title={datos.documentos.length ? 'Nada coincide con tu búsqueda' : 'La biblioteca está vacía'} text={datos.documentos.length ? undefined : 'Guarda aquí lo que los agentes y tú necesiten recordar.'} /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map(d => (
            <button key={d.id} type="button" onClick={() => abrir(d)} className="flex min-h-[44px] flex-col gap-2 rounded-[var(--w-r-lg)] border border-[var(--w-border)] bg-[var(--w-surface)] p-4 text-left hover:border-[var(--w-border-strong)]">
              <span className="font-bold text-[color:var(--w-text)]">{d.titulo}</span>
              <span className="line-clamp-2 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{d.contenido || 'Sin contenido'}</span>
              <span className="mt-auto flex flex-wrap items-center gap-2"><Badge tone="neutral">{d.tipo}</Badge><Badge tone={TONO_CONF[d.confiabilidad]}>{d.confiabilidad}</Badge><span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">v{d.version} · {depto(d.departamento_id)?.nombre ?? 'General'} · {hace(d.updated_at)}</span></span>
            </button>
          ))}
        </div>
      )}
      <EditorDocumento doc={sel ? datos.documentos.find(d => d.id === sel.id) ?? sel : null} abierto={abierto} onCerrar={() => setAbierto(false)} />
    </Pagina>
  )
}

function EditorMemoria({ m, capaInicial, abierto, onCerrar }: { m: MemoriaT | null; capaInicial: MemoriaT['capa']; abierto: boolean; onCerrar: () => void }) {
  const { datos } = useCentral()
  const { ocupado, error, ejecutar, limpiar } = useAccion()
  const [f, setF] = useState({ capa: capaInicial as string, titulo: '', contenido: '', depto: '', rest: '', conf: 'media', proc: '' })
  useEffect(() => { if (abierto) setF(m ? { capa: m.capa, titulo: m.titulo, contenido: m.contenido, depto: m.departamento_id ?? '', rest: m.restaurante_id ?? '', conf: m.confiabilidad, proc: m.procedencia } : { capa: capaInicial, titulo: '', contenido: '', depto: '', rest: '', conf: 'media', proc: '' }) }, [abierto, m, capaInicial])
  return (
    <Modal open={abierto} onClose={() => { limpiar(); onCerrar() }} title={m ? `Editar recuerdo (v${m.version})` : 'Nuevo recuerdo'}
      footer={<Button disabled={f.titulo.trim().length < 2} loading={ocupado} onClick={async () => { if (await ejecutar(() => guardarMemoria(m?.id ?? null, { capa: f.capa, titulo: f.titulo, contenido: f.contenido, departamento_id: f.depto || null, restaurante_id: f.rest || null, confiabilidad: f.conf, procedencia: f.proc }))) onCerrar() }}>Guardar</Button>}>
      <div className="flex flex-col gap-3">
        <Input label="Título" value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} required maxLength={160} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Capa" value={f.capa} onChange={e => setF({ ...f, capa: e.target.value })}>{(Object.keys(CAPAS) as MemoriaT['capa'][]).map(c => <option key={c} value={c}>{CAPAS[c]}</option>)}</Select>
          <Select label="Confiabilidad" value={f.conf} onChange={e => setF({ ...f, conf: e.target.value })}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></Select>
          <Select label="Departamento" value={f.depto} onChange={e => setF({ ...f, depto: e.target.value })}><option value="">General</option>{datos.departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</Select>
          <Select label="Restaurante" value={f.rest} onChange={e => setF({ ...f, rest: e.target.value })} hint="Si es de un restaurante, queda solo con él."><option value="">Ninguno (de toda la empresa)</option>{datos.restaurantes.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</Select>
        </div>
        <Input label="Procedencia" value={f.proc} onChange={e => setF({ ...f, proc: e.target.value })} maxLength={300} />
        <Textarea label="Contenido" value={f.contenido} onChange={e => setF({ ...f, contenido: e.target.value })} rows={7} maxLength={20000} />
        {m && <div><p className="m-0 mb-1 font-semibold text-[length:var(--w-fs-label)] text-[color:var(--w-text)]">Versiones anteriores</p><Versiones id={m.id} version={m.version} /></div>}
        <ErrorAccion texto={error} />
      </div>
    </Modal>
  )
}

export function Memoria() {
  const { datos } = useCentral()
  const [capa, setCapa] = useState<MemoriaT['capa']>('institucional')
  const [sel, setSel] = useState<MemoriaT | null>(null); const [abierto, setAbierto] = useState(false)
  const lista = datos.memoria.filter(m => m.capa === capa)
  const abrir = (m: MemoriaT | null) => { setSel(m); setAbierto(true) }
  return (
    <Pagina titulo="Memoria institucional" subtitulo="Lo que Central recuerda, en cuatro capas" acciones={<Button onClick={() => abrir(null)}>Nuevo recuerdo</Button>}>
      <Tabs label="Capas de la memoria" value={capa} onChange={setCapa} items={(Object.keys(CAPAS) as MemoriaT['capa'][]).map(c => ({ key: c, label: `${CAPAS[c]} (${datos.memoria.filter(m => m.capa === c).length})` }))} />
      <p className="m-0 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{CAPA_AYUDA[capa]}</p>
      {lista.length === 0 ? <StatePanel kind="empty" title="Esta capa está vacía" /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {lista.map(m => {
            const r = datos.restaurantes.find(x => x.id === m.restaurante_id)
            return (
              <Card key={m.id} className="flex flex-col gap-2">
                <button type="button" onClick={() => abrir(m)} className="flex min-h-[44px] flex-col gap-1 text-left">
                  <span className="font-bold text-[color:var(--w-text)]">{m.titulo}</span>
                  <span className="line-clamp-4 whitespace-pre-wrap text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">{m.contenido}</span>
                </button>
                <span className="flex flex-wrap items-center gap-2"><Badge tone={TONO_CONF[m.confiabilidad]}>{m.confiabilidad}</Badge>{r && <Badge tone="accent">Solo {r.nombre}</Badge>}<span className="text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">v{m.version} · {m.procedencia || 'Sin procedencia'} · {hace(m.updated_at)}</span></span>
              </Card>
            )
          })}
        </div>
      )}
      <EditorMemoria m={sel ? datos.memoria.find(x => x.id === sel.id) ?? sel : null} capaInicial={capa} abierto={abierto} onCerrar={() => setAbierto(false)} />
    </Pagina>
  )
}
