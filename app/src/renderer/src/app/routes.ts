import { House, Settings } from 'lucide-react'

export const appRoutePaths = {
  home: '/home',
  settings: '/settings'
} as const

export type AppRouteId = keyof typeof appRoutePaths

export const defaultAppRoute = appRoutePaths.home

export const appNavigation = [
  {
    id: 'home',
    label: 'Home',
    path: appRoutePaths.home,
    icon: House
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
  icon: typeof House
}>
