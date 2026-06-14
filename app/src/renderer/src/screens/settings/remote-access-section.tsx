// ADR-044 §Settings / ADR-045 B6 — Remote access (Telegram).
//
// Remote access is the inbound door: reach Ordinus from your phone. Two states
// the user thinks in — disconnected and connected — plus a short pairing step
// between them (seal the bot to you). The disconnected state is a guided
// onboarding: most people have never made a Telegram bot, so it explains what
// BotFather is and walks the three steps before asking for a token. Status is
// shown once, as a plain sentence in the connected state — never the ambiguous
// word "listening", and never duplicated in the header.
//
// The token is write-only: it is sent to main, never read back.

import { useEffect, useState } from 'react'
import { AlertCircle, ExternalLink, Loader2, Lock, Send, Smartphone } from 'lucide-react'
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

const BOTFATHER_URL = 'https://t.me/BotFather'

function botLink(botUsername: string | null): string {
  const handle = (botUsername ?? '').replace(/^@/, '')
  return handle ? `https://t.me/${handle}` : BOTFATHER_URL
}

export function RemoteAccessSection(): React.JSX.Element {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  // Surfaces a thrown connect/disconnect failure (e.g. a malformed token the
  // main process rejects rather than returning an error status for).
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    void window.ordinus.telegram.getStatus().then(setStatus)
    const off = window.ordinus.telegram.onStatusEvent(setStatus)
    return off
  }, [])

  async function handleConnect(): Promise<void> {
    if (!token.trim() || busy) return
    setBusy(true)
    setActionError(null)
    try {
      const next = await window.ordinus.telegram.connect({ token: token.trim() })
      setStatus(next)
      setToken('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not connect the bot.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect(): Promise<void> {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      setStatus(await window.ordinus.telegram.disconnect())
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not disconnect the bot.')
    } finally {
      setBusy(false)
    }
  }

  const state = status?.status ?? 'disconnected'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="size-5 text-muted-foreground" />
          Remote access
        </CardTitle>
        <CardDescription>
          Message Ordinus from your phone through a private Telegram bot — ask a question, kick off
          work, get answers anywhere.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {actionError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        ) : null}
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

function StepNumber({ n }: { n: number }): React.JSX.Element {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-medium text-primary">
      {n}
    </span>
  )
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
    <div className="space-y-5">
      {/* Reassurance first — the biggest worry with a chat bot is "who else can
          reach it?" Answer it before asking the user to do anything. */}
      <div className="flex items-start gap-2 rounded-md border bg-accent/50 px-3 py-2.5">
        <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="text-sm leading-6 text-muted-foreground">
          It&apos;s your own bot — only you can reach it, and it never messages your Telegram
          contacts.
        </span>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Set it up — about a minute</p>

        <div className="flex items-start gap-3">
          <StepNumber n={1} />
          <p className="flex-1 text-sm leading-6">
            Open <code className="rounded bg-muted px-1 text-xs">@BotFather</code> — that&apos;s
            Telegram&apos;s own tool for making bots.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void window.ordinus.system.openExternal(BOTFATHER_URL)}
          >
            Open BotFather
            <ExternalLink className="ml-1 size-3.5" />
          </Button>
        </div>

        <div className="flex items-start gap-3">
          <StepNumber n={2} />
          <p className="flex-1 text-sm leading-6">
            Send it <code className="rounded bg-muted px-1 text-xs">/newbot</code>, then pick any
            name and a username ending in <code className="rounded bg-muted px-1 text-xs">bot</code>
            .
          </p>
        </div>

        <div className="flex items-start gap-3">
          <StepNumber n={3} />
          <p className="flex-1 text-sm leading-6">
            BotFather replies with a <span className="font-medium">token</span> — a long secret
            code. Copy it and paste it below.
          </p>
        </div>
      </div>

      {status?.status === 'error' && status.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{status.error}</span>
        </div>
      ) : null}

      <div className="grid gap-2 border-t pt-5">
        <label className="text-sm font-medium text-foreground">Bot token</label>
        <div className="flex gap-2">
          <Input
            type="password"
            value={token}
            placeholder="Paste the token from BotFather"
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
          'Your bot is live. One step left: send the pairing message below from the phone you want to pair.'
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

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void window.ordinus.system.openExternal(botLink(status.botUsername))}
        >
          Open your bot
          <ExternalLink className="ml-1 size-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={busy}>
          Cancel
        </Button>
      </div>
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
      {/* Bot identity grouped as one block — not scattered label/value rows. */}
      <div className="flex items-center gap-3">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-white"
          style={{ backgroundColor: '#229ED9' }}
          aria-hidden="true"
        >
          <Send className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">@{status.botUsername ?? '—'}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            Paired to {status.ownerName ?? '—'} · only you can reach it
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => void window.ordinus.system.openExternal(botLink(status.botUsername))}
        >
          <Send className="size-4" />
          Open in Telegram
        </Button>
      </div>

      {/* Status as a plain sentence with a live dot — no "listening" jargon. */}
      <div className="flex items-start gap-2 rounded-md border border-status-completed/30 bg-status-completed/10 px-3 py-2.5">
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-status-completed" />
        <span className="text-sm leading-6 text-status-completed">
          <span className="font-medium">On — message it from your phone anytime.</span>{' '}
          <span className="text-muted-foreground">
            Replies come while Ordinus is open on this computer; closing the app pauses it until you
            reopen.
          </span>
        </span>
      </div>

      <div className="flex justify-end border-t pt-3">
        <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={busy}>
          Disconnect
        </Button>
      </div>
    </div>
  )
}
