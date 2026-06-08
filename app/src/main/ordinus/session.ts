// ADR-029 §6 / M3 — Ordinus conversation orchestrator.
//
// This module is the *only* place that constructs RuntimeConversationTurnInput
// for Ordinus. It treats Ordinus as a phantom agent: fixed identity
// (name="Ordinus", role="assistant"), instructions built from the knowledge
// pack + memory snapshot at session-init time, no user connectors, our
// internal MCP server injected via the new `additionalMcpServers` channel.
//
// Why phantom-agent rather than a parallel runtime stack:
//   - All three provider adapters' sendConversationTurn already encapsulate
//     CLI launching, --resume handling, ADR-013 fresh-session fallback, and
//     log streaming. Duplicating that for Ordinus would diverge over time.
//   - With the additionalMcpServers hook (added in this milestone), the only
//     Ordinus-specific behavior is "what goes in the input", which is exactly
//     what this module owns. The runtime layer stays untouched.
//
// Token-discipline note: the assembled system prompt (knowledge + memory +
// optional persona) is only built when STARTING a conversation, never on
// subsequent turns. After the first turn the CLI's --resume retains the
// prompt via its own session cache; we send just the user message.

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { InteractionAnswer, OrdinusActionEvent } from '@shared/contracts'
import { getDefaultOrdinusConversationTitle } from '@shared/ordinus-title'
import type { OrdinusDatabase } from '../db/database'
import type { ObservabilityService } from '../observability/service'
import type { RuntimeService } from '../runtime/service'
import type {
  RuntimeConversationTurnInput,
  RuntimeConversationTurnResult
} from '../runtime/adapters/types'
import { ensureOrdinusMcpServer } from '../ordinus-mcp/lifecycle'
import { ORDINUS_MCP_SERVER_ID } from '../ordinus-mcp/materialize'
import { buildKnowledgePrompt } from '../ordinus-knowledge'
import { ensureWorkspaceRelativeDirectory, getOrdinusWorkingRoot } from '../workspace/path-policy'
import { buildOrdinusTurnLogDir, buildOrdinusTurnLogRef, getOrdinusHomePath } from './paths'

export type OrdinusSessionDeps = {
  database: OrdinusDatabase
  observability: ObservabilityService
  runtime: RuntimeService
  /**
   * Event publisher passed through to action tools. The session module itself
   * never publishes — only the tools that produce side effects do (M5).
   */
  events: {
    publish(event: OrdinusActionEvent): void
  }
}

export type OrdinusConversationSummary = {
  id: string
  title: string
  providerId: string
  model: string
  providerSessionRef: string | null
  archivedAt: string | null
  pinnedAt: string | null
  frozenReason: string | null
  createdAt: string
  updatedAt: string
}

export type OrdinusTurnOutcome = {
  conversationId: string
  turnId: string
  providerSessionRef: string
  outcome: RuntimeConversationTurnResult['outcome']
  sessionReset: boolean
}

export type OrdinusSessionService = {
  /** Create a new Ordinus conversation row. CLI session is opened lazily on first turn. */
  createConversation(input?: { title?: string }): OrdinusConversationSummary
  listConversations(): OrdinusConversationSummary[]
  /**
   * Send a turn. Lazily ensures the Ordinus MCP server is up, materializes
   * the per-CLI MCP config inside the existing pipeline (no special code
   * path), and dispatches to the runtime service exactly like a normal
   * agent conversation. Updates providerSessionRef on the conversation row.
   */
  sendTurn(input: {
    conversationId: string
    message: string
    displayMessage?: string
  }): Promise<OrdinusTurnOutcome>
  /**
   * Resolve a pending needs_input request: validate the answers, record them
   * as a user transcript turn, and resume the conversation with a continuation
   * message so the CLI picks up where it asked.
   */
  answerInputRequest(input: {
    requestId: string
    answers: InteractionAnswer[]
  }): Promise<OrdinusTurnOutcome>
  isTurnRunning(conversationId: string): boolean
}

