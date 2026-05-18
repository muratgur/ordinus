import type { ConnectorSummary } from '@shared/contracts'
import { listConnectorManifests } from './registry'
import { authorizeConnector } from './oauth-broker'
import { deleteCredential, hasCredential } from './vault'

export function listConnectors(): ConnectorSummary[] {
  return listConnectorManifests().map((manifest) => ({
    id: manifest.id,
    label: manifest.label,
    transport: manifest.transport,
    authMethod: manifest.authMethod,
    connected: hasCredential(manifest.id)
  }))
}

export async function connectConnector(connectorId: string): Promise<ConnectorSummary[]> {
  await authorizeConnector(connectorId)
  return listConnectors()
}

export function disconnectConnector(connectorId: string): ConnectorSummary[] {
  deleteCredential(connectorId)
  return listConnectors()
}
