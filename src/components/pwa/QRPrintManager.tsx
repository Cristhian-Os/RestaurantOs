/**
 * QRPrintManager — "Imprimir QR de mesas": PDF recortable con un QR por página
 * (una por mesa + el QR general de barra). Lleva registro de cuáles ya se generaron.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Table, Button, Modal, Radio, InputNumber, Tag, message } from 'antd'
import { supabase } from '../../services/supabaseClient'
import { buildQrPdf, loadLogo, type QrItem } from '../../lib/qrPdf'

interface Row { key: string; label: string; url: string; generado: boolean }

const BARRA = 'barra'

export function QRPrintManager() {
  const [rows, setRows] = useState<Row[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [biz, setBiz] = useState({ id: '', name: 'Mi restaurante', logo: null as string | null })
  const [open, setOpen] = useState<string[] | null>(null) // keys a imprimir; null = modal cerrado
  const [orient, setOrient] = useState<'v' | 'h'>('v')
  const [dims, setDims] = useState({ w: 6, h: 8 })
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('restaurant_id').eq('id', user?.id ?? '').single()
    const rid = prof?.restaurant_id
    if (!rid) { setLoading(false); return }
    const [{ data: rest }, { data: cfg }, { data: mesas }] = await Promise.all([
      supabase.from('restaurants_public').select('slug, name').eq('id', rid).maybeSingle(),
      supabase.from('restaurant_config').select('display_name, logo_url, qr_general_generado_at').eq('restaurant_id', rid).maybeSingle(),
      supabase.from('mesas').select('id, numero, qr_generado_at').eq('activa', true).order('numero'),
    ])
    const base = `${window.location.origin}/menu/${rest?.slug ?? ''}`
    const list: Row[] = [
      { key: BARRA, label: 'Barra', url: `${base}?origen=barra`, generado: !!cfg?.qr_general_generado_at },
      ...(mesas ?? []).map(m => ({ key: m.id, label: `Mesa ${m.numero}`, url: `${base}?mesa=${m.numero}`, generado: !!m.qr_generado_at })),
    ]
    setBiz({ id: rid, name: cfg?.display_name || rest?.name || 'Mi restaurante', logo: cfg?.logo_url ?? null })
    setRows(list)
    setSel(list.filter(r => !r.generado).map(r => r.key)) // por defecto solo lo nuevo
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const valid = dims.w >= 3 && dims.h >= 3 && dims.w <= 30 && dims.h <= 30
  const items = (keys: string[]): QrItem[] => rows.filter(r => keys.includes(r.key))

  // Vista previa = primera página del PDF real (lo que se ve es lo que se imprime)
  useEffect(() => {
    if (!open || !valid) return
    let url: string | null = null, dead = false
    const t = setTimeout(async () => {
      const doc = await buildQrPdf({ items: items(open).slice(0, 1), bizName: biz.name, logo: await loadLogo(biz.logo), wCm: dims.w, hCm: dims.h })
      url = String(doc.output('bloburl'))
      if (!dead) setPreview(url)
    }, 300)
    return () => { dead = true; clearTimeout(t); if (url) URL.revokeObjectURL(url) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dims, valid, biz])

  const pickOrient = (o: 'v' | 'h') => {
    setOrient(o)
    setDims(d => (o === 'v') === (d.w <= d.h) ? d : { w: d.h, h: d.w })
  }

  const download = async () => {
    if (!open || !valid) return
    setBusy(true)
    try {
      const list = items(open)
      const doc = await buildQrPdf({ items: list, bizName: biz.name, logo: await loadLogo(biz.logo), wCm: dims.w, hCm: dims.h })
      doc.save(`qr-${list.length === 1 ? list[0].label.toLowerCase().replace(/\s+/g, '-') : 'mesas'}.pdf`)
      const now = new Date().toISOString()
      const mesaIds = open.filter(k => k !== BARRA)
      if (mesaIds.length) await supabase.from('mesas').update({ qr_generado_at: now }).in('id', mesaIds)
      if (open.includes(BARRA)) await supabase.from('restaurant_config').update({ qr_general_generado_at: now }).eq('restaurant_id', biz.id)
      setOpen(null); setPreview(null)
      await load()
    } catch (e) {
      message.error('No se pudo generar el PDF: ' + (e instanceof Error ? e.message : e))
    } finally { setBusy(false) }
  }

  const nuevas = useMemo(() => rows.filter(r => !r.generado).length, [rows])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button type="primary" disabled={!sel.length} onClick={() => setOpen(sel)}>Generar PDF ({sel.length})</Button>
        <Button onClick={() => setSel(rows.filter(r => !r.generado).map(r => r.key))}>Solo nuevas ({nuevas})</Button>
        <Button onClick={() => setSel(rows.map(r => r.key))}>Todas</Button>
      </div>
      <Table<Row> size="small" loading={loading} dataSource={rows} pagination={false} rowKey="key"
        rowSelection={{ selectedRowKeys: sel, onChange: k => setSel(k as string[]) }}
        columns={[
          { title: 'QR', dataIndex: 'label', render: (v: string, r) => <strong>{r.key === BARRA ? 'QR General (Barra)' : v}</strong> },
          { title: 'Estado', width: 110, render: (_, r) => r.generado ? <Tag>Generado</Tag> : <Tag color="green">Nuevo</Tag> },
          { title: '', width: 110, render: (_, r) => <Button size="small" onClick={() => setOpen([r.key])}>{r.generado ? 'Regenerar' : 'PDF'}</Button> },
        ]} />

      <Modal open={!!open} title="Generar PDF de QR" onCancel={() => { setOpen(null); setPreview(null) }}
        okText="Descargar PDF" cancelText="Cancelar" onOk={download}
        okButtonProps={{ disabled: !valid, loading: busy }} destroyOnClose>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Radio.Group value={orient} onChange={e => pickOrient(e.target.value)}>
            <Radio.Button value="v">Vertical</Radio.Button>
            <Radio.Button value="h">Horizontal</Radio.Button>
          </Radio.Group>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            Ancho <InputNumber min={3} max={30} step={0.5} value={dims.w} onChange={v => setDims(d => ({ ...d, w: v ?? d.w }))} addonAfter="cm" />
            Alto <InputNumber min={3} max={30} step={0.5} value={dims.h} onChange={v => setDims(d => ({ ...d, h: v ?? d.h }))} addonAfter="cm" />
          </div>
          {!valid && <span style={{ color: 'crimson' }}>Medidas entre 3 y 30 cm.</span>}
          <small>{open?.length ?? 0} página(s), una por QR, de {dims.w}×{dims.h} cm. Vista previa de la primera:</small>
          {preview && valid && <iframe title="Vista previa" src={`${preview}#toolbar=0&navpanes=0&view=Fit`} style={{ width: '100%', height: 360, border: '1px solid #ddd' }} />}
        </div>
      </Modal>
    </div>
  )
}
