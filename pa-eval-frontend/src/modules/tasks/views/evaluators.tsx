import { useCallback, useMemo, useState } from 'react'
import { z } from 'zod'
import {
  useFieldArray,
  type UseFormReturn,
} from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  evaluationScenarioDescriptions,
  evaluationScenarioLabels,
  evaluationScenarioOptions,
} from '@/modules/app-evaluation/lib/evaluation-scenarios'
import { listProjectScoreConfigs } from '@/modules/app-evaluation/api/annotation-api'
import { EvaluationPageNav } from '@/modules/app-evaluation/components/evaluation-page-nav'
import type { ScoreConfigRecord } from '@/modules/app-evaluation/types'
import { Eye, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MixEditor } from '@/components/common/MixEditor'
import { BaseDetail } from '@/components/common/base-detail'
import { BaseForm } from '@/components/common/base-form'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableFilterBinding,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { Drawer } from '@/components/common/drawer'
import { Loading } from '@/components/common/loading'
import { LongText } from '@/components/common/long-text'
import { Page } from '@/components/common/page'
import {
  buildEvaluatorFormValuesFromDetail,
  createTaskEvaluator,
  deleteTaskEvaluator,
  getTaskEvaluator,
  listTaskEvaluators,
  updateTaskEvaluator,
  type CreateTaskEvaluatorFormValues,
  type EvaluationScenario,
  type TaskEvaluatorDetail,
  type TaskEvaluatorRecord,
} from '../api/evaluator-api'
import { TasksPageHeader } from '../components/tasks-page-header'

const createEvaluatorFormId = 'create-evaluator-form'
const editEvaluatorFormId = 'edit-evaluator-form'

const evaluatorTypeLabels: Record<TaskEvaluatorRecord['type'], string> = {
  LLM_AS_JUDGE: 'LLM-as-Judge',
  CODE: 'Code',
  WORKFLOW: '工作流',
  SDK: 'SDK',
}

const evaluatorProviderLabels: Record<TaskEvaluatorRecord['provider'], string> =
  {
    LANGFUSE: 'Langfuse',
    DIFY: 'Dify',
    HIAGENT: 'HiAgent',
    N8N: 'n8n',
    OPENJUDGE: 'OpenJudge',
  }

const evaluatorUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'type', columnId: 'type', type: 'array' },
]

const evaluatorToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'type',
    title: '评估器类型',
    selectionMode: 'single',
    options: Object.entries(evaluatorTypeLabels).map(([value, label]) => ({
      label,
      value,
    })),
  },
]

const sampleFieldOptions = [
  'input',
  'input.question',
  'output',
  'expectedOutput',
  'context',
  'history',
  'messages',
  'datasetItem.input.history',
  'datasetItem.input.conversation',
  'datasetItem.input.messages',
  'datasetItem.input.trajectory',
  'datasetItem.input.tool_calls',
  'metadata',
  'trace.id',
  'observation.id',
  'datasetItem.id',
]

function stringifyEditorValue(value: unknown) {
  return typeof value === 'string'
    ? value
    : JSON.stringify(value ?? null, null, 2)
}

const createEvaluatorSchema = z
  .object({
    name: z.string().min(1, '请输入评估器名称'),
    type: z.enum(['LLM_AS_JUDGE', 'CODE', 'WORKFLOW', 'SDK']),
    provider: z.enum(['LANGFUSE', 'DIFY', 'HIAGENT', 'N8N', 'OPENJUDGE']),
    evaluationScenario: z.enum([
      'SINGLE_TURN',
      'MULTI_TURN',
      'TOOL_CALLING',
      'MULTI_TURN_TOOL_CALLING',
      'RAG_FACTUALITY',
      'SAFETY',
      'AGENT_SKILL',
      'CUSTOM',
    ]),
    projectId: z.string().min(1, '请选择所属项目'),
    description: z.string().min(1, '请输入评估器描述'),
    variables: z.string(),
    inputVariables: z.string().min(1, '请输入输入变量，多个变量用逗号分隔'),
    outputVariables: z.string(),
    outputVariableMappings: z
      .array(
        z.object({
          variableName: z.string().min(1, '请输入变量名'),
          scoreConfigId: z.string().min(1, '请选择评分指标'),
          scoreConfigName: z.string().min(1, '请选择评分指标'),
        })
      )
      .min(1, '请至少添加一个输出变量'),
    prompt: z.string(),
    modelProvider: z.string(),
    model: z.string(),
    sourceCodeLanguage: z.enum(['PYTHON', 'TYPESCRIPT']),
    sourceCode: z.string(),
    endpointUrl: z.string(),
    authType: z.enum(['NONE', 'BEARER', 'BASIC', 'API_KEY']),
    authToken: z.string(),
    inputMapping: z.string(),
    outputMapping: z.string(),
    sdkPackage: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'LLM_AS_JUDGE') {
      if (!value.prompt.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['prompt'],
          message: '请输入 Prompt',
        })
      }
      if (!value.modelProvider.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['modelProvider'],
          message: '请输入模型提供方',
        })
      }
      if (!value.model.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['model'],
          message: '请输入模型名称',
        })
      }
    }

    if (value.type === 'CODE' && !value.sourceCode.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceCode'],
        message: '请输入源码',
      })
    }

    if (value.type === 'WORKFLOW' && !value.endpointUrl.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['endpointUrl'],
        message: '请输入工作流地址',
      })
    }

    if (value.type === 'SDK' && !value.sdkPackage.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['sdkPackage'],
        message: '请输入 SDK 标识',
      })
    }
  })

