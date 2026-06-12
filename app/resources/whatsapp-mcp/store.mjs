// Message store (ADR-042): text-only, lives in the auth dir next to the
// session files so Disconnect wipes session and history together. Built on
// node:sqlite — the electron-node child runs Electron's bundled Node ≥22,
// so no native module (and no Electron-ABI rebuild) is needed.

import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function openStore(authDir) {
  const db = new DatabaseSync(join(authDir, 'store.db'))
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS contacts (
      jid TEXT PRIMARY KEY,
      name TEXT
    );
    -- LID privacy addressing: maps a chat's @lid jid to its phone-number
    -- alias when WhatsApp reveals it, so phone-number search still works.
    CREATE TABLE IF NOT EXISTS aliases (
      jid TEXT PRIMARY KEY,
      alt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      sender TEXT,
      ts INTEGER NOT NULL,
      text TEXT NOT NULL,
      from_me INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id, chat_jid)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages (chat_jid, ts);
  `)
  return {
    db,
    getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
    setMeta: db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)'),
    upsertChat: db.prepare(`
      INSERT INTO chats (jid, name, last_message_at) VALUES (?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = COALESCE(excluded.name, chats.name),
        last_message_at = MAX(COALESCE(chats.last_message_at, 0), COALESCE(excluded.last_message_at, 0))
    `),
    upsertContact: db.prepare(`
      INSERT INTO contacts (jid, name) VALUES (?, ?)
      ON CONFLICT(jid) DO UPDATE SET name = COALESCE(excluded.name, contacts.name)
    `),
    upsertAlias: db.prepare('INSERT OR REPLACE INTO aliases (jid, alt) VALUES (?, ?)'),
    insertMessage: db.prepare(`
      INSERT OR IGNORE INTO messages (id, chat_jid, sender, ts, text, from_me)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
  }
}

/** Normalize a jid to its bare account form (strip the device suffix). */
export function bareJid(jid) {
  return typeof jid === 'string' ? jid.replace(/:\d+(?=@)/, '') : null
}

/** Unwrap ephemeral / view-once containers down to the real message body. */
function unwrap(message) {
  let body = message
  for (let depth = 0; body && depth < 4; depth++) {
    const inner =
      body.ephemeralMessage?.message ??
      body.viewOnceMessage?.message ??
      body.viewOnceMessageV2?.message ??
      body.documentWithCaptionMessage?.message
    if (!inner) {
      return body
    }
    body = inner
  }
  return body
}

/**
 * Text-only store (ADR-042): media is never downloaded; non-text content is
 * recorded as a typed placeholder, keeping captions where they exist.
 */
export function extractText(message) {
  const body = unwrap(message)
  if (!body) {
    return null
  }
  if (body.conversation) {
    return body.conversation
  }
  if (body.extendedTextMessage?.text) {
    return body.extendedTextMessage.text
  }
  const media = [
    ['imageMessage', '[image]'],
    ['videoMessage', '[video]'],
    ['audioMessage', '[audio]'],
    ['documentMessage', '[document]'],
    ['stickerMessage', '[sticker]'],
    ['locationMessage', '[location]'],
    ['liveLocationMessage', '[live location]'],
    ['contactMessage', '[contact card]'],
    ['pollCreationMessage', '[poll]']
  ]
  for (const [key, placeholder] of media) {
    if (body[key]) {
      const caption = body[key].caption
      return caption ? `${placeholder} ${caption}` : placeholder
    }
  }
  return null
}

export function ingestMessage(store, m) {
  const chatJid = m.key?.remoteJid
  // status@broadcast is WhatsApp's story feed, not a conversation.
  if (!chatJid || chatJid === 'status@broadcast') {
    return
  }
  const text = extractText(m.message)
  if (!text || !m.key.id) {
    return
  }
  const ts = Number(m.messageTimestamp ?? 0)
  const sender = m.key.fromMe ? null : bareJid(m.key.participant ?? chatJid)
  store.insertMessage.run(m.key.id, chatJid, sender, ts, text, m.key.fromMe ? 1 : 0)
  // pushName is the SENDER's display name — it names the chat only for direct
  // chats (group subjects arrive via the history sync's chat records).
  // Direct chats come either as phone-number jids (@s.whatsapp.net) or as
  // WhatsApp's newer privacy-preserving LID addressing (@lid).
  const isDirect = chatJid.endsWith('@s.whatsapp.net') || chatJid.endsWith('@lid')
  const senderName = isDirect && m.pushName && !m.key.fromMe ? m.pushName : null
  store.upsertChat.run(chatJid, senderName, ts)
  if (senderName) {
    store.upsertContact.run(bareJid(chatJid), senderName)
  }
  // Baileys v7 sometimes carries the phone-number alias of a LID address
  // (remoteJidAlt for the chat, participantAlt for a group sender). Recording
  // the chat-level alias makes phone-number search work for LID chats too.
  const chatAlt = bareJid(m.key.remoteJidAlt)
  if (isDirect && chatAlt && chatAlt !== chatJid) {
    store.upsertAlias.run(chatJid, chatAlt)
    if (senderName) {
      store.upsertContact.run(chatAlt, senderName)
    }
  }
}
