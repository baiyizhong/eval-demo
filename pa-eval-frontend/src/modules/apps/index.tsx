import { AppList } from '@/components/business/app-list'
import { Main } from '@/components/layout/main'
import { apps } from './data/apps'

export function Apps() {
  return (
    <>
      <Main fixed>
        <AppList apps={apps} />
      </Main>
    </>
  )
}
