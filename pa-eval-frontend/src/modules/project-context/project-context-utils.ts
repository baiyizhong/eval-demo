export type ProjectContextSummary = {
  id: string
  name: string
  organizationName: string
}

export function buildProjectSwitchPath({
  nextProjectId,
}: {
  nextProjectId: string
}) {
  const nextPrefix = `/projects/${encodeURIComponent(nextProjectId)}`
  return `${nextPrefix}/observability/traces/logs`
}
