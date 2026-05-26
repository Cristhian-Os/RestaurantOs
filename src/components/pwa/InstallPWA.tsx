/**
 * InstallPWA.tsx
 * Botón de instalación PWA + modal con QR para móvil
 * Se muestra SOLO cuando el browser soporta instalación (beforeinstallprompt)
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'

const S = {
  out:   { boxShadow: '8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55)' },
  outSm: { boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)' },
  in:    { boxShadow: 'inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5)' },
  coral: { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
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

// Icono QR
const QRIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    style={{ width: 18, height: 18 }}>
    <rect x="3" y="3" width="5" height="5" rx="0.5"/>
    <rect x="16" y="3" width="5" height="5" rx="0.5"/>
    <rect x="3" y="16" width="5" height="5" rx="0.5"/>
    <rect x="4" y="4" width="3" height="3" fill="currentColor" stroke="none"/>
    <rect x="17" y="4" width="3" height="3" fill="currentColor" stroke="none"/>
    <rect x="4" y="17" width="3" height="3" fill="currentColor" stroke="none"/>
    <path d="M16 16h2v2h-2zM18 18h2v2h-2zM16 20h2v2h-2zM20 16h2v2h-2z"/>
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
      color: { dark: '#2D3561', light: '#D8DAE4' },
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
            backgroundColor: '#D8DAE4',
            borderRadius: '0.75rem',
            border: 'none',
            color: '#6B7280',
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

  // ── Bloque completo (para Settings o pantalla de bienvenida) ─
  return (
    <>
      <div style={{
        backgroundColor: '#D8DAE4',
        borderRadius: '1.5rem',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        ...S.out,
      }}>
        {/* Título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 44, height: 44,
            borderRadius: '0.75rem',
            backgroundColor: '#FF5722',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', flexShrink: 0,
            ...S.coral,
          }}>
            <DownloadIcon />
          </div>
          <div>
            <p style={{ fontWeight: 700, color: '#2D3561', fontSize: '1rem', margin: 0 }}>
              Instalar RestaurantOS
            </p>
            <p style={{ fontSize: '0.75rem', color: '#9CA3AF', margin: 0 }}>
              Acceso rápido desde cualquier dispositivo
            </p>
          </div>
        </div>

        {/* Descripción */}
        <div style={{
          backgroundColor: '#CDD0DC',
          borderRadius: '1rem',
          padding: '1rem',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
          ...S.in,
        }}>
          {['⚡ Carga instantánea sin abrir el browser',
            '📴 Funciona offline en horas pico',
            '🔔 Notificaciones de nuevas órdenes',
            '📱 Ícono en pantalla de inicio del dispositivo',
          ].map((item, i) => (
            <p key={i} style={{ fontSize: '0.8125rem', color: '#2D3561', margin: 0 }}>
              {item}
            </p>
          ))}
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {deferredPrompt && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleInstallClick}
              disabled={installing}
              style={{
                flex: 1,
                padding: '0.75rem',
                backgroundColor: '#FF5722',
                borderRadius: '1rem',
                border: 'none',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '0.5rem',
                fontFamily: 'inherit',
                opacity: installing ? 0.7 : 1,
                ...S.coral,
              }}
            >
              {installing
                ? <>
                    <svg style={{ animation: 'spin 0.8s linear infinite', width: 16, height: 16 }}
                      viewBox="0 0 24 24" fill="none">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10"
                        stroke="currentColor" strokeWidth="4"/>
                      <path style={{ opacity: 0.75 }} fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Instalando...
                  </>
                : installed
                  ? '✅ ¡Instalada!'
                  : <><DownloadIcon /> Instalar en este dispositivo</>
              }
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowModal(true)}
            style={{
              flex: deferredPrompt ? '0 0 auto' : 1,
              padding: '0.75rem 1rem',
              backgroundColor: '#D8DAE4',
              borderRadius: '1rem',
              border: 'none',
              color: '#6B7280',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '0.5rem',
              fontFamily: 'inherit',
              ...S.outSm,
            }}
          >
            <QRIcon />
            {deferredPrompt ? 'QR para móvil' : 'Ver instrucciones y QR'}
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
            backgroundColor: 'rgba(45,53,97,0.5)',
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
              backgroundColor: '#D8DAE4',
              borderRadius: '1.5rem',
              padding: '1.75rem',
              fontFamily: '"Nunito", sans-serif',
              boxShadow: '12px 12px 32px rgba(163,177,198,0.7),-12px -12px 32px rgba(255,255,255,0.8)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontWeight: 700, color: '#2D3561', fontSize: '1.25rem', margin: 0, fontFamily: '"DM Sans", sans-serif' }}>
                  Instalar RestaurantOS
                </h2>
                <p style={{ fontSize: '0.8125rem', color: '#9CA3AF', margin: '0.25rem 0 0' }}>
                  Disponible como app nativa
                </p>
              </div>
              <button onClick={onClose} style={{
                width: 32, height: 32, borderRadius: '0.5rem',
                border: 'none', backgroundColor: '#D8DAE4',
                color: '#9CA3AF', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '3px 3px 6px rgba(163,177,198,0.5),-3px -3px 6px rgba(255,255,255,0.6)',
              }}>
                <CloseIcon />
              </button>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '0.5rem', marginBottom: '1.25rem',
              backgroundColor: '#CDD0DC',
              borderRadius: '0.875rem', padding: '0.25rem',
              boxShadow: 'inset 4px 4px 8px rgba(163,177,198,0.5),inset -4px -4px 8px rgba(255,255,255,0.6)',
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
                    ? { backgroundColor: '#FF5722', color: '#fff',
                        boxShadow: '4px 4px 10px rgba(255,87,34,0.3),-2px -2px 6px rgba(255,255,255,0.5)' }
                    : { backgroundColor: 'transparent', color: '#9CA3AF' }
                  ),
                }}>
                  {t === 'desktop' ? '💻 Escritorio' : '📱 Móvil / QR'}
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
                    backgroundColor: '#CDD0DC', borderRadius: '1rem', padding: '1rem',
                    boxShadow: 'inset 4px 4px 8px rgba(163,177,198,0.5),inset -4px -4px 8px rgba(255,255,255,0.6)',
                  }}>
                    <p style={{ fontWeight: 700, color: '#2D3561', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                      🌐 Chrome / Edge (recomendado)
                    </p>
                    {['Haz clic en el botón ⊕ en la barra de direcciones',
                      'O usa el menú ⋮ → "Instalar RestaurantOS"',
                      'Confirma haciendo clic en "Instalar"',
                    ].map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: '0.625rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%',
                          backgroundColor: '#FF5722', color: '#fff',
                          fontSize: '0.6875rem', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginTop: 1,
                        }}>{i + 1}</span>
                        <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: 0 }}>{step}</p>
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
                        backgroundColor: '#FF5722',
                        borderRadius: '1rem', border: 'none',
                        color: '#fff', fontWeight: 700, fontSize: '0.9375rem',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '0.5rem', fontFamily: 'inherit',
                        opacity: installing ? 0.7 : 1,
                        boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)',
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
                        '✅ ¡Instalada correctamente!'
                      ) : (
                        <><DownloadIcon /> Instalar ahora en este dispositivo</>
                      )}
                    </motion.button>
                  ) : (
                    <div style={{
                      backgroundColor: '#FEF3C7', borderRadius: '1rem', padding: '0.875rem',
                      border: '1px solid #FDE68A',
                    }}>
                      <p style={{ fontSize: '0.8125rem', color: '#92400E', margin: 0 }}>
                        ℹ️ La instalación directa no está disponible en este browser. Usa las instrucciones de arriba o el QR para móvil.
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
                    backgroundColor: '#CDD0DC', borderRadius: '1.25rem',
                    padding: '1.25rem', display: 'inline-flex',
                    boxShadow: 'inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5)',
                  }}>
                    {qrDataUrl
                      ? <img src={qrDataUrl} alt="QR RestaurantOS"
                          style={{ width: 180, height: 180, display: 'block', imageRendering: 'pixelated' }} />
                      : <div style={{
                          width: 180, height: 180, borderRadius: '0.75rem',
                          backgroundColor: '#D8DAE4', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.75rem', color: '#9CA3AF',
                        }}>
                          Generando QR...
                        </div>
                    }
                  </div>

                  <p style={{ fontSize: '0.8125rem', color: '#6B7280', textAlign: 'center', margin: 0 }}>
                    Escanea con la cámara de tu móvil o tablet para abrir la app
                  </p>

                  {/* URL copiable */}
                  <div style={{
                    width: '100%', backgroundColor: '#CDD0DC', borderRadius: '0.875rem',
                    padding: '0.75rem 1rem', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: '0.5rem',
                    boxShadow: 'inset 3px 3px 6px rgba(130,142,170,0.45),inset -3px -3px 6px rgba(255,255,255,0.45)',
                  }}>
                    <p style={{ fontSize: '0.75rem', color: '#2D3561', fontWeight: 600,
                      margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {appUrl}
                    </p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(appUrl) }}
                      style={{
                        padding: '0.375rem 0.75rem', borderRadius: '0.5rem',
                        backgroundColor: '#D8DAE4', border: 'none',
                        fontSize: '0.75rem', fontWeight: 700, color: '#FF5722',
                        cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
                        boxShadow: '3px 3px 6px rgba(163,177,198,0.5),-3px -3px 6px rgba(255,255,255,0.6)',
                      }}
                    >
                      Copiar
                    </button>
                  </div>

                  {/* Instrucciones iOS */}
                  <div style={{
                    width: '100%', backgroundColor: '#CDD0DC', borderRadius: '1rem', padding: '0.875rem',
                    boxShadow: 'inset 4px 4px 8px rgba(163,177,198,0.5),inset -4px -4px 8px rgba(255,255,255,0.6)',
                  }}>
                    <p style={{ fontWeight: 700, color: '#2D3561', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                      📱 iPhone / iPad (Safari)
                    </p>
                    {['Abre la URL en Safari',
                      'Toca el ícono de compartir ⬆️',
                      'Selecciona "Agregar a pantalla de inicio"',
                    ].map((s, i) => (
                      <p key={i} style={{ fontSize: '0.75rem', color: '#6B7280', margin: '0.25rem 0' }}>
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
