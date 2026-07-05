import { ProfileDropdown } from '@/components/common/profile-dropdown'
import { Header } from '@/components/layout/header'
import { TopNav } from '@/components/layout/sub-top-nav'
import { useAuthProfileMenu } from '@/hooks/use-auth-profile-menu'

type PageHeaderProps = {
  links: React.ComponentProps<typeof TopNav>['links']
}

export function PageHeader({ links }: PageHeaderProps) {
  const { user, menuActions, handleAuthMenuAction } = useAuthProfileMenu()

  return (
    <Header fixed>
      <div className='ms-auto flex items-center gap-8'>
        <TopNav links={links} />
        <ProfileDropdown
          user={user}
          actions={menuActions}
          onAction={handleAuthMenuAction}
        />
      </div>
    </Header>
  )
}
