import { Toaster as Sonner, ToasterProps } from 'sonner'

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme='light'
      position='top-center'
      expand={false}
      richColors
      className='toaster group'
      style={
        {
          // Normal toast style
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          // Success toast style
          '--success-bg': 'var(--success)',
          '--success-border': 'var(--success)',
          '--success-text': '#fff',
          // Error toast style
          '--error-bg': 'var(--destructive)',
          '--error-border': 'var(--destructive)',
          '--error-text': '#fff',
          // Warning toast style
          '--warning-bg': 'var(--warning)',
          '--warning-border': 'var(--warning)',
          '--warning-text': '#fff',
          // Info toast style
          '--info-bg': 'var(--info)',
          '--info-border': 'var(--info)',
          '--info-text': '#fff',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}
