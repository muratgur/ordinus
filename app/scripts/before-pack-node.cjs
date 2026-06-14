// ADR-047: bundle a real standalone Node runtime into the packaged app.
//
// electron-builder calls this once per (platform, arch) target right before it
// packs the app. We download the matching official Node binary, verify its
// SHA-256 against nodejs.org's SHASUMS256.txt, extract just the `node`
// executable, and drop it at app/resources/runtime/node/<bin>. The
// `extraResources` entry in electron-builder.yml then copies it into the app's
// Resources directory, where bundled-node.ts resolves it at runtime.
//
// Dev (`npm run dev`) never runs this hook, so no Node is bundled there and the
// developer's own system Node is used instead.
//
// Run standalone for the host platform with: `node scripts/before-pack-node.cjs`

const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, chmodSync } = require('node:fs')
const { writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

// Pinned to match the app's `engines.node` floor and Electron 39's Node major.
// Bump deliberately (security patches, or a CLI raising its minimum).
const NODE_VERSION = '22.13.0'

// Single shared destination, rewritten per (platform, arch) target. This is
// correct because electron-builder runs beforePack→pack sequentially per
// target, so a target's resources are copied before the next target's
// beforePack overwrites this dir. Universal builds (both arches at once) are
// rejected in nodeArch(); afterPack asserts the right binary shipped.
const DEST_DIR = join(__dirname, '..', 'resources', 'runtime', 'node')

/** Map electron-builder's platform name to Node's dist platform token. */
function nodePlatform(electronPlatformName) {
  switch (electronPlatformName) {
    case 'darwin':
      return 'darwin'
    case 'win32':
      return 'win'
    case 'linux':
      return 'linux'
    default:
      throw new Error(`ADR-047: unsupported platform for bundled Node: ${electronPlatformName}`)
  }
}

/** Map electron-builder's Arch enum (number) to Node's dist arch token. */
function nodeArch(arch) {
  // electron-builder Arch enum: ia32=0, x64=1, armv7l=2, arm64=3, universal=4
  switch (arch) {
    case 1:
      return 'x64'
    case 3:
      return 'arm64'
    case 4:
      throw new Error(
        'ADR-047: universal builds need both arch binaries — not supported by this hook yet'
      )
    default:
      throw new Error(`ADR-047: unsupported arch for bundled Node: ${arch}`)
  }
}

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`ADR-047: download failed (${res.status}) for ${url}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function fetchNode(platform, arch) {
  const plat = nodePlatform(platform)
  const a = nodeArch(arch)
  const isWin = plat === 'win'
  const ext = isWin ? 'zip' : plat === 'linux' ? 'tar.xz' : 'tar.gz'
  const base = `node-v${NODE_VERSION}-${plat}-${a}`
  const archiveName = `${base}.${ext}`
  const distBase = `https://nodejs.org/dist/v${NODE_VERSION}`
  const binName = isWin ? 'node.exe' : 'node'

  console.log(`[ADR-047] bundling Node ${NODE_VERSION} for ${plat}-${a}`)

  // 1. Download archive + checksums, then verify.
  const [archive, shasums] = await Promise.all([
    download(`${distBase}/${archiveName}`),
    download(`${distBase}/SHASUMS256.txt`).then((b) => b.toString('utf8'))
  ])

  const expected = shasums
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find(([, name]) => name === archiveName)?.[0]
  if (!expected) {
    throw new Error(`ADR-047: no checksum found for ${archiveName}`)
  }
  const actual = sha256(archive)
  if (actual !== expected) {
    throw new Error(`ADR-047: checksum mismatch for ${archiveName}\n  expected ${expected}\n  got      ${actual}`)
  }

  // 2. Extract just the node binary via a staging dir.
  const staging = mkdtempSync(join(tmpdir(), 'ordinus-node-'))
  const archivePath = join(staging, archiveName)
  try {
    await writeFile(archivePath, archive)
    // bsdtar (macOS) and GNU tar both extract .tar.*; bsdtar also handles .zip.
    try {
      execFileSync('tar', ['-xf', archivePath, '-C', staging], { stdio: 'ignore' })
    } catch (tarError) {
      if (isWin) {
        // GNU tar can't read zip — fall back to unzip on Linux build hosts.
        execFileSync('unzip', ['-q', '-o', archivePath, '-d', staging], { stdio: 'ignore' })
      } else {
        throw tarError
      }
    }

    const extractedBin = isWin
      ? join(staging, base, 'node.exe')
      : join(staging, base, 'bin', 'node')
    if (!existsSync(extractedBin)) {
      throw new Error(`ADR-047: node binary not found after extract: ${extractedBin}`)
    }

    // 3. Place it where extraResources expects it.
    rmSync(DEST_DIR, { recursive: true, force: true })
    mkdirSync(DEST_DIR, { recursive: true })
    const dest = join(DEST_DIR, binName)
    copyFileSync(extractedBin, dest)
    if (!isWin) chmodSync(dest, 0o755)
    console.log(`[ADR-047] bundled Node -> ${dest}`)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

// electron-builder beforePack hook entrypoint.
module.exports = async function beforePack(context) {
  await fetchNode(context.electronPlatformName, context.arch)
}

// Standalone run for the host platform/arch (manual testing).
if (require.main === module) {
  const hostPlatform = process.platform
  const hostArch = process.arch === 'arm64' ? 3 : process.arch === 'x64' ? 1 : -1
  fetchNode(hostPlatform, hostArch).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
