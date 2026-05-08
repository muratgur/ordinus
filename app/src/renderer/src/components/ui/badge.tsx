import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none tracking-normal transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-surface-strong text-foreground',
        outline: 'border-border bg-card text-muted-foreground',
        planned: 'border-status-planned/20 bg-status-planned/10 text-status-planned',
        running: 'border-status-running/20 bg-status-running/10 text-status-running',
        reading: 'border-status-reading/20 bg-status-reading/10 text-status-reading',
        editing: 'border-status-editing/20 bg-status-editing/10 text-status-editing',
        blocked: 'border-status-blocked/20 bg-status-blocked/10 text-status-blocked',
        attention: 'border-status-attention/20 bg-status-attention/10 text-status-attention',
        completed: 'border-status-completed/20 bg-status-completed/10 text-status-completed',
        failed: 'border-status-failed/20 bg-status-failed/10 text-status-failed',
        success: 'border-status-completed/20 bg-status-completed/10 text-status-completed'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps): React.JSX.Element {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
