import { type JSX } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SidebarNavItem = {
  href: string
  title: string
  icon: JSX.Element
}

type SidebarNavOrientation = 'responsive' | 'horizontal' | 'vertical'

type SidebarNavProps = React.HTMLAttributes<HTMLElement> & {
  items: SidebarNavItem[]
  defaultValue?: string
  selectPlaceholder?: string
  orientation?: SidebarNavOrientation
}

const sidebarNavClassName: Record<SidebarNavOrientation, string> = {
  responsive: 'flex gap-2 py-1 lg:flex-col lg:gap-1',
  horizontal: 'flex gap-2 py-1',
  vertical: 'flex flex-col gap-1 py-1',
}

export function SidebarNav({
  className,
  items,
  defaultValue,
  selectPlaceholder = 'Select section',
  orientation = 'responsive',
  ...props
}: SidebarNavProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const selectedValue = items.some((item) => item.href === pathname)
    ? pathname
    : (defaultValue ?? items[0]?.href)

  const handleSelect = (value: string) => {
    navigate(value)
  }

  return (
    <>
      <div className='p-1 md:hidden'>
        <Select value={selectedValue} onValueChange={handleSelect}>
          <SelectTrigger className='h-12 sm:w-48'>
            <SelectValue placeholder={selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.href} value={item.href}>
                <div className='flex gap-x-4 px-2 py-1'>
                  <span className='scale-125'>{item.icon}</span>
                  <span className='text-md'>{item.title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea
        orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
        type='always'
        className='bg-background hidden w-full min-w-40 px-1 py-2 md:block'
      >
        <nav
          className={cn(sidebarNavClassName[orientation], className)}
          {...props}
        >
          {items.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                pathname === item.href
                  ? 'bg-muted hover:bg-accent'
                  : 'hover:bg-accent hover:underline',
                'justify-start'
              )}
            >
              <span className='me-2'>{item.icon}</span>
              {item.title}
            </Link>
          ))}
        </nav>
      </ScrollArea>
    </>
  )
}
