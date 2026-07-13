import { type ColumnDef } from '@tanstack/react-table'
import {
  DataTable,
  DataTableProvider,
  type DataTableListResponse,
  type DataTableQueryState,
  useDataTableContext,
} from './index'

type ExampleRow = {
  id: string
  name: string
  status: string
}

type ExampleAction = 'update' | 'delete'

type ExampleContext = {
  permissions: {
    update: boolean
    delete: boolean
  }
}

const columns: ColumnDef<ExampleRow>[] = [
  {
    accessorKey: 'name',
    header: '名称',
  },
]

const dynamicColumns = (rows: ExampleRow[]): ColumnDef<ExampleRow>[] => [
  ...columns,
  ...rows.map((row) => ({
    id: `status-${row.status}`,
    header: row.status,
    cell: () => row.status,
  })),
]

function ExampleActions() {
  const { setOpen, setCurrentRow, context } = useDataTableContext<
    ExampleRow,
    ExampleAction,
    ExampleContext
  >()

  if (!context.permissions.update) {
    return null
  }

  return (
    <button
      type='button'
      onClick={() => {
        setCurrentRow({ id: '1', name: '示例', status: 'enabled' })
        setOpen('update')
      }}
    >
      更新
    </button>
  )
}

export function DataTableTypeUsage() {
  return (
    <DataTableProvider<ExampleRow, ExampleAction, ExampleContext>
      context={{
        permissions: {
          update: true,
          delete: true,
        },
      }}
    >
      <DataTable<ExampleRow, DataTableListResponse<ExampleRow>, ExampleAction>
        columns={columns}
        request={{
          queryKey: (state: DataTableQueryState) => ['examples', state],
          queryFn: async (state) => ({
            total: state.pageSize,
            datas: [
              {
                id: String(state.page),
                name: state.keyword,
                status: 'enabled',
              },
            ],
          }),
        }}
        filterPanel={{
          advanceFilterCollapsed: false,
          groups: [
            {
              id: 'basic',
              label: '基础筛选',
              fields: [
                {
                  id: 'status',
                  label: '状态',
                  type: 'checkbox',
                  options: [{ label: '启用', value: 'enabled' }],
                },
              ],
            },
          ],
        }}
        toolbar={{
          columnLabels: {
            name: '名称',
          },
        }}
        bulkActions={() => <ExampleActions />}
      />
      <DataTable<ExampleRow>
        columns={dynamicColumns}
        request={{
          queryKey: ['dynamic-examples'],
          queryFn: async () => ({
            total: 1,
            datas: [{ id: '1', name: '示例', status: 'enabled' }],
          }),
        }}
      />
    </DataTableProvider>
  )
}
