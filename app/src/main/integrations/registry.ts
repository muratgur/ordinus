import type { ConnectorManifest } from './types'

const MANIFESTS: Record<string, ConnectorManifest> = {
  datadog: {
    id: 'datadog',
    label: 'Datadog',
    transport: 'mcp-http',
    authMethod: 'oauth',
    mcpUrl: 'https://mcp.datadoghq.com/api/unstable/mcp-server/mcp'
  },
  linear: {
    id: 'linear',
    label: 'Linear',
    transport: 'mcp-http',
    authMethod: 'oauth',
    mcpUrl: 'https://mcp.linear.app/mcp'
  },
  notion: {
    id: 'notion',
    label: 'Notion',
    transport: 'mcp-http',
    authMethod: 'oauth',
    mcpUrl: 'https://mcp.notion.com/mcp'
  },
  canva: {
    id: 'canva',
    label: 'Canva',
    transport: 'mcp-http',
    authMethod: 'oauth',
    mcpUrl: 'https://mcp.canva.com/mcp'
  },
  atlassian: {
    id: 'atlassian',
    label: 'Atlassian',
    transport: 'mcp-http',
    authMethod: 'oauth',
    mcpUrl: 'https://mcp.atlassian.com/v1/mcp/authv2'
  }
}

export function listConnectorManifests(): ConnectorManifest[] {
  return Object.values(MANIFESTS)
}

export function getConnectorManifest(id: string): ConnectorManifest {
  const manifest = MANIFESTS[id]
  if (!manifest) {
    throw new Error(`Unknown connector: ${id}`)
  }
  return manifest
}

export function hasConnectorManifest(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(MANIFESTS, id)
}
