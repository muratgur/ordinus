// Builds mascot avatar assets from the owner's local source renders.
// Source: docs/Chars/<n>.png — transparent background, high-res, gitignored (ADR-038).
// Output: src/renderer/src/assets/mascots/<n>.webp (512px, transparent). Committed.
//
// Workflow: drop/overwrite a numbered PNG in docs/Chars, run `npm run mascots:build`,
// commit the regenerated webp files. Base.png is variant 0.

import sharp from 'sharp'
import { readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const srcDir = join(root, 'docs', 'Chars')
const outDir = join(root, 'app', 'src', 'renderer', 'src', 'assets', 'mascots')

const OUT_SIZE = 512

const sources = readdirSync(srcDir).filter((f) => /^(\d+|Base)\.png$/i.test(f))
if (sources.length === 0) {
  console.error(`no numbered .png sources found in ${srcDir}`)
  process.exit(1)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

for (const file of sources.sort()) {
  const id = /^base\.png$/i.test(file) ? '0' : file.replace(/\.png$/i, '')
  const srcPath = join(srcDir, file)

  const stats = await sharp(srcPath).stats()
  if (stats.isOpaque) {
    console.error(`${file}: no transparency — sources must have the background removed; skipping`)
    continue
  }

  await sharp(srcPath)
    .trim()
    .resize(OUT_SIZE, OUT_SIZE, {
      fit: 'contain',
      // Bottom-anchor: these are bottom-cropped portraits, the figure should
      // sit on the avatar's lower edge, not float centered.
      position: 'south',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({ quality: 90, alphaQuality: 95 })
    .toFile(join(outDir, `${id}.webp`))
  console.log(`${file} -> mascots/${id}.webp`)
}

// ADR-048 §4 / phase 5 — Ordinus's signature character. Built SEPARATELY from
// the agent mascot set (it is a distinct class, not a selectable variant) into
// its own asset path. Source: docs/Chars/Ordinus.png (transparent, head/shoulders).
const ordinusSrc = join(srcDir, 'Ordinus.png')
const ordinusOutDir = join(root, 'app', 'src', 'renderer', 'src', 'assets', 'ordinus')
if (existsSync(ordinusSrc)) {
  mkdirSync(ordinusOutDir, { recursive: true })
  const ordinusStats = await sharp(ordinusSrc).stats()
  if (ordinusStats.isOpaque) {
    console.error('Ordinus.png: no transparency — background must be removed; skipping')
  } else {
    await sharp(ordinusSrc)
      .trim()
      .resize(OUT_SIZE, OUT_SIZE, {
        fit: 'contain',
        position: 'south',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 92, alphaQuality: 95 })
      .toFile(join(ordinusOutDir, 'portrait.webp'))
    console.log('Ordinus.png -> ordinus/portrait.webp')
  }
} else {
  console.warn('Ordinus.png not found in docs/Chars — skipping Ordinus portrait')
}

console.log('done')
