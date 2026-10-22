/**
 * CameraCapture.tsx
 * Abre la cámara en vivo (getUserMedia) y toma UNA foto en el momento.
 * A propósito no hay selector de archivos ni galería: la foto de llegada
 * solo puede ser la que se toma ahora mismo.
 */
import { useEffect, useRef, useState } from 'react'

interface Props {
  title:     string
  onCapture: (photo: Blob) => Promise<void> | void
  onClose:   () => void
}

const MAX_WIDTH = 960

export function CameraCapture({ title, onCapture, onClose }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [shot, setShot]       = useState<{ blob: Blob; url: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [ready, setReady]     = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este dispositivo no permite usar la cámara desde la app.')
      return
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setError('No se pudo abrir la cámara. Permite el acceso a la cámara en tu navegador e intenta de nuevo.'))
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url) }, [shot])

  const take = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const scale  = Math.min(1, MAX_WIDTH / v.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(v.videoWidth * scale)
    canvas.height = Math.round(v.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => { if (blob) setShot({ blob, url: URL.createObjectURL(blob) }) }, 'image/jpeg', 0.8)
  }

  const send = async () => {
    if (!shot) return
    setSending(true)
    try { await onCapture(shot.blob) } finally { setSending(false) }
  }

  const btn: React.CSSProperties = { flex: 1, padding: '0.875rem', borderRadius: '0.875rem', border: 'none', fontWeight: 700, fontSize: '0.9375rem', cursor: 'pointer', fontFamily: 'var(--w-sans)' }

  return (
    <div onClick={() => !sending && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, background: 'var(--w-surface)', borderRadius: '1.25rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        <h3 className="ed-display" style={{ margin: 0, fontWeight: 600, fontSize: '1.25rem' }}>{title}</h3>

        {error ? (
          <p style={{ margin: 0, color: 'var(--w-wine)', fontSize: '0.875rem', fontFamily: 'var(--w-sans)' }}>{error}</p>
        ) : shot ? (
          <img src={shot.url} alt="Tu foto de llegada" style={{ width: '100%', borderRadius: '0.875rem', transform: 'scaleX(-1)' }} />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted onLoadedData={() => setReady(true)}
            style={{ width: '100%', borderRadius: '0.875rem', background: '#000', transform: 'scaleX(-1)' }} />
        )}

        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <button onClick={onClose} disabled={sending} style={{ ...btn, background: 'var(--w-bg)', color: 'var(--w-ink-soft)', border: '1px solid var(--w-line)' }}>
            Cancelar
          </button>
          {!error && (shot ? (
            <>
              <button onClick={() => setShot(null)} disabled={sending} style={{ ...btn, background: 'var(--w-bg)', color: 'var(--w-ink)', border: '1px solid var(--w-line)' }}>Repetir</button>
              <button onClick={send} disabled={sending} style={{ ...btn, background: 'var(--w-olive)', color: '#fff', opacity: sending ? 0.6 : 1 }}>
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </>
          ) : (
            <button onClick={take} disabled={!ready} style={{ ...btn, background: 'var(--w-terra)', color: '#fff', opacity: ready ? 1 : 0.5 }}>Tomar foto</button>
          ))}
        </div>
      </div>
    </div>
  )
}
