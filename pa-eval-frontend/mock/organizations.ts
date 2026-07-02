import type { MockMethod } from 'vite-plugin-mock'

import {
  canAssignRole,
  canManageMembers,
  canRemoveMember,
} from '../src/modules/organization-management/data/permissions'
import {
  organizationRoleSchema,
  type Organization,
  type OrganizationApiKey,
  type OrganizationMember,
  type OrganizationRole,
} from '../src/modules/organization-management/data/schema'

type MockRecord = Record<string, string | string[] | undefined>

type MockRequest = {
  url: MockRecord | string
  body: Record<string, unknown>
  query: MockRecord
  headers: MockRecord
}

type MockResponse<T> = {
  code: number
  message: string
  data: T
  txId: string
}

const RESPONSE_CODE = {
  success: 0,
  badRequest: 1001,
  forbidden: 1003,
  notFound: 1004,
} as const

const CURRENT_USER = {
  id: 'user-current',
  name: '陈默',
  email: 'chenmo@pa-eval.dev',
}

const now = () => new Date().toISOString()

const createTxId = () =>
  `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const success = <T>(data: T): MockResponse<T> => ({
  code: RESPONSE_CODE.success,
  message: 'success',
  data,
  txId: createTxId(),
})

const failure = <T>(
  code: number,
  message: string,
  data: T
): MockResponse<T> => ({
  code,
  message,
  data,
  txId: createTxId(),
})

const toNumber = (value: string | string[] | undefined, fallback: number) => {
  if (typeof value !== 'string') {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const toStringValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const parseOrganizationRole = (value: unknown): OrganizationRole | null => {
  const result = organizationRoleSchema.safeParse(value)
  return result.success ? result.data : null
}

const paginate = <T>(items: T[], query: MockRecord) => {
  const page = toNumber(query.page, 1)
  const pageSize = toNumber(query.pageSize, 10)
  const startIndex = (page - 1) * pageSize

  return {
    total: items.length,
    datas: items.slice(startIndex, startIndex + pageSize),
  }
}

const maskSecretKey = (secretKey: string) =>
  `${secretKey.slice(0, 10)}...${secretKey.slice(-4)}`

const organizations: Organization[] = [
  {
    id: 'org-owner-001',
    name: 'PA 平台主组织',
    description: '当前用户为 Owner，用于完整管理流程验证',
    subsystem: 'evaluation',
    publicKey: 'pk-live-owner001',
    secretKeyMasked: 'sk-live-own...r001',
    createdBy: 'system.seed',
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-07-01T09:30:00.000Z',
  },
  {
    id: 'org-admin-001',
    name: '模型评测 Admin 组织',
    description: '当前用户为 Admin，用于权限受限场景',
    subsystem: 'model-eval',
    publicKey: 'pk-live-admin001',
    secretKeyMasked: 'sk-live-adm...0001',
    createdBy: 'system.seed',
    createdAt: '2026-06-05T08:00:00.000Z',
    updatedAt: '2026-07-01T09:30:00.000Z',
  },
  {
    id: 'org-member-001',
    name: '数据标注协作组织',
    description: '当前用户为 Member，用于禁用成员管理操作',
    subsystem: 'annotation',
    publicKey: 'pk-live-member001',
    secretKeyMasked: 'sk-live-mem...0001',
    createdBy: 'system.seed',
    createdAt: '2026-06-08T08:00:00.000Z',
    updatedAt: '2026-07-01T09:30:00.000Z',
  },
  {
    id: 'org-viewer-001',
    name: '只读审计组织',
    description: '当前用户为 Viewer，用于只读场景',
    subsystem: 'audit',
    publicKey: 'pk-live-view001',
    secretKeyMasked: 'sk-live-vie...0001',
    createdBy: 'system.seed',
    createdAt: '2026-06-10T08:00:00.000Z',
    updatedAt: '2026-07-01T09:30:00.000Z',
  },
]

const members: OrganizationMember[] = [
  {
    id: 'mem-owner-self',
    organizationId: 'org-owner-001',
    userId: CURRENT_USER.id,
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
    role: 'OWNER',
    status: 'ACTIVE',
    joinedAt: '2026-06-01T08:00:00.000Z',
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-06-01T08:00:00.000Z',
  },
  {
    id: 'mem-owner-002',
    organizationId: 'org-owner-001',
    userId: 'user-owner-002',
    name: '林雪',
    email: 'linxue@pa-eval.dev',
    role: 'OWNER',
    status: 'ACTIVE',
    joinedAt: '2026-06-02T08:00:00.000Z',
    createdAt: '2026-06-02T08:00:00.000Z',
    updatedAt: '2026-06-20T09:00:00.000Z',
  },
  {
    id: 'mem-owner-003',
    organizationId: 'org-owner-001',
    userId: 'user-admin-001',
    name: '何川',
    email: 'hechuan@pa-eval.dev',
    role: 'ADMIN',
    status: 'ACTIVE',
    joinedAt: '2026-06-03T08:00:00.000Z',
    createdAt: '2026-06-03T08:00:00.000Z',
    updatedAt: '2026-06-21T09:00:00.000Z',
  },
  {
    id: 'mem-owner-004',
    organizationId: 'org-owner-001',
    userId: 'user-admin-002',
    name: '张一舟',
    email: 'zhangyizhou@pa-eval.dev',
    role: 'ADMIN',
    status: 'INVITED',
    joinedAt: '2026-06-04T08:00:00.000Z',
    createdAt: '2026-06-04T08:00:00.000Z',
    updatedAt: '2026-06-22T09:00:00.000Z',
  },
  {
    id: 'mem-owner-005',
    organizationId: 'org-owner-001',
    userId: 'user-member-001',
    name: '苏青',
    email: 'suqing@pa-eval.dev',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-06-05T08:00:00.000Z',
    createdAt: '2026-06-05T08:00:00.000Z',
    updatedAt: '2026-06-23T09:00:00.000Z',
  },
  {
    id: 'mem-owner-006',
    organizationId: 'org-owner-001',
    userId: 'user-member-002',
    name: '顾然',
    email: 'guran@pa-eval.dev',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-06-06T08:00:00.000Z',
    createdAt: '2026-06-06T08:00:00.000Z',
    updatedAt: '2026-06-24T09:00:00.000Z',
  },
  {
    id: 'mem-owner-007',
    organizationId: 'org-owner-001',
    userId: 'user-member-003',
    name: '高玥',
    email: 'gaoyue@pa-eval.dev',
    role: 'MEMBER',
    status: 'SUSPENDED',
    joinedAt: '2026-06-07T08:00:00.000Z',
    createdAt: '2026-06-07T08:00:00.000Z',
    updatedAt: '2026-06-25T09:00:00.000Z',
  },
  {
    id: 'mem-owner-008',
    organizationId: 'org-owner-001',
    userId: 'user-member-004',
    name: '王谨',
    email: 'wangjin@pa-eval.dev',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-06-08T08:00:00.000Z',
    createdAt: '2026-06-08T08:00:00.000Z',
    updatedAt: '2026-06-26T09:00:00.000Z',
  },
  {
    id: 'mem-owner-009',
    organizationId: 'org-owner-001',
    userId: 'user-viewer-001',
    name: '陈诺',
    email: 'chennuo@pa-eval.dev',
    role: 'VIEWER',
    status: 'ACTIVE',
    joinedAt: '2026-06-09T08:00:00.000Z',
    createdAt: '2026-06-09T08:00:00.000Z',
    updatedAt: '2026-06-27T09:00:00.000Z',
  },
  {
    id: 'mem-owner-010',
    organizationId: 'org-owner-001',
    userId: 'user-viewer-002',
    name: '许安',
    email: 'xuan@pa-eval.dev',
    role: 'VIEWER',
    status: 'INVITED',
    joinedAt: '2026-06-10T08:00:00.000Z',
    createdAt: '2026-06-10T08:00:00.000Z',
    updatedAt: '2026-06-28T09:00:00.000Z',
  },
  {
    id: 'mem-owner-011',
    organizationId: 'org-owner-001',
    userId: 'user-member-005',
    name: '郑北',
    email: 'zhengbei@pa-eval.dev',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-06-11T08:00:00.000Z',
    createdAt: '2026-06-11T08:00:00.000Z',
    updatedAt: '2026-06-29T09:00:00.000Z',
  },
  {
    id: 'mem-owner-012',
    organizationId: 'org-owner-001',
    userId: 'user-member-006',
    name: '唐时',
    email: 'tangshi@pa-eval.dev',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-06-12T08:00:00.000Z',
    createdAt: '2026-06-12T08:00:00.000Z',
    updatedAt: '2026-06-30T09:00:00.000Z',
  },
  {
    id: 'mem-owner-013',
    organizationId: 'org-owner-001',
    userId: 'user-member-007',
    name: '贺礼',
    email: 'heli@pa-eval.dev',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-06-13T08:00:00.000Z',
    createdAt: '2026-06-13T08:00:00.000Z',
    updatedAt: '2026-07-01T09:00:00.000Z',
  },
  {
    id: 'mem-admin-self',
    organizationId: 'org-admin-001',
    userId: CURRENT_USER.id,
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
    role: 'ADMIN',
    status: 'ACTIVE',
    joinedAt: '2026-06-05T08:00:00.000Z',
    createdAt: '2026-06-05T08:00:00.000Z',
    updatedAt: '2026-06-05T08:00:00.000Z',
  },
  {
    id: 'mem-admin-002',
    organizationId: 'org-admin-001',
    userId: 'user-admin-owner',
    name: '杜岚',
    email: 'dulan@pa-eval.dev',
    role: 'OWNER',
    status: 'ACTIVE',
    joinedAt: '2026-06-05T09:00:00.000Z',
    createdAt: '2026-06-05T09:00:00.000Z',
    updatedAt: '2026-06-05T09:00:00.000Z',
  },
  {
    id: 'mem-admin-003',
    organizationId: 'org-admin-001',
    userId: 'user-admin-member',
    name: '方宁',
    email: 'fangning@pa-eval.dev',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-06-06T09:00:00.000Z',
    createdAt: '2026-06-06T09:00:00.000Z',
    updatedAt: '2026-06-06T09:00:00.000Z',
  },
  {
    id: 'mem-member-self',
    organizationId: 'org-member-001',
    userId: CURRENT_USER.id,
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: '2026-06-08T08:00:00.000Z',
    createdAt: '2026-06-08T08:00:00.000Z',
    updatedAt: '2026-06-08T08:00:00.000Z',
  },
  {
    id: 'mem-member-002',
    organizationId: 'org-member-001',
    userId: 'user-member-owner',
    name: '梁舟',
    email: 'liangzhou@pa-eval.dev',
    role: 'OWNER',
    status: 'ACTIVE',
    joinedAt: '2026-06-08T09:00:00.000Z',
    createdAt: '2026-06-08T09:00:00.000Z',
    updatedAt: '2026-06-08T09:00:00.000Z',
  },
  {
    id: 'mem-viewer-self',
    organizationId: 'org-viewer-001',
    userId: CURRENT_USER.id,
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
    role: 'VIEWER',
    status: 'ACTIVE',
    joinedAt: '2026-06-10T08:00:00.000Z',
    createdAt: '2026-06-10T08:00:00.000Z',
    updatedAt: '2026-06-10T08:00:00.000Z',
  },
  {
    id: 'mem-viewer-002',
    organizationId: 'org-viewer-001',
    userId: 'user-viewer-owner',
    name: '周宁',
    email: 'zhouning@pa-eval.dev',
    role: 'OWNER',
    status: 'ACTIVE',
    joinedAt: '2026-06-10T09:00:00.000Z',
    createdAt: '2026-06-10T09:00:00.000Z',
    updatedAt: '2026-06-10T09:00:00.000Z',
  },
]

const apiKeys: OrganizationApiKey[] = [
  {
    id: 'key-owner-001',
    organizationId: 'org-owner-001',
    name: '默认生产 Key',
    maskedKey: 'sk-live-own...001',
    publicKey: 'pk-live-owner001',
    secretKeyMasked: 'sk-live-own...001',
    createdBy: CURRENT_USER.name,
    updatedAt: '2026-06-20T09:00:00.000Z',
    lastUsedAt: '2026-07-01T10:00:00.000Z',
    createdAt: '2026-06-01T08:00:00.000Z',
  },
  {
    id: 'key-owner-002',
    organizationId: 'org-owner-001',
    name: '批量任务 Key',
    maskedKey: 'sk-live-own...002',
    publicKey: 'pk-live-owner002',
    secretKeyMasked: 'sk-live-own...002',
    createdBy: '林雪',
    updatedAt: '2026-06-25T09:00:00.000Z',
    lastUsedAt: null,
    createdAt: '2026-06-15T08:00:00.000Z',
  },
  {
    id: 'key-admin-001',
    organizationId: 'org-admin-001',
    name: '只读集成 Key',
    maskedKey: 'sk-live-adm...001',
    publicKey: 'pk-live-admin001',
    secretKeyMasked: 'sk-live-adm...001',
    createdBy: '杜岚',
    updatedAt: '2026-06-18T09:00:00.000Z',
    lastUsedAt: '2026-06-30T10:00:00.000Z',
    createdAt: '2026-06-05T08:00:00.000Z',
  },
]

const getOrganizationById = (organizationId: string) =>
  organizations.find((organization) => organization.id === organizationId)

const getMembersByOrganizationId = (organizationId: string) =>
  members.filter((member) => member.organizationId === organizationId)

const getActorMember = (organizationId: string) =>
  getMembersByOrganizationId(organizationId).find(
    (member) => member.userId === CURRENT_USER.id
  )

const getActorRole = (organizationId: string): OrganizationRole | null =>
  getActorMember(organizationId)?.role ?? null

const ensureOrganization = (organizationId: string) => {
  const organization = getOrganizationById(organizationId)

  if (!organization) {
    return failure(RESPONSE_CODE.notFound, '组织不存在', {})
  }

  return organization
}

const ensureActorRole = (organizationId: string) => {
  const actorRole = getActorRole(organizationId)

  if (!actorRole) {
    return failure(RESPONSE_CODE.forbidden, '当前用户不在该组织内', {})
  }

  return actorRole
}

const ensureManagePermission = (organizationId: string) => {
  const actorRole = ensureActorRole(organizationId)
  if (typeof actorRole !== 'string') {
    return actorRole
  }

  if (!canManageMembers(actorRole)) {
    return failure(RESPONSE_CODE.forbidden, '当前角色不能管理成员', {})
  }

  return actorRole
}

const parsePathSegment = (request: MockRequest, index: number) => {
  if (typeof request.url !== 'string') {
    return ''
  }

  const pathname = request.url.split('?')[0] ?? ''
  return pathname.split('/')[index] ?? ''
}

const parseOrganizationId = (request: MockRequest) =>
  toStringValue(request.query.organizationId) || parsePathSegment(request, 3)

const parseMemberId = (request: MockRequest) =>
  toStringValue(request.query.memberId) || parsePathSegment(request, 5)

const parseApiKeyId = (request: MockRequest) =>
  toStringValue(request.query.apiKeyId) || parsePathSegment(request, 5)

const normalizeKeyword = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const normalizeRoleFilter = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => item.trim().toUpperCase())
      .filter((item): item is OrganizationRole =>
        organizationRoleSchema.safeParse(item).success
      )
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase()
    return organizationRoleSchema.safeParse(normalized).success
      ? [normalized as OrganizationRole]
      : []
  }

  return []
}

const filterMembers = (
  organizationId: string,
  keyword: string,
  roleFilter: string | string[] | undefined
) => {
  const scopedMembers = getMembersByOrganizationId(organizationId)
  const normalizedRoleFilter = normalizeRoleFilter(roleFilter)
  const roleMatchedMembers =
    normalizedRoleFilter.length > 0
      ? scopedMembers.filter((member) =>
          normalizedRoleFilter.includes(member.role)
        )
      : scopedMembers

  if (!keyword) {
    return roleMatchedMembers
  }

  return roleMatchedMembers.filter((member) =>
    [member.name, member.email, member.role, member.status]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(keyword))
  )
}

const serializeApiKey = (apiKey: OrganizationApiKey): OrganizationApiKey => ({
  ...apiKey,
  maskedKey: apiKey.secretKeyMasked ?? apiKey.maskedKey,
  secretKey: undefined,
})

const mockHandlers: MockMethod[] = [
  {
    url: '/api/organizations',
    method: 'get',
    response: ({ query }: MockRequest) => {
      const keyword = normalizeKeyword(query.keyword)
      const filtered = organizations.filter((organization) => {
        if (!keyword) {
          return true
        }

        return [organization.name, organization.description, organization.subsystem]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(keyword))
      })

      return success(paginate(filtered, query))
    },
  },
  {
    url: '/api/organizations',
    method: 'post',
    response: ({ body }: MockRequest) => {
      const name = toStringValue(body.name)
      const subsystem = toStringValue(body.subsystem)

      if (!name) {
        return failure(RESPONSE_CODE.badRequest, '组织名称不能为空', {})
      }

      if (!subsystem) {
        return failure(RESPONSE_CODE.badRequest, '所属子系统不能为空', {})
      }

      const timestamp = Date.now()
      const createdAt = now()
      const organizationId = `org-${timestamp}`
      const publicKey = `pk-live-${timestamp}`
      const secretKey = `sk-live-${timestamp}${Math.random()
        .toString(36)
        .slice(2, 8)}`

      const organization: Organization = {
        id: organizationId,
        name,
        description:
          typeof body.description === 'string' ? body.description : null,
        subsystem,
        publicKey,
        secretKeyMasked: maskSecretKey(secretKey),
        createdBy: CURRENT_USER.name,
        createdAt,
        updatedAt: createdAt,
      }

      organizations.unshift(organization)
      members.unshift({
        id: `mem-${timestamp}`,
        organizationId,
        userId: CURRENT_USER.id,
        name: CURRENT_USER.name,
        email: CURRENT_USER.email,
        role: 'OWNER',
        status: 'ACTIVE',
        joinedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      })

      apiKeys.unshift({
        id: `key-${timestamp}`,
        organizationId,
        name: '默认初始化 Key',
        maskedKey: maskSecretKey(secretKey),
        publicKey,
        secretKeyMasked: maskSecretKey(secretKey),
        secretKey,
        createdBy: CURRENT_USER.name,
        updatedAt: createdAt,
        lastUsedAt: null,
        createdAt,
      })

      return success({
        ...organization,
        secretKey,
      })
    },
  },
  {
    url: '/api/organizations/:organizationId/members',
    method: 'get',
    response: (request: MockRequest) => {
      const organizationId = parseOrganizationId(request)
      const organization = ensureOrganization(organizationId)

      if ('code' in organization) {
        return organization
      }

      const keyword = normalizeKeyword(request.query.keyword)
      const filtered = filterMembers(organizationId, keyword, request.query.role)

      return success(paginate(filtered, request.query))
    },
  },
  {
    url: '/api/organizations/:organizationId/members',
    method: 'post',
    response: (request: MockRequest) => {
      const organizationId = parseOrganizationId(request)
      const organization = ensureOrganization(organizationId)

      if ('code' in organization) {
        return organization
      }

      const actorRole = ensureManagePermission(organizationId)
      if (typeof actorRole !== 'string') {
        return actorRole
      }

      const email = toStringValue(request.body.email).toLowerCase()
      const name = toStringValue(request.body.name)
      const role = parseOrganizationRole(request.body.role)

      if (!email || !role) {
        return failure(RESPONSE_CODE.badRequest, '成员角色不合法', {})
      }

      if (!canAssignRole(actorRole, role)) {
        return failure(RESPONSE_CODE.forbidden, '当前角色不能授予该权限', {})
      }

      const exists = getMembersByOrganizationId(organizationId).some(
        (member) => member.email === email
      )
      if (exists) {
        return failure(RESPONSE_CODE.badRequest, '该成员已存在', {})
      }

      const createdAt = now()
      const nextId = `mem-${Date.now()}`
      const emailPrefix = email.split('@')[0] ?? 'new-user'

      const member: OrganizationMember = {
        id: nextId,
        organizationId,
        userId: `user-${emailPrefix}`,
        name: name || emailPrefix,
        email,
        role,
        status: 'INVITED',
        joinedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      }

      members.unshift(member)

      return success(member)
    },
  },
  {
    url: '/api/organizations/:organizationId/members/:memberId',
    method: 'patch',
    response: (request: MockRequest) => {
      const organizationId = parseOrganizationId(request)
      const memberId = parseMemberId(request)
      const organization = ensureOrganization(organizationId)

      if ('code' in organization) {
        return organization
      }

      const actorRole = ensureManagePermission(organizationId)
      if (typeof actorRole !== 'string') {
        return actorRole
      }

      const target = members.find(
        (member) =>
          member.organizationId === organizationId && member.id === memberId
      )
      if (!target) {
        return failure(RESPONSE_CODE.notFound, '成员不存在', {})
      }

      const nextRole = parseOrganizationRole(request.body.role)
      if (!nextRole) {
        return failure(RESPONSE_CODE.badRequest, '成员角色不合法', {})
      }

      if (!canAssignRole(actorRole, nextRole)) {
        return failure(RESPONSE_CODE.forbidden, '当前角色不能授予该权限', {})
      }

      if (target.role === 'OWNER' && nextRole !== 'OWNER') {
        const ownerCount = getMembersByOrganizationId(organizationId).filter(
          (member) => member.role === 'OWNER'
        ).length
        const removeCheck = canRemoveMember(actorRole, 'OWNER', ownerCount)
        if (!removeCheck.allowed) {
          return failure(
            RESPONSE_CODE.forbidden,
            removeCheck.reason ?? '当前角色不能变更该成员',
            {}
          )
        }
      }

      target.role = nextRole
      target.updatedAt = now()

      return success(target)
    },
  },
  {
    url: '/api/organizations/:organizationId/members/:memberId',
    method: 'delete',
    response: (request: MockRequest) => {
      const organizationId = parseOrganizationId(request)
      const memberId = parseMemberId(request)
      const organization = ensureOrganization(organizationId)

      if ('code' in organization) {
        return organization
      }

      const actorRole = ensureManagePermission(organizationId)
      if (typeof actorRole !== 'string') {
        return actorRole
      }

      const memberIndex = members.findIndex(
        (member) =>
          member.organizationId === organizationId && member.id === memberId
      )
      if (memberIndex < 0) {
        return failure(RESPONSE_CODE.notFound, '成员不存在', {})
      }

      const target = members[memberIndex]
      const ownerCount = getMembersByOrganizationId(organizationId).filter(
        (member) => member.role === 'OWNER'
      ).length
      const removeCheck = canRemoveMember(actorRole, target.role, ownerCount)

      if (!removeCheck.allowed) {
        return failure(
          RESPONSE_CODE.forbidden,
          removeCheck.reason ?? '当前角色不能删除成员',
          {}
        )
      }

      members.splice(memberIndex, 1)

      return success({})
    },
  },
  {
    url: '/api/organizations/:organizationId/members/import',
    method: 'post',
    response: (request: MockRequest) => {
      const organizationId = parseOrganizationId(request)
      const organization = ensureOrganization(organizationId)

      if ('code' in organization) {
        return organization
      }

      const actorRole = ensureManagePermission(organizationId)
      if (typeof actorRole !== 'string') {
        return actorRole
      }

      const payloadMembers = Array.isArray(request.body.members)
        ? request.body.members
        : []

      const failures: Array<{ row: number; email: string; reason: string }> = []
      const imported: OrganizationMember[] = []

      payloadMembers.forEach((item, index) => {
        const email =
          typeof item === 'object' && item !== null
            ? toStringValue((item as Record<string, unknown>).email).toLowerCase()
            : ''
        const name =
          typeof item === 'object' && item !== null
            ? toStringValue((item as Record<string, unknown>).name)
            : ''
        const role =
          typeof item === 'object' && item !== null
            ? parseOrganizationRole((item as Record<string, unknown>).role)
            : ''

        if (!email || !role) {
          failures.push({
            row: index + 1,
            email,
            reason: '成员参数不完整',
          })
          return
        }

        if (!canAssignRole(actorRole, role)) {
          failures.push({
            row: index + 1,
            email,
            reason: '当前角色不能授予该权限',
          })
          return
        }

        const exists = getMembersByOrganizationId(organizationId).some(
          (member) => member.email === email
        )
        if (exists) {
          failures.push({
            row: index + 1,
            email,
            reason: '该成员已存在',
          })
          return
        }

        const createdAt = now()
        const emailPrefix = email.split('@')[0] ?? `import-${index + 1}`
        const member: OrganizationMember = {
          id: `mem-${Date.now()}-${index + 1}`,
          organizationId,
          userId: `user-${emailPrefix}`,
          name: name || emailPrefix,
          email,
          role,
          status: 'INVITED',
          joinedAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        }

        members.unshift(member)
        imported.push(member)
      })

      return success({
        total: imported.length,
        datas: imported,
        failures,
      })
    },
  },
  {
    url: '/api/organizations/:organizationId/api-keys',
    method: 'get',
    response: (request: MockRequest) => {
      const organizationId = parseOrganizationId(request)
      const organization = ensureOrganization(organizationId)

      if ('code' in organization) {
        return organization
      }

      const actorRole = ensureActorRole(organizationId)
      if (typeof actorRole !== 'string') {
        return actorRole
      }

      if (!canManageMembers(actorRole)) {
        return failure(RESPONSE_CODE.forbidden, '当前角色不能查看 API Key', {})
      }

      const keyword = normalizeKeyword(request.query.keyword)
      const scopedKeys = apiKeys
        .filter((apiKey) => apiKey.organizationId === organizationId)
        .filter((apiKey) => {
          if (!keyword) {
            return true
          }

          return [apiKey.name, apiKey.publicKey, apiKey.createdBy].some((value) =>
            value?.toLowerCase().includes(keyword)
          )
        })
        .map(serializeApiKey)

      return success(paginate(scopedKeys, request.query))
    },
  },
  {
    url: '/api/organizations/:organizationId/api-keys',
    method: 'post',
    response: (request: MockRequest) => {
      const organizationId = parseOrganizationId(request)
      const organization = ensureOrganization(organizationId)

      if ('code' in organization) {
        return organization
      }

      const actorRole = ensureActorRole(organizationId)
      if (typeof actorRole !== 'string') {
        return actorRole
      }

      if (!canManageMembers(actorRole)) {
        return failure(RESPONSE_CODE.forbidden, '当前角色不能创建 API Key', {})
      }

      const name = toStringValue(request.body.name)
      if (!name) {
        return failure(RESPONSE_CODE.badRequest, 'API Key 名称不能为空', {})
      }

      const timestamp = Date.now()
      const createdAt = now()
      const publicKey = `pk-live-${timestamp}`
      const secretKey = `sk-live-${timestamp}${Math.random()
        .toString(36)
        .slice(2, 8)}`
      const secretKeyMasked = maskSecretKey(secretKey)

      const apiKey: OrganizationApiKey = {
        id: `key-${timestamp}`,
        organizationId,
        name,
        maskedKey: secretKeyMasked,
        publicKey,
        secretKeyMasked,
        secretKey,
        createdBy: CURRENT_USER.name,
        updatedAt: createdAt,
        lastUsedAt: null,
        createdAt,
      }

      apiKeys.unshift(apiKey)

      return success(apiKey)
    },
  },
  {
    url: '/api/organizations/:organizationId/api-keys/:apiKeyId',
    method: 'delete',
    response: (request: MockRequest) => {
      const organizationId = parseOrganizationId(request)
      const apiKeyId = parseApiKeyId(request)
      const organization = ensureOrganization(organizationId)

      if ('code' in organization) {
        return organization
      }

      const actorRole = ensureActorRole(organizationId)
      if (typeof actorRole !== 'string') {
        return actorRole
      }

      if (!canManageMembers(actorRole)) {
        return failure(RESPONSE_CODE.forbidden, '当前角色不能删除 API Key', {})
      }

      const apiKeyIndex = apiKeys.findIndex(
        (apiKey) =>
          apiKey.organizationId === organizationId && apiKey.id === apiKeyId
      )
      if (apiKeyIndex < 0) {
        return failure(RESPONSE_CODE.notFound, 'API Key 不存在', {})
      }

      apiKeys.splice(apiKeyIndex, 1)

      return success({})
    },
  },
  {
    url: '/api/organizations/:organizationId',
    method: 'get',
    response: (request: MockRequest) => {
      const organizationId = parseOrganizationId(request)
      const organization = ensureOrganization(organizationId)

      if ('code' in organization) {
        return organization
      }

      return success(organization)
    },
  },
  {
    url: '/api/organizations/:organizationId',
    method: 'patch',
    response: (request: MockRequest) => {
      const organizationId = parseOrganizationId(request)
      const organization = ensureOrganization(organizationId)

      if ('code' in organization) {
        return organization
      }

      const actorRole = ensureActorRole(organizationId)
      if (typeof actorRole !== 'string') {
        return actorRole
      }

      if (!canManageMembers(actorRole)) {
        return failure(RESPONSE_CODE.forbidden, '当前角色不能编辑组织信息', {})
      }

      if (typeof request.body.name === 'string') {
        return failure(RESPONSE_CODE.badRequest, '组织名称不允许修改', {})
      }

      if (
        typeof request.body.subsystem === 'string' &&
        !request.body.subsystem.trim()
      ) {
        return failure(RESPONSE_CODE.badRequest, '所属子系统不能为空', {})
      }

      if (typeof request.body.description === 'string') {
        organization.description = request.body.description
      }

      if (typeof request.body.subsystem === 'string') {
        organization.subsystem = request.body.subsystem
      }

      organization.updatedAt = now()

      return success(organization)
    },
  },
]

export default mockHandlers
