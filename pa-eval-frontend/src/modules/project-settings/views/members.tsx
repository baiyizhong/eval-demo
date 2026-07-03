import { type FormEvent, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
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
import { mockProjectMembers } from '../data/mock'
import type { ProjectMember, ProjectRole } from '../types'

const ROLE_LABELS: Record<ProjectRole, string> = {
  OWNER: '项目 owner',
  ADMIN: '项目 admin',
  MEMBER: '项目 member',
  VIEWER: '项目 viewer',
}

const ROLE_BADGE_VARIANTS: Record<
  ProjectRole,
  'default' | 'secondary' | 'outline'
> = {
  OWNER: 'default',
  ADMIN: 'secondary',
  MEMBER: 'outline',
  VIEWER: 'outline',
}

type MemberFormState = {
  name: string
  email: string
  role: ProjectRole
}

const emptyFormState: MemberFormState = {
  name: '',
  email: '',
  role: 'MEMBER',
}

function formatDateTime(value?: string) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function toFormState(member: ProjectMember): MemberFormState {
  return {
    name: member.name,
    email: member.email,
    role: member.role,
  }
}

export function ProjectMembersSettings() {
  const [members, setMembers] = useState(mockProjectMembers)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<ProjectMember | null>(null)
  const [deletingMember, setDeletingMember] = useState<ProjectMember | null>(
    null
  )
  const [form, setForm] = useState<MemberFormState>(emptyFormState)

  const ownerCount = useMemo(
    () => members.filter((member) => member.role === 'OWNER').length,
    [members]
  )

  const openCreateDialog = () => {
    setEditingMember(null)
    setForm(emptyFormState)
    setDialogOpen(true)
  }

  const openEditDialog = (member: ProjectMember) => {
    setEditingMember(member)
    setForm(toFormState(member))
    setDialogOpen(true)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!form.email.trim()) {
      toast.error('请输入成员邮箱')
      return
    }

    if (
      editingMember?.role === 'OWNER' &&
      form.role !== 'OWNER' &&
      ownerCount <= 1
    ) {
      toast.error('不能调整最后一个 Owner 的角色')
      return
    }

    const nextMember: ProjectMember = {
      id: editingMember?.id ?? `member_${Date.now()}`,
      name: form.name.trim() || form.email.trim(),
      email: form.email.trim(),
      role: form.role,
      joinedAt: editingMember?.joinedAt ?? new Date().toISOString(),
      lastActiveAt: editingMember?.lastActiveAt,
    }

    setMembers((current) =>
      editingMember
        ? current.map((item) =>
            item.id === editingMember.id ? nextMember : item
          )
        : [nextMember, ...current]
    )
    setDialogOpen(false)
    toast.success(editingMember ? '成员权限已更新' : '成员已添加')
  }

  const handleDelete = () => {
    if (!deletingMember) {
      return
    }

    if (deletingMember.role === 'OWNER' && ownerCount <= 1) {
      toast.error('不能删除最后一个 Owner')
      setDeletingMember(null)
      return
    }

    setMembers((current) =>
      current.filter((member) => member.id !== deletingMember.id)
    )
    toast.success('成员已删除')
    setDeletingMember(null)
  }

  return (
    <ContentSection
      title='项目成员'
      desc='管理项目级成员和角色，角色范围为 owner、admin、member、viewer。'
    >
      <div className='flex flex-col gap-4'>
        <div className='flex justify-end'>
          <Button onClick={openCreateDialog}>
            <Plus data-icon='inline-start' />
            新增成员
          </Button>
        </div>
        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>成员</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>加入时间</TableHead>
                <TableHead>最近活跃</TableHead>
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
                        {member.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ROLE_BADGE_VARIANTS[member.role]}>
                      {ROLE_LABELS[member.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(member.joinedAt)}</TableCell>
                  <TableCell>{formatDateTime(member.lastActiveAt)}</TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-2'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => openEditDialog(member)}
                      >
                        <Pencil data-icon='inline-start' />
                        权限
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => setDeletingMember(member)}
                      >
                        <Trash2 data-icon='inline-start' />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingMember ? '编辑成员权限' : '新增项目成员'}
              </DialogTitle>
              <DialogDescription>
                Mock 模式仅更新当前页面状态，不会发送邀请或修改后端权限。
              </DialogDescription>
            </DialogHeader>
            <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='member-name'>姓名</Label>
                <Input
                  id='member-name'
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder='输入成员姓名'
                />
              </div>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='member-email'>邮箱</Label>
                <Input
                  id='member-email'
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder='name@example.com'
                  disabled={Boolean(editingMember)}
                />
              </div>
              <div className='flex flex-col gap-2'>
                <Label>项目角色</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      role: value as ProjectRole,
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type='submit'>{editingMember ? '保存' : '添加'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={Boolean(deletingMember)}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingMember(null)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除项目成员</AlertDialogTitle>
              <AlertDialogDescription>
                将从当前项目移除 {deletingMember?.email}
                ，不会删除用户或组织成员关系。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ContentSection>
  )
}
