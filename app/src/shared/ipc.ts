export const ipcChannels = {
  appGetInfo: 'app:get-info',
  systemGetPaths: 'system:get-paths',
  dbGetStatus: 'db:get-status',
  setupGetStatus: 'setup:get-status',
  workspaceSelectFolder: 'workspace:select-folder',
  workspaceSaveConfig: 'workspace:save-config',
  runtimeGetProviders: 'runtime:get-providers',
  runtimeConnectCodex: 'runtime:connect-codex',
  runtimeRefreshCodex: 'runtime:refresh-codex'
} as const
