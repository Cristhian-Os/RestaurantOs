/**
 * Proveedores.tsx — lista simple y editable de proveedores del restaurante:
 * nombre, teléfono y qué producto provee. La ven caja y admin; solo el admin la edita
 * (lo exige también la base de datos).
 */
import { useCallback, useEffect, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../services/supabaseClient'
import { VoiceButton } from '../VoiceButton'

interface Proveedor { id: string; nombre: string; telefono: string | null; email: string | null; producto: string | null; notas: string | null }
type Form = { nombre: string; telefono: string; email: string; producto: string; notas: string }

const EMPTY: Form = { nombre: '', telefono: '', email: '', producto: '', notas: '' }

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.875rem', borderRadius: '0.75rem',
  border: '1px solid var(--w-line)', background: 'var(--w-bg)', color: 'var(--w-ink)',
  fontSize: '0.9375rem', outline: 'none', fontFamily: 'var(--w-sans)',
}
const btn: React.CSSProperties = {
  border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)', fontWeight: 700, fontSize: '0.875rem',
  borderRadius: '0.75rem', padding: '0.65rem 1rem',
}

function Fields({ value, onChange }: { value: Form; onChange: (f: Form) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        <input style={input} value={value.nombre} maxLength={120} placeholder="Nombre *" aria-label="Nombre"
          onChange={e => onChange({ ...value, nombre: e.target.value })} />
        <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => onChange({ ...value, nombre: r.transcript.trim().replace(/.$/, '') })} />
      </div>
      <input style={input} value={value.telefono} maxLength={40} placeholder="Teléfono" aria-label="Teléfono"
        type="tel" inputMode="tel" onChange={e => onChange({ ...value, telefono: e.target.value })} />
      <input style={input} value={value.email} maxLength={120} placeholder="Correo" aria-label="Correo"
        type="email" inputMode="email" onChange={e => onChange({ ...value, email: e.target.value })} />
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        <input style={input} value={value.producto} maxLength={200} placeholder="Producto que provee" aria-label="Producto que provee"
          onChange={e => onChange({ ...value, producto: e.target.value })} />
        <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => onChange({ ...value, producto: r.transcript.trim().replace(/.$/, '') })} />
      </div>
      <div style={{ display: 'flex', gap: '0.375rem', gridColumn: '1 / -1' }}>
        <input style={input} value={value.notas} maxLength={500} placeholder="Notas (WhatsApp, persona de contacto, dirección, horario…)" aria-label="Notas"
          onChange={e => onChange({ ...value, notas: e.target.value })} />
        <VoiceButton<{ transcript: string }> kind="transcribe" onResult={r => onChange({ ...value, notas: r.transcript.trim().replace(/.$/, '') })} />
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
    setNuevo(EMPTY)
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: 'var(--w-sans)' }}>
      <div>
        <h2 className="ed-display" style={{ fontWeight: 600, fontSize: '1.875rem', margin: 0 }}>Proveedores</h2>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>A quién llamar y qué trae cada uno.{!canEdit && ' Solo el administrador puede editar la lista.'}</p>
      </div>

      {canEdit && <section style={{ background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1.25rem', padding: '1.125rem', boxShadow: 'var(--w-shadow-sm)' }}>
        <p className="ed-kicker" style={{ margin: '0 0 0.625rem' }}>Nuevo proveedor</p>
        <Fields value={nuevo} onChange={setNuevo} />
        <button onClick={agregar} disabled={saving} style={{ ...btn, marginTop: '0.75rem', background: 'var(--w-terra)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
          + Agregar proveedor
        </button>
      </section>}

      {loading ? (
        <p style={{ color: 'var(--w-ink-mut)' }}>Cargando…</p>
      ) : list.length === 0 ? (
        <p style={{ color: 'var(--w-ink-mut)', textAlign: 'center', padding: '2rem 0' }}>Aún no hay proveedores.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {list.map(p => (
            <div key={p.id} style={{ background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '1rem', padding: '0.875rem 1rem' }}>
              {editId === p.id ? (
                <>
                  <Fields value={edit} onChange={setEdit} />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
                    <button onClick={guardar} disabled={saving} style={{ ...btn, background: 'var(--w-terra)', color: '#fff' }}>Guardar</button>
                    <button onClick={() => setEditId(null)} style={{ ...btn, background: 'var(--w-bg)', color: 'var(--w-ink)', border: '1px solid var(--w-line)' }}>Cancelar</button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '12rem' }}>
                    <p style={{ margin: 0, fontWeight: 700, color: 'var(--w-ink)', fontSize: '1rem' }}>{p.nombre}</p>
                    <p style={{ margin: '0.125rem 0 0', fontSize: '0.875rem', color: 'var(--w-ink-mut)' }}>
                      {p.producto || 'Sin producto'}
                      {p.telefono && <> · <a href={`tel:${p.telefono.replace(/[^\d+]/g, '')}`} style={{ color: 'var(--w-terra)', fontWeight: 700, textDecoration: 'none' }}>{p.telefono}</a></>}
                    </p>
                    {p.email && (
                      <p style={{ margin: '0.125rem 0 0', fontSize: '0.875rem' }}>
                        <a href={`mailto:${p.email}`} style={{ color: 'var(--w-terra)', fontWeight: 700, textDecoration: 'none' }}>{p.email}</a>
                      </p>
                    )}
                    {p.notas && <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: 'var(--w-ink-mut)' }}>{p.notas}</p>}
                  </div>
                  {canEdit && <>
                  <button onClick={() => { setEditId(p.id); setEdit({ nombre: p.nombre, telefono: p.telefono ?? '', email: p.email ?? '', producto: p.producto ?? '', notas: p.notas ?? '' }) }}
                    style={{ ...btn, background: 'var(--w-bg)', color: 'var(--w-ink)', border: '1px solid var(--w-line)' }}>Editar</button>
                  <button onClick={() => eliminar(p)} style={{ ...btn, background: 'var(--w-wine)', color: '#fff' }}>Eliminar</button>
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
