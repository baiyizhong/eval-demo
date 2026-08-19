import { AlertTriangle, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  lifecycleStages,
  type BadcaseDatasetCandidate,
  type BadcaseStage,
} from '../../lib/badcase-workbench-prototype'

type BadcaseLifecycleTrackProps = {
  dataset: BadcaseDatasetCandidate
  activeStage: BadcaseStage | 'all'
  onStageChange: (stage: BadcaseStage | 'all') => void
  onSwitchDataset: () => void
}

export function BadcaseLifecycleTrack({
  dataset,
  activeStage,
  onStageChange,
  onSwitchDataset,
}: BadcaseLifecycleTrackProps) {
  const cards = [
    {
      value: 'all' as const,
      label: '全部',
      count: dataset.totalCount,
      overdue: dataset.overdueCount,
    },
    ...lifecycleStages.map((stage) => ({
      value: stage.value,
      label: stage.label,
      count: dataset.stageCounts[stage.value],
      overdue: stage.value === 'FIXING' ? dataset.overdueCount : 0,
    })),
  ]

  return (
    <section className='bg-card shrink-0 border-b'>
      <div className='flex items-center justify-between gap-3 border-b px-4 py-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='truncate font-semibold'>{dataset.name}</span>
          <Badge variant='outline'>badcase</Badge>
          {dataset.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant='secondary'>
              {tag}
            </Badge>
          ))}
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <Button variant='outline' size='sm' onClick={onSwitchDataset}>
            <Database data-icon='inline-start' />
            切换数据集
          </Button>
        </div>
      </div>

      <div className='overflow-x-auto p-3'>
        <div className='grid min-w-[980px] grid-cols-7 gap-2'>
          {cards.map((card) => {
            const active = activeStage === card.value

            return (
              <button
                key={card.value}
                type='button'
                aria-pressed={active}
                className={cn(
                  'bg-background hover:border-primary/45 hover:bg-accent/40 focus-visible:ring-ring/50 min-w-0 rounded-md border px-3 py-2.5 text-left transition focus-visible:ring-2 focus-visible:outline-none',
                  active && 'border-primary bg-primary/8'
                )}
                onClick={() => onStageChange(card.value)}
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='truncate text-sm font-medium'>
                    {card.label}
                  </span>
                  <span className='font-mono text-lg font-semibold tabular-nums'>
                    {card.count}
                  </span>
                </div>
                {card.overdue > 0 ? (
                  <div className='text-destructive mt-1 flex items-center gap-1 text-xs'>
                    <AlertTriangle className='size-3' />
                    {card.overdue} 条逾期
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
