export function getProjectEntryPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/evaluation`
}
