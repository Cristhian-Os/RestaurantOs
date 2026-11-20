/**
 * MenusHorarioManager.tsx — "Menús por horario" (solo administrador).
 * Crea menús (desayuno, almuerzo, brunch, noche…) con sus horarios, días, productos y precios propios.
 * El servidor decide qué menú rige según la hora y la zona horaria DEL RESTAURANTE; aquí solo se configura.
 * Con el interruptor apagado el restaurante funciona exactamente como antes.
 */
import { useMemo, useState } from 'react'
import message from 'antd/es/message'
import { supabase } from '../../../services/supabaseClient'
import { ModuleHeader } from '../../tasks/ModuleHeader'
import { Button } from '../../ui/Button'
import { Badge } from '../../ui/Badge'
import { Card } from '../../ui/Card'
import { Input, Select } from '../../ui/Field'
import { Modal } from '../../ui/Modal'
import { StatePanel } from '../../ui/StatePanel'
import { Tabs } from '../../ui/Tabs'
import { Toggle } from '../../ui/Toggle'
import {
  ZONAS_COMUNES, cambioLocal, cuandoLegible, proximaFranja, rangoHoras, resumenDias,
  type MenuHorarioFila,
} from '../../../lib/menuHorario'
import { MenuHorarioEditor } from './MenuHorarioEditor'
import { ProgramacionSemanal } from './ProgramacionSemanal'
import { ControlManual } from './ControlManual'
import { useMenusHorarioAdmin, type AuditoriaFila } from './useMenusHorarioAdmin'

type Pestana = 'menus' | 'semana' | 'control' | 'ajustes' | 'historial'

const ETIQUETA_TABLA: Record<string, string> = {
  menus_horario: 'el menú', menu_horario_dias_especiales: 'el día especial', menu_horario_excepciones: 'un control manual',
  restaurant_config: 'los ajustes de menús por horario', dishes: 'el producto',
}
const VERBO: Record<string, string> = { insert: 'creó', update: 'cambió', delete: 'eliminó' }

function textoAuditoria(a: AuditoriaFila): string {
  const d = a.detalle ?? {}
  const nombre = (d.despues?.nombre ?? d.antes?.nombre ?? '') as string
  if (a.tabla === 'restaurant_config') {
    const antes = d.antes ?? {}, despues = d.despues ?? {}
    const partes: string[] = []
    if (antes.menus_horario_activo !== despues.menus_horario_activo) partes.push(despues.menus_horario_activo ? 'encendió menús por horario' : 'apagó menús por horario')
    if (antes.zona_horaria !== despues.zona_horaria) partes.push(`cambió la zona horaria a ${String(despues.zona_horaria)}`)
    if (antes.menus_gracia_min !== despues.menus_gracia_min) partes.push(`cambió la gracia a ${String(despues.menus_gracia_min)} min`)
    if (antes.menus_staff_fuera_horario !== despues.menus_staff_fuera_horario) partes.push(despues.menus_staff_fuera_horario ? 'permitió vender fuera de horario' : 'bloqueó vender fuera de horario')
    return partes.join(', ') || 'cambió los ajustes'
  }
  if (a.tabla === 'dishes') return `${despuesTodoDia(d.despues)} “${nombre}”`
  if (a.tabla === 'menu_horario_excepciones') {
    const t = String(d.despues?.tipo ?? d.antes?.tipo ?? '')
    const q = t === 'forzar' ? 'forzó un menú' : t === 'extender' ? 'extendió un menú' : 'suspendió un menú'
    return d.despues?.cerrada_at && !d.antes?.cerrada_at ? 'cerró un control manual (volvió a automático)' : `${VERBO[a.accion] === 'creó' ? q : 'cambió un control manual'}`
  }
  return `${VERBO[a.accion] ?? a.accion} ${ETIQUETA_TABLA[a.tabla ?? ''] ?? 'algo'}${nombre ? ` “${nombre}”` : ''}`
}
const despuesTodoDia = (d?: Record<string, unknown>) => (d?.todo_el_dia ? 'marcó como disponible todo el día' : 'quitó de “todo el día”')

