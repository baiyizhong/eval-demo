import { Button } from '@/components/ui/button'

type DataTableSelectAllBannerProps = {
  isAllSelected: boolean
  selectedPageCount: number
  totalCount: number
  pageCount: number
  onSelectAll: () => void
  onClear: () => void
}

export function DataTableSelectAllBanner({
  isAllSelected,
  selectedPageCount,
  totalCount,
  pageCount,
  onSelectAll,
  onClear,
}: DataTableSelectAllBannerProps) {
  return (
    <div className='bg-muted/70 text-muted-foreground flex flex-wrap items-center justify-center gap-2 rounded-md px-3 py-2 text-sm'>
      {isAllSelected ? (
        <>
          <span>
            已选择符合当前筛选条件的全部{' '}
            <span className='text-foreground font-medium'>
              {totalCount.toLocaleString()}
            </span>{' '}
            条数据。
          </span>
          <Button
            type='button'
            variant='ghost'
            className='text-primary h-auto p-0 font-medium'
            onClick={onClear}
          >
            清除选择
          </Button>
        </>
      ) : (
        <>
          <span>
            已选择本页全部{' '}
            <span className='text-foreground font-medium'>
              {selectedPageCount.toLocaleString()}
            </span>{' '}
            条数据。
          </span>
          <Button
            type='button'
            variant='ghost'
            className='text-primary h-auto p-0 font-medium'
            onClick={onSelectAll}
          >
            选择符合当前筛选条件的全部 {totalCount.toLocaleString()}{' '}
            条数据（共 {pageCount.toLocaleString()} 页）
          </Button>
        </>
      )}
    </div>
  )
}
