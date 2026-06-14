// ADR-045 B1 — Workspace settings.
//
// One concept: the folder agents work in. It is chosen once at onboarding and
// shown here read-only — changing the root would silently relocate every
// existing conversation/run (they store workspace-RELATIVE paths that re-resolve
// under the current root each turn; see ADR-031). The only action is opening the
// folder in the OS file manager. The dead "project name" field is gone.

import { FolderLock, FolderOpen } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { notify } from '@renderer/lib/notifications'
import { SettingBlock, StatusBadge } from './_shared'

export function WorkspaceSection({
  workspaceRoot,
  configured
}: {
  workspaceRoot: string
  configured: boolean
}): React.JSX.Element {
  async function revealFolder(): Promise<void> {
    try {
      await window.ordinus.workspace.openRoot()
    } catch (err) {
      notify.error({
        title: 'Could not open the workspace folder',
        description: err instanceof Error ? err.message : String(err)
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="size-4 text-primary" />
              Workspace
            </CardTitle>
            <CardDescription>
              The folder agents read and write in. They can&apos;t touch anything above it.
            </CardDescription>
          </div>
          {configured ? (
            <StatusBadge tone="ready">Ready</StatusBadge>
          ) : (
            <StatusBadge tone="idle">Not set</StatusBadge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <SettingBlock
          label="Project folder"
          description="Set when you first set up Ordinus, and fixed afterward — agents resolve their files against it every turn, so existing conversations keep working."
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-accent px-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <FolderLock className="size-4 shrink-0 text-primary" />
              <code className="truncate text-sm text-foreground">{workspaceRoot || '—'}</code>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void revealFolder()}
              disabled={!workspaceRoot}
            >
              <FolderOpen />
              Reveal in Finder
            </Button>
          </div>
        </SettingBlock>
      </CardContent>
    </Card>
  )
}
