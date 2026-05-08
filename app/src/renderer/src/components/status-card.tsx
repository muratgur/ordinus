import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { DetailRow } from './detail-row'

type StatusCardProps = {
  icon: ReactNode
  title: string
  description: string
  rows: Array<[string, string]>
}

export function StatusCard({ icon, title, description, rows }: StatusCardProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-primary [&_svg]:size-4">{icon}</span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          {rows.map(([label, value]) => (
            <DetailRow key={label} label={label} value={value} />
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
