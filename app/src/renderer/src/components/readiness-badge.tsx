import { CheckCircle2, CircleDashed } from 'lucide-react'
import { Badge } from './ui/badge'

type ReadinessBadgeProps = {
  ready: boolean
  readyText: string
  pendingText?: string
}

export function ReadinessBadge({
  ready,
  readyText,
  pendingText = 'Not configured'
}: ReadinessBadgeProps): React.JSX.Element {
  return ready ? (
    <Badge variant="completed">
      <CheckCircle2 className="mr-1 size-3" />
      {readyText}
    </Badge>
  ) : (
    <Badge variant="outline">
      <CircleDashed className="mr-1 size-3" />
      {pendingText}
    </Badge>
  )
}
