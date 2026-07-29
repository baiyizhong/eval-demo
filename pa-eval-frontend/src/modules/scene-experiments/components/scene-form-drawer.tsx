import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProjectDataset } from '@/modules/app-evaluation/api/dataset-api'
import { DatasetTypeBadge } from '@/modules/app-evaluation/components/dataset-type-badge'
import { Info, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Drawer } from '@/components/common/drawer'
import { Stepper } from '@/components/common/stepper'
import { buildProjectDatasetsHref } from '../lib/experiment-run'
import { listActiveProjectEvaluators } from '../lib/project-evaluators'
import type {
  SceneFormInput,
  SceneRecord,
  SceneWebhookService,
  WebhookAuthType,
} from '../types'
import { ExperimentDatasetStep } from './experiment-dataset-step'
import { ExperimentEvaluatorStep } from './experiment-evaluator-step'

const sceneSteps = [
  { id: 'basic', title: '基础信息', description: '名称与描述' },
  { id: 'dataset', title: '选择数据集', description: '默认试验数据' },
  { id: 'webhook', title: 'Webhook 服务配置', description: '服务与鉴权' },
  { id: 'evaluator', title: '选择评估器', description: '默认评分维度' },
  { id: 'parameters', title: '运行参数配置', description: '执行默认值' },
  { id: 'summary', title: '确认创建', description: '检查场景配置' },
]

const emptyWebhook = (): SceneWebhookService => ({
  id: `webhook_draft_${Date.now()}`,
  name: '',
  description: '',
  url: '',
  method: 'POST',
  authType: 'NONE',
  credential: '',
  maskedCredential: '',
  apiKeyHeader: 'X-API-Key',
  headers: {},
  serviceFamily: '',
  version: '1.0.0',
})

const defaultDraft = (): SceneFormInput => ({
  name: '',
  description: '',
  enabled: true,
  supportsScheduledExecution: false,
  defaultScheduledWebhookIds: [],
  datasetId: '',
  evaluatorIds: [],
  webhooks: [emptyWebhook()],
  runParameters: {
    concurrency: 5,
    timeoutSeconds: 30,
    retryCount: 2,
    rounds: 1,
  },
})

type SceneFormDrawerProps = {
  open: boolean
  projectId: string
  scene?: SceneRecord | null
  pending?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: SceneFormInput) => Promise<void>
}

export function SceneFormDrawer({ open, ...props }: SceneFormDrawerProps) {
  if (!open) return null
  return <SceneFormDrawerContent open {...props} />
}

