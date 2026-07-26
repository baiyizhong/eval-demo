import { z } from 'zod'

export type ResourceNameAvailabilityChecker = (
  name: string
) => Promise<boolean>

export function createAvailableResourceNameSchema({
  requiredMessage,
  duplicateMessage,
  maxLength,
  maxLengthMessage,
  checkAvailability,
}: {
  requiredMessage: string
  duplicateMessage: string
  maxLength?: number
  maxLengthMessage?: string
  checkAvailability: ResourceNameAvailabilityChecker
}) {
  const schema = z.string().trim().min(1, requiredMessage)
  const lengthLimitedSchema = maxLength
    ? schema.max(maxLength, maxLengthMessage)
    : schema

  return lengthLimitedSchema.superRefine(async (name, context) => {
    if (!name) return

    try {
      if (!(await checkAvailability(name))) {
        context.addIssue({
          code: 'custom',
          message: duplicateMessage,
        })
      }
    } catch {
      context.addIssue({
        code: 'custom',
        message: '名称检查失败，请稍后重试',
      })
    }
  })
}
