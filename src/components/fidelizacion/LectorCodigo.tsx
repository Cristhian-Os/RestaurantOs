/**
 * LectorCodigo.tsx — lee con la cámara el QR de la tarjeta del cliente.
 * Usa BarcodeDetector del navegador si existe; si no (iPhone), jsQR, que solo se descarga al abrir el lector.
 * Devuelve el texto del QR (el enlace /tarjeta/<código>); quien lo llama decide qué hacer con él.
 */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

export function LectorCodigo({ open, onClose, onLeido }: { open: boolean; onClose: () => void; onLeido: (texto: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const alLeer = useRef(onLeido)
  alLeer.current = onLeido
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let vivo = true
    let stream: MediaStream | null = null
    let timer = 0
    setError(null)

    const iniciar = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      } catch {
        if (vivo) setError('No se pudo abrir la cámara. Revisa el permiso del navegador o escribe el código a mano.')
        return
      }
      if (!vivo || !video.current) { stream.getTracks().forEach(t => t.stop()); return }
      video.current.srcObject = stream
      await video.current.play().catch(() => { /* se reintenta con el bucle */ })

      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
      const detector = BD ? new BD({ formats: ['qr_code'] }) : null
      const jsQR = detector ? null : (await import('jsqr')).default
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      const entregar = (texto: string) => { vivo = false; alLeer.current(texto) }
      const paso = async () => {
        const v = video.current
        if (!vivo || !v) return
        if (v.readyState >= 2 && v.videoWidth > 0) {
          try {
            if (detector) {
              const r = await detector.detect(v)
              if (r[0]?.rawValue) return entregar(r[0].rawValue)
            } else if (jsQR && ctx) {
              canvas.width = v.videoWidth; canvas.height = v.videoHeight
              ctx.drawImage(v, 0, 0)
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
              const r = jsQR(img.data, img.width, img.height)
              if (r?.data) return entregar(r.data)
            }
          } catch { /* un cuadro malo no detiene la lectura */ }
        }
        timer = window.setTimeout(paso, 200) // ~5 lecturas por segundo: suficiente y no recalienta el celular
      }
      paso()
    }
    iniciar()

    return () => {
      vivo = false
      window.clearTimeout(timer)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Leer código del cliente"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      {error
        ? <p className="text-[length:var(--w-fs-label)] text-[color:var(--w-danger-text)]">{error}</p>
        : (
          <div className="flex flex-col gap-2">
            <video ref={video} playsInline muted className="aspect-square w-full rounded-[var(--w-r-md)] bg-black object-cover" />
            <p className="text-center text-[length:var(--w-fs-label)] text-[color:var(--w-text-3)]">Apunta al QR de la tarjeta del cliente.</p>
          </div>
        )}
    </Modal>
  )
}
