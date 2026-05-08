import { CheckCircle2, Database, Folder, ShieldCheck } from 'lucide-react'
import type { AppInfo, DbStatus, SystemPaths } from '@shared/contracts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { StatusCard } from '@renderer/components/status-card'
import { formatDate } from '@renderer/lib/format'

type WorkspaceScreenProps = {
  appInfo: AppInfo | null
  paths: SystemPaths | null
  dbStatus: DbStatus | null
  error: string
}

export function WorkspaceScreen({
  appInfo,
  paths,
  dbStatus,
  error
}: WorkspaceScreenProps): React.JSX.Element {
  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold leading-tight tracking-normal">Workspace</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review local readiness before adding agent runs, tasks, and activity views.
          </p>
        </div>
      </section>

      {error ? (
        <Card className="border-status-failed/20 bg-status-failed/10">
          <CardHeader>
            <CardTitle>Shell needs attention</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard
          icon={<ShieldCheck />}
          title="App"
          description="Desktop shell and renderer bridge are ready."
          rows={[
            ['Name', appInfo?.name ?? '-'],
            ['Version', appInfo?.version ?? '-'],
            ['Platform', appInfo ? `${appInfo.platform} ${appInfo.arch}` : '-'],
            ['Packaged', appInfo ? String(appInfo.isPackaged) : '-']
          ]}
        />
        <StatusCard
          icon={<Database />}
          title="Persistence"
          description="Local state is owned by the Electron main process."
          rows={[
            ['Initialized', dbStatus ? String(dbStatus.initialized) : '-'],
            ['Schema', dbStatus?.schemaVersion?.toString() ?? '-'],
            ['Created', formatDate(dbStatus?.createdAt)],
            ['Updated', formatDate(dbStatus?.updatedAt)]
          ]}
        />
        <StatusCard
          icon={<Folder />}
          title="System paths"
          description="Runtime files stay inside app-owned local paths."
          rows={[
            ['User data', paths?.userData ?? '-'],
            ['Database', paths?.database ?? '-'],
            ['Runtime', paths?.runtime ?? '-'],
            ['Logs', paths?.logs ?? '-']
          ]}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-status-completed" />
            Foundation checks
          </CardTitle>
          <CardDescription>
            The app shell, secure bridge, and minimum local-state bootstrap are wired.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <p>Renderer has no direct Node, filesystem, process, or database access.</p>
            <p>Feature modules and provider runtimes are intentionally left for later phases.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
