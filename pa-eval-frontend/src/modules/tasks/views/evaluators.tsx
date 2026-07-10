import { useCallback, useMemo, useState } from 'react'
import { z } from 'zod'
import type { Control } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { EvaluationPageNav } from '@/modules/app-evaluation/components/evaluation-page-nav'
import { Eye, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
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
import { BaseDetail } from '@/components/common/base-detail'
import { BaseForm } from '@/components/common/base-form'
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/common/data-table'
import { Drawer } from '@/components/common/drawer'
import { Loading } from '@/components/common/loading'
import { LongText } from '@/components/common/long-text'
import { MixEditor } from '@/components/common/MixEditor'
import { Page } from '@/components/common/page'
import {
  createTaskEvaluator,
  deleteTaskEvaluator,
  getTaskEvaluator,
  listTaskEvaluators,
  type CreateTaskEvaluatorFormValues,
  type TaskEvaluatorDetail,
  type TaskEvaluatorRecord,
} from '../api/evaluator-api'
import { TasksPageHeader } from '../components/tasks-page-header'

const createEvaluatorFormId = 'create-evaluator-form'

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
    projectId: z.string().min(1, '请选择所属项目'),
    description: z.string().min(1, '请输入评估器描述'),
    variables: z.string().min(1, '请输入变量名，多个变量用逗号分隔'),
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
const projectsQueryKey = ['evaluator-project-options'] as const

type ProjectOption = {
  id: string
  name: string
  organizationName: string
}

type PaginatedResult<T> = {
  total: number
  datas: T[]
}

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
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedEvaluator, setSelectedEvaluator] =
    useState<TaskEvaluatorDetail | null>(null)
  const [deletingEvaluator, setDeletingEvaluator] =
    useState<TaskEvaluatorRecord | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const projectsQuery = useQuery({
    queryKey: [...projectsQueryKey, $api],
    queryFn: () =>
      $api.getProjects<PaginatedResult<ProjectOption>>({
        query: {
          page: 1,
          pageSize: 200,
        },
      }),
  })

  const handleViewDetail = useCallback(
    async (evaluator: TaskEvaluatorRecord) => {
      setDetailOpen(true)
      setDetailLoading(true)
      try {
        const detail = await getTaskEvaluator($api, evaluator.id)
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
    [$api]
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
        onDelete: canEditEvaluators ? setDeletingEvaluator : undefined,
      }),
    [canEditEvaluators, handleViewDetail]
  )

  const handleCreate = async (values: CreateTaskEvaluatorFormValues) => {
    if (!canEditEvaluators) return

    try {
      await createTaskEvaluator($api, values)
      await queryClient.invalidateQueries({ queryKey: evaluatorQueryKey })
      setCreateOpen(false)
      toast.success(`已创建评估器：${values.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建评估器失败')
    }
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        {navigation === 'project-evaluation' ? (
          <EvaluationPageNav
            buttonGroups={{
              buttons: [
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
              queryKey: (state) => [...evaluatorQueryKey, $api, state],
              queryFn: (state) => listTaskEvaluators($api, state),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
            }}
            toolbar={{
              searchPlaceholder: '搜索评估器名称、描述或类型',
              columnLabels: {
                name: '评估器名称',
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
            projectId: '',
            description: '',
            variables: 'input, output',
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
            <>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>评估器名称</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='例如：客服回答质量评估器'
                        {...field}
                      />
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
                          if (
                            nextType === 'LLM_AS_JUDGE' ||
                            nextType === 'CODE'
                          ) {
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
                            <SelectItem value='LLM_AS_JUDGE'>
                              LLM-as-Judge
                            </SelectItem>
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
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='选择提供方' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectGroup>
                            {getProviderOptions(form.watch('type')).map(
                              (option) => (
                                <SelectItem key={option} value={option}>
                                  {evaluatorProviderLabels[option]}
                                </SelectItem>
                              )
                            )}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='projectId'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>所属项目</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='选择项目' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectGroup>
                            {(projectsQuery.data?.datas ?? []).map(
                              (project) => (
                                <SelectItem key={project.id} value={project.id}>
                                  {project.name}
                                </SelectItem>
                              )
                            )}
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
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className='w-full'>
                              <SelectValue placeholder='选择语言' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value='PYTHON'>Python</SelectItem>
                              <SelectItem value='TYPESCRIPT'>
                                TypeScript
                              </SelectItem>
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
                <WorkflowFields control={form.control} />
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
                  <MappingFields control={form.control} />
                </>
              ) : null}
              <FormField
                control={form.control}
                name='variables'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>变量</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='input, output, expected_output'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className='bg-background sticky bottom-0 -mx-6 mt-2 flex justify-end gap-2 border-t px-6 py-4'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setCreateOpen(false)}
                >
                  取消
                </Button>
                <Button form={createEvaluatorFormId} type='submit'>
                  创建
                </Button>
              </div>
            </>
          )}
        </BaseForm>
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
  onDelete,
}: {
  onViewDetail: (evaluator: TaskEvaluatorRecord) => void
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
        const canDelete = evaluator.provider !== 'LANGFUSE'

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
                {onDelete ? (
                  <DropdownMenuItem
                    disabled={!canDelete}
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
  const variables = evaluator.variables.length
    ? evaluator.variables.join(', ')
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
          { label: '变量', value: variables, span: 'full' },
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

function WorkflowFields({
  control,
}: {
  control: Control<CreateTaskEvaluatorFormValues>
}) {
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
      <MappingFields control={control} />
    </>
  )
}

function MappingFields({
  control,
}: {
  control: Control<CreateTaskEvaluatorFormValues>
}) {
  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      <FormField
        control={control}
        name='inputMapping'
        render={({ field }) => (
          <FormItem>
            <FormLabel>输入映射 JSON</FormLabel>
            <FormControl>
              <Textarea className='min-h-28 font-mono' {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name='outputMapping'
        render={({ field }) => (
          <FormItem>
            <FormLabel>输出映射 JSON</FormLabel>
            <FormControl>
              <Textarea className='min-h-28 font-mono' {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
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
