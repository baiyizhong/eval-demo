import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getDatasetTags } from '../lib/dataset-tags'
import type { DatasetRecord } from '../types'

export function DatasetTagsBadges({
  dataset,
  maxVisible = 3,
  tooltip = true,
}: {
  dataset: DatasetRecord
  maxVisible?: number
  tooltip?: boolean
}) {
  const tags = getDatasetTags(dataset)
  const visibleTags = tags.slice(0, maxVisible)
  const hiddenCount = Math.max(tags.length - visibleTags.length, 0)

  if (tags.length === 0) {
    return <span className='text-muted-foreground text-xs'>-</span>
  }

  const content = (
    <div className='flex max-w-full min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden'>
      {visibleTags.map((tag) => (
        <Badge key={tag} variant='secondary' className='min-w-0'>
          <span className='max-w-24 truncate'>{tag}</span>
        </Badge>
      ))}
      {hiddenCount > 0 ? <Badge variant='outline'>+{hiddenCount}</Badge> : null}
    </div>
  )

  if (!tooltip) return content

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent
        side='top'
        align='start'
        className='max-w-[min(28rem,calc(100vw-2rem))] break-words'
      >
        {tags.join('、')}
      </TooltipContent>
    </Tooltip>
  )
}
