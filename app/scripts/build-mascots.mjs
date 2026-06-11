// Builds mascot avatar assets from the owner's local source renders.
// Source: docs/Chars/<n>.png — transparent background, high-res, gitignored (ADR-038).
// Output: src/renderer/src/assets/mascots/<n>.webp (512px, transparent). Committed.
//
// Workflow: drop/overwrite a numbered PNG in docs/Chars, run `npm run mascots:build`,
// commit the regenerated webp files. Base.png is variant 0.

import sharp from 'sharp'
import { readdirSync, mkdirSync, rmSync } from 'node:fs'
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
console.log('done')
