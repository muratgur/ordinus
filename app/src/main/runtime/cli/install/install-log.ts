import { app } from 'electron'
import { createWriteStream, mkdirSync, readdirSync, unlinkSync, type WriteStream } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ProviderId } from '@shared/contracts'
import { redactDiagnosticsText } from '../../../observability/redaction'
import { getSystemPaths } from '../../../paths'

/**
 * Durable log of one managed-install attempt (ADR-047 §3f).
 *
 * The install used to discard everything npm said: stdout was never read, and
 * stderr survived only as a 4 KB tail that reached neither disk nor the UI. So
 * whenever the classifier's patterns missed, the user was left with "npm exit
 * code 1" and there was nothing to diagnose from — the failure was, by
 * construction, unreportable.
 *
 * Everything npm prints now lands here, together with the environment facts
 * that decide whether an install can succeed at all: which npm we invoked, the
 * Node runtime, the prefix, the proxy. Half of the diagnosis is in the header.
 *
 * Writing is best-effort — a log failure must never fail a working install. If
 * the file cannot be opened or a write fails, `path` goes empty so callers stop
 * advertising a log that isn't there.
 */
export type InstallLog = {
  /** Absolute path of the log file, or '' when it could not be written. */
  readonly path: string
  /** Start a titled section (one per npm attempt, verify, etc.). */
  section: (title: string) => void
  /** Append child-process output. Redacted, and only ever written whole-line. */
  write: (text: string) => void
  /** Write the closing summary and flush. */
  close: (summary: string) => void
  /** Delete the log — for a successful install, where it has no diagnostic value. */
  discard: () => void
}

export type InstallLogContext = {
  packageName: string
  cliPrefix: string
  cacheDir: string
  proxyEnv: NodeJS.ProcessEnv
  bundledNode: string | null
  nodeOnPath: string | null
}

/** Logs kept per provider, newest first. Enough to compare a retry against the run before it. */
const KEEP_PER_PROVIDER = 5

const NOOP_LOG: InstallLog = {
  path: '',
  section: () => {},
  write: () => {},
  close: () => {},
  discard: () => {}
}

export function createInstallLog(providerId: ProviderId, context: InstallLogContext): InstallLog {
  const directory = join(getSystemPaths().logs, 'install')
  const path = join(
    directory,
    `${providerId}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
  )

  let stream: WriteStream
  try {
    mkdirSync(dirname(path), { recursive: true })
    prunePreviousLogs(directory, providerId)
    stream = createWriteStream(path, { flags: 'a' })
  } catch {
    return NOOP_LOG
  }

  let healthy = true
  // A write can fail long after open (full disk, a security tool locking the file).
  // Node emits that as an 'error' event, which is fatal to the process if unhandled —
  // and it means the path we hand the user points at a file that isn't really there.
  stream.on('error', () => {
    healthy = false
  })

  // Secrets are matched by pattern, and the child's output arrives in arbitrary chunks —
  // a token split across two 'data' events matches nothing and would land in the clear.
  // Redact whole lines only, holding the partial tail back until its line completes.
  let pending = ''

  function append(text: string): void {
    if (!healthy) return
    try {
      stream.write(text)
    } catch {
      healthy = false
    }
  }

  function writeBuffered(text: string): void {
    pending += text
    const lastBreak = pending.lastIndexOf('\n')
    if (lastBreak === -1) return
    const complete = pending.slice(0, lastBreak + 1)
    pending = pending.slice(lastBreak + 1)
    append(redactDiagnosticsText(complete))
  }

  function flush(): void {
    if (!pending) return
    append(redactDiagnosticsText(`${pending}\n`))
    pending = ''
  }

  const log: InstallLog = {
    get path() {
      return healthy ? path : ''
    },
    section: (title) => writeBuffered(`\n----- ${title} -----\n`),
    write: writeBuffered,
    close: (summary) => {
      flush()
      append(`\n----- ${summary} -----\n`)
      stream.end()
    },
    discard: () => {
      pending = ''
      healthy = false
      stream.end(() => {
        try {
          unlinkSync(path)
        } catch {
          // Already gone, or locked — a stale log file is not worth failing over.
        }
      })
    }
  }

  log.write(renderHeader(providerId, context))
  return log
}

/**
 * Keep the newest few logs per provider. Nothing else in the app prunes this directory,
 * so without a cap a user who retries a failing install leaves a file behind every time.
 * ISO-8601 timestamps sort lexicographically, so a name sort is a time sort.
 */
function prunePreviousLogs(directory: string, providerId: ProviderId): void {
  try {
    const stale = readdirSync(directory)
      .filter((name) => name.startsWith(`${providerId}-`) && name.endsWith('.log'))
      .sort()
      .reverse()
      .slice(KEEP_PER_PROVIDER - 1)

    for (const name of stale) {
      try {
        unlinkSync(join(directory, name))
      } catch {
        // Locked or already gone — pruning is housekeeping, not a precondition.
      }
    }
  } catch {
    // Directory unreadable — the install matters more than its log rotation.
  }
}

function renderHeader(providerId: ProviderId, context: InstallLogContext): string {
  const fields: [string, string][] = [
    ['at', new Date().toISOString()],
    ['provider', providerId],
    ['package', context.packageName],
    ['ordinus', app.getVersion()],
    ['platform', `${process.platform} ${process.arch}`],
    ['packaged', String(app.isPackaged)],
    ['electron', process.versions.electron ?? 'unknown'],
    ['node', process.versions.node ?? 'unknown'],
    // ADR-047 §1: npm's lifecycle scripts and the installed CLI launchers both need a
    // real `node`. Which one they got — ours or the machine's — decides whether an
    // install can work at all, so it is the first thing to know when one didn't.
    ['bundledNode', context.bundledNode ?? '<none>'],
    ['nodeOnPath', context.nodeOnPath ?? '<none>'],
    ['cliPrefix', context.cliPrefix],
    ['cache', context.cacheDir],
    ['proxy', describeProxy(context.proxyEnv)]
  ]

  const body = fields.map(([key, value]) => `${key.padEnd(12)} ${value}`).join('\n')
  return `===== Ordinus install log =====\n${body}\n`
}

function describeProxy(proxyEnv: NodeJS.ProcessEnv): string {
  // resolveInstallProxyEnv() returns nothing when a proxy is already configured
  // (env or ~/.npmrc), so "none resolved" is not the same as "no proxy in play".
  const resolved = proxyEnv.HTTPS_PROXY ?? proxyEnv.HTTP_PROXY
  return resolved
    ? `resolved from system: ${resolved}`
    : 'none resolved by Ordinus (npm may still use its own config)'
}
