import { z } from 'zod'
import type { UseFormReturn } from 'react-hook-form'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { BaseForm } from '@/components/common/base-form'
import { DateTimePicker } from '@/components/common/date-time/date-time-picker'
import {
  stageActionContent,
  type BadcaseItem,
  type BadcasePrimaryTransitionInput,
} from '../../lib/badcase-workbench-prototype'

type BadcaseStageFormProps = {
  item: BadcaseItem
  onSubmit: (input: BadcasePrimaryTransitionInput) => void
  onSecondaryAction: (action: string) => void
}

const rollbackStages = [
  { label: '待确认', value: 'PENDING_CONFIRM' },
  { label: '待归因', value: 'PENDING_ROOT_CAUSE' },
  { label: '修复中', value: 'FIXING' },
  { label: '待复测', value: 'PENDING_RETEST' },
  { label: '待验证', value: 'PENDING_VERIFY' },
] as const

const stageFormSchema = z
  .object({
    stage: z.enum([
      'PENDING_CONFIRM',
      'PENDING_ROOT_CAUSE',
      'FIXING',
      'PENDING_RETEST',
      'PENDING_VERIFY',
      'CLOSED',
    ]),
    isBadcase: z.enum(['YES', 'NO']),
    abnormalDescription: z.string(),
    priority: z.enum(['P0', 'P1', 'P2']),
    failureType: z.string(),
    rootCauseCategory: z.string(),
    rootCauseSummary: z.string(),
    expectedFixAt: z.string(),
    fixDescription: z.string(),
    retestMethod: z.string(),
    retestNote: z.string(),
    retestConclusion: z.enum(['PASS', 'FAIL']),
    verificationConclusion: z.enum(['PASS', 'FAIL']),
    verificationNote: z.string(),
    closeReason: z.string(),
    nextOwner: z.string(),
    rollbackStage: z.enum([
      'PENDING_CONFIRM',
      'PENDING_ROOT_CAUSE',
      'FIXING',
      'PENDING_RETEST',
      'PENDING_VERIFY',
    ]),
    regressionCandidate: z.boolean(),
  })
  .superRefine((value, context) => {
    const requireText = (field: keyof typeof value, message: string) => {
      if (!String(value[field]).trim()) {
        context.addIssue({ code: 'custom', path: [field], message })
      }
    }

    if (value.stage === 'PENDING_CONFIRM') {
      requireText('abnormalDescription', '请填写异常描述')
      if (value.isBadcase === 'YES') {
        requireText('nextOwner', '请填写归因责任人')
      }
    }
    if (value.stage === 'PENDING_ROOT_CAUSE') {
      requireText('failureType', '请选择失败类型')
      requireText('rootCauseCategory', '请选择根因分类')
      requireText('rootCauseSummary', '请填写根因摘要')
      requireText('expectedFixAt', '请选择期望修复时间')
      requireText('nextOwner', '请填写修复责任人')
    }
    if (value.stage === 'FIXING') {
      requireText('fixDescription', '请填写修复说明')
      requireText('nextOwner', '请填写复测责任人')
    }
    if (value.stage === 'PENDING_RETEST') {
      requireText('retestMethod', '请选择复测方式')
      requireText('retestNote', '请填写复测备注')
      if (value.retestConclusion === 'PASS') {
        requireText('nextOwner', '请填写下一阶段责任人')
      }
    }
    if (value.stage === 'PENDING_VERIFY') {
      requireText('verificationNote', '请填写验证结论')
      if (value.verificationConclusion === 'PASS') {
        requireText('closeReason', '请填写关闭原因')
      } else {
        requireText('nextOwner', '请填写修复责任人')
      }
    }
    if (value.stage === 'CLOSED') {
      requireText('verificationNote', '请填写重新打开原因')
      requireText('nextOwner', '请填写处理人')
    }
  })

type StageFormValues = z.infer<typeof stageFormSchema>

