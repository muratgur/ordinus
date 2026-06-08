import {
  Bot,
  CalendarClock,
  Columns3,
  MessageSquareText,
  Settings,
  Sparkles,
  Workflow
} from 'lucide-react'

export const appRoutePaths = {
  home: '/home',
  agents: '/agents',
  workboard: '/workboard',
  workflows: '/workflows',
  conversations: '/conversations',
  schedules: '/schedules',
  settings: '/settings'
} as const

export type AppRouteId = keyof typeof appRoutePaths

// Default landing route. After the ADR-029 kill switch was retired (M8 ship),
// Home is the unconditional front door; Workboard stays a sibling nav entry.
export const defaultAppRoute = appRoutePaths.home

// ADR-029 M4: Home appears at the top of the nav when the Ordinus v1 flag is on.
// The shell filters this entry out when the flag is off (see app-shell.tsx) so
// nothing changes for users on the legacy default landing.
export const ordinusHomeNavItem = {
  id: 'home' as const,
  label: 'Home',
  path: appRoutePaths.home,
  icon: Sparkles
}

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
    id: 'workflows',
    label: 'Workflows',
    path: appRoutePaths.workflows,
    icon: Workflow
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
  icon: typeof Settings
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
  icon: typeof Settings
}>
