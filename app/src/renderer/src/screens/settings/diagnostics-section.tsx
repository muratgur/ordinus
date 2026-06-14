// ADR-045 B2 — Diagnostics (formerly "Local state").
//
// This is an info/diagnostics screen, not a settings screen: nothing here is
// configurable. It answers "what build am I on, where do my files live, is the
// database healthy?" — the things you reach for when something breaks or you're
// filing a report. The one real action is "Copy diagnostics", which puts the
// whole picture on the clipboard so the user doesn't transcribe three cards by
// hand. The workspace's resolved absolute path is bridged in here too (its
// first-class home stays the Workspace section).

import { useState } from 'react'
import { Check, Copy, Database, MonitorCog, ShieldCheck } from 'lucide-react'
import type { AppInfo, DbStatus, SystemPaths } from '@shared/contracts'
import { StatusCard } from '@renderer/components/status-card'
import { Button } from '@renderer/components/ui/button'
import { copyTextToClipboard } from '@renderer/lib/clipboard'
import { formatDate } from '@renderer/lib/format'

export function DiagnosticsSection({
  appInfo,
  paths,
  dbStatus,
  workspaceRoot
}: {
  appInfo: AppInfo | null
  paths: SystemPaths | null
  dbStatus: DbStatus | null
  workspaceRoot: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  // Single source of truth: the on-screen cards and the copied report are both
  // rendered from this, so they can't drift (ADR-045 B2).
  const sections: Array<{
    icon: React.ReactNode
    title: string
    description: string
    rows: Array<[string, string]>
  }> = [
    {
      icon: <MonitorCog />,
      title: 'App',
      description: 'Which build of Ordinus is running.',
      rows: [
        ['Name', appInfo?.name ?? '-'],
        ['Version', appInfo?.version ?? '-'],
        ['Platform', appInfo ? `${appInfo.platform} ${appInfo.arch}` : '-'],
        ['Packaged', appInfo ? String(appInfo.isPackaged) : '-']
      ]
    },
    {
      icon: <Database />,
      title: 'Persistence',
      description: 'Whether the local database is set up and current.',
      rows: [
        ['Initialized', dbStatus ? String(dbStatus.initialized) : '-'],
        ['Schema', dbStatus?.schemaVersion?.toString() ?? '-'],
        ['Created', formatDate(dbStatus?.createdAt)],
        ['Updated', formatDate(dbStatus?.updatedAt)]
      ]
    },
    {
      icon: <ShieldCheck />,
      title: 'Paths',
      description: 'Where Ordinus keeps its files on this machine.',
      rows: [
        ['Workspace', workspaceRoot || '-'],
        ['User data', paths?.userData ?? '-'],
        ['Database', paths?.database ?? '-'],
        ['Runtime', paths?.runtime ?? '-'],
        ['Logs', paths?.logs ?? '-']
      ]
    }
  ]

  async function copyReport(): Promise<void> {
    const report = [
      '# Ordinus diagnostics',
      ...sections.map(
        (section) =>
          `\n## ${section.title}\n${section.rows.map(([label, value]) => `${label}: ${value}`).join('\n')}`
      )
    ].join('\n')
    const ok = await copyTextToClipboard(report)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-prose">
          <h2 className="text-base font-semibold leading-6">Diagnostics</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            App build, file locations, and database state. Nothing here is a setting — it&apos;s
            what to grab when something breaks or you&apos;re asking for help.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void copyReport()}>
          {copied ? <Check className="text-status-completed" /> : <Copy />}
          {copied ? 'Copied' : 'Copy diagnostics'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <StatusCard
            key={section.title}
            icon={section.icon}
            title={section.title}
            description={section.description}
            rows={section.rows}
          />
        ))}
      </div>
    </div>
  )
}
