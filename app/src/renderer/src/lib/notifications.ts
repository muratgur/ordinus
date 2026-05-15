import { toast, type ExternalToast } from 'sonner'

type NotificationAction = {
  label: string
  onClick: () => void
}

type NotificationInput = {
  id?: string
  title: string
  description?: string
  action?: NotificationAction
  duration?: number
}

export const notificationIds = {
  workboardPlanReady: 'workboard-plan-ready',
  workboardInputNeeded: 'workboard-input-needed',
  workboardRequestCompleted: 'workboard-request-completed',
  workboardRequestAttention: 'workboard-request-attention'
} as const

export const notify = {
  info(input: NotificationInput): string | number {
    return toast.info(input.title, buildToastOptions(input))
  },
  success(input: NotificationInput): string | number {
    return toast.success(input.title, buildToastOptions(input))
  },
  attention(input: NotificationInput): string | number {
    return toast.warning(input.title, buildToastOptions(input))
  },
  error(input: NotificationInput): string | number {
    return toast.error(input.title, buildToastOptions(input))
  },
  dismiss(id: string): void {
    toast.dismiss(id)
  }
}

function buildToastOptions(input: NotificationInput): ExternalToast {
  return {
    id: input.id,
    description: input.description,
    duration: input.duration,
    action: input.action
      ? {
          label: input.action.label,
          onClick: input.action.onClick
        }
      : undefined
  }
}
