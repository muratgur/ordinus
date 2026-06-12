// ADR-040: the app-shipped skill library. Authored as code so app updates
// refresh every installation from one place (synced to userData on launch by
// skills/library.ts). Selection rule: only deliverables where CLIs produce
// generic "AI slop" — never capabilities the CLIs already handle well.

export type BuiltinSkillFile = {
  name: string
  content: string
}

export type BuiltinSkill = {
  id: string
  files: BuiltinSkillFile[]
}

const htmlSkillDocument = [
  '---',
  'name: "Ordinus HTML deliverable"',
  'description: "Use whenever the deliverable is an HTML page, report, or summary the user will read or share. Produces a clean, branded document instead of a generic AI-styled page."',
  '---',
  '',
  '# Ordinus HTML Deliverable',
  '',
  'Produce HTML documents that read like a carefully edited report, not like a',
  'generated page. Start from `template.html` and `report.css` in this skill',
  'folder: copy both into the output, keep the structure, replace the content.',
  '',
  '## Workflow',
  '',
  '1. Gather and verify the content first; write the document outline before any HTML.',
  '2. Copy `template.html` and `report.css` next to your output (or inline the CSS into one self-contained file when the user needs a single file).',
  '3. Fill the template slots: title, subtitle, dated byline, sections.',
  '4. Re-read the rendered result as an editor: cut filler, merge thin sections.',
  '',
  '## Hard rules — violating any of these is a failed deliverable',
  '',
  '- No emoji in headings or body text.',
  '- No gradient backgrounds, glassmorphism, cards-with-shadows grids, or hero banners.',
  '- No more than two font families (the template defines them).',
  '- Headings are sentences or noun phrases in sentence case — never Title Case shouting, never numbered "1. Introduction" filler.',
  '- Every section must carry content the reader needs; no "Conclusion" that restates the page.',
  '- Charts and tables only when there is real data; never decorative placeholders.',
  '- Use the palette and spacing variables from `report.css`; do not invent colors.',
  '- Plain semantic HTML (h1-h3, p, table, figure); no JS frameworks, no icon fonts.',
  '',
  '## Voice',
  '',
  '- Lead with findings, not with methodology.',
  '- Short paragraphs (2-4 sentences). Bullet lists only for genuinely enumerable items.',
  '- Numbers get context: "12% (down from 18% last quarter)", not bare figures.'
].join('\n')

const htmlTemplate = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1" />',
  '<title>{{TITLE}}</title>',
  '<link rel="stylesheet" href="report.css" />',
  '</head>',
  '<body>',
  '<main class="report">',
  '  <header class="report-header">',
  '    <p class="report-kicker">{{KICKER — e.g. Marketing strategy / June 2026}}</p>',
  '    <h1>{{TITLE}}</h1>',
  '    <p class="report-summary">{{One-paragraph executive summary: the answer, not the agenda.}}</p>',
  '  </header>',
  '  <section>',
  '    <h2>{{Section heading}}</h2>',
  '    <p>{{Content}}</p>',
  '  </section>',
  '  <footer class="report-footer">',
  '    <p>{{Prepared by AGENT_NAME · DATE}}</p>',
  '  </footer>',
  '</main>',
  '</body>',
  '</html>'
].join('\n')

const reportCss = [
  '/* Ordinus report stylesheet — calm editorial document, not a web app. */',
  ':root {',
  '  --ink: #1c1d1f;',
  '  --ink-soft: #5b5e66;',
  '  --paper: #fdfdfc;',
  '  --rule: #e4e2dd;',
  '  --accent: #2f5d50;',
  '  --measure: 44rem;',
  '}',
  'html { background: var(--paper); }',
  'body {',
  '  margin: 0;',
  '  color: var(--ink);',
  '  font: 16px/1.65 Georgia, "Times New Roman", serif;',
  '}',
  '.report { max-width: var(--measure); margin: 0 auto; padding: 4rem 1.5rem 6rem; }',
  '.report-kicker {',
  '  font: 600 0.78rem/1.4 system-ui, sans-serif;',
  '  letter-spacing: 0.08em;',
  '  text-transform: uppercase;',
  '  color: var(--accent);',
  '  margin: 0 0 0.75rem;',
  '}',
  'h1 { font-size: 2rem; line-height: 1.25; margin: 0 0 1rem; font-weight: 600; }',
  'h2 {',
  '  font: 600 1.15rem/1.4 system-ui, sans-serif;',
  '  margin: 2.5rem 0 0.75rem;',
  '  padding-top: 1.5rem;',
  '  border-top: 1px solid var(--rule);',
  '}',
  'h3 { font: 600 1rem/1.4 system-ui, sans-serif; margin: 1.5rem 0 0.5rem; }',
  'p { margin: 0 0 1rem; }',
  '.report-summary { font-size: 1.1rem; color: var(--ink-soft); }',
  'table { width: 100%; border-collapse: collapse; margin: 1.25rem 0; font: 0.92rem/1.5 system-ui, sans-serif; }',
  'th { text-align: left; font-weight: 600; border-bottom: 2px solid var(--ink); padding: 0.4rem 0.6rem 0.4rem 0; }',
  'td { border-bottom: 1px solid var(--rule); padding: 0.45rem 0.6rem 0.45rem 0; }',
  'td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }',
  'figure { margin: 1.5rem 0; }',
  'figcaption { font: 0.82rem/1.5 system-ui, sans-serif; color: var(--ink-soft); margin-top: 0.5rem; }',
  '.report-footer { margin-top: 4rem; padding-top: 1rem; border-top: 1px solid var(--rule); font: 0.82rem/1.5 system-ui, sans-serif; color: var(--ink-soft); }',
  '@media print { .report { padding: 0; } }'
].join('\n')

