import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { StoredCredential } from './types'

// Each entry is `<prefix><base64 payload>`. Base64 (standard or URL-safe)
// never contains ':', so the colon-prefixed marker is an unambiguous
// discriminator. Legacy entries from earlier builds have no prefix.
const SAFE_PREFIX = 'safe:'
const PLAIN_PREFIX = 'plain:'

function vaultPath(): string {
  return join(app.getPath('userData'), 'connector-credentials.json')
}

function readVault(): Record<string, string> {
  const path = vaultPath()
  if (!existsSync(path)) {
    return {}
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

function writeVault(vault: Record<string, string>): void {
  const path = vaultPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(vault), { encoding: 'utf8', mode: 0o600 })
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

let plainFallbackWarned = false

function warnPlainFallback(): void {
  if (plainFallbackWarned) return
  plainFallbackWarned = true
  console.error(
    `[ordinus] SECURITY WARNING: OS credential encryption is unavailable; ` +
      `connector OAuth tokens will be stored as PLAIN TEXT at ${vaultPath()}. ` +
      `This path runs only in dev builds (!app.isPackaged). ` +
      `Do not connect production accounts.`
  )
}

function encodeEntry(value: unknown): string {
  const json = JSON.stringify(value)
  if (canEncrypt()) {
    // If safeStorage reports availability but encryptString still throws, the
    // failure is anomalous and should propagate even in dev — silently
    // downgrading to plain text would mask a real bug.
    return SAFE_PREFIX + safeStorage.encryptString(json).toString('base64')
  }
  if (app.isPackaged) {
    throw new Error('OS credential encryption is unavailable; cannot store connector credentials.')
  }
  // Dev fallback. The most common trigger is a Linux dev machine without a
  // libsecret-compatible keyring agent (or with DBus stripped from the
  // child-process env allowlist). macOS/Windows dev builds typically pass
  // canEncrypt() and never reach this branch.
  warnPlainFallback()
  return PLAIN_PREFIX + Buffer.from(json, 'utf8').toString('base64')
}

type DecodeOutcome<T> = { kind: 'value'; value: T; needsRewrite: boolean } | { kind: 'error' }

function decodeRaw<T>(raw: string): DecodeOutcome<T> {
  if (raw.startsWith(PLAIN_PREFIX)) {
    // plain: entries can only originate from a dev write. Encountering one
    // in a packaged build means either a stale dev file was carried over or
    // the vault was tampered with — refuse to honor it.
    if (app.isPackaged) {
      console.error(
        '[ordinus] Refusing to read a plain-text vault entry in a packaged build. ' +
          `Entry will be ignored. Path: ${vaultPath()}`
      )
      return { kind: 'error' }
    }
    try {
      const value = JSON.parse(
        Buffer.from(raw.slice(PLAIN_PREFIX.length), 'base64').toString('utf8')
      ) as T
      return { kind: 'value', value, needsRewrite: false }
    } catch {
      return { kind: 'error' }
    }
  }

  if (raw.startsWith(SAFE_PREFIX)) {
    try {
      const value = JSON.parse(
        safeStorage.decryptString(Buffer.from(raw.slice(SAFE_PREFIX.length), 'base64'))
      ) as T
      return { kind: 'value', value, needsRewrite: false }
    } catch {
      return { kind: 'error' }
    }
  }

  // Legacy entries: earlier builds stored the raw safeStorage ciphertext as
  // base64 without a prefix. Try the historical path and signal a rewrite so
  // a successful read upgrades the entry to the current format.
  try {
    const value = JSON.parse(safeStorage.decryptString(Buffer.from(raw, 'base64'))) as T
    return { kind: 'value', value, needsRewrite: true }
  } catch {
    return { kind: 'error' }
  }
}

function setEntry(key: string, value: unknown): void {
  const vault = readVault()
  vault[key] = encodeEntry(value)
  writeVault(vault)
}

function getEntry<T>(key: string): T | null {
  const raw = readVault()[key]
  if (!raw) {
    return null
  }
  const outcome = decodeRaw<T>(raw)
  if (outcome.kind !== 'value') {
    return null
  }
  if (outcome.needsRewrite) {
    // Idempotent migration. Failure is non-fatal: the caller still gets the
    // decoded value, and the next read simply retries the legacy path.
    try {
      setEntry(key, outcome.value)
    } catch {
      // ignore
    }
  }
  return outcome.value
}

function deleteEntry(key: string): void {
  const vault = readVault()
  delete vault[key]
  writeVault(vault)
}

const tokenKey = (connectorId: string): string => `tok:${connectorId}`

export function storeCredential(connectorId: string, credential: StoredCredential): void {
  setEntry(tokenKey(connectorId), credential)
}

export function readCredential(connectorId: string): StoredCredential | null {
  return getEntry<StoredCredential>(tokenKey(connectorId))
}

export function deleteCredential(connectorId: string): void {
  deleteEntry(tokenKey(connectorId))
}

export function hasCredential(connectorId: string): boolean {
  // Validate readability so the "connected" badge never lies. A raw entry can
  // exist while being undecodable: legacy ciphertext on a build where
  // safeStorage broke, a plain: entry in a packaged build, corrupted bytes.
  return readCredential(connectorId) !== null
}
