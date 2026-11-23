import type { ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { TeachingModel } from './station3d/TeachingModel'
import type { VerifiedChargeState } from './station3d/python-runtime-instruments'
import { tr } from './text'

const loadStack = () => import('./station3d/python-runtime-instruments').then(module => module.buildCallStack)
const loadVerified = () => import('./station3d/python-runtime-instruments').then(module => module.buildVerifiedCharge)

export function RuntimeStack({ frame, input, locale, onPick }: {
  frame?: ProgramWalkthroughFrame; input: number; locale: Locale; onPick?: (id: string) => void
}) {
  return <TeachingModel sceneKey="python-call-stack" locale={locale}
    label={tr(locale, '调用栈 · 每一层保存自己的变量', 'Call stack · each frame keeps its own variables')}
    load={loadStack} state={{ frame, input, locale }} onPick={onPick} />
}

export function VerifiedNumbers(props: VerifiedChargeState) {
  return <TeachingModel sceneKey="python-verified-values" locale={props.locale}
    label={tr(props.locale, '本次运行的读数', 'Readings from this run')} load={loadVerified} state={props} />
}
