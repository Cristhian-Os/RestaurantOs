/**
 * QRMenu.tsx — QR del menú para imprimir/mostrar en mesa
 * El admin ve esto y puede generar un QR por número de mesa
 */
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'

const S = {
  out:   { boxShadow: '8px 8px 16px rgba(130,142,170,0.55),-8px -8px 16px rgba(255,255,255,0.55)' },
  outSm: { boxShadow: '4px 4px 10px rgba(130,142,170,0.5),-4px -4px 10px rgba(255,255,255,0.5)' },
  in:    { boxShadow: 'inset 5px 5px 10px rgba(130,142,170,0.5),inset -5px -5px 10px rgba(255,255,255,0.5)' },
  coral: { boxShadow: '8px 8px 16px rgba(255,87,34,0.32),-4px -4px 12px rgba(255,255,255,0.45)' },
} as const

const BASE_URL = window.location.origin

function buildMenuUrl(mesa?: string) {
  return mesa ? `${BASE_URL}/menu?mesa=${mesa}` : `${BASE_URL}/menu`
}

async function generateQR(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 300,
    margin: 2,
    color: { dark: '#2D3561', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  })
}

export function QRMenu() {
  const [mesa,      setMesa]      = useState('')
  const [qrUrl,     setQrUrl]     = useState('')
  const [menuUrl,   setMenuUrl]   = useState(buildMenuUrl())
  const [showModal, setShowModal] = useState(false)
  const [printing,  setPrinting]  = useState(false)

  // Generar QR genérico al montar
  useEffect(() => {
    generateQR(buildMenuUrl()).then(setQrUrl)
  }, [])

  const handleGenerate = useCallback(async () => {
    const url = buildMenuUrl(mesa.trim() || undefined)
    setMenuUrl(url)
    const dataUrl = await generateQR(url)
    setQrUrl(dataUrl)
    setShowModal(true)
  }, [mesa])

  const handleDownload = useCallback(() => {
    if (!qrUrl) return
    const a = document.createElement('a')
    a.href = qrUrl
    a.download = mesa ? `qr-menu-mesa-${mesa}.png` : 'qr-menu-restaurantos.png'
    a.click()
  }, [qrUrl, mesa])

  const handlePrint = useCallback(() => {
    if (!qrUrl) return
    setPrinting(true)
    const win = window.open('', '_blank')
    if (!win) { setPrinting(false); return }
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>QR Menú${mesa ? ` — Mesa ${mesa}` : ''}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 100vh;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: #ffffff; padding: 2rem;
    }
    .card {
      border: 3px solid #2D3561; border-radius: 24px;
      padding: 2rem; text-align: center; max-width: 320px;
      background: #F8F9FB;
    }
    .logo { width: 64px; height: 64px; object-fit: contain;
      border-radius: 16px; margin: 0 auto 1rem; display: block; }
    h1 { font-size: 1.5rem; color: #2D3561; font-weight: 800; margin-bottom: 0.25rem; }
    .mesa { font-size: 1.125rem; color: #FF5722; font-weight: 700; margin-bottom: 1rem; }
    img.qr { width: 240px; height: 240px; margin: 0 auto 1rem; display: block; }
    p { font-size: 0.875rem; color: #6B7280; line-height: 1.5; }
    .url { font-size: 0.7rem; color: #9CA3AF; margin-top: 0.5rem; word-break: break-all; }
    .line { width: 60px; height: 3px; background: #FF5722; border-radius: 2px; margin: 1rem auto; }
  </style>
</head>
<body>
  <div class="card">
    <img class="logo" src="${BASE_URL}/logo.jpg" alt="Logo" />
    <h1>Heladería Doña María</h1>
    ${mesa ? `<p class="mesa">Mesa ${mesa}</p>` : '<p class="mesa">Menú Digital</p>'}
    <div class="line"></div>
    <img class="qr" src="${qrUrl}" alt="QR Menú" />
    <p>📱 Escanea con tu cámara para ver el menú y hacer tu pedido</p>
    <p class="url">${menuUrl}</p>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); window.close(); }, 500);
    };
  </script>
</body>
</html>`)
    win.document.close()
    setTimeout(() => setPrinting(false), 2000)
  }, [qrUrl, menuUrl, mesa])

  return (
    <>
      {/* ── Card principal ── */}
      <div style={{
        backgroundColor: '#D8DAE4', borderRadius: '1.5rem', padding: '1.5rem',
        display: 'flex', flexDirection: 'column', gap: '1.25rem',
        ...S.out,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '0.875rem', flexShrink: 0,
            backgroundColor: '#2D3561', display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...S.coral,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} style={{ width: 24, height: 24 }}>
              <rect x="3" y="3" width="5" height="5" rx="0.5"/>
              <rect x="16" y="3" width="5" height="5" rx="0.5"/>
              <rect x="3" y="16" width="5" height="5" rx="0.5"/>
              <rect x="4" y="4" width="3" height="3" fill="white" stroke="none"/>
              <rect x="17" y="4" width="3" height="3" fill="white" stroke="none"/>
              <rect x="4" y="17" width="3" height="3" fill="white" stroke="none"/>
              <path d="M16 16h2v2h-2zM18 18h2v2h-2zM16 20h2v2h-2zM20 16h2" stroke="white"/>
            </svg>
          </div>
          <div>
            <p style={{ fontWeight: 700, color: '#2D3561', fontSize: '1rem', margin: 0 }}>
              QR del Menú para clientes
            </p>
            <p style={{ fontSize: '0.75rem', color: '#9CA3AF', margin: 0 }}>
              Los clientes escanean y ven el menú desde su celular
            </p>
          </div>
        </div>

        {/* Preview QR genérico */}
        {qrUrl && (
          <div style={{
            display: 'flex', justifyContent: 'center',
            backgroundColor: '#CDD0DC', borderRadius: '1.25rem', padding: '1.25rem',
            ...S.in,
          }}>
            <div style={{ textAlign: 'center' }}>
              <img src={qrUrl} alt="QR Menú"
                style={{ width: 160, height: 160, imageRendering: 'pixelated', borderRadius: '0.5rem' }} />
              <p style={{ fontSize: '0.7rem', color: '#9CA3AF', marginTop: '0.5rem' }}>
                Menú general · sin mesa
              </p>
            </div>
          </div>
        )}

        {/* Selector de mesa */}
        <div>
          <label style={{
            display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#9CA3AF',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem',
          }}>
            Generar QR para una mesa específica (opcional)
          </label>
          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <input
              type="number" min="1" max="99" value={mesa}
              onChange={e => setMesa(e.target.value)}
              placeholder="Nº mesa"
              style={{
                flex: 1, backgroundColor: '#CDD0DC', borderRadius: '0.875rem',
                padding: '0.75rem 1rem', border: 'none', outline: 'none',
                fontSize: '1rem', color: '#2D3561', fontFamily: 'inherit', fontWeight: 600,
                textAlign: 'center',
                ...S.in,
              }}
            />
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleGenerate}
              style={{
                padding: '0.75rem 1.25rem', borderRadius: '0.875rem', border: 'none',
                backgroundColor: '#FF5722', color: '#fff', fontWeight: 700,
                fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                ...S.coral,
              }}
            >
              Generar
            </motion.button>
          </div>
        </div>

        {/* Acciones rápidas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
          <motion.button whileTap={{ scale: 0.97 }}
            onClick={() => { setMesa(''); handleGenerate() }}
            style={{
              padding: '0.75rem', borderRadius: '0.875rem', border: 'none',
              backgroundColor: '#D8DAE4', color: '#6B7280', fontWeight: 700,
              fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
              ...S.outSm,
            }}>
            📋 Ver menú general
          </motion.button>
          <motion.button whileTap={{ scale: 0.97 }}
            onClick={handleDownload}
            style={{
              padding: '0.75rem', borderRadius: '0.875rem', border: 'none',
              backgroundColor: '#D8DAE4', color: '#6B7280', fontWeight: 700,
              fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
              ...S.outSm,
            }}>
            ⬇️ Descargar QR
          </motion.button>
          <motion.button whileTap={{ scale: 0.97 }}
            onClick={handlePrint}
            disabled={printing}
            style={{
              padding: '0.75rem', borderRadius: '0.875rem', border: 'none',
              backgroundColor: '#D8DAE4', color: '#6B7280', fontWeight: 700,
              fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
              gridColumn: '1 / -1',
              ...S.outSm,
            }}>
            🖨️ {printing ? 'Abriendo impresión...' : 'Imprimir QR de mesa'}
          </motion.button>
        </div>

        {/* Link directo */}
        <div style={{
          backgroundColor: '#CDD0DC', borderRadius: '0.875rem', padding: '0.75rem 1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
          ...S.in,
        }}>
          <p style={{ fontSize: '0.7rem', color: '#2D3561', fontWeight: 600,
            margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            🔗 {BASE_URL}/menu
          </p>
          <button
            onClick={() => navigator.clipboard.writeText(`${BASE_URL}/menu`)}
            style={{
              padding: '0.25rem 0.625rem', borderRadius: '0.5rem',
              border: 'none', backgroundColor: '#D8DAE4',
              fontSize: '0.7rem', fontWeight: 700, color: '#FF5722',
              cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
              ...S.outSm,
            }}>
            Copiar
          </button>
        </div>
      </div>

      {/* ── Modal QR grande (por mesa) ── */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              backgroundColor: 'rgba(45,53,97,0.55)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
            }}>
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              onClick={e => e.stopPropagation()}
              style={{
                backgroundColor: '#D8DAE4', borderRadius: '1.5rem',
                padding: '2rem', textAlign: 'center',
                width: '100%', maxWidth: '340px',
                boxShadow: '12px 12px 32px rgba(163,177,198,0.7),-12px -12px 32px rgba(255,255,255,0.8)',
              }}>
              {/* Logo */}
              <div style={{ width: 56, height: 56, borderRadius: '1rem', overflow: 'hidden', margin: '0 auto 0.75rem', ...S.outSm }}>
                <img src="/logo.jpg" alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <h3 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, color: '#2D3561', fontSize: '1.125rem', marginBottom: '0.25rem' }}>
                Menú Digital
              </h3>
              {mesa && (
                <p style={{ color: '#FF5722', fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem' }}>
                  Mesa {mesa}
                </p>
              )}

              {/* QR grande */}
              <div style={{
                backgroundColor: '#ffffff', borderRadius: '1rem', padding: '1rem',
                display: 'inline-block', margin: '0.5rem auto 1rem',
                ...S.in,
              }}>
                {qrUrl && <img src={qrUrl} alt="QR" style={{ width: 220, height: 220, imageRendering: 'pixelated', display: 'block' }} />}
              </div>

              <p style={{ fontSize: '0.8125rem', color: '#6B7280', marginBottom: '1.25rem' }}>
                📱 Escanea con la cámara para ver el menú y pedir desde tu mesa
              </p>

              {/* Acciones */}
              <div style={{ display: 'flex', gap: '0.625rem' }}>
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={handleDownload}
                  style={{
                    flex: 1, padding: '0.75rem', borderRadius: '0.875rem', border: 'none',
                    backgroundColor: '#D8DAE4', color: '#6B7280', fontWeight: 700,
                    fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit',
                    ...S.outSm,
                  }}>
                  ⬇️ Descargar
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={handlePrint}
                  style={{
                    flex: 1, padding: '0.75rem', borderRadius: '0.875rem', border: 'none',
                    backgroundColor: '#FF5722', color: '#fff', fontWeight: 700,
                    fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit',
                    ...S.coral,
                  }}>
                  🖨️ Imprimir
                </motion.button>
              </div>
              <button onClick={() => setShowModal(false)}
                style={{
                  marginTop: '0.75rem', background: 'none', border: 'none',
                  color: '#9CA3AF', fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                Cerrar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
