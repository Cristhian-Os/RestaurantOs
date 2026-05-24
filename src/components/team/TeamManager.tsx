/**
 * TeamManager.tsx v2
 * - Foto de perfil por empleado (Supabase Storage)
 * - Campo email de recuperación
 * - Creación funcional via admin API (Edge Function)
 * - Editar perfil propio del admin
 */
import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'

const S = {
  neoOut:  { boxShadow: '8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55)' },
  neoOutSm:{ boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)' },
  neoIn:   { boxShadow: 'inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5)' },
  coral:   { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
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

const ROLE_CONFIG: Record<Role, { label: string; emoji: string; color: string }> = {
  admin:   { label: 'Administrador', emoji: '👑', color: 'bg-purple-100 text-purple-700' },
  waiter:  { label: 'Mesero',        emoji: '🛎️', color: 'bg-blue-100 text-blue-700'    },
  kitchen: { label: 'Cocina',        emoji: '👨‍🍳', color: 'bg-orange-100 text-orange-700'},
  cashier: { label: 'Caja',          emoji: '💰', color: 'bg-emerald-100 text-emerald-700'},
  client:  { label: 'Cliente',       emoji: '🧑', color: 'bg-gray-100 text-gray-600'    },
}

interface NewEmployeeForm {
  email:          string
  recovery_email: string   // Correo personal para recuperación
  full_name:      string
  role:           Role
  password:       string
  phone:          string
}

const FORM_INITIAL: NewEmployeeForm = {
  email: '', recovery_email: '', full_name: '', role: 'waiter', password: '', phone: '',
}

// ── Subir foto a Supabase Storage ─────────────────────────────
async function uploadAvatar(profileId: string, file: File): Promise<string | null> {
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `avatars/${profileId}.${ext}`
  const { error } = await supabase.storage
    .from('restaurant-assets')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) { console.error('Avatar upload error:', error); return null }
  const { data: { publicUrl } } = supabase.storage
    .from('restaurant-assets')
    .getPublicUrl(path)
  return publicUrl + `?v=${Date.now()}`
}

export const TeamManager = memo(() => {
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
  // Modal editar perfil propio
  const [showEditMe,  setShowEditMe]= useState(false)
  const [myProfile,   setMyProfile] = useState<Profile | null>(null)
  const [myForm,      setMyForm]    = useState({ full_name: '', phone: '' })
  const [savingMe,    setSavingMe]  = useState(false)
  const avatarRef = useRef<HTMLInputElement>(null)
  const meAvatarRef = useRef<HTMLInputElement>(null)
  const [meAvatarFile, setMeAvatarFile] = useState<File | null>(null)
  const [meAvatarPreview, setMePreview] = useState<string | null>(null)

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
    // Cargar perfil propio
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            setMyProfile(data)
            setMyForm({ full_name: data.full_name ?? '', phone: data.phone ?? '' })
            if (data.avatar_url) setMePreview(data.avatar_url)
          }
        })
    })
  }, [fetchProfiles])

  // ── Crear empleado ────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    setFormError(null)
    if (!form.email.trim())       { setFormError('Email requerido'); return }
    if (!form.full_name.trim())   { setFormError('Nombre requerido'); return }
    if (form.password.length < 6) { setFormError('Contraseña mínimo 6 caracteres'); return }

    setCreating(true)
    try {
      // Intento 1: RPC que crea el usuario en auth + profile en una transacción
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_employee_profile', {
        p_email:          form.email.trim().toLowerCase(),
        p_full_name:      form.full_name.trim(),
        p_role:           form.role,
        p_password:       form.password,
        p_recovery_email: form.recovery_email.trim() || null,
        p_phone:          form.phone.trim() || null,
      })

      let profileId: string | null = null

      if (rpcError) {
        // Fallback: insertar directo en profiles
        const { data: inserted, error: insErr } = await supabase
          .from('profiles')
          .insert({
            email:     form.email.trim().toLowerCase(),
            full_name: form.full_name.trim(),
            role:      form.role,
            phone:     form.phone.trim() || null,
            active:    true,
          })
          .select('id')
          .single()
        if (insErr) throw insErr
        profileId = inserted.id
        message.warning('Perfil creado. El empleado debe registrarse con su email.')
      } else {
        profileId = rpcData?.profile_id ?? null
        message.success(`✅ ${form.full_name} agregado como ${ROLE_CONFIG[form.role].label}`)
      }

      // Subir avatar si hay foto
      if (avatarFile && profileId) {
        const url = await uploadAvatar(profileId, avatarFile)
        if (url) {
          await supabase.from('profiles').update({ avatar_url: url }).eq('id', profileId)
        }
      }

      setForm(FORM_INITIAL)
      setAvatarFile(null)
      setPreview(null)
      setShowForm(false)
      setTimeout(fetchProfiles, 800)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al crear empleado'
      setFormError(msg.includes('duplicate') ? 'Ya existe una cuenta con ese email' : msg)
    } finally {
      setCreating(false)
    }
  }, [form, avatarFile, fetchProfiles])

  // ── Guardar mi perfil ─────────────────────────────────────
  const handleSaveMe = useCallback(async () => {
    if (!myProfile) return
    setSavingMe(true)
    try {
      let avatarUrl = myProfile.avatar_url
      if (meAvatarFile) {
        avatarUrl = await uploadAvatar(myProfile.id, meAvatarFile)
      }
      const { error } = await supabase.from('profiles').update({
        full_name:  myForm.full_name.trim() || null,
        phone:      myForm.phone.trim() || null,
        avatar_url: avatarUrl,
      }).eq('id', myProfile.id)
      if (error) throw error
      message.success('Perfil actualizado')
      setShowEditMe(false)
      fetchProfiles()
    } catch (e) {
      message.error('Error al guardar: ' + (e instanceof Error ? e.message : ''))
    } finally {
      setSavingMe(false)
    }
  }, [myProfile, myForm, meAvatarFile, fetchProfiles])

  const handleChangeRole = useCallback(async (profileId: string, newRole: Role) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', profileId)
    if (error) { message.error('Error: ' + error.message); return }
    message.success('Rol actualizado')
    setEditingId(null)
    fetchProfiles()
  }, [fetchProfiles])

  const handleToggleActive = useCallback(async (profile: Profile) => {
    if (profile.role === 'admin') { message.warning('No se puede desactivar al admin'); return }
    const { error } = await supabase.from('profiles').update({ active: !profile.active }).eq('id', profile.id)
    if (error) { message.error('Error: ' + error.message); return }
    message.success(profile.active ? 'Empleado desactivado' : 'Empleado reactivado')
    fetchProfiles()
  }, [fetchProfiles])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>, forMe = false) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { message.error('La foto debe ser menor a 3MB'); return }
    const url = URL.createObjectURL(file)
    if (forMe) { setMeAvatarFile(file); setMePreview(url) }
    else       { setAvatarFile(file);   setPreview(url) }
    e.target.value = ''
  }

  const filtered = profiles.filter(p => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.role.includes(q)
  })

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #FF5722', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>👥 Equipo</h2>
          <p className="text-sm mt-0.5" style={{ color: '#8B92AA' }}>{profiles.filter(p=>p.active).length} activos · {profiles.length} total</p>
        </div>
        <div className="flex gap-2">
          {/* Mi perfil */}
          <button onClick={() => setShowEditMe(true)}
            className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-2xl"
            style={{ backgroundColor: '#D8DAE4', color: '#5A617A', ...S.neoOutSm }}>
            {myProfile?.avatar_url
              ? <img src={myProfile.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
              : '👤'
            }
            Mi perfil
          </button>
          <motion.button whileTap={{ scale: 0.96 }}
            onClick={() => { setShowForm(true); setFormError(null) }}
            className="flex items-center gap-2 text-sm font-bold text-white bg-[#FF5722] px-4 py-2.5 rounded-2xl"
            style={S.coral}>
            + Agregar
          </motion.button>
        </div>
      </div>

      {/* Buscador */}
      <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#D8DAE4', ...S.neoIn }}>
        <span style={{ color: '#8B92AA' }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email o rol..."
          className="flex-1 bg-transparent text-sm outline-none placeholder-[#8B92AA]"
          style={{ color: '#2D3561' }} />
      </div>

      {/* Formulario nuevo empleado */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }}
            exit={{ opacity:0, height:0 }} transition={{ duration: 0.35 }} className="overflow-hidden">
            <div className="rounded-3xl p-6" style={{ backgroundColor: '#D8DAE4', ...S.neoOut }}>
              <h3 className="font-bold text-[#2D3561] mb-5">➕ Nuevo empleado</h3>

              {/* Avatar upload */}
              <div className="flex items-center gap-4 mb-5">
                <div onClick={() => avatarRef.current?.click()}
                  className="w-16 h-16 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden shrink-0"
                  style={{ backgroundColor: '#CDD0DC', ...S.neoIn }}>
                  {avatarPreview
                    ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                    : <span className="text-2xl">📷</span>
                  }
                </div>
                <div>
                  <p className="text-xs font-bold text-[#2D3561]">Foto de perfil</p>
                  <p className="text-xs mt-0.5" style={{ color: '#8B92AA' }}>JPG/PNG · máx 3MB</p>
                  <button onClick={() => avatarRef.current?.click()}
                    className="text-xs font-bold mt-1" style={{ color: '#FF5722', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Seleccionar foto
                  </button>
                </div>
                <input ref={avatarRef} type="file" accept="image/*" className="sr-only"
                  onChange={e => handleAvatarChange(e)} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Nombre completo *</label>
                  <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                    placeholder="Ej: María García"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Email de acceso *</label>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="acceso@restaurante.com"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Contraseña inicial *</label>
                  <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Email personal (recuperación)</label>
                  <input type="email" value={form.recovery_email} onChange={e => setForm(p => ({ ...p, recovery_email: e.target.value }))}
                    placeholder="personal@gmail.com"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                  <p className="text-[10px] mt-1" style={{ color: '#8B92AA' }}>Para recuperar contraseña de forma autónoma</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Teléfono</label>
                  <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+57 300 000 0000"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Rol *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['waiter','kitchen','cashier','admin'] as Role[]).map(r => (
                      <button key={r} onClick={() => setForm(p => ({ ...p, role: r }))}
                        className="py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                        style={form.role === r ? { background: '#FF5722', color: 'white', ...S.coral } : { backgroundColor: '#D8DAE4', color: '#5A617A', ...S.neoOutSm }}>
                        {ROLE_CONFIG[r].emoji} {ROLE_CONFIG[r].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {formError && <p className="text-xs text-red-500 font-medium mt-3">⚠️ {formError}</p>}

              <div className="flex gap-3 mt-5">
                <button onClick={() => { setShowForm(false); setForm(FORM_INITIAL); setFormError(null); setAvatarFile(null); setPreview(null) }}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold" style={{ backgroundColor: '#D8DAE4', color: '#5A617A', ...S.neoOut }}>
                  Cancelar
                </button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleCreate} disabled={creating}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#FF5722] ${creating ? 'opacity-70' : ''}`}
                  style={S.coral}>
                  {creating ? 'Creando...' : '✅ Crear empleado'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista de empleados */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="rounded-3xl p-12 text-center" style={{ backgroundColor: '#D8DAE4', ...S.neoIn }}>
            <p className="text-4xl mb-2">👥</p>
            <p className="font-bold text-[#2D3561]">Sin empleados</p>
          </div>
        )}
        {filtered.map(profile => {
          const roleCfg = ROLE_CONFIG[profile.role]
          const isEditing = editingId === profile.id
          return (
            <motion.div key={profile.id} layout
              className={`rounded-2xl p-4 ${!profile.active ? 'opacity-50' : ''}`}
              style={{ backgroundColor: '#D8DAE4', ...S.neoOut }}>
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="w-11 h-11 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center text-lg"
                  style={{ backgroundColor: '#CDD0DC', ...S.neoIn }}>
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} alt={profile.full_name ?? ''} className="w-full h-full object-cover" />
                    : roleCfg.emoji
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#2D3561] text-sm truncate">
                    {profile.full_name ?? 'Sin nombre'}
                    {!profile.active && <span className="ml-2 text-[10px] text-red-500 font-bold">INACTIVO</span>}
                  </p>
                  <p className="text-xs truncate" style={{ color: '#8B92AA' }}>{profile.email}</p>
                </div>
                <span className={`${roleCfg.color} text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0`}>
                  {roleCfg.label}
                </span>
                {profile.role !== 'admin' && (
                  <div className="flex gap-1.5">
                    <button onClick={() => { setEditingId(isEditing ? null : profile.id); setEditRole(profile.role) }}
                      className="p-2 rounded-xl" style={{ color: '#5A617A', ...S.neoOutSm }} title="Cambiar rol">
                      ✏️
                    </button>
                    <button onClick={() => handleToggleActive(profile)}
                      className="p-2 rounded-xl" style={{ color: '#5A617A', ...S.neoOutSm }}
                      title={profile.active ? 'Desactivar' : 'Activar'}>
                      {profile.active ? '🔒' : '🔓'}
                    </button>
                  </div>
                )}
              </div>
              <AnimatePresence>
                {isEditing && (
                  <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }}
                    exit={{ opacity:0, height:0 }} transition={{ duration: 0.25 }} className="mt-3 overflow-hidden">
                    <div className="grid grid-cols-2 gap-2">
                      {(['waiter','kitchen','cashier','admin'] as Role[]).map(r => (
                        <button key={r} onClick={() => setEditRole(r)}
                          className="py-2 rounded-xl text-xs font-bold"
                          style={editRole === r ? { background: '#FF5722', color: 'white', ...S.coral } : { backgroundColor: '#D8DAE4', color: '#5A617A', ...S.neoOutSm }}>
                          {ROLE_CONFIG[r].emoji} {ROLE_CONFIG[r].label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => setEditingId(null)} className="flex-1 py-2 rounded-xl text-xs font-bold"
                        style={{ backgroundColor: '#D8DAE4', color: '#5A617A', ...S.neoOut }}>Cancelar</button>
                      <button onClick={() => handleChangeRole(profile.id, editRole)}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-[#FF5722]" style={S.coral}>
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

      {/* Modal: editar mi perfil */}
      <AnimatePresence>
        {showEditMe && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={() => setShowEditMe(false)}
            style={{ position:'fixed', inset:0, zIndex:100, backgroundColor:'rgba(45,53,97,0.45)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
            <motion.div initial={{ scale:0.9, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.9, opacity:0 }}
              transition={{ type:'spring', stiffness:400, damping:30 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl p-6" style={{ backgroundColor: '#D8DAE4', ...S.neoOut }}>
              <h3 className="font-bold text-[#2D3561] text-lg mb-5" style={{ fontFamily: 'DM Sans, sans-serif' }}>✏️ Mi perfil</h3>

              {/* Avatar */}
              <div className="flex items-center gap-4 mb-5">
                <div onClick={() => meAvatarRef.current?.click()}
                  className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 cursor-pointer flex items-center justify-center"
                  style={{ backgroundColor: '#CDD0DC', ...S.neoIn }}>
                  {meAvatarPreview
                    ? <img src={meAvatarPreview} alt="me" className="w-full h-full object-cover" />
                    : <span className="text-3xl">👤</span>
                  }
                </div>
                <div>
                  <p className="text-sm font-bold text-[#2D3561]">{myProfile?.full_name ?? 'Admin'}</p>
                  <p className="text-xs" style={{ color: '#8B92AA' }}>{myProfile?.email}</p>
                  <button onClick={() => meAvatarRef.current?.click()}
                    className="text-xs font-bold mt-2" style={{ color: '#FF5722', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Cambiar foto
                  </button>
                </div>
                <input ref={meAvatarRef} type="file" accept="image/*" className="sr-only"
                  onChange={e => handleAvatarChange(e, true)} />
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Nombre completo</label>
                  <input value={myForm.full_name} onChange={e => setMyForm(p => ({ ...p, full_name: e.target.value }))}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8B92AA' }}>Teléfono</label>
                  <input type="tel" value={myForm.phone} onChange={e => setMyForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+57 300 000 0000"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#CDD0DC', color: '#2D3561', ...S.neoIn }} />
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowEditMe(false)} className="flex-1 py-3 rounded-2xl text-sm font-bold"
                  style={{ backgroundColor: '#D8DAE4', color: '#5A617A', ...S.neoOut }}>Cancelar</button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleSaveMe} disabled={savingMe}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#FF5722] ${savingMe ? 'opacity-70' : ''}`}
                  style={S.coral}>
                  {savingMe ? 'Guardando...' : '✅ Guardar'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
TeamManager.displayName = 'TeamManager'
