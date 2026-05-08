export const ipcChannels = {
  appGetInfo: 'app:get-info',
  systemGetPaths: 'system:get-paths',
  dbGetStatus: 'db:get-status',
  setupGetStatus: 'setup:get-status',
  workspaceSelectFolder: 'workspace:select-folder',
  workspaceSaveConfig: 'workspace:save-config',
  agentsList: 'agents:list',
  agentsDraftFromIntent: 'agents:draft-from-intent',
  agentsCreate: 'agents:create',
  agentsUpdateInstructions: 'agents:update-instructions',
  agentsUpdateSettings: 'agents:update-settings',
  agentsListSkills: 'agents:list-skills',
  agentsCreateSkill: 'agents:create-skill',
  runtimeGetProviders: 'runtime:get-providers',
  runtimeConnectProvider: 'runtime:connect-provider',
  runtimeRefreshProvider: 'runtime:refresh-provider'
} as const
