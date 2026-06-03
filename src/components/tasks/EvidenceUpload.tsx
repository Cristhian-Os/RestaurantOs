/**
 * EvidenceUpload.tsx
 * ─────────────────────────────────────────────────────────────
 * Componente de carga de evidencia fotográfica.
 * En móvil abre la cámara directamente (capture="environment").
 * En desktop abre el selector de archivos.
 */
import { useState, useRef, useCallback, memo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../services/supabaseClient'

interface EvidenceUploadProps {
  taskId:      string
  userId:      string
  taskTitle:   string
  onSuccess:   () => void
  onCancel:    () => void
}

type UploadState = 'idle' | 'preview' | 'uploading' | 'done' | 'error'

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]
const S = {
  neoOut:  { boxShadow: 'var(--shadow-out)' },
  neoIn:   { boxShadow: 'var(--shadow-in)' },
  coral:   { boxShadow: 'var(--shadow-coral)' },
  green:   { boxShadow: 'var(--shadow-green)' },
} as const

// Comprime imagen antes de subir (importante para fotos de cámara ~5MB)
async function compressImage(file: File, maxWidthPx = 1280): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const ratio  = Math.min(1, maxWidthPx / img.width)
      const canvas = document.createElement('canvas')
      canvas.width  = img.width  * ratio
      canvas.height = img.height * ratio
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas error')),
        'image/jpeg',
        0.82  // calidad 82%: buen balance tamaño/calidad
      )
      URL.revokeObjectURL(url)
    }
    img.onerror = () => reject(new Error('Image load error'))
    img.src = url
  })
}