const evaluatorQueryKey = ['tasks-evaluators'] as const

type TaskEvaluatorsProps = {
  navigation?: 'tasks' | 'project-evaluation'
}

export function TaskEvaluators({ navigation = 'tasks' }: TaskEvaluatorsProps) {
  const $api = useAPI()
  const { projectId = '' } = useParams()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditEvaluators = can('project:evaluator:edit')
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editingEvaluator, setEditingEvaluator] =
    useState<TaskEvaluatorDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedEvaluator, setSelectedEvaluator] =
    useState<TaskEvaluatorDetail | null>(null)
  const [deletingEvaluator, setDeletingEvaluator] =
    useState<TaskEvaluatorRecord | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const scoreConfigsQuery = useQuery({
    queryKey: ['project-score-config-names', $api, projectId],
    enabled: canEditEvaluators && (createOpen || editOpen) && Boolean(projectId),
    queryFn: () => listProjectScoreConfigs($api, projectId),
  })
  const scoreConfigs =
    scoreConfigsQuery.data
      ?.filter((item) => !item.archived)
      .map((item) => ({
        id: item.id,
        name: item.name,
      })) ?? []

  const handleViewDetail = useCallback(
    async (evaluator: TaskEvaluatorRecord) => {
      setDetailOpen(true)
      setDetailLoading(true)
      try {
        const detail = await getTaskEvaluator($api, evaluator.id, projectId)
        setSelectedEvaluator(detail)
      } catch (error) {
        setDetailOpen(false)
        toast.error(
          error instanceof Error ? error.message : '加载评估器详情失败'
        )
      } finally {
        setDetailLoading(false)
      }
    },
    [$api, projectId]
  )

  const handleEdit = useCallback(
    async (evaluator: TaskEvaluatorRecord) => {
      if (evaluator.provider === 'LANGFUSE' || evaluator.isBuiltin) {
        toast.error(
          evaluator.isBuiltin
            ? '内置评估器不可编辑'
            : 'Langfuse 原生评估器请在 Langfuse 中编辑'
        )
        return
      }

      setEditOpen(true)
      setEditLoading(true)
      try {
        const detail = await getTaskEvaluator($api, evaluator.id, projectId)
        setEditingEvaluator(detail)
      } catch (error) {
        setEditOpen(false)
        toast.error(
          error instanceof Error ? error.message : '加载评估器详情失败'
        )
      } finally {
        setEditLoading(false)
      }
    },
    [$api, projectId]
  )

  const handleConfirmDelete = async () => {
    if (!deletingEvaluator) return

    setDeleteLoading(true)
    try {
      await deleteTaskEvaluator($api, deletingEvaluator.id)
      await queryClient.invalidateQueries({ queryKey: evaluatorQueryKey })
      toast.success(`已删除评估器：${deletingEvaluator.name}`)
      setDeletingEvaluator(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除评估器失败')
    } finally {
      setDeleteLoading(false)
    }
  }

  const columns = useMemo(
    () =>
      createEvaluatorColumns({
        onViewDetail: handleViewDetail,
        onEdit: canEditEvaluators ? handleEdit : undefined,
        onDelete: canEditEvaluators ? setDeletingEvaluator : undefined,
      }),
    [canEditEvaluators, handleEdit, handleViewDetail]
  )

  const handleCreate = async (values: CreateTaskEvaluatorFormValues) => {
    if (!canEditEvaluators) return

    const outputVariables = getOutputVariableNames(
      values.outputVariableMappings
    ).join(', ')

    try {
      await createTaskEvaluator($api, { ...values, projectId, outputVariables })
      await queryClient.invalidateQueries({ queryKey: evaluatorQueryKey })
      setCreateOpen(false)
      toast.success(`已创建评估器：${values.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建评估器失败')
    }
  }

  const handleUpdate = async (values: CreateTaskEvaluatorFormValues) => {
    if (!canEditEvaluators || !editingEvaluator) return

    const outputVariables = getOutputVariableNames(
      values.outputVariableMappings
    ).join(', ')

    try {
      await updateTaskEvaluator($api, editingEvaluator.id, {
        ...values,
        outputVariables,
      })
      await queryClient.invalidateQueries({ queryKey: evaluatorQueryKey })
      setEditOpen(false)
      setEditingEvaluator(null)
      toast.success(`已保存评估器：${values.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存评估器失败')
    }
  }

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: evaluatorQueryKey })
    toast.success('评估器已刷新')
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        {navigation === 'project-evaluation' ? (
          <EvaluationPageNav
            buttonGroups={{
              buttons: [
                {
                  id: 'refresh',
                  label: '刷新',
                  icon: RefreshCw,
                  iconPosition: 'start',
                  variant: 'outline',
                  size: 'sm',
                  onClick: () => void handleRefresh(),
                },
                {
                  id: 'create',
                  label: '新建评估器',
                  icon: Plus,
                  iconPosition: 'start',
                  size: 'sm',
                  onClick: canEditEvaluators
                    ? () => setCreateOpen(true)
                    : undefined,
                  disabled: !canEditEvaluators,
                },
              ],
            }}
          />
        ) : (
          <TasksPageHeader
            showImport={false}
            createLabel='新建评估器'
            onCreateClick={
              canEditEvaluators ? () => setCreateOpen(true) : undefined
            }
          />
        )}
        <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
          <DataTable<TaskEvaluatorRecord>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => [
                ...evaluatorQueryKey,
                $api,
                projectId,
                navigation,
                state,
              ],
              queryFn: (state) =>
                listTaskEvaluators(
                  $api,
                  state,
                  navigation === 'project-evaluation' ? projectId : undefined
                ),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: evaluatorUrlFilters,
            }}
            toolbar={{
              searchPlaceholder: '搜索评估器名称、描述或类型',
              filters: evaluatorToolbarFilters,
              columnLabels: {
                name: '评估器名称',
                evaluationScenario: '场景',
                type: '类型',
                version: '版本',
                projectName: '项目',
                usageCount: '使用次数',
                variables: '变量',
                updatedAt: '更新时间',
              },
            }}
            loadingText={
              <Loading
                text='加载评估器中...'
                className='min-h-24 border-0 bg-transparent'
              />
            }
            emptyText='暂无匹配的评估器'
            minTableWidth={960}
          />
        </section>
      </div>
      <Drawer
        open={canEditEvaluators && createOpen}
        onOpenChange={setCreateOpen}
        title='新建评估器'
        mode='enhanced'
        width={860}
        actions={null}
      >
        <BaseForm
          id={createEvaluatorFormId}
          schema={createEvaluatorSchema}
          defaultValues={{
            name: '',
            type: 'LLM_AS_JUDGE' as const,
            provider: 'LANGFUSE' as const,
            evaluationScenario: 'SINGLE_TURN' as const,
            projectId: projectId,
            description: '',
            variables: 'input, output',
            inputVariables: 'input, output',
            outputVariables: '',
            outputVariableMappings: [
              {
                variableName: '',
                scoreConfigId: '',
                scoreConfigName: '',
              },
            ],
            prompt: '',
            modelProvider: 'openai',
            model: 'gpt-4.1',
            sourceCodeLanguage: 'PYTHON' as const,
            sourceCode: '',
            endpointUrl: '',
            authType: 'NONE' as const,
            authToken: '',
            inputMapping: '{}',
            outputMapping: '{}',
            sdkPackage: '',
          }}
          onSubmit={handleCreate}
          className='min-h-full gap-4 overflow-visible p-6 pb-0'
        >
          {(form) => (
            <EvaluatorFormFields
              form={form}
              formId={createEvaluatorFormId}
              submitLabel='创建'
              scoreConfigs={scoreConfigs}
              scoreConfigsLoading={scoreConfigsQuery.isLoading}
              onCancel={() => setCreateOpen(false)}
            />
          )}
        </BaseForm>
      </Drawer>
      <Drawer
        open={canEditEvaluators && editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) {
            setEditingEvaluator(null)
          }
        }}
        title='编辑评估器'
        mode='enhanced'
        width={860}
        actions={null}
      >
        {editLoading ? (
          <Loading
            text='加载评估器详情中...'
            className='min-h-40 border-0 bg-transparent'
          />
        ) : editingEvaluator ? (
          <BaseForm
            key={editingEvaluator.id}
            id={editEvaluatorFormId}
            schema={createEvaluatorSchema}
            defaultValues={buildEvaluatorFormValuesFromDetail(
              editingEvaluator,
              projectId
            )}
            onSubmit={handleUpdate}
            className='min-h-full gap-4 overflow-visible p-6 pb-0'
          >
            {(form) => (
              <EvaluatorFormFields
                form={form}
                formId={editEvaluatorFormId}
                submitLabel='保存'
                scoreConfigs={scoreConfigs}
                scoreConfigsLoading={scoreConfigsQuery.isLoading}
                onCancel={() => setEditOpen(false)}
              />
            )}
          </BaseForm>
        ) : null}
      </Drawer>
      <Drawer
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open)
          if (!open) {
            setSelectedEvaluator(null)
          }
        }}
        title='评估器详情'
        mode='enhanced'
        width={820}
        showConfirm={false}
        cancelText='关闭'
      >
        {detailLoading ? (
          <Loading
            text='加载评估器详情中...'
            className='min-h-40 border-0 bg-transparent'
          />
        ) : selectedEvaluator ? (
          <EvaluatorDetailContent evaluator={selectedEvaluator} />
        ) : null}
      </Drawer>
      <AlertDialog
        open={Boolean(deletingEvaluator)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingEvaluator(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除评估器</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该评估器将从列表中移除，后续自动评测任务不能再选择它。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteLoading}
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmDelete()
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}

