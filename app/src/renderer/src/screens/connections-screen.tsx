import { useCallback, useEffect, useState } from 'react'
import { Plug } from 'lucide-react'
import type { ConnectorSummary } from '@shared/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'

export function ConnectionsScreen(): React.JSX.Element {
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    let active = true
    window.ordinus.connectors
      .list()
      .then((list) => {
        if (active) {
          setConnectors(list)
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Failed to load connectors.')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  const runAction = useCallback(async (connectorId: string, action: 'connect' | 'disconnect') => {
    try {
      setBusyId(connectorId)
      setError('')
      const next =
        action === 'connect'
          ? await window.ordinus.connectors.connect({ connectorId })
          : await window.ordinus.connectors.disconnect({ connectorId })
      setConnectors(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Failed to ${action} connector.`)
    } finally {
      setBusyId('')
    }
  }, [])

  return (
    <div className="grid gap-4 py-6 lg:grid-cols-[240px_1fr]">
      <aside className="h-fit rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <Plug className="size-4 text-primary" />
          <h2 className="text-base font-semibold leading-tight tracking-normal">Connections</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Connect an external system once here — Ordinus registers an OAuth client automatically.
          Agents that have it enabled use this connection at run time. Ordinus stores only the
          credential, never the data.
        </p>
      </aside>

      <Card>
        <CardHeader>
          <CardTitle>External connectors</CardTitle>
          <CardDescription>
            Authorize a connector to make it available to agents. Disconnecting removes the stored
            credential.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="mb-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {loading ? (
            <div className="grid min-h-[200px] place-items-center text-sm text-muted-foreground">
              Loading connectors…
            </div>
          ) : connectors.length === 0 ? (
            <div className="grid min-h-[200px] place-items-center rounded-md border bg-accent text-sm text-muted-foreground">
              No connectors available
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {connectors.map((connector) => (
                <li
                  key={connector.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{connector.label}</span>
                      <Badge variant={connector.connected ? 'default' : 'secondary'}>
                        {connector.connected ? 'Connected' : 'Not connected'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {connector.transport} · {connector.authMethod}
                    </p>
                  </div>
                  {connector.connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === connector.id}
                      onClick={() => void runAction(connector.id, 'disconnect')}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busyId === connector.id}
                      onClick={() => void runAction(connector.id, 'connect')}
                    >
                      {busyId === connector.id ? 'Connecting…' : 'Connect'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
