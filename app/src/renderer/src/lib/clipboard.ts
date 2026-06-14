// Clipboard write with fallbacks. The native Electron clipboard (via IPC) is
// tried first: it is reliable from any renderer context, including inside a
// Radix Dialog focus scope where BOTH navigator.clipboard (focus/secure-context
// rejection) and the execCommand path (the hidden textarea lands outside the
// dialog's trapped focus scope, so it can't be selected) silently fail.
export async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    const writeClipboard = window.ordinus?.system?.writeClipboard
    if (writeClipboard) {
      await writeClipboard(value)
      return true
    }
  } catch {
    // Fall through to the browser paths below.
  }

  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    // Fall through to the legacy path below.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch {
    return false
  }
}
