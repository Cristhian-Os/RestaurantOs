/**
 * TeamManager.tsx
 * ─────────────────────────────────────────────────────────────
 * Gestión de equipo desde la app (solo admin):
 *  • Ver todos los empleados activos
 *  • Crear nuevo empleado (invitar por email)
 *  • Cambiar rol
 *  • Activar / desactivar cuenta
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'
import message from 'antd/es/message'

const S = {
  neoOut:  { boxShadow: '8px 8px 16px rgba(163,177,198,0.65),-8px -8px 16px rgba(255,255,255,0.75)' },
  neoOutSm:{ boxShadow: '4px 4px 10px rgba(163,177,198,0.6),-4px -4px 10px rgba(255,255,255,0.7)' },
  neoIn:   { boxShadow: 'inset 6px 6px 12px rgba(163,177,198,0.6),inset -6px -6px 12px rgba(255,255,255,0.7)' },
  coral:   { boxShadow: '8px 8px 16px rgba(255,87,34,0.35),-4px -4px 12px rgba(255,255,255,0.6)' },
} as const

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]

type Role = 'admin' | 'waiter' | 'kitchen' | 'cashier' | 'client'

interface Profile {
  id:        string
  email:     string | null
  full_name: string | null
  role:      Role
  active:    boolean
  created_at:string
}

const ROLE_CONFIG: Record<Role, { label: string; emoji: string; color: string }> = {
  admin:   { label: 'Administrador', emoji: '👑', color: 'bg-purple-100 text-purple-700' },
  waiter:  { label: 'Mesero',        emoji: '🛎️', color: 'bg-blue-100 text-blue-700'    },
  kitchen: { label: 'Cocina',        emoji: '👨‍🍳', color: 'bg-orange-100 text-orange-700'},
  cashier: { label: 'Caja',          emoji: '💰', color: 'bg-emerald-100 text-emerald-700'},
  client:  { label: 'Cliente',       emoji: '🧑', color: 'bg-gray-100 text-gray-600'    },
}

interface NewEmployeeForm {
  email:     string
  full_name: string
  role:      Role
  password:  string
}

const FORM_INITIAL: NewEmployeeForm = { email: '', full_name: '', role: 'waiter', password: '' }

export const TeamManager = memo(() => {
  const [profiles,     setProfiles]   = useState<Profile[]>([])
  const [loading,      setLoading]    = useState(true)
  const [showForm,     setShowForm]   = useState(false)
  const [form,         setForm]       = useState<NewEmployeeForm>(FORM_INITIAL)
  const [creating,     setCreating]   = useState(false)
  const [formError,    setFormError]  = useState<string | null>(null)
  const [editingId,    setEditingId]  = useState<string | null>(null)
  const [editRole,     setEditRole]   = useState<Role>('waiter')
  const [search,       setSearch]     = useState('')

  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('role').order('full_name')
    if (!error) setProfiles(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchProfiles() }, [fetchProfiles])

  // Crear empleado
  const handleCreate = useCallback(async () => {
    setFormError(null)
    if (!form.email.trim())     { setFormError('Email requerido'); return }
    if (!form.full_name.trim()) { setFormError('Nombre requerido'); return }
    if (form.password.length < 6) { setFormError('Contraseña mínimo 6 caracteres'); return }

    setCreating(true)
    try {
      // BUG FIX #4: supabase.auth.signUp() cambiaba la sesión activa del admin,
      // dejándolo deslogueado. La solución correcta es usar una Supabase Edge Function
      // con service_role que llame a auth.admin.createUser().
      // Mientras tanto, usamos la RPC create_employee_profile que solo toca
      // la tabla profiles (sin afectar auth). El empleado deberá registrarse
      // con el email/contraseña que le dé el admin.
      const { error } = await supabase.rpc('create_employee_profile', {
        p_email:     form.email.trim().toLowerCase(),
        p_full_name: form.full_name.trim(),
        p_role:      form.role,
        p_password:  form.password, // la Edge Function lo usará para crear el auth.user
      })

      if (error) {
        // Fallback: insertar solo en profiles (el empleado se registra luego)
        const { error: insertErr } = await supabase.from('profiles').insert({
          email:     form.email.trim().toLowerCase(),
          full_name: form.full_name.trim(),
          role:      form.role,
        })
        if (insertErr) throw insertErr
        message.warning(
          `⚠️ Perfil creado, pero el empleado debe registrar su cuenta en /register con el email: ${form.email}`
        )
      } else {
        message.success(`✅ ${form.full_name} agregado como ${ROLE_CONFIG[form.role].label}`)
      }

      setForm(FORM_INITIAL)
      setShowForm(false)
      setTimeout(fetchProfiles, 1000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al crear empleado'
      if (msg.includes('already registered') || msg.includes('duplicate')) {
        setFormError('Ya existe una cuenta con ese email')
      } else {
        setFormError(msg)
      }
    } finally {
      setCreating(false)
    }
  }, [form, fetchProfiles])

  // Cambiar rol
  const handleChangeRole = useCallback(async (profileId: string, newRole: Role) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', profileId)
    if (error) { message.error('Error al cambiar rol: ' + error.message); return }
    message.success('Rol actualizado')
    setEditingId(null)
    fetchProfiles()
  }, [fetchProfiles])

  // Activar/desactivar
  const handleToggleActive = useCallback(async (profile: Profile) => {
    if (profile.role === 'admin') { message.warning('No se puede desactivar al admin'); return }
    const { error } = await supabase.from('profiles').update({ active: !profile.active }).eq('id', profile.id)
    if (error) { message.error('Error: ' + error.message); return }
    message.success(profile.active ? 'Empleado desactivado' : 'Empleado reactivado')
    fetchProfiles()
  }, [fetchProfiles])

  const filtered = profiles.filter(p => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.role.includes(q))
  })

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-full border-4 border-[#FF5722] border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#2D3561]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            👥 Equipo
          </h2>
          <p className="text-sm text-[#9CA3AF] mt-0.5">{profiles.filter(p=>p.active).length} activos · {profiles.length} total</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => { setShowForm(true); setFormError(null) }}
          className="flex items-center gap-2 text-sm font-bold text-white bg-[#FF5722] px-4 py-2.5 rounded-2xl"
          style={S.coral}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
            <path d="M12 4v16m-8-8h16"/>
          </svg>
          Agregar
        </motion.button>
      </div>

      {/* Buscador */}
      <div className="bg-[#E8EAF0] rounded-2xl px-4 py-3 flex items-center gap-3" style={S.neoIn}>
        <span className="text-[#9CA3AF]">🔍</span>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email o rol..."
          className="flex-1 bg-transparent text-sm text-[#2D3561] outline-none placeholder-[#9CA3AF]"
        />
      </div>

      {/* Formulario nuevo empleado */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="bg-[#E8EAF0] rounded-3xl p-6" style={S.neoOut}>
              <h3 className="font-bold text-[#2D3561] mb-5">➕ Nuevo empleado</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Nombre completo *</label>
                  <input
                    value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                    placeholder="Ej: María García"
                    className="w-full bg-[#E0E3EC] rounded-xl px-4 py-3 text-sm text-[#2D3561] outline-none"
                    style={S.neoIn}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Email *</label>
                  <input
                    type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="empleado@restaurante.com"
                    className="w-full bg-[#E0E3EC] rounded-xl px-4 py-3 text-sm text-[#2D3561] outline-none"
                    style={S.neoIn}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Contraseña inicial *</label>
                  <input
                    type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-[#E0E3EC] rounded-xl px-4 py-3 text-sm text-[#2D3561] outline-none"
                    style={S.neoIn}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Rol *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['waiter','kitchen','cashier','admin'] as Role[]).map(r => (
                      <button key={r}
                        onClick={() => setForm(p => ({ ...p, role: r }))}
                        className="py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                        style={form.role === r ? { background: '#FF5722', color: 'white', ...S.coral } : { background: '#E8EAF0', color: '#6B7280', ...S.neoOutSm }}
                      >
                        {ROLE_CONFIG[r].emoji} {ROLE_CONFIG[r].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-500 font-medium mt-3 flex items-center gap-1.5">⚠️ {formError}</p>
              )}

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setShowForm(false); setForm(FORM_INITIAL); setFormError(null) }}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-[#6B7280]" style={S.neoOut}
                >
                  Cancelar
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }} onClick={handleCreate} disabled={creating}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#FF5722] ${creating ? 'opacity-70' : ''}`}
                  style={S.coral}
                >
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
          <div className="bg-[#E8EAF0] rounded-3xl p-12 text-center" style={S.neoIn}>
            <p className="text-4xl mb-2">👥</p>
            <p className="font-bold text-[#2D3561]">Sin empleados</p>
          </div>
        )}
        {filtered.map(profile => {
          const roleCfg = ROLE_CONFIG[profile.role]
          const isEditing = editingId === profile.id

          return (
            <motion.div key={profile.id} layout
              className={`bg-[#E8EAF0] rounded-2xl p-4 ${!profile.active ? 'opacity-50' : ''}`}
              style={S.neoOut}
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-2xl bg-[#E0E3EC] flex items-center justify-center text-lg flex-shrink-0" style={S.neoIn}>
                  {roleCfg.emoji}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#2D3561] text-sm truncate">
                    {profile.full_name ?? 'Sin nombre'}
                    {!profile.active && <span className="ml-2 text-[10px] text-red-500 font-bold">INACTIVO</span>}
                  </p>
                  <p className="text-xs text-[#9CA3AF] truncate">{profile.email}</p>
                </div>

                {/* Rol */}
                <span className={`${roleCfg.color} text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0`}>
                  {roleCfg.label}
                </span>

                {/* Menú acciones */}
                <div className="flex gap-1.5">
                  {profile.role !== 'admin' && (
                    <>
                      <button
                        onClick={() => { setEditingId(isEditing ? null : profile.id); setEditRole(profile.role) }}
                        className="p-2 rounded-xl text-[#6B7280]" style={S.neoOutSm}
                        title="Cambiar rol"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleToggleActive(profile)}
                        className="p-2 rounded-xl text-[#6B7280]" style={S.neoOutSm}
                        title={profile.active ? 'Desactivar' : 'Activar'}
                      >
                        {profile.active ? '🔒' : '🔓'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Editor de rol inline */}
              <AnimatePresence>
                {isEditing && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}
                    className="mt-3 overflow-hidden"
                  >
                    <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Cambiar rol</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(['waiter','kitchen','cashier','admin'] as Role[]).map(r => (
                        <button key={r}
                          onClick={() => setEditRole(r)}
                          className="py-2 rounded-xl text-xs font-bold"
                          style={editRole === r ? { background: '#FF5722', color: 'white', ...S.coral } : { background: '#E8EAF0', color: '#6B7280', ...S.neoOutSm }}
                        >
                          {ROLE_CONFIG[r].emoji} {ROLE_CONFIG[r].label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => setEditingId(null)} className="flex-1 py-2 rounded-xl text-xs font-bold text-[#6B7280]" style={S.neoOut}>
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleChangeRole(profile.id, editRole)}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-[#FF5722]"
                        style={S.coral}
                      >
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
    </div>
  )
})

TeamManager.displayName = 'TeamManager'
