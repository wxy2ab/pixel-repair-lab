import type { Locale } from '../shared/types'
import { tr } from './text'
import { TeachingModel } from './station3d/TeachingModel'
import type { SequenceBenchState, CollectionBenchState, TraceRackState } from './station3d/program-flow-instruments'

const loadSequence = () => import('./station3d/program-flow-instruments').then(module => module.buildSequenceBench)
const loadCollection = () => import('./station3d/program-flow-instruments').then(module => module.buildCollectionBench)
const loadRack = () => import('./station3d/program-flow-instruments').then(module => module.buildTraceRack)

export function SequenceBench({ state, locale, onPick }: { state: SequenceBenchState; locale: Locale; onPick?: (id: string) => void }) {
  return <TeachingModel sceneKey="sequence-assembly" locale={locale} state={state} load={loadSequence} onPick={onPick}
    label={tr(locale, '指令装配线', 'Instruction assembly line')} />
}

export function CollectionBench({ state, onPick }: { state: CollectionBenchState; onPick?: (id: string) => void }) {
  return <TeachingModel sceneKey="collection-registry" locale={state.locale} state={state} load={loadCollection} onPick={onPick}
    label={tr(state.locale, '位置槽与名字登记册', 'Index slots and name registry')} />
}

export function TraceRack({ state }: { state: TraceRackState }) {
  return <TeachingModel sceneKey="return-rack" locale={state.locale} state={state} load={loadRack}
    label={tr(state.locale, '补电架与返回口', 'Charging rack and return gate')} />
}
