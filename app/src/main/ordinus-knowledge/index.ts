// ADR-029 §6 — Ordinus knowledge pack assembler.
//
// The knowledge pack is a set of curated Markdown sections that get folded
// into the Ordinus system prompt at session init (and ONLY at session init —
// CLI's --resume keeps the cached prompt for subsequent turns, see session.ts).
//
// Adding a new section: drop a .md file into this directory, then add its
// loader to KNOWLEDGE_SECTIONS below. Order here = order in the system
// prompt; keep `core-identity` first so the LLM reads identity before
// feature trivia.
//
// The files are loaded from disk at build/start time. In packaged builds
// the resources/ folder ships them; in dev, the file paths resolve to the
// repo source. Lookup mirrors the migrations-folder pattern (paths.ts).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

type KnowledgeSection = {
  /** Filename within this directory, without extension — also the section id. */
  id: string
  /** Heading shown above the section's content in the assembled prompt. */
  heading: string
}

// Ordered list. Keep identity first; everything else is reference material.
const KNOWLEDGE_SECTIONS: ReadonlyArray<KnowledgeSection> = [
  { id: 'core-identity', heading: 'Who you are' },
  { id: 'workflows', heading: 'Workflows' },
  { id: 'agents', heading: 'Agents' },
  { id: 'schedules', heading: 'Scheduled tasks' },
  { id: 'connectors', heading: 'Connectors' },
  // ADR-029 M5: action tools (propose_work_request, create_schedule,
  // create_workflow) — keep just before recipes so the LLM sees them in
  // context with the patterns that use them.
  { id: 'actions', heading: 'Actions you can take' },
  { id: 'recipes', heading: 'Recipes' }
]

function getKnowledgeFolder(): string {
  // Mirrors getMigrationsFolder in app/src/main/db/migrations.ts. The .md
  // files live ONLY under resources/ — there is no src/main/ copy. Editing
  // them is editing the deployable artifact directly.
  if (app.isPackaged) {
    return join(process.resourcesPath, 'ordinus-knowledge')
  }
  const appPath = join(app.getAppPath(), 'resources', 'ordinus-knowledge')
  if (existsSync(appPath)) {
    return appPath
  }
  return join(process.cwd(), 'resources', 'ordinus-knowledge')
}

function loadSection(folder: string, section: KnowledgeSection): string | null {
  const path = join(folder, `${section.id}.md`)
  if (!existsSync(path)) {
    return null
  }
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return null
  }
}

/**
 * Build the knowledge-pack chunk of the Ordinus system prompt. The returned
 * string is intended to be concatenated with the memory snapshot and tool
 * catalog into the final session-init prompt; this function does NOT include
 * memory or tools — see ordinus/session.ts for the full assembly.
 *
 * Sections missing from disk are silently skipped so a half-shipped build
 * doesn't crash; the loaded section count is implicit in the output.
 */
export function buildKnowledgePrompt(): string {
  const folder = getKnowledgeFolder()
  const parts: string[] = []
  for (const section of KNOWLEDGE_SECTIONS) {
    const body = loadSection(folder, section)
    if (!body) continue
    // The Markdown files already start with their own `#` heading, so we just
    // emit a horizontal rule between sections for legibility in the prompt.
    parts.push(body)
  }
  return parts.join('\n\n---\n\n')
}

/**
 * Snapshot of which sections were actually loaded, for diagnostics and the
 * eventual `/help` command. Cheap enough to call per-render; cache later if
 * the section count grows.
 */
export function listLoadedKnowledgeSections(): Array<{ id: string; heading: string }> {
  const folder = getKnowledgeFolder()
  return KNOWLEDGE_SECTIONS.filter((section) => loadSection(folder, section) !== null).map(
    ({ id, heading }) => ({ id, heading })
  )
}
