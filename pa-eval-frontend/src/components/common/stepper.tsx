import type React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StepperItem = {
  id?: string
  title: React.ReactNode
  description?: React.ReactNode
}

export type StepperProps = {
  items: StepperItem[]
  currentStep: number
  onStepChange?: (step: number) => void
  className?: string
}

export function Stepper({
  items,
  currentStep,
  onStepChange,
  className,
}: StepperProps) {
  return (
    <nav aria-label='步骤进度' className={className}>
      <ol className='grid gap-0 md:grid-cols-3'>
        {items.map((item, index) => {
          const isCurrent = index === currentStep
          const isCompleted = index < currentStep
          const isClickable = Boolean(onStepChange)

          return (
            <li key={item.id ?? index} className='min-w-0'>
              <button
                type='button'
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'group text-card-foreground flex w-full min-w-0 flex-col gap-3 rounded-lg px-0 py-3 text-center',
                  'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                  !isClickable && 'pointer-events-none'
                )}
                onClick={() => onStepChange?.(index)}
              >
                <span className='grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2'>
                  <span
                    aria-hidden='true'
                    className={cn('bg-border h-px', index === 0 && 'invisible')}
                  />
                  <span
                    className={cn(
                      'bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                      isCurrent &&
                        'border-primary bg-primary text-primary-foreground',
                      isCompleted &&
                        'border-primary bg-primary text-primary-foreground'
                    )}
                  >
                    {isCompleted ? <Check className='size-4' /> : index + 1}
                  </span>
                  <span
                    aria-hidden='true'
                    className={cn(
                      'bg-border h-px',
                      index === items.length - 1 && 'invisible'
                    )}
                  />
                </span>
                <span className='flex min-w-0 flex-col items-center gap-1 self-stretch'>
                  <span
                    className={cn(
                      'max-w-full truncate text-sm font-medium',
                      isCurrent && 'text-primary'
                    )}
                  >
                    {item.title}
                  </span>
                  {item.description ? (
                    <span className='text-muted-foreground line-clamp-2 text-xs leading-5'>
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
