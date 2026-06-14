import { session } from 'electron'

const REGISTRY_URL = 'https://registry.npmjs.org/'

const EXISTING_PROXY_KEYS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'npm_config_proxy',
  'npm_config_https_proxy'
]

/**
 * Resolve a system proxy for the managed install and return the env additions
 * needed for npm to use it (ADR-047 §3b).
 *
 * Corporate machines often reach the internet only through a proxy that npm
 * won't discover on its own. We:
 *  1. Honor an already-configured proxy (env or the user's ~/.npmrc, which npm
 *     reads itself) — return nothing so we don't override it.
 *  2. Otherwise ask Electron to resolve the OS-level proxy for the registry and
 *     translate a PAC result into HTTP(S)_PROXY env vars.
 *
 * Best-effort: any failure resolves to no additions (DIRECT), so this never
 * blocks an install on a normal network.
 */
export async function resolveInstallProxyEnv(): Promise<NodeJS.ProcessEnv> {
  if (EXISTING_PROXY_KEYS.some((key) => process.env[key]?.trim())) {
    return {}
  }

  try {
    // resolveProxy may fetch a PAC file over the network for an auto-config
    // proxy; cap it so a slow/unreachable PAC URL can't stall the install.
    const pac = await withTimeout(session.defaultSession.resolveProxy(REGISTRY_URL), 3_000)
    if (pac === null) return {}
    const proxyUrl = parsePacProxy(pac)
    if (!proxyUrl) return {}
    return { HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl }
  } catch {
    return {}
  }
}

/** Resolve to `value`, or to null if it doesn't settle within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms).unref?.()
    })
  ])
}

/**
 * Translate a PAC result string ("PROXY host:port; DIRECT", "HTTPS host:port",
 * "DIRECT") into a usable proxy URL, or null for DIRECT / unparseable input.
 */
function parsePacProxy(pac: string): string | null {
  for (const entry of pac.split(';')) {
    const parts = entry.trim().split(/\s+/)
    const kind = parts[0]?.toUpperCase()
    const hostPort = parts[1]
    if (!hostPort) continue
    if (kind === 'PROXY' || kind === 'HTTP') return `http://${hostPort}`
    if (kind === 'HTTPS') return `https://${hostPort}`
  }
  return null
}
