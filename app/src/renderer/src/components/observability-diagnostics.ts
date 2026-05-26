import type { ObservedRunDiagnostics, ObservedRunSnapshot } from '@shared/contracts'

const diagnosticTextLimit = 80_000

export function formatObservedPhase(phase: ObservedRunSnapshot['currentPhase']): string {
  return phase.replaceAll('_', ' ')
}

export function formatLivenessHealth(health: ObservedRunSnapshot['livenessHealth']): string {
  if (health === 'healthy') return 'live'
  if (health === 'quiet') return 'quiet'
  if (health === 'stalled') return 'stalled'
  if (health === 'exited') return 'exited'
  return 'unknown'
}

export function mergeDiagnostics(
  current: ObservedRunDiagnostics | null,
  next: ObservedRunDiagnostics
): ObservedRunDiagnostics {
  if (!current) {
    return next
  }

  return {
    ...next,
    stdout: mergeDiagnosticTail(current.stdout, next.stdout),
    stderr: mergeDiagnosticTail(current.stderr, next.stderr)
  }
}

function mergeDiagnosticTail(
  current: ObservedRunDiagnostics['stdout'],
  next: ObservedRunDiagnostics['stdout']
): ObservedRunDiagnostics['stdout'] {
  if (next.startOffset !== current.nextOffset) {
    return next
  }

  return {
    ...next,
    startOffset: current.startOffset,
    text: trimDiagnosticText(`${current.text}${next.text}`)
  }
}

function trimDiagnosticText(value: string): string {
  return value.length > diagnosticTextLimit ? value.slice(-diagnosticTextLimit) : value
}