export function MenusHorarioManager() {
  const h = useMenusHorarioAdmin()
  const [pestana, setPestana] = useState<Pestana>('menus')
  const [editando, setEditando] = useState<MenuHorarioFila | 'nuevo' | null>(null)
  const [copiando, setCopiando] = useState<MenuHorarioFila | null>(null)
  const [sedeDestino, setSedeDestino] = useState('')
  const [confirmarVacio, setConfirmarVacio] = useState<{ total: number } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [fechaEsp, setFechaEsp] = useState('')
  const [nombreEsp, setNombreEsp] = useState('')

  const ahora = h.estado?.hora_local
  const rigen = useMemo(() => new Set((h.estado?.menus ?? []).map(m => m.id)), [h.estado])
  const activa = h.config.menus_horario_activo

  if (h.cargando) return <StatePanel kind="loading" title="Cargando menús por horario" />
  if (h.error) return <StatePanel kind="error" title="No se pudieron cargar los menús por horario" text={h.error} action={<Button onClick={() => void h.recargar()}>Reintentar</Button>} />

  const interruptor = async (valor: boolean, confirmar = false) => {
    setOcupado('interruptor')
    const { data, error } = await supabase.rpc('menu_horario_interruptor', { p_activo: valor, p_confirmar_vacio: confirmar })
    setOcupado(null)
    if (error) { message.error(error.message); return }
    const r = data as { ok: boolean; motivo?: string; platos_total?: number }
    if (!r.ok && r.motivo === 'menu_vacio') { setConfirmarVacio({ total: r.platos_total ?? 0 }); return }
    message.success(valor ? 'Menús por horario encendidos' : 'Menús por horario apagados: tu menú vuelve a verse completo')
    void h.recargar()
  }

  const cambiarEstado = async (m: MenuHorarioFila, estado: MenuHorarioFila['estado']) => {
    setOcupado(m.id)
    const { error } = await supabase.from('menus_horario').update({ estado }).eq('id', m.id)
    setOcupado(null)
    if (error) { message.error(error.message); return }
    message.success(`${m.nombre}: ${estado === 'activo' ? 'activo' : estado === 'pausado' ? 'en pausa' : 'desactivado'}`)
    void h.recargar()
  }

  const duplicar = async (m: MenuHorarioFila) => {
    setOcupado(m.id)
    const { error } = await supabase.rpc('menu_horario_duplicar', { p_id: m.id })
    setOcupado(null)
    if (error) { message.error(error.message); return }
    message.success('Copia creada en pausa. Revísala y actívala cuando quieras.')
    void h.recargar()
  }

  const copiarASede = async () => {
    if (!copiando || !sedeDestino) return
    setOcupado('copiar')
    const { data, error } = await supabase.rpc('menu_horario_copiar_a_sede', { p_menu_id: copiando.id, p_sede: sedeDestino })
    setOcupado(null)
    if (error) { message.error(error.message); return }
    const r = data as { productos_copiados: number; productos_sin_equivalente: string[] }
    const faltan = r.productos_sin_equivalente ?? []
    message.success(`Copiado a la otra sede (en pausa): ${r.productos_copiados} producto(s)${faltan.length ? `. No existen allá: ${faltan.join(', ')}` : ''}`, faltan.length ? 8 : 4)
    setCopiando(null); setSedeDestino('')
  }

  const guardarAjuste = async (parche: Partial<typeof h.config>) => {
    setOcupado('ajuste')
    const { error } = await supabase.from('restaurant_config').update(parche).eq('restaurant_id', (await supabase.rpc('current_restaurant_id')).data as string)
    setOcupado(null)
    if (error) { message.error(error.message); return }
    message.success('Ajuste guardado')
    void h.recargar()
  }

  const agregarDiaEspecial = async () => {
    if (!fechaEsp || nombreEsp.trim().length < 2) { message.warning('Elige la fecha y escribe un nombre (por ejemplo, Navidad)'); return }
    setOcupado('esp')
    const { error } = await supabase.from('menu_horario_dias_especiales').insert({ fecha: fechaEsp, nombre: nombreEsp.trim() })
    setOcupado(null)
    if (error) { message.error(error.code === '23505' ? 'Ya existe un día especial en esa fecha' : error.message); return }
    setFechaEsp(''); setNombreEsp('')
    message.success('Día especial creado. Ahora agrégalo como horario dentro de los menús que quieras usar ese día.')
    void h.recargar()
  }

  const quitarDiaEspecial = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Quitar el día especial “${nombre}”? Se borran también los horarios que los menús tengan para ese día.`)) return
    const { error } = await supabase.from('menu_horario_dias_especiales').delete().eq('id', id)
    if (error) { message.error(error.message); return }
    void h.recargar()
  }

  const resumenFranjas = (m: MenuHorarioFila): string[] => {
    const f = h.franjas.filter(x => x.menu_id === m.id)
    const semanales = f.filter(x => !x.dia_especial_id).map(x => `${resumenDias(x.dias)} · ${rangoHoras(x.hora_inicio, x.hora_fin)}`)
    const esp = f.filter(x => x.dia_especial_id).length
    return [...semanales, ...(esp ? [`${esp} horario(s) en días especiales`] : [])]
  }

  const sedesOtras = h.sedes.filter(s => !s.actual)
  const cambiaTxt = ahora ? (() => { const c = cambioLocal(h.estado); return c ? cuandoLegible(ahora, c) : null })() : null
  const historial = h.auditoria.filter(a => a.tabla !== 'menu_horario_franjas' && a.tabla !== 'menu_horario_productos')

  return (
    <div className="space-y-5" style={{ fontFamily: 'var(--w-font)' }}>
      <ModuleHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>}
        title="Menús por horario"
        subtitle="Desayunos, almuerzos, brunch, noche… cada uno con sus productos y precios. Cambian solos a su hora."
        actions={<Button onClick={() => setEditando('nuevo')}>+ Nuevo menú</Button>}
      />

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-[color:var(--w-text)]">{activa ? 'Menús por horario: encendido' : 'Menús por horario: apagado'}</p>
            <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
              {activa
                ? (h.estado?.menus?.length
                  ? <>Ahora rige: <strong className="text-[color:var(--w-text)]">{h.estado.menus.map(m => m.nombre).join(' + ')}</strong>{cambiaTxt ? <> · cambia {cambiaTxt}</> : null}</>
                  : 'Ahora no rige ningún menú: los clientes solo ven los productos de todo el día.')
                : 'Apagado, tu menú se ve completo, como siempre. Arma tus menús con calma y enciéndelo cuando estén listos.'}
            </p>
          </div>
          <Toggle checked={activa} onChange={v => void interruptor(v)} label="Encender menús por horario" disabled={ocupado === 'interruptor' || (!activa && h.menus.length === 0)} />
        </div>
        {!activa && h.menus.length === 0 && <p className="mt-2 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">Crea al menos un menú para poder encenderlo.</p>}
        {activa && h.platos.some(p => !p.todo_el_dia && !h.productos.some(x => x.dish_id === p.id)) && (
          <p className="mt-2 rounded-[var(--w-r-md)] bg-[var(--w-warning-bg)] px-3 py-2 text-[length:var(--w-fs-label)] text-[color:var(--w-warning-text)]">
            ! Hay productos que no están en ningún menú ni son “todo el día”: los clientes no los ven. Asígnalos desde el editor de un menú.
          </p>
        )}
      </Card>

      <Tabs label="Secciones de menús por horario" value={pestana} onChange={setPestana}
        items={[{ key: 'menus', label: 'Menús' }, { key: 'semana', label: 'Semana' }, { key: 'control', label: 'Control manual' }, { key: 'ajustes', label: 'Ajustes' }, { key: 'historial', label: 'Historial' }]} />

      {pestana === 'menus' && (
        h.menus.length === 0
          ? <StatePanel kind="empty" title="Aún no tienes menús por horario" text="Crea el primero, por ejemplo “Desayunos” de 6:00 a. m. a 11:00 a. m." action={<Button onClick={() => setEditando('nuevo')}>+ Nuevo menú</Button>} />
          : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {h.menus.map(m => {
                const productos = h.productos.filter(p => p.menu_id === m.id).length
                const prox = ahora ? proximaFranja(m.id, h.franjas, ahora, m) : null
                const rige = rigen.has(m.id)
                return (
                  <Card key={m.id} className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-[length:var(--w-fs-body-lg)] text-[color:var(--w-text)]">{m.nombre}</h3>
                        {m.descripcion && <p className="line-clamp-2 text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">{m.descripcion}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {rige && <Badge tone="success">Rige ahora</Badge>}
                        <Badge tone={m.estado === 'activo' ? 'info' : 'neutral'}>{m.estado === 'activo' ? 'Activo' : m.estado === 'pausado' ? 'En pausa' : 'Desactivado'}</Badge>
                      </div>
                    </div>
                    <ul className="space-y-0.5 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
                      {resumenFranjas(m).map((t, i) => <li key={i}>🕒 {t}</li>)}
                      {resumenFranjas(m).length === 0 && <li className="text-[color:var(--w-text-3)]">Sin horarios (solo por control manual)</li>}
                      {(m.fecha_inicio || m.fecha_fin) && <li>📅 {m.fecha_inicio ?? 'siempre'} → {m.fecha_fin ?? 'sin fin'}</li>}
                    </ul>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">
                      <span>{productos} producto{productos === 1 ? '' : 's'}</span>
                      <span>{m.mostrar_en_qr ? 'Se muestra en el QR' : 'No se muestra en el QR'}</span>
                      {prox && ahora && m.estado === 'activo' && <span>Próxima franja: {cuandoLegible(ahora, prox)}</span>}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditando(m)}>Editar</Button>
                      <Button size="sm" variant="secondary" onClick={() => void duplicar(m)} disabled={ocupado === m.id}>Duplicar</Button>
                      {m.estado === 'activo'
                        ? <Button size="sm" variant="ghost" onClick={() => void cambiarEstado(m, 'pausado')} disabled={ocupado === m.id}>Pausar</Button>
                        : <Button size="sm" variant="ghost" onClick={() => void cambiarEstado(m, 'activo')} disabled={ocupado === m.id}>Activar</Button>}
                      {m.estado !== 'inactivo' && <Button size="sm" variant="ghost" onClick={() => void cambiarEstado(m, 'inactivo')} disabled={ocupado === m.id}>Desactivar</Button>}
                      {sedesOtras.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setCopiando(m); setSedeDestino(sedesOtras[0].id) }}>Copiar a otra sede</Button>}
                    </div>
                  </Card>
                )
              })}
            </div>
          )
      )}

      {pestana === 'semana' && (
        <div className="space-y-5">
          <Card>
            <h3 className="mb-3 font-bold text-[length:var(--w-fs-body-lg)] text-[color:var(--w-text)]">Programación semanal</h3>
            <ProgramacionSemanal menus={h.menus} franjas={h.franjas} ahoraLocal={ahora} />
          </Card>
          <Card className="space-y-3">
            <h3 className="font-bold text-[length:var(--w-fs-body-lg)] text-[color:var(--w-text)]">Días especiales (festivos y eventos)</h3>
            <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
              Ese día no se usan los horarios de la semana: solo los que agregues a cada menú para ese día. Un día sin horarios especiales queda sin menús (solo “todo el día”).
            </p>
            {h.diasEsp.length === 0 && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">No hay días especiales.</p>}
            <ul className="space-y-1.5">
              {h.diasEsp.map(d => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-[var(--w-r-md)] bg-[var(--w-surface-sunken)] px-3 py-2">
                  <span className="text-[length:var(--w-fs-body)] text-[color:var(--w-text)]"><strong>{d.nombre}</strong> · {d.fecha}</span>
                  <Button size="sm" variant="ghost" onClick={() => void quitarDiaEspecial(d.id, d.nombre)}>Quitar</Button>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Input type="date" label="Fecha" value={fechaEsp} onChange={e => setFechaEsp(e.target.value)} />
              <Input label="Nombre" value={nombreEsp} maxLength={60} onChange={e => setNombreEsp(e.target.value)} placeholder="Ej: Navidad" />
              <Button onClick={() => void agregarDiaEspecial()} loading={ocupado === 'esp'}>Agregar</Button>
            </div>
          </Card>
        </div>
      )}

      {pestana === 'control' && (
        <Card><ControlManual menus={h.menus} estado={h.estado} excepciones={h.excepciones} nombres={h.nombres} onCambio={() => void h.recargar()} /></Card>
      )}

      {pestana === 'ajustes' && (
        <Card className="space-y-4">
          <Select label="Zona horaria del restaurante" value={h.config.zona_horaria} disabled={ocupado === 'ajuste'}
            hint="Los horarios se leen en la hora de esta zona, sin importar la hora del celular de quien mire el menú."
            onChange={e => void guardarAjuste({ zona_horaria: e.target.value })}>
            {!ZONAS_COMUNES.some(z => z.id === h.config.zona_horaria) && <option value={h.config.zona_horaria}>{h.config.zona_horaria}</option>}
            {ZONAS_COMUNES.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
          </Select>
          <Input type="number" inputMode="numeric" label="Minutos de gracia al cambiar de menú" min={0} max={60} defaultValue={h.config.menus_gracia_min} key={h.config.menus_gracia_min}
            hint="Si un cliente arma su pedido justo antes del cambio, se le acepta hasta estos minutos después, con el precio que tenía."
            onBlur={e => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 0 && v <= 60 && v !== h.config.menus_gracia_min) void guardarAjuste({ menus_gracia_min: v }) }} />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-[color:var(--w-text)]">Permitir que el personal venda fuera de horario</p>
              <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
                Meseros y caja podrán agregar productos de menús que no están vigentes (al precio general o al de su menú). Los clientes por QR nunca.
              </p>
            </div>
            <Toggle checked={h.config.menus_staff_fuera_horario} onChange={v => void guardarAjuste({ menus_staff_fuera_horario: v })} label="Permitir venta del personal fuera de horario" disabled={ocupado === 'ajuste'} />
          </div>
        </Card>
      )}

      {pestana === 'historial' && (
        <Card className="space-y-2">
          <h3 className="font-bold text-[length:var(--w-fs-body-lg)] text-[color:var(--w-text)]">Quién cambió qué</h3>
          {historial.length === 0 && <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Aún no hay cambios registrados.</p>}
          <ul className="divide-y divide-[var(--w-border)]">
            {historial.slice(0, 30).map(a => (
              <li key={a.id} className="py-2 text-[length:var(--w-fs-label)] text-[color:var(--w-text-2)]">
                <strong className="text-[color:var(--w-text)]">{h.nombres[a.actor_id ?? ''] ?? 'El sistema'}</strong> {textoAuditoria(a)}
                <span className="block text-[length:var(--w-fs-caption)] text-[color:var(--w-text-3)]">{new Date(a.created_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editando && (
        <MenuHorarioEditor
          key={editando === 'nuevo' ? 'nuevo' : editando.id}
          menu={editando === 'nuevo' ? null : editando}
          franjas={h.franjas} productos={h.productos} platos={h.platos} diasEsp={h.diasEsp}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); message.success('Menú guardado'); void h.recargar() }}
        />
      )}

      <Modal open={!!copiando} onClose={() => setCopiando(null)} title={`Copiar “${copiando?.nombre ?? ''}” a otra sede`}
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCopiando(null)}>Cancelar</Button><Button onClick={() => void copiarASede()} loading={ocupado === 'copiar'}>Copiar</Button></div>}>
        <div className="space-y-3">
          <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">
            Se copian los horarios, los productos y los precios del menú. Los productos se buscan por nombre en la otra sede (cada sede tiene los suyos). La copia queda en pausa para que la revises.
          </p>
          <Select label="Sede destino" value={sedeDestino} onChange={e => setSedeDestino(e.target.value)}>
            {sedesOtras.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Select>
        </div>
      </Modal>

      <Modal open={!!confirmarVacio} onClose={() => setConfirmarVacio(null)} title="El menú de clientes quedaría vacío"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirmarVacio(null)}>No encender</Button><Button onClick={() => { setConfirmarVacio(null); void interruptor(true, true) }}>Encender igual</Button></div>}>
        <p className="text-[length:var(--w-fs-body)] text-[color:var(--w-text-2)]">
          Si lo enciendes ahora mismo, ningún producto está en un menú vigente a esta hora ni es “todo el día” (de {confirmarVacio?.total ?? 0} productos disponibles). Los clientes verían el menú sin productos hasta que empiece una franja.
        </p>
      </Modal>
    </div>
  )
}
