import {
  ProfileDropdown,
  type ProfileDropdownUser,
} from '@/components/common/profile-dropdown'
import { Header } from '@/components/layout/header'
import { TopNav } from '@/components/layout/sub-top-nav'

type PageHeaderProps = {
  links: React.ComponentProps<typeof TopNav>['links']
}

const pageHeaderUser: ProfileDropdownUser = {
  name: 'PANJIANJIAN065',
  email: 'panjianjian065@example.com',
  initials: 'P',
}

export function PageHeader({ links }: PageHeaderProps) {
  return (
    <Header fixed>
      <div className='ms-auto flex items-center gap-8'>
        <TopNav links={links} />
        <ProfileDropdown user={pageHeaderUser} />
      </div>
    </Header>
  )
}
