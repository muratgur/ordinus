// ADR-029 §7 / M7 — Provider-change confirmation dialog.
//
// Triggered from OrdinusSettingsSection when the user picks a different
// provider. Two outcomes (per ADR §7):
//
//   - Continue (default): existing conversations stay on their original
//     provider. New ones use the freshly-selected one. Provider rozeti
//     starts showing on the old conversations because they no longer
//     match the singleton default.
//   - Archive existing now: bulk archives every active Ordinus conversation
//     before applying the provider change, giving the user a clean slate.
//
// Cancel just closes the dialog; the dropdown's previous value is restored
// by the parent (singleton state never changed).

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription
} from '@renderer/components/ui/alert-dialog'
import { Button } from '@renderer/components/ui/button'
import { getProviderDisplayName } from '@shared/provider-labels'
import type { ProviderId } from '@shared/contracts'

export type ProviderChangeDialogProps = {
  fromProviderId: ProviderId
  toProviderId: ProviderId
  /** Count of Ordinus conversations currently on `fromProviderId` (not archived, not frozen). */
  activeOnFromProvider: number
  onContinue: () => void
  onArchive: () => void
  onCancel: () => void
}

export function ProviderChangeDialog(props: ProviderChangeDialogProps): React.JSX.Element {
  const fromLabel = getProviderDisplayName(props.fromProviderId)
  const toLabel = getProviderDisplayName(props.toProviderId)
  const count = props.activeOnFromProvider

  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!next) props.onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Change Ordinus provider — {fromLabel} → {toLabel}?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-sm">
            <p>New Ordinus conversations will run on {toLabel}.</p>
            {count > 0 ? (
              <p>
                You have <strong>{count}</strong>{' '}
                {count === 1 ? 'active conversation' : 'active conversations'} on {fromLabel}. They
                will keep running on {fromLabel} as long as it stays connected. If you later
                disconnect {fromLabel}, those conversations become read-only.
              </p>
            ) : (
              <p>No existing conversations are running on {fromLabel}, so nothing else changes.</p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
          {count > 0 ? (
            <Button type="button" variant="outline" onClick={props.onArchive}>
              Archive existing now
            </Button>
          ) : null}
          <Button type="button" onClick={props.onContinue}>
            Continue
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
