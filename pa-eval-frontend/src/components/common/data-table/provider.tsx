import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type DataTableContextValue<
  TData,
  TAction extends string,
  TContext extends object = Record<string, never>,
> = {
  open: TAction | null
  setOpen: (open: TAction | null) => void
  currentRow: TData | null
  setCurrentRow: React.Dispatch<React.SetStateAction<TData | null>>
  context: TContext
}

type DataTableProviderProps<
  TData,
  TAction extends string,
  TContext extends object = Record<string, never>,
> = {
  children: ReactNode
  context?: TContext
  initialOpen?: TAction | null
  initialCurrentRow?: TData | null
}

const DataTableContext = createContext<DataTableContextValue<
  unknown,
  string,
  object
> | null>(null)

export function DataTableProvider<
  TData,
  TAction extends string,
  TContext extends object = Record<string, never>,
>({
  children,
  context,
  initialOpen = null,
  initialCurrentRow = null,
}: DataTableProviderProps<TData, TAction, TContext>) {
  const [open, setOpen] = useState<TAction | null>(initialOpen)
  const [currentRow, setCurrentRow] = useState<TData | null>(initialCurrentRow)

  const value = useMemo<DataTableContextValue<TData, TAction, TContext>>(
    () => ({
      open,
      setOpen,
      currentRow,
      setCurrentRow,
      context: context ?? ({} as TContext),
    }),
    [context, currentRow, open]
  )

  return (
    <DataTableContext
      value={value as unknown as DataTableContextValue<unknown, string, object>}
    >
      {children}
    </DataTableContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDataTableContext<
  TData,
  TAction extends string,
  TContext extends object = Record<string, never>,
>() {
  const context = useContext(DataTableContext)

  if (!context) {
    throw new Error('useDataTableContext 必须在 <DataTableProvider> 内使用')
  }

  return context as unknown as DataTableContextValue<TData, TAction, TContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalDataTableContext() {
  return useContext(DataTableContext)
}
