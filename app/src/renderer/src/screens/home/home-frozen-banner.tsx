// ADR-029 §7 / M7 — Frozen-conversation banner.
//
// Rendered in place of the input when a conversation can no longer accept
// new turns because its original provider became unavailable (uninstalled,
// disconnected, archived). Two paths forward:
//
//   - Reconnect from Settings → Providers. The banner just points the user
//     there; we don't reach into Settings ourselves because reconnecting a
//     CLI often requires per-provider interactive steps (OAuth, install).
//   - Start fresh: archives this conversation and opens a new one on the
//     current Ordinus default provider. No automatic summary carry-over —
//     ADR §7 calls for opt-in carry-over and we'll add that in a follow-up.

import { AlertTriangle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { getProviderDisplayName } from '@shared/provider-labels'
import type { ProviderId } from '@shared/contracts'

export type HomeFrozenBannerProps = {
  providerId: ProviderId
  reason: string | null
  onStartFresh: () => void
  busy: boolean
}

export function HomeFrozenBanner(props: HomeFrozenBannerProps): React.JSX.Element {
  const providerLabel = getProviderDisplayName(props.providerId)
  return (
    <div className="border-t bg-amber-500/5 px-4 py-3">
      <div className="mx-auto flex w-full max-w-3xl items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div className="flex flex-1 flex-col gap-2">
          <div>
            <p className="text-sm font-semibold">Conversation frozen</p>
            <p className="text-xs text-muted-foreground">
              {props.reason ??
                `This conversation was started with ${providerLabel}, which is no longer available.`}{' '}
              Reconnect {providerLabel} from Settings → Providers, or start a new conversation on
              your current Ordinus default.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" size="sm" onClick={props.onStartFresh} disabled={props.busy}>
              Start a new conversation
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
