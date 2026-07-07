import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TRACE_QUICK_TIME_RANGE_OPTIONS,
  type TraceQuickTimeRange,
} from '../trace-time-ranges'

type TraceDashboardFiltersProps = {
  timeRange: TraceQuickTimeRange
  environment: string
  onTimeRangeChange: (value: TraceQuickTimeRange) => void
  onEnvironmentChange: (value: string) => void
}

export function TraceDashboardFilters({
  timeRange,
  environment,
  onTimeRangeChange,
  onEnvironmentChange,
}: TraceDashboardFiltersProps) {
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Select
        value={timeRange}
        onValueChange={(value) =>
          onTimeRangeChange(value as TraceQuickTimeRange)
        }
      >
        <SelectTrigger className='h-9 w-[150px]'>
          <SelectValue placeholder='时间范围' />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {TRACE_QUICK_TIME_RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={environment} onValueChange={onEnvironmentChange}>
        <SelectTrigger className='h-9 w-[150px]'>
          <SelectValue placeholder='环境' />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value='all'>全部环境</SelectItem>
            <SelectItem value='default'>default</SelectItem>
            <SelectItem value='production'>production</SelectItem>
            <SelectItem value='staging'>staging</SelectItem>
            <SelectItem value='testing'>testing</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