export const EvidenceUpload = memo<EvidenceUploadProps>(({
  taskId, userId, taskTitle, onSuccess, onCancel
}) => {
  const [state,     setState]     = useState<UploadState>('idle')
  const [preview,   setPreview]   = useState<string | null>(null)
  const [notes,     setNotes]     = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [progress,  setProgress]  = useState(0)
  const fileRef   = useRef<HTMLInputElement>(null)
  const selectedFile = useRef<File | null>(null)

  // BUG FIX #6: el useEffect anterior con [preview] como dependencia revocaba la URL
  // ANTES de que el <img> terminara de cargarla (al cambiar el estado previo → nuevo).
  // Solución: revocar solo al desmontarse el componente, usando una ref para el valor actual.
  const previewRef = useRef<string | null>(null)
  useEffect(() => {
    previewRef.current = preview
  }, [preview])
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, []) // solo al desmontar

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    // Validar tipo y tamaño (5MB máximo)
    if (!file.type.startsWith('image/')) {
      setError('Solo se aceptan imágenes')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen no puede superar 5MB')
      return
    }

    selectedFile.current = file
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    setState('preview')
  }, [])

  const handleUpload = useCallback(async () => {
    if (!selectedFile.current) return
    setState('uploading')
    setError(null)
    setProgress(0)

    try {
      // 1. Comprimir imagen
      setProgress(20)
      const compressed = await compressImage(selectedFile.current)

      // 2. Definir path único en el bucket
      const ext  = 'jpg'
      const path = `${userId}/${taskId}/${Date.now()}.${ext}`

      // 3. Subir a Supabase Storage
      setProgress(50)
      const { error: uploadError } = await supabase.storage
        .from('task-evidence')
        .upload(path, compressed, {
          contentType: 'image/jpeg',
          upsert:      false,
        })
      if (uploadError) throw uploadError

      // 4. Obtener URL pública
      setProgress(75)
      const { data: { publicUrl } } = supabase.storage
        .from('task-evidence')
        .getPublicUrl(path)

      // 5. Llamar función atómica: inserta evidencia + completa tarea
      setProgress(90)
      const { error: rpcError } = await supabase.rpc('complete_task_with_evidence', {
        p_task_id:      taskId,
        p_photo_url:    publicUrl,
        p_storage_path: path,
        p_notes:        notes.trim() || null,
      })
      if (rpcError) throw rpcError

      setProgress(100)
      setState('done')
      setTimeout(onSuccess, 1200)

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al subir evidencia'
      setError(msg)
      setState('preview')
    }
  }, [taskId, userId, notes, onSuccess])

  const reset = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    selectedFile.current = null
    setState('idle')
    setError(null)
    setNotes('')
    if (fileRef.current) fileRef.current.value = ''
  }, [preview])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="bg-[#D8DAE4] rounded-3xl p-6"
      style={S.neoOut}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs font-bold text-[#FF5722] uppercase tracking-wider mb-1">
            Evidencia requerida
          </p>
          <h3
            className="font-bold text-[#2D3561] text-sm leading-snug"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            {taskTitle}
          </h3>
        </div>
        <button
          onClick={onCancel}
          className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors p-1"
          aria-label="Cancelar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <AnimatePresence mode="wait">

        {/* ESTADO: idle — seleccionar foto */}
        {state === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            {/* Zona de carga */}
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full h-40 rounded-2xl flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[#C5CAD8] hover:border-[#FF5722] transition-colors"
              style={S.neoIn}
            >
              <span className="text-4xl"></span>
              <div className="text-center">
                <p className="text-sm font-bold text-[#2D3561]">Tomar foto o elegir de galería</p>
                <p className="text-xs text-[#9CA3AF] mt-0.5">JPG, PNG, WebP · Máx 5MB</p>
              </div>
            </button>

            {/* Input oculto — capture="environment" abre cámara trasera en móvil */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />

            {error && (
              <p className="text-xs text-red-500 font-medium flex items-center gap-1.5">
                <span></span> {error}
              </p>
            )}
          </motion.div>
        )}

        {/* ESTADO: preview — revisar foto antes de enviar */}
        {state === 'preview' && preview && (
          <motion.div
            key="preview"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            {/* Preview de la foto */}
            <div className="relative w-full rounded-2xl overflow-hidden" style={S.neoIn}>
              <img
                src={preview}
                alt="Evidencia"
                className="w-full h-52 object-cover"
              />
              <button
                onClick={reset}
                className="absolute top-2 right-2 w-8 h-8 rounded-xl bg-[#2D3561]/70 backdrop-blur-sm flex items-center justify-center text-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Notas opcionales */}
            <div>
              <label className="block text-xs font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">
                Nota adicional (opcional)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ej: Tarea completada, área limpia..."
                maxLength={500}
                rows={2}
                className="w-full bg-[#CDD0DC] rounded-xl px-4 py-3 text-sm text-[#2D3561] border-none outline-none resize-none placeholder-[#9CA3AF]"
                style={S.neoIn}
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 font-medium flex items-center gap-1.5">
                <span></span> {error}
              </p>
            )}

            {/* Botones */}
            <div className="flex gap-3">
              <button
                onClick={reset}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-[#6B7280] bg-[#D8DAE4]"
                style={S.neoOut}
              >
                Repetir foto
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleUpload}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#FF5722]"
                style={S.coral}
              >
                Enviar evidencia
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ESTADO: uploading */}
        {state === 'uploading' && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-5 py-6"
          >
            <div className="w-16 h-16 rounded-3xl bg-[#FF5722] flex items-center justify-center text-2xl" style={S.coral}>
             
            </div>
            <div className="w-full">
              <div className="flex justify-between text-xs font-bold text-[#6B7280] mb-2">
                <span>Subiendo evidencia...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-[#CDD0DC] rounded-full overflow-hidden" style={S.neoIn}>
                <motion.div
                  className="h-full bg-[#FF5722] rounded-full"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>
            <p className="text-xs text-[#9CA3AF]">No cierres la aplicación</p>
          </motion.div>
        )}

        {/* ESTADO: done — éxito */}
        {state === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="flex flex-col items-center gap-3 py-8"
          >
            <div
              className="w-16 h-16 rounded-3xl bg-emerald-500 flex items-center justify-center text-3xl"
              style={S.green}
            >
             
            </div>
            <p className="font-bold text-emerald-600 text-lg">¡Evidencia enviada!</p>
            <p className="text-xs text-[#9CA3AF]">Tarea marcada como completada</p>
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  )
})

EvidenceUpload.displayName = 'EvidenceUpload'
