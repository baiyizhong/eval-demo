import {
  BarChart3,
  Bot,
  ClipboardCheck,
  Database,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import {
  buildProjectModuleSwitchPath,
  findProjectContext,
  type ProjectContextSummary,
} from '@/modules/project-context/project-context-utils'

type EvaluationTopNavLink = {
  title: string
  href: string
  isActive?: boolean
  icon?: LucideIcon
}

type BuildEvaluationTopNavLinksInput = {
  pathname: string
  projectId: string
}

export type EvaluationProjectSummary = ProjectContextSummary

export function buildEvaluationTopNavLinks({
  pathname,
  projectId,
}: BuildEvaluationTopNavLinksInput): EvaluationTopNavLink[] {
  const basePath = `/projects/${projectId}/evaluation`

  return [
    {
      title: '数据集',
      href: `${basePath}/datasets`,
      icon: Database,
      isActive: pathname.startsWith(`${basePath}/datasets`),
    },
    {
      title: '评估器',
      href: `${basePath}/evaluators`,
      icon: SlidersHorizontal,
      isActive: pathname.startsWith(`${basePath}/evaluators`),
    },
    {
      title: '人工标注',
      href: `${basePath}/annotation-queues`,
      icon: ClipboardCheck,
      isActive: pathname.startsWith(`${basePath}/annotation-queues`),
    },
    {
      title: '自动评测',
      href: `${basePath}/auto-evaluations`,
      icon: Bot,
      isActive: pathname.startsWith(`${basePath}/auto-evaluations`),
    },
    {
      title: '评测报告',
      href: `${basePath}/reports`,
      icon: BarChart3,
      isActive: pathname.startsWith(`${basePath}/reports`),
    },
  ]
}

export function findEvaluationProject(
  projects: EvaluationProjectSummary[],
  projectId: string
) {
  return findProjectContext(projects, projectId)
}

export function buildEvaluationProjectSwitchPath(
  pathname: string,
  currentProjectId: string,
  nextProjectId: string
) {
  return buildProjectModuleSwitchPath({
    pathname,
    currentProjectId,
    nextProjectId,
    moduleSegment: 'evaluation',
    defaultSubPath: '/datasets',
  })
}
