import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { DataTable } from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import {
  deleteProjectScene,
  listProjectScenes,
  patchProjectScene,
  saveProjectScene,
} from '../api/scene-experiment-api'
import {
  getSceneCollectionQueryKeys,
  getSceneQueryKeys,
} from '../lib/scene-management'
import type { SceneFormInput, SceneRecord } from '../types'
import { createSceneColumns } from './scene-columns'
import { SceneFormDrawer } from './scene-form-drawer'

type SceneManagementTableProps = {
  projectId: string
  canEdit: boolean
  createRequestId?: number
  onCreateRequestConsumed?: (requestId: number) => void
}

export function SceneManagementTable({
  projectId,
  canEdit,
  createRequestId,
  onCreateRequestConsumed,
}: SceneManagementTableProps) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingScene, setEditingScene] = useState<SceneRecord | null>(null)
  const collectionQueryKeys = getSceneCollectionQueryKeys($api, projectId)

  useEffect(() => {
    if (!canEdit) return
    if (!createRequestId || createRequestId <= 0) return
    /* eslint-disable react-hooks/set-state-in-effect -- The request prop intentionally controls this drawer. */
    setEditingScene(null)
    setDrawerOpen(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    onCreateRequestConsumed?.(createRequestId)
  }, [canEdit, createRequestId, onCreateRequestConsumed])

  const invalidateSceneCollections = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: collectionQueryKeys.projectScenes,
      }),
      queryClient.invalidateQueries({
        queryKey: collectionQueryKeys.availableScenes,
      }),
    ])

  type SaveSceneVariables = {
    mode: 'create' | 'edit'
    sceneId?: string
    input: SceneFormInput
  }

  const saveMutation = useMutation({
    mutationFn: ({ input, sceneId }: SaveSceneVariables) =>
      saveProjectScene($api, projectId, input, sceneId),
    onSuccess: async (_, variables) => {
      await invalidateSceneCollections()
      if (variables.mode === 'edit' && variables.sceneId) {
        await queryClient.invalidateQueries({
          queryKey: getSceneQueryKeys($api, projectId, variables.sceneId)
            .projectScene,
        })
      }
      toast.success(variables.mode === 'edit' ? '场景已更新' : '场景已创建')
      setDrawerOpen(false)
      setEditingScene(null)
    },
    onError: () => toast.error('场景保存失败，请重试'),
  })
  const toggleMutation = useMutation({
    mutationFn: (scene: SceneRecord) =>
      patchProjectScene($api, projectId, scene.id, { enabled: !scene.enabled }),
    onSuccess: async (scene, variables) => {
      await Promise.all([
        invalidateSceneCollections(),
        queryClient.invalidateQueries({
          queryKey: getSceneQueryKeys($api, projectId, variables.id)
            .projectScene,
        }),
      ])
      toast.success(scene.enabled ? '场景已启用' : '场景已停用')
    },
    onError: () => toast.error('场景状态更新失败，请重试'),
  })
  const deleteMutation = useMutation({
    mutationFn: (scene: SceneRecord) =>
      deleteProjectScene($api, projectId, scene.id),
    onSuccess: async (_, variables) => {
      await invalidateSceneCollections()
      queryClient.removeQueries({
        queryKey: getSceneQueryKeys($api, projectId, variables.id).projectScene,
        exact: true,
      })
      toast.success('场景已删除，历史试验报告仍保留')
    },
    onError: () => toast.error('场景删除失败，请重试'),
  })

  const pendingSceneAction = toggleMutation.isPending
    ? { sceneId: toggleMutation.variables.id, action: 'toggle' as const }
    : deleteMutation.isPending
      ? { sceneId: deleteMutation.variables.id, action: 'delete' as const }
      : null

  const columns = createSceneColumns({
    projectId,
    readOnly: !canEdit,
    pendingSceneAction,
    onEdit: (scene) => {
      if (!canEdit) return
      setEditingScene(scene)
      setDrawerOpen(true)
    },
    onToggle: (scene) => {
      if (canEdit) toggleMutation.mutate(scene)
    },
    onDelete: (scene) => {
      if (!canEdit) return
      void confirm({
        title: '删除场景',
        desc: `确定删除场景「${scene.name}」吗？历史试验报告将继续读取配置快照。`,
        confirmText: '删除',
        destructive: true,
      }).then((confirmed) => {
        if (confirmed) deleteMutation.mutate(scene)
      })
    },
  })

  return (
    <>
      <section className='bg-card text-card-foreground flex min-h-0 flex-1 flex-col rounded-lg border p-4'>
        <DataTable<SceneRecord>
          className='min-h-0 flex-1'
          columns={columns}
          enableRowSelection={false}
          request={{
            queryKey: (state) => ['project-scenes', $api, projectId, state],
            queryFn: (state) => listProjectScenes($api, projectId, state),
          }}
          urlState={{
            defaultPageSize: 10,
            globalFilterKey: 'sceneKeyword',
            filters: [{ fieldId: 'enabled', type: 'array' }],
          }}
          toolbar={{
            searchPlaceholder: '搜索场景名称',
            columnVisibility: { enabled: false },
            filters: [
              {
                columnId: 'enabled',
                title: '状态',
                selectionMode: 'single',
                options: [
                  { label: '可用', value: 'true' },
                  { label: '停用', value: 'false' },
                ],
              },
            ],
            columnLabels: {
              name: '场景名称',
              description: '描述',
              webhooks: '远程运行',
              runParameters: '运行参数',
              updatedAt: '更新时间',
            },
          }}
          loadingText={
            <Loading
              text='加载场景中...'
              className='min-h-24 border-0 bg-transparent'
            />
          }
          emptyText='暂无匹配的场景'
        />
      </section>
      <SceneFormDrawer
        open={canEdit && drawerOpen}
        projectId={projectId}
        scene={editingScene}
        pending={saveMutation.isPending}
        onOpenChange={(open) => {
          if (saveMutation.isPending) return
          setDrawerOpen(open)
          if (!open) setEditingScene(null)
        }}
        onSubmit={(input) =>
          canEdit
            ? saveMutation
                .mutateAsync({
                  mode: editingScene ? 'edit' : 'create',
                  sceneId: editingScene?.id,
                  input,
                })
                .then(() => undefined)
            : Promise.resolve()
        }
      />
    </>
  )
}
