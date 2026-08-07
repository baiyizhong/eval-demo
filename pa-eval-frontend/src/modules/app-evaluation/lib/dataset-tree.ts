import type { DatasetDirectoryRecord, DatasetRecord } from '../types'

export type DatasetTreeNodeKind = 'folder' | 'dataset'

export type DatasetTreeNode = {
  id: string
  parentId: string | null
  name: string
  kind: DatasetTreeNodeKind
  order: number
  directoryId?: string | null
  datasetId?: string
  virtual?: boolean
}

export function buildDatasetTreeNodes({
  directories,
  datasets,
}: {
  directories: DatasetDirectoryRecord[]
  datasets: DatasetRecord[]
}): DatasetTreeNode[] {
  const directoryIds = new Set(directories.map((directory) => directory.id))
  const directoryNodes = directories.map((directory) => ({
    id: directory.id,
    parentId: directory.parentId,
    name: directory.name,
    kind: 'folder' as const,
    order: directory.order,
    directoryId: directory.id,
  }))
  const datasetNodes = datasets.map((dataset, index) => {
    const parentId =
      dataset.directoryId && directoryIds.has(dataset.directoryId)
        ? dataset.directoryId
        : null

    return {
      id: dataset.id,
      parentId,
      name: dataset.name,
      kind: 'dataset' as const,
      order: index,
      datasetId: dataset.id,
      directoryId: dataset.directoryId ?? null,
    }
  })

  return [...directoryNodes, ...datasetNodes]
}

export function getVisibleTreeNodeIds(
  nodes: DatasetTreeNode[],
  keyword: string
) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return nodes.map((node) => node.id)

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const visibleIds = new Set<string>()

  for (const node of nodes) {
    if (!node.name.toLowerCase().includes(normalizedKeyword)) continue
    let current: DatasetTreeNode | undefined = node
    while (current) {
      visibleIds.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
  }

  return [...visibleIds]
}

export function getDatasetAncestorDirectoryIds(
  nodes: DatasetTreeNode[],
  datasetId: string | null | undefined
) {
  if (!datasetId) return []

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const ancestorIds: string[] = []
  let current = byId.get(datasetId)

  while (current?.parentId) {
    const parent = byId.get(current.parentId)
    if (!parent) break
    ancestorIds.unshift(parent.id)
    current = parent
  }

  return ancestorIds
}

export function getNextDatasetId(
  directories: DatasetDirectoryRecord[],
  datasets: DatasetRecord[],
  currentDatasetId: string | null | undefined
) {
  if (
    currentDatasetId &&
    datasets.some((dataset) => dataset.id === currentDatasetId)
  ) {
    return currentDatasetId
  }

  const directoryIds = new Set(directories.map((directory) => directory.id))
  const categorized = datasets.find(
    (dataset) => dataset.directoryId && directoryIds.has(dataset.directoryId)
  )

  return categorized?.id ?? datasets[0]?.id ?? null
}
