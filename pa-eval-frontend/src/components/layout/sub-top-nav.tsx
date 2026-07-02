import { Menu, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { type ActiveMatch, isRouteActive } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type TopNavLink = {
  title: string
  href: string
  isActive?: boolean
  activeMatch?: ActiveMatch
  disabled?: boolean
  icon?: LucideIcon
}

type TopNavProps = React.HTMLAttributes<HTMLElement> & {
  links?: TopNavLink[] | null
  variant?: 'default' | 'underline'
}

export function TopNav({
  className,
  links,
  variant = 'default',
  ...props
}: TopNavProps) {
  const { pathname } = useLocation()

  if (!links?.length) {
    return null
  }

  return (
    <>
      <div className='lg:hidden'>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size='icon' variant='outline' className='md:size-7'>
              <Menu />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side='bottom' align='start'>
            {links.map(
              ({
                title,
                href,
                isActive,
                activeMatch,
                disabled,
                icon: Icon,
              }) => {
                const active =
                  isActive ?? isRouteActive(pathname, href, activeMatch)

                return (
                  <DropdownMenuItem
                    key={`${title}-${href}`}
                    asChild
                    disabled={disabled}
                  >
                    <Link
                      to={href}
                      className={cn(
                        'flex items-center gap-2 [&_svg]:size-4',
                        !active && 'text-muted-foreground'
                      )}
                    >
                      {Icon ? <Icon /> : null}
                      {title}
                    </Link>
                  </DropdownMenuItem>
                )
              }
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav
        className={cn(
          'hidden items-center lg:flex',
          variant === 'default' && 'space-x-4 lg:space-x-4 xl:space-x-6',
          variant === 'underline' && 'gap-8',
          className
        )}
        {...props}
      >
        {links.map(
          ({ title, href, isActive, activeMatch, disabled, icon: Icon }) => {
            const active =
              isActive ?? isRouteActive(pathname, href, activeMatch)

            return (
              <Link
                key={`${title}-${href}`}
                to={href}
                className={cn(
                  'flex items-center gap-2 text-sm transition-colors [&_svg]:size-4',
                  variant === 'default' && 'hover:text-primary',
                  variant === 'default' && !active && 'text-muted-foreground',
                  variant === 'underline' && 'h-9 border-b-2 px-0',
                  variant === 'underline' &&
                    active &&
                    'border-primary text-foreground font-medium',
                  variant === 'underline' &&
                    !active &&
                    'text-muted-foreground hover:text-foreground border-transparent',
                  disabled && 'pointer-events-none opacity-50'
                )}
              >
                {Icon ? <Icon /> : null}
                {title}
              </Link>
            )
          }
        )}
      </nav>
    </>
  )
}
