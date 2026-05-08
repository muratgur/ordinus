export function extractTrustedHttpsUrl(value: string, isTrusted: (url: URL) => boolean): string {
  const candidates = value.match(/https:\/\/[^\s]+/g) ?? []

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate)
      if (isTrusted(url)) {
        return candidate
      }
    } catch {
      continue
    }
  }

  return ''
}
