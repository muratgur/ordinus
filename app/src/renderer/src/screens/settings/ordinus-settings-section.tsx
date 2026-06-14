// ADR-029 §7 / M7 — Settings → Ordinus. (ADR-045: display name removed as dead;
// extra instructions are wired into the session-init system prompt.)
//
// One form, two groups: instructions (free-form text appended to Ordinus's
// system prompt at session init) and provider + model (with the provider-change
// confirmation flow), plus a small disclosure of any active conversations on a
// non-default provider.
//
// Provider changes are gated by `ProviderChangeDialog`. Per ADR §7:
//   - Default action is Continue: existing conversations stay on their
//     original provider, new conversations open on the freshly-selected one.
//   - Secondary action is "Archive existing now" which sets archivedAt on
//     every active Ordinus conversation in one go, giving the user a clean
//     slate going forward.
//
// Other field changes (name, instructions, model on the SAME provider) save
// directly with no dialog.
//
// The form itself lives in OrdinusSettingsForm, mounted only after the
// async load resolves — that way `useState` initializers can hydrate from
// the loaded singleton without a setState-in-effect anti-pattern, and the
// form's local edits aren't clobbered by background refreshes.

import { useEffect, useMemo, useState } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'
import {
  type OrdinusConversationSummary,
  type OrdinusSingleton,
  type OrdinusUpdateSingletonInput,
  type ProviderId,
  type ProviderStatus
} from '@shared/contracts'
import { getProviderModelOptions, getDefaultModelForProvider } from '@shared/provider-models'
import { getProviderDisplayName } from '@shared/provider-labels'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { SelectControl } from '@renderer/components/select-control'
import { notify } from '@renderer/lib/notifications'
import { ProviderChangeDialog } from './provider-change-dialog'

export function OrdinusSettingsSection(): React.JSX.Element {
  const [singleton, setSingleton] = useState<OrdinusSingleton | null>(null)
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [conversations, setConversations] = useState<OrdinusConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // `loadVersion` is bumped to force a fresh load. The effects below depend
  // on it so calling `setLoadVersion(v => v + 1)` re-runs every fetch.
  const [loadVersion, setLoadVersion] = useState(0)

  // Fast path: singleton + conversations are tiny SQLite reads. The form
  // can render the moment these resolve — typically the same frame.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [s, c] = await Promise.all([
          window.ordinus.ordinus.getSingleton(),
          window.ordinus.ordinus.listConversations()
        ])
        if (cancelled) return
        setSingleton(s)
        setConversations(c)
        setLoadError(null)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadVersion])

  // Slow path: getProviders shells out to each CLI (`--version` checks) and
  // can take a few hundred ms. Running it inside the gate above would make
  // the whole section feel sluggish — and unlike other Settings sections
  // (which receive provider status via props from App.tsx), this one is the
  // only consumer here. So we let it stream in: dropdown stays empty until
  // ready, but the form is otherwise live immediately.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const p = await window.ordinus.runtime.getProviders()
        if (!cancelled) setProviders(p)
      } catch {
        // Best-effort. Provider dropdown stays empty; the connectivity hint
        // below it will still call out a missing entry if needed.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadVersion])

  const refresh = (): void => setLoadVersion((v) => v + 1)

  // No takeover loader. Render the card chrome immediately; the form mount
  // is gated on singleton being non-null below. Matches the workflows-screen
  // sidebar pattern (single "One moment…" line in place, layout stable).
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Ordinus
          </CardTitle>
          <CardDescription>Provider and instructions for the in-app assistant.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">One moment…</div>
        </CardContent>
      </Card>
    )
  }

  if (loadError || !singleton) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ordinus</CardTitle>
          <CardDescription className="flex items-start gap-2 text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {loadError ??
                'Ordinus is not provisioned yet. Finish workspace onboarding to enable persona settings.'}
            </span>
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <OrdinusSettingsForm
      // Remount the form when the singleton's updatedAt changes — this is
      // the clean way to re-seed `useState` initializers when the backing
      // row changes (after a save) without leaking sync logic into an
      // effect. In practice the only updater IS the form itself, so the
      // key change happens right after every save and the user never sees
      // a stale form.
      key={singleton.updatedAt}
      initialSingleton={singleton}
      providers={providers}
      conversations={conversations}
      onSaved={(next) => {
        setSingleton(next)
      }}
      onProviderChanged={refresh}
    />
  )
}

type OrdinusSettingsFormProps = {
  initialSingleton: OrdinusSingleton
  providers: ProviderStatus[]
  conversations: OrdinusConversationSummary[]
  onSaved: (next: OrdinusSingleton) => void
  onProviderChanged: () => void
}

