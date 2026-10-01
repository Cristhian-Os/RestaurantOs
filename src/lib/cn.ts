/** Une clases de Tailwind ignorando valores falsos: cn('a', cond && 'b') */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
