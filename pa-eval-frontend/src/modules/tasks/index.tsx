import { useMemo, useState } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { showSubmittedData } from '@/lib/show-submitted-data'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { BaseDetail } from '@/components/common/base-detail'
import { BaseForm } from '@/components/common/base-form'
import { Drawer } from '@/components/common/drawer'
import {
  FilterPanel,
  type FilterGroup,
  type FilterValues,
} from '@/components/common/filter-panel'
import { ImportDialog } from '@/components/common/import-dialog'
import { MixEditor } from '@/components/common/MixEditor'
import { Page } from '@/components/common/page'
import { TasksPageHeader } from './components/tasks-page-header'

const createTaskFormId = 'create-task-demo-form'

const createTaskSchema = z.object({
  title: z.string().min(1, '请输入任务标题'),
})

type CreateTaskForm = z.infer<typeof createTaskSchema>

const initialMarkdownExample = `# 评测任务说明

- 任务目标：验证模型回答是否符合预期
- 评测方式：自动评分 + 人工复核
- 输出结果：生成评测报告`

const initialJsonExample = {
  taskId: 'task-demo-001',
  model: 'gpt-5-mini',
  scoring: {
    passScore: 80,
    dimensions: ['准确性', '完整性', '安全性'],
  },
}

const demoTaskDetail = {
  title: '回答质量评测任务',
  status: '评测中',
  priority: '高',
  model: 'gpt-5-mini',
  scoreRange: '80-100 分',
  createdAt: '2026-07-01 10:30',
}

export function Tasks() {
  const [filters, setFilters] = useState<FilterValues>({
    keyword: '',
    status: [],
    priority: [],
    scoreRange: [0, 100],
    createdAt: [],
  })
  const [filterCollapsed, setFilterCollapsed] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [markdownExample, setMarkdownExample] = useState(initialMarkdownExample)
  const [jsonExample, setJsonExample] = useState<unknown>(initialJsonExample)

  const handleCreateTaskSubmit = (data: CreateTaskForm) => {
    showSubmittedData(data)
    setCreateDrawerOpen(false)
  }

  const handleGlobalConfirmExample = async () => {
    const confirmed = await confirm({
      title: '确认提交评测任务',
      desc: '全局确认弹窗示例：确认后将展示成功提示。',
      confirmText: '确认提交',
    })

    if (!confirmed) {
      return
    }

    toast.success('已确认提交评测任务')
  }

  const filterGroups = useMemo<FilterGroup[]>(
    () => [
      {
        id: 'basic',
        label: '基础筛选',
        defaultOpen: true,
        fields: [
          {
            id: 'keyword',
            label: '任务名称',
            type: 'input',
            placeholder: '输入任务名称',
          },
          {
            id: 'status',
            label: '任务状态',
            type: 'checkbox',
            options: [
              { label: '待处理', value: 'pending' },
              { label: '评测中', value: 'running' },
              { label: '已完成', value: 'completed' },
              { label: '失败', value: 'failed' },
            ],
          },
        ],
      },
      {
        id: 'advanced',
        label: '高级筛选',
        fields: [
          {
            id: 'priority',
            label: '优先级',
            type: 'tags',
            options: [
              { label: '高', value: 'high' },
              { label: '中', value: 'medium' },
              { label: '低', value: 'low' },
            ],
          },
          {
            id: 'scoreRange',
            label: '评分区间',
            type: 'range',
            min: 0,
            max: 100,
            step: 5,
            defaultValue: [0, 100],
            formatValue: (value) => `${value}分`,
          },
          {
            id: 'createdAt',
            label: '创建日期',
            type: 'dateRange',
            placeholder: '选择创建日期',
          },
        ],
      },
    ],
    []
  )

  return (
    <Page>
      <div className='flex flex-col gap-4'>
        <TasksPageHeader
          onImportClick={() => setImportDialogOpen(true)}
          onCreateClick={() => setCreateDrawerOpen(true)}
        />
        <section className='flex gap-4 border bg-white p-4'>
          <FilterPanel
            groups={filterGroups}
            value={filters}
            onChange={setFilters}
            collapsed={filterCollapsed}
            className='shrink-0'
          />

          <div className='flex min-w-0 flex-1 flex-col gap-4'>
            <div>
              <Button
                type='button'
                variant='outline'
                onClick={() => setFilterCollapsed((collapsed) => !collapsed)}
              >
                {filterCollapsed ? '展开筛选' : '折叠筛选'}
              </Button>
            </div>

            <div>
              <Button type='button' onClick={handleGlobalConfirmExample}>
                全局确认弹窗示例
              </Button>
            </div>

            <div>
              <Button
                type='button'
                variant='outline'
                onClick={() => setDetailDrawerOpen(true)}
              >
                详情抽屉示例
              </Button>
            </div>

            <div className='flex max-w-3xl flex-col gap-3'>
              <h1 className='text-2xl font-semibold tracking-tight'>
                评测任务管理
              </h1>
              <p className='text-muted-foreground text-sm leading-6'>
                当前页面保留任务模块的导航与说明入口，用于承载后续自动评测、报告查看和任务编排能力。
              </p>
              <p className='text-muted-foreground text-sm leading-6'>
                当前导入弹窗仅作为通用组件接入示例；任务表格、新建、编辑和批量操作能力后续可按业务接口和权限模型重新接入。
              </p>
            </div>

            <div className='grid gap-4 xl:grid-cols-2'>
              <MixEditor
                title='Markdown 最小示例'
                value={markdownExample}
                onValueChange={(nextValue) =>
                  setMarkdownExample(String(nextValue ?? ''))
                }
              />
              <MixEditor
                title='JSON 最小示例'
                value={jsonExample}
                onValueChange={(nextValue) => setJsonExample(nextValue)}
              />
            </div>
          </div>
        </section>
      </div>
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        title='导入评测任务'
        description='请选择 CSV 文件导入评测任务。'
        fileTypes={['text/csv', '.csv']}
        onImport={(file) => {
          toast.success(`已选择导入文件：${file.name}`)
        }}
      />
      <Drawer
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
        title='创建评测任务'
        confirmText='提交'
        confirmProps={{ form: createTaskFormId, type: 'submit' }}
      >
        <BaseForm
          id={createTaskFormId}
          schema={createTaskSchema}
          defaultValues={{ title: '' }}
          onSubmit={handleCreateTaskSubmit}
        >
          {(form) => (
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>任务标题</FormLabel>
                  <FormControl>
                    <Input placeholder='输入任务标题' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </BaseForm>
      </Drawer>
      <Drawer
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        title='任务详情'
        mode='enhanced'
        showConfirm={false}
        cancelText='关闭'
      >
        <BaseDetail
          columns={2}
          items={[
            { label: '任务标题', value: demoTaskDetail.title },
            {
              label: '状态',
              value: <Badge variant='secondary'>{demoTaskDetail.status}</Badge>,
            },
            { label: '优先级', value: demoTaskDetail.priority },
            { label: '模型', value: demoTaskDetail.model },
            { label: '评分区间', value: demoTaskDetail.scoreRange },
            { label: '创建时间', value: demoTaskDetail.createdAt },
            {
              key: 'scoring',
              span: 'full',
              render: (
                <div className='flex flex-col gap-2 rounded-md border p-3'>
                  <div className='text-sm font-medium'>评分维度</div>
                  <div className='flex flex-wrap gap-2'>
                    {initialJsonExample.scoring.dimensions.map((dimension) => (
                      <Badge key={dimension} variant='outline'>
                        {dimension}
                      </Badge>
                    ))}
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Drawer>
    </Page>
  )
}
