import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import {
  Eye,
  FileCode,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DataTable,
  type ColumnDef,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { EvaluationPageNav } from '@/modules/app-evaluation/components/evaluation-page-nav'
import {
  deleteSkill,
  listSkills,
  uploadSkill,
  type SkillRecord,
} from '../api/skill-api'

const SKILL_QUERY_KEY = ['project-skills'] as const

type SkillDetailDialog = {
  name: string
  description: string
  skillMd: string
} | null

export function ProjectSkills() {
  const $api = useAPI()
  const { projectId = '' } = useParams()
  const { can } = usePermission({ type: 'project', projectId })
  const canEdit = can('project:evaluator:edit')
  const queryClient = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detailDialog, setDetailDialog] = useState<SkillDetailDialog>(null)
  const [deleteTarget, setDeleteTarget] = useState<SkillRecord | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: [...SKILL_QUERY_KEY, projectId],
    queryFn: () => listSkills($api, projectId),
    enabled: Boolean(projectId),
  })

  const uploadMutation = useMutation({
    mutationFn: ({
      name,
      file,
      overwrite,
    }: {
      name: string
      file: File
      overwrite: boolean
    }) => uploadSkill($api, projectId, name, file, overwrite),
    onSuccess: () => {
      toast.success('Skill 上传成功')
      queryClient.invalidateQueries({ queryKey: [...SKILL_QUERY_KEY, projectId] })
      setUploadOpen(false)
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Skill 上传失败'
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (skillName: string) => deleteSkill($api, projectId, skillName),
    onSuccess: () => {
      toast.success('Skill 已删除')
      queryClient.invalidateQueries({ queryKey: [...SKILL_QUERY_KEY, projectId] })
      setDeleteTarget(null)
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Skill 删除失败'
      toast.error(message)
    },
  })

  const skills = data?.datas ?? []

  const columns: ColumnDef<SkillRecord>[] = [
    {
      accessorKey: 'name',
      header: '名称',
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'description',
      header: '描述',
      cell: ({ row }) => (
        <span className='text-muted-foreground line-clamp-2 max-w-md'>
          {row.original.description || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'source',
      header: '来源',
      cell: ({ row }) => (
        <Badge variant={row.original.source === 'BUILTIN' ? 'secondary' : 'default'}>
          {row.original.source === 'BUILTIN' ? '预置' : '项目'}
        </Badge>
      ),
    },
    {
      accessorKey: 'updatedAt',
      header: '更新时间',
      cell: ({ row }) => (
        <span className='text-muted-foreground text-sm'>
          {row.original.updatedAt}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const skill = row.original
        return (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon' className='h-8 w-8'>
                  <MoreHorizontal className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  onClick={() =>
                    setDetailDialog({
                      name: skill.name,
                      description: skill.description,
                      skillMd: '',
                    })
                  }
                >
                  <Eye className='mr-2 h-4 w-4' />
                  查看详情
                </DropdownMenuItem>
                {skill.source === 'PROJECT' && canEdit ? (
                  <DropdownMenuItem
                    className='text-destructive'
                    onClick={() => setDeleteTarget(skill)}
                  >
                    <Trash2 className='mr-2 h-4 w-4' />
                    删除
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <EvaluationPageNav
          buttonGroups={{
            buttons: [
              {
                id: 'refresh',
                label: '刷新',
                icon: RefreshCw,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                onClick: () => void refetch(),
              },
              ...(canEdit
                ? [
                    {
                      id: 'upload',
                      label: '上传 Skill',
                      icon: Upload,
                      iconPosition: 'start',
                      size: 'sm',
                      onClick: () => setUploadOpen(true),
                    },
                  ]
                : []),
            ],
          }}
        />
        {isLoading ? (
          <Loading />
        ) : (
          <DataTable
            data={skills}
            columns={columns}
            emptyMessage='暂无 Skill，点击「上传 Skill」添加'
          />
        )}

      <SkillUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={(name, file, overwrite) =>
          uploadMutation.mutate({ name, file, overwrite })
        }
        loading={uploadMutation.isPending}
      />

      <SkillDetailViewer
        detail={detailDialog}
        onClose={() => setDetailDialog(null)}
        projectId={projectId}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 Skill「{deleteTarget?.name}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.name)
              }
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}

function SkillUploadDialog({
  open,
  onOpenChange,
  onUpload,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: (name: string, file: File, overwrite: boolean) => void
  loading: boolean
}) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('请输入 Skill 名称')
      return
    }
    if (!file) {
      toast.error('请选择 Skill 压缩包')
      return
    }
    onUpload(name.trim(), file, overwrite)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (selected) {
      setFile(selected)
      if (!name.trim()) {
        const basename = selected.name.replace(/\.(zip|tar\.gz|tgz)$/, '')
        setName(basename.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>上传 Skill</DialogTitle>
          <DialogDescription>
            上传 Skill 压缩包（.zip 或 .tar.gz），解压后需包含 SKILL.md。
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='skill-name'>Skill 名称</Label>
            <Input
              id='skill-name'
              placeholder='my-eval-skill'
              value={name}
              onChange={(e) => setName(e.target.value)}
              pattern='[a-z0-9-]+'
              maxLength={64}
            />
            <p className='text-muted-foreground text-xs'>
              仅允许小写字母、数字、连字符，须与 SKILL.md 中的 name 一致
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='skill-file'>Skill 压缩包</Label>
            <Input
              id='skill-file'
              ref={fileInputRef}
              type='file'
              accept='.zip,.tar.gz,.tgz'
              onChange={handleFileChange}
            />
            {file ? (
              <p className='text-muted-foreground text-xs'>
                已选择: {file.name}（{(file.size / 1024).toFixed(1)} KB）
              </p>
            ) : null}
          </div>
          <div className='flex items-center space-x-2'>
            <input
              id='skill-overwrite'
              type='checkbox'
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className='h-4 w-4 rounded border-gray-300'
            />
            <Label htmlFor='skill-overwrite' className='text-sm font-normal'>
              同名时覆盖
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? '上传中...' : '上传'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SkillDetailViewer({
  detail,
  onClose,
  projectId,
}: {
  detail: SkillDetailDialog
  onClose: () => void
  projectId: string
}) {
  const $api = useAPI()
  const { data, isLoading } = useQuery({
    queryKey: ['project-skill-detail', projectId, detail?.name],
    queryFn: () =>
      $api.getSkill<{ skillMd: string; description: string; body: string }>({
        path: { projectId, skillName: detail!.name },
      }),
    enabled: Boolean(detail),
  })

  if (!detail) return null

  return (
    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-w-3xl max-h-[80vh] overflow-hidden flex flex-col'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <FileCode className='h-5 w-5' />
            {detail.name}
          </DialogTitle>
          <DialogDescription>
            {data?.description || detail.description}
          </DialogDescription>
        </DialogHeader>
        <div className='flex-1 overflow-auto'>
          {isLoading ? (
            <Loading />
          ) : (
            <pre className='bg-muted rounded-md p-4 text-sm whitespace-pre-wrap'>
              {data?.skillMd || '加载失败'}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
