import { Download, Plus } from 'lucide-react'
import { PageNav } from '@/components/common/page-nav'
import { tasksTopNav } from './tasks-nav'

type TasksPageHeaderProps = {
  onImportClick?: () => void
  onCreateClick?: () => void
  showActions?: boolean
}

export function TasksPageHeader({
  onImportClick,
  onCreateClick,
  showActions = true,
}: TasksPageHeaderProps) {
  return (
    <PageNav
      topNav={{
        variant: 'underline',
        links: tasksTopNav,
      }}
      buttonGroups={
        showActions
          ? {
              buttons: [
                {
                  id: 'import',
                  label: '导入',
                  icon: Download,
                  variant: 'outline',
                  size: 'sm',
                  onClick: onImportClick,
                },
                {
                  id: 'create',
                  label: '创建',
                  icon: Plus,
                  size: 'sm',
                  onClick: onCreateClick,
                },
              ],
            }
          : null
      }
    />
  )
}
