// ADR-041: shared runtime bootstrap. uv is downloaded once (single binary,
// pinned version) into app-data and shared by every uv-based connector;
// connector packages are installed with `uv tool install <pkg>==<pin>` with
// all uv state redirected under app-data so the user's machine stays clean.
//
// 'electron-node' connectors (the dev fixture) need no bootstrap at all: the
// app's own binary re-runs as Node via ELECTRON_RUN_AS_NODE=1.

import { app } from 'electron'
import { execFile } from 'node:child_process'
import {
  chmodSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { getLocalMcpPaths } from './paths'
import type { ConnectorManifest, LocalConnectorSpec } from '../integrations/types'

const execFileAsync = promisify(execFile)

// Pinned like connector packages: upgrades ride app releases (ADR-041).
const UV_VERSION = '0.7.13'

// Official SHA-256 sums published alongside the GitHub release. Bumping
// UV_VERSION requires refreshing these — extraction refuses to run on a
// mismatch.
const UV_SHA256: Record<string, string> = {
  'uv-aarch64-apple-darwin.tar.gz':
    '721f532b73171586574298d4311a91d5ea2c802ef4db3ebafc434239330090c6',
  'uv-x86_64-apple-darwin.tar.gz':
    'd785753ac092e25316180626aa691c5dfe1fb075290457ba4fdb72c7c5661321',
  'uv-aarch64-unknown-linux-gnu.tar.gz':
    '0b2ad9fe4295881615295add8cc5daa02549d29cc9a61f0578e397efcf12f08f',
  'uv-x86_64-unknown-linux-gnu.tar.gz':
    '909278eb197c5ed0e9b5f16317d1255270d1f9ea4196e7179ce934d48c4c2545',
  'uv-x86_64-pc-windows-msvc.zip':
    'e199b10bef1a7cc540014483e7f60f825a174988f41020e9d2a6b01bd60f0669'
}

function uvArchiveName(): string {
  const { platform, arch } = process
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'uv-aarch64-apple-darwin.tar.gz' : 'uv-x86_64-apple-darwin.tar.gz'
  }
  if (platform === 'linux') {
    return arch === 'arm64'
      ? 'uv-aarch64-unknown-linux-gnu.tar.gz'
      : 'uv-x86_64-unknown-linux-gnu.tar.gz'
  }
  if (platform === 'win32') {
    return 'uv-x86_64-pc-windows-msvc.zip'
  }
  throw new Error(`Unsupported platform for uv bootstrap: ${platform}/${arch}`)
}

function uvBinaryPath(): string {
  const exe = process.platform === 'win32' ? 'uv.exe' : 'uv'
  return join(getLocalMcpPaths().runtimes, `uv-${UV_VERSION}`, exe)
}

/** Env that confines all uv state (caches, pythons, tools) to app-data. */
function uvEnv(): Record<string, string> {
  const paths = getLocalMcpPaths()
  return {
    UV_CACHE_DIR: join(paths.cache, 'uv'),
    UV_PYTHON_INSTALL_DIR: join(paths.runtimes, 'pythons'),
    UV_TOOL_DIR: join(paths.packages, 'uv-tools'),
    UV_TOOL_BIN_DIR: join(paths.packages, 'uv-bin'),
    UV_NO_PROGRESS: '1'
  }
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`)
  }
  // Node typings disagree with the DOM ReadableStream generic here; the
  // runtime objects are compatible.
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(destination)
  )
}

/** Refuse to extract anything whose digest does not match the pinned sum. */
async function verifySha256(filePath: string, expected: string): Promise<void> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  const actual = hash.digest('hex')
  if (actual !== expected) {
    throw new Error(`uv archive checksum mismatch: expected ${expected}, got ${actual}`)
  }
}

/**
 * Ensure the shared uv binary exists; download + extract on first use. Safe
 * to call repeatedly — returns immediately once installed.
 */
export async function ensureUvRuntime(): Promise<string> {
  const binPath = uvBinaryPath()
  if (existsSync(binPath)) {
    return binPath
  }

  const archive = uvArchiveName()
  const url = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${archive}`
  const stagingDir = join(tmpdir(), `ordinus-uv-${Date.now()}`)
  mkdirSync(stagingDir, { recursive: true })
  const archivePath = join(stagingDir, archive)

  try {
    console.log(`[local-mcp] downloading uv ${UV_VERSION}…`)
    await downloadFile(url, archivePath)
    await verifySha256(archivePath, UV_SHA256[archive])
    // bsdtar handles both .tar.gz and .zip on macOS, Linux, and Windows 10+.
    await execFileAsync('tar', ['-xf', archivePath, '-C', stagingDir])

    const targetDir = join(getLocalMcpPaths().runtimes, `uv-${UV_VERSION}`)
    mkdirSync(targetDir, { recursive: true })
    const exe = process.platform === 'win32' ? 'uv.exe' : 'uv'
    // tar.gz archives nest the binary in a directory named like the archive;
    // zip archives are flat. Try both layouts.
    const nested = join(stagingDir, archive.replace(/\.(tar\.gz|zip)$/, ''), exe)
    const flat = join(stagingDir, exe)
    renameSync(existsSync(nested) ? nested : flat, join(targetDir, exe))
    if (process.platform !== 'win32') {
      chmodSync(join(targetDir, exe), 0o755)
    }
    console.log(`[local-mcp] uv ready at ${binPath}`)
    return binPath
  } finally {
    rmSync(stagingDir, { recursive: true, force: true })
  }
}

export type ResolvedLaunch = {
  command: string
  args: string[]
  env: Record<string, string>
}

/**
 * Install (if needed) the connector's pinned package and resolve the command
 * line the supervisor should spawn. Idempotent: `uv tool install` with an
 * already-satisfied pin is a fast no-op, which is also how lazy upgrades
 * apply after an app update changes the pin.
 */
export async function ensureConnectorInstalled(
  manifest: ConnectorManifest
): Promise<ResolvedLaunch> {
  const spec = requireLocalSpec(manifest)

  if (spec.runtime === 'electron-node') {
    const script = app.isPackaged
      ? join(process.resourcesPath, spec.package)
      : join(app.getAppPath(), 'resources', spec.package)
    if (!existsSync(script)) {
      throw new Error(`Local connector script not found: ${script}`)
    }
    return {
      command: process.execPath,
      args: [script, ...(spec.args ?? [])],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    }
  }

  const uv = await ensureUvRuntime()
  const env = uvEnv()
  for (const [key, dir] of Object.entries(env)) {
    if (key !== 'UV_NO_PROGRESS') {
      mkdirSync(dir, { recursive: true })
    }
  }
  console.log(`[local-mcp] installing ${spec.package}…`)
  await execFileAsync(uv, ['tool', 'install', '--quiet', spec.package], {
    env: { ...process.env, ...env }
  })

  const packageName = spec.package.split(/[=<>]/, 1)[0]
  const exe = process.platform === 'win32' ? `${packageName}.exe` : packageName
  return {
    command: join(env.UV_TOOL_BIN_DIR, exe),
    args: spec.args ?? [],
    env
  }
}

export function installedVersionOf(manifest: ConnectorManifest): string {
  const spec = requireLocalSpec(manifest)
  const pinned = spec.package.split('==')[1]
  return pinned ?? 'dev'
}

export function requireLocalSpec(manifest: ConnectorManifest): LocalConnectorSpec {
  if (manifest.kind !== 'local' || !manifest.local) {
    throw new Error(`Connector ${manifest.id} is not a local connector.`)
  }
  return manifest.local
}
