/**
 * InstallPWA.tsx
 * Botón de instalación PWA + modal con QR para móvil
 * Se muestra SOLO cuando el browser soporta instalación (beforeinstallprompt)
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'

const S = {
  out:   { boxShadow: 'var(--w-shadow-md)' },
  outSm: { boxShadow: 'var(--w-shadow-sm)' },
  in:    { boxShadow: 'inset 0 0 0 1px var(--w-border)' },
  coral: { boxShadow: 'var(--w-shadow-terra)' },
} as const

// Icono descarga
const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    style={{ width: 18, height: 18 }}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

// Icono X
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
    style={{ width: 16, height: 16 }}>
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

interface InstallPWAProps {
  /** Variante compacta para el header */
  compact?: boolean
}

export function InstallPWA({ compact = false }: InstallPWAProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstalled,    setIsInstalled]    = useState(false)
  const [showModal,      setShowModal]      = useState(false)
  const [qrDataUrl,      setQrDataUrl]      = useState('')
  const [installing,     setInstalling]     = useState(false)
  const [installed,      setInstalled]      = useState(false)
  const [tab,            setTab]            = useState<'desktop'|'qr'>('desktop')

  const APP_URL = window.location.origin

  // Detectar si ya está instalada como PWA
  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    if (isStandalone) setIsInstalled(true)
  }, [])

  // Capturar el evento beforeinstallprompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Detectar instalación completada
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      setInstalled(true)
      setTimeout(() => setShowModal(false), 2000)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Generar QR cuando se abre el modal
  useEffect(() => {
    if (!showModal) return
    QRCode.toDataURL(APP_URL, {
      width: 220,
      margin: 2,
      // El QR necesita colores HEX reales y alto contraste (no variables CSS)
      color: { dark: '#1F1813', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    }).then(setQrDataUrl).catch(console.error)
  }, [showModal, APP_URL])

  const handleInstallClick = useCallback(async () => {
    if (deferredPrompt) {
      // Instalar directamente en desktop
      setInstalling(true)
      try {
        await deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === 'accepted') {
          setInstalled(true)
          setTimeout(() => setShowModal(false), 1500)
        }
      } finally {
        setInstalling(false)
        setDeferredPrompt(null)
      }
    } else {
      // Sin deferredPrompt (iOS/Safari) → mostrar modal con QR e instrucciones
      setShowModal(true)
    }
  }, [deferredPrompt])

  // No mostrar si ya está instalada (después de todos los hooks)
  if (isInstalled) return null

  // ── Botón compacto para el header ────────────────────────
  if (compact) {
    return (
      <>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => deferredPrompt ? handleInstallClick() : setShowModal(true)}
          title="Instalar app"
          style={{
            padding: '0.625rem',
            backgroundColor: 'var(--w-surface)',
            borderRadius: 'var(--w-r-md)',
            border: 'none',
            color: 'var(--w-text-2)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem',
            ...S.outSm,
          }}
        >
          <DownloadIcon />
        </motion.button>

        <InstallModal
          show={showModal}
          onClose={() => setShowModal(false)}
          qrDataUrl={qrDataUrl}
          appUrl={APP_URL}
          deferredPrompt={deferredPrompt}
          installing={installing}
          installed={installed}
          tab={tab}
          setTab={setTab}
          onInstall={handleInstallClick}
        />
      </>
    )
  }

  // ── Fila discreta (inicio / ajustes): instalar o ver instrucciones en el modal ─
  return (
    <>
      <div style={{
        backgroundColor: 'var(--w-surface)',
        border: '1px solid var(--w-border)',
        borderRadius: 'var(--w-r-lg)',
        padding: '0.75rem 1rem',
        display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
        maxWidth: '100%', boxSizing: 'border-box',
        boxShadow: 'var(--w-shadow-sm)',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--w-r-md)',
          backgroundColor: 'var(--w-accent-soft)', color: 'var(--w-accent-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <DownloadIcon />
        </div>
        <div style={{ flex: '1 1 11rem', minWidth: 0 }}>
          <p style={{ fontWeight: 700, color: 'var(--w-text)', fontSize: 'var(--w-fs-body)', margin: 0 }}>
            Instalar RestaurantOS
          </p>
          <p style={{ fontSize: 'var(--w-fs-caption)', color: 'var(--w-text-3)', margin: 0 }}>
            Acceso rápido desde tu dispositivo
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleInstallClick}
            disabled={installing}
            style={{
              minHeight: 44, padding: '0 1.1rem',
              backgroundColor: 'var(--w-accent)', color: 'var(--w-on-accent)',
              borderRadius: 'var(--w-r-md)', border: 'none',
              fontWeight: 700, fontSize: 'var(--w-fs-body)', fontFamily: 'inherit',
              cursor: installing ? 'wait' : 'pointer', opacity: installing ? 0.7 : 1,
            }}
          >
            {installing ? 'Instalando...' : installed ? '¡Instalada!' : 'Instalar'}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowModal(true)}
            style={{
              minHeight: 44, padding: '0 1rem',
              backgroundColor: 'transparent', color: 'var(--w-text-2)',
              borderRadius: 'var(--w-r-md)', border: '1px solid var(--w-border-strong)',
              fontWeight: 600, fontSize: 'var(--w-fs-body)', fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            Ver instrucciones
          </motion.button>
        </div>
      </div>

      <InstallModal
        show={showModal}
        onClose={() => setShowModal(false)}
        qrDataUrl={qrDataUrl}
        appUrl={APP_URL}
        deferredPrompt={deferredPrompt}
        installing={installing}
        installed={installed}
        tab={tab}
        setTab={setTab}
        onInstall={handleInstallClick}
      />
    </>
  )
}

