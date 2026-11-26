/**
 * enlaces.ts — enlaces de "un clic" para que el dueño envíe él mismo un mensaje ya aprobado (WhatsApp o correo) con el texto escrito.
 * Central NO envía nada: abre la app de WhatsApp o el correo del propio dueño y él toca "enviar". Se prueban con:  node src/central/enlaces.test.ts
 */

/** Teléfono listo para wa.me: solo dígitos y con indicativo. Un celular colombiano de 10 dígitos (empieza por 3) lleva el 57. `null` si no parece un teléfono de WhatsApp. */
export function telefonoWhatsapp(tel: string | null | undefined): string | null {
  let d = String(tel ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (/^3\d{9}$/.test(d)) d = `57${d}`
  return /^\d{11,15}$/.test(d) ? d : null
}

export function enlaceWhatsapp(tel: string | null | undefined, texto: string): string | null {
  const n = telefonoWhatsapp(tel)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null
}

export function enlaceCorreo(correo: string | null | undefined, asunto: string, cuerpo: string): string | null {
  const c = String(correo ?? '').trim()
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(c) ? `mailto:${c}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}` : null
}
