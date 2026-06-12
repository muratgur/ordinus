// Ordinus WhatsApp MCP server (ADR-042) — Baileys-based, runs as an
// electron-node child under the local-mcp supervisor.
//
// Two modes, selected by argv:
//   --login --phone <digits> --auth-dir <dir>
//     One-shot pairing run (ADR-042 two-phase login). Emits line-delimited
//     JSON events on stdout ({"event":"pairing-code"|"paired"|"error"}),
//     writes session files into --auth-dir, exits 0 once paired. stdout is
//     the event channel here — nothing else may write to it.
//   --auth-dir <dir>   (service mode)
//     Speaks MCP over stdio (so Baileys logging must never touch stdout),
//     keeps the WhatsApp connection alive, and ingests the one-time history
//     sync plus the live event stream into the node:sqlite store (store.mjs)
//     next to the session files — Disconnect wipes session and history
//     together. On loggedOut it drops a `logged-out` marker in the auth dir
//     and exits 41, which the supervisor turns into "Reconnect required";
//     data stays, deletion belongs to Disconnect.
//
// Tool surface (tools.mjs, Phase 2): search_contacts, list_chats,
// get_messages — read-only over the local store. send_message is Phase 3.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from 'baileys'
import pino from 'pino'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { openStore, ingestMessage, bareJid } from './store.mjs'
import { registerTools } from './tools.mjs'

const EXIT_LOGGED_OUT = 41
const LOGGED_OUT_MARKER = 'logged-out'
// Baileys defaults its pino logger to stdout, which would corrupt both the
// login event stream and the MCP stdio channel.
const silentLogger = pino({ level: 'silent' })

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  return index !== -1 ? process.argv[index + 1] : undefined
}

const authDir = argValue('--auth-dir')
if (!authDir) {
  console.error('Missing required --auth-dir')
  process.exit(1)
}
mkdirSync(authDir, { recursive: true })

if (process.argv.includes('--login')) {
  await runLoginMode()
} else {
  await runServiceMode()
}

