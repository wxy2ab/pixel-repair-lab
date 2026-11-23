import { TeachingModel } from './station3d/TeachingModel'
import type { AssignmentModel, AxisModel, GateModel } from './station3d/value-instruments'
import { tr } from './text'

const loadAssignment = () => import('./station3d/value-instruments').then(module => module.buildAssignment)
const loadAxis = () => import('./station3d/value-instruments').then(module => module.buildComparison)
const loadGate = () => import('./station3d/value-instruments').then(module => module.buildGate)

export function AssignmentInstrument({ state, onPick }: { state: AssignmentModel; onPick?: (id: string) => void }) {
  return <TeachingModel sceneKey="assignment-cradles" state={state} locale={state.locale} load={loadAssignment} onPick={onPick}
    label={tr(state.locale, '变量存储与写回台', 'Variable storage and write-back bench')} />
}

export function ComparisonInstrument({ state, onPick }: { state: AxisModel; onPick?: () => void }) {
  return <TeachingModel sceneKey="charge-comparison" state={state} locale={state.locale} load={loadAxis} onPick={onPick}
    label={tr(state.locale, '电量比较轨道', 'Charge comparison rail')} />
}

export function GateInstrument({ state, onPick }: { state: GateModel; onPick?: () => void }) {
  const label = state.fork ? tr(state.locale, '芽芽的分岔轨道', 'Sprout’s branching track') : tr(state.locale, '安全门联锁台', 'Safety gate interlock')
  return <TeachingModel sceneKey={state.fork ? 'branch-track' : 'boolean-interlock'} state={state} locale={state.locale} load={loadGate}
    label={label} onPick={state.nextPick ? onPick : undefined} />
}