export function BadcaseStageForm({
  item,
  onSubmit,
  onSecondaryAction,
}: BadcaseStageFormProps) {
  const actionContent = stageActionContent[item.stage]

  return (
    <BaseForm<StageFormValues>
      key={`${item.id}-${item.stage}`}
      schema={stageFormSchema}
      defaultValues={{
        stage: item.stage,
        isBadcase: 'YES',
        abnormalDescription: item.summary,
        priority: item.priority,
        failureType: item.failureType,
        rootCauseCategory: '',
        rootCauseSummary:
          item.rootCause === '待补充根因分类和证据。' ? '' : item.rootCause,
        expectedFixAt: '',
        fixDescription: '',
        retestMethod: '',
        retestNote: '',
        retestConclusion: 'PASS',
        verificationConclusion: 'PASS',
        verificationNote: '',
        closeReason: '',
        nextOwner: '',
        rollbackStage: 'PENDING_CONFIRM',
        regressionCandidate: item.regressionCandidate,
      }}
      onSubmit={(values) => onSubmit(buildTransitionInput(item, values))}
      className='gap-4 overflow-visible p-0'
    >
      {(form) => (
        <>
          {item.stage === 'PENDING_CONFIRM' ? (
            <>
              <SelectField
                form={form}
                name='isBadcase'
                label='是否为 Badcase'
                options={[
                  { label: '是，需要治理', value: 'YES' },
                  { label: '否，关闭无效样本', value: 'NO' },
                ]}
              />
              <TextField
                form={form}
                name='abnormalDescription'
                label='异常描述'
                placeholder='描述异常表现、影响和判断依据'
              />
              <SelectField
                form={form}
                name='priority'
                label='优先级'
                options={['P0', 'P1', 'P2'].map((value) => ({
                  label: value,
                  value,
                }))}
              />
              {form.watch('isBadcase') === 'YES' ? (
                <OwnerField form={form} label='归因责任人' />
              ) : null}
            </>
          ) : null}

          {item.stage === 'PENDING_ROOT_CAUSE' ? (
            <>
              <SelectField
                form={form}
                name='failureType'
                label='失败类型'
                options={[
                  { label: '多轮状态错误', value: 'MULTI_TURN_STATE_ERROR' },
                  { label: '安全策略遗漏', value: 'SAFETY_POLICY_MISS' },
                  { label: '业务规则遗漏', value: 'BUSINESS_RULE_MISS' },
                  { label: '缓存过期', value: 'CACHE_STALE' },
                ]}
              />
              <SelectField
                form={form}
                name='rootCauseCategory'
                label='根因分类'
                options={[
                  { label: 'Session memory', value: 'session_memory' },
                  { label: 'Prompt / 策略', value: 'prompt_policy' },
                  { label: '知识检索', value: 'retrieval' },
                  { label: '工具调用', value: 'tool_call' },
                ]}
              />
              <TextField
                form={form}
                name='rootCauseSummary'
                label='根因摘要'
                placeholder='说明根因、证据及影响范围'
              />
              <DateField
                form={form}
                name='expectedFixAt'
                label='期望修复时间'
              />
              <OwnerField form={form} label='修复责任人' />
            </>
          ) : null}

          {item.stage === 'FIXING' ? (
            <>
              <ReadonlyField label='预计修复时间' value={item.fixDueAt} />
              <TextField
                form={form}
                name='fixDescription'
                label='修复说明'
                placeholder='填写修复内容、关联 PR、配置或 Prompt 版本'
              />
              <OwnerField form={form} label='复测责任人' />
            </>
          ) : null}

          {item.stage === 'PENDING_RETEST' ? (
            <>
              <SelectField
                form={form}
                name='retestMethod'
                label='复测方式'
                options={[
                  { label: '评测试验自动复跑', value: 'experiment' },
                  { label: '人工复测', value: 'manual' },
                  { label: 'Trace 回放', value: 'trace-replay' },
                ]}
              />
              <TextField
                form={form}
                name='retestNote'
                label='复测备注'
                placeholder='记录输入输出对比、运行 ID 和结果说明'
              />
              <SelectField
                form={form}
                name='retestConclusion'
                label='复测结论'
                options={[
                  { label: '通过', value: 'PASS' },
                  { label: '失败，退回修复', value: 'FAIL' },
                ]}
              />
              <OwnerField
                form={form}
                label={
                  form.watch('retestConclusion') === 'PASS'
                    ? '验证责任人'
                    : '修复责任人'
                }
                defaultOwner={
                  form.watch('retestConclusion') === 'FAIL' ? item.fixOwner : ''
                }
              />
            </>
          ) : null}

          {item.stage === 'PENDING_VERIFY' ? (
            <>
              <SelectField
                form={form}
                name='verificationConclusion'
                label='验证结论'
                options={[
                  { label: '通过并关闭', value: 'PASS' },
                  { label: '失败，退回修复', value: 'FAIL' },
                ]}
              />
              <TextField
                form={form}
                name='verificationNote'
                label='验证结论输入'
                placeholder='填写验收结果和影响面复核'
              />
              {form.watch('verificationConclusion') === 'PASS' ? (
                <>
                  <TextField
                    form={form}
                    name='closeReason'
                    label='关闭原因'
                    placeholder='填写关闭原因'
                  />
                  <FormField
                    control={form.control}
                    name='regressionCandidate'
                    render={({ field }) => (
                      <FormItem className='flex items-center justify-between rounded-md border p-3'>
                        <FormLabel>加入回归集</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </>
              ) : (
                <OwnerField form={form} label='修复责任人' />
              )}
            </>
          ) : null}

          {item.stage === 'CLOSED' ? (
            <>
              <TextField
                form={form}
                name='verificationNote'
                label='重新打开原因'
                placeholder='说明重新出现的问题和治理理由'
              />
              <RollbackStageField form={form} />
              <OwnerField form={form} label='处理人' />
            </>
          ) : null}

          <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
            {actionContent.secondaryActions.slice(0, 2).map((action) => (
              <Button
                key={action}
                type='button'
                variant='outline'
                size='sm'
                onClick={() => onSecondaryAction(action)}
              >
                {action.includes('退回') || action.includes('重新') ? (
                  <RotateCcw data-icon='inline-start' />
                ) : null}
                {action}
              </Button>
            ))}
            <Button type='submit' size='sm'>
              {primaryActionLabel(item, form.getValues())}
              <ArrowRight data-icon='inline-end' />
            </Button>
          </div>
        </>
      )}
    </BaseForm>
  )
}

type StageForm = UseFormReturn<StageFormValues>

function SelectField({
  form,
  name,
  label,
  options,
}: {
  form: StageForm
  name:
    | 'isBadcase'
    | 'priority'
    | 'failureType'
    | 'rootCauseCategory'
    | 'retestMethod'
    | 'retestConclusion'
    | 'verificationConclusion'
    | 'rollbackStage'
  label: string
  options: { label: string; value: string }[]
}) {
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

function TextField({
  form,
  name,
  label,
  placeholder,
}: {
  form: StageForm
  name:
    | 'abnormalDescription'
    | 'rootCauseSummary'
    | 'fixDescription'
    | 'retestNote'
    | 'verificationNote'
    | 'closeReason'
  label: string
  placeholder: string
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea
              {...field}
              value={String(field.value)}
              placeholder={placeholder}
              className='min-h-20 resize-none'
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function OwnerField({
  form,
  label,
  defaultOwner = '',
}: {
  form: StageForm
  label: string
  defaultOwner?: string
}) {
  return (
    <FormField
      control={form.control}
      name='nextOwner'
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={field.value || defaultOwner}
              placeholder={`请输入${label}`}
              onChange={field.onChange}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <FormControl>
        <Input value={value} readOnly />
      </FormControl>
    </FormItem>
  )
}

function RollbackStageField({ form }: { form: StageForm }) {
  return (
    <SelectField
      form={form}
      name='rollbackStage'
      label='回退阶段'
      options={[...rollbackStages]}
    />
  )
}

function DateField({
  form,
  name,
  label,
}: {
  form: StageForm
  name: 'expectedFixAt'
  label: string
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <DateTimePicker
            value={field.value}
            onChange={field.onChange}
            showTime
            placeholder='选择日期和时间'
          />
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function buildTransitionInput(
  item: BadcaseItem,
  values: StageFormValues
): BadcasePrimaryTransitionInput {
  if (item.stage === 'PENDING_CONFIRM') {
    return {
      note: values.abnormalDescription,
      nextOwner: values.isBadcase === 'YES' ? values.nextOwner : item.owner,
      targetStage: values.isBadcase === 'YES' ? 'PENDING_ROOT_CAUSE' : 'CLOSED',
      actionLabel: values.isBadcase === 'YES' ? '确认有效' : '关闭无效',
    }
  }
  if (item.stage === 'PENDING_ROOT_CAUSE') {
    return { note: values.rootCauseSummary, nextOwner: values.nextOwner }
  }
  if (item.stage === 'FIXING') {
    return { note: values.fixDescription, nextOwner: values.nextOwner }
  }
  if (item.stage === 'PENDING_RETEST') {
    const retestFailed = values.retestConclusion === 'FAIL'

    return {
      note: values.retestNote,
      nextOwner: retestFailed
        ? values.nextOwner || item.fixOwner
        : values.nextOwner,
      targetStage: retestFailed ? 'FIXING' : 'PENDING_VERIFY',
      actionLabel: retestFailed ? '退回修复' : '复测通过',
    }
  }
  if (item.stage === 'PENDING_VERIFY') {
    return {
      note: values.verificationNote,
      nextOwner:
        values.verificationConclusion === 'PASS'
          ? item.owner
          : values.nextOwner,
      targetStage:
        values.verificationConclusion === 'PASS' ? 'CLOSED' : 'FIXING',
      actionLabel:
        values.verificationConclusion === 'PASS'
          ? '验证通过并关闭'
          : '验证失败并退回修复',
    }
  }
  return {
    note: values.verificationNote,
    nextOwner: values.nextOwner,
    targetStage: values.rollbackStage,
    actionLabel: '回退处理',
  }
}

function primaryActionLabel(item: BadcaseItem, values: StageFormValues) {
  if (item.stage === 'PENDING_CONFIRM') {
    return values.isBadcase === 'YES' ? '确认有效' : '关闭无效'
  }
  if (item.stage === 'PENDING_RETEST') {
    return values.retestConclusion === 'PASS' ? '复测通过' : '退回修复'
  }
  if (item.stage === 'PENDING_VERIFY') {
    return values.verificationConclusion === 'PASS'
      ? '验证通过并关闭'
      : '验证失败并退回修复'
  }
  if (item.stage === 'CLOSED') {
    return '回退处理'
  }
  return stageActionContent[item.stage].primaryAction
}
