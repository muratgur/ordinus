// ADR-029 §8 — Renderer-side message shape for the Ordinus transcript.
//
// The IPC layer (window.ordinus.ordinus.sendTurn) returns a single
// AgentTurnOutcome per turn — it does NOT replay the transcript. So this
// screen owns its own in-memory message history per conversation, built up
// optimistically from the user's typed message + the assistant text we get
// back. Closing/reopening the app drops the in-memory transcript; the
// CLI-side --resume keeps the provider's session alive for follow-ups, but
// the user sees a fresh-looking conversation. That's a known M4 limitation
// (the plan notes "dev-only debug entrypoint" semantics until M5+); future
// milestones may add an `ordinus_conversation_turns` table to persist what
// the user sees.

export type HomeMessage =
  | {
      kind: 'user'
      id: string
      text: string
      at: string
    }
  | {
      kind: 'assistant'
      id: string
      text: string
      // ADR-030 parity: optional full produced body, surfaced on demand under
      // the summary ("Show full response"). Empty when there is no extra body.
      resultContent: string
      at: string
    }
  | {
      kind: 'error'
      id: string
      message: string
      at: string
    }
  | {
      // Transient "Ordinus is thinking…" / "Calling tool…" indicator. Lives in
      // the messages list so it scrolls with the transcript and clears
      // naturally when the turn finishes. Status indicators are removed
      // before adding the assistant reply (one status at a time).
      kind: 'status'
      id: string
      label: string
      at: string
    }
