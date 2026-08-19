import { z } from 'zod'
import type { UseFormReturn } from 'react-hook-form'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MixEditor } from '@/components/common/MixEditor'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import {
  lifecycleStages,
  type BadcaseItem,
  type BadcaseStage,
} from '../../lib/badcase-workbench-prototype'

type BadcaseItemDrawerProps = {
  item: BadcaseItem | undefined
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (itemId: string, values: BadcaseItemFormValues) => void
}

const badcaseItemFormSchema = z.object({
  stage: z.enum([
    'PENDING_CONFIRM',
    'PENDING_ROOT_CAUSE',
    'FIXING',
    'PENDING_RETEST',
    'PENDING_VERIFY',
    'CLOSED',
  ]),
  owner: z.string().min(1, '请填写处理人'),
  priority: z.enum(['P0', 'P1', 'P2']),
  failureType: z.string(),
  rootCause: z.string(),
  fixDueAt: z.string(),
  actualFixAt: z.string(),
  fixPlan: z.string(),
  retestResult: z.string(),
  verifyNote: z.string(),
  note: z.string(),
})

export type BadcaseItemFormValues = z.infer<typeof badcaseItemFormSchema>

const BADCASE_ITEM_FORM_ID = 'badcase-item-form'

export function BadcaseItemDrawer({
  item,
  projectId,
  open,
  onOpenChange,
  onSave,
}: BadcaseItemDrawerProps) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={item ? `Badcase 详情 · ${item.id}` : 'Badcase 详情'}
      mode='enhanced'
      width='clamp(64rem, 70vw, 96rem)'
      showOverlay={false}
      confirmText='保存'
      confirmProps={{ form: BADCASE_ITEM_FORM_ID, type: 'submit' }}
      cancelText='关闭'
    >
      {!item ? null : (
        <BadcaseItemDrawerContent
          item={item}
          projectId={projectId}
          onSave={onSave}
        />
      )}
    </Drawer>
  )
}

function BadcaseItemDrawerContent({
  item,
  projectId,
  onSave,
}: {
  item: BadcaseItem
  projectId: string
  onSave: (itemId: string, values: BadcaseItemFormValues) => void
}) {
  const payload = tracePayload(item)
  const sourceTraceId = item.sourceTraceId.trim()

  return (
    <div className='grid gap-4 p-1'>
      <section className='rounded-lg border p-4'>
        <div className='mb-3 flex items-center justify-between gap-3'>
          <div>
            <h3 className='text-base font-semibold'>Badcase 表单详情</h3>
            <p className='text-muted-foreground mt-1 text-xs'>
              治理状态、责任流转和阶段表单沉淀信息。
            </p>
          </div>
          <Badge variant='outline'>{stageLabel(item.stage)}</Badge>
        </div>
        <BaseForm<BadcaseItemFormValues>
          id={BADCASE_ITEM_FORM_ID}
          key={item.id}
          schema={badcaseItemFormSchema}
          defaultValues={buildFormDefaultValues(item)}
          onSubmit={(values) => onSave(item.id, values)}
          className='grid gap-4 overflow-visible p-0 md:grid-cols-2'
        >
          {(form) => <BadcaseEditableFields form={form} />}
        </BaseForm>
      </section>

      <section className='rounded-lg border p-4'>
        <div className='mb-3 flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h3 className='text-base font-semibold'>Badcase item 数据详情</h3>
            <p className='text-muted-foreground mt-1 text-xs'>
              仅展示 Input、Expected Output 和 Metadata。
            </p>
          </div>
          {sourceTraceId ? (
            <div className='bg-muted/40 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs'>
              <span className='text-muted-foreground'>关联 Trace ID</span>
              <Link
                to={buildTraceLogsHref(projectId, sourceTraceId)}
                className='text-primary max-w-56 truncate font-mono underline-offset-4 hover:underline'
              >
                {sourceTraceId}
              </Link>
            </div>
          ) : null}
        </div>

        <div className='grid min-w-0 gap-3'>
          <MixEditor title='Input' value={payload.input} readOnly showEditButton={false} />
          <MixEditor
            title='Expected Output'
            value={payload.expectedOutput}
            readOnly
            showEditButton={false}
          />
          <MixEditor title='Metadata' value={payload.metadata} readOnly showEditButton={false} />
        </div>
      </section>
    </div>
  )
}

