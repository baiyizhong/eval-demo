import {
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
  useId,
  useState,
} from 'react'
import { z } from 'zod'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Pencil,
  Plus,
  Settings,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { BaseForm } from '@/components/common/base-form'
import {
  FormDialog,
  type FormDialogProps,
} from '@/components/common/form-dialog'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  AppCardList,
  type AppCardTag,
  type AppCardListItem,
} from '@/components/business/app-card-list'

const appListAddFormSchema = z.object({
  name: z.string().min(1, '请输入项目名称'),
  status: z.enum(['active', 'archived']),
  desc: z.string().min(1, '请输入项目描述'),
})

type AppListAddFormValues = z.infer<typeof appListAddFormSchema>

type AppListAddDialogContext = {
  close: () => void
}

type AppListAddDialogContent =
  | ReactNode
  | ((context: AppListAddDialogContext) => ReactNode)

type AppListAddDialogProps = Omit<
  FormDialogProps,
  'open' | 'onOpenChange' | 'title' | 'description' | 'children'
>

type AppListProps = {
  apps: AppCardListItem[]
  onActionClick?: (
    app: AppCardListItem,
    event: MouseEvent<HTMLButtonElement>
  ) => void
  onEditClick?: (
    app: AppCardListItem,
    event: MouseEvent<HTMLButtonElement>
  ) => void
  onDeleteClick?: (
    app: AppCardListItem,
    event: MouseEvent<HTMLButtonElement>
  ) => void
  onSettingsClick?: (
    app: AppCardListItem,
    event: MouseEvent<HTMLButtonElement>
  ) => void
  getTags?: (app: AppCardListItem) => AppCardTag[]
  getCreatedAt?: (app: AppCardListItem) => ReactNode
  onCardClick?: (app: AppCardListItem, event: MouseEvent<HTMLLIElement>) => void
  onAddClick?: (event: MouseEvent<HTMLButtonElement>) => void
  onAddSubmit?: (values: AppListAddFormValues) => void | Promise<void>
  addDialogTitle?: ReactNode
  addDialogDescription?: ReactNode
  addDialogContent?: AppListAddDialogContent
  addDialogProps?: AppListAddDialogProps
}

type AppStatusFilter = 'all' | AppCardListItem['status']

