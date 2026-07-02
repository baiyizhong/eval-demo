import { Fragment, type ReactNode } from 'react'
import { Telescope, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PageGuideDescription = ReactNode | ReactNode[]

export type PageGuideContentConfig = {
  icon?: LucideIcon
  title?: ReactNode
  description?: PageGuideDescription
}

export type PageGuideContent = Required<PageGuideContentConfig>

const PAGE_GUIDE_DEFAULT_CONTENT: PageGuideContent = {
  icon: Telescope,
  title: '即将上线！',
  description: ['该页面尚未创建。', '敬请期待！'],
}

function getPageGuideContent(content?: PageGuideContentConfig): PageGuideContent {
  return {
    ...PAGE_GUIDE_DEFAULT_CONTENT,
    ...content,
  }
}

type PageGuideProps = PageGuideContentConfig & {
  children?: ReactNode
  className?: string
  contentClassName?: string
}

function renderDescription(description: PageGuideDescription) {
  if (!Array.isArray(description)) {
    return description
  }

  return description.map((item, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {item}
    </Fragment>
  ))
}

export function PageGuide({
  icon,
  title,
  description,
  children,
  className,
  contentClassName,
}: PageGuideProps) {
  const content = getPageGuideContent({ icon, title, description })
  const Icon = content.icon

  return (
    <div className={cn('min-h-svh w-full px-4', className)}>
      <div
        className={cn(
          'mx-auto flex w-full max-w-xl flex-col items-center pt-[20vh] text-center',
          contentClassName
        )}
      >
        <Icon
          className='text-muted-foreground mb-4'
          size={72}
          strokeWidth={1.5}
        />
        <h1 className='text-4xl leading-tight font-bold'>{content.title}</h1>
        <p className='text-muted-foreground mt-2 leading-7'>
          {renderDescription(content.description)}
        </p>
        {children ? (
          <div className='mt-6 flex flex-wrap items-center justify-center gap-2'>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  )
}
