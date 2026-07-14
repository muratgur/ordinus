import type { InstallErrorCause } from '@shared/contracts'
import { firstLine } from '../output'

export type InstallErrorClassification = {
  cause: InstallErrorCause
  /**
   * Human, product-facing message ("what happened") shown in onboarding. The
   * complementary "what to do" guidance lives in INSTALL_CAUSE_GUIDANCE in
   * onboarding-flow.tsx, keyed by the same cause — keep the two in sync.
   */
  message: string
}

/**
 * Classify a failed `npm install` into an actionable cause (ADR-047 §3a).
 *
 * Once Ordinus bundles its own Node (§1), the network is the dominant remaining
 * failure source, so the patterns below lean on the npm/registry error codes
 * that surface for connectivity, proxy, and TLS-interception problems. Order
 * matters: more specific causes (TLS, proxy) are checked before the generic
 * connectivity bucket they would otherwise fall into.
 */
export function classifyNpmError(
  stderrTail: string | undefined,
  code: number | null
): InstallErrorClassification {
  const text = (stderrTail ?? '').toLowerCase()

  if (
    /self.signed certificate|unable to (get|verify)|cert_|certificate|ssl|err_tls|depth zero/.test(
      text
    )
  ) {
    return {
      cause: 'tls-cert',
      message:
        'A corporate network certificate is blocking the secure download from the package registry.'
    }
  }

  if (/proxy|407|tunneling socket|econnrefused.*443|err_proxy/.test(text)) {
    return {
      cause: 'proxy',
      message: 'A network proxy is blocking the download from the package registry.'
    }
  }

  if (
    /enotfound|eai_again|etimedout|econnreset|econnrefused|getaddrinfo|network|offline/.test(text)
  ) {
    return {
      cause: 'offline',
      message: 'No internet connection, or the package registry could not be reached.'
    }
  }

  if (/e404|404 not found|e5\d\d|5\d\d (internal|server)|registry|etarget|eintegrity/.test(text)) {
    return {
      cause: 'registry',
      message: 'The package registry returned an error.'
    }
  }

  if (/eacces|eperm|permission denied|operation not permitted|erofs/.test(text)) {
    return {
      cause: 'permission',
      message: 'Ordinus could not write the install files (permission denied).'
    }
  }

  if (
    /node-gyp|gyp err|node-pre-gyp|prebuild|msbuild|visual studio|make: |gcc|cc1|clang: error/.test(
      text
    )
  ) {
    return {
      cause: 'toolchain',
      message: 'Installing this CLI needs a build toolchain that is not available on this machine.'
    }
  }

  return {
    cause: 'unknown',
    message: describeUnclassified(stderrTail, code)
  }
}

/**
 * The 'unknown' bucket means "none of the patterns above matched" — routinely
 * reached when npm exits non-zero with thin or empty stderr. A bare exit code
 * tells the user nothing, so lead with whatever npm actually said and point at
 * the install log for the rest (ADR-047 §3f).
 */
function describeUnclassified(stderrTail: string | undefined, code: number | null): string {
  const detail = firstLine(stderrTail ?? '')

  if (code === null) {
    return detail
      ? `The install stopped before npm finished: ${detail}`
      : 'The install stopped before npm finished.'
  }
  return detail
    ? `The install failed (npm exit code ${code}): ${detail}`
    : `The install failed (npm exit code ${code}) and npm reported no reason — see the install log.`
}

/** Failure causes worth a transient retry — network blips, not config/permission. */
const TRANSIENT_CAUSES: ReadonlySet<InstallErrorCause> = new Set<InstallErrorCause>([
  'offline',
  'registry',
  'unknown'
])

export function isTransientCause(cause: InstallErrorCause): boolean {
  return TRANSIENT_CAUSES.has(cause)
}
