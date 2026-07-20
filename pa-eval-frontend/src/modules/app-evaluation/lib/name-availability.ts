import { z } from 'zod'

export type ResourceNameAvailabilityChecker = (
  name: string
) => Promise<boolean>

export function createAvailableResourceNameSchema({
  requiredMessage,
  duplicateMessage,
  checkAvailability,
}: {
  requiredMessage: string
  duplicateMessage: string
  checkAvailability: ResourceNameAvailabilityChecker
}) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .superRefine(async (name, context) => {
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
