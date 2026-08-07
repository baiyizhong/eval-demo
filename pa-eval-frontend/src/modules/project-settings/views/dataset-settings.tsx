import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createProjectDatasetDirectory,
  deleteProjectDatasetDirectory,
  listProjectDatasetDirectories,
  updateProjectDatasetDirectory,
  updateProjectDatasetDirectoryOrder,
} from '@/modules/app-evaluation/api/dataset-api'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ContentSection } from '@/components/common/content-section'
import { Loading } from '@/components/common/loading'
import { TreeView, type TreeViewMoveInput } from '@/components/common/tree-view'

const DEFAULT_PROJECT_ID = 'project_customer_agent'

type DirectoryTreeNode = {
  id: string
  parentId: string | null
  name: string
  kind: 'folder'
  order: number
}

export function ProjectDatasetSettings() {
  const { projectId = DEFAULT_PROJECT_ID } = useParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEdit = can('project:dataset:edit')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const queryKey = ['project-dataset-directories', $api, projectId]

  const directoriesQuery = useQuery({
    queryKey,
    queryFn: () => listProjectDatasetDirectories($api, projectId),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['project-dataset-directories'] })

  const createMutation = useMutation({
    mutationFn: (parentId: string | null) =>
      createProjectDatasetDirectory($api, projectId, {
        name: '未命名目录',
        parentId,
      }),
    onSuccess: async (directory, parentId) => {
      await invalidate()
      if (parentId) {
        setExpandedIds((current) =>
          current.includes(parentId) ? current : [...current, parentId]
        )
      }
      setEditingId(directory.id)
      toast.success('目录已创建')
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateProjectDatasetDirectory($api, projectId, id, { name }),
    onSuccess: async () => {
      await invalidate()
      toast.success('目录已保存')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteProjectDatasetDirectory($api, projectId, id),
    onSuccess: async (_, id) => {
      await invalidate()
      setExpandedIds((current) => current.filter((itemId) => itemId !== id))
      toast.success('目录已删除，数据集已移动到根目录')
    },
  })

  const orderMutation = useMutation({
    mutationFn: (moves: TreeViewMoveInput[]) =>
      updateProjectDatasetDirectoryOrder($api, projectId, moves),
    onSuccess: async () => {
      await invalidate()
      toast.success('目录顺序已保存')
    },
  })

  const nodes = useMemo<DirectoryTreeNode[]>(
    () =>
      (directoriesQuery.data ?? []).map((directory) => ({
        id: directory.id,
        parentId: directory.parentId,
        name: directory.name,
        kind: 'folder' as const,
        order: directory.order,
      })),
    [directoriesQuery.data]
  )

  return (
    <ContentSection title='数据设置' desc='维护当前项目的数据配置。'>
      <Tabs defaultValue='datasets' className='gap-4'>
        <TabsList className='h-10 w-full max-w-xl justify-start rounded-none border-b bg-transparent p-0'>
          <TabsTrigger
            className='text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none'
            value='datasets'
          >
            数据集目录树
          </TabsTrigger>
        </TabsList>
        <TabsContent value='datasets'>
          {directoriesQuery.isLoading ? (
            <Loading text='加载数据集目录中...' className='min-h-40' />
          ) : (
            <div className='bg-background w-full max-w-xl rounded-md border p-3'>
              <TreeView
                nodes={nodes}
                expandedIds={expandedIds}
                searchable
                editable={canEdit}
                draggable={canEdit}
                createLabel={canEdit ? '新建目录' : undefined}
                createIconOnly
                editingId={editingId}
                onEditingIdChange={setEditingId}
                onExpandedIdsChange={setExpandedIds}
                selectableKinds={[]}
                onCreate={() => {
                  if (!canEdit) return
                  void createMutation.mutateAsync(null)
                }}
                onRename={async (node, name) => {
                  if (!canEdit) return
                  await renameMutation.mutateAsync({ id: node.id, name })
                }}
                onMove={async (moves) => {
                  if (!canEdit) return
                  await orderMutation.mutateAsync(moves)
                }}
                canDrag={() => true}
                canDrop={() => true}
                renderActions={(node) =>
                  canEdit ? (
                    <>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='size-7'
                        title='新建子目录'
                        aria-label='新建子目录'
                        onClick={(event) => {
                          event.stopPropagation()
                          setExpandedIds((current) =>
                            current.includes(node.id)
                              ? current
                              : [...current, node.id]
                          )
                          void createMutation.mutateAsync(node.id)
                        }}
                      >
                        <Plus className='size-4' />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='size-7'
                        title='重命名目录'
                        aria-label='重命名目录'
                        onClick={(event) => {
                          event.stopPropagation()
                          setEditingId(node.id)
                        }}
                      >
                        <Edit2 className='size-4' />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='size-7'
                        title='删除目录'
                        aria-label='删除目录'
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleDeleteDirectory(node)
                        }}
                      >
                        <Trash2 className='size-4' />
                      </Button>
                    </>
                  ) : null
                }
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ContentSection>
  )

  async function handleDeleteDirectory(directory: {
    id: string
    name: string
  }) {
    if (
      await confirm({
        title: '删除目录',
        desc: `确定删除目录「${directory.name}」及其子目录吗？目录下的数据集会移动到根目录。`,
        confirmText: '删除',
        destructive: true,
      })
    ) {
      await deleteMutation.mutateAsync(directory.id)
    }
  }
}
