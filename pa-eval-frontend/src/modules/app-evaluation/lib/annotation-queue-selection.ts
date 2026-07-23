const ANNOTATION_QUEUE_SELECT_ALL_PAGE_SIZE = 5_000

type AnnotationQueueSelectionQuery = {
  page: number
  pageSize: number
  keyword: string
  filters: Record<string, unknown>
  sorting: Array<{ id: string; desc: boolean }>
}

type AnnotationQueueSelectionState = {
  isAllMatchingRowsSelected: boolean
  totalRowCount: number
  queryState: AnnotationQueueSelectionQuery
}

type ResolveAnnotationQueueSelectedItemsOptions<TItem> = {
  selectedItems: TItem[]
  selection: AnnotationQueueSelectionState
  fetchPage: (
    query: AnnotationQueueSelectionQuery
  ) => Promise<{ total: number; datas: TItem[] }>
}

export async function resolveAnnotationQueueSelectedItems<TItem>({
  selectedItems,
  selection,
  fetchPage,
}: ResolveAnnotationQueueSelectedItemsOptions<TItem>): Promise<TItem[]> {
  if (!selection.isAllMatchingRowsSelected) {
    return selectedItems
  }

  const pageCount = Math.ceil(
    selection.totalRowCount / ANNOTATION_QUEUE_SELECT_ALL_PAGE_SIZE
  )
  const items: TItem[] = []

  for (let page = 1; page <= pageCount; page += 1) {
    const response = await fetchPage({
      ...selection.queryState,
      page,
      pageSize: ANNOTATION_QUEUE_SELECT_ALL_PAGE_SIZE,
    })
    items.push(...response.datas)
  }

  return items.slice(0, selection.totalRowCount)
}
