// ADR-048 §7 — `get_app_status` read tool (Ordinus's live self-knowledge).
//
// A compact situational-awareness digest Ordinus reads at call time. This is the
// "live layer": anything volatile (which providers are connected, which outside
// tools are linked, how many agents exist, what needs attention) is read here,
// never written into the static knowledge pack where it would go stale.
//
// Counts and key statuses only — NOT detail. Names/emails/tool lists come from
// the lazy detail tools (list_connectors, list_schedules) or run_sql_readonly.
// Keep this lean: it can be called repeatedly within a conversation to refresh
// after the user changes something (connects a tool, creates an agent).

import { z } from 'zod'
import { defineOrdinusTool } from '../types'
import { listConnectors } from '../../integrations/service'
import { listLibrarySkills } from '../../skills/library'

const InputSchema = z.object({})

const OutputSchema = z.object({
  onboarding: z.object({
    completed: z.boolean(),
    stage: z.string()
  }),
  providers: z.array(
    z.object({
      id: z.string(),
      installed: z.boolean(),
      connected: z.boolean()
    })
  ),
  connections: z.object({
    connected: z.array(z.string()),
    available: z.array(z.string())
  }),
  agents: z.object({
    count: z.number().int().nonnegative(),
    enabled: z.number().int().nonnegative()
  }),
  attention: z.object({
    runningCount: z.number().int().nonnegative(),
    waitingForUserCount: z.number().int().nonnegative(),
    recentFailures: z.number().int().nonnegative()
  }),
  schedules: z.object({
    count: z.number().int().nonnegative(),
    active: z.number().int().nonnegative()
  }),
  workflows: z.object({ count: z.number().int().nonnegative() }),
  skills: z.object({ libraryCount: z.number().int().nonnegative() })
})

export const getAppStatus = defineOrdinusTool({
  manifest: {
    name: 'get_app_status',
    description:
      'Read a compact, LIVE snapshot of the application state: onboarding status, which ' +
      'providers are installed/connected, which outside tools (connections) are connected ' +
      'vs available to connect, how many agents exist, anything needing attention (runs ' +
      'in progress / waiting for the user / recently failed), and counts of schedules, ' +
      'workflows, and library skills. Call this before asserting anything about connection ' +
      'or provider state, and again after you direct the user to connect or create ' +
      'something (state changes mid-conversation). Returns counts and statuses only — use ' +
      'list_agents / list_connectors / list_schedules for detail.',
    capability: 'read'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async (_input, ctx) => {
    const onboarding = ctx.database.getOnboardingStatus()
    const providerStatuses = await ctx.runtime.getProviderStatuses()
    const connectors = listConnectors()
    const agents = ctx.database.listAgents()
    const schedules = ctx.database.listAgentSchedules()
    const workflows = ctx.database.listWorkflowDesigns()
    const skills = listLibrarySkills()

    // Attention is derived from active (non-archived) work requests. This is the
    // one legitimate source of steady-state proactivity (ADR-048 §1).
    const activeRequests = ctx.database.listWorkRequests().filter((r) => r.archivedAt === null)

    return {
      onboarding: {
        completed: onboarding.onboardedAt !== null,
        stage: onboarding.state.stage
      },
      providers: providerStatuses.map((p) => ({
        id: p.id,
        installed: p.installed,
        connected: p.connected
      })),
      connections: {
        connected: connectors.filter((c) => c.connected).map((c) => c.id),
        available: connectors.filter((c) => !c.connected).map((c) => c.id)
      },
      agents: {
        count: agents.length,
        enabled: agents.filter((a) => a.enabled).length
      },
      attention: {
        runningCount: activeRequests.filter((r) => r.status === 'running').length,
        waitingForUserCount: activeRequests.filter((r) => r.status === 'waiting_for_user').length,
        recentFailures: activeRequests.filter((r) => r.status === 'failed').length
      },
      schedules: {
        count: schedules.length,
        active: schedules.filter((s) => s.enabled).length
      },
      workflows: { count: workflows.length },
      skills: { libraryCount: skills.length }
    }
  }
})
