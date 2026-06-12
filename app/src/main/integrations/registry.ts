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
  atlassian: {
    id: 'atlassian',
    label: 'Atlassian',
    transport: 'mcp-http',
    authMethod: 'oauth',
    kind: 'remote',
    mcpUrl: 'https://mcp.atlassian.com/v1/mcp/authv2'
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
