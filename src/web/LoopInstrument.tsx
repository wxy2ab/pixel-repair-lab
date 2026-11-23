import { TeachingModel } from './station3d/TeachingModel'
import type { LoopInstrumentState } from './station3d/loop-instrument'
import { tr } from './text'

const loadLoopInstrument = () => import('./station3d/loop-instrument').then(module => module.buildLoopInstrument)

export function LoopInstrument({ state, onPick }: {
  state: LoopInstrumentState; onPick?: (id: string) => void
}) {
  const { locale } = state
  const label = state.mode === 'for' ? tr(locale, '逐块读数和记录的电池台', 'Battery reader and results tray')
    : state.mode === 'while' ? tr(locale, '带目标刻度的补电机', 'Charger with a target gauge')
    : tr(locale, '逐排补电的维修架', 'Multi-row charging rack')
  return <TeachingModel sceneKey={'loop-' + state.mode} state={state} label={label} locale={locale} load={loadLoopInstrument} onPick={onPick} />
}
