/**
 * TeamManager.tsx v3
 * - Foto de perfil por empleado (Supabase Storage)
 * - Campo email de recuperación
 * - Creación funcional via admin RPC
 * - Editar perfil propio del admin (nombre, teléfono, email, contraseña)
 * - Hard delete (anonimizar) empleado
 * - Horario semanal (ScheduleCalendar)
 * - Tema claro/oscuro via CSS variables
 */
import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import { ScheduleCalendar } from './ScheduleCalendar'
import message from 'antd/es/message'

const S = {
  out:   { boxShadow: 'var(--shadow-out,   8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55))' },
  outSm: { boxShadow: 'var(--shadow-out-sm,4px 4px 10px rgba(130,142,170,0.5), -4px -4px 10px rgba(255,255,255,0.5))' },
  in:    { boxShadow: 'var(--shadow-in,    inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5))' },
  coral: { boxShadow: 'var(--shadow-coral, 8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45))' },
} as const

type Role = 'admin' | 'waiter' | 'kitchen' | 'cashier' | 'client'

interface Profile {
  id:          string
  email:       string | null
  full_name:   string | null
  role:        Role
  active:      boolean
  phone?:      string | null
  avatar_url?: string | null
  created_at:  string
}

const ROLE_CONFIG: Record<Role, { label: string; emoji: string; bg: string; txt: string }> = {
  admin:   { label: 'Administrador', emoji: '', bg: 'var(--tag-purple-bg)', txt: 'var(--tag-purple-text)' },
  waiter:  { label: 'Mesero',        emoji: '', bg: 'var(--tag-blue-bg)',   txt: 'var(--tag-blue-text)'  },
  kitchen: { label: 'Cocina',        emoji: '', bg: 'var(--tag-orange-bg)', txt: 'var(--tag-orange-text)'},
  cashier: { label: 'Caja',          emoji: '', bg: 'var(--tag-green-bg)',  txt: 'var(--tag-green-text)' },
  client:  { label: 'Cliente',       emoji: '', bg: 'var(--tag-gray-bg)',   txt: 'var(--tag-gray-text)'  },
}

interface NewEmployeeForm {
  email:          string
  recovery_email: string
  full_name:      string
  role:           Role
  password:       string
  phone:          string
}

const FORM_INITIAL: NewEmployeeForm = {
  email: '', recovery_email: '', full_name: '', role: 'waiter', password: '', phone: '',
}

const DELETED_NAME = '[Cuenta eliminada]'

async function uploadAvatar(profileId: string, file: File): Promise<string | null> {
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `avatars/${profileId}.${ext}`
  const { error } = await supabase.storage
    .from('restaurant-assets')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) { console.error('Avatar upload error:', error); return null }
  const { data: { publicUrl } } = supabase.storage
    .from('restaurant-assets').getPublicUrl(path)
  return publicUrl + `?v=${Date.now()}`
}

