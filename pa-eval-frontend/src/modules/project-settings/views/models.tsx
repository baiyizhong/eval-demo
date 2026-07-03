import { type FormEvent, useMemo, useState } from 'react'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import {
  mockDefaultModel,
  mockLlmConnections,
  mockModelDefinitions,
} from '../data/mock'
import type { LlmConnection, ModelDefinition } from '../types'

type DefaultModelFormState = {
  llmConnectionId: string
  model: string
  temperature: string
}

type LlmConnectionFormState = {
  provider: string
  adapter: string
  displaySecretKey: string
  baseUrl: string
  customModels: string
  withDefaultModels: string
}

type ModelDefinitionFormState = {
  modelName: string
  matchPattern: string
  unit: string
  inputPrice: string
  outputPrice: string
  tokenizerId: string
}

const emptyLlmForm: LlmConnectionFormState = {
  provider: '',
  adapter: 'openai',
  displaySecretKey: 'sk-...mock',
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

function toLlmForm(connection: LlmConnection): LlmConnectionFormState {
  return {
    provider: connection.provider,
    adapter: connection.adapter,
    displaySecretKey: connection.displaySecretKey,
    baseUrl: connection.baseUrl,
    customModels: connection.customModels.join(', '),
    withDefaultModels: String(connection.withDefaultModels),
  }
}

function toModelForm(model: ModelDefinition): ModelDefinitionFormState {
  return {
    modelName: model.modelName,
    matchPattern: model.matchPattern,
    unit: model.unit,
    inputPrice: model.inputPrice,
    outputPrice: model.outputPrice,
    tokenizerId: model.tokenizerId,
  }
}

export function ProjectModelsSettings() {
  const [connections, setConnections] = useState(mockLlmConnections)
  const [modelDefinitions, setModelDefinitions] = useState(mockModelDefinitions)
  const [defaultModel, setDefaultModel] = useState<DefaultModelFormState>({
    llmConnectionId: mockDefaultModel.llmConnectionId,
    model: mockDefaultModel.model,
    temperature: mockDefaultModel.temperature,
  })
  const [llmDialogOpen, setLlmDialogOpen] = useState(false)
  const [editingConnection, setEditingConnection] =
    useState<LlmConnection | null>(null)
  const [llmForm, setLlmForm] = useState<LlmConnectionFormState>(emptyLlmForm)
  const [modelDialogOpen, setModelDialogOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelDefinition | null>(null)
  const [modelForm, setModelForm] =
    useState<ModelDefinitionFormState>(emptyModelForm)

  const selectedConnection = useMemo(
    () =>
      connections.find(
        (connection) => connection.id === defaultModel.llmConnectionId
      ) ?? connections[0],
    [connections, defaultModel.llmConnectionId]
  )
  const availableModels = selectedConnection?.customModels ?? []

  const openCreateConnection = () => {
    setEditingConnection(null)
    setLlmForm(emptyLlmForm)
    setLlmDialogOpen(true)
  }

  const openEditConnection = (connection: LlmConnection) => {
    setEditingConnection(connection)
    setLlmForm(toLlmForm(connection))
    setLlmDialogOpen(true)
  }

  const openCreateModel = () => {
    setEditingModel(null)
    setModelForm(emptyModelForm)
    setModelDialogOpen(true)
  }

  const openEditModel = (model: ModelDefinition) => {
    setEditingModel(model)
    setModelForm(toModelForm(model))
    setModelDialogOpen(true)
  }

  const handleDefaultSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    toast.success('默认评估模型已保存')
  }

  const handleLlmSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!llmForm.provider.trim()) {
      toast.error('请输入 Provider 名称')
      return
    }

    const nextConnection: LlmConnection = {
      id: editingConnection?.id ?? `llm_${Date.now()}`,
      provider: llmForm.provider.trim(),
      adapter: llmForm.adapter.trim() || 'openai',
      displaySecretKey: llmForm.displaySecretKey.trim() || 'sk-...mock',
      baseUrl: llmForm.baseUrl.trim(),
      customModels: llmForm.customModels
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      withDefaultModels: llmForm.withDefaultModels === 'true',
    }

    setConnections((current) =>
      editingConnection
        ? current.map((item) =>
            item.id === editingConnection.id ? nextConnection : item
          )
        : [nextConnection, ...current]
    )
    setLlmDialogOpen(false)
    toast.success(editingConnection ? 'LLM 连接已更新' : 'LLM 连接已新增')
  }

  const handleModelSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!modelForm.modelName.trim()) {
      toast.error('请输入模型名称')
      return
    }

    const nextModel: ModelDefinition = {
      id: editingModel?.id ?? `model_${Date.now()}`,
      modelName: modelForm.modelName.trim(),
      matchPattern: modelForm.matchPattern.trim(),
      unit: modelForm.unit.trim() || 'TOKENS',
      inputPrice: modelForm.inputPrice.trim(),
      outputPrice: modelForm.outputPrice.trim(),
      tokenizerId: modelForm.tokenizerId.trim(),
    }

    setModelDefinitions((current) =>
      editingModel
        ? current.map((item) =>
            item.id === editingModel.id ? nextModel : item
          )
        : [nextModel, ...current]
    )
    setModelDialogOpen(false)
    toast.success(editingModel ? '模型定义已更新' : '模型定义已新增')
  }

  const deleteConnection = (connection: LlmConnection) => {
    setConnections((current) =>
      current.filter((item) => item.id !== connection.id)
    )
    toast.success('LLM 连接已删除')
  }

  const deleteModel = (model: ModelDefinition) => {
    setModelDefinitions((current) =>
      current.filter((item) => item.id !== model.id)
    )
    toast.success('模型定义已删除')
  }

  return (
    <ContentSection
      title='模型设置'
      desc='配置默认评估模型、LLM Provider 连接和项目级模型定义。'
    >
      <div className='flex flex-col gap-6'>
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
                  onValueChange={(value) =>
                    setDefaultModel((current) => ({
                      ...current,
                      llmConnectionId: value,
                      model:
                        connections.find((item) => item.id === value)
                          ?.customModels[0] ?? current.model,
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {connections.map((connection) => (
                        <SelectItem key={connection.id} value={connection.id}>
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
                    onValueChange={(value) =>
                      setDefaultModel((current) => ({
                        ...current,
                        model: value,
                      }))
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
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
                    onChange={(event) =>
                      setDefaultModel((current) => ({
                        ...current,
                        temperature: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div>
                <Button type='submit'>
                  <Save data-icon='inline-start' />
                  保存默认模型
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className='flex items-start justify-between gap-4'>
              <CardTitle>LLM 连接</CardTitle>
              <Button type='button' size='sm' onClick={openCreateConnection}>
                <Plus data-icon='inline-start' />
                新增连接
              </Button>
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
                    <TableHead className='text-end'>操作</TableHead>
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
                      <TableCell>{connection.displaySecretKey}</TableCell>
                      <TableCell>
                        <div className='flex flex-wrap gap-1'>
                          {connection.customModels.map((model) => (
                            <Badge key={model} variant='outline'>
                              {model}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='flex justify-end gap-2'>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => openEditConnection(connection)}
                          >
                            <Pencil data-icon='inline-start' />
                            编辑
                          </Button>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => deleteConnection(connection)}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className='flex items-start justify-between gap-4'>
              <CardTitle>模型定义</CardTitle>
              <Button type='button' size='sm' onClick={openCreateModel}>
                <Plus data-icon='inline-start' />
                新增模型
              </Button>
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
                    <TableHead className='text-end'>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelDefinitions.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell className='font-medium'>
                        {model.modelName}
                      </TableCell>
                      <TableCell>{model.matchPattern}</TableCell>
                      <TableCell>
                        <div className='flex flex-col gap-1'>
                          <span>输入：{model.inputPrice || '-'}</span>
                          <span>输出：{model.outputPrice || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{model.tokenizerId}</TableCell>
                      <TableCell>
                        <div className='flex justify-end gap-2'>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => openEditModel(model)}
                          >
                            <Pencil data-icon='inline-start' />
                            编辑
                          </Button>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => deleteModel(model)}
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
          </CardContent>
        </Card>

        <Dialog open={llmDialogOpen} onOpenChange={setLlmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingConnection ? '编辑 LLM 连接' : '新增 LLM 连接'}
              </DialogTitle>
              <DialogDescription>
                Secret Key 仅使用脱敏 mock 值展示，不保存真实密钥。
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
                <Label htmlFor='llm-secret'>脱敏 Secret Key</Label>
                <Input
                  id='llm-secret'
                  value={llmForm.displaySecretKey}
                  onChange={(event) =>
                    setLlmForm((current) => ({
                      ...current,
                      displaySecretKey: event.target.value,
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
                <Button type='submit'>
                  {editingConnection ? '保存' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={modelDialogOpen} onOpenChange={setModelDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingModel ? '编辑模型定义' : '新增模型定义'}
              </DialogTitle>
              <DialogDescription>
                配置模型匹配规则和项目级计价展示信息。
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
              <div className='grid gap-4 sm:grid-cols-2'>
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
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='model-unit'>计价单位</Label>
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
              </div>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setModelDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type='submit'>{editingModel ? '保存' : '创建'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </ContentSection>
  )
}
