import { z } from 'zod'

export const organizationRoleSchema = z.enum([
  'OWNER',
  'ADMIN',
  'MEMBER',
  'VIEWER',
  'NONE',
])

export type OrganizationRole = z.infer<typeof organizationRoleSchema>

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  subsystem: z.string().nullable().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Organization = z.infer<typeof organizationSchema>

export const organizationMemberSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: organizationRoleSchema,
  status: z.string().optional(),
  joinedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  invitedBy: z
    .object({
      name: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
    })
    .optional(),
  projectId: z.string().nullable().optional(),
  projectRole: organizationRoleSchema.nullable().optional(),
})

export type OrganizationMember = z.infer<typeof organizationMemberSchema>

export type PaginatedResult<T> = {
  total: number
  datas: T[]
}

export const normalizeOrganizationOwnerAccount = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')

export const normalizeMemberNameInput = (value: string) =>
  value.trim().toLowerCase()

export const buildOrganizationMemberEmail = (name: string, domain: string) => {
  const account = normalizeOrganizationOwnerAccount(name)
  const normalizedDomain = domain.trim().toLowerCase().replace(/^@/, '')
  return account && normalizedDomain ? `${account}@${normalizedDomain}` : ''
}

export const createOrganizationPayloadSchema = z.object({
  name: z.string(),
  subsystem: z.string(),
  description: z.string().optional(),
  defaultOwnerAccount: z
    .string()
    .min(1, '请输入默认 Owner 登录账号')
    .regex(/^[a-z0-9]+$/, '账号只允许输入英文和数字'),
})

export type CreateOrganizationPayload = z.infer<
  typeof createOrganizationPayloadSchema
>

export const updateOrganizationPayloadSchema = createOrganizationPayloadSchema
  .omit({ defaultOwnerAccount: true })
  .partial()

export type UpdateOrganizationPayload = z.infer<
  typeof updateOrganizationPayloadSchema
>

export const createOrganizationMemberPayloadSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().email(),
  role: organizationRoleSchema,
})

export type CreateOrganizationMemberPayload = z.infer<
  typeof createOrganizationMemberPayloadSchema
>

export const updateOrganizationMemberPayloadSchema = z.object({
  role: organizationRoleSchema,
})

export type UpdateOrganizationMemberPayload = z.infer<
  typeof updateOrganizationMemberPayloadSchema
>

export const importOrganizationMembersPayloadSchema = z.object({
  members: z.array(createOrganizationMemberPayloadSchema),
})

export type ImportOrganizationMembersPayload = z.infer<
  typeof importOrganizationMembersPayloadSchema
>

export const importOrganizationMemberFailureSchema = z.object({
  row: z.number().int().nonnegative(),
  email: z.string().email(),
  reason: z.string(),
})

export type ImportOrganizationMemberFailure = z.infer<
  typeof importOrganizationMemberFailureSchema
>

export type ImportOrganizationMembersResult =
  PaginatedResult<OrganizationMember> & {
    failures: ImportOrganizationMemberFailure[]
  }
