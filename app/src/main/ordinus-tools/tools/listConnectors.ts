// ADR-048 §7 — `list_connectors` lazy detail read tool.
//
// Detail behind get_app_status's connections summary: the outside tools the user
// can link to agents, with their connected state and health. Use when the user
// asks specifically about a connection or you need more than the id list that
// get_app_status returns. No credentials or secrets are ever exposed.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'
import { listConnectors as listConnectorsService } from '../../integrations/service'

const InputSchema = z.object({})

const ConnectorSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  connected: z.boolean(),
  kind: z.string(),
  health: z.string()
})

const OutputSchema = z.object({
  connectors: z.array(ConnectorSummarySchema)
})

export const listConnectors = defineOrdinusTool({
  manifest: {
    name: 'list_connectors',
    description:
      'List the outside tools (connections) the user can link to their agents — e.g. ' +
      'email, calendar, messaging, trackers — with whether each is currently connected ' +
      'and its health. Use when the user asks about a specific connection or you need ' +
      'detail beyond the id list in get_app_status. Connecting a tool happens on the ' +
      'Connections surface and requires the user to sign in — you guide, they authenticate.',
    capability: 'read'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: () => {
    const connectors = listConnectorsService()
    return {
      connectors: connectors.map((c) => ({
        id: c.id,
        label: c.label,
        connected: c.connected,
        kind: c.kind,
        health: c.health
      }))
    }
  }
})
