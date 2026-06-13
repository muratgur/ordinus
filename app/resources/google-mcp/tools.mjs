// ADR-043: Google Workspace tool surface. Read tools (Gmail/Calendar/Drive)
// are implemented here against Google REST via the auth helper; the two
// outward-acting tools (send_email, create_event) stay Phase-3 stubs and ship
// born-disabled, so they are unreachable until both implemented AND enabled.

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const CALENDAR = 'https://www.googleapis.com/calendar/v3'
const DRIVE = 'https://www.googleapis.com/drive/v3'

export const TOOLS = [
  {
    name: 'search_emails',
    description:
      'Search the user’s Gmail with Gmail search syntax (e.g. "from:alice newer_than:7d"). Returns matching messages with sender, subject, date, and snippet.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query.' },
        maxResults: { type: 'number', description: 'Max messages to return (default 10).' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_email',
    description:
      'Fetch one Gmail message by id, returning sender, recipients, subject, date, and plain-text body.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Gmail message id.' } },
      required: ['id']
    }
  },
  {
    name: 'list_events',
    description: 'List upcoming Google Calendar events in a time window.',
    inputSchema: {
      type: 'object',
      properties: {
        timeMin: { type: 'string', description: 'RFC3339 lower bound (default: now).' },
        timeMax: { type: 'string', description: 'RFC3339 upper bound (optional).' },
        maxResults: { type: 'number', description: 'Max events to return (default 10).' },
        calendarId: { type: 'string', description: 'Calendar id (default "primary").' }
      }
    }
  },
  {
    name: 'get_event',
    description: 'Fetch one Google Calendar event by id.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Calendar event id.' },
        calendarId: { type: 'string', description: 'Calendar id (default "primary").' }
      },
      required: ['eventId']
    }
  },
  {
    name: 'search_files',
    description:
      'Search the user’s Google Drive by name/content. Returns matching file ids, names, and types.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text query matched against file name and contents.' },
        maxResults: { type: 'number', description: 'Max files to return (default 10).' }
      },
      required: ['query']
    }
  },
  {
    name: 'read_file',
    description:
      'Read a Google Drive file by id as text (Google Docs export to text, Sheets to CSV, Slides to text).',
    inputSchema: {
      type: 'object',
      properties: { fileId: { type: 'string', description: 'Drive file id.' } },
      required: ['fileId']
    }
  },
  {
    name: 'send_email',
    description: 'Send an email as the user via Gmail. Outward-acting: disabled by default.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient address(es), comma-separated.' },
        subject: { type: 'string', description: 'Subject line.' },
        body: { type: 'string', description: 'Plain-text body.' },
        cc: { type: 'string', description: 'Cc address(es), comma-separated (optional).' },
        bcc: { type: 'string', description: 'Bcc address(es), comma-separated (optional).' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'create_event',
    description:
      'Create a Google Calendar event (may invite attendees). Outward-acting: disabled by default.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title.' },
        start: { type: 'string', description: 'RFC3339 start datetime.' },
        end: { type: 'string', description: 'RFC3339 end datetime.' },
        description: { type: 'string', description: 'Event description (optional).' },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Attendee email addresses (optional).'
        },
        calendarId: { type: 'string', description: 'Calendar id (default "primary").' }
      },
      required: ['summary', 'start', 'end']
    }
  }
]

// --- Gmail helpers -----------------------------------------------------------

function headerMap(headers) {
  const map = {}
  for (const h of headers ?? []) {
    map[h.name] = h.value
  }
  return map
}

function decodeBase64Url(data) {
  if (!data) return ''
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

// First matching MIME part anywhere in the tree (depth-first).
function findPart(payload, mimeType) {
  if (!payload) return null
  if (payload.mimeType === mimeType && payload.body?.data) return payload
  for (const part of payload.parts ?? []) {
    const found = findPart(part, mimeType)
    if (found) return found
  }
  return null
}

// Prefer a text/plain part anywhere in the tree; only if none exists fall back
// to text/html (stripped). Two passes — not a single recursion — so a
// text/plain sibling is never lost to an html branch visited first.
function extractPlainText(payload) {
  const plain = findPart(payload, 'text/plain')
  if (plain) return decodeBase64Url(plain.body.data)
  const html = findPart(payload, 'text/html')
  if (html) {
    return decodeBase64Url(html.body.data)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return ''
}

// Clamp a caller-supplied count to a sane positive integer; invalid or absent
// values fall back to the default rather than reaching Google as NaN or 0.
function clampCount(value, fallback = 10, max = 100) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, max)
}

// Drive query values are single-quoted; escape backslash FIRST, then the quote,
// or a trailing backslash would escape the closing quote and corrupt the query.
function escapeDriveValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// Header values must not carry CR/LF — otherwise an ASCII value like
// "a@b.com\r\nBcc: x" injects extra headers. Strip line breaks defensively.
function sanitizeHeaderValue(value) {
  return String(value).replace(/[\r\n]+/g, ' ').trim()
}

