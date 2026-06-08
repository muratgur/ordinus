// ADR-029 §9 / M6 — In-memory pending-confirmation store.
//
// The destructive-tool gate works like this:
//
//   1. The MCP server receives a tool call. The tool's manifest has
//      capability:'destructive' and the registry resolves
//      requiresConfirmation:true.
//   2. The server calls `createPending(...)` here, which returns a Promise
//      that will resolve when the user clicks Approve or Cancel in the
//      renderer panel.
//   3. The server publishes a `confirmation_requested` event so the
//      renderer paints the panel.
//   4. The server awaits the Promise. The CLI's HTTP request stays open in
//      the meantime — MCP is long-running by design, so that's fine.
//   5. The renderer calls `ordinus.resolveConfirmation` with the user's
//      decision. The IPC handler calls `resolve()` here, the Promise fires,
//      and the MCP server resumes — running the tool on approve, returning
//      a structured "cancelled" outcome otherwise.
//
// Lifetime: pending entries live in-process for the lifetime of the app or
// until resolved. They are NOT persisted; an app restart drops them and the
// CLI request that was awaiting will time out / error, which is the right
// behaviour ("never approved" ≈ "cancelled").
//
// No timeout enforcement here — ADR §9 explicitly says "no auto-timeout, no
// auto-decline." If the user walks away, the panel stays pending until they
// come back or the app restarts.

import { randomUUID } from 'node:crypto'
import type { OrdinusConfirmationDecision, OrdinusPendingConfirmation } from '@shared/contracts'

type StoredPending = {
  payload: OrdinusPendingConfirmation
  resolve: (decision: OrdinusConfirmationDecision) => void
}

const pending = new Map<string, StoredPending>()

export type CreatePendingInput = Omit<OrdinusPendingConfirmation, 'pendingId' | 'createdAt'>

export type CreatePendingResult = {
  pending: OrdinusPendingConfirmation
  promise: Promise<OrdinusConfirmationDecision>
}

/**
 * Register a new pending confirmation. Returns the stable payload (with
 * generated id + createdAt) plus a Promise that fires when `resolve()` is
 * called for the same id.
 */
export function createPendingConfirmation(input: CreatePendingInput): CreatePendingResult {
  const pendingId = `ocf-${randomUUID()}`
  const createdAt = new Date().toISOString()
  const payload: OrdinusPendingConfirmation = { ...input, pendingId, createdAt }

  let resolveFn!: (decision: OrdinusConfirmationDecision) => void
  const promise = new Promise<OrdinusConfirmationDecision>((res) => {
    resolveFn = res
  })

  pending.set(pendingId, { payload, resolve: resolveFn })

  return { pending: payload, promise }
}

/**
 * Resolve a pending confirmation. Returns the resolved payload (so the IPC
 * handler can emit a `confirmation_resolved` event with the same id) or
 * null if the id was unknown / already resolved (idempotent caller).
 */
export function resolvePendingConfirmation(
  pendingId: string,
  decision: OrdinusConfirmationDecision
): OrdinusPendingConfirmation | null {
  const entry = pending.get(pendingId)
  if (!entry) return null
  pending.delete(pendingId)
  entry.resolve(decision)
  return entry.payload
}

/**
 * Snapshot of every currently-pending confirmation. Used by the renderer on
 * mount to rehydrate the panel — if the user navigated away while a
 * confirmation was pending, the panel needs to reappear when they come back.
 */
export function listPendingConfirmations(): OrdinusPendingConfirmation[] {
  return Array.from(pending.values())
    .map((entry) => entry.payload)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
}
