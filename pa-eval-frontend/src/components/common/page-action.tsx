import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ButtonGroups, type ButtonGroupsProps } from './button-groups'

type PageActionProps = React.HTMLAttributes<HTMLDivElement> & {
  buttonGroups?: ButtonGroupsProps | null
  actions?: React.ReactNode
  showBackButton?: boolean
  onBack?: () => void
}

export function PageAction({
  buttonGroups,
  actions,
  showBackButton,
  onBack,
  children,
  className,
  ...props
}: PageActionProps) {
  const navigate = useNavigate()
  const hasChildren =
    children !== undefined && children !== null && children !== false

  if (!showBackButton && !hasChildren && !actions && !buttonGroups?.buttons?.length) {
    return null
  }

  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }

    navigate(-1)
  }

  return (
    <div
      className={cn(
        'bg-card border-border flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3',
        className
      )}
      {...props}
    >
      <div className='flex min-w-0 items-center gap-4'>
        {showBackButton ? (
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='size-9'
            aria-label='返回上一页'
            onClick={handleBack}
          >
            <ChevronLeft className='size-5' data-icon='inline-start' />
          </Button>
        ) : null}
        {hasChildren ? <div className='min-w-0'>{children}</div> : null}
      </div>
      {actions || buttonGroups?.buttons?.length ? (
        <div className='ml-auto flex shrink-0 items-center gap-2'>
          {actions}
          {buttonGroups?.buttons?.length ? (
            <ButtonGroups {...buttonGroups} className={buttonGroups.className} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
