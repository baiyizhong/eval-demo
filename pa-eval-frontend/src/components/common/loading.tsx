import { LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'

type LoadingClassNameOptions = {
  full?: boolean
  className?: string
}

function getLoadingClassName({
  full = false,
  className,
}: LoadingClassNameOptions) {
  return twMerge(
    'flex min-w-0 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card text-card-foreground',
    full ? 'h-full min-h-0' : 'min-h-40',
    className
  )
}

type LoadingProps = React.ComponentProps<'div'> & {
  text?: string
  full?: boolean
}

export function Loading({
  text = '加载中...',
  full = false,
  className,
  ...props
}: LoadingProps) {
  return (
    <div
      role='status'
      aria-live='polite'
      className={getLoadingClassName({ full, className })}
      {...props}
    >
      <LoaderCircle
        aria-hidden='true'
        className='text-muted-foreground size-5 animate-spin'
      />
      <span className='text-muted-foreground text-sm'>{text}</span>
    </div>
  )
}