function BadcaseEditableFields({
  form,
}: {
  form: UseFormReturn<BadcaseItemFormValues>
}) {
  return (
    <>
      <SelectField form={form} name='stage' label='状态' />
      <TextInputField form={form} name='owner' label='处理人' />
      <SelectField form={form} name='priority' label='优先级' />
      <TextInputField form={form} name='failureType' label='失败类型' />
      <TextAreaField form={form} name='rootCause' label='根因分析' />
      <TextInputField form={form} name='fixDueAt' label='预计修复时间' />
      <TextInputField form={form} name='actualFixAt' label='实际修复时间' />
      <TextAreaField form={form} name='fixPlan' label='修复说明' />
      <TextAreaField form={form} name='retestResult' label='复测结果' />
      <TextAreaField form={form} name='verifyNote' label='验证备注' />
      <TextAreaField form={form} name='note' label='备注' />
    </>
  )
}

function buildFormDefaultValues(item: BadcaseItem): BadcaseItemFormValues {
  return {
    stage: item.stage,
    owner: item.owner,
    priority: item.priority,
    failureType: item.failureType,
    rootCause: item.rootCause,
    fixDueAt: item.fixDueAt,
    actualFixAt: actualFixTime(item),
    fixPlan: item.fixPlan,
    retestResult: item.retestResult,
    verifyNote: item.verifyNote,
    note: item.lastAction,
  }
}

function SelectField({
  form,
  name,
  label,
}: {
  form: UseFormReturn<BadcaseItemFormValues>
  name: 'stage' | 'priority'
  label: string
}) {
  const options =
    name === 'stage'
      ? lifecycleStages.map((stage) => ({ label: stage.label, value: stage.value }))
      : ['P0', 'P1', 'P2'].map((value) => ({ label: value, value }))

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={String(field.value)} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={`请选择${label}`} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function TextInputField({
  form,
  name,
  label,
}: {
  form: UseFormReturn<BadcaseItemFormValues>
  name: 'owner' | 'failureType' | 'fixDueAt' | 'actualFixAt'
  label: string
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} value={String(field.value)} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function TextAreaField({
  form,
  name,
  label,
}: {
  form: UseFormReturn<BadcaseItemFormValues>
  name: 'rootCause' | 'fixPlan' | 'retestResult' | 'verifyNote' | 'note'
  label: string
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className='md:col-span-2'>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea {...field} value={String(field.value)} className='min-h-20 resize-none' />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function tracePayload(item: BadcaseItem) {
  return {
    input: {
      badcaseId: item.id,
      userMessage: item.summary,
    },
    expectedOutput: {
      expectation: item.verifyNote,
      rootCause: item.rootCause,
      regressionCandidate: item.regressionCandidate,
    },
    metadata: {
      datasetId: item.datasetId,
      badcaseId: item.id,
      stage: item.stage,
      priority: item.priority,
      severity: item.severity,
      owner: item.owner,
      updatedAt: item.updatedAt,
    },
  }
}

function actualFixTime(item: BadcaseItem) {
  return item.history.find((event) => event.to === 'PENDING_RETEST')?.occurredAt ?? '待修复完成'
}

function stageLabel(stage: BadcaseStage) {
  return lifecycleStages.find((item) => item.value === stage)?.label ?? stage
}

function buildTraceLogsHref(projectId: string, traceId: string) {
  return `/projects/${encodeURIComponent(projectId)}/observability/traces/logs?traceId=${encodeURIComponent(traceId)}`
}
