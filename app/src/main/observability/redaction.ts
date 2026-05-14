export function redactDiagnosticsText(value: string): string {
  return value
    .replace(/(authorization:\s*bearer\s+)[^\s"']+/gi, '$1<redacted>')
    .replace(
      /((?:api[_-]?key|token|secret|password|bearer)[\w-]*\s*[=:]\s*)[^\s"']+/gi,
      '$1<redacted>'
    )
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, '<redacted>')
}

export function sanitizeActivityDetail(value: unknown, maxLength = 180): string {
  const text = typeof value === 'string' ? value : String(value ?? '')
  if (!text.trim()) {
    return ''
  }

  return redactDiagnosticsText(text).replace(/\s+/g, ' ').trim().slice(0, maxLength)
}
