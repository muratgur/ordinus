// ADR-044 §Settings / ADR-045 B6 — Remote access (Telegram).
//
// Remote access is the inbound door: it lets the user reach Ordinus from their
// phone, the conceptual inverse of Connections. It gets a bespoke, three-state
// shape — each state aimed at a feeling — while inheriting the shared voice (the
// six copy rules) and status COLOR semantics (the badge word may stay
// "Listening", but its color comes from the shared tone):
//   - disconnected     → persuade + reassure (owner-lock up front), guided setup
//   - awaiting-pairing → momentum: one big code, one action
//   - connected        → proof + encouragement: it's live, go try it
//   - error            → reason + retry
//
// The token is write-only: it is sent to main, never read back.

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, Lock, Smartphone } from 'lucide-react'
import type { TelegramStatus } from '@shared/contracts'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { StatusBadge, type SettingsStatusTone } from './_shared'

export function RemoteAccessSection(): React.JSX.Element {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.ordinus.telegram.getStatus().then(setStatus)
    const off = window.ordinus.telegram.onStatusEvent(setStatus)
    return off
  }, [])

  async function handleConnect(): Promise<void> {
    if (!token.trim() || busy) return
    setBusy(true)
    try {
      const next = await window.ordinus.telegram.connect({ token: token.trim() })
      setStatus(next)
      setToken('')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      setStatus(await window.ordinus.telegram.disconnect())
    } finally {
      setBusy(false)
    }
  }

  const state = status?.status ?? 'disconnected'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Smartphone className="size-5 text-muted-foreground" />
          <CardTitle>Remote access</CardTitle>
          <RemoteStatusBadge status={state} />
        </div>
        <CardDescription>
          Message Ordinus from your phone through a Telegram bot — ask a question, kick off work,
          get answers anywhere.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {state === 'connected' ? (
          <ConnectedView status={status!} busy={busy} onDisconnect={handleDisconnect} />
        ) : state === 'awaiting-pairing' ? (
          <PairingView status={status!} busy={busy} onDisconnect={handleDisconnect} />
        ) : (
          <DisconnectedView
            status={status}
            token={token}
            busy={busy}
            onTokenChange={setToken}
            onConnect={handleConnect}
          />
        )}
      </CardContent>
    </Card>
  )
}

// Bespoke word, shared color. "Listening" carries real information (it only runs
// while Ordinus is open), so we keep it — but the tone comes from the shared
// vocabulary so the color matches every other status in Settings.
function RemoteStatusBadge({ status }: { status: TelegramStatus['status'] }): React.JSX.Element {
  const map: Record<TelegramStatus['status'], { tone: SettingsStatusTone; label: string }> = {
    connected: { tone: 'connected', label: 'Listening' },
    'awaiting-pairing': { tone: 'action', label: 'Awaiting pairing' },
    error: { tone: 'error', label: 'Error' },
    disconnected: { tone: 'idle', label: 'Not connected' }
  }
  const { tone, label } = map[status] ?? map.disconnected
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}

function DisconnectedView({
  status,
  token,
  busy,
  onTokenChange,
  onConnect
}: {
  status: TelegramStatus | null
  token: string
  busy: boolean
  onTokenChange: (value: string) => void
  onConnect: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      {/* Reassurance first — the single biggest worry with a chat bot is "who
          else can reach it?" Answer it before asking for a token. */}
      <div className="flex items-start gap-2 rounded-md border bg-accent/50 px-3 py-2.5 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="leading-6">
          Only you can reach it. You pair the bot to your phone once, and everyone else is ignored —
          the bot never messages your contacts.
        </span>
      </div>

      <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
        <li>
          On your phone, open Telegram and message <span className="font-medium">@BotFather</span>.
        </li>
        <li>
          Send <code className="rounded bg-muted px-1">/newbot</code>, then pick a name and a
          username ending in <code className="rounded bg-muted px-1">bot</code>.
        </li>
        <li>BotFather replies with a token — paste it below.</li>
      </ol>

      {status?.status === 'error' && status.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{status.error}</span>
        </div>
      ) : null}

      <div className="grid gap-2">
        <label className="text-sm font-medium text-foreground">Bot token</label>
        <div className="flex gap-2">
          <Input
            type="password"
            value={token}
            placeholder="Paste the token BotFather gave you"
            onChange={(event) => onTokenChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onConnect()
            }}
            disabled={busy}
          />
          <Button onClick={onConnect} disabled={busy || !token.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Connect
          </Button>
        </div>
      </div>
    </div>
  )
}

function PairingView({
  status,
  busy,
  onDisconnect
}: {
  status: TelegramStatus
  busy: boolean
  onDisconnect: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">
        {status.botUsername ? (
          <>
            <span className="font-medium">@{status.botUsername}</span> is live. One step left: seal
            it to you so no one else can use it.
          </>
        ) : (
          'The bot is live. One step left: send the pairing message below from the phone you want to pair.'
        )}
      </p>

      <div className="rounded-md border bg-muted/40 px-4 py-3 text-center">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Open your bot and send
        </div>
        <div className="mt-1 font-mono text-2xl font-semibold tracking-widest">
          /pair {status.pairingCode ?? '••••••'}
        </div>
      </div>

      <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={busy}>
        Cancel
      </Button>
    </div>
  )
}

function ConnectedView({
  status,
  busy,
  onDisconnect
}: {
  status: TelegramStatus
  busy: boolean
  onDisconnect: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Bot</span>
          <span className="font-medium">@{status.botUsername ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Paired to</span>
          <span className="font-medium">{status.ownerName ?? '—'}</span>
        </div>
      </div>

      {/* Proof + encouragement: don't leave the user staring at a static
          "connected" — tell them it's live and nudge the first message. */}
      <div className="rounded-md border border-status-completed/30 bg-status-completed/10 px-3 py-2.5 text-sm leading-6">
        <span className="font-medium text-status-completed">Listening while Ordinus is open.</span>{' '}
        <span className="text-muted-foreground">
          Open your bot and send a message — Ordinus replies right there on your phone. Only you can
          reach it.
        </span>
      </div>

      <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={busy}>
        Disconnect
      </Button>
    </div>
  )
}
