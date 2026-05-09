import { Bot, CalendarClock, House, MessageSquareText, Route, Settings } from 'lucide-react'

export const appRoutePaths = {
  home: '/home',
  agents: '/agents',
  planner: '/planner',
  conversations: '/conversations',
  schedules: '/schedules',
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
    id: 'agents',
    label: 'Agents',
    path: appRoutePaths.agents,
    icon: Bot
  },
  {
    id: 'planner',
    label: 'Planner',
    path: appRoutePaths.planner,
    icon: Route
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
