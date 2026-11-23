import type { Locale } from '../shared/types'
import { useState } from 'react'
import type { AlgorithmRackState } from './station3d/algorithm-battery-rack'
import { TeachingModel } from './station3d/TeachingModel'
import { tr } from './text'
import './algorithm-battery-rack.css'

const loadRack = () => import('./station3d/algorithm-battery-rack').then(module => module.buildAlgorithmRack)

export function AlgorithmBatteryRack({ scene, label, locale, step, codeId, onCell, onPrefix, onAdvance, inspect, ...state }: AlgorithmRackState & {
  scene: string; label: string; locale: Locale; step?: { code: string; line: number }; codeId?: string
  onCell?: (index: number) => void; onPrefix?: (index: number) => void; onAdvance?: () => void; inspect?: boolean
}) {
  const [inspected, setInspected] = useState<number>()
  const meter = inspect && inspected !== undefined && state.batteries[inspected]
    ? { marked: [...(state.marked ?? []), inspected], badges: { ...state.badges, [inspected]: tr(locale, '读数', 'Reading') } } : undefined
  const lines = step?.code.split('\n') ?? []
  const indent = Math.min(...lines.filter(line => line.trim()).map(line => line.length - line.trimStart().length))
  return <div className="algorithm-rack" data-long={state.batteries.length > 6 || undefined}>
    <TeachingModel sceneKey={scene} label={label} locale={locale} load={loadRack} state={{ ...state, ...meter, advance: Boolean(onAdvance) }}
      onPick={inspect || onCell || onPrefix || onAdvance ? id => {
        if (id === 'advance') onAdvance?.()
        else if (id.startsWith('cell-')) {
          const index = Number(id.slice(5))
          if (onCell) onCell(index)
          else if (inspect) setInspected(index)
        } else if (id.startsWith('prefix-')) onPrefix?.(Number(id.slice(7)))
      } : undefined} />
    {step && <div className="algorithm-rack-line" data-testid={codeId} aria-label={tr(locale, '这一步执行的代码', 'Code executed in this step')}>
      <span>{step.line}</span><pre><code>{lines.map(line => line.slice(indent)).join('\n')}</code></pre>
    </div>}
  </div>
}
