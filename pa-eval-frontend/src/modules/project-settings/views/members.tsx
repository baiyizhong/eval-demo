import { useQuery } from '@tanstack/react-query'
import type { ProjectUserRecord } from '@/modules/app-evaluation/types'
import { useNavigate, useParams } from 'react-router'
import { useAPI } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ContentSection } from '@/components/common/content-section'
import { Loading } from '@/components/common/loading'

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
  NONE: 'None',
}

function formatRole(role?: string | null) {
  if (!role) {
    return '-'
  }
  return ROLE_LABELS[role] ?? role
}

export function ProjectMembersSettings() {
  const { projectId = '' } = useParams()
  const $api = useAPI()
  const navigate = useNavigate()
  const membersQuery = useQuery({
    queryKey: ['project-settings-members', $api, projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      $api.getProjectMembers<ProjectUserRecord[]>({
        path: { projectId },
      }),
  })

  const members = membersQuery.data ?? []

  return (
    <ContentSection
      title='项目成员'
      desc='查看当前项目的有效成员。组织角色非 None 的成员继承项目访问，组织角色为 None 的成员仅在存在项目角色时可访问。'
    >
      <div className='flex flex-col gap-4'>
        <div className='flex justify-end'>
          <Button
            variant='outline'
            onClick={() => navigate('/settings/members')}
          >
            管理组织成员
          </Button>
        </div>
        {membersQuery.isLoading ? (
          <Loading text='加载项目成员中...' className='min-h-24' />
        ) : null}
        {membersQuery.isError ? (
          <div className='text-destructive rounded-lg border p-4 text-sm'>
            项目成员加载失败，请确认后端服务和项目权限。
          </div>
        ) : null}
        {!membersQuery.isLoading && !membersQuery.isError ? (
          <div className='rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>成员</TableHead>
                  <TableHead>有效角色</TableHead>
                  <TableHead>组织角色</TableHead>
                  <TableHead>项目角色</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className='flex flex-col gap-1'>
                        <span className='font-medium'>{member.name}</span>
                        <span className='text-muted-foreground max-w-56 truncate'>
                          {member.email || '-'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>{formatRole(member.role)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant='secondary'>
                        {formatRole(member.organizationRole)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {formatRole(member.projectRole)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className='text-muted-foreground h-24 text-center'
                    >
                      当前项目暂无可展示成员
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
    </ContentSection>
  )
}
