type DataTableRootClassNameOptions = {
  hasFilterPanel: boolean
  isFilterPanelCollapsed: boolean
}

export function getDataTableRootClassName({
  hasFilterPanel,
  isFilterPanelCollapsed,
}: DataTableRootClassNameOptions) {
  const gapClass =
    hasFilterPanel && isFilterPanelCollapsed ? 'gap-0' : 'gap-4'

  return `flex min-w-0 flex-col ${gapClass} lg:flex-row`
}

