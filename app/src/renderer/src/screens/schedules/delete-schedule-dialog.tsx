import type { AgentSchedule } from '@shared/contracts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { cn } from '@renderer/lib/utils'

interface DeleteScheduleDialogProps {
  schedule: AgentSchedule | null
  busy?: boolean
  onClose: () => void
  onConfirm: (schedule: AgentSchedule) => void
}

export function DeleteScheduleDialog({
  schedule,
  busy,
  onClose,
  onConfirm
}: DeleteScheduleDialogProps): React.JSX.Element {
  return (
    <AlertDialog open={Boolean(schedule)} onOpenChange={(open) => (open ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
          <AlertDialogDescription>
            {schedule ? (
              <>
                <span className="font-medium text-foreground">{schedule.name}</span> will be
                removed. Past runs stay; future fires stop. This cannot be undone.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !schedule}
            onClick={() => schedule && onConfirm(schedule)}
            className={cn(
              'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/40'
            )}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