export function createOrdinusSessionService(deps: OrdinusSessionDeps): OrdinusSessionService {
  const { database, observability, runtime } = deps
  const runningConversationIds = new Set<string>()
  // `deps.events` is referenced via the closure below (passed into the
  // MCP tool context). Not destructured here so the read site is explicit.

  function readConversation(id: string): OrdinusConversationSummary {
    const all = database.listOrdinusConversations()
    const row = all.find((entry) => entry.id === id)
    if (!row) {
      throw new Error(`Ordinus conversation ${id} not found.`)
    }
    return row
  }

  function assembleSystemPrompt(): string {
    // Compose at session-init only. Order: identity-bearing knowledge first,
    // memory next, tool catalog hint last (the actual catalog reaches the CLI
    // via MCP, not via prompt — we only mention tools exist).
    const knowledge = buildKnowledgePrompt()
    const memory = database.listOrdinusMemory()
    if (memory.length === 0) {
      return knowledge
    }
    const memoryLines = memory
      .map((entry) => `- [${entry.type}] ${entry.name}: ${entry.body}`)
      .join('\n')
    return `${knowledge}\n\n---\n\n# What you remember about this user\n\n${memoryLines}`
  }

  return {
    createConversation(input) {
      const singleton = database.getOrdinusSingleton()
      if (!singleton) {
        throw new Error(
          'Ordinus has no provider configured yet — finish workspace onboarding first.'
        )
      }
      return database.createOrdinusConversation({
        title: input?.title?.trim() || getDefaultOrdinusConversationTitle(),
        providerId: singleton.providerId,
        model: singleton.model
      })
    },

    listConversations() {
      return database.listOrdinusConversations()
    },

    isTurnRunning(conversationId) {
      return runningConversationIds.has(conversationId)
    },

    async sendTurn(input) {
      if (runningConversationIds.has(input.conversationId)) {
        throw new Error('Ordinus is already working on this conversation.')
      }
      const conversation = readConversation(input.conversationId)
      if (conversation.archivedAt) {
        throw new Error('This Ordinus conversation is archived.')
      }
      if (conversation.frozenReason) {
        throw new Error(`This Ordinus conversation is frozen: ${conversation.frozenReason}`)
      }

      const workspace = database.getWorkspaceConfig()
      if (!workspace) {
        throw new Error('No workspace is configured.')
      }

      runningConversationIds.add(conversation.id)
      try {
        // ADR-029 M4.5 — Record the user's message before dispatch so a crash
        // or interruption between here and the runtime response still leaves a
        // visible "the user said this" entry on next load. M5: persist the
        // unexpanded `displayMessage` when present (slash command path), so
        // the transcript shows the user's actual keystrokes rather than the
        // LLM-facing expanded prompt.
        database.appendOrdinusTurn({
          conversationId: conversation.id,
          kind: 'user',
          content: input.displayMessage ?? input.message,
          turnId: null
        })

        // Boot or reuse the singleton MCP server. The handle's URL is the same
        // across turns for the app's lifetime — CLIs reconnect to a stable
        // address every time.
        const mcpHandle = await ensureOrdinusMcpServer({
          database,
          observability,
          runtime,
          events: deps.events
        })

        const turnId = `ot-${randomUUID()}`
        const logRef = buildOrdinusTurnLogRef(conversation.id, turnId)
        const logDir = buildOrdinusTurnLogDir(conversation.id, turnId)

        // Only inject the assembled system prompt for the FIRST turn of a
        // conversation. Subsequent turns rely on --resume so the CLI's session
        // cache holds the prompt — re-sending it would waste tokens AND, for
        // some CLIs, confuse the resume protocol.
        const isFirstTurn = !conversation.providerSessionRef
        const instructions = isFirstTurn ? assembleSystemPrompt() : ''

        // workingRoot must be a workspace-RELATIVE path (validated by
        // WorkspaceRelativePathSchema in the runtime layer). All Ordinus
        // conversations share a single `<workspace>/ordinus/` working folder
        // — Ordinus drives work through MCP tools rather than writing files,
        // so per-conversation subfolders only left empty scratch dirs behind.
        // We still ensure it exists on disk before the CLI runs.
        const workingRoot = getOrdinusWorkingRoot()
        ensureWorkspaceRelativeDirectory(workspace.workspaceRoot, workingRoot)

        const runtimeInput: RuntimeConversationTurnInput = {
          turnId,
          conversationId: conversation.id,
          providerId: conversation.providerId as RuntimeConversationTurnInput['providerId'],
          model: conversation.model,
          // sandbox: NOT 'read-only' — that value maps to "plan mode" for
          // Claude and Gemini, which forbids ALL tool execution including
          // MCP calls (we observed this empirically: Gemini received our
          // tool catalog from MCP, then refused to invoke any of it). The
          // sandbox enum doesn't have a "MCP yes, file edits no" value, so
          // we use 'workspace-write' and rely on:
          //   1. Ordinus's workingRoot being an isolated folder under
          //      `<workspace>/ordinus/` (see getOrdinusWorkingRoot)
          //   2. The system prompt instructing Ordinus to drive work through
          //      MCP tools, not by writing files directly
          // Net effect: Ordinus can call our MCP tools, and the worst-case
          // hallucinated file write lands in a scratch folder we own.
          sandbox: 'workspace-write',
          workspaceRoot: workspace.workspaceRoot,
          workingRoot,
          agentHomePath: getOrdinusHomePath(),
          extraDirectories: [],
          agentName: 'Ordinus',
          agentRole: 'In-app personal assistant',
          instructions,
          connectors: [],
          providerSessionRef: conversation.providerSessionRef,
          message: input.message,
          logRef,
          eventLogPath: join(logDir, 'events.jsonl'),
          lastMessagePath: join(logDir, 'last-message.txt'),
          additionalMcpServers: [
            {
              id: ORDINUS_MCP_SERVER_ID,
              url: mcpHandle.url,
              // Codex exec treats MCP tool approval separately from
              // approval_policy=never. This is safe only for our own loopback
              // server; destructive Ordinus tools still block on the Home
              // confirmation panel before their executors run.
              codexDefaultToolsApprovalMode: 'approve'
            }
          ]
        }

        let result
        try {
          result = await runtime.sendConversationTurn(runtimeInput)
        } catch (err) {
          // ADR-029 M4.5 — Persist the failure so the user sees what happened
          // when they come back to this conversation. The runtime layer is the
          // one that owns "what went wrong" detail; we just stringify here.
          const message = err instanceof Error ? err.message : String(err)
          database.appendOrdinusTurn({
            conversationId: conversation.id,
            kind: 'error',
            content: message,
            turnId
          })
          throw err
        }

        // Persist the (possibly fresh, per ADR-013 fallback) session reference
        // so the next turn can resume against it.
        database.updateOrdinusConversationSessionRef({
          id: conversation.id,
          providerSessionRef: result.providerSessionRef
        })

        // ADR-029 — final_response is persisted into the transcript for replay.
        // needs_input is NOT inline: Ordinus surfaces questions as the panel
        // that emerges from the input area (project_ordinus_home_design). We
        // persist the request so the panel rehydrates after an app restart,
        // then publish an event so any open window paints it immediately.
        if (result.outcome.outcome === 'final_response') {
          database.appendOrdinusTurn({
            conversationId: conversation.id,
            kind: 'assistant',
            content: result.outcome.content,
            turnId
          })
        } else {
          const request = database.createOrdinusInputRequest({
            conversationId: conversation.id,
            turnId,
            title: result.outcome.title,
            detail: result.outcome.detail,
            questions: result.outcome.questions
          })
          deps.events.publish({ kind: 'input_request_requested', request })
        }

        return {
          conversationId: conversation.id,
          turnId,
          providerSessionRef: result.providerSessionRef,
          outcome: result.outcome,
          sessionReset: Boolean(result.sessionReset)
        }
      } finally {
        runningConversationIds.delete(conversation.id)
      }
    },

    async answerInputRequest(input) {
      // Validate + mark answered (throws if already resolved). Returns the
      // human-readable summary (for the transcript) and the continuation
      // message (for the CLI).
      const { conversationId, answerSummary, continuationMessage } =
        database.answerOrdinusInputRequest(input)
      // Close the panel everywhere before the (possibly long) resume turn.
      deps.events.publish({ kind: 'input_request_resolved', requestId: input.requestId })
      // Reuse the normal turn pipeline: the answer summary becomes the user
      // transcript entry; the continuation message is what the CLI receives.
      return this.sendTurn({
        conversationId,
        message: continuationMessage,
        displayMessage: answerSummary
      })
    }
  }
}
