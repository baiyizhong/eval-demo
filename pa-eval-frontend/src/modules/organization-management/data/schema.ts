import { z } from 'zod'

export const organizationRoleSchema = z.enum([
  'OWNER',
  'ADMIN',
  'MEMBER',
  'VIEWER',
])

export type OrganizationRole = z.infer<typeof organizationRoleSchema>

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  subsystem: z.string().nullable().optional(),
  publicKey: z.string().optional(),
  secretKeyMasked: z.string().optional(),
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
})

export type OrganizationMember = z.infer<typeof organizationMemberSchema>

export const organizationApiKeySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  maskedKey: z.string(),
  publicKey: z.string().optional(),
  secretKeyMasked: z.string().optional(),
  secretKey: z.string().optional(),
  createdBy: z.string().optional(),
  updatedAt: z.string().optional(),
  lastUsedAt: z.string().nullable().optional(),
  createdAt: z.string(),
})

export type OrganizationApiKey = z.infer<typeof organizationApiKeySchema>

export type PaginatedResult<T> = {
  total: number
  datas: T[]
}

export const createOrganizationPayloadSchema = z.object({
  name: z.string(),
  subsystem: z.string(),
  description: z.string().optional(),
})

export type CreateOrganizationPayload = z.infer<
  typeof createOrganizationPayloadSchema
>

export const updateOrganizationPayloadSchema =
  createOrganizationPayloadSchema.partial()

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

export const createOrganizationApiKeyPayloadSchema = z.object({
  name: z.string(),
})

export type CreateOrganizationApiKeyPayload = z.infer<
  typeof createOrganizationApiKeyPayloadSchema
>

export const importOrganizationMemberFailureSchema = z.object({
  row: z.number().int().nonnegative(),
  email: z.string().email(),
  reason: z.string(),
})

export type ImportOrganizationMemberFailure = z.infer<
  typeof importOrganizationMemberFailureSchema
>

export type ImportOrganizationMembersResult = PaginatedResult<OrganizationMember> & {
  failures: ImportOrganizationMemberFailure[]
}