function SceneFormDrawerContent({
  open,
  projectId,
  scene,
  pending = false,
  onOpenChange,
  onSubmit,
}: SceneFormDrawerProps) {
  const $api = useAPI()
  const navigate = useNavigate()
  const submittingRef = useRef(false)
  const pendingScheduledEvaluatorDefaultRef = useRef(false)
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<SceneFormInput>(() =>
    scene
      ? {
          name: scene.name,
          description: scene.description,
          enabled: scene.enabled,
          supportsScheduledExecution: scene.supportsScheduledExecution ?? false,
          defaultScheduledWebhookIds: [
            ...(scene.defaultScheduledWebhookIds ??
              (scene.defaultScheduledWebhookId
                ? [scene.defaultScheduledWebhookId]
                : [])),
          ],
          datasetId: scene.datasetId ?? '',
          evaluatorIds: [...(scene.evaluatorIds ?? [])],
          webhooks: structuredClone(scene.webhooks),
          runParameters: { ...scene.runParameters },
        }
      : defaultDraft()
  )
  const [selectedWebhookId, setSelectedWebhookId] = useState(
    draft.webhooks[0]?.id ?? ''
  )
  const selectedWebhook =
    draft.webhooks.find((item) => item.id === selectedWebhookId) ??
    draft.webhooks[0]
  const datasetQuery = useQuery({
    queryKey: ['scene-default-dataset', $api, projectId, draft.datasetId],
    queryFn: () => getProjectDataset($api, projectId, draft.datasetId),
    enabled: Boolean(draft.datasetId),
  })
  const evaluatorsQuery = useQuery({
    queryKey: ['scene-form-evaluators', $api, projectId],
    queryFn: () => listActiveProjectEvaluators($api, projectId),
    enabled: open,
  })
  const evaluators = useMemo(
    () => evaluatorsQuery.data ?? [],
    [evaluatorsQuery.data]
  )
  const activeEvaluatorIds = new Set(evaluators.map((item) => item.id))
  const validEvaluatorIds = draft.evaluatorIds.filter((id) =>
    activeEvaluatorIds.has(id)
  )
  const webhookIds = new Set(draft.webhooks.map((item) => item.id))
  const validScheduledWebhookIds = draft.defaultScheduledWebhookIds.filter(
    (id) => webhookIds.has(id)
  )
  const scheduledWebhooks = draft.webhooks.filter((item) =>
    validScheduledWebhookIds.includes(item.id)
  )
  const selectedEvaluators = evaluators.filter((item) =>
    validEvaluatorIds.includes(item.id)
  )

  useEffect(() => {
    if (
      !pendingScheduledEvaluatorDefaultRef.current ||
      !draft.supportsScheduledExecution ||
      validEvaluatorIds.length > 0 ||
      !evaluators[0]
    ) {
      return
    }
    pendingScheduledEvaluatorDefaultRef.current = false
    setDraft((current) => ({
      ...current,
      evaluatorIds: [evaluators[0].id],
    }))
  }, [draft.supportsScheduledExecution, evaluators, validEvaluatorIds.length])

  const updateWebhook = (patch: Partial<SceneWebhookService>) => {
    if (!selectedWebhook) return
    setDraft((current) => ({
      ...current,
      webhooks: current.webhooks.map((item) =>
        item.id === selectedWebhook.id ? { ...item, ...patch } : item
      ),
    }))
  }

  const addWebhook = () => {
    const next = emptyWebhook()
    setDraft((current) => ({
      ...current,
      webhooks: [...current.webhooks, next],
    }))
    setSelectedWebhookId(next.id)
  }

  const removeWebhook = (id: string) => {
    if (draft.webhooks.length === 1) {
      toast.error('场景至少需要一个 Webhook 服务')
      return
    }
    const next = draft.webhooks.filter((item) => item.id !== id)
    const nextScheduledWebhookIds = draft.defaultScheduledWebhookIds.filter(
      (webhookId) => webhookId !== id
    )
    setDraft((current) => ({
      ...current,
      webhooks: next,
      defaultScheduledWebhookIds:
        current.supportsScheduledExecution &&
        nextScheduledWebhookIds.length === 0 &&
        next[0]
          ? [next[0].id]
          : nextScheduledWebhookIds,
    }))
    if (selectedWebhookId === id) setSelectedWebhookId(next[0]?.id ?? '')
  }

  const validateStep = (targetStep: number) => {
    if (targetStep <= step) return true
    if (!draft.name.trim()) {
      toast.error('请输入场景名称')
      setStep(0)
      return false
    }
    if (targetStep > 1 && !draft.datasetId) {
      toast.error('请选择默认数据集')
      setStep(1)
      return false
    }
    if (
      targetStep > 2 &&
      draft.supportsScheduledExecution &&
      validScheduledWebhookIds.length === 0
    ) {
      toast.error('支持定时执行时请至少选择一个 Webhook 服务')
      setStep(2)
      return false
    }
    if (
      targetStep > 2 &&
      (draft.webhooks.length === 0 ||
        draft.webhooks.some((item) => !item.name.trim() || !item.url.trim()))
    ) {
      toast.error('请完成所有 Webhook 服务的名称和 URL')
      setStep(2)
      return false
    }
    if (
      targetStep > 3 &&
      draft.supportsScheduledExecution &&
      validEvaluatorIds.length === 0
    ) {
      toast.error('支持定时执行时请至少选择一个评估器')
      setStep(3)
      return false
    }
    if (targetStep > 4 && !parametersAreValid(draft.runParameters)) {
      toast.error('请检查运行参数范围')
      setStep(4)
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (pending) return
    if (submittingRef.current) return
    if (!validateStep(sceneSteps.length)) return
    submittingRef.current = true
    try {
      await onSubmit({
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim(),
        evaluatorIds: [...validEvaluatorIds],
        defaultScheduledWebhookIds: validScheduledWebhookIds,
        webhooks: draft.webhooks.map((item) => ({
          ...item,
          name: item.name.trim(),
          description: item.description.trim(),
          url: item.url.trim(),
          serviceFamily: item.serviceFamily.trim() || item.name.trim(),
          version: item.version.trim() || '1.0.0',
        })),
      })
    } catch {
      return
    } finally {
      submittingRef.current = false
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (pending && !nextOpen) return
    onOpenChange(nextOpen)
  }

  return (
    <Drawer
      open={open}
      onOpenChange={handleOpenChange}
      title={scene ? '编辑场景' : '新增场景'}
      mode='enhanced'
      showConfirm={false}
      showCancel={false}
      actions={
        <div className='flex items-center gap-2'>
          {step > 0 ? (
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={pending}
              onClick={() => setStep((current) => current - 1)}
            >
              上一步
            </Button>
          ) : null}
          {step < sceneSteps.length - 1 ? (
            <Button
              type='button'
              size='sm'
              disabled={pending}
              onClick={() => {
                const nextStep = step + 1
                if (validateStep(nextStep)) setStep(nextStep)
              }}
            >
              下一步
            </Button>
          ) : (
            <Button
              type='button'
              size='sm'
              disabled={pending}
              onClick={() => void handleSubmit()}
            >
              {scene ? '保存' : '确认创建'}
            </Button>
          )}
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={pending}
            onClick={() => handleOpenChange(false)}
          >
            取消
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-5 p-4'>
        <Stepper
          items={sceneSteps}
          currentStep={step}
          onStepChange={
            pending
              ? undefined
              : (nextStep) => {
                  if (validateStep(nextStep)) setStep(nextStep)
                }
          }
        />

        {step === 0 ? (
          <div className='grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]'>
            <section className='flex flex-col gap-4 rounded-lg border p-4'>
              <Field label='场景名称' htmlFor='scene-name'>
                <Input
                  id='scene-name'
                  value={draft.name}
                  maxLength={50}
                  placeholder='例如：客服问答全链路试验'
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label='场景描述' htmlFor='scene-description'>
                <Textarea
                  id='scene-description'
                  value={draft.description}
                  maxLength={300}
                  placeholder='说明场景的目标和适用范围'
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Field>
              <div className='bg-background flex items-center justify-between gap-4 rounded-lg border p-3'>
                <div className='flex min-w-0 flex-col gap-1'>
                  <label
                    className='text-sm font-medium'
                    htmlFor='scene-supports-scheduled-execution'
                  >
                    支持定时执行
                  </label>
                  <span className='text-muted-foreground text-xs leading-5'>
                    开启后，该场景可由定时任务模块调度执行。
                  </span>
                </div>
                <Switch
                  id='scene-supports-scheduled-execution'
                  checked={draft.supportsScheduledExecution}
                  onCheckedChange={(checked) => {
                    const defaultWebhook = draft.webhooks[0] ?? emptyWebhook()
                    pendingScheduledEvaluatorDefaultRef.current =
                      checked &&
                      validEvaluatorIds.length === 0 &&
                      !evaluators[0]
                    if (checked) {
                      setSelectedWebhookId(defaultWebhook.id)
                    }
                    setDraft((current) => ({
                      ...current,
                      supportsScheduledExecution: checked,
                      defaultScheduledWebhookIds:
                        checked && validScheduledWebhookIds.length === 0
                          ? current.webhooks[0]
                            ? [current.webhooks[0].id]
                            : [defaultWebhook.id]
                          : current.defaultScheduledWebhookIds,
                      webhooks:
                        checked && current.webhooks.length === 0
                          ? [defaultWebhook]
                          : current.webhooks,
                      evaluatorIds:
                        checked &&
                        validEvaluatorIds.length === 0 &&
                        evaluators[0]
                          ? [evaluators[0].id]
                          : current.evaluatorIds,
                    }))
                  }}
                  aria-label='支持定时执行'
                />
              </div>
              {draft.supportsScheduledExecution ? (
                <Alert>
                  <Info />
                  <AlertTitle>已支持定时执行</AlertTitle>
                  <AlertDescription>
                    可在定时任务模块中配置调度，评估器和 Webhook
                    服务将保留默认选择。
                  </AlertDescription>
                </Alert>
              ) : null}
            </section>
            <aside className='bg-muted/40 flex flex-col gap-2 rounded-lg border p-4 text-sm'>
              <span className='font-medium'>场景用途</span>
              <span className='text-muted-foreground'>
                场景保存默认数据集、评估器与执行配置，运行试验时可继续调整。
              </span>
            </aside>
          </div>
        ) : null}

        {step === 1 ? (
          <ExperimentDatasetStep
            projectId={projectId}
            selectedDatasetId={draft.datasetId}
            onSelect={(dataset) =>
              setDraft((current) => ({ ...current, datasetId: dataset.id }))
            }
            onNavigateToDatasetManagement={() => {
              handleOpenChange(false)
              navigate(buildProjectDatasetsHref(projectId))
            }}
          />
        ) : null}

        {step === 2 && selectedWebhook ? (
          <div className='grid min-h-[28rem] gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]'>
            <WebhookList
              webhooks={draft.webhooks}
              selectedWebhookId={selectedWebhook.id}
              showScheduledSelection={draft.supportsScheduledExecution}
              scheduledWebhookIds={validScheduledWebhookIds}
              onSelect={setSelectedWebhookId}
              onScheduledSelectionChange={(id, checked) => {
                setDraft((current) => ({
                  ...current,
                  defaultScheduledWebhookIds: checked
                    ? Array.from(
                        new Set([...current.defaultScheduledWebhookIds, id])
                      )
                    : current.defaultScheduledWebhookIds.filter(
                        (webhookId) => webhookId !== id
                      ),
                }))
                setSelectedWebhookId(id)
              }}
              onAdd={addWebhook}
              onRemove={removeWebhook}
            />
            <WebhookEditor webhook={selectedWebhook} onChange={updateWebhook} />
          </div>
        ) : null}

        {step === 3 ? (
          <ExperimentEvaluatorStep
            evaluators={evaluators}
            selectedEvaluatorIds={validEvaluatorIds}
            loading={evaluatorsQuery.isLoading}
            error={evaluatorsQuery.isError}
            onSelectionChange={(nextEvaluatorIds) => {
              setDraft((current) => ({
                ...current,
                evaluatorIds: nextEvaluatorIds,
              }))
            }}
          />
        ) : null}

        {step === 4 ? (
          <RunParameters
            parameters={draft.runParameters}
            onChange={(runParameters) =>
              setDraft((current) => ({ ...current, runParameters }))
            }
          />
        ) : null}

        {step === 5 ? (
          <div className='grid gap-4 lg:grid-cols-2'>
            <SummarySection title='场景信息'>
              <SummaryRow label='场景名称' value={draft.name} />
              <SummaryRow
                label='支持定时执行'
                value={draft.supportsScheduledExecution ? '是' : '否'}
              />
              <SummaryRow
                label='默认数据集'
                value={datasetQuery.data?.name ?? draft.datasetId}
              />
              <SummaryRow
                label='数据集类型'
                value={
                  datasetQuery.data ? (
                    <DatasetTypeBadge type={datasetQuery.data.type} />
                  ) : (
                    '-'
                  )
                }
              />
            </SummarySection>
            {draft.supportsScheduledExecution ? (
              <SummarySection
                title={`定时执行服务（${scheduledWebhooks.length}）`}
              >
                {scheduledWebhooks.map((webhook) => (
                  <SummaryRow
                    key={webhook.id}
                    label={webhook.name || '未命名服务'}
                    value={webhook.version}
                  />
                ))}
              </SummarySection>
            ) : null}
            <SummarySection
              title={`默认评估器（${selectedEvaluators.length}）`}
            >
              {selectedEvaluators.map((evaluator) => (
                <SummaryRow
                  key={evaluator.id}
                  label={evaluator.name}
                  value={`v${evaluator.version}`}
                />
              ))}
            </SummarySection>
            <SummarySection title={`Webhook 服务（${draft.webhooks.length}）`}>
              {draft.webhooks.map((webhook) => (
                <SummaryRow
                  key={webhook.id}
                  label={webhook.name}
                  value={webhook.version}
                />
              ))}
            </SummarySection>
            <SummarySection title='默认运行参数'>
              <SummaryRow
                label='并发 / 超时'
                value={`${draft.runParameters.concurrency} / ${draft.runParameters.timeoutSeconds} 秒`}
              />
              <SummaryRow
                label='重试 / 轮次'
                value={`${draft.runParameters.retryCount} 次 / ${draft.runParameters.rounds} 轮`}
              />
            </SummarySection>
          </div>
        ) : null}
      </div>
    </Drawer>
  )
}

function WebhookList({
  webhooks,
  selectedWebhookId,
  showScheduledSelection,
  scheduledWebhookIds,
  onSelect,
  onScheduledSelectionChange,
  onAdd,
  onRemove,
}: {
  webhooks: SceneWebhookService[]
  selectedWebhookId: string
  showScheduledSelection: boolean
  scheduledWebhookIds: string[]
  onSelect: (id: string) => void
  onScheduledSelectionChange: (id: string, checked: boolean) => void
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  return (
    <section className='flex flex-col gap-3 rounded-lg border p-4'>
      <div className='flex items-center justify-between gap-2'>
        <div>
          <h3 className='text-sm font-semibold'>Webhook 服务</h3>
          <p className='text-muted-foreground text-xs'>固定使用 POST 契约。</p>
        </div>
        <Button
          type='button'
          size='icon'
          variant='outline'
          onClick={onAdd}
          aria-label='添加 Webhook 服务'
        >
          <Plus />
        </Button>
      </div>
      <div className='flex flex-col gap-2'>
        {webhooks.map((webhook) => (
          <WebhookListItem
            key={webhook.id}
            webhook={webhook}
            selected={selectedWebhookId === webhook.id}
            showScheduledSelection={showScheduledSelection}
            scheduled={scheduledWebhookIds.includes(webhook.id)}
            onSelect={onSelect}
            onScheduledSelectionChange={onScheduledSelectionChange}
            onRemove={onRemove}
          />
        ))}
      </div>
    </section>
  )
}

function WebhookListItem({
  webhook,
  selected,
  showScheduledSelection,
  scheduled,
  onSelect,
  onScheduledSelectionChange,
  onRemove,
}: {
  webhook: SceneWebhookService
  selected: boolean
  showScheduledSelection: boolean
  scheduled: boolean
  onSelect: (id: string) => void
  onScheduledSelectionChange: (id: string, checked: boolean) => void
  onRemove: (id: string) => void
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border p-1 ${
        selected ? 'border-primary bg-accent' : ''
      }`}
    >
      {showScheduledSelection ? (
        <Checkbox
          checked={scheduled}
          onCheckedChange={(checked) =>
            onScheduledSelectionChange(webhook.id, checked === true)
          }
          aria-label={`选择定时执行服务：${webhook.name || '未命名服务'}`}
        />
      ) : null}
      <button
        type='button'
        className='min-w-0 flex-1 p-2 text-start'
        onClick={() => onSelect(webhook.id)}
      >
        <span className='block truncate text-sm font-medium'>
          {webhook.name || '未命名服务'}
        </span>
        <span className='text-muted-foreground block truncate text-xs'>
          {webhook.url || '待填写 URL'}
        </span>
      </button>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label='删除 Webhook 服务'
        onClick={() => onRemove(webhook.id)}
      >
        <Trash2 />
      </Button>
    </div>
  )
}

function WebhookEditor({
  webhook,
  onChange,
}: {
  webhook: SceneWebhookService
  onChange: (patch: Partial<SceneWebhookService>) => void
}) {
  return (
    <section className='grid content-start gap-4 rounded-lg border p-4 sm:grid-cols-2'>
      <Field label='服务名称'>
        <Input
          value={webhook.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </Field>
      <Field label='版本'>
        <Input
          value={webhook.version}
          onChange={(event) => onChange({ version: event.target.value })}
        />
      </Field>
      <div className='sm:col-span-2'>
        <Field label='Webhook URL'>
          <Input
            type='url'
            value={webhook.url}
            onChange={(event) => onChange({ url: event.target.value })}
          />
        </Field>
      </div>
      <Field label='鉴权方式'>
        <Select
          value={webhook.authType}
          onValueChange={(value: WebhookAuthType) =>
            onChange({ authType: value })
          }
        >
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value='NONE'>无鉴权</SelectItem>
              <SelectItem value='BEARER'>Bearer Token</SelectItem>
              <SelectItem value='API_KEY'>API Key</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field label='服务系列'>
        <Input
          value={webhook.serviceFamily}
          placeholder='support-agent'
          onChange={(event) => onChange({ serviceFamily: event.target.value })}
        />
      </Field>
      {webhook.authType !== 'NONE' ? (
        <div className='sm:col-span-2'>
          <Field label='Token / API Key'>
            <Input
              type='password'
              value={webhook.credential ?? ''}
              placeholder='仅用于原型展示，不填真实密钥'
              onChange={(event) => onChange({ credential: event.target.value })}
            />
          </Field>
        </div>
      ) : null}
      <div className='sm:col-span-2'>
        <Field label='描述'>
          <Textarea
            value={webhook.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </Field>
      </div>
    </section>
  )
}

function RunParameters({
  parameters,
  onChange,
}: {
  parameters: SceneFormInput['runParameters']
  onChange: (parameters: SceneFormInput['runParameters']) => void
}) {
  return (
    <section className='flex flex-col gap-4 rounded-lg border p-4'>
      <div>
        <h3 className='text-sm font-semibold'>运行参数</h3>
        <p className='text-muted-foreground text-xs'>作为运行试验的默认值。</p>
      </div>
      <NumberField
        label='并发数'
        min={1}
        max={50}
        value={parameters.concurrency}
        onChange={(concurrency) => onChange({ ...parameters, concurrency })}
      />
      <NumberField
        label='超时时间（秒）'
        min={1}
        max={600}
        value={parameters.timeoutSeconds}
        onChange={(timeoutSeconds) =>
          onChange({ ...parameters, timeoutSeconds })
        }
      />
      <NumberField
        label='重试次数'
        min={0}
        max={10}
        value={parameters.retryCount}
        onChange={(retryCount) => onChange({ ...parameters, retryCount })}
      />
      <NumberField
        label='默认执行轮次'
        min={1}
        max={20}
        value={parameters.rounds}
        onChange={(rounds) => onChange({ ...parameters, rounds })}
      />
    </section>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className='flex flex-col gap-2'>
      <label className='text-sm font-medium' htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

function NumberField({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Field label={label}>
      <Input
        type='number'
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className='text-muted-foreground text-xs'>
        允许范围 {min}-{max}
      </span>
    </Field>
  )
}

function SummarySection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className='bg-card rounded-lg border p-4'>
      <h3 className='text-sm font-semibold'>{title}</h3>
      <dl className='mt-3 flex flex-col gap-3'>{children}</dl>
    </section>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className='flex items-start justify-between gap-4 text-sm'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='max-w-[65%] text-right font-medium'>{value}</dd>
    </div>
  )
}

function parametersAreValid(parameters: SceneFormInput['runParameters']) {
  return (
    parameters.concurrency >= 1 &&
    parameters.concurrency <= 50 &&
    parameters.timeoutSeconds >= 1 &&
    parameters.timeoutSeconds <= 600 &&
    parameters.retryCount >= 0 &&
    parameters.retryCount <= 10 &&
    parameters.rounds >= 1 &&
    parameters.rounds <= 20
  )
}