function createEvaluatorColumns({
  onViewDetail,
  onEdit,
  onDelete,
}: {
  onViewDetail: (evaluator: TaskEvaluatorRecord) => void
  onEdit?: (evaluator: TaskEvaluatorRecord) => void
  onDelete?: (evaluator: TaskEvaluatorRecord) => void
}): ColumnDef<TaskEvaluatorRecord>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='评估器名称' />
      ),
      cell: ({ row }) => (
        <div className='flex max-w-80 flex-col gap-1'>
          <span className='font-medium'>{row.original.name}</span>
          <LongText className='text-muted-foreground text-xs'>
            {row.original.description}
          </LongText>
        </div>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'evaluationScenario',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='场景' />
      ),
      cell: ({ row }) => (
        <Badge variant='outline'>
          {
            evaluationScenarioLabels[
              row.original.evaluationScenario ?? 'SINGLE_TURN'
            ]
          }
        </Badge>
      ),
    },
    {
      accessorKey: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='类型' />
      ),
      cell: ({ row }) => (
        <Badge variant={row.original.type === 'CODE' ? 'outline' : 'secondary'}>
          {evaluatorTypeLabels[row.original.type]}
        </Badge>
      ),
    },
    {
      accessorKey: 'version',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='版本' />
      ),
    },
    {
      accessorKey: 'projectName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='项目' />
      ),
      cell: ({ row }) => (
        <LongText className='text-muted-foreground max-w-48'>
          {row.original.projectName}
        </LongText>
      ),
    },
    {
      accessorKey: 'usageCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='使用次数' />
      ),
      cell: ({ row }) => row.original.usageCount,
    },
    {
      accessorKey: 'variables',
      header: '变量',
      cell: ({ row }) => (
        <div className='flex max-w-80 flex-wrap gap-1'>
          {row.original.variables.map((variable) => (
            <Badge key={variable} variant='outline'>
              {variable}
            </Badge>
          ))}
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='更新时间' />
      ),
      cell: ({ row }) => formatDateTime(row.original.updatedAt),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const evaluator = row.original
        const canManage = evaluator.provider !== 'LANGFUSE' && !evaluator.isBuiltin

        return (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                aria-label='打开评估器操作菜单'
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => onViewDetail(evaluator)}>
                  <Eye data-icon='inline-start' />
                  查看详情
                </DropdownMenuItem>
                {onEdit ? (
                  <DropdownMenuItem
                    disabled={!canManage}
                    onSelect={() => onEdit(evaluator)}
                  >
                    <Pencil data-icon='inline-start' />
                    编辑评估器
                  </DropdownMenuItem>
                ) : null}
                {onDelete ? (
                  <DropdownMenuItem
                    disabled={!canManage}
                    variant='destructive'
                    onSelect={() => onDelete(evaluator)}
                  >
                    <Trash2 data-icon='inline-start' />
                    删除评估器
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      enableHiding: false,
      enableSorting: false,
    },
  ]
}

