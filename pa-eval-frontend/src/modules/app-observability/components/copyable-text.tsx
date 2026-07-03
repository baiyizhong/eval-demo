import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type CopyableTextProps = {
  value: string
  className?: string
}

export function CopyableText({ value, className }: CopyableTextProps) {
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    toast.success('已复制')
  }

  return (
    <div className='flex min-w-0 items-center gap-1'>
      <span className={cn('truncate font-mono text-xs', className)}>
        {value}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-7 shrink-0'
        aria-label={`复制 ${value}`}
        onClick={() => {
          void copy()
        }}
      >
        <Copy />
      </Button>
    </div>
  )
}
