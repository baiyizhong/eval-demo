export type ProjectContextSummary = {
  id: string
  name: string
  organizationName: string
}

export function buildProjectSwitchPath({
  pathname,
  currentProjectId,
  nextProjectId,
}: {
  pathname: string
  currentProjectId: string
  nextProjectId: string
}) {
  const currentPrefix = `/projects/${encodeURIComponent(currentProjectId)}`
  const nextPrefix = `/projects/${encodeURIComponent(nextProjectId)}`

  if (!pathname.startsWith(currentPrefix)) {
    return `${nextPrefix}/evaluation`
  }

  const suffix = pathname.slice(currentPrefix.length)
  return `${nextPrefix}${suffix || '/evaluation'}`
}
