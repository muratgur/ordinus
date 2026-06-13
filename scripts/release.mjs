#!/usr/bin/env node
// Release helper: bumps the version in both the root and app/ packages
// (package.json + package-lock.json), commits, tags, and pushes the tag.
//
// Pushing a v* tag triggers .github/workflows/release.yml, which builds the
// macOS + Windows artifacts and publishes a GitHub Release. See
// docs/packaging-release.md.
//
// Usage:
//   npm run release 0.2.5             explicit version
//   npm run release patch|minor|major semver bump (based on app/ version)
//   npm run release -- --dry-run patch  show what would happen, change nothing
//   npm run release -- --yes patch      skip the push confirmation prompt

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(repoRoot, 'app')

// Files the release commit is allowed to touch — nothing else gets staged.
const VERSION_FILES = [
  'package.json',
  'package-lock.json',
  'app/package.json',
  'app/package-lock.json',
]

const BUMP_KEYWORDS = ['patch', 'minor', 'major']

function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`)
  process.exit(1)
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim()
}

function git(args, opts = {}) {
  return run('git', args, { cwd: repoRoot, ...opts })
}

// ── parse args ────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2)
const flags = new Set(rawArgs.filter((a) => a.startsWith('--')))
const positionals = rawArgs.filter((a) => !a.startsWith('--'))
const dryRun = flags.has('--dry-run')
const autoYes = flags.has('--yes')

if (positionals.length !== 1) {
  fail(
    'Expected exactly one version argument.\n' +
      '    Usage: npm run release <version|patch|minor|major>\n' +
      '    e.g.   npm run release 0.2.5\n' +
      '           npm run release patch',
  )
}

const target = positionals[0]

// ── resolve the new version ─────────────────────────────────────────────────
const currentVersion = JSON.parse(
  readFileSync(join(appDir, 'package.json'), 'utf8'),
).version

function bump(version, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!m) fail(`Current version "${version}" is not a plain semver; bump it explicitly.`)
  let [major, minor, patch] = m.slice(1).map(Number)
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

let newVersion
if (BUMP_KEYWORDS.includes(target)) {
  newVersion = bump(currentVersion, target)
} else if (/^\d+\.\d+\.\d+$/.test(target)) {
  newVersion = target
} else {
  fail(`"${target}" is neither a semver (x.y.z) nor one of ${BUMP_KEYWORDS.join('/')}.`)
}

const tag = `v${newVersion}`

console.log(`\n  Release: ${currentVersion} → ${newVersion}  (tag ${tag})`)
if (dryRun) console.log('  [dry-run] no files, commits, tags, or pushes will change.')

// ── safety checks ───────────────────────────────────────────────────────────
if (!dryRun) {
  const dirty = git(['status', '--porcelain'])
  if (dirty) {
    fail(
      'Working tree is not clean. Commit or stash your changes first so the\n' +
        '    release commit contains only the version bump.\n\n' +
        dirty,
    )
  }
}

// Local tag
try {
  git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { stdio: 'pipe' })
  fail(`Tag ${tag} already exists locally.`)
} catch {
  /* not found — good */
}

// Remote tag
try {
  const remote = git(['ls-remote', '--tags', 'origin', tag], { stdio: 'pipe' })
  if (remote) fail(`Tag ${tag} already exists on origin.`)
} catch {
  /* offline or no remote — let the push step surface it later */
}

if (dryRun) {
  console.log('\n  [dry-run] Would run:')
  console.log(`    npm version ${newVersion} --no-git-tag-version  (root and app/)`)
  console.log(`    git add ${VERSION_FILES.join(' ')}`)
  console.log(`    git commit -m "chore: release ${tag}"`)
  console.log(`    git tag ${tag}`)
  console.log(`    git push --follow-tags\n`)
  process.exit(0)
}

// ── bump versions (npm-native, no network, keeps lockfileVersion) ─────────────
const npmVersionArgs = ['version', newVersion, '--no-git-tag-version', '--allow-same-version']
console.log('\n  Bumping versions…')
run('npm', npmVersionArgs, { cwd: repoRoot, stdio: 'pipe' })
run('npm', npmVersionArgs, { cwd: appDir, stdio: 'pipe' })

// ── commit + tag ──────────────────────────────────────────────────────────────
git(['add', ...VERSION_FILES])
git(['commit', '-m', `chore: release ${tag}`])
git(['tag', tag])
console.log(`  Committed and tagged ${tag}.`)
console.log('\n' + git(['show', '--stat', '--oneline', 'HEAD']))

// ── push (confirm first — this triggers the public release) ───────────────────
async function confirmPush() {
  if (autoYes) return true
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) =>
    rl.question(
      `\n  Push ${tag} to origin? This triggers the GitHub release build. [y/N] `,
      resolve,
    ),
  )
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

if (await confirmPush()) {
  console.log('\n  Pushing…')
  git(['push', '--follow-tags'])
  console.log(`\n  ✓ Pushed ${tag}. Watch the build:`)
  console.log('    https://github.com/muratgur/ordinus/actions\n')
} else {
  console.log(
    `\n  Skipped push. The commit and tag exist locally. To release later:\n` +
      `    git push --follow-tags\n` +
      `  To undo:\n` +
      `    git tag -d ${tag} && git reset --hard HEAD~1\n`,
  )
}
