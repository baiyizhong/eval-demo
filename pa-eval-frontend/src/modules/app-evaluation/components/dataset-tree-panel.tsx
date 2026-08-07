import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DatabaseIcon,
  Edit2,
  Filter,
  FolderTree,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { DataTableListResponse } from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { TreeView } from '@/components/common/tree-view'
import {
  type DatasetApiClient,
  listProjectDatasetDirectories,
  listProjectDatasets,
  moveProjectDatasetToDirectory,
} from '../api/dataset-api'
import {
  buildDatasetTreeNodes,
  getDatasetAncestorDirectoryIds,
  type DatasetTreeNode,
} from '../lib/dataset-tree'
import { getDatasetTags } from '../lib/dataset-tags'
import type { DatasetRecord } from '../types'

type DatasetTreePanelProps = {
  api: DatasetApiClient
  projectId: string
  selectedDatasetId: string | null
  canEdit: boolean
  onSelectDataset: (datasetId: string) => void
  onCreateDataset: (directoryId: string | null) => void
  onEditDataset: (dataset: DatasetRecord) => void
  onDeleteDataset: (dataset: DatasetRecord) => void
}

export function DatasetTreePanel({
  api,
  projectId,
  selectedDatasetId,
  canEdit,
  onSelectDataset,
  onCreateDataset,
  onEditDataset,
  onDeleteDataset,
}: DatasetTreePanelProps) {
 const queryClient = useQueryClient()
  const [userExpandedIds, setUserExpandedIds] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagSearch, setTagSearch] = useState('')
  const [userCollapsedIdsByDataset, setUserCollapsedIdsByDataset] = useState<
    Record<string, string[]>
  >({})
  const directoriesQuery = useQuery({
    queryKey: ['project-dataset-directories', api, projectId],
    queryFn: () => listProjectDatasetDirectories(api, projectId),
  })
  const datasetsQuery = useQuery({
    queryKey: ['project-datasets-tree', api, projectId],
    queryFn: () =>
      listProjectDatasets(
        api,
        projectId,
        { page: 1, pageSize: 500, keyword: '', filters: {}, sorting: [] },
        'all'
      ),
  })
  const datasets = useMemo(
    () => datasetsQuery.data?.datas ?? [],
    [datasetsQuery.data]
  )
  const availableTags = useMemo(() => {
    const seen = new Set<string>()
    for (const dataset of datasets) {
      for (const tag of getDatasetTags(dataset)) {
        seen.add(tag)
      }
    }
    return [...seen].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
  }, [datasets])
  const filteredTags = useMemo(() => {
    const keyword = tagSearch.trim().toLowerCase()
    if (!keyword) return availableTags
    return availableTags.filter((tag) => tag.toLowerCase().includes(keyword))
  }, [availableTags, tagSearch])
  const datasetById = useMemo(
    () => new Map(datasets.map((dataset) => [dataset.id, dataset])),
    [datasets]
  )
  const rawNodes = useMemo(
    () =>
      buildDatasetTreeNodes({
        directories: directoriesQuery.data ?? [],
        datasets,
      }),
    [datasets, directoriesQuery.data]
  )
  const selectedTagSet = useMemo(
    () => new Set(selectedTags),
    [selectedTags]
  )
  const tagFilteredNodes = useMemo(() => {
    if (selectedTagSet.size === 0) return rawNodes

    const byId = new Map(rawNodes.map((node) => [node.id, node]))
    const visibleIds = new Set<string>()

    for (const node of rawNodes) {
      if (node.kind !== 'dataset') continue
      const dataset = datasetById.get(node.id)
      if (!dataset) continue
      const tags = getDatasetTags(dataset)
      const matched = tags.some((tag) => selectedTagSet.has(tag))
      if (!matched) continue

      let current: DatasetTreeNode | undefined = node
      while (current) {
        visibleIds.add(current.id)
        current = current.parentId ? byId.get(current.parentId) : undefined
      }
    }

    return rawNodes.filter((node) => visibleIds.has(node.id))
  }, [rawNodes, selectedTagSet, datasetById])
  const tagMatchAncestorIds = useMemo(() => {
    if (selectedTagSet.size === 0) return []
    return getAncestorFolderIds(tagFilteredNodes)
  }, [tagFilteredNodes, selectedTagSet])
  const nodes = useMemo(
    () =>
      tagFilteredNodes.map((node) => ({
        ...node,
        kind: node.kind === 'dataset' ? ('item' as const) : ('folder' as const),
      })),
    [tagFilteredNodes]
  )
  const selectedDatasetAncestorIds = useMemo(
    () => getDatasetAncestorDirectoryIds(tagFilteredNodes, selectedDatasetId),
    [tagFilteredNodes, selectedDatasetId]
  )
 const expandedIds = useMemo(() => {
   const selectedDatasetCollapsedIds = selectedDatasetId
     ? (userCollapsedIdsByDataset[selectedDatasetId] ?? [])
     : []
   const collapsedIds = new Set(selectedDatasetCollapsedIds)
   return [
      ...new Set([...userExpandedIds, ...selectedDatasetAncestorIds]),
      ...tagMatchAncestorIds,
    ].filter((id) => !collapsedIds.has(id))
  }, [
    selectedDatasetAncestorIds,
    selectedDatasetId,
    userCollapsedIdsByDataset,
    userExpandedIds,
    tagMatchAncestorIds,
  ])
  const handleExpandedIdsChange = (nextIds: string[]) => {
    const nextIdSet = new Set(nextIds)
    const collapsedAncestorIds = selectedDatasetAncestorIds.filter(
      (id) => !nextIdSet.has(id)
    )

    setUserExpandedIds(nextIds)
    if (!selectedDatasetId) return
    setUserCollapsedIdsByDataset((current) => ({
      ...current,
      [selectedDatasetId]: collapsedAncestorIds,
    }))
  }
  const moveDatasetMutation = useMutation({
    mutationFn: ({
      datasetId,
      directoryId,
    }: {
      datasetId: string
      directoryId: string | null
    }) =>
      moveProjectDatasetToDirectory(api, projectId, datasetId, { directoryId }),
    onSuccess: async (updatedDataset) => {
      queryClient.setQueriesData<DatasetListCache>(
        { queryKey: ['project-datasets-tree'] },
        (cache) => replaceDatasetInListCache(cache, updatedDataset)
      )
      queryClient.setQueriesData<DatasetListCache>(
        { queryKey: ['project-datasets'] },
        (cache) => replaceDatasetInListCache(cache, updatedDataset)
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-datasets-tree'],
          refetchType: 'inactive',
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-datasets'],
          refetchType: 'inactive',
        }),
      ])
      toast.success('数据集已移动')
    },
  })

  if (directoriesQuery.isLoading || datasetsQuery.isLoading) {
    return <Loading text='加载数据集目录中...' className='min-h-32' />
  }

  return (
    <TreeView
      title={
        <div className='flex items-center gap-2'>
          <span className='flex min-w-0 items-center gap-2'>
            <FolderTree className='size-4 shrink-0' />
            <span className='truncate'>数据集列表树</span>
          </span>
          <div className='ml-auto flex items-center gap-0.5'>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='text-muted-foreground hover:text-foreground h-7 gap-1 px-2'
                title='按标签过滤'
                aria-label='按标签过滤'
                aria-expanded={selectedTags.length > 0}
              >
                <Filter className='size-4' />
                {selectedTags.length > 0 ? (
                  <Badge
                    variant='secondary'
                    className='h-5 px-1.5 text-xs'
                  >
                    {selectedTags.length}
                  </Badge>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-44'>
              <div className='p-2'>
                <div className='relative'>
                  <Input
                    value={tagSearch}
                    placeholder='搜索标签'
                    className='h-8 pr-8'
                    onChange={(event) => setTagSearch(event.target.value)}
                  />
                  <Search className='text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2' />
                </div>
              </div>
              <DropdownMenuSeparator />
              {availableTags.length === 0 ? (
                <div className='text-muted-foreground px-2 py-1.5 text-xs'>
                  暂无可用标签
                </div>
              ) : filteredTags.length === 0 ? (
                <div className='text-muted-foreground px-2 py-1.5 text-xs'>
                  未找到匹配的标签
                </div>
              ) : (
                filteredTags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag}
                    checked={selectedTagSet.has(tag)}
                    onCheckedChange={(checked) => {
                      setSelectedTags((current) =>
                        checked
                          ? [...current, tag]
                          : current.filter((item) => item !== tag)
                      )
                    }}
                  >
                    <span className='truncate'>{tag}</span>
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedTags.length > 0 ? (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='text-muted-foreground hover:text-foreground h-7 w-5 p-0'
              title='清除标签筛选'
              aria-label='清除标签筛选'
              onClick={() => setSelectedTags([])}
            >
              <X className='size-3.5' />
            </Button>
          ) : null}
          </div>
        </div>
      }
      nodes={nodes}
      selectedId={selectedDatasetId}
      expandedIds={expandedIds}
      onExpandedIdsChange={handleExpandedIdsChange}
      searchable
      selectableKinds={['item']}
      emptyText={selectedTags.length > 0 ? '没有匹配所选标签的数据集' : '暂无数据集'}
      onSelect={(node) => {
        if (node.kind === 'item') onSelectDataset(node.id)
      }}
      renderItemIcon={() => (
        <DatabaseIcon className='text-muted-foreground size-4 shrink-0' />
      )}
      draggable={canEdit}
      canDrag={(node) => node.kind === 'item'}
      canDrop={({ node, targetNode, parentId }) => {
        if (node.kind !== 'item') return false
        if (targetNode.kind !== 'folder') return false
        if (parentId === node.parentId) return false
        return true
      }}
      onMove={async ([move]) => {
        if (!move) return
        await moveDatasetMutation.mutateAsync({
          datasetId: move.id,
          directoryId: move.parentId,
        })
      }}
      renderActions={(node) => {
        const treeNode = node as typeof node & DatasetTreeNode
        if (treeNode.kind === 'folder') {
          if (!canEdit) return null
          return (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-7'
              title='新建数据集'
              aria-label='新建数据集'
              onClick={(event) => {
                event.stopPropagation()
                onCreateDataset(treeNode.id)
              }}
            >
              <Plus className='size-4' />
            </Button>
          )
        }

        const dataset = datasetById.get(treeNode.id)
        if (!dataset || !canEdit) return null

        return (
          <>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-7'
              title='编辑数据集'
              aria-label='编辑数据集'
              onClick={(event) => {
                event.stopPropagation()
                onEditDataset(dataset)
              }}
            >
              <Edit2 className='size-4' />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-7'
              title='删除数据集'
              aria-label='删除数据集'
              onClick={(event) => {
                event.stopPropagation()
                onDeleteDataset(dataset)
              }}
            >
              <Trash2 className='size-4' />
            </Button>
          </>
        )
      }}
    />
  )
}

type DatasetListCache = DataTableListResponse<DatasetRecord>

function replaceDatasetInListCache(
  cache: DatasetListCache | undefined,
  updatedDataset: DatasetRecord
) {
  if (!cache) return cache

  return {
    ...cache,
    datas: cache.datas.map((dataset) =>
      dataset.id === updatedDataset.id
        ? {
            ...dataset,
            ...updatedDataset,
          }
        : dataset
    ),
  }
}

function getAncestorFolderIds(nodes: DatasetTreeNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const ancestorIds = new Set<string>()

  for (const node of nodes) {
    let parentId = node.parentId
    const visitedIds = new Set<string>([node.id])

    while (parentId) {
      if (visitedIds.has(parentId)) break
      const parent = byId.get(parentId)
      if (!parent) break
      if (parent.kind === 'folder') ancestorIds.add(parent.id)
      visitedIds.add(parentId)
      parentId = parent.parentId
    }
  }

  return [...ancestorIds]
}
