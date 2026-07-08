import { Home } from 'lucide-react'
import { PageHeader } from '@/components/common/page-header'
import { Main } from '@/components/layout/main'

const defaultLinks: React.ComponentProps<typeof PageHeader>['links'] = [
  {
    title: '项目管理',
    href: '/apps',
    isActive: true,
    disabled: false,
    icon: Home,
  },
]

type PageProps = React.ComponentProps<typeof Main> & {
  links?: React.ComponentProps<typeof PageHeader>['links']
}

export function Page({ links, children, ...mainProps }: PageProps) {
  return (
    <>
      <PageHeader links={links ?? defaultLinks} />
      <Main {...mainProps}>{children}</Main>
    </>
  )
}