// ── Modal de instalación ──────────────────────────────────────
interface ModalProps {
  show:           boolean
  onClose:        () => void
  qrDataUrl:      string
  appUrl:         string
  deferredPrompt: any
  installing:     boolean
  installed:      boolean
  tab:            'desktop' | 'qr'
  setTab:         (t: 'desktop' | 'qr') => void
  onInstall:      () => void
}

function InstallModal({
  show, onClose, qrDataUrl, appUrl,
  deferredPrompt, installing, installed,
  tab, setTab, onInstall,
}: ModalProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            backgroundColor: 'var(--w-overlay)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '400px',
              backgroundColor: 'var(--w-surface)',
              borderRadius: '1.5rem',
              padding: '1.75rem',
              fontFamily: 'var(--w-font)',
              boxShadow: 'var(--w-shadow-lg)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontWeight: 700, color: 'var(--w-text)', fontSize: '1.25rem', margin: 0, fontFamily: 'var(--w-font)' }}>
                  Instalar RestaurantOS
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--w-text-3)', margin: '0.25rem 0 0' }}>
                  Disponible como app nativa
                </p>
              </div>
              <button onClick={onClose} style={{
                width: 32, height: 32, borderRadius: '0.5rem',
                border: 'none', backgroundColor: 'var(--w-surface)',
                color: 'var(--w-text-3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--w-shadow-sm)',
              }}>
                <CloseIcon />
              </button>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '0.5rem', marginBottom: '1.25rem',
              backgroundColor: 'var(--w-surface-sunken)',
              borderRadius: '0.875rem', padding: '0.25rem',
              boxShadow: 'inset 0 0 0 1px var(--w-border)',
            }}>
              {(['desktop', 'qr'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '0.625rem',
                  borderRadius: '0.625rem',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s ease',
                  ...(tab === t
                    ? { backgroundColor: 'var(--w-accent)', color: 'var(--w-on-accent)',
                        boxShadow: 'var(--w-shadow-terra)' }
                    : { backgroundColor: 'transparent', color: 'var(--w-text-3)' }
                  ),
                }}>
                  {t === 'desktop' ? 'Escritorio' : 'Móvil / QR'}
                </button>
              ))}
            </div>

            {/* Panel Desktop */}
            <AnimatePresence mode="wait">
              {tab === 'desktop' && (
                <motion.div key="desktop"
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                >
                  {/* Instrucciones Chrome/Edge */}
                  <div style={{
                    backgroundColor: 'var(--w-surface-sunken)', borderRadius: '1rem', padding: '1rem',
                    boxShadow: 'inset 0 0 0 1px var(--w-border)',
                  }}>
                    <p style={{ fontWeight: 700, color: 'var(--w-text)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                      Chrome / Edge (recomendado)
                    </p>
                    {['Haz clic en el botón ⊕ en la barra de direcciones',
                      'O usa el menú ⋮ → "Instalar RestaurantOS"',
                      'Confirma haciendo clic en "Instalar"',
                    ].map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: '0.625rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%',
                          backgroundColor: 'var(--w-accent)', color: 'var(--w-on-accent)',
                          fontSize: '0.6875rem', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginTop: 1,
                        }}>{i + 1}</span>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--w-text-2)', margin: 0 }}>{step}</p>
                      </div>
                    ))}
                  </div>

                  {/* Botón instalar directo si hay prompt */}
                  {deferredPrompt ? (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={onInstall}
                      disabled={installing}
                      style={{
                        width: '100%', padding: '0.875rem',
                        backgroundColor: 'var(--w-accent)',
                        borderRadius: '1rem', border: 'none',
                        color: 'var(--w-on-accent)', fontWeight: 700, fontSize: '0.9375rem',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '0.5rem', fontFamily: 'inherit',
                        opacity: installing ? 0.7 : 1,
                        boxShadow: 'var(--w-shadow-terra)',
                      }}
                    >
                      {installing ? (
                        <>
                          <svg style={{ animation: 'spin 0.8s linear infinite', width: 18, height: 18 }}
                            viewBox="0 0 24 24" fill="none">
                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Instalando...
                        </>
                      ) : installed ? (
                        '¡Instalada correctamente!'
                      ) : (
                        <><DownloadIcon /> Instalar ahora en este dispositivo</>
                      )}
                    </motion.button>
                  ) : (
                    <div style={{
                      backgroundColor: 'var(--w-warning-bg)', borderRadius: '1rem', padding: '0.875rem',
                      border: '1px solid var(--w-warning)',
                    }}>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--w-warning-text)', margin: 0 }}>
                        La instalación directa no está disponible en este browser. Usa las instrucciones de arriba o el QR para móvil.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Panel QR */}
              {tab === 'qr' && (
                <motion.div key="qr"
                  initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}
                >
                  {/* QR Code */}
                  <div style={{
                    backgroundColor: 'var(--w-surface-sunken)', borderRadius: 'var(--w-r-lg)',
                    padding: '1.25rem', display: 'inline-flex',
                    boxShadow: 'inset 0 0 0 1px var(--w-border)',
                  }}>
                    {qrDataUrl
                      ? <img src={qrDataUrl} alt="QR RestaurantOS"
                          style={{ width: 180, height: 180, display: 'block', imageRendering: 'pixelated' }} />
                      : <div style={{
                          width: 180, height: 180, borderRadius: 'var(--w-r-md)',
                          backgroundColor: 'var(--w-surface)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.75rem', color: 'var(--w-text-3)',
                        }}>
                          Generando QR...
                        </div>
                    }
                  </div>

                  <p style={{ fontSize: '0.8125rem', color: 'var(--w-text-2)', textAlign: 'center', margin: 0 }}>
                    Escanea con la cámara de tu móvil o tablet para abrir la app
                  </p>

                  {/* URL copiable */}
                  <div style={{
                    width: '100%', backgroundColor: 'var(--w-surface-sunken)', borderRadius: '0.875rem',
                    padding: '0.75rem 1rem', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: '0.5rem',
                    boxShadow: 'inset 0 0 0 1px var(--w-border)',
                  }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--w-text)', fontWeight: 600,
                      margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {appUrl}
                    </p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(appUrl) }}
                      style={{
                        padding: '0.375rem 0.75rem', borderRadius: '0.5rem',
                        backgroundColor: 'var(--w-surface)', border: 'none',
                        fontSize: '0.75rem', fontWeight: 700, color: 'var(--w-accent)',
                        cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
                        boxShadow: 'var(--w-shadow-sm)',
                      }}
                    >
                      Copiar
                    </button>
                  </div>

                  {/* Instrucciones iOS */}
                  <div style={{
                    width: '100%', backgroundColor: 'var(--w-surface-sunken)', borderRadius: '1rem', padding: '0.875rem',
                    boxShadow: 'inset 0 0 0 1px var(--w-border)',
                  }}>
                    <p style={{ fontWeight: 700, color: 'var(--w-text)', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                      iPhone / iPad (Safari)
                    </p>
                    {['Abre la URL en Safari',
                      'Toca el ícono de compartir',
                      'Selecciona "Agregar a pantalla de inicio"',
                    ].map((s, i) => (
                      <p key={i} style={{ fontSize: '0.75rem', color: 'var(--w-text-2)', margin: '0.25rem 0' }}>
                        {i + 1}. {s}
                      </p>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
