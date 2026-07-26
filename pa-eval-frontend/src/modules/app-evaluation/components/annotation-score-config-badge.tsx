import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

export function AnnotationScoreConfigBadges({ values }: { values: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const contentKey = values.join('\0')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateOverflowing = () => {
      const badges = container.querySelectorAll<HTMLElement>(
        '[data-score-config-badge]'
      )
      const hasTruncatedBadge = Array.from(badges).some(
        (badge) => badge.scrollWidth > badge.clientWidth
      )

      const nextIsOverflowing =
        container.scrollWidth > container.clientWidth || hasTruncatedBadge

      setIsOverflowing(nextIsOverflowing)
      if (!nextIsOverflowing) setIsOpen(false)
    }

    updateOverflowing()
    const resizeObserver = new ResizeObserver(updateOverflowing)
    resizeObserver.observe(container)
    container
      .querySelectorAll<HTMLElement>('[data-score-config-badge]')
      .forEach((badge) => resizeObserver.observe(badge))

    return () => resizeObserver.disconnect()
  }, [contentKey])

  if (!values.length) return <span className='text-muted-foreground'>-</span>

  return (
    <HoverCard
      open={isOverflowing && isOpen}
      onOpenChange={(open) => setIsOpen(isOverflowing && open)}
      openDelay={250}
      closeDelay={100}
    >
      <HoverCardTrigger asChild>
        <div
          ref={containerRef}
          className='flex max-w-[20rem] flex-nowrap gap-1 overflow-hidden'
        >
          {values.map((value, index) => (
            <Badge
              key={`${value}-${index}`}
              data-score-config-badge
              variant='secondary'
              className='max-w-52 shrink-0 truncate'
            >
              {value}
            </Badge>
          ))}
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        align='start'
        className='w-[32rem] max-w-[calc(100vw-2rem)] p-3'
      >
        <div className='text-xs font-medium'>评分指标</div>
        <div className='mt-2 flex max-h-80 flex-wrap gap-1 overflow-auto'>
          {values.map((value, index) => (
            <Badge
              key={`${value}-${index}`}
              variant='secondary'
              className='max-w-full text-left break-words whitespace-normal'
            >
              {value}
            </Badge>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
