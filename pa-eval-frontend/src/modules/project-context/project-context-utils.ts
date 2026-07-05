export type ProjectContextSummary = {
  id: string
  name: string
  organizationName: string
}

export function findProjectContext(
  projects: ProjectContextSummary[],
  projectId: string
) {
  return projects.find((project) => project.id === projectId) ?? null
}

export function buildProjectModuleSwitchPath({
  pathname,
  currentProjectId,
  nextProjectId,
  moduleSegment,
  defaultSubPath,
}: {
  pathname: string
  currentProjectId: string
  nextProjectId: string
  moduleSegment: string
  defaultSubPath: string
}) {
  const currentPrefix = `/projects/${currentProjectId}/${moduleSegment}`
  const nextPrefix = `/projects/${nextProjectId}/${moduleSegment}`

  if (!pathname.startsWith(currentPrefix)) {
    return `${nextPrefix}${defaultSubPath}`
  }

  const suffix = pathname.slice(currentPrefix.length)
  return `${nextPrefix}${suffix || defaultSubPath}`
}
