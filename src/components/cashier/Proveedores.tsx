/**
 * Proveedores.tsx — lista simple y editable de proveedores del restaurante:
 * nombre, teléfono y qué producto provee. La ven caja y admin; solo el admin la edita
 * (lo exige también la base de datos).
 */
import { Button } from '../ui/Button'
import { ModuleHeader, StatCard } from '../tasks/ModuleHeader'
import { useCallback, useEffect, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { VoiceButton } from '../VoiceButton'
import { limpiarTranscripcion } from '../../services/voiceText'

interface Proveedor { id: string; nombre: string; telefono: string | null; email: string | null; producto: string | null; notas: string | null }
type Form = { nombre: string; telefono: string; email: string; producto: string; notas: string }

const EMPTY: Form = { nombre: '', telefono: '', email: '', producto: '', notas: '' }

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.875rem', borderRadius: '0.75rem',
  border: '1px solid var(--w-border)', background: 'var(--w-bg)', color: 'var(--w-text)',
  fontSize: '0.9375rem', outline: 'none', fontFamily: 'var(--w-font)',
}
const btn: React.CSSProperties = {
  border: 'none', cursor: 'pointer', fontFamily: 'var(--w-font)', fontWeight: 700, fontSize: '0.875rem',
  borderRadius: '0.75rem', padding: '0.65rem 1rem',
}

function Fields({ value, onChange }: { value: Form; onChange: (f: Form) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        <input style={input} value={value.nombre} maxLength={120} placeholder="Nombre *" aria-label="Nombre"
          onChange={e => onChange({ ...value, nombre: e.target.value })} />
        <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => onChange({ ...value, nombre: limpiarTranscripcion(r.transcript) })} />
      </div>
      <input style={input} value={value.telefono} maxLength={40} placeholder="Teléfono" aria-label="Teléfono"
        type="tel" inputMode="tel" onChange={e => onChange({ ...value, telefono: e.target.value })} />
      <input style={input} value={value.email} maxLength={120} placeholder="Correo" aria-label="Correo"
        type="email" inputMode="email" onChange={e => onChange({ ...value, email: e.target.value })} />
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        <input style={input} value={value.producto} maxLength={200} placeholder="Producto que provee" aria-label="Producto que provee"
          onChange={e => onChange({ ...value, producto: e.target.value })} />
        <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => onChange({ ...value, producto: limpiarTranscripcion(r.transcript) })} />
      </div>
      <div style={{ display: 'flex', gap: '0.375rem', gridColumn: '1 / -1' }}>
        <input style={input} value={value.notas} maxLength={500} placeholder="Notas (WhatsApp, persona de contacto, dirección, horario…)" aria-label="Notas"
          onChange={e => onChange({ ...value, notas: e.target.value })} />
        <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => onChange({ ...value, notas: limpiarTranscripcion(r.transcript) })} />
      </div>
    </div>
  )
}

const toRow = (f: Form) => ({
  nombre: f.nombre.trim(), telefono: f.telefono.trim() || null, email: f.email.trim() || null,
  producto: f.producto.trim() || null, notas: f.notas.trim() || null,
})