type AppListToolbarProps = {
  searchTerm: string
  appStatus: AppStatusFilter
  sort: 'asc' | 'desc'
  onSearch: (event: ChangeEvent<HTMLInputElement>) => void
  onStatusChange: (value: AppStatusFilter) => void
  onSortChange: (value: 'asc' | 'desc') => void
  onAddClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

const appStatusText = new Map<AppStatusFilter, string>([
  ['all', '全部应用'],
  ['archived', '已归档'],
  ['active', '未归档'],
])

const appStatusTags = new Map<AppCardListItem['status'], AppCardTag>([
  ['archived', { label: '已归档', variant: 'outline' }],
  ['active', { label: '未归档', variant: 'secondary' }],
])

const getDefaultTags = (app: AppCardListItem) => {
  const statusTag = appStatusTags.get(app.status)
  return statusTag ? [statusTag] : []
}

function AppListToolbar({
  searchTerm,
  appStatus,
  sort,
  onSearch,
  onStatusChange,
  onSortChange,
  onAddClick,
}: AppListToolbarProps) {
  return (
    <div className='my-4 flex items-end justify-between sm:my-0 sm:items-center'>
      <div className='flex flex-col gap-4 sm:my-4 sm:flex-row'>
        <Input
          placeholder='筛选应用...'
          className='h-9 w-40 lg:w-[250px]'
          value={searchTerm}
          onChange={onSearch}
        />
        <Select value={appStatus} onValueChange={onStatusChange}>
          <SelectTrigger className='w-36'>
            <SelectValue>{appStatusText.get(appStatus)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value='all'>全部应用</SelectItem>
              <SelectItem value='archived'>已归档</SelectItem>
              <SelectItem value='active'>未归档</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger className='w-16'>
            <SelectValue>
              <SlidersHorizontal size={18} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent align='end'>
            <SelectGroup>
              <SelectItem value='asc'>
                <div className='flex items-center gap-4'>
                  <ArrowUpAZ size={16} />
                  <span>升序</span>
                </div>
              </SelectItem>
              <SelectItem value='desc'>
                <div className='flex items-center gap-4'>
                  <ArrowDownAZ size={16} />
                  <span>降序</span>
                </div>
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className='flex items-center gap-2'>
        <Button type='button' size='sm' onClick={onAddClick}>
          <Plus size={16} />
          新增项目
        </Button>
      </div>
    </div>
  )
}

type AppListAddFormProps = {
  id: string
  onSubmit: (values: AppListAddFormValues) => void | Promise<void>
}

function AppListAddForm({ id, onSubmit }: AppListAddFormProps) {
  return (
    <BaseForm
      id={id}
      schema={appListAddFormSchema}
      defaultValues={{
        name: '',
        status: 'active',
        desc: '',
      }}
      onSubmit={onSubmit}
      className='gap-4 overflow-visible p-0'
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>项目名称</FormLabel>
                <FormControl>
                  <Input placeholder='输入项目名称' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='status'
            render={({ field }) => (
              <FormItem>
                <FormLabel>项目状态</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='选择项目状态' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value='active'>未归档</SelectItem>
                      <SelectItem value='archived'>已归档</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='desc'
            render={({ field }) => (
              <FormItem>
                <FormLabel>项目描述</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder='输入项目描述'
                    className='min-h-24 resize-none'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </BaseForm>
  )
}

export function AppList({
  apps,
  onActionClick,
  onEditClick,
  onDeleteClick,
  onSettingsClick,
  getTags,
  getCreatedAt,
  onCardClick,
  onAddClick,
  onAddSubmit,
  addDialogTitle = '新增项目',
  addDialogDescription,
  addDialogContent,
  addDialogProps,
}: AppListProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const addFormId = useId()

  const filter = searchParams.get('filter') || ''
  const status = (searchParams.get('status') as AppStatusFilter | null) || 'all'
  const initSort = (searchParams.get('sort') as 'asc' | 'desc') || 'asc'

  const [sort, setSort] = useState(initSort)
  const [appStatus, setAppStatus] = useState(status)
  const [searchTerm, setSearchTerm] = useState(filter)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const filteredApps = [...apps]
    .sort((a, b) =>
      sort === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    )
    .filter((app) => (appStatus === 'all' ? true : app.status === appStatus))
    .filter((app) => app.name.toLowerCase().includes(searchTerm.toLowerCase()))

  const updateSearchParams = (key: string, value: string | undefined) => {
    const newParams = new URLSearchParams(searchParams.toString())
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
    setSearchParams(newParams)
  }

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
    updateSearchParams('filter', e.target.value || undefined)
  }

  const handleStatusChange = (value: AppStatusFilter) => {
    setAppStatus(value)
    updateSearchParams('status', value === 'all' ? undefined : value)
  }

  const handleSortChange = (value: 'asc' | 'desc') => {
    setSort(value)
    updateSearchParams('sort', value)
  }

  const handleAddClick = (event: MouseEvent<HTMLButtonElement>) => {
    onAddClick?.(event)

    if (!event.defaultPrevented) {
      setAddDialogOpen(true)
    }
  }

  const closeAddDialog = () => {
    setAddDialogOpen(false)
  }

  const handleAddSubmit = async (values: AppListAddFormValues) => {
    await onAddSubmit?.(values)
    closeAddDialog()
  }

  const addDialogChildren =
    typeof addDialogContent === 'function'
      ? addDialogContent({ close: closeAddDialog })
      : (addDialogContent ?? (
          <AppListAddForm id={addFormId} onSubmit={handleAddSubmit} />
        ))
  const defaultAddConfirmProps =
    addDialogContent === undefined
      ? ({ form: addFormId, type: 'submit' } as const)
      : undefined
  const addConfirmProps =
    defaultAddConfirmProps || addDialogProps?.confirmProps
      ? {
          ...defaultAddConfirmProps,
          ...addDialogProps?.confirmProps,
        }
      : undefined

  return (
    <>
      <AppListToolbar
        searchTerm={searchTerm}
        appStatus={appStatus}
        sort={sort}
        onSearch={handleSearch}
        onStatusChange={handleStatusChange}
        onSortChange={handleSortChange}
        onAddClick={handleAddClick}
      />
      <Separator className='shadow-sm' />
      <AppCardList
        apps={filteredApps}
        actionButton={{
          label: '立刻进入',
          onClick: onActionClick,
        }}
        iconActions={[
          {
            icon: <Pencil data-icon='inline-start' />,
            ariaLabel: '编辑应用',
            onClick: onEditClick,
          },
          {
            icon: <Trash2 data-icon='inline-start' />,
            ariaLabel: '删除应用',
            onClick: onDeleteClick,
          },
          {
            icon: <Settings data-icon='inline-start' />,
            ariaLabel: '设置应用',
            onClick: onSettingsClick,
          },
        ]}
        getTags={(app) => getTags?.(app) ?? getDefaultTags(app)}
        getCreatedAt={getCreatedAt}
        onCardClick={onCardClick}
      />
      <FormDialog
        {...addDialogProps}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        title={addDialogTitle}
        description={addDialogDescription}
        confirmText={addDialogProps?.confirmText ?? '创建'}
        confirmProps={addConfirmProps}
      >
        {addDialogChildren}
      </FormDialog>
    </>
  )
}

export type { AppListAddFormValues }