export const TeamManager = memo(() => {
  // ── theme vars ────────────────────────────────────────────────
  const bg     = 'var(--bg, #D8DAE4)'
  const bgSurf = 'var(--bg-surface, #CDD0DC)'
  const txt    = 'var(--text-primary, #2D3561)'
  const txtSec = 'var(--text-secondary, #5A617A)'
  const txtMut = 'var(--text-muted, #8B92AA)'
  const acc    = 'var(--accent, #FF5722)'

  // ── state ─────────────────────────────────────────────────────
  const [profiles,    setProfiles]  = useState<Profile[]>([])
  const [loading,     setLoading]   = useState(true)
  const [showForm,    setShowForm]  = useState(false)
  const [form,        setForm]      = useState<NewEmployeeForm>(FORM_INITIAL)
  const [creating,    setCreating]  = useState(false)
  const [formError,   setFormError] = useState<string | null>(null)
  const [editingId,   setEditingId] = useState<string | null>(null)
  const [editRole,    setEditRole]  = useState<Role>('waiter')
  const [search,      setSearch]    = useState('')
  const [avatarFile,  setAvatarFile]= useState<File | null>(null)
  const [avatarPreview, setPreview] = useState<string | null>(null)

  // Mi perfil modal
  const [showEditMe,    setShowEditMe]  = useState(false)
  const [myProfile,     setMyProfile]  = useState<Profile | null>(null)
  const [myForm,        setMyForm]     = useState({ full_name: '', phone: '', new_email: '', new_password: '' })
  const [savingMe,      setSavingMe]   = useState(false)
  const [meAvatarFile,  setMeAvatarFile] = useState<File | null>(null)
  const [meAvatarPreview, setMePreview]  = useState<string | null>(null)
  const avatarRef   = useRef<HTMLInputElement>(null)
  const meAvatarRef = useRef<HTMLInputElement>(null)

  // Hard delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [hardDeleting,    setHardDeleting]    = useState(false)

  // Schedule modal
  const [scheduleEmp, setScheduleEmp] = useState<{ id: string; name: string } | null>(null)

  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── data fetch ────────────────────────────────────────────────
  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, active, phone, avatar_url, created_at')
      .order('role').order('full_name')
    if (!error) setProfiles(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchProfiles()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          setMyProfile(data)
          setMyForm({ full_name: data.full_name ?? '', phone: data.phone ?? '', new_email: '', new_password: '' })
          if (data.avatar_url) setMePreview(data.avatar_url)
        }
      })
    })
  }, [fetchProfiles])

  // ── create employee ───────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    setFormError(null)
    if (!form.email.trim())       { setFormError('Email requerido'); return }
    if (!form.full_name.trim())   { setFormError('Nombre requerido'); return }
    if (form.password.length < 6) { setFormError('Contraseña mínimo 6 caracteres'); return }
    setCreating(true)
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_employee_profile', {
        p_email:          form.email.trim().toLowerCase(),
        p_full_name:      form.full_name.trim(),
        p_role:           form.role,
        p_password:       form.password.trim() || 'Temporal1234!',
        p_recovery_email: form.recovery_email.trim() || null,
        p_phone:          form.phone.trim() || null,
      })
      if (rpcError) throw new Error(rpcError.message)

      const profileId: string | null = rpcData?.profile_id ?? null
      message.success(`${form.full_name.trim()} agregado como ${ROLE_CONFIG[form.role].label}`)

      if (avatarFile && profileId) {
        const url = await uploadAvatar(profileId, avatarFile)
        if (url) await supabase.from('profiles').update({ avatar_url: url }).eq('id', profileId)
      }
      setForm(FORM_INITIAL); setAvatarFile(null); setPreview(null); setShowForm(false)
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
      fetchTimerRef.current = setTimeout(fetchProfiles, 800)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al crear empleado'
      setFormError(msg.includes('duplicate') ? 'Ya existe una cuenta con ese email' : msg)
    } finally { setCreating(false) }
  }, [form, avatarFile, fetchProfiles])

  // ── save own profile ──────────────────────────────────────────
  const handleSaveMe = useCallback(async () => {
    if (!myProfile) return
    setSavingMe(true)
    try {
      // 1. Actualizar datos del perfil
      let avatarUrl = myProfile.avatar_url
      if (meAvatarFile) avatarUrl = await uploadAvatar(myProfile.id, meAvatarFile)
      const { error: profErr } = await supabase.from('profiles').update({
        full_name: myForm.full_name.trim() || null,
        phone:     myForm.phone.trim() || null,
        avatar_url: avatarUrl,
      }).eq('id', myProfile.id)
      if (profErr) throw profErr

      // 2. Cambiar email si el campo está lleno
      if (myForm.new_email.trim()) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: myForm.new_email.trim() })
        if (emailErr) throw emailErr
        message.info('Email de acceso actualizado. Revisa tu bandeja de entrada para confirmar.')
      }
      // 3. Cambiar contraseña si el campo está lleno
      if (myForm.new_password.trim()) {
        if (myForm.new_password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')
        const { error: passErr } = await supabase.auth.updateUser({ password: myForm.new_password.trim() })
        if (passErr) throw passErr
        message.success('Contraseña actualizada')
      }

      message.success('Perfil actualizado')
      setShowEditMe(false)
      fetchProfiles()
    } catch (e) {
      message.error('Error al guardar: ' + (e instanceof Error ? e.message : ''))
    } finally { setSavingMe(false) }
  }, [myProfile, myForm, meAvatarFile, fetchProfiles])

  // ── change role ───────────────────────────────────────────────
  const handleChangeRole = useCallback(async (profileId: string, newRole: Role) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', profileId)
    if (error) { message.error('Error: ' + error.message); return }
    message.success('Rol actualizado')
    setEditingId(null)
    fetchProfiles()
  }, [fetchProfiles])

  // ── toggle active ─────────────────────────────────────────────
  const handleToggleActive = useCallback(async (profile: Profile) => {
    if (profile.role === 'admin') { message.warning('No se puede desactivar al admin'); return }
    const { error } = await supabase.from('profiles').update({ active: !profile.active }).eq('id', profile.id)
    if (error) { message.error('Error: ' + error.message); return }
    message.success(profile.active ? 'Empleado desactivado' : 'Empleado reactivado')
    fetchProfiles()
  }, [fetchProfiles])

  // ── hard delete (anonymize) ───────────────────────────────────
  const handleHardDelete = useCallback(async (profileId: string) => {
    setHardDeleting(true)
    try {
      // 1. Eliminar turnos del empleado
      await supabase.from('employee_schedules').delete().eq('employee_id', profileId)
      // 2. Anonimizar el perfil
      const { error } = await supabase.from('profiles').update({
        active:     false,
        full_name:  DELETED_NAME,
        phone:      null,
        avatar_url: null,
      }).eq('id', profileId)
      if (error) throw error
      message.success('Empleado eliminado del equipo')
      setConfirmDeleteId(null)
      fetchProfiles()
    } catch (e) {
      message.error('Error al eliminar: ' + (e instanceof Error ? e.message : ''))
    } finally { setHardDeleting(false) }
  }, [fetchProfiles])

  // ── avatar handlers ───────────────────────────────────────────
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>, forMe = false) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { message.error('La foto debe ser menor a 3MB'); return }
    const url = URL.createObjectURL(file)
    if (forMe) { setMeAvatarFile(file); setMePreview(url) }
    else       { setAvatarFile(file);   setPreview(url)   }
    e.target.value = ''
  }

  // ── filter (hide deleted accounts) ───────────────────────────
  const filtered = profiles.filter(p => {
    if (p.full_name === DELETED_NAME) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.role.includes(q)
  })

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: `4px solid ${acc}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '1.5rem', color: txt, margin: 0 }}>Equipo</h2>
          <p style={{ fontSize: '0.875rem', color: txtMut, marginTop: '0.125rem' }}>
            {profiles.filter(p => p.active && p.full_name !== DELETED_NAME).length} activos · {profiles.filter(p => p.full_name !== DELETED_NAME).length} total
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setShowEditMe(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, padding: '0.625rem 1rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', backgroundColor: bg, color: txtSec, fontFamily: 'inherit', ...S.outSm }}>
            {myProfile?.avatar_url
              ? <img src={myProfile.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
              : ''
            }
            Mi perfil
          </button>
          <motion.button whileTap={{ scale: 0.96 }}
            onClick={() => { setShowForm(true); setFormError(null) }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', fontWeight: 700, padding: '0.625rem 1rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', backgroundColor: acc, color: '#fff', fontFamily: 'inherit', ...S.coral }}>
            + Agregar
          </motion.button>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ borderRadius: '1rem', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: bg, ...S.in }}>
        <span style={{ color: txtMut }}></span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email o rol..."
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.875rem', color: txt, fontFamily: 'inherit' }} />
      </div>

      {/* ── New employee form ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
            <div className="glass-card no-hover" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontWeight: 700, color: txt, marginBottom: '1.25rem', margin: '0 0 1.25rem', fontFamily: 'DM Sans, sans-serif' }}>Nuevo empleado</h3>

              {/* Avatar upload */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                <div onClick={() => avatarRef.current?.click()}
                  style={{ width: 64, height: 64, borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', flexShrink: 0, backgroundColor: bgSurf, ...S.in }}>
                  {avatarPreview ? <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.5rem' }}></span>}
                </div>
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: txt }}>Foto de perfil</p>
                  <p style={{ fontSize: '0.75rem', color: txtMut }}>JPG/PNG · máx 3MB</p>
                  <button onClick={() => avatarRef.current?.click()} style={{ fontSize: '0.75rem', fontWeight: 700, color: acc, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Seleccionar foto</button>
                </div>
                <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleAvatarChange(e)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.875rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.375rem' }}>Nombre completo *</label>
                  <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                    placeholder="Ej: María García"
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: 'none', outline: 'none', fontSize: '0.875rem', color: txt, backgroundColor: bgSurf, fontFamily: 'inherit', ...S.in, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.375rem' }}>Email de acceso *</label>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="acceso@restaurante.com"
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: 'none', outline: 'none', fontSize: '0.875rem', color: txt, backgroundColor: bgSurf, fontFamily: 'inherit', ...S.in, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.375rem' }}>Contraseña *</label>
                  <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Mínimo 6 caracteres"
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: 'none', outline: 'none', fontSize: '0.875rem', color: txt, backgroundColor: bgSurf, fontFamily: 'inherit', ...S.in, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.375rem' }}>Email recuperación</label>
                  <input type="email" value={form.recovery_email} onChange={e => setForm(p => ({ ...p, recovery_email: e.target.value }))}
                    placeholder="personal@gmail.com"
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: 'none', outline: 'none', fontSize: '0.875rem', color: txt, backgroundColor: bgSurf, fontFamily: 'inherit', ...S.in, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.375rem' }}>Teléfono</label>
                  <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+57 300 000 0000"
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: 'none', outline: 'none', fontSize: '0.875rem', color: txt, backgroundColor: bgSurf, fontFamily: 'inherit', ...S.in, boxSizing: 'border-box' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.5rem' }}>Rol *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                    {(['waiter', 'kitchen', 'cashier', 'admin'] as Role[]).map(r => (
                      <button key={r} onClick={() => setForm(p => ({ ...p, role: r }))}
                        style={{ padding: '0.625rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8125rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', ...(form.role === r ? { backgroundColor: acc, color: '#fff', ...S.coral } : { backgroundColor: bg, color: txtSec, ...S.outSm }) }}>
                        {ROLE_CONFIG[r].emoji} {ROLE_CONFIG[r].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {formError && <p style={{ fontSize: '0.75rem', color: '#EF4444', fontWeight: 600, marginTop: '0.75rem' }}>{formError}</p>}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button onClick={() => { setShowForm(false); setForm(FORM_INITIAL); setFormError(null); setAvatarFile(null); setPreview(null) }}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.875rem', backgroundColor: bg, color: txtSec, ...S.out }}>
                  Cancelar
                </button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleCreate} disabled={creating}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.875rem', backgroundColor: acc, color: '#fff', opacity: creating ? 0.7 : 1, ...S.coral }}>
                  {creating ? 'Creando...' : 'Crear empleado'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Employee list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {filtered.length === 0 && (
          <div style={{ borderRadius: '1.5rem', padding: '3rem 1rem', textAlign: 'center', backgroundColor: bg, ...S.in }}>
            <p style={{ fontSize: '2.5rem', margin: '0 0 0.5rem' }}></p>
            <p style={{ fontWeight: 700, color: txt }}>Sin empleados</p>
          </div>
        )}
        {filtered.map(profile => {
          const roleCfg   = ROLE_CONFIG[profile.role]
          const isEditing = editingId === profile.id
          return (
            <motion.div key={profile.id} layout
              className="glass-card-sm no-hover"
              style={{ padding: '0.875rem 1rem', opacity: profile.active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Avatar */}
                <div style={{ width: 44, height: 44, borderRadius: '1rem', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', backgroundColor: bgSurf, ...S.in }}>
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} alt={profile.full_name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : roleCfg.emoji
                  }
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, color: txt, fontSize: '0.875rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {profile.full_name ?? 'Sin nombre'}
                    {!profile.active && <span style={{ marginLeft: '0.5rem', fontSize: '0.5625rem', backgroundColor: 'var(--tag-red-bg)', color: 'var(--tag-red-text)', fontWeight: 700, padding: '0.0625rem 0.3125rem', borderRadius: '9999px' }}>INACTIVO</span>}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: txtMut, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.email}</p>
                </div>
                {/* Role badge */}
                <span className="tag-sm shrink-0" style={{ backgroundColor: roleCfg.bg, color: roleCfg.txt }}>{roleCfg.label}</span>
                {/* Actions */}
                {profile.role !== 'admin' && (
                  <div style={{ display: 'flex', gap: '0.3125rem' }}>
                    {/* Edit role */}
                    <button onClick={() => { setEditingId(isEditing ? null : profile.id); setEditRole(profile.role) }}
                      style={{ padding: '0.375rem', borderRadius: '0.625rem', border: 'none', cursor: 'pointer', color: txtSec, backgroundColor: bg, fontSize: '0.875rem', ...S.outSm }}
                      title="Cambiar rol"></button>
                    {/* Toggle active */}
                    <button onClick={() => handleToggleActive(profile)}
                      style={{ padding: '0.375rem', borderRadius: '0.625rem', border: 'none', cursor: 'pointer', color: txtSec, backgroundColor: bg, fontSize: '0.875rem', ...S.outSm }}
                      title={profile.active ? 'Desactivar' : 'Activar'}>
                      {profile.active ? '' : ''}
                    </button>
                    {/* Schedule */}
                    <button onClick={() => setScheduleEmp({ id: profile.id, name: profile.full_name ?? 'Empleado' })}
                      style={{ padding: '0.375rem', borderRadius: '0.625rem', border: 'none', cursor: 'pointer', color: txtSec, backgroundColor: bg, fontSize: '0.875rem', ...S.outSm }}
                      title="Ver horario"></button>
                    {/* Delete */}
                    <button onClick={() => setConfirmDeleteId(profile.id)}
                      style={{ padding: '0.375rem', borderRadius: '0.625rem', border: 'none', cursor: 'pointer', color: '#EF4444', backgroundColor: bg, fontSize: '0.875rem', ...S.outSm }}
                      title="Eliminar empleado"></button>
                  </div>
                )}
              </div>

              {/* Role edit sub-panel */}
              <AnimatePresence>
                {isEditing && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                    style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${bgSurf}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.625rem' }}>
                      {(['waiter', 'kitchen', 'cashier', 'admin'] as Role[]).map(r => (
                        <button key={r} onClick={() => setEditRole(r)}
                          style={{ padding: '0.5rem', borderRadius: '0.625rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', ...(editRole === r ? { backgroundColor: acc, color: '#fff', ...S.coral } : { backgroundColor: bg, color: txtSec, ...S.outSm }) }}>
                          {ROLE_CONFIG[r].emoji} {ROLE_CONFIG[r].label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => setEditingId(null)}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', backgroundColor: bg, color: txtSec, ...S.out }}>
                        Cancelar
                      </button>
                      <button onClick={() => handleChangeRole(profile.id, editRole)}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', backgroundColor: acc, color: '#fff', ...S.coral }}>
                        Guardar
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      {/* ── My profile modal ── */}
      <AnimatePresence>
        {showEditMe && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowEditMe(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(45,53,97,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', fontFamily: 'Nunito, sans-serif' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 480, damping: 32 }}
              onClick={e => e.stopPropagation()}
              className="glass-modal"
              style={{ width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', borderRadius: '1.75rem', padding: '1.5rem' }}>
              <h3 style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, color: txt, fontSize: '1.125rem', margin: '0 0 1.25rem' }}>Mi perfil</h3>

              {/* Avatar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                <div onClick={() => meAvatarRef.current?.click()}
                  style={{ width: 72, height: 72, borderRadius: '1.25rem', overflow: 'hidden', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: bgSurf, ...S.in }}>
                  {meAvatarPreview ? <img src={meAvatarPreview} alt="me" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '2rem' }}></span>}
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: txt, fontSize: '0.9375rem', margin: 0 }}>{myProfile?.full_name ?? 'Admin'}</p>
                  <p style={{ fontSize: '0.75rem', color: txtMut, margin: '0.125rem 0 0.375rem' }}>{myProfile?.email}</p>
                  <button onClick={() => meAvatarRef.current?.click()} style={{ fontSize: '0.75rem', fontWeight: 700, color: acc, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Cambiar foto</button>
                </div>
                <input ref={meAvatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleAvatarChange(e, true)} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.375rem' }}>Nombre completo</label>
                  <input value={myForm.full_name} onChange={e => setMyForm(p => ({ ...p, full_name: e.target.value }))}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: 'none', outline: 'none', fontSize: '0.875rem', color: txt, backgroundColor: bgSurf, fontFamily: 'inherit', ...S.in, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.375rem' }}>Teléfono</label>
                  <input type="tel" value={myForm.phone} onChange={e => setMyForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+57 300 000 0000"
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: 'none', outline: 'none', fontSize: '0.875rem', color: txt, backgroundColor: bgSurf, fontFamily: 'inherit', ...S.in, boxSizing: 'border-box' }} />
                </div>

                {/* Separator */}
                <div style={{ borderTop: `1px solid ${bgSurf}`, paddingTop: '0.875rem' }}>
                  <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, margin: '0 0 0.75rem' }}>Cambiar credenciales (dejar en blanco para no cambiar)</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.375rem' }}>Nuevo email de acceso</label>
                      <input type="email" value={myForm.new_email} onChange={e => setMyForm(p => ({ ...p, new_email: e.target.value }))}
                        placeholder="nuevo@email.com"
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: 'none', outline: 'none', fontSize: '0.875rem', color: txt, backgroundColor: bgSurf, fontFamily: 'inherit', ...S.in, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: txtMut, marginBottom: '0.375rem' }}>Nueva contraseña</label>
                      <input type="password" value={myForm.new_password} onChange={e => setMyForm(p => ({ ...p, new_password: e.target.value }))}
                        placeholder="Mínimo 6 caracteres"
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: 'none', outline: 'none', fontSize: '0.875rem', color: txt, backgroundColor: bgSurf, fontFamily: 'inherit', ...S.in, boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button onClick={() => setShowEditMe(false)}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.875rem', backgroundColor: bg, color: txtSec, ...S.out }}>
                  Cancelar
                </button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleSaveMe} disabled={savingMe}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.875rem', backgroundColor: acc, color: '#fff', opacity: savingMe ? 0.7 : 1, ...S.coral }}>
                  {savingMe ? 'Guardando...' : 'Guardar'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Confirm delete modal ── */}
      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !hardDeleting && setConfirmDeleteId(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(45,53,97,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', fontFamily: 'Nunito, sans-serif' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 480, damping: 32 }}
              onClick={e => e.stopPropagation()}
              className="glass-modal"
              style={{ width: '100%', maxWidth: 340, borderRadius: '1.75rem', padding: '1.5rem', textAlign: 'center' }}>
              <p style={{ fontSize: '2.5rem', margin: '0 0 0.75rem' }}></p>
              <h3 style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, color: txt, fontSize: '1.0625rem', margin: '0 0 0.5rem' }}>¿Eliminar empleado?</h3>
              <p style={{ fontSize: '0.8125rem', color: txtSec, margin: '0 0 1.25rem', lineHeight: 1.5 }}>
                Se anonimizará su cuenta y se eliminarán sus turnos. Esta acción no se puede deshacer fácilmente.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => setConfirmDeleteId(null)} disabled={hardDeleting}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.875rem', backgroundColor: bg, color: txtSec, ...S.out }}>
                  Cancelar
                </button>
                <button onClick={() => handleHardDelete(confirmDeleteId)} disabled={hardDeleting}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '1rem', border: 'none', cursor: hardDeleting ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.875rem', backgroundColor: '#EF4444', color: '#fff', boxShadow: '8px 8px 16px rgba(239,68,68,0.3),-4px -4px 12px rgba(255,255,255,0.4)', opacity: hardDeleting ? 0.7 : 1 }}>
                  {hardDeleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Schedule calendar modal ── */}
      <AnimatePresence>
        {scheduleEmp && (
          <ScheduleCalendar
            employeeId={scheduleEmp.id}
            employeeName={scheduleEmp.name}
            onClose={() => setScheduleEmp(null)}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
})
TeamManager.displayName = 'TeamManager'
