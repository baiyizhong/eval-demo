import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Loading } from '@/components/common/loading'
import {
  createProjectLlmConnection,
  deleteProjectLlmConnection,
  getProjectModelSettings,
  updateProjectLlmConnection,
  updateProjectDefaultModel,
  type DefaultModelPayload,
  type LlmConnectionPayload,
} from '../api/model-settings-api'
import type { LlmConnection } from '../types'

type DefaultModelFormState = DefaultModelPayload

type LlmConnectionFormState = {
  provider: string
  adapter: string
  secretKey: string
  baseUrl: string
  customModels: string
  withDefaultModels: string
}

const llmAdapterOptions = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'bedrock', label: 'AWS Bedrock' },
  { value: 'google-vertex-ai', label: 'Google Vertex AI' },
  { value: 'google-ai-studio', label: 'Google AI Studio' },
]

const emptyDefaultModel: DefaultModelFormState = {
  llmConnectionId: '',
  model: '',
  temperature: '0.2',
}

const emptyLlmForm: LlmConnectionFormState = {
  provider: '',
  adapter: 'openai',
  secretKey: '',
  baseUrl: '',
  customModels: '',
  withDefaultModels: 'true',
}

export function ProjectModelsSettings() {
  const { projectId = '' } = useParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditModels = can('project:model:edit')
  const queryKey = ['project-model-settings', $api, projectId] as const
  const settingsQuery = useQuery({
    queryKey,
    enabled: Boolean(projectId),
    queryFn: () => getProjectModelSettings($api, projectId),
  })
  const [defaultModelDraft, setDefaultModelDraft] =
    useState<DefaultModelFormState | null>(null)
  const [llmDialogOpen, setLlmDialogOpen] = useState(false)
  const [editingConnection, setEditingConnection] =
    useState<LlmConnection | null>(null)
  const [llmForm, setLlmForm] = useState<LlmConnectionFormState>(emptyLlmForm)

  const settings = settingsQuery.data
  const connections = useMemo(
    () => settings?.connections ?? [],
    [settings?.connections]
  )
  const loadedDefaultModel = useMemo(
    () =>
      settings?.defaultModel
        ? {
            llmConnectionId: settings.defaultModel.llmConnectionId,
            model: settings.defaultModel.model,
            temperature: settings.defaultModel.temperature,
          }
        : emptyDefaultModel,
    [settings]
  )
  const defaultModel = defaultModelDraft ?? loadedDefaultModel
  const selectedConnection = useMemo(
    () =>
      connections.find(
        (connection) => connection.id === defaultModel.llmConnectionId
      ) ?? connections[0],
    [connections, defaultModel.llmConnectionId]
  )
  const availableModels = selectedConnection?.customModels ?? []

  const invalidateSettings = () =>
    queryClient.invalidateQueries({ queryKey: ['project-model-settings'] })
  const defaultMutation = useMutation({
    mutationFn: (input: DefaultModelPayload) =>
      updateProjectDefaultModel($api, projectId, input),
    onSuccess: async () => {
      await invalidateSettings()
      setDefaultModelDraft(null)
      toast.success('默认评估模型已保存')
    },
  })
  const connectionMutation = useMutation({
    mutationFn: (input: LlmConnectionPayload) =>
      editingConnection
        ? updateProjectLlmConnection(
            $api,
            projectId,
            editingConnection.id,
            input
          )
        : createProjectLlmConnection($api, projectId, input),
    onSuccess: async () => {
      await invalidateSettings()
      setLlmDialogOpen(false)
      setEditingConnection(null)
      setLlmForm(emptyLlmForm)
      toast.success(editingConnection ? 'LLM 连接已更新' : 'LLM 连接已新增')
    },
  })
  const deleteConnectionMutation = useMutation({
    mutationFn: (connection: LlmConnection) =>
      deleteProjectLlmConnection($api, projectId, connection.id),
    onSuccess: async () => {
      await invalidateSettings()
      toast.success('LLM 连接已删除')
    },
  })
  const handleDefaultSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canEditModels) return

    if (!defaultModel.llmConnectionId || !defaultModel.model) {
      toast.error('请选择 LLM 连接和模型')
      return
    }
    await defaultMutation.mutateAsync(defaultModel)
  }

  const handleLlmSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canEditModels) return

    if (!llmForm.provider.trim()) {
      toast.error('请输入 Provider 名称')
      return
    }
    if (!llmForm.secretKey.trim()) {
      toast.error('请输入 Secret Key')
      return
    }
    await connectionMutation.mutateAsync({
      provider: llmForm.provider.trim(),
      adapter: llmForm.adapter.trim() || 'openai',
      secretKey: llmForm.secretKey.trim(),
      baseUrl: llmForm.baseUrl.trim(),
      customModels: llmForm.customModels
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      withDefaultModels: llmForm.withDefaultModels === 'true',
    })
  }

  const openCreateConnection = () => {
    if (!canEditModels) return

    setEditingConnection(null)
    setLlmForm(emptyLlmForm)
    setLlmDialogOpen(true)
  }

  const openEditConnection = (connection: LlmConnection) => {
    if (!canEditModels) return

    setEditingConnection(connection)
    setLlmForm({
      provider: connection.provider,
      adapter: connection.adapter,
      secretKey: '',
      baseUrl: connection.baseUrl,
      customModels: connection.customModels.join(', '),
      withDefaultModels: connection.withDefaultModels ? 'true' : 'false',
    })
    setLlmDialogOpen(true)
  }

  const deleteConnection = async (connection: LlmConnection) => {
    if (!canEditModels) return

    if (
      await confirm({
        title: '删除 LLM 连接',
        desc: `确定删除「${connection.provider}」吗？已保存的默认模型可能需要重新选择。`,
        confirmText: '删除',
        destructive: true,
      })
    ) {
      await deleteConnectionMutation.mutateAsync(connection)
    }
  }

  return (
    <ContentSection
      title='模型设置'
      desc='配置默认评估模型，并复用 Langfuse LLM Connections 管理连接。'
    >
      <div className='flex flex-col gap-6'>
        {settingsQuery.isLoading ? (
          <Loading text='加载模型设置中...' className='min-h-24' />
        ) : null}
        {settingsQuery.isError ? (
          <div className='text-destructive rounded-lg border p-4 text-sm'>
            模型设置加载失败，请确认后端服务和项目权限。
          </div>
        ) : null}
        {!settingsQuery.isError ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>默认评估模型</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className='flex flex-col gap-4'
                  onSubmit={handleDefaultSubmit}
                >
                  <div className='flex flex-col gap-2'>
                    <Label>LLM 连接</Label>
                    <Select
                      value={defaultModel.llmConnectionId}
                      disabled={!canEditModels}
                      onValueChange={(value) =>
                        setDefaultModelDraft((current) => ({
                          ...(current ?? defaultModel),
                          llmConnectionId: value,
                          model:
                            connections.find((item) => item.id === value)
                              ?.customModels[0] ?? defaultModel.model,
                        }))
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='选择 LLM 连接' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {connections.map((connection) => (
                            <SelectItem
                              key={connection.id}
                              value={connection.id}
                            >
                              {connection.provider} / {connection.adapter}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='grid gap-4 sm:grid-cols-2'>
                    <div className='flex flex-col gap-2'>
                      <Label>模型</Label>
                      <Select
                        value={defaultModel.model}
                        disabled={!canEditModels}
                        onValueChange={(value) =>
                          setDefaultModelDraft((current) => ({
                            ...(current ?? defaultModel),
                            model: value,
                          }))
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='选择模型' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {availableModels.map((model) => (
                              <SelectItem key={model} value={model}>
                                {model}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='flex flex-col gap-2'>
                      <Label htmlFor='model-temperature'>Temperature</Label>
                      <Input
                        id='model-temperature'
                        value={defaultModel.temperature}
                        disabled={!canEditModels}
                        onChange={(event) =>
                          setDefaultModelDraft((current) => ({
                            ...(current ?? defaultModel),
                            temperature: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  {canEditModels ? (
                    <div>
                      <Button type='submit' disabled={defaultMutation.isPending}>
                        <Save data-icon='inline-start' />
                        保存默认模型
                      </Button>
                    </div>
                  ) : null}
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className='flex items-start justify-between gap-4'>
                  <CardTitle>LLM 连接</CardTitle>
                  {canEditModels ? (
                    <Button
                      type='button'
                      size='sm'
                      onClick={openCreateConnection}
                    >
                      <Plus data-icon='inline-start' />
                      新增连接
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <div className='rounded-lg border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Adapter</TableHead>
                        <TableHead>Secret</TableHead>
                        <TableHead>模型</TableHead>
                        {canEditModels ? (
                          <TableHead className='w-32 text-right'>操作</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {connections.map((connection) => (
                        <TableRow key={connection.id}>
                          <TableCell>
                            <div className='flex flex-col gap-1'>
                              <span className='font-medium'>
                                {connection.provider}
                              </span>
                              <span className='text-muted-foreground max-w-56 truncate'>
                                {connection.baseUrl || '-'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{connection.adapter}</TableCell>
                          <TableCell>
                            {connection.displaySecretKey || '-'}
                          </TableCell>
                          <TableCell>
                            <div className='flex flex-wrap gap-1'>
                              {connection.customModels.map((model) => (
                                <Badge key={model} variant='outline'>
                                  {model}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          {canEditModels ? (
                            <TableCell>
                              <div className='flex justify-end gap-2'>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='icon'
                                  onClick={() => openEditConnection(connection)}
                                  aria-label='编辑 LLM 连接'
                                >
                                  <Pencil />
                                </Button>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='icon'
                                  disabled={deleteConnectionMutation.isPending}
                                  onClick={() =>
                                    void deleteConnection(connection)
                                  }
                                  aria-label='删除 LLM 连接'
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                      {connections.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={canEditModels ? 5 : 4}
                            className='text-muted-foreground h-24 text-center'
                          >
                            暂无 LLM 连接
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
        <Dialog
          open={canEditModels && llmDialogOpen}
          onOpenChange={(open) => {
            setLlmDialogOpen(open)
            if (!open) {
              setEditingConnection(null)
              setLlmForm(emptyLlmForm)
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingConnection ? '编辑 LLM 连接' : '新增 LLM 连接'}
              </DialogTitle>
              <DialogDescription>
                {editingConnection
                  ? '通过 Langfuse LLM Connections API 更新连接，需重新输入 Secret Key。'
                  : 'Secret Key 仅提交到后端保存，页面后续只展示脱敏值。'}
              </DialogDescription>
            </DialogHeader>
            <form className='flex flex-col gap-4' onSubmit={handleLlmSubmit}>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='llm-provider'>Provider</Label>
                  <Input
                    id='llm-provider'
                    value={llmForm.provider}
                    onChange={(event) =>
                      setLlmForm((current) => ({
                        ...current,
                        provider: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='llm-adapter'>Adapter</Label>
                  <Select
                    value={llmForm.adapter}
                    onValueChange={(value) =>
                      setLlmForm((current) => ({
                        ...current,
                        adapter: value,
                      }))
                    }
                  >
                    <SelectTrigger id='llm-adapter' className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {llmAdapterOptions.map((adapter) => (
                          <SelectItem key={adapter.value} value={adapter.value}>
                            {adapter.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='llm-secret'>Secret Key</Label>
                <Input
                  id='llm-secret'
                  type='password'
                  value={llmForm.secretKey}
                  onChange={(event) =>
                    setLlmForm((current) => ({
                      ...current,
                      secretKey: event.target.value,
                    }))
                  }
                />
              </div>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='llm-base-url'>Base URL</Label>
                <Input
                  id='llm-base-url'
                  value={llmForm.baseUrl}
                  onChange={(event) =>
                    setLlmForm((current) => ({
                      ...current,
                      baseUrl: event.target.value,
                    }))
                  }
                />
              </div>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='llm-models'>自定义模型</Label>
                <Input
                  id='llm-models'
                  value={llmForm.customModels}
                  onChange={(event) =>
                    setLlmForm((current) => ({
                      ...current,
                      customModels: event.target.value,
                    }))
                  }
                  placeholder='使用英文逗号分隔'
                />
              </div>
              <div className='flex flex-col gap-2'>
                <Label>包含默认模型</Label>
                <Select
                  value={llmForm.withDefaultModels}
                  onValueChange={(value) =>
                    setLlmForm((current) => ({
                      ...current,
                      withDefaultModels: value,
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value='true'>是</SelectItem>
                      <SelectItem value='false'>否</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setLlmDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type='submit' disabled={connectionMutation.isPending}>
                  {editingConnection ? '保存' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </ContentSection>
  )
}