export function Proveedores({ canEdit }: { canEdit: boolean }) {
  const [list, setList]       = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevo, setNuevo]     = useState<Form>(EMPTY)
  const [editId, setEditId]   = useState<string | null>(null)
  const [edit, setEdit]       = useState<Form>(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [abierto, setAbierto] = useState(false)

  const fetchList = useCallback(async () => {
    const { data, error } = await supabase.from('proveedores').select('id, nombre, telefono, email, producto, notas').order('nombre')
    if (error) message.error('Error: ' + error.message)
    setList(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  const agregar = async () => {
    if (!nuevo.nombre.trim()) { message.error('Escribe el nombre del proveedor'); return }
    setSaving(true)
    const { error } = await supabase.from('proveedores').insert(toRow(nuevo))
    setSaving(false)
    if (error) { message.error('Error: ' + error.message); return }
    setNuevo(EMPTY); setAbierto(false)
    message.success('Proveedor agregado')
    fetchList()
  }

  const guardar = async () => {
    if (!editId || !edit.nombre.trim()) { message.error('El nombre no puede quedar vacío'); return }
    setSaving(true)
    const { error } = await supabase.from('proveedores').update(toRow(edit)).eq('id', editId)
    setSaving(false)
    if (error) { message.error('Error: ' + error.message); return }
    setEditId(null)
    message.success('Proveedor actualizado')
    fetchList()
  }

  const eliminar = async (p: Proveedor) => {
    if (!window.confirm(`¿Eliminar a ${p.nombre} de la lista de proveedores?`)) return
    const { error } = await supabase.from('proveedores').delete().eq('id', p.id)
    if (error) { message.error('Error: ' + error.message); return }
    setList(prev => prev.filter(x => x.id !== p.id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: 'var(--w-font)' }}>
      <ModuleHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 4h14v12H1zM15 9h4l3 3v4h-7" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></svg>}
        title="Proveedores"
        subtitle={`A quién llamar y qué trae cada uno.${!canEdit ? ' Solo el administrador puede editar la lista.' : ''}`}
        actions={canEdit ? <Button onClick={() => setAbierto(v => !v)}>+ Nuevo proveedor</Button> : undefined}
      />

      <div style={{ maxWidth: '20rem' }}>
        <StatCard label="Proveedores" value={list.length} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6" /></svg>} />
      </div>

      {canEdit && abierto && <section style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: '1.25rem', padding: '1.125rem', boxShadow: 'var(--w-shadow-sm)' }}>
        <p style={{ margin: '0 0 0.625rem', fontWeight: 700, color: 'var(--w-text)' }}>Nuevo proveedor</p>
        <Fields value={nuevo} onChange={setNuevo} />
        <Button className="mt-3 w-full" onClick={agregar} loading={saving}>Guardar cambios ✓</Button>
      </section>}

      {loading ? (
        <p style={{ color: 'var(--w-text-3)' }}>Cargando…</p>
      ) : list.length === 0 ? (
        <p style={{ color: 'var(--w-text-3)', textAlign: 'center', padding: '2rem 0' }}>Aún no hay proveedores.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '0.75rem' }}>
          {list.map(p => (
            <div key={p.id} style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: '1rem', padding: '0.875rem 1rem' }}>
              {editId === p.id ? (
                <>
                  <Fields value={edit} onChange={setEdit} />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
                    <button onClick={guardar} disabled={saving} style={{ ...btn, background: 'var(--w-accent)', color: 'var(--w-on-accent)' }}>Guardar</button>
                    <button onClick={() => setEditId(null)} style={{ ...btn, background: 'var(--w-bg)', color: 'var(--w-text)', border: '1px solid var(--w-border)' }}>Cancelar</button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span aria-hidden style={{ width: '2.75rem', height: '2.75rem', borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 700, background: 'var(--w-accent-soft)', color: 'var(--w-accent-text)' }}>
                    {p.nombre.trim().slice(0, 2).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: '9rem' }}>
                    <p style={{ margin: 0, fontWeight: 700, color: 'var(--w-text)', fontSize: '1rem' }}>{p.nombre}</p>
                    <p style={{ margin: '0.125rem 0 0', fontSize: '0.875rem', color: 'var(--w-text-3)' }}>
                      {p.producto || 'Sin producto'}
                      {p.telefono && <> · <a href={`tel:${p.telefono.replace(/[^\d+]/g, '')}`} style={{ color: 'var(--w-accent)', fontWeight: 700, textDecoration: 'none' }}>{p.telefono}</a></>}
                    </p>
                    {p.email && (
                      <p style={{ margin: '0.125rem 0 0', fontSize: '0.875rem' }}>
                        <a href={`mailto:${p.email}`} style={{ color: 'var(--w-accent)', fontWeight: 700, textDecoration: 'none' }}>{p.email}</a>
                      </p>
                    )}
                    {p.notas && <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: 'var(--w-text-3)' }}>{p.notas}</p>}
                  </div>
                  {canEdit && <>
                  <button onClick={() => { setEditId(p.id); setEdit({ nombre: p.nombre, telefono: p.telefono ?? '', email: p.email ?? '', producto: p.producto ?? '', notas: p.notas ?? '' }) }}
                    style={{ ...btn, background: 'var(--w-bg)', color: 'var(--w-text)', border: '1px solid var(--w-border)' }}>Editar</button>
                  <button onClick={() => eliminar(p)} style={{ ...btn, background: 'var(--w-danger)', color: 'var(--w-on-accent)' }}>Eliminar</button>
                  </>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