function EvaluatorDetailContent({
  evaluator,
}: {
  evaluator: TaskEvaluatorDetail
}) {
  const inputVariables = evaluator.variables.length
    ? evaluator.variables.join(', ')
    : undefined
  const outputVariables = evaluator.outputVariables?.length
    ? evaluator.outputVariables.join(', ')
    : undefined

  return (
    <div>
      <BaseDetail
        columns={2}
        items={[
          { label: '名称', value: evaluator.name },
          { label: '类型', value: evaluatorTypeLabels[evaluator.type] },
          {
            label: '提供方',
            value: evaluatorProviderLabels[evaluator.provider],
          },
          { label: '版本', value: evaluator.version },
          { label: '所属项目', value: evaluator.projectName },
          { label: '使用次数', value: evaluator.usageCount },
          { label: '输入变量', value: inputVariables, span: 'full' },
          { label: '输出变量', value: outputVariables, span: 'full' },
          {
            label: '描述',
            value: evaluator.description,
            span: 'full',
          },
          {
            label: '更新时间',
            value: formatDateTime(evaluator.updatedAt),
            span: 'full',
          },
        ]}
      />
      {evaluator.config ? (
        <DetailJsonBlock title='工作流配置' value={evaluator.config} />
      ) : null}
      {evaluator.prompt ? (
        <DetailTextBlock title='Prompt' value={evaluator.prompt} />
      ) : null}
      {evaluator.modelConfig ? (
        <DetailJsonBlock title='模型配置' value={evaluator.modelConfig} />
      ) : null}
      {evaluator.outputDefinition ? (
        <DetailJsonBlock title='输出定义' value={evaluator.outputDefinition} />
      ) : null}
      {evaluator.sourceCode ? (
        <DetailTextBlock
          title={`源码${evaluator.sourceCodeLanguage ? ` / ${evaluator.sourceCodeLanguage}` : ''}`}
          value={evaluator.sourceCode}
        />
      ) : null}
    </div>
  )
}

function DetailJsonBlock({
  title,
  value,
}: {
  title: string
  value: Record<string, unknown>
}) {
  return <DetailTextBlock title={title} value={formatJson(value)} />
}

function DetailTextBlock({ title, value }: { title: string; value: string }) {
  return (
    <section className='border-t p-4'>
      <h3 className='text-sm font-medium'>{title}</h3>
      <pre className='bg-muted mt-2 max-h-64 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap'>
        {value}
      </pre>
    </section>
  )
}

