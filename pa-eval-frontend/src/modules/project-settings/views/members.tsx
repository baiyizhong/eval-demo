import { type FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProjectUserRecord } from '@/modules/app-evaluation/types'
import { Plus, Trash2 } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

const PROJECT_ROLE_OPTIONS = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const

function formatRole(role?: string | null) {
  if (!role) {
    return '-'
  }
  return ROLE_LABELS[role] ?? role
}

export function ProjectMembersSettings() {
  const { projectId = '' } = useParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<ProjectUserRecord | null>(
    null
  )
  const membersQuery = useQuery({
    queryKey: ['project-settings-members', $api, projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      $api.getProjectMembers<ProjectUserRecord[]>({
        path: { projectId },
      }),
  })
  const invalidateMembers = () =>
    queryClient.invalidateQueries({
      queryKey: ['project-settings-members', $api, projectId],
    })
  const createMutation = useMutation({
    mutationFn: (input: { email: string; role: string }) =>
      $api.createProjectMember<ProjectUserRecord>({
        path: { projectId },
        body: input,
      }),
    onSuccess: async () => {
      await invalidateMembers()
      setDialogOpen(false)
      toast.success('项目成员已添加')
    },
  })
  const updateMutation = useMutation({
    mutationFn: (input: { memberId: string; role: string }) =>
      $api.updateProjectMember<ProjectUserRecord>({
        path: { projectId, memberId: input.memberId },
        body: { role: input.role },
      }),
    onSuccess: async () => {
      await invalidateMembers()
      setDialogOpen(false)
      setEditingMember(null)
      toast.success('项目成员角色已更新')
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (memberId: string) =>
      $api.deleteProjectMember<{ id: string }>({
        path: { projectId, memberId },
      }),
    onSuccess: async () => {
      await invalidateMembers()
      toast.success('项目成员已移除')
    },
  })

  const members = membersQuery.data ?? []

  return (
    <ContentSection
      title='项目成员'
      desc='管理当前项目成员。组织角色非 None 的成员继承项目访问，组织角色为 None 的成员仅在存在项目角色时可访问。'
    >
      <div className='flex flex-col gap-4'>
        <div className='flex justify-end'>
          <Button
            onClick={() => {
              setEditingMember(null)
              setDialogOpen(true)
            }}
          >
            <Plus data-icon='inline-start' />
            新增项目成员
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
                  <TableHead className='text-end'>操作</TableHead>
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
                    <TableCell>
                      <div className='flex justify-end gap-2'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            setEditingMember(member)
                            setDialogOpen(true)
                          }}
                        >
                          编辑
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(member.id)}
                        >
                          <Trash2 data-icon='inline-start' />
                          移除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
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
        <ProjectMemberDialog
          key={editingMember?.id ?? 'create'}
          open={dialogOpen}
          member={editingMember}
          saving={createMutation.isPending || updateMutation.isPending}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setEditingMember(null)
          }}
          onSubmit={(input) => {
            if (editingMember) {
              updateMutation.mutate({
                memberId: editingMember.id,
                role: input.role,
              })
              return
            }
            createMutation.mutate(input)
          }}
        />
      </div>
    </ContentSection>
  )
}

function ProjectMemberDialog({
  open,
  member,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  member: ProjectUserRecord | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { email: string; role: string }) => void
}) {
  const [email, setEmail] = useState(member?.email ?? '')
  const [role, setRole] = useState(member?.projectRole ?? member?.role ?? 'MEMBER')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit({ email: email.trim(), role })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{member ? '编辑项目成员' : '新增项目成员'}</DialogTitle>
        </DialogHeader>
        <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='project-member-email'>邮箱</Label>
            <Input
              id='project-member-email'
              value={email}
              disabled={Boolean(member)}
              onChange={(event) => setEmail(event.target.value)}
              placeholder='member@example.com'
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label>项目角色</Label>
            <Select
              value={role ?? 'MEMBER'}
              onValueChange={(value) => setRole(value as typeof role)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {formatRole(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type='submit' disabled={saving}>
              {saving ? '保存中...' : member ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
