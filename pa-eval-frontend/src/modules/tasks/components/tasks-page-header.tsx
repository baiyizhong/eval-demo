import { Download, Plus } from 'lucide-react'
import { PageNav } from '@/components/common/page-nav'
import { tasksTopNav } from './tasks-nav'

type TasksPageHeaderProps = {
  onImportClick?: () => void
  onCreateClick?: () => void
  showActions?: boolean
  showImport?: boolean
  importLabel?: string
  createLabel?: string
}

export function TasksPageHeader({
  onImportClick,
  onCreateClick,
  showActions = true,
  showImport = true,
  importLabel = '导入',
  createLabel = '创建',
}: TasksPageHeaderProps) {
  const buttons = [
    showImport
      ? {
          id: 'import',
          label: importLabel,
          icon: Download,
          variant: 'outline' as const,
          size: 'sm' as const,
          onClick: onImportClick,
        }
      : null,
    {
      id: 'create',
      label: createLabel,
      icon: Plus,
      size: 'sm' as const,
      onClick: onCreateClick,
    },
  ].filter((button) => button !== null)

  return (
    <PageNav
      topNav={{
        variant: 'underline',
        links: tasksTopNav,
      }}
      buttonGroups={
        showActions
          ? {
              buttons,
            }
          : null
      }
    />
  )
}
