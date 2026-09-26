/**
 * Legal.tsx — Términos y Condiciones + Política de Privacidad
 * ───────────────────────────────────────────────────────────────
 * ⚠️ PLANTILLA con alcance INTERNACIONAL. Es una base sólida para
 * un SaaS que puede operar en varios países, pero DEBE ser revisada
 * por un abogado antes de operar. Edita nombre de empresa y correo.
 */
import { TRIAL_DAYS } from '../config/plans'
import { PROMO_SLOTS } from '../config/content'

const go = (path: string) => { window.location.href = path }

// ── Datos de la empresa (EDITAR) ──
const EMPRESA = {
  nombre: 'RestaurantOS',
  correo: 'soporte@restaurantos.com',
}
const GRACE_DAYS = 7
const PURGE_DAYS = 30

interface Sec { h: string; p: string[]; warn?: boolean }

const TERMINOS: Sec[] = [
  { h: '1. Aceptación y alcance', p: [
    `Al crear una cuenta o usar ${EMPRESA.nombre} ("la Plataforma"), usted ("el Cliente") acepta estos Términos y Condiciones. Si no está de acuerdo, no use la Plataforma.`,
    'La Plataforma está disponible internacionalmente. El Cliente es responsable de cumplir las leyes aplicables en su propio país o jurisdicción al usar el servicio.',
  ]},
  { h: '2. Descripción del servicio', p: [
    `${EMPRESA.nombre} es un software en la nube de gestión para restaurantes y negocios de comida (menú digital, pedidos, mesas, inventario, recetas, cocina, caja y reportes). El servicio se ofrece "tal cual" y "según disponibilidad", y puede evolucionar con el tiempo.`,
  ]},
  { h: '3. Cuentas y responsabilidad', p: [
    'El Cliente es responsable de la veracidad de sus datos, de la seguridad de sus contraseñas y de toda la actividad realizada bajo su cuenta y las de su personal.',
    'El Cliente es el único responsable de la información, precios y contenido que carga sobre su negocio.',
  ]},
  { h: '4. Prueba gratuita y promoción de lanzamiento', p: [
    `La Plataforma ofrece una prueba gratuita de ${TRIAL_DAYS} días, sin necesidad de tarjeta.`,
    `Como promoción de lanzamiento, los primeros ${PROMO_SLOTS} restaurantes registrados reciben el plan Premium sin costo de forma permanente ("gratis de por vida"). Esta promoción es personal, intransferible, aplica solo mientras la cuenta se mantenga activa y conforme a estos Términos, y puede modificarse para futuros registros.`,
  ]},
  { h: '5. Planes, facturación mensual y renovación', p: [
    'Salvo la promoción de lanzamiento, el uso de la Plataforma requiere un plan de pago. Los planes se facturan de forma mensual y recurrente, por adelantado, y se renuevan automáticamente cada mes hasta que el Cliente cancele.',
    'Los precios pueden cambiar avisando con antelación razonable. Salvo que la ley aplicable exija lo contrario, los pagos de periodos ya iniciados no son reembolsables.',
  ]},
  { h: '6. Mora, suspensión y eliminación de la cuenta', warn: true, p: [
    `Si un pago no se realiza en la fecha correspondiente, el Cliente contará con un periodo de gracia de ${GRACE_DAYS} días (una semana) para ponerse al día, durante el cual conserva el acceso a la Plataforma.`,
    `Si transcurrido ese periodo de gracia el pago sigue pendiente, el acceso a la Plataforma será SUSPENDIDO. A partir de la suspensión, los datos del restaurante se conservarán durante ${PURGE_DAYS} días adicionales para permitir la reactivación mediante el pago pendiente.`,
    `Si al cabo de esos ${PURGE_DAYS} días la cuenta continúa sin regularizarse, la cuenta del restaurante —junto con TODOS sus datos— será ELIMINADA de forma permanente e irreversible.`,
    `EL CLIENTE DECLARA CONOCER Y ACEPTAR EXPRESAMENTE que la falta de pago conlleva primero la suspensión del acceso y, tras ${PURGE_DAYS} días sin regularizar, la eliminación definitiva de su restaurante y su información. Se recomienda al Cliente exportar sus datos con anticipación.`,
  ]},
  { h: '7. Cancelación', p: [
    'El Cliente puede cancelar su plan en cualquier momento, sin permanencia. El servicio se mantiene activo hasta el final del periodo ya pagado.',
  ]},
  { h: '8. Uso aceptable', p: [
    'El Cliente se compromete a no usar la Plataforma para fines ilegales, a no vulnerar su seguridad, ni a intentar acceder a datos de otros restaurantes.',
  ]},
  { h: '9. Propiedad de los datos', p: [
    'Los datos operativos de cada restaurante pertenecen al Cliente y están aislados del resto. Mientras la cuenta esté activa y al día, el Cliente puede solicitar una copia o la eliminación de sus datos.',
    `${EMPRESA.nombre} conserva la propiedad del software, la marca y el código de la Plataforma.`,
  ]},
  { h: '10. Limitación de responsabilidad', p: [
    `${EMPRESA.nombre} hace su mejor esfuerzo por mantener el servicio disponible y seguro, pero no garantiza operación ininterrumpida ni libre de errores. En la máxima medida permitida por la ley aplicable, no seremos responsables por lucro cesante, pérdida de datos o daños indirectos, incidentales o consecuentes derivados del uso o imposibilidad de uso de la Plataforma. Nuestra responsabilidad total se limita al valor pagado por el Cliente en los últimos tres (3) meses.`,
  ]},
  { h: '11. Cambios y ley aplicable', p: [
    'Podemos actualizar estos Términos; los cambios se publicarán en la Plataforma y el uso continuado implica aceptación.',
    `Estos Términos se rigen por la legislación aplicable en la jurisdicción donde ${EMPRESA.nombre} tiene su domicilio principal, sin perjuicio de los derechos irrenunciables que la ley de su país de residencia le otorgue como consumidor.`,
    `Contacto: ${EMPRESA.correo}`,
  ]},
]

