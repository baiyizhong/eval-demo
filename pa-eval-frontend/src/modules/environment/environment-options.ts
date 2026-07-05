import {
  Building2,
  CircleDollarSign,
  Factory,
  type LucideIcon,
  ShieldCheck,
} from 'lucide-react'

export type EnvironmentCode = 'general' | 'property' | 'life' | 'bank'

export type EnvironmentOption = {
  code: EnvironmentCode
  name: string
  description: string
  icon: LucideIcon
}

export const environmentOptions: EnvironmentOption[] = [
  {
    code: 'general',
    name: '通用环境',
    description: '适用于通用评测、组织管理和项目管理工作流。',
    icon: ShieldCheck,
  },
  {
    code: 'property',
    name: '产险环境',
    description: '面向产险业务场景的评测资源与项目上下文。',
    icon: Factory,
  },
  {
    code: 'life',
    name: '寿险环境',
    description: '面向寿险业务场景的评测资源与项目上下文。',
    icon: CircleDollarSign,
  },
  {
    code: 'bank',
    name: '银行环境',
    description: '面向银行业务场景的评测资源与项目上下文。',
    icon: Building2,
  },
]

export function isEnvironmentCode(value: unknown): value is EnvironmentCode {
  return environmentOptions.some((option) => option.code === value)
}

export function getEnvironmentOption(code: EnvironmentCode) {
  return environmentOptions.find((option) => option.code === code) ?? null
}
