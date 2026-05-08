import type { AppInfo, DbStatus, SystemPaths } from '@shared/contracts'

export type OrdinusApi = {
  app: {
    getInfo: () => Promise<AppInfo>
  }
  system: {
    getPaths: () => Promise<SystemPaths>
  }
  db: {
    getStatus: () => Promise<DbStatus>
  }
}

declare global {
  interface Window {
    ordinus: OrdinusApi
  }
}
