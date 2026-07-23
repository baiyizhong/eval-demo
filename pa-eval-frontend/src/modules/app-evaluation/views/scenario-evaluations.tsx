import { useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Page } from '@/components/common/page'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
import {
  evaluationScenarioDescriptions,
  evaluationScenarioOptions,
} from '../lib/evaluation-scenarios'

const recommendedScenarioValues = [
  'SINGLE_TURN',
  'MULTI_TURN',
  'TOOL_CALLING',
  'MULTI_TURN_TOOL_CALLING',
  'AGENT_SKILL',
] as const
const recommendedScenarioSet = new Set<string>(recommendedScenarioValues)

export function ProjectScenarioEvaluations() {
  const { projectId = 'project_customer_agent' } = useParams()
  const navigate = useNavigate()
  const scenarios = evaluationScenarioOptions.filter((option) =>
    recommendedScenarioSet.has(option.value)
  )

  const startScenarioEvaluation = (scenario: (typeof scenarios)[number]) => {
    navigate(
      `/projects/${projectId}/evaluation/auto-evaluations/new?scenario=${scenario.value}`
    )
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto'>
        <EvaluationPageNav />
        <section className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]'>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {scenarios.map((scenario) => {
              const Icon = scenario.icon
              return (
                <article
                  key={scenario.value}
                  className='bg-card text-card-foreground flex min-h-56 flex-col gap-4 rounded-lg border p-4'
                >
                  <div className='flex items-start justify-between gap-3'>
                    <div className='bg-primary/10 text-primary flex size-10 items-center justify-center rounded-md'>
                      <Icon className='size-5' />
                    </div>
                    <Badge variant='outline'>推荐场景</Badge>
                  </div>
                  <div className='flex flex-1 flex-col gap-3'>
                    <h3 className='text-base font-semibold'>
                      {scenario.label}
                    </h3>
                    <p className='text-muted-foreground text-sm leading-6'>
                      {scenario.description}
                    </p>
                    <div className='grid gap-2 text-xs'>
                      <ScenarioMetaLine
                        label='推荐评估器'
                        value={scenario.recommendedEvaluator}
                      />
                      <ScenarioMetaLine
                        label='推荐数据'
                        value={scenario.recommendedDataShape}
                      />
                    </div>
                    <div className='grid gap-2'>
                      <ScenarioBadgeGroup
                        label='推荐指标'
                        values={scenario.defaultMetrics}
                      />
                      <ScenarioBadgeGroup
                        label='默认字段'
                        values={scenario.fieldAliases}
                      />
                    </div>
                  </div>
                  <Button
                    type='button'
                    className='w-full'
                    onClick={() => startScenarioEvaluation(scenario)}
                  >
                    开始评测
                  </Button>
                </article>
              )
            })}
          </div>
          <aside className='bg-card text-card-foreground flex flex-col gap-3 rounded-lg border p-4'>
            <h3 className='text-sm font-semibold'>高级场景</h3>
            <div className='grid gap-2'>
              {evaluationScenarioOptions
                .filter(
                  (option) => !recommendedScenarioSet.has(option.value)
                )
                .map((scenario) => (
                  <button
                    key={scenario.value}
                    type='button'
                    className='hover:bg-accent focus-visible:ring-ring/50 rounded-md border p-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none'
                    onClick={() => startScenarioEvaluation(scenario)}
                  >
                    <div className='text-sm font-medium'>{scenario.label}</div>
                    <div className='text-muted-foreground mt-1 line-clamp-2 text-xs leading-5'>
                      {evaluationScenarioDescriptions[scenario.value]}
                    </div>
                    <div className='mt-2 flex flex-wrap gap-1'>
                      {scenario.defaultMetrics.slice(0, 3).map((metric) => (
                        <Badge
                          key={metric}
                          variant='secondary'
                          className='text-[10px]'
                        >
                          {metric}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
            </div>
          </aside>
        </section>
      </div>
    </Page>
  )
}

function ScenarioMetaLine({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className='grid gap-1'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='leading-5'>{value}</span>
    </div>
  )
}

function ScenarioBadgeGroup({
  label,
  values,
}: {
  label: string
  values: string[]
}) {
  return (
    <div className='grid gap-1'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <div className='flex flex-wrap gap-1'>
        {values.map((value) => (
          <Badge key={value} variant='secondary' className='text-[10px]'>
            {value}
          </Badge>
        ))}
      </div>
    </div>
  )
}
