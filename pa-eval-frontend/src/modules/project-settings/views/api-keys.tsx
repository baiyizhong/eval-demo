import { type FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { useParams } from 'react-router'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ContentSection } from '@/components/common/content-section'
import { useAPI } from '@/hooks/use-api'
import {
  createProjectApiKey,
  deleteProjectApiKey,
  listProjectApiKeys,
  updateProjectApiKey,
} from '../api/api-keys-api'
import type { ProjectApiKey } from '../types'

const DEFAULT_PROJECT_ID = 'project_customer_agent'

function formatDateTime(value?: string | null) {
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

async function copyValue(label: string, value: string) {
  await navigator.clipboard.writeText(value)
  toast.success(`${label} 已复制`)
}

export function ProjectApiKeysSettings() {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { projectId = DEFAULT_PROJECT_ID } = useParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<ProjectApiKey | null>(null)
  const [deletingKey, setDeletingKey] = useState<ProjectApiKey | null>(null)
  const [note, setNote] = useState('')
  const [createdKey, setCreatedKey] = useState<ProjectApiKey | null>(null)

  const queryKey = ['project-api-keys', $api, projectId] as const
  const apiKeysQuery = useQuery({
    queryKey,
    queryFn: () =>
      listProjectApiKeys($api, projectId, {
        page: 1,
        pageSize: 100,
      }),
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey })
  }

  const createMutation = useMutation({
    mutationFn: (input: { note: string }) =>
      createProjectApiKey($api, projectId, input),
    onSuccess: async (apiKey) => {
      setCreatedKey(apiKey)
      setDialogOpen(false)
      await invalidate()
      toast.success('项目 API Key 已创建')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ keyId, input }: { keyId: string; input: { note: string } }) =>
      updateProjectApiKey($api, projectId, keyId, input),
    onSuccess: async () => {
      setDialogOpen(false)
      await invalidate()
      toast.success('API Key 备注已更新')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => deleteProjectApiKey($api, projectId, keyId),
    onSuccess: async () => {
      setDeletingKey(null)
      await invalidate()
      toast.success('API Key 已删除')
    },
  })

  const openCreateDialog = () => {
    setEditingKey(null)
    setNote('')
    setDialogOpen(true)
  }

  const openEditDialog = (apiKey: ProjectApiKey) => {
    setEditingKey(apiKey)
    setNote(apiKey.note)
    setDialogOpen(true)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedNote = note.trim() || '未命名 Key'

    if (editingKey) {
      updateMutation.mutate({
        keyId: editingKey.id,
        input: { note: trimmedNote },
      })
      return
    }

    createMutation.mutate({ note: trimmedNote })
  }

  const handleDelete = () => {
    if (!deletingKey) {
      return
    }
    deleteMutation.mutate(deletingKey.id)
  }

  const apiKeys = apiKeysQuery.data?.datas ?? []

  return (
    <ContentSection
      title='Project API Keys'
      desc='管理当前项目的 Langfuse 访问密钥。Public Key 和 Secret Key 会保存在 PA 扩展表中，可重复查看和复制。'
    >
      <div className='flex flex-col gap-4'>
        <div className='border-border bg-muted/40 flex items-start gap-3 rounded-md border p-3 text-sm'>
          <KeyRound className='mt-0.5 size-4 shrink-0' />
          <div className='space-y-1'>
            <div className='font-medium'>Secret Key 当前支持重复查看</div>
            <p className='text-muted-foreground'>
              请只在 Dify、n8n、本地调试或可信服务中使用，不要写入前端代码、文档或日志。
            </p>
          </div>
        </div>

        {createdKey ? (
          <div className='flex flex-col gap-3 rounded-md border p-4'>
            <div className='flex items-center gap-2 font-medium'>
              <KeyRound className='size-4' />
              新创建的 Langfuse 密钥
            </div>
            <KeyValueRow label='LANGFUSE_PUBLIC_KEY' value={createdKey.publicKey} />
            <KeyValueRow label='LANGFUSE_SECRET_KEY' value={createdKey.secretKey} />
            <div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setCreatedKey(null)}
              >
                收起
              </Button>
            </div>
          </div>
        ) : null}

        <div className='flex justify-end'>
          <Button onClick={openCreateDialog}>
            <Plus data-icon='inline-start' />
            新增 Key
          </Button>
        </div>

        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>备注</TableHead>
                <TableHead>LANGFUSE_PUBLIC_KEY</TableHead>
                <TableHead>LANGFUSE_SECRET_KEY</TableHead>
                <TableHead>最近使用</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className='text-end'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeysQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-muted-foreground h-24 text-center'>
                    正在加载项目 API Keys
                  </TableCell>
                </TableRow>
              ) : null}
              {!apiKeysQuery.isLoading && apiKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-muted-foreground h-24 text-center'>
                    当前项目暂无 API Keys
                  </TableCell>
                </TableRow>
              ) : null}
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium'>{apiKey.note}</span>
                      <Badge variant='outline'>PROJECT</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <KeyCell label='LANGFUSE_PUBLIC_KEY' value={apiKey.publicKey} />
                  </TableCell>
                  <TableCell>
                    <KeyCell label='LANGFUSE_SECRET_KEY' value={apiKey.secretKey} />
                  </TableCell>
                  <TableCell>{formatDateTime(apiKey.lastUsedAt)}</TableCell>
                  <TableCell>{formatDateTime(apiKey.createdAt)}</TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-2'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => openEditDialog(apiKey)}
                      >
                        <Pencil data-icon='inline-start' />
                        备注
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => setDeletingKey(apiKey)}
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
                {editingKey ? '编辑 Key 备注' : '新增项目 Key'}
              </DialogTitle>
              <DialogDescription>
                创建后会生成一组可重复查看的 LANGFUSE_PUBLIC_KEY 和
                LANGFUSE_SECRET_KEY。
              </DialogDescription>
            </DialogHeader>
            <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='api-key-note'>备注</Label>
                <Input
                  id='api-key-note'
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder='例如 Dify 评估工作流'
                />
              </div>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type='submit'
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingKey ? '保存' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={Boolean(deletingKey)}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingKey(null)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除 API Key</AlertDialogTitle>
              <AlertDialogDescription>
                删除后该项目 Key 将不可再用于访问项目 API。历史记录不会被修改。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleDelete()}>
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ContentSection>
  )
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='grid gap-1'>
      <Label>{label}</Label>
      <div className='bg-muted flex items-center justify-between gap-2 rounded-md p-3'>
        <code className='min-w-0 break-all text-xs'>{value}</code>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => void copyValue(label, value)}
        >
          <Copy data-icon='inline-start' />
          复制
        </Button>
      </div>
    </div>
  )
}

function KeyCell({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex max-w-[360px] items-center gap-2'>
      <code className='bg-muted min-w-0 flex-1 rounded px-2 py-1 text-xs break-all'>
        {value}
      </code>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={() => void copyValue(label, value)}
      >
        <Copy className='size-4' />
        <span className='sr-only'>复制 {label}</span>
      </Button>
    </div>
  )
}
