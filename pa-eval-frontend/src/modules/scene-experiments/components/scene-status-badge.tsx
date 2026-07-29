import { Badge } from '@/components/ui/badge'

export function SceneStatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant={enabled ? 'default' : 'secondary'}>
      {enabled ? '可用' : '停用'}
    </Badge>
  )
}
