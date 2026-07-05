import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { TopNav } from '../layout/sub-top-nav'
import { ButtonGroups, type ButtonGroupsProps } from './button-groups'

type PageNavTopNav = {
  links: React.ComponentProps<typeof TopNav>['links']
  variant?: React.ComponentProps<typeof TopNav>['variant']
  className?: React.ComponentProps<typeof TopNav>['className']
}

type PageNavProps = React.HTMLAttributes<HTMLDivElement> & {
  leading?: React.ReactNode
  trailing?: React.ReactNode
  topNav?: PageNavTopNav | null
  buttonGroups?: ButtonGroupsProps | null
  showBackButton?: boolean
  onBack?: () => void
}

export function PageNav({
  leading,
  trailing,
  topNav,
  buttonGroups,
  showBackButton,
  onBack,
  className,
  ...props
}: PageNavProps) {
  const navigate = useNavigate()

  if (
    !leading &&
    !trailing &&
    !showBackButton &&
    !topNav?.links?.length &&
    !buttonGroups?.buttons?.length
  ) {
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
        'bg-card border-border flex flex-wrap items-center gap-2 border rounded-lg px-4 py-3',
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
        {leading ? (
          <div className='min-w-0 shrink-0 pr-2'>{leading}</div>
        ) : null}
        {topNav?.links?.length ? (
          <TopNav
            variant={topNav?.variant}
            links={topNav?.links}
            className={topNav?.className}
          />
        ) : null}
      </div>
      {trailing ? <div className='ml-auto shrink-0'>{trailing}</div> : null}
      {buttonGroups?.buttons?.length ? (
        <ButtonGroups
          {...buttonGroups}
          className={cn(!trailing && 'ml-auto', 'shrink-0', buttonGroups.className)}
        />
      ) : null}
    </div>
  )
}
