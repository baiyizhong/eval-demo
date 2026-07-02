import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Page } from '@/components/common/page'
import { TasksPageHeader } from '../components/tasks-page-header'

const evaluationSteps = [
  '选择待评测数据集并确认样本范围。',
  '配置评测模型、评分维度和通过阈值。',
  '提交自动评测任务并等待报告生成。',
]

export function TasksAutoEvaluation() {
  return (
    <Page>
      <div className='flex flex-col gap-4'>
        <TasksPageHeader showActions={false} />

        <section className='flex max-w-4xl flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <h1 className='text-2xl font-semibold tracking-tight'>
                自动评测
              </h1>
              <Badge variant='secondary'>说明页</Badge>
            </div>
            <p className='text-muted-foreground text-sm leading-6'>
              自动评测用于按预设维度批量评估模型回答质量，后续可在此接入任务配置、执行进度和结果报告。
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>页面说明</CardTitle>
              <CardDescription>
                当前页面先提供自动评测能力入口说明，便于验证子路由和导航跳转。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className='flex flex-col gap-3 text-sm'>
                {evaluationSteps.map((step, index) => (
                  <li key={step} className='flex gap-3'>
                    <span className='bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium'>
                      {index + 1}
                    </span>
                    <span className='leading-6'>{step}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>
      </div>
    </Page>
  )
}
