import { type FormEvent, useState } from 'react'
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { mockProjectApiKeys } from '../data/mock'
import type { ProjectApiKey } from '../types'

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

function createMockKey(note: string): ProjectApiKey {
  const timestamp = Date.now()

  return {
    id: `key_${timestamp}`,
    note,
    publicKey: `pk-lf-mock-${String(timestamp).slice(-6)}`,
    displaySecretKey: 'sk-lf-...mock',
    createdAt: new Date().toISOString(),
  }
}

export function ProjectApiKeysSettings() {
  const [apiKeys, setApiKeys] = useState(mockProjectApiKeys)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<ProjectApiKey | null>(null)
  const [deletingKey, setDeletingKey] = useState<ProjectApiKey | null>(null)
  const [note, setNote] = useState('')
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null)

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
      setApiKeys((current) =>
        current.map((item) =>
          item.id === editingKey.id ? { ...item, note: trimmedNote } : item
        )
      )
      setDialogOpen(false)
      toast.success('API Key 备注已更新')
      return
    }

    const nextKey = createMockKey(trimmedNote)
    setApiKeys((current) => [nextKey, ...current])
    setOneTimeSecret(`sk-lf-mock-secret-${Date.now()}`)
    setDialogOpen(false)
    toast.success('API Key 已创建')
  }

  const handleDelete = () => {
    if (!deletingKey) {
      return
    }

    setApiKeys((current) =>
      current.filter((apiKey) => apiKey.id !== deletingKey.id)
    )
    toast.success('API Key 已删除')
    setDeletingKey(null)
  }

  return (
    <ContentSection
      title='API Keys'
      desc='管理项目级 API Keys。Secret Key 只在创建成功时完整展示一次。'
    >
      <div className='flex flex-col gap-4'>
        <div className='flex justify-end'>
          <Button onClick={openCreateDialog}>
            <Plus data-icon='inline-start' />
            新增 Key
          </Button>
        </div>
        {oneTimeSecret ? (
          <div className='flex flex-col gap-3 rounded-lg border p-4'>
            <div className='flex items-center gap-2'>
              <KeyRound />
              <div className='font-medium'>Secret Key 仅展示一次</div>
            </div>
            <div className='bg-muted rounded-md p-3 font-mono text-xs'>
              {oneTimeSecret}
            </div>
            <div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setOneTimeSecret(null)}
              >
                我已保存
              </Button>
            </div>
          </div>
        ) : null}
        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>备注</TableHead>
                <TableHead>Public Key</TableHead>
                <TableHead>Secret</TableHead>
                <TableHead>最近使用</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className='text-end'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium'>{apiKey.note}</span>
                      <Badge variant='outline'>PROJECT</Badge>
                    </div>
                  </TableCell>
                  <TableCell className='font-mono text-xs'>
                    {apiKey.publicKey}
                  </TableCell>
                  <TableCell className='font-mono text-xs'>
                    {apiKey.displaySecretKey}
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
                Mock 模式会生成假的 Public Key 和一次性 Secret Key。
              </DialogDescription>
            </DialogHeader>
            <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='api-key-note'>备注</Label>
                <Input
                  id='api-key-note'
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder='例如 CI 评测流水线'
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
                <Button type='submit'>{editingKey ? '保存' : '创建'}</Button>
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
                删除后该项目 Key 将不可再用于访问项目 API。
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
