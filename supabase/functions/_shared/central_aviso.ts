// Aviso corto a TU Telegram desde las funciones de Central (solo salida). El token y tu chat_id viven solo en el servidor.
// Nunca se escribe ni se devuelve la respuesta de Telegram; solo si salió bien. Sin llaves configuradas no hace nada.
import { cargarLlaves } from './central_llaves.ts'

type Cliente = Parameters<typeof cargarLlaves>[0]

export async function avisarTelegram(admin: Cliente, texto: string, max = 500): Promise<'enviado' | 'sin_configurar' | 'falla'> {
  try {
    const llaves = await cargarLlaves(admin)
    const token = llaves.leer('CENTRAL_TELEGRAM_TOKEN'), chat = llaves.leer('CENTRAL_TELEGRAM_CHAT_ID')
    if (!token || !chat) return 'sin_configurar'
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto.trim().slice(0, max), disable_web_page_preview: true }),
    })
    return r.ok ? 'enviado' : 'falla'
  } catch { return 'falla' }
}
