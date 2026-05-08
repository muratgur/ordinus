const runtimeEnvAllowlist = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'WINDIR',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TMP',
  'TEMP'
] as const

export function buildRuntimeEnvironment(providerEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...providerEnv }

  for (const key of runtimeEnvAllowlist) {
    const value = process.env[key]
    if (value) {
      env[key] = value
    }
  }

  return env
}
