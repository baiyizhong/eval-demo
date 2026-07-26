type ProjectsLoadingState = {
  currentOrganizationId: string | null
  organizationLoaded: boolean
  organizationPending: boolean
  projectPending: boolean
}

type ProjectsEmptyState = ProjectsLoadingState & {
  projectCount: number
  projectError: boolean
  projectFetched: boolean
}

export function shouldShowProjectsLoading({
  currentOrganizationId,
  organizationLoaded,
  organizationPending,
  projectPending,
}: ProjectsLoadingState) {
  if (organizationPending || !organizationLoaded) {
    return true
  }

  return Boolean(currentOrganizationId) && projectPending
}

export function shouldShowProjectsEmpty({
  currentOrganizationId,
  organizationLoaded,
  organizationPending,
  projectCount,
  projectError,
  projectFetched,
  projectPending,
}: ProjectsEmptyState) {
  return (
    Boolean(currentOrganizationId) &&
    organizationLoaded &&
    !organizationPending &&
    !projectPending &&
    !projectError &&
    projectFetched &&
    projectCount === 0
  )
}
