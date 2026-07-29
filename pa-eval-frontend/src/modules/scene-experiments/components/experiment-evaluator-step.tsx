import { useMemo, useState } from 'react'
import type { TaskEvaluatorRecord } from '@/modules/tasks/api/evaluator-api'
import { Search, ServerCog } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Loading } from '@/components/common/loading'
import { filterEvaluatorsByName } from '../lib/project-evaluators'

type ExperimentEvaluatorStepProps = {
  evaluators: TaskEvaluatorRecord[]
  selectedEvaluatorIds: string[]
  loading?: boolean
  error?: boolean
  onSelectionChange: (evaluatorIds: string[]) => void
}

export function ExperimentEvaluatorStep({
  evaluators,
  selectedEvaluatorIds,
  loading = false,
  error = false,
  onSelectionChange,
}: ExperimentEvaluatorStepProps) {
  const [keyword, setKeyword] = useState('')
  const filteredEvaluators = useMemo(
    () => filterEvaluatorsByName(evaluators, keyword),
    [evaluators, keyword]
  )

  const toggleEvaluator = (evaluatorId: string, checked: boolean) => {
    const nextIds = checked
      ? Array.from(new Set([...selectedEvaluatorIds, evaluatorId]))
      : selectedEvaluatorIds.filter((id) => id !== evaluatorId)
    onSelectionChange(nextIds)
  }

  return (
    <section className='flex min-w-0 flex-col gap-4'>
      <div>
        <h3 className='font-semibold'>选择评估器</h3>
        <p className='text-muted-foreground mt-1 text-sm'>
          作为场景默认评分配置，运行试验时仍可增删。
        </p>
      </div>

      <div className='relative max-w-md'>
        <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2' />
        <Input
          value={keyword}
          placeholder='搜索评估器名称'
          className='pl-9'
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      {loading ? (
        <Loading text='加载评估器中...' className='min-h-40' />
      ) : error ? (
        <Alert variant='destructive'>
          <ServerCog />
          <AlertTitle>评估器加载失败</AlertTitle>
          <AlertDescription>请稍后重试或重新打开场景配置。</AlertDescription>
        </Alert>
      ) : evaluators.length === 0 ? (
        <Alert>
          <ServerCog />
          <AlertTitle>当前项目暂无有效评估器</AlertTitle>
          <AlertDescription>
            请先创建并启用评估器，再配置可运行的场景。
          </AlertDescription>
        </Alert>
      ) : filteredEvaluators.length === 0 ? (
        <div className='text-muted-foreground flex min-h-28 items-center justify-center rounded-md border border-dashed text-sm'>
          未找到匹配的有效评估器
        </div>
      ) : (
        <div className='overflow-hidden rounded-md border'>
          <div className='bg-muted/40 text-muted-foreground grid grid-cols-[2.5rem_minmax(12rem,1fr)_8rem_minmax(12rem,1fr)] items-center border-b px-3 py-2 text-xs font-medium max-md:hidden'>
            <span>选择</span>
            <span>评估器名称</span>
            <span>类型 / 版本</span>
            <span>输出变量</span>
          </div>
          <div className='divide-y'>
            {filteredEvaluators.map((evaluator) => {
              const checked = selectedEvaluatorIds.includes(evaluator.id)
              const outputVariables = evaluator.outputVariables ?? []
              return (
                <label
                  key={evaluator.id}
                  className='hover:bg-muted/30 grid cursor-pointer grid-cols-[2.5rem_minmax(12rem,1fr)_8rem_minmax(12rem,1fr)] items-center px-3 py-3 max-md:grid-cols-[2rem_minmax(0,1fr)]'
                >
                  <Checkbox
                    checked={checked}
                    aria-label={`选择评估器 ${evaluator.name}`}
                    onCheckedChange={(value) =>
                      toggleEvaluator(evaluator.id, value === true)
                    }
                  />
                  <span className='min-w-0 pr-3'>
                    <span className='block truncate text-sm font-medium'>
                      {evaluator.name}
                    </span>
                    <span className='text-muted-foreground mt-1 hidden truncate text-xs max-md:block'>
                      {evaluator.type} · v{evaluator.version}
                    </span>
                    <span className='text-muted-foreground mt-1 hidden truncate text-xs max-md:block'>
                      {outputVariables.join('、') || '暂无输出变量'}
                    </span>
                  </span>
                  <span className='text-muted-foreground truncate text-xs max-md:hidden'>
                    {evaluator.type} · v{evaluator.version}
                  </span>
                  <span className='text-muted-foreground truncate text-xs max-md:hidden'>
                    {outputVariables.join('、') || '暂无输出变量'}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
