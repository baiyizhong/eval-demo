import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type TraceDashboardFiltersProps = {
  timeRange: string
  environment: string
  onTimeRangeChange: (value: string) => void
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
      <Select value={timeRange} onValueChange={onTimeRangeChange}>
        <SelectTrigger className='h-9 w-[150px]'>
          <SelectValue placeholder='时间范围' />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value='24h'>最近 24 小时</SelectItem>
            <SelectItem value='7d'>最近 7 天</SelectItem>
            <SelectItem value='30d'>最近 30 天</SelectItem>
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
            <SelectItem value='production'>production</SelectItem>
            <SelectItem value='staging'>staging</SelectItem>
            <SelectItem value='testing'>testing</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