function OrdinusSettingsForm({
  initialSingleton,
  providers,
  conversations,
  onSaved,
  onProviderChanged
}: OrdinusSettingsFormProps): React.JSX.Element {
  const [extraInstructions, setExtraInstructions] = useState(
    initialSingleton.extraInstructions ?? ''
  )
  const [saving, setSaving] = useState(false)
  const [pendingProvider, setPendingProvider] = useState<{
    providerId: ProviderId
    model: string
  } | null>(null)

  const modelOptions = useMemo(
    () => getProviderModelOptions(initialSingleton.providerId),
    [initialSingleton.providerId]
  )

  const activeConversationsOnCurrentProvider = useMemo(
    () =>
      conversations.filter(
        (c) => c.providerId === initialSingleton.providerId && !c.archivedAt && !c.frozenReason
      ),
    [conversations, initialSingleton.providerId]
  )

  const installedProviders = providers.filter((p) => p.installed)
  const currentProviderStatus = providers.find((p) => p.id === initialSingleton.providerId)

  async function saveSingleton(patch: OrdinusUpdateSingletonInput): Promise<void> {
    setSaving(true)
    try {
      const updated = await window.ordinus.ordinus.updateSingleton(patch)
      onSaved(updated)
      notify.success({ title: 'Ordinus settings saved' })
    } catch (err) {
      notify.error({
        title: 'Could not save',
        description: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setSaving(false)
    }
  }

  function handleProviderSelect(nextProviderId: ProviderId): void {
    if (nextProviderId === initialSingleton.providerId) return
    const nextModel = getDefaultModelForProvider(nextProviderId)
    setPendingProvider({ providerId: nextProviderId, model: nextModel })
  }

  function handleModelSelect(nextModel: string): void {
    if (nextModel === initialSingleton.model) return
    void saveSingleton({ model: nextModel })
  }

  async function confirmProviderChange(opts: { archiveExisting: boolean }): Promise<void> {
    if (!pendingProvider) return
    try {
      if (opts.archiveExisting) {
        await Promise.all(
          activeConversationsOnCurrentProvider.map((c) =>
            window.ordinus.ordinus.archiveConversation({ conversationId: c.id })
          )
        )
      }
      await window.ordinus.ordinus.updateSingleton({
        providerId: pendingProvider.providerId,
        model: pendingProvider.model
      })
      notify.success({
        title: 'Provider updated',
        description: getProviderDisplayName(pendingProvider.providerId)
      })
      onProviderChanged()
    } catch (err) {
      notify.error({
        title: 'Provider change failed',
        description: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setPendingProvider(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          Ordinus
        </CardTitle>
        <CardDescription>
          The in-app assistant — the provider and model it thinks with, and instructions it always
          follows. This is separate from the system default (Providers), which agents and background
          planning use.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground">Instructions</label>
          <p className="text-sm leading-6 text-muted-foreground">
            Tone, preferences, or context Ordinus should always follow. Applied when a new
            conversation starts, so it shapes new chats but leaves existing ones unchanged.
          </p>
          <textarea
            value={extraInstructions}
            onChange={(event) => setExtraInstructions(event.target.value)}
            placeholder="e.g. Keep answers short. I work in TypeScript. Call me by my first name."
            rows={4}
            maxLength={8_000}
            disabled={saving}
            className="min-h-[88px] resize-y rounded-md border bg-background px-3 py-2 text-sm leading-6 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {extraInstructions.length} / 8,000 characters
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                void saveSingleton({
                  extraInstructions: extraInstructions.trim() ? extraInstructions.trim() : null
                })
              }
              disabled={saving || extraInstructions === (initialSingleton.extraInstructions ?? '')}
            >
              Save
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Provider
            </span>
            <SelectControl
              value={initialSingleton.providerId}
              onChange={(value) => handleProviderSelect(value as ProviderId)}
            >
              {installedProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {getProviderDisplayName(p.id)}
                  {p.connected ? '' : ' (not connected)'}
                </option>
              ))}
            </SelectControl>
            {currentProviderStatus && !currentProviderStatus.connected ? (
              <span className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  This provider isn&apos;t currently connected. Ordinus turns will fail until you
                  reconnect from the Providers section.
                </span>
              </span>
            ) : null}
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Model
            </span>
            <SelectControl value={initialSingleton.model} onChange={handleModelSelect}>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </SelectControl>
          </label>
        </div>
      </CardContent>

      {pendingProvider ? (
        <ProviderChangeDialog
          fromProviderId={initialSingleton.providerId}
          toProviderId={pendingProvider.providerId}
          activeOnFromProvider={activeConversationsOnCurrentProvider.length}
          onContinue={() => void confirmProviderChange({ archiveExisting: false })}
          onArchive={() => void confirmProviderChange({ archiveExisting: true })}
          onCancel={() => setPendingProvider(null)}
        />
      ) : null}
    </Card>
  )
}