function EvaluatorFormFields({
  form,
  formId,
  submitLabel,
  scoreConfigs,
  scoreConfigsLoading,
  onCancel,
}: {
  form: UseFormReturn<CreateTaskEvaluatorFormValues>
  formId: string
  submitLabel: string
  scoreConfigs: Pick<ScoreConfigRecord, 'id' | 'name'>[]
  scoreConfigsLoading: boolean
  onCancel: () => void
}) {
  return (
    <>
      <FormField
        control={form.control}
        name='evaluationScenario'
        render={({ field }) => (
          <FormItem>
            <FormLabel>评估场景</FormLabel>
            <Select
              value={field.value}
              onValueChange={(value) => {
                const scenario = value as EvaluationScenario
                field.onChange(scenario)
                applyScenarioPreset(form, scenario)
              }}
            >
              <FormControl>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='选择评估场景' />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectGroup>
                  {evaluationScenarioOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-sm leading-6'>
              {evaluationScenarioDescriptions[field.value]}
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='name'
        render={({ field }) => (
          <FormItem>
            <FormLabel>评估器名称</FormLabel>
            <FormControl>
              <Input placeholder='例如：客服回答质量评估器' {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className='grid gap-4 sm:grid-cols-3'>
        <FormField
          control={form.control}
          name='type'
          render={({ field }) => (
            <FormItem>
              <FormLabel>类型</FormLabel>
              <Select
                value={field.value}
                onValueChange={(nextType) => {
                  field.onChange(nextType)
                  if (nextType === 'LLM_AS_JUDGE' || nextType === 'CODE') {
                    form.setValue('provider', 'LANGFUSE')
                  }
                  if (nextType === 'WORKFLOW') {
                    form.setValue('provider', 'DIFY')
                  }
                  if (nextType === 'SDK') {
                    form.setValue('provider', 'OPENJUDGE')
                  }
                }}
              >
                <FormControl>
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='选择类型' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value='LLM_AS_JUDGE'>LLM-as-Judge</SelectItem>
                    <SelectItem value='CODE'>Code</SelectItem>
                    <SelectItem value='WORKFLOW'>工作流</SelectItem>
                    <SelectItem value='SDK'>SDK</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='provider'
          render={({ field }) => (
            <FormItem>
              <FormLabel>提供方</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='选择提供方' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectGroup>
                    {getProviderOptions(form.watch('type')).map((option) => (
                      <SelectItem key={option} value={option}>
                        {evaluatorProviderLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name='description'
        render={({ field }) => (
          <FormItem>
            <FormLabel>描述</FormLabel>
            <FormControl>
              <Textarea
                placeholder='说明评估维度、适用场景和输出含义'
                className='min-h-24 resize-none'
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {form.watch('type') === 'LLM_AS_JUDGE' ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='modelProvider'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>模型提供方</FormLabel>
                  <FormControl>
                    <Input placeholder='openai' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='model'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>模型名称</FormLabel>
                  <FormControl>
                    <Input placeholder='gpt-4.1' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name='prompt'
            render={({ field }) => (
              <FormItem>
                <div className='flex flex-wrap items-baseline gap-2'>
                  <FormLabel>Prompt</FormLabel>
                  <span className='text-muted-foreground text-xs'>
                    使用 {'{{input}}'}、{'{{output}}'} 等变量编写评估提示词
                  </span>
                </div>
                <FormControl>
                  <MixEditor
                    title='Prompt'
                    value={field.value}
                    onValueChange={(nextValue) =>
                      field.onChange(String(nextValue ?? ''))
                    }
                    forceTextMode
                    defaultEditing
                    showEditActions={false}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='outputMapping'
            render={({ field }) => (
              <FormItem>
                <FormLabel>输出定义 JSON</FormLabel>
                <FormControl>
                  <MixEditor
                    title='请输入JSON'
                    value={field.value}
                    onValueChange={(nextValue) =>
                      field.onChange(stringifyEditorValue(nextValue))
                    }
                    defaultEditing
                    showEditActions={false}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      ) : null}
      {form.watch('type') === 'CODE' ? (
        <>
          <FormField
            control={form.control}
            name='sourceCodeLanguage'
            render={({ field }) => (
              <FormItem>
                <FormLabel>源码语言</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='选择语言' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value='PYTHON'>Python</SelectItem>
                      <SelectItem value='TYPESCRIPT'>TypeScript</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='sourceCode'
            render={({ field }) => (
              <FormItem>
                <FormLabel>源码</FormLabel>
                <FormControl>
                  <Textarea className='min-h-48 font-mono' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      ) : null}
      {form.watch('type') === 'WORKFLOW' ? (
        <WorkflowFields form={form} />
      ) : null}
      {form.watch('type') === 'SDK' ? (
        <>
          <FormField
            control={form.control}
            name='sdkPackage'
            render={({ field }) => (
              <FormItem>
                <FormLabel>SDK 标识</FormLabel>
                <FormControl>
                  <Input placeholder='openjudge' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <WorkflowMappingFields form={form} />
        </>
      ) : null}
      <FormField
        control={form.control}
        name='inputVariables'
        render={({ field }) => (
          <FormItem>
            <FormLabel>输入变量</FormLabel>
            <FormControl>
              <Input
                placeholder='input, output, expected_output'
                {...field}
                onChange={(event) => {
                  field.onChange(event)
                  form.setValue('variables', event.target.value)
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <OutputVariableMappingsField
        form={form}
        scoreConfigs={scoreConfigs}
        loading={scoreConfigsLoading}
      />
      <div className='bg-background sticky bottom-0 -mx-6 mt-2 flex justify-end gap-2 border-t px-6 py-4'>
        <Button type='button' variant='outline' onClick={onCancel}>
          取消
        </Button>
        <Button form={formId} type='submit'>
          {submitLabel}
        </Button>
      </div>
    </>
  )
}

function applyScenarioPreset(
  form: UseFormReturn<CreateTaskEvaluatorFormValues>,
  scenario: EvaluationScenario
) {
  const preset = getScenarioPreset(scenario)
  form.setValue('type', preset.type, { shouldDirty: true, shouldValidate: true })
  form.setValue('provider', preset.provider, {
    shouldDirty: true,
    shouldValidate: true,
  })
  form.setValue('variables', preset.variables, {
    shouldDirty: true,
    shouldValidate: true,
  })
  form.setValue('inputVariables', preset.variables, {
    shouldDirty: true,
    shouldValidate: true,
  })
  form.setValue('inputMapping', JSON.stringify(preset.inputMapping, null, 2), {
    shouldDirty: true,
    shouldValidate: true,
  })
  form.setValue('sdkPackage', preset.sdkPackage, {
    shouldDirty: true,
    shouldValidate: true,
  })
  if (!form.getValues('name').trim()) {
    form.setValue('name', preset.name, { shouldDirty: true })
  }
  if (!form.getValues('description').trim()) {
    form.setValue('description', preset.description, { shouldDirty: true })
  }
}

function getScenarioPreset(scenario: EvaluationScenario): {
  name: string
  description: string
  type: CreateTaskEvaluatorFormValues['type']
  provider: CreateTaskEvaluatorFormValues['provider']
  variables: string
  inputMapping: Record<string, string>
  sdkPackage: string
} {
  if (scenario === 'MULTI_TURN') {
    return {
      name: '多轮对话记忆评估器',
      description: evaluationScenarioDescriptions.MULTI_TURN,
      type: 'SDK',
      provider: 'OPENJUDGE',
      variables: 'history, input, output, context',
      inputMapping: {
        history: '{{ sample.history }}',
        input: '{{ sample.input }}',
        output: '{{ sample.output }}',
        context: '{{ sample.context }}',
      },
      sdkPackage: 'context_memory',
    }
  }

  if (scenario === 'TOOL_CALLING') {
    return {
      name: '工具调用轨迹评估器',
      description: evaluationScenarioDescriptions.TOOL_CALLING,
      type: 'SDK',
      provider: 'OPENJUDGE',
      variables: 'messages, input, output, context',
      inputMapping: {
        messages: '{{ sample.messages }}',
        input: '{{ sample.input }}',
        output: '{{ sample.output }}',
        context: '{{ sample.context }}',
      },
      sdkPackage: 'trajectory_accuracy',
    }
  }

  if (scenario === 'MULTI_TURN_TOOL_CALLING') {
    return {
      name: '多轮工具调用综合评估器',
      description: evaluationScenarioDescriptions.MULTI_TURN_TOOL_CALLING,
      type: 'SDK',
      provider: 'OPENJUDGE',
      variables: 'history, messages, input, output, context',
      inputMapping: {
        history: '{{ sample.history }}',
        messages: '{{ sample.messages }}',
        input: '{{ sample.input }}',
        output: '{{ sample.output }}',
        context: '{{ sample.context }}',
      },
      sdkPackage: 'trajectory_accuracy',
    }
  }

  if (scenario === 'AGENT_SKILL') {
    return {
      name: 'Agent Skill 流程评估器',
      description: evaluationScenarioDescriptions.AGENT_SKILL,
      type: 'WORKFLOW',
      provider: 'N8N',
      variables: 'task, trace, skill, output',
      inputMapping: {
        task: '{{ sample.input }}',
        trace: '{{ sample.metadata }}',
        skill: '{{ sample.context }}',
        output: '{{ sample.output }}',
      },
      sdkPackage: '',
    }
  }

  if (scenario === 'CUSTOM') {
    return {
      name: '自定义评估器',
      description: evaluationScenarioDescriptions.CUSTOM,
      type: 'WORKFLOW',
      provider: 'DIFY',
      variables: 'input, output, expected_output, context',
      inputMapping: {
        input: '{{ sample.input }}',
        output: '{{ sample.output }}',
        expected_output: '{{ sample.expectedOutput }}',
        context: '{{ sample.context }}',
      },
      sdkPackage: '',
    }
  }

  return {
    name:
      scenario === 'RAG_FACTUALITY'
        ? '事实一致性评估器'
        : scenario === 'SAFETY'
          ? '安全合规评估器'
          : '简单回答质量评估器',
    description: evaluationScenarioDescriptions[scenario],
    type: 'SDK',
    provider: 'OPENJUDGE',
    variables: 'input, output, expected_output, context',
    inputMapping: {
      input: '{{ sample.input }}',
      output: '{{ sample.output }}',
      expected_output: '{{ sample.expectedOutput }}',
      context: '{{ sample.context }}',
    },
    sdkPackage:
      scenario === 'RAG_FACTUALITY'
        ? 'hallucination'
        : scenario === 'SAFETY'
          ? 'harmfulness'
          : 'openjudge',
  }
}

function WorkflowFields({
  form,
}: {
  form: UseFormReturn<CreateTaskEvaluatorFormValues>
}) {
  const control = form.control
  return (
    <>
      <FormField
        control={control}
        name='endpointUrl'
        render={({ field }) => (
          <FormItem>
            <FormLabel>工作流地址</FormLabel>
            <FormControl>
              <Input
                placeholder='https://example.com/workflows/run'
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          control={control}
          name='authType'
          render={({ field }) => (
            <FormItem>
              <FormLabel>鉴权方式</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='选择鉴权方式' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value='NONE'>无</SelectItem>
                    <SelectItem value='BEARER'>Bearer Token</SelectItem>
                    <SelectItem value='BASIC'>Basic</SelectItem>
                    <SelectItem value='API_KEY'>API Key</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name='authToken'
          render={({ field }) => (
            <FormItem>
              <FormLabel>鉴权凭据</FormLabel>
              <FormControl>
                <Input type='password' placeholder='可选' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <WorkflowMappingFields form={form} />
    </>
  )
}

function WorkflowMappingFields({
  form,
}: {
  form: UseFormReturn<CreateTaskEvaluatorFormValues>
}) {
  const inputVariables = splitVariablesForView(form.watch('inputVariables'))
  const outputVariables = getOutputVariableNames(form.watch('outputVariableMappings'))
  const inputMapping = parseMappingObjectForView(form.watch('inputMapping'))
  const outputMapping = parseMappingObjectForView(form.watch('outputMapping'))
  const canonicalInputMapping = Object.fromEntries(
    inputVariables.map((variable) => [
      variable,
      toCanonicalMappingTemplate(
        toShortSamplePath(inputMapping[variable], variable)
      ),
    ])
  )
  const canonicalOutputMapping = Object.fromEntries(
    outputVariables.map((variable) => [
      variable,
      readOutputPath(outputMapping[variable], variable),
    ])
  )

  return (
    <div className='space-y-4'>
      <div className='rounded-md border'>
        <div className='grid gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground md:grid-cols-[minmax(140px,180px)_1fr]'>
          <span>输入变量绑定</span>
          <span>样本字段</span>
        </div>
        <div className='divide-y'>
          {inputVariables.map((variable) => {
            const shortPath = toShortSamplePath(inputMapping[variable], variable)
            return (
              <div
                key={variable}
                className='grid gap-2 px-3 py-3 md:grid-cols-[minmax(140px,180px)_1fr] md:items-center'
              >
                <div className='min-w-0'>
                  <div className='truncate text-sm font-medium'>{variable}</div>
                  <div className='text-muted-foreground text-xs'>
                    工作流入参
                  </div>
                </div>
                <div className='grid gap-2 md:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)]'>
                  <Select
                    value={findSampleFieldOption(shortPath)}
                    onValueChange={(value) =>
                      setInputMappingPath(form, variable, value)
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='选择样本字段' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {sampleFieldOptions.map((field) => (
                          <SelectItem key={field} value={field}>
                            {field}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Input
                    value={shortPath}
                    placeholder='例如 input.question'
                    onChange={(event) =>
                      setInputMappingPath(form, variable, event.target.value)
                    }
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className='rounded-md border'>
        <div className='grid gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground md:grid-cols-[minmax(140px,180px)_1fr]'>
          <span>输出结果绑定</span>
          <span>读取路径</span>
        </div>
        <div className='divide-y'>
          {outputVariables.length ? (
            outputVariables.map((variable) => (
              <div
                key={variable}
                className='grid gap-2 px-3 py-3 md:grid-cols-[minmax(140px,180px)_1fr] md:items-center'
              >
                <div className='min-w-0'>
                  <div className='truncate text-sm font-medium'>{variable}</div>
                  <div className='text-muted-foreground text-xs'>
                    工作流出参
                  </div>
                </div>
                <Input
                  value={readOutputPath(outputMapping[variable], variable)}
                  placeholder={`data.outputs.${variable}`}
                  onChange={(event) =>
                    setOutputMappingPath(form, variable, event.target.value)
                  }
                />
              </div>
            ))
          ) : (
            <div className='px-3 py-4 text-sm text-muted-foreground'>
              请先添加输出变量。
            </div>
          )}
        </div>
      </div>

      <div className='rounded-md border bg-muted/20 p-3'>
        <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
          <FormLabel>映射预览</FormLabel>
          <span className='text-muted-foreground text-xs'>
            保存为标准模板，自动评测执行时按该快照复现
          </span>
        </div>
        <pre className='max-h-48 overflow-auto rounded-md bg-background p-3 text-xs leading-5'>
          {JSON.stringify(
            {
              inputMapping: canonicalInputMapping,
              outputMapping: canonicalOutputMapping,
            },
            null,
            2
          )}
        </pre>
      </div>

      <details className='rounded-md border'>
        <summary className='cursor-pointer px-3 py-2 text-sm font-medium'>
          高级 JSON
        </summary>
        <div className='grid gap-4 border-t p-3 sm:grid-cols-2'>
          <FormField
            control={form.control}
            name='inputMapping'
            render={({ field }) => (
              <FormItem>
                <FormLabel>输入映射</FormLabel>
                <FormControl>
                  <Textarea className='min-h-28 font-mono' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='outputMapping'
            render={({ field }) => (
              <FormItem>
                <FormLabel>输出映射</FormLabel>
                <FormControl>
                  <Textarea className='min-h-28 font-mono' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </details>
    </div>
  )
}

function OutputVariableMappingsField({
  form,
  scoreConfigs,
  loading,
}: {
  form: UseFormReturn<CreateTaskEvaluatorFormValues>
  scoreConfigs: Pick<ScoreConfigRecord, 'id' | 'name'>[]
  loading: boolean
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'outputVariableMappings',
  })
  const mappings = form.watch('outputVariableMappings')

  const syncOutputVariables = useCallback(
    (nextMappings: CreateTaskEvaluatorFormValues['outputVariableMappings']) => {
      form.setValue(
        'outputVariables',
        getOutputVariableNames(nextMappings).join(', '),
        { shouldDirty: true, shouldValidate: true }
      )
    },
    [form]
  )

  return (
    <FormItem>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex flex-col gap-1'>
          <FormLabel>输出变量</FormLabel>
          <p className='text-muted-foreground text-sm'>
            维护评估器返回字段，并绑定项目设置中的评分指标。
          </p>
        </div>
        <div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              append({
                variableName: '',
                scoreConfigId: '',
                scoreConfigName: '',
              })
            }
          >
            <Plus data-icon='inline-start' />
            添加输出变量
          </Button>
        </div>
      </div>
      <div className='overflow-hidden rounded-md border'>
        <div className='bg-muted/40 text-muted-foreground hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.25rem] gap-2 px-3 py-2 text-xs font-medium md:grid'>
          <span>变量名</span>
          <span>评分指标</span>
          <span className='sr-only'>操作</span>
        </div>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className='grid gap-2 border-t p-2 first:border-t-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.25rem] md:items-start md:px-3'
          >
            <FormField
              control={form.control}
              name={`outputVariableMappings.${index}.variableName`}
              render={({ field: variableField }) => (
                <FormItem className='gap-1'>
                  <FormLabel className='text-xs md:sr-only'>变量名</FormLabel>
                  <FormControl>
                    <Input
                      className='h-8'
                      placeholder='请输入变量名'
                      {...variableField}
                      onChange={(event) => {
                        variableField.onChange(event)
                        const nextMappings = [...mappings]
                        nextMappings[index] = {
                          ...nextMappings[index],
                          variableName: event.target.value,
                        }
                        syncOutputVariables(nextMappings)
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`outputVariableMappings.${index}.scoreConfigId`}
              render={({ field: scoreConfigField }) => (
                <FormItem className='gap-1'>
                  <FormLabel className='text-xs md:sr-only'>
                    评分指标
                  </FormLabel>
                  <Select
                    value={
                      scoreConfigField.value ||
                      scoreConfigs.find(
                        (item) =>
                          item.name === mappings[index]?.scoreConfigName
                      )?.id ||
                      undefined
                    }
                    onValueChange={(scoreConfigId) => {
                      const scoreConfig = scoreConfigs.find(
                        (item) => item.id === scoreConfigId
                      )
                      scoreConfigField.onChange(scoreConfigId)
                      form.setValue(
                        `outputVariableMappings.${index}.scoreConfigName`,
                        scoreConfig?.name ?? '',
                        { shouldDirty: true, shouldValidate: true }
                      )
                    }}
                    disabled={loading || scoreConfigs.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger className='h-8 w-full'>
                        <SelectValue
                          placeholder={
                            loading ? '加载指标中...' : '选择评分指标'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        {scoreConfigs.map((scoreConfig) => (
                          <SelectItem
                            key={scoreConfig.id}
                            value={scoreConfig.id}
                          >
                            {scoreConfig.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label='删除输出变量'
              className='self-end md:self-start'
              disabled={fields.length <= 1}
              onClick={() => {
                const nextMappings = mappings.filter(
                  (_, itemIndex) => itemIndex !== index
                )
                remove(index)
                syncOutputVariables(nextMappings)
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      {scoreConfigs.length === 0 && !loading ? (
        <p className='text-muted-foreground mt-2 text-sm'>
          暂无可用评分指标，请先在项目设置中配置 score config。
        </p>
      ) : null}
    </FormItem>
  )
}

function getProviderOptions(type: CreateTaskEvaluatorFormValues['type']) {
  if (type === 'WORKFLOW') {
    return ['DIFY', 'HIAGENT', 'N8N'] as const
  }
  if (type === 'SDK') {
    return ['OPENJUDGE'] as const
  }
  return ['LANGFUSE'] as const
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2)
}

function getOutputVariableNames(
  mappings: CreateTaskEvaluatorFormValues['outputVariableMappings']
) {
  return mappings.map((mapping) => mapping.variableName.trim()).filter(Boolean)
}

function splitVariablesForView(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseMappingObjectForView(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function setInputMappingPath(
  form: UseFormReturn<CreateTaskEvaluatorFormValues>,
  variable: string,
  path: string
) {
  const mapping = parseMappingObjectForView(form.getValues('inputMapping'))
  mapping[variable] = toCanonicalMappingTemplate(path)
  form.setValue('inputMapping', JSON.stringify(mapping, null, 2), {
    shouldDirty: true,
    shouldValidate: true,
  })
}

function setOutputMappingPath(
  form: UseFormReturn<CreateTaskEvaluatorFormValues>,
  variable: string,
  path: string
) {
  const mapping = parseMappingObjectForView(form.getValues('outputMapping'))
  mapping[variable] = path.trim()
  form.setValue('outputMapping', JSON.stringify(mapping, null, 2), {
    shouldDirty: true,
    shouldValidate: true,
  })
}

function toCanonicalMappingTemplate(path: string) {
  const normalized = normalizeSamplePathForView(path)
  return normalized ? `{{ ${normalized} }}` : ''
}

function toShortSamplePath(value: unknown, fallbackVariable: string) {
  const rawValue = typeof value === 'string' ? value : fallbackVariable
  const trimmed = rawValue.trim()
  const expression = trimmed
    .replace(/^\{\{\s*/, '')
    .replace(/\s*\}\}$/, '')
    .replace(/^\{\s*/, '')
    .replace(/\s*\}$/, '')
    .trim()
  const normalized = normalizeSamplePathForView(expression || fallbackVariable)
  return normalized.replace(/^sample\./, '')
}

function normalizeSamplePathForView(value: string) {
  const path = value.trim().replace(/^\.+|\.+$/g, '')
  const samplePath = path.startsWith('sample.') ? path.slice(7) : path
  const parts = samplePath.split('.').filter(Boolean)
  if (!parts.length) return ''

  const root = sampleRootAliases[parts[0].replace(/-/g, '_').toLowerCase()]
  if (!root) return samplePath

  return ['sample', root, ...parts.slice(1)].join('.')
}

function findSampleFieldOption(value: string) {
  return sampleFieldOptions.includes(value) ? value : undefined
}

function readOutputPath(value: unknown, fallbackVariable: string) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : `data.outputs.${fallbackVariable}`
}

const sampleRootAliases: Record<string, string> = {
  input: 'input',
  output: 'output',
  expectedoutput: 'expectedOutput',
  expected_output: 'expectedOutput',
  context: 'context',
  metadata: 'metadata',
  trace: 'trace',
  observation: 'observation',
  datasetitem: 'datasetItem',
  dataset_item: 'datasetItem',
}
