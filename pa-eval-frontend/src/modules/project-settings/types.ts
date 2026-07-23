export type ScoreConfigDataType = 'NUMERIC' | 'CATEGORICAL' | 'BOOLEAN' | 'TEXT'

export type ProjectRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

export type ProjectInfo = {
  id: string
  organizationName: string
  name: string
  description: string
  retentionDays: number
  createdAt: string
  updatedAt: string
}

export type ScoreConfig = {
  id: string
  name: string
  dataType: ScoreConfigDataType
  description: string
  minValue?: number
  maxValue?: number
  categories?: string[]
  isArchived: boolean
  updatedAt: string
}

export type ProjectMember = {
  id: string
  name: string
  email: string
  role: ProjectRole
  joinedAt: string
  lastActiveAt?: string
}

export type LlmConnection = {
  id: string
  provider: string
  adapter: string
  displaySecretKey: string
  baseUrl: string
  customModels: string[]
  withDefaultModels: boolean
}

export type DefaultModel = {
  id: string
  llmConnectionId: string
  provider: string
  adapter: string
  model: string
  temperature: string
}

export type ProjectApiKey = {
  id: string
  projectId: string
  note: string
  publicKey: string
  secretKey: string
  status: string
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}
