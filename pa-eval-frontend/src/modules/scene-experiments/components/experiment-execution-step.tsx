import { ServerCog } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import type {
  SceneRecord,
  SceneRunParameters,
  SceneWebhookService,
} from '../types'
import { ExperimentSelectableCard } from './experiment-selectable-card'

type ExperimentWebhookStepProps = {
  scene: SceneRecord
  selectedWebhookIds: string[]
  onWebhookIdsChange: (ids: string[]) => void
  onViewWebhook: (webhook: SceneWebhookService) => void
}

export function ExperimentWebhookStep({
  scene,
  selectedWebhookIds,
  onWebhookIdsChange,
  onViewWebhook,
}: ExperimentWebhookStepProps) {
  return (
    <SelectionGrid
      title='选择远程运行服务'
      description='默认不选择，每个选中服务会触发一次外部实验运行并生成一份独立报告。'
    >
      {scene.webhooks.length ? (
        scene.webhooks.map((webhook) => (
          <ExperimentSelectableCard
            key={webhook.id}
            checked={selectedWebhookIds.includes(webhook.id)}
            title={webhook.name}
            description={`${webhook.serviceFamily} · v${webhook.version}`}
            meta={webhook.url}
            onCheckedChange={(checked) =>
              onWebhookIdsChange(
                checked
                  ? [...selectedWebhookIds, webhook.id]
                  : selectedWebhookIds.filter((id) => id !== webhook.id)
              )
            }
            onView={() => onViewWebhook(webhook)}
          />
        ))
      ) : (
        <Alert>
          <ServerCog />
          <AlertTitle>当前场景暂无远程运行服务</AlertTitle>
          <AlertDescription>
            请先在场景管理中配置至少一个远程运行服务。
          </AlertDescription>
        </Alert>
      )}
    </SelectionGrid>
  )
}

export function ExperimentRunParametersStep({
  runParameters,
  onRunParametersChange,
}: {
  runParameters: SceneRunParameters
  onRunParametersChange: (parameters: SceneRunParameters) => void
}) {
  return (
    <section className='flex flex-col gap-4 rounded-lg border p-5'>
      <div>
        <h3 className='text-sm font-semibold'>运行参数</h3>
        <p className='text-muted-foreground mt-1 text-xs'>
          已从场景默认配置带出，可仅覆盖本次试验。
        </p>
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        <NumberField
          label='并发数'
          value={runParameters.concurrency}
          min={1}
          max={50}
          suffix='个并发'
          onChange={(concurrency) =>
            onRunParametersChange({ ...runParameters, concurrency })
          }
        />
        <NumberField
          label='超时时间'
          value={runParameters.timeoutSeconds}
          min={1}
          max={600}
          suffix='秒'
          onChange={(timeoutSeconds) =>
            onRunParametersChange({ ...runParameters, timeoutSeconds })
          }
        />
        <NumberField
          label='重试次数'
          value={runParameters.retryCount}
          min={0}
          max={10}
          suffix='次'
          onChange={(retryCount) =>
            onRunParametersChange({ ...runParameters, retryCount })
          }
        />
        <NumberField
          label='执行轮次'
          value={runParameters.rounds}
          min={1}
          max={20}
          suffix='轮'
          onChange={(rounds) =>
            onRunParametersChange({ ...runParameters, rounds })
          }
        />
      </div>
    </section>
  )
}

function SelectionGrid({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className='flex min-w-0 flex-col gap-4'>
      <div>
        <h3 className='text-sm font-semibold'>{title}</h3>
        <p className='text-muted-foreground mt-1 text-xs'>{description}</p>
      </div>
      <div className='grid gap-3'>{children}</div>
    </section>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  suffix: string
  onChange: (value: number) => void
}) {
  const id = `experiment-${label}`

  return (
    <div className='flex flex-col gap-2'>
      <label className='text-sm font-medium' htmlFor={id}>
        {label}
      </label>
      <div className='flex items-center gap-2'>
        <Input
          id={id}
          type='number'
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className='text-muted-foreground w-16 shrink-0 text-sm'>
          {suffix}
        </span>
      </div>
      <p className='text-muted-foreground text-xs'>
        允许范围 {min} - {max}
      </p>
    </div>
  )
}
