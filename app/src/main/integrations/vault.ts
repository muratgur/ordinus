import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { StoredCredential } from './types'

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

function assertEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS credential encryption is unavailable; cannot store connector credentials.')
  }
}

function setEntry(key: string, value: unknown): void {
  assertEncryptionAvailable()
  const vault = readVault()
  vault[key] = safeStorage.encryptString(JSON.stringify(value)).toString('base64')
  writeVault(vault)
}

function getEntry<T>(key: string): T | null {
  const raw = readVault()[key]
  if (!raw) {
    return null
  }
  assertEncryptionAvailable()
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(raw, 'base64'))) as T
  } catch {
    return null
  }
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
  return Boolean(readVault()[tokenKey(connectorId)])
}
