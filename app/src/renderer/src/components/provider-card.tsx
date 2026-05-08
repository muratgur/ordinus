import { CheckCircle2, ExternalLink, Loader2, PlugZap, RefreshCcw } from 'lucide-react'
import type { ProviderId, ProviderStatus } from '@shared/contracts'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { DetailRow } from './detail-row'
import { ReadinessBadge } from './readiness-badge'

type ProviderCardProps = {
  provider: ProviderStatus | undefined
  defaultProviderId: ProviderId
  busyAction: string
  onConnect: () => Promise<void>
  onRefresh: () => Promise<void>
}

export function ProviderCard({
  provider,
  defaultProviderId,
  busyAction,
  onConnect,
  onRefresh
}: ProviderCardProps): React.JSX.Element {
  const disabled = !provider || provider.id === 'gemini'
  const authUrl = provider?.authUrl ?? ''
  const providerName = getProviderName(provider)
  const isDefault = provider?.id === defaultProviderId

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PlugZap className="size-4 text-primary" />
              {provider?.label ?? 'Provider'}
              {isDefault ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="size-3" />
                  Default
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>{provider?.note || 'Check provider readiness.'}</CardDescription>
          </div>
          <ReadinessBadge ready={Boolean(provider?.connected)} readyText="Ready" />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-3 text-sm">
          <DetailRow label="CLI" value={provider?.installed ? 'Detected' : 'Not detected'} />
          <DetailRow label="Version" value={provider?.version ?? '-'} />
          <DetailRow label="Account" value={provider?.accountLabel || '-'} />
          <DetailRow
            label="Status"
            value={provider?.connected ? 'Connected' : provider?.note || '-'}
          />
        </dl>

        {provider?.lastError ? (
          <p className="rounded-md border border-status-failed/20 bg-status-failed/10 px-3 py-2 text-xs leading-5 text-status-failed">
            {provider.lastError}
          </p>
        ) : null}

        {authUrl ? (
          <a
            className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            href={authUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open {providerName} login
            <ExternalLink className="size-4" />
          </a>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void onRefresh()}
            variant="outline"
            disabled={disabled || Boolean(busyAction)}
          >
            {busyAction === `refresh-${provider?.id}` ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCcw />
            )}
            Check {providerName}
          </Button>
          <Button
            type="button"
            onClick={() => void onConnect()}
            disabled={disabled || Boolean(busyAction) || Boolean(provider?.connected)}
          >
            {busyAction === `connect-${provider?.id}` ? (
              <Loader2 className="animate-spin" />
            ) : (
              <PlugZap />
            )}
            Connect to {providerName}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function getProviderName(provider: ProviderStatus | undefined): string {
  if (!provider) return 'Provider'
  if (provider.id === 'codex') return 'Codex'
  if (provider.id === 'claude') return 'Claude'
  return 'Gemini'
}
