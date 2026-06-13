import { app } from 'electron'
import type { ConnectorManifest } from './types'

const MANIFESTS: Record<string, ConnectorManifest> = {
  datadog: {
    id: 'datadog',
    label: 'Datadog',
    transport: 'mcp-http',
    authMethod: 'oauth',
    kind: 'remote',
    mcpUrl: 'https://mcp.datadoghq.com/api/unstable/mcp-server/mcp'
  },
  linear: {
    id: 'linear',
    label: 'Linear',
    transport: 'mcp-http',
    authMethod: 'oauth',
    kind: 'remote',
    mcpUrl: 'https://mcp.linear.app/mcp'
  },
  notion: {
    id: 'notion',
    label: 'Notion',
    transport: 'mcp-http',
    authMethod: 'oauth',
    kind: 'remote',
    mcpUrl: 'https://mcp.notion.com/mcp'
  },
  canva: {
    id: 'canva',
    label: 'Canva',
    transport: 'mcp-http',
    authMethod: 'oauth',
    kind: 'remote',
    mcpUrl: 'https://mcp.canva.com/mcp'
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    transport: 'mcp-stdio',
    authMethod: 'none',
    kind: 'local',
    local: {
      runtime: 'uv',
      // Pinned (ADR-041): upgrades ride app releases after we test them.
      package: 'mcp-server-linkedin==4.15.0',
      sessionDirArgs: ['--user-data-dir', '${sessionDir}'],
      heavy: true,
      loginMode: 'interactive',
      // Read-only, outward-inert tools start enabled. send_message and
      // connect_with_person act outwardly as the user; inbox/conversation
      // tools read private correspondence — all born disabled, the user
      // opts in per tool from Settings → Connections.
      defaultEnabledTools: [
        'get_person_profile',
        'get_my_profile',
        'get_company_profile',
        'get_company_posts',
        'get_sidebar_profiles'
      ]
    }
  },
  whatsapp: {
    id: 'whatsapp',
    label: 'WhatsApp',
    transport: 'mcp-stdio',
    authMethod: 'none',
    kind: 'local',
    local: {
      // ADR-042: first Ordinus-authored MCP server — Baileys-based, lives in
      // the self-contained sub-package app/resources/whatsapp-mcp (its own
      // node_modules, never in the app bundle). Baileys pin rides the
      // sub-package's package.json; upgrades ship with app releases.
      runtime: 'electron-node',
      package: 'whatsapp-mcp/server.mjs',
      // Session credentials AND the message store live in the deletable
      // session dir: Disconnect wipes the WhatsApp session and all synced
      // message history together (ADR-042 trust story).
      sessionDirArgs: ['--auth-dir', '${sessionDir}'],
      // ADR-042: the server is also a live-message ingester — it runs for the
      // app's lifetime while connected instead of being idle-reaped (store
      // freshness; reconnect churn is itself an automation signal).
      lifecycle: 'persistent',
      loginMode: 'pairing',
      // Read tools are born enabled — the user explicitly linked their own
      // messages, and a WhatsApp connector that cannot read them is useless.
      // send_message acts outwardly as the user: born disabled (ADR-041 rule),
      // opt-in from Settings → Connections.
      defaultEnabledTools: ['search_contacts', 'list_chats', 'get_messages']
    }
  },
  atlassian: {
    id: 'atlassian',
    label: 'Atlassian',
    transport: 'mcp-http',
    authMethod: 'oauth',
    kind: 'remote',
    mcpUrl: 'https://mcp.atlassian.com/v1/mcp/authv2'
  },
  google: {
    id: 'google',
    label: 'Google',
    transport: 'mcp-stdio',
    // ADR-043: OAuth, but against the user's OWN ("bring your own") OAuth
    // client — no Ordinus-owned app, no verification, no CASA. Connect runs
    // the forked loopback/PKCE broker in the main process (loginMode below),
    // not the remote DCR path (authorizeConnector).
    authMethod: 'oauth',
    kind: 'local',
    // Least-privilege v1 set. Gmail read+send, Calendar event read/write,
    // Drive read. gmail.readonly + drive.readonly are restricted scopes — free
    // under the BYO/Testing model (the user is their own test user).
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/drive.readonly'
    ],
    byoOAuth: {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token'
    },
    local: {
      // Second Ordinus-authored MCP server (after WhatsApp): self-contained
      // sub-package app/resources/google-mcp, raw fetch to Google REST.
      runtime: 'electron-node',
      package: 'google-mcp/server.mjs',
      // The session dir holds the ADR-042-style `logged-out` marker the server
      // drops on an unrecoverable invalid_grant (Phase 2). OAuth tokens live in
      // the vault, not here.
      sessionDirArgs: ['--session-dir', '${sessionDir}'],
      // Request/response with no live ingestion → lazy start + idle reap
      // (ADR-041 default). `heavy` opts the server into the idle reaper.
      heavy: true,
      loginMode: 'byo-oauth',
      // Read tools born enabled; send_email/create_event act outwardly as the
      // user, so born disabled (ADR-041 rule) — opt in per tool from Settings.
      defaultEnabledTools: [
        'search_emails',
        'get_email',
        'list_events',
        'get_event',
        'search_files',
        'read_file'
      ]
    }
  }
}

// ADR-041: dev-only fixture connector. Exercises the whole local-connector
// pipeline (bootstrap → spawn → bridge → proxy → permissions → idle reaper)
// without any real third-party server, so the infrastructure stays testable
// while the catalog has no shipped local connector yet. Never present in
// packaged builds.
const DEV_FIXTURE_MANIFEST: ConnectorManifest = {
  id: 'dev-fixture',
  label: 'Dev Fixture (local MCP)',
  transport: 'mcp-stdio',
  authMethod: 'none',
  kind: 'local',
  local: {
    runtime: 'electron-node',
    package: 'dev-fixtures/echo-mcp-server.mjs',
    heavy: true,
    loginMode: 'none',
    // fake_send simulates an outward-acting tool: born disabled.
    defaultEnabledTools: ['echo_tool', 'add_numbers']
  }
}

function manifests(): Record<string, ConnectorManifest> {
  if (app.isPackaged) {
    return MANIFESTS
  }
  return { ...MANIFESTS, [DEV_FIXTURE_MANIFEST.id]: DEV_FIXTURE_MANIFEST }
}

export function listConnectorManifests(): ConnectorManifest[] {
  return Object.values(manifests())
}

export function getConnectorManifest(id: string): ConnectorManifest {
  const manifest = manifests()[id]
  if (!manifest) {
    throw new Error(`Unknown connector: ${id}`)
  }
  return manifest
}

export function hasConnectorManifest(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(manifests(), id)
}
