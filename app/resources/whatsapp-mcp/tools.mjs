// MCP tool surface (ADR-042): read tools over the local store, plus
// send_message with its server-side guardrails — text-only, existing chats
// only (no cold contact), and a throttle queue. The guardrails live here and
// not in the supervisor proxy because they are WhatsApp domain knowledge;
// the proxy stays generic. send_message is born disabled by the manifest
// (it is absent from defaultEnabledTools) — the user opts in from Settings.

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const TOOLS = [
  {
    name: 'search_contacts',
    description:
      'Search WhatsApp contacts and chats by name or phone number. Returns matching chats with their jid (use the jid with get_messages).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Name fragment or phone number digits to search for.'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'list_chats',
    description:
      'List the most recent WhatsApp chats (direct and group), newest first, with their jid and last-activity time.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum chats to return (default 20, max 100).' }
      }
    }
  },
  {
    name: 'get_messages',
    description:
      'Read messages from one WhatsApp chat, newest first. Media is shown as typed placeholders like [image]; only text is stored. Paginate by passing before = the oldest timestamp from the previous page.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_jid: { type: 'string', description: 'Chat jid from list_chats or search_contacts.' },
        limit: { type: 'number', description: 'Maximum messages to return (default 50, max 200).' },
        before: {
          type: 'number',
          description: 'Only messages with a unix timestamp strictly below this value.'
        }
      },
      required: ['chat_jid']
    }
  },
  {
    name: 'send_message',
    description:
      'Send a text message to an EXISTING WhatsApp chat. Only chats already present in list_chats/search_contacts can be messaged — new conversations cannot be started. Sends are rate-limited; sending media is not supported.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_jid: { type: 'string', description: 'Chat jid from list_chats or search_contacts.' },
        text: { type: 'string', description: 'The plain-text message to send.' }
      },
      required: ['chat_jid', 'text']
    }
  }
]

// Minimum gap between outgoing messages. A burst of agent sends drains
// slowly instead of hitting WhatsApp at machine speed (ban-risk guardrail).
const SEND_GAP_MS = 4000

/**
 * @param mcp MCP Server instance
 * @param store store handle from openStore()
 * @param sendText async (jid, text) => void — provided by server.mjs, bound
 *   to the live socket; absent in contexts that cannot send (tests).
 */
export function registerTools(mcp, store, sendText) {
  const searchStmt = store.db.prepare(`
    SELECT c.jid, COALESCE(c.name, k.name) AS name, c.last_message_at
    FROM chats c
    LEFT JOIN contacts k ON k.jid = c.jid
    LEFT JOIN aliases a ON a.jid = c.jid
    WHERE COALESCE(c.name, k.name, '') LIKE ? OR c.jid LIKE ? OR COALESCE(a.alt, '') LIKE ?
    ORDER BY c.last_message_at DESC
    LIMIT 25
  `)
  const listStmt = store.db.prepare(`
    SELECT c.jid, COALESCE(c.name, k.name) AS name, c.last_message_at
    FROM chats c LEFT JOIN contacts k ON k.jid = c.jid
    ORDER BY c.last_message_at DESC
    LIMIT ?
  `)
  const messagesStmt = store.db.prepare(`
    SELECT m.id, m.sender, COALESCE(k.name, m.sender) AS sender_name, m.ts, m.text, m.from_me
    FROM messages m LEFT JOIN contacts k ON k.jid = m.sender
    WHERE m.chat_jid = ? AND m.ts < ?
    ORDER BY m.ts DESC
    LIMIT ?
  `)

  const chatExistsStmt = store.db.prepare('SELECT 1 FROM chats WHERE jid = ?')

  // Throttle queue: every send awaits the previous one plus a fixed gap.
  let sendChain = Promise.resolve()
  const enqueueSend = (jid, text) => {
    const result = sendChain.then(async () => {
      await sendText(jid, text)
      await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS))
    })
    // The chain itself swallows failures so one failed send doesn't poison
    // every later one; the caller still sees the rejection via `result`.
    sendChain = result.catch(() => {})
    return result
  }

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    const respond = (payload) => ({
      content: [{ type: 'text', text: JSON.stringify(payload) }]
    })
    try {
      if (name === 'search_contacts') {
        const like = `%${String(args.query ?? '').trim()}%`
        return respond({ results: searchStmt.all(like, like, like) })
      }
      if (name === 'list_chats') {
        const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100)
        return respond({ chats: listStmt.all(limit) })
      }
      if (name === 'get_messages') {
        const chatJid = String(args.chat_jid ?? '')
        const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200)
        const before = Number.isFinite(Number(args.before))
          ? Number(args.before)
          : Number.MAX_SAFE_INTEGER
        const messages = messagesStmt.all(chatJid, before, limit)
        return respond({ chat_jid: chatJid, messages })
      }
      if (name === 'send_message') {
        if (!sendText) {
          return {
            content: [{ type: 'text', text: 'Sending is not available right now.' }],
            isError: true
          }
        }
        const chatJid = String(args.chat_jid ?? '')
        const text = String(args.text ?? '').trim()
        if (!text) {
          return { content: [{ type: 'text', text: 'Message text is empty.' }], isError: true }
        }
        // No cold contact: the jid must already be a known chat.
        if (!chatExistsStmt.get(chatJid)) {
          return {
            content: [
              {
                type: 'text',
                text: `Unknown chat: ${chatJid}. Messages can only be sent to existing chats (use list_chats or search_contacts).`
              }
            ],
            isError: true
          }
        }
        await enqueueSend(chatJid, text)
        return respond({ sent: true, chat_jid: chatJid })
      }
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
    } catch (err) {
      return { content: [{ type: 'text', text: `Tool failed: ${err.message}` }], isError: true }
    }
  })
}
