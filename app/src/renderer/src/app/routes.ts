import { Bot, CalendarClock, Columns3, House, MessageSquareText, Settings } from 'lucide-react'

export const appRoutePaths = {
  home: '/home',
  agents: '/agents',
  workboard: '/workboard',
  conversations: '/conversations',
  schedules: '/schedules',
  settings: '/settings'
} as const

export type AppRouteId = keyof typeof appRoutePaths

export const defaultAppRoute = appRoutePaths.home

export const appNavigation = [
  {
    id: 'agents',
    label: 'Agents',
    path: appRoutePaths.agents,
    icon: Bot
  },
  {
    id: 'workboard',
    label: 'Workboard',
    path: appRoutePaths.workboard,
    icon: Columns3
  },
  {
    id: 'conversations',
    label: 'Conversations',
    path: appRoutePaths.conversations,
    icon: MessageSquareText
  },
  {
    id: 'schedules',
    label: 'Schedules',
    path: appRoutePaths.schedules,
    icon: CalendarClock
  }
] satisfies Array<{
  id: Exclude<AppRouteId, 'settings'>
  label: string
  path: (typeof appRoutePaths)[Exclude<AppRouteId, 'settings'>]
  icon: typeof House
}>

export const utilityNavigation = [
  {
    id: 'settings',
    label: 'Settings',
    path: appRoutePaths.settings,
    icon: Settings
  }
] satisfies Array<{
  id: Extract<AppRouteId, 'settings'>
  label: string
  path: (typeof appRoutePaths)[Extract<AppRouteId, 'settings'>]
  icon: typeof House
}>
