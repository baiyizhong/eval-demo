import { ContentSection } from '@/components/common/content-section'
import { AccountForm } from './account-form'

export function SettingsAccount() {
  return (
    <ContentSection title='账户' desc='更新账户设置，配置你的首选语言和时区。'>
      <AccountForm />
    </ContentSection>
  )
}
