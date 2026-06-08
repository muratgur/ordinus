// ADR-029 — Ordinus filesystem locations.
//
// Ordinus is a singleton system agent and gets its own private home directory
// under userData. Mirrors getAgentHome() for user agents but with a fixed id
// rather than a UUID — there is one Ordinus per workspace, by design.
//
// Conversation logs follow the same convention as agent conversation logs
// (logs/conversations/<conversationId>/<turnId>) but live under an `ordinus`
// scope so they don't collide with real conversation runs and so future
// observability filters can easily include/exclude them.

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getSystemPaths } from '../paths'

const ORDINUS_DIR_NAME = 'ordinus'

export function getOrdinusHomePath(): string {
  const path = join(getSystemPaths().userData, 'agents', ORDINUS_DIR_NAME)
  mkdirSync(path, { recursive: true })
  return path
}

export function buildOrdinusTurnLogRef(conversationId: string, turnId: string): string {
  return join(ORDINUS_DIR_NAME, conversationId, turnId)
}

export function buildOrdinusTurnLogDir(conversationId: string, turnId: string): string {
  const dir = join(getSystemPaths().logs, buildOrdinusTurnLogRef(conversationId, turnId))
  mkdirSync(dir, { recursive: true })
  return dir
}
