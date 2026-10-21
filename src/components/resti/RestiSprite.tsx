/** Resti: chef 2.5D sin rostro, en SVG (respaldo mientras no estén los sprites webp). Lienzo 197×329, origen en los pies. */
export type RestiPose = 'wave' | 'walk' | 'click' | 'think'

const BLANCO = '#FFFFFF', SOMBRA = '#E6DAC8', PIEL = '#F4E3CC', NARANJA = '#F26A1B', OSCURO = '#3A3A42'

/** Brazo: cuelga del hombro (x,y) y gira `deg` grados (0 = hacia abajo, -90 = hacia la derecha de la imagen). */
const Brazo = ({ x, y, deg }: { x: number; y: number; deg: number }) => (
  <g transform={`rotate(${deg} ${x} ${y})`}>
    <rect x={x - 11} y={y - 6} width={22} height={74} rx={11} fill={BLANCO} stroke={SOMBRA} strokeWidth={2} />
    <circle cx={x} cy={y + 72} r={11} fill={PIEL} />
  </g>
)

export function RestiSprite({ pose = 'wave', width = 84, mirarDerecha = false }: { pose?: RestiPose; width?: number; mirarDerecha?: boolean }) {
  const der = pose === 'wave' ? -160 : pose === 'click' ? -90 : pose === 'think' ? -148 : 14
  const izq = pose === 'walk' ? -14 : -4
  const paso = pose === 'walk' ? 8 : 0
  return (
    <svg viewBox="0 0 197 329" width={width} height={Math.round(width * 329 / 197)} role="img" aria-label="Resti, tu chef asistente"
      style={{ display: 'block', transformOrigin: '50% 100%', transform: mirarDerecha ? 'scaleX(-1)' : undefined }}>
      <ellipse cx={98} cy={322} rx={46} ry={6} fill="#000" opacity={0.12} />
      {/* piernas y zapatos */}
      <rect x={72 - paso} y={272} width={24} height={44} rx={10} fill={OSCURO} />
      <rect x={102 + paso} y={272} width={24} height={44} rx={10} fill={OSCURO} />
      <ellipse cx={80 - paso} cy={317} rx={17} ry={8} fill={NARANJA} />
      <ellipse cx={118 + paso} cy={317} rx={17} ry={8} fill={NARANJA} />
      {/* brazos detrás del cuerpo */}
      <Brazo x={56} y={162} deg={izq} />
      <Brazo x={142} y={162} deg={der} />
      {/* chaqueta y delantal */}
      <rect x={54} y={146} width={90} height={136} rx={24} fill={BLANCO} stroke={SOMBRA} strokeWidth={2} />
      <path d="M70 232h58v40a10 10 0 0 1-10 10H80a10 10 0 0 1-10-10z" fill={NARANJA} />
      {[176, 200].map(cy => <g key={cy}><circle cx={86} cy={cy} r={4} fill={NARANJA} /><circle cx={112} cy={cy} r={4} fill={NARANJA} /></g>)}
      {/* cabeza sin rostro */}
      <ellipse cx={99} cy={112} rx={35} ry={38} fill={PIEL} />
      <path d="M72 100q27 -26 54 0" fill="none" stroke={SOMBRA} strokeWidth={2} opacity={0.6} />
      {/* gorro */}
      <circle cx={68} cy={52} r={26} fill={BLANCO} stroke={SOMBRA} strokeWidth={2} />
      <circle cx={130} cy={52} r={26} fill={BLANCO} stroke={SOMBRA} strokeWidth={2} />
      <circle cx={99} cy={38} r={32} fill={BLANCO} stroke={SOMBRA} strokeWidth={2} />
      <rect x={66} y={62} width={66} height={38} rx={10} fill={BLANCO} stroke={SOMBRA} strokeWidth={2} />
      <rect x={66} y={86} width={66} height={8} fill={NARANJA} />
      {pose === 'think' && <g fill={NARANJA}><circle cx={150} cy={34} r={4} /><circle cx={162} cy={22} r={5} /><circle cx={178} cy={10} r={6} /></g>}
    </svg>
  )
}

/** Solo el gorro: así vive Resti cuando está guardado. */
export function RestiHat({ size = 58 }: { size?: number }) {
  return (
    <svg viewBox="30 4 140 100" width={size * 0.8} height={size * 0.8 * 100 / 140} aria-hidden="true" style={{ display: 'block' }}>
      <circle cx={68} cy={52} r={26} fill={BLANCO} stroke={SOMBRA} strokeWidth={3} />
      <circle cx={130} cy={52} r={26} fill={BLANCO} stroke={SOMBRA} strokeWidth={3} />
      <circle cx={99} cy={38} r={32} fill={BLANCO} stroke={SOMBRA} strokeWidth={3} />
      <rect x={66} y={62} width={66} height={38} rx={10} fill={BLANCO} stroke={SOMBRA} strokeWidth={3} />
      <rect x={66} y={86} width={66} height={8} fill={NARANJA} />
    </svg>
  )
}