const sunumSkillDocument = [
  '---',
  'name: "Ordinus presentation"',
  'description: "Use when the deliverable is a presentation, slide deck, or one-pager someone will present or skim. Produces focused HTML slides instead of bullet-heavy generated decks."',
  '---',
  '',
  '# Ordinus Presentation',
  '',
  'Build presentations as a single self-contained HTML file of stacked slide',
  'sections (print-to-PDF friendly). The bar: every slide survives the "glance',
  'test" — a reader gets the point in three seconds.',
  '',
  '## Hard rules',
  '',
  '- One idea per slide. If a slide needs "and", split it.',
  '- Slide titles are full assertions ("Churn is concentrated in month two"), never labels ("Churn analysis").',
  '- Maximum 4 bullets per slide, one line each; prefer a single chart, table, or statement over bullets.',
  '- No emoji, no stock-photo placeholders, no decorative icons, no gradients.',
  '- Same type system as the Ordinus HTML deliverable: one serif for statements, one sans for support; sentence case everywhere.',
  '- Numbers carry comparison or context, never stand alone.',
  '- End with a decision/next-steps slide only if there are real decisions to make.',
  '',
  '## Structure',
  '',
  '1. Title slide: assertion-style title + one-line takeaway + date/author.',
  '2. Body slides: each `<section class="slide">` with a heading and at most one supporting block.',
  '3. Use CSS `@media print { .slide { page-break-after: always; } }` so printing yields one slide per page.'
].join('\n')

const tabloSkillDocument = [
  '---',
  'name: "Ordinus spreadsheet"',
  'description: "Use when the deliverable is tabular data the user will open in Excel or Numbers — produce a formatted .xlsx, not a bare CSV dump."',
  '---',
  '',
  '# Ordinus Spreadsheet',
  '',
  'When the user asks for data "as a table/list/export", deliver a formatted',
  '.xlsx (use any available xlsx library or tooling; fall back to CSV only if',
  'xlsx generation is impossible, and say so).',
  '',
  '## Hard rules',
  '',
  '- First row is a styled header: bold, background fill, frozen (freeze panes at A2).',
  '- Every column typed correctly: dates as dates (ISO display yyyy-mm-dd), numbers as numbers — never numbers-as-text.',
  '- Money and large numbers get thousands separators and consistent decimals; percentages formatted as percentages.',
  '- Column widths sized to content (no truncated headers, no 300-px voids).',
  '- If the data invites totals or averages, add a clearly styled summary row — separated, bold, never mixed into the data rows.',
  '- One sheet per logical dataset; name sheets after their content, never "Sheet1".',
  '- No merged cells in data areas, no color-coding without a legend.',
  '- State the row count and where the file was written when reporting back.'
].join('\n')

const grafikSkillDocument = [
  '---',
  'name: "Ordinus chart"',
  'description: "Use when the deliverable includes a data visualization (chart, graph, trend) for an HTML report or standalone view. Produces honest, legible SVG charts without chartjunk."',
  '---',
  '',
  '# Ordinus Chart',
  '',
  'Charts are inline SVG (no JS chart libraries) embedded in the deliverable.',
  'A chart earns its place only if it shows a comparison, trend, or',
  'distribution the text cannot state more clearly.',
  '',
  '## Hard rules',
  '',
  '- No 3D, no pie charts beyond 4 slices (prefer a bar chart), no dual y-axes.',
  '- Bars start at zero. Truncated axes must be impossible to misread — if you must truncate a line chart axis, mark it explicitly.',
  '- Maximum 6 series; beyond that, aggregate or split into small multiples.',
  '- Direct-label series at the line/bar end instead of color-only legends when space allows.',
  '- Palette: use the report accent (#2f5d50) for the primary series and muted greys for context; never rainbow palettes.',
  '- Axis labels in a small sans-serif with tabular numerals; horizontal text only (rotate the chart, not the labels).',
  '- Every chart has a one-line takeaway as its `<figcaption>` ("Support tickets doubled after the March release").',
  '- Gridlines: horizontal only, hairline, behind the data.'
].join('\n')

export const builtinSkills: BuiltinSkill[] = [
  {
    id: 'ordinus-html',
    files: [
      { name: 'SKILL.md', content: htmlSkillDocument },
      { name: 'template.html', content: htmlTemplate },
      { name: 'report.css', content: reportCss }
    ]
  },
  {
    id: 'ordinus-sunum',
    files: [{ name: 'SKILL.md', content: sunumSkillDocument }]
  },
  {
    id: 'ordinus-tablo',
    files: [{ name: 'SKILL.md', content: tabloSkillDocument }]
  },
  {
    id: 'ordinus-grafik',
    files: [{ name: 'SKILL.md', content: grafikSkillDocument }]
  }
]
