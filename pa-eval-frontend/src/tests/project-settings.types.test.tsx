import {
  ProjectSettings,
  ProjectSettingsIndexRedirect,
} from '@/modules/project-settings'
import { projectSettingsNavigationItems } from '@/modules/project-settings/nav'
import { ProjectApiKeysSettings } from '@/modules/project-settings/views/api-keys'
import { ProjectGeneralSettings } from '@/modules/project-settings/views/general'
import { ProjectMembersSettings } from '@/modules/project-settings/views/members'
import { ProjectModelsSettings } from '@/modules/project-settings/views/models'
import { ProjectScoreConfigsSettings } from '@/modules/project-settings/views/score-configs'

export function ProjectSettingsTypeUsage() {
  return (
    <>
      <ProjectSettings />
      <ProjectSettingsIndexRedirect />
      <ProjectGeneralSettings />
      <ProjectScoreConfigsSettings />
      <ProjectMembersSettings />
      <ProjectModelsSettings />
      <ProjectApiKeysSettings />
      <span>
        {projectSettingsNavigationItems.map((item) => item.href).join(',')}
      </span>
    </>
  )
}
