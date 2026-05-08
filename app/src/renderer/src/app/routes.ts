import { LayoutDashboard, Settings } from 'lucide-react'

export const appRoutePaths = {
  workspace: '/workspace',
  settings: '/settings'
} as const

export type AppRouteId = keyof typeof appRoutePaths

export const defaultAppRoute = appRoutePaths.workspace

export const appNavigation = [
  {
    id: 'workspace',
    label: 'Workspace',
    path: appRoutePaths.workspace,
    icon: LayoutDashboard
  },
  {
    id: 'settings',
    label: 'Settings',
    path: appRoutePaths.settings,
    icon: Settings
  }
] satisfies Array<{
  id: AppRouteId
  label: string
  path: (typeof appRoutePaths)[AppRouteId]
  icon: typeof LayoutDashboard
}>
