// ADR-044 §Settings — Remote access (Telegram).
//
// Lets the user reach Ordinus from their phone through a single-owner Telegram
// bot. Four states, driven by the main-process subsystem and kept live via
// onStatusEvent:
//   - disconnected   → BotFather instructions + token field + Connect
//   - awaiting-pairing → the bot is listening; show the pairing code to type
//   - connected      → listening, owner sealed; Disconnect
//   - error          → reason + token field to retry
//
// The token is write-only: it is sent to main, never read back.

import { useEffect, useState } from 'react'
import { Smartphone, Loader2, Check, AlertCircle } from 'lucide-react'
import type { TelegramStatus } from '@shared/contracts'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Input } from '@renderer/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'

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
          <StatusBadge status={state} />
        </div>
        <CardDescription>
          Connect a Telegram bot to message Ordinus from your phone. The bot only ever answers you —
          it can’t reach your Telegram contacts.
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

function StatusBadge({ status }: { status: TelegramStatus['status'] }): React.JSX.Element {
  if (status === 'connected') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Check className="size-3" /> Listening
      </Badge>
    )
  }
  if (status === 'awaiting-pairing') {
    return <Badge variant="secondary">Awaiting pairing</Badge>
  }
  if (status === 'error') {
    return <Badge variant="failed">Error</Badge>
  }
  return <Badge variant="outline">Not connected</Badge>
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
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          On your phone, open Telegram and message <span className="font-medium">@BotFather</span>.
        </li>
        <li>
          Send <code className="rounded bg-muted px-1">/newbot</code>, pick a name and a username
          ending in <code className="rounded bg-muted px-1">bot</code>.
        </li>
        <li>Copy the token BotFather gives you and paste it below.</li>
      </ol>

      {status?.status === 'error' && status.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{status.error}</span>
        </div>
      ) : null}

      <div className="grid gap-2">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Bot token
        </label>
        <div className="flex gap-2">
          <Input
            type="password"
            value={token}
            placeholder="123456789:AA…"
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
      <p className="text-sm text-muted-foreground">
        {status.botUsername ? (
          <>
            <span className="font-medium">@{status.botUsername}</span> is listening. To seal it to
            you (and lock everyone else out), open the bot and send:
          </>
        ) : (
          'The bot is listening. Send the pairing message below from the phone you want to pair.'
        )}
      </p>

      <div className="rounded-md border bg-muted/40 px-4 py-3 text-center">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Send to the bot</div>
        <div className="mt-1 font-mono text-2xl font-semibold tracking-widest">
          /pair {status.pairingCode ?? '••••••'}
        </div>
      </div>

      <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={busy}>
        Disconnect
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
          <span className="text-muted-foreground">Owner</span>
          <span className="font-medium">{status.ownerName ?? '—'}</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Message the bot from your phone and Ordinus answers. Only you can reach it; anyone else is
        ignored. Listening runs while Ordinus is open.
      </p>
      <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={busy}>
        Disconnect
      </Button>
    </div>
  )
}
