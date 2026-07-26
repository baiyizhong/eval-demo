export function getProjectEntryPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/observability/traces/logs`
}