const PRIVACIDAD: Sec[] = [
  { h: '1. Responsable del tratamiento', p: [
    `${EMPRESA.nombre} es responsable del tratamiento de los datos personales recolectados a través de la Plataforma. Correo de contacto: ${EMPRESA.correo}.`,
  ]},
  { h: '2. Datos que recolectamos', p: [
    'Datos de la cuenta: nombre, correo electrónico, teléfono y datos del restaurante.',
    'Datos operativos: pedidos, productos, inventario y reportes que el Cliente genera al usar la Plataforma.',
    'Datos de facturación necesarios para procesar los pagos de los planes.',
  ]},
  { h: '3. Finalidad', p: [
    'Usamos los datos para prestar el servicio, administrar cuentas, procesar pagos, brindar soporte y mejorar la Plataforma.',
  ]},
  { h: '4. Seguridad y ubicación', p: [
    'La información se almacena en servidores seguros en la nube y puede procesarse en distintos países. Aplicamos medidas técnicas para proteger los datos y aislar la información de cada restaurante.',
  ]},
  { h: '5. Sus derechos', p: [
    'Cumplimos con las leyes de protección de datos aplicables (por ejemplo, el RGPD europeo y la Ley 1581 de 2012 de Colombia, entre otras). El titular puede conocer, actualizar, rectificar, portar y solicitar la eliminación de sus datos, así como revocar su autorización.',
    `Para ejercer estos derechos, escriba a ${EMPRESA.correo}.`,
  ]},
  { h: '6. Conservación y eliminación', p: [
    `Conservamos los datos mientras la cuenta esté activa. En caso de falta de pago, tras la suspensión los datos se conservan ${PURGE_DAYS} días para permitir la reactivación y luego se eliminan de forma permanente. En caso de cancelación voluntaria, los datos podrán borrarse conforme a los Términos y Condiciones.`,
  ]},
  { h: '7. Cambios', p: [
    'Podemos actualizar esta política. Los cambios se publicarán en la Plataforma con su fecha de vigencia.',
  ]},
]

export default function Legal() {
  const isPrivacy = window.location.pathname.startsWith('/privacidad')
  const secs  = isPrivacy ? PRIVACIDAD : TERMINOS
  const title = isPrivacy ? 'Política de Privacidad' : 'Términos y Condiciones'

  return (
    <div style={{ background: 'var(--w-bg)', color: 'var(--w-ink)', minHeight: '100vh', fontFamily: 'var(--w-sans)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        <button onClick={() => go('/')} className="w-press"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--w-ink-mut)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '1.5rem' }}>
          ← Volver al inicio
        </button>

        <h1 className="ed-display" style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', fontWeight: 600, margin: '0 0 0.5rem' }}>{title}</h1>
        <p className="ed-body" style={{ fontSize: '0.85rem', color: 'var(--w-ink-mut)', marginBottom: '2.5rem' }}>
          Última actualización: {new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        {secs.map(s => (
          <div key={s.h} style={{ marginBottom: '2rem' }}>
            <h2 className="ed-display" style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.75rem', color: s.warn ? 'var(--w-wine)' : undefined }}>{s.h}</h2>
            <div style={s.warn ? { borderLeft: '3px solid var(--w-wine)', paddingLeft: '1rem' } : undefined}>
              {s.p.map((txt, i) => (
                <p key={i} className="ed-body" style={{ fontSize: '0.95rem', color: 'var(--w-ink-soft)', lineHeight: 1.7, margin: '0 0 0.75rem' }}>{txt}</p>
              ))}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
          <button onClick={() => go('/terminos')} className="w-press" style={{ fontSize: '0.85rem', color: isPrivacy ? 'var(--w-terra)' : 'var(--w-ink-mut)', fontWeight: isPrivacy ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)' }}>Términos y Condiciones</button>
          <button onClick={() => go('/privacidad')} className="w-press" style={{ fontSize: '0.85rem', color: isPrivacy ? 'var(--w-ink-mut)' : 'var(--w-terra)', fontWeight: isPrivacy ? 400 : 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--w-sans)' }}>Política de Privacidad</button>
        </div>
      </div>
    </div>
  )
}
