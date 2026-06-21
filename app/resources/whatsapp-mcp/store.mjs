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
    getAlias: db.prepare('SELECT alt FROM aliases WHERE jid = ?'),
    getContactName: db.prepare('SELECT name FROM contacts WHERE jid = ?'),
    getChatName: db.prepare('SELECT name FROM chats WHERE jid = ?'),
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

/**
 * Link a person's two jid forms — phone (@s.whatsapp.net) and WhatsApp's
 * privacy-preserving LID (@lid) — so a name saved under one form resolves for
 * a chat addressed by the other. Records the mapping both ways and copies any
 * already-known name across the link, keeping the plain exact-jid name joins in
 * tools.mjs working without a runtime traversal.
 */
export function linkIdentity(store, a, b) {
  const ba = bareJid(a)
  const bb = bareJid(b)
  if (!ba || !bb || ba === bb) {
    return
  }
  store.upsertAlias.run(ba, bb)
  store.upsertAlias.run(bb, ba)
  const na = store.getContactName.get(ba)?.name
  const nb = store.getContactName.get(bb)?.name
  if (na && !nb) {
    store.upsertContact.run(bb, na)
  } else if (nb && !na) {
    store.upsertContact.run(ba, nb)
  }
}

/**
 * Record a contact's display name, propagating it to the linked jid form (if
 * one is known) so the name is visible whichever form a chat is addressed by.
 * No-op when the name is empty so a missing pushName never wipes a known name.
 */
export function setContactName(store, jid, name) {
  const bj = bareJid(jid)
  if (!bj || !name) {
    return
  }
  store.upsertContact.run(bj, name)
  const alt = store.getAlias.get(bj)?.alt
  if (alt) {
    store.upsertContact.run(alt, name)
  }
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

  // Baileys v7 carries the alternate (phone <-> LID) form of both the chat and
  // the group sender on the message key. Linking them keeps name resolution
  // working whichever form a chat or contact happens to be addressed by, and
  // makes phone-number search work for LID chats.
  linkIdentity(store, m.key.remoteJid, m.key.remoteJidAlt)
  linkIdentity(store, m.key.participant, m.key.participantAlt)

  // pushName is the SENDER's display name — it names the chat only for direct
  // chats (group subjects arrive via the groups.* events / groupFetchAllParticipating).
  // Direct chats come either as phone-number jids (@s.whatsapp.net) or as
  // WhatsApp's newer privacy-preserving LID addressing (@lid).
  const isDirect = chatJid.endsWith('@s.whatsapp.net') || chatJid.endsWith('@lid')
  const senderName = isDirect && m.pushName && !m.key.fromMe ? m.pushName : null
  store.upsertChat.run(chatJid, senderName, ts)
  if (senderName) {
    setContactName(store, chatJid, senderName)
  }
}