// --- Login mode --------------------------------------------------------------

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`)
}

async function runLoginMode() {
  // Via env rather than argv: the phone number must not show up in `ps`
  // output for the lifetime of the login child. (--phone kept as a fallback
  // for manual terminal runs.)
  const phone = (process.env.ORDINUS_WA_PHONE ?? argValue('--phone'))?.replace(/\D/g, '')
  if (!phone) {
    emit({ event: 'error', reason: 'Missing phone number' })
    process.exit(1)
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const sock = makeWASocket({ auth: state, logger: silentLogger, printQRInTerminal: false })
  sock.ev.on('creds.update', saveCreds)

  if (!state.creds.registered) {
    // The pairing code can only be requested once the socket is up; a short
    // delay after construction is the documented Baileys v7 pattern.
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phone)
        emit({ event: 'pairing-code', code })
      } catch (err) {
        emit({ event: 'error', reason: `Could not request a pairing code: ${err.message}` })
        process.exit(1)
      }
    }, 3000)
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      // Paired: session files are in authDir. A fresh pairing supersedes any
      // earlier logged-out state.
      rmSync(join(authDir, LOGGED_OUT_MARKER), { force: true })
      emit({ event: 'paired' })
      // Give the final creds.update writes a moment to flush before exiting.
      setTimeout(() => process.exit(0), 1500)
    } else if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode
      if (status === DisconnectReason.restartRequired) {
        // Normal mid-pairing socket cycle — Baileys expects a reconnect.
        runLoginMode().catch(() => process.exit(1))
        return
      }
      emit({
        event: 'error',
        reason: `Connection closed during pairing (status ${status ?? 'unknown'})`
      })
      process.exit(1)
    }
  })
}

// --- Service mode ------------------------------------------------------------

async function runServiceMode() {
  const store = openStore(authDir)

  // The socket is replaced on every reconnect; sends always go through the
  // holder so they reach the live one (or fail clearly while offline).
  const holder = { sock: null, open: false }
  const sendText = async (jid, text) => {
    if (!holder.sock || !holder.open) {
      throw new Error('WhatsApp is not connected right now — try again shortly.')
    }
    await holder.sock.sendMessage(jid, { text })
  }

  // MCP comes up first so the supervisor's client connect never races the
  // (slower) WhatsApp connection. The tools capability must be declared from
  // the start — Connect runs tools/list discovery against this server.
  const mcp = new Server(
    { name: 'ordinus-whatsapp', version: '0.3.0' },
    { capabilities: { tools: {} } }
  )
  registerTools(mcp, store, sendText)
  await mcp.connect(new StdioServerTransport())

  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  if (!state.creds.registered) {
    // No session: connecting would be a fresh registration attempt. The
    // supervisor should never start service mode unpaired, but exit honestly
    // if it does.
    console.error('No paired WhatsApp session in auth dir — run login first.')
    process.exit(EXIT_LOGGED_OUT)
  }

  // ADR-042 belt-and-braces: if the session belongs to a different account
  // than the store was built from, reset the store rather than mixing
  // histories. (Normal account switches go through Disconnect, which wipes
  // everything; this only catches hand-edited session dirs.)
  const owner = bareJid(state.creds.me?.id)
  if (owner) {
    const stored = store.getMeta.get('owner')?.value
    if (stored && stored !== owner) {
      console.error('Store belongs to a different account — resetting message store.')
      store.db.exec('DELETE FROM messages; DELETE FROM chats; DELETE FROM contacts;')
    }
    store.setMeta.run('owner', owner)
  }

  function connect() {
    const sock = makeWASocket({ auth: state, logger: silentLogger, printQRInTerminal: false })
    holder.sock = sock
    holder.open = false
    sock.ev.on('creds.update', saveCreds)

    // One-time history sync (WhatsApp pushes a slice of recent chats after
    // pairing) + live stream, both into the same store.
    sock.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
      // One transaction: a history slice can carry thousands of rows, and
      // per-row autocommit means one fsync each.
      store.db.exec('BEGIN')
      try {
        for (const contact of contacts ?? []) {
          if (contact.id) {
            store.upsertContact.run(contact.id, contact.name ?? contact.notify ?? null)
          }
        }
        for (const chat of chats ?? []) {
          if (chat.id && chat.id !== 'status@broadcast') {
            store.upsertChat.run(
              chat.id,
              chat.name ?? null,
              Number(chat.conversationTimestamp ?? 0)
            )
          }
        }
        for (const m of messages ?? []) {
          ingestMessage(store, m)
        }
        store.db.exec('COMMIT')
      } catch (err) {
        store.db.exec('ROLLBACK')
        console.error(`History sync ingestion failed: ${err.message}`)
      }
    })
    sock.ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts ?? []) {
        if (contact.id) {
          store.upsertContact.run(contact.id, contact.name ?? contact.notify ?? null)
        }
      }
    })
    sock.ev.on('messages.upsert', ({ messages }) => {
      for (const m of messages ?? []) {
        ingestMessage(store, m)
      }
    })

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        holder.open = true
        return
      }
      if (connection !== 'close') {
        return
      }
      holder.open = false
      const status = lastDisconnect?.error?.output?.statusCode
      if (status === DisconnectReason.loggedOut) {
        // Session revoked (expiry or unlinked from the phone). Marker tells
        // the supervisor this is "Reconnect required", not a crash. Data
        // stays — deletion is Disconnect's job (ADR-042).
        writeFileSync(join(authDir, LOGGED_OUT_MARKER), String(Date.now()))
        process.exit(EXIT_LOGGED_OUT)
      }
      console.error(`WhatsApp connection closed (status ${status ?? 'unknown'}), reconnecting…`)
      // Backoff: an immediate retry turns an offline machine into a tight
      // reconnect loop (CPU churn + stderr spam). MCP stays responsive while
      // we wait; reads serve from the local store regardless.
      setTimeout(connect, 5000)
    })
  }

  connect()
}
