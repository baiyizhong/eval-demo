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
  createProjectModelDefinition,
  deleteProjectLlmConnection,
  deleteProjectModelDefinition,
  getProjectModelSettings,
  updateProjectLlmConnection,
  updateProjectDefaultModel,
  updateProjectModelDefinition,
  type DefaultModelPayload,
  type LlmConnectionPayload,
  type ModelDefinitionPayload,
} from '../api/model-settings-api'
import type { LlmConnection, ModelDefinition } from '../types'

type DefaultModelFormState = DefaultModelPayload

type LlmConnectionFormState = {
  provider: string
  adapter: string
  secretKey: string
  baseUrl: string
  customModels: string
  withDefaultModels: string
}

type ModelDefinitionFormState = ModelDefinitionPayload

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

const emptyModelForm: ModelDefinitionFormState = {
  modelName: '',
  matchPattern: '',
  unit: 'TOKENS',
  inputPrice: '',
  outputPrice: '',
  tokenizerId: 'openai',
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
  const [modelDialogOpen, setModelDialogOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelDefinition | null>(null)
  const [modelForm, setModelForm] =
    useState<ModelDefinitionFormState>(emptyModelForm)

  const settings = settingsQuery.data
  const connections = useMemo(
    () => settings?.connections ?? [],
    [settings?.connections]
  )
  const modelDefinitions = useMemo(
    () => settings?.modelDefinitions ?? [],
    [settings?.modelDefinitions]
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
  const modelMutation = useMutation({
    mutationFn: (input: ModelDefinitionPayload) =>
      editingModel
        ? updateProjectModelDefinition($api, projectId, editingModel.id, input)
        : createProjectModelDefinition($api, projectId, input),
    onSuccess: async () => {
      await invalidateSettings()
      setModelDialogOpen(false)
      setEditingModel(null)
      setModelForm(emptyModelForm)
      toast.success(editingModel ? '模型定义已更新' : '模型定义已新增')
    },
  })
  const deleteModelMutation = useMutation({
    mutationFn: (model: ModelDefinition) =>
      deleteProjectModelDefinition($api, projectId, model.id),
    onSuccess: async () => {
      await invalidateSettings()
      toast.success('模型定义已删除')
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

  const handleModelSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canEditModels) return

    if (!modelForm.modelName.trim()) {
      toast.error('请输入模型名称')
      return
    }
    await modelMutation.mutateAsync({
      ...modelForm,
      modelName: modelForm.modelName.trim(),
      matchPattern: modelForm.matchPattern.trim(),
      unit: modelForm.unit.trim() || 'TOKENS',
      inputPrice: modelForm.inputPrice.trim(),
      outputPrice: modelForm.outputPrice.trim(),
      tokenizerId: modelForm.tokenizerId.trim(),
    })
  }

  const openCreateModel = () => {
    if (!canEditModels) return

    setEditingModel(null)
    setModelForm(emptyModelForm)
    setModelDialogOpen(true)
  }

  const openEditModel = (model: ModelDefinition) => {
    if (!canEditModels) return

    setEditingModel(model)
    setModelForm({
      modelName: model.modelName,
      matchPattern: model.matchPattern,
      unit: model.unit,
      inputPrice: model.inputPrice,
      outputPrice: model.outputPrice,
      tokenizerId: model.tokenizerId,
    })
    setModelDialogOpen(true)
  }

  const deleteModel = async (model: ModelDefinition) => {
    if (!canEditModels) return

    if (
      await confirm({
        title: '删除模型定义',
        desc: `确定删除「${model.modelName}」吗？`,
        confirmText: '删除',
        destructive: true,
      })
    ) {
      await deleteModelMutation.mutateAsync(model)
    }
  }

  return (
    <ContentSection
      title='模型设置'
      desc='配置默认评估模型、LLM Provider 连接和项目级模型定义。'
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

            <Card>
              <CardHeader>
                <div className='flex items-start justify-between gap-4'>
                  <CardTitle>模型定义</CardTitle>
                  {canEditModels ? (
                    <Button type='button' size='sm' onClick={openCreateModel}>
                      <Plus data-icon='inline-start' />
                      新增模型
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <div className='rounded-lg border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>模型名称</TableHead>
                        <TableHead>匹配规则</TableHead>
                        <TableHead>价格</TableHead>
                        <TableHead>Tokenizer</TableHead>
                        {canEditModels ? (
                          <TableHead className='w-32 text-right'>操作</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modelDefinitions.map((model) => (
                        <TableRow key={model.id}>
                          <TableCell className='font-medium'>
                            {model.modelName}
                          </TableCell>
                          <TableCell>{model.matchPattern || '-'}</TableCell>
                          <TableCell>
                            <div className='flex flex-col gap-1'>
                              <span>输入：{model.inputPrice || '-'}</span>
                              <span>输出：{model.outputPrice || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell>{model.tokenizerId || '-'}</TableCell>
                          {canEditModels ? (
                            <TableCell>
                              <div className='flex justify-end gap-2'>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='icon'
                                  onClick={() => openEditModel(model)}
                                  aria-label='编辑模型定义'
                                >
                                  <Pencil />
                                </Button>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='icon'
                                  disabled={deleteModelMutation.isPending}
                                  onClick={() => void deleteModel(model)}
                                  aria-label='删除模型定义'
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                      {modelDefinitions.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={canEditModels ? 5 : 4}
                            className='text-muted-foreground h-24 text-center'
                          >
                            暂无模型定义
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
                  ? 'Secret Key 留空时保留原密钥；填写后会提交到后端替换保存。'
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
                  <Input
                    id='llm-adapter'
                    value={llmForm.adapter}
                    onChange={(event) =>
                      setLlmForm((current) => ({
                        ...current,
                        adapter: event.target.value,
                      }))
                    }
                  />
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

        <Dialog
          open={canEditModels && modelDialogOpen}
          onOpenChange={(open) => {
            setModelDialogOpen(open)
            if (!open) {
              setEditingModel(null)
              setModelForm(emptyModelForm)
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingModel ? '编辑模型定义' : '新增模型定义'}
              </DialogTitle>
              <DialogDescription>
                用于项目内模型计费、匹配和评估模型候选展示。
              </DialogDescription>
            </DialogHeader>
            <form className='flex flex-col gap-4' onSubmit={handleModelSubmit}>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='model-name'>模型名称</Label>
                  <Input
                    id='model-name'
                    value={modelForm.modelName}
                    onChange={(event) =>
                      setModelForm((current) => ({
                        ...current,
                        modelName: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='model-pattern'>匹配规则</Label>
                  <Input
                    id='model-pattern'
                    value={modelForm.matchPattern}
                    onChange={(event) =>
                      setModelForm((current) => ({
                        ...current,
                        matchPattern: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className='grid gap-4 sm:grid-cols-3'>
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='model-unit'>计量单位</Label>
                  <Input
                    id='model-unit'
                    value={modelForm.unit}
                    onChange={(event) =>
                      setModelForm((current) => ({
                        ...current,
                        unit: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='model-input-price'>输入价格</Label>
                  <Input
                    id='model-input-price'
                    value={modelForm.inputPrice}
                    onChange={(event) =>
                      setModelForm((current) => ({
                        ...current,
                        inputPrice: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='model-output-price'>输出价格</Label>
                  <Input
                    id='model-output-price'
                    value={modelForm.outputPrice}
                    onChange={(event) =>
                      setModelForm((current) => ({
                        ...current,
                        outputPrice: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='model-tokenizer'>Tokenizer</Label>
                <Input
                  id='model-tokenizer'
                  value={modelForm.tokenizerId}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      tokenizerId: event.target.value,
                    }))
                  }
                />
              </div>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setModelDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type='submit' disabled={modelMutation.isPending}>
                  {editingModel ? '保存' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </ContentSection>
  )
}
