import type { DispatchStep } from '../engine/batteryDispatch'
import type { DispatchCase } from '../shared/batteryDispatch'
import type { Locale } from '../shared/types'
import { TeachingModel } from './station3d/TeachingModel'
import { tr } from './text'

const load = () => import('./station3d/dispatch-instrument').then(module => module.buildDispatchBench)

export function DispatchInstrument({ batch, steps, index = -1, locale, advance }: {
  batch: DispatchCase; steps?: DispatchStep[]; index?: number; locale: Locale; advance?: () => void
}) {
  const frame = steps?.[index]
  const arrived = steps?.slice(0, index + 1).filter(step => step.kind === 'enqueue').map(step => step.battery) ?? []
  const moving = frame?.kind === 'queueTake' && frame.battery !== undefined
    ? { name: frame.battery, charge: frame.records[frame.battery] }
    : frame?.kind === 'stackTake' ? steps?.[index - 1]?.stack.find(item => item.name === frame.battery) : undefined
  return <TeachingModel sceneKey="structure-dispatch" label={tr(locale, '维修站电池交接台', 'Repair station dispatch bench')}
    locale={locale} load={load} state={{ locale, batch, step: frame, next: steps?.[index + 1], moving,
      arrivals: batch.arrivals.filter(name => !arrived.includes(name)), running: steps !== undefined }}
    onPick={steps?.[index + 1] ? advance : undefined} />
}