// Run async tasks with bounded concurrency, preserving input order.
async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await task(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// --- Handlers ----------------------------------------------------------------

const handlers = {
  async search_emails(auth, { query, maxResults }) {
    const count = clampCount(maxResults)
    const list = await auth.json(
      `${GMAIL}/messages?q=${encodeURIComponent(query)}&maxResults=${count}`
    )
    const ids = (list.messages ?? []).map((m) => m.id)
    // The per-message metadata GETs are independent — fetch concurrently
    // (bounded, to stay under Gmail's per-user rate limits) instead of N+1
    // serial round-trips. One message failing (e.g. a transient 429/404) must
    // not sink the whole search, so each is caught and degraded to an error
    // entry rather than rejecting. (Auth 401s are retried inside auth.json, so
    // they don't surface here.)
    const messages = await mapWithConcurrency(ids, 5, async (id) => {
      try {
        const m = await auth.json(
          `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        )
        const h = headerMap(m.payload?.headers)
        return { id, from: h.From, subject: h.Subject, date: h.Date, snippet: m.snippet }
      } catch (err) {
        return { id, error: err instanceof Error ? err.message : 'Could not load this message.' }
      }
    })
    return { count: messages.length, messages }
  },

  async get_email(auth, { id }) {
    const m = await auth.json(`${GMAIL}/messages/${id}?format=full`)
    const h = headerMap(m.payload?.headers)
    return {
      id,
      from: h.From,
      to: h.To,
      cc: h.Cc,
      subject: h.Subject,
      date: h.Date,
      body: extractPlainText(m.payload) || m.snippet || ''
    }
  },

  async list_events(auth, { timeMin, timeMax, maxResults, calendarId = 'primary' }) {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(clampCount(maxResults)),
      timeMin: timeMin || new Date().toISOString()
    })
    if (timeMax) params.set('timeMax', timeMax)
    const data = await auth.json(
      `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events?${params}`
    )
    const events = (data.items ?? []).map((e) => ({
      id: e.id,
      summary: e.summary,
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      location: e.location,
      attendees: (e.attendees ?? []).map((a) => a.email)
    }))
    return { count: events.length, events }
  },

  async get_event(auth, { eventId, calendarId = 'primary' }) {
    const e = await auth.json(
      `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    )
    return {
      id: e.id,
      summary: e.summary,
      description: e.description,
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      location: e.location,
      organizer: e.organizer?.email,
      attendees: (e.attendees ?? []).map((a) => ({ email: a.email, response: a.responseStatus }))
    }
  },

  async search_files(auth, { query, maxResults }) {
    const q = `fullText contains '${escapeDriveValue(query)}' and trashed = false`
    const params = new URLSearchParams({
      q,
      pageSize: String(clampCount(maxResults)),
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink)'
    })
    const data = await auth.json(`${DRIVE}/files?${params}`)
    return { count: (data.files ?? []).length, files: data.files ?? [] }
  },

  async read_file(auth, { fileId }) {
    const meta = await auth.json(
      `${DRIVE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType`
    )
    let content
    if (meta.mimeType?.startsWith('application/vnd.google-apps.')) {
      const exportMime =
        meta.mimeType === 'application/vnd.google-apps.spreadsheet' ? 'text/csv' : 'text/plain'
      content = await auth.text(
        `${DRIVE}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`
      )
    } else {
      content = await auth.text(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media`)
    }
    return { id: meta.id, name: meta.name, mimeType: meta.mimeType, content }
  },

  // ADR-043 Phase 3: outward-acting tools. Implemented, but born disabled — an
  // agent can only reach these after the user opts in per-tool in Settings.
  async send_email(auth, { to, subject, body, cc, bcc }) {
    const raw = buildRawMessage({ to, subject, body, cc, bcc })
    const sent = await auth.postJson(`${GMAIL}/messages/send`, { raw })
    return { sent: true, id: sent.id, threadId: sent.threadId }
  },

  async create_event(auth, { summary, start, end, description, attendees = [], calendarId = 'primary' }) {
    const body = {
      summary,
      description,
      start: timePoint(start),
      end: timePoint(end),
      attendees: attendees.map((email) => ({ email }))
    }
    // sendUpdates=all so invited attendees actually receive the invitation.
    const query = attendees.length > 0 ? '?sendUpdates=all' : ''
    const event = await auth.postJson(
      `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events${query}`,
      body
    )
    return {
      created: true,
      id: event.id,
      htmlLink: event.htmlLink,
      summary: event.summary,
      start: event.start?.dateTime ?? event.start?.date,
      end: event.end?.dateTime ?? event.end?.date
    }
  }
}

// RFC 2047 encoded-word for non-ASCII header values (Turkish subjects etc.).
function encodeHeaderValue(value) {
  if (/^[\x00-\x7F]*$/.test(value)) {
    return value
  }
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

// Build a base64url-encoded RFC 2822 message for gmail.messages.send. Body is
// sent base64 with an explicit UTF-8 content type so non-ASCII text is intact.
function buildRawMessage({ to, subject, body, cc, bcc }) {
  // Strip CR/LF from every header value before assembling the header block —
  // an unsanitized value (even pure ASCII) would otherwise inject extra
  // headers like Bcc. Subject is additionally RFC2047-encoded for non-ASCII.
  const headers = [
    `To: ${sanitizeHeaderValue(to)}`,
    cc ? `Cc: ${sanitizeHeaderValue(cc)}` : null,
    bcc ? `Bcc: ${sanitizeHeaderValue(bcc)}` : null,
    `Subject: ${encodeHeaderValue(sanitizeHeaderValue(subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64'
  ].filter(Boolean)
  const message = `${headers.join('\r\n')}\r\n\r\n${Buffer.from(body, 'utf8').toString('base64')}`
  return Buffer.from(message, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// All-day events use {date}; timed events use {dateTime} (RFC3339).
function timePoint(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? { date: value } : { dateTime: value }
}

export function registerTools(server, auth) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const handler = handlers[request.params.name]
    if (!handler) {
      return errorResult(`Unknown tool: ${request.params.name}`)
    }
    if (!auth.configured) {
      return errorResult('Google is not connected — reconnect from Settings → Connections.')
    }
    try {
      const result = await handler(auth, request.params.arguments ?? {})
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
  })
}

function errorResult(message) {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true }
}
