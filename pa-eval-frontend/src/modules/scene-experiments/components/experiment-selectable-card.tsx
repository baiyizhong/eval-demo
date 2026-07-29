import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

type ExperimentSelectableCardProps = {
  checked: boolean
  title: string
  description: string
  meta: string
  onCheckedChange: (checked: boolean) => void
  onView?: () => void
}

export function ExperimentSelectableCard({
  checked,
  title,
  description,
  meta,
  onCheckedChange,
  onView,
}: ExperimentSelectableCardProps) {
  const detailLabel = `查看 ${title} 详情`

  return (
    <div className='flex min-w-0 items-start gap-3 rounded-lg border p-4'>
      <Checkbox
        checked={checked}
        aria-label={`选择 ${title}`}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <button
        type='button'
        className='min-w-0 flex-1 text-left'
        onClick={() => onCheckedChange(!checked)}
      >
        <span className='block truncate font-medium'>{title}</span>
        <span className='text-muted-foreground mt-1 block text-xs'>
          {description}
        </span>
        <span className='text-muted-foreground mt-2 block truncate text-xs'>
          {meta}
        </span>
      </button>
      {onView ? (
        <Button
          type='button'
          size='icon'
          variant='ghost'
          aria-label={detailLabel}
          title={detailLabel}
          onClick={onView}
        >
          <Eye />
        </Button>
      ) : null}
    </div>
  )
}
