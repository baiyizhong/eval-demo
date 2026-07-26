import { Button } from '@/components/ui/button'

type Summary = {
  total: number
  running: number
  completed: number
  failed: number
  notStarted: number
  badcase: number
}

export type AutoEvaluationSummaryFilter =
  'all' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'NOT_STARTED' | 'HAS_BADCASE'

const items: {
  id: AutoEvaluationSummaryFilter
  label: string
  key: keyof Summary
}[] = [
  { id: 'all', label: '全部', key: 'total' },
  { id: 'RUNNING', label: '运行中', key: 'running' },
  { id: 'COMPLETED', label: '已完成', key: 'completed' },
  { id: 'FAILED', label: '失败', key: 'failed' },
  { id: 'NOT_STARTED', label: '未运行', key: 'notStarted' },
  { id: 'HAS_BADCASE', label: 'Badcase', key: 'badcase' },
]

export function AutoEvaluationSummaryCards({
  summary,
  active,
  onChange,
}: {
  summary: Summary
  active: AutoEvaluationSummaryFilter
  onChange: (value: AutoEvaluationSummaryFilter) => void
}) {
  return (
    <section className='grid gap-3 md:grid-cols-3 xl:grid-cols-6'>
      {items.map((item) => (
        <Button
          key={item.id}
          type='button'
          variant={active === item.id ? 'default' : 'outline'}
          className='h-auto justify-start px-4 py-3'
          onClick={() => onChange(active === item.id ? 'all' : item.id)}
        >
          <span className='flex flex-col items-start gap-1'>
            <span className='text-xs'>{item.label}</span>
            <span className='text-lg font-semibold'>{summary[item.key]}</span>
          </span>
        </Button>
      ))}
    </section>
  )
}
