import { useMemo, useState } from 'react'
import { fieldWalkthrough, type FieldWorkstation } from '../engine/fieldWalkthrough'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { algorithmFieldState } from './algorithmFieldState'
import { TeachingModel } from './station3d/TeachingModel'
import { InlineExecutionSource } from './InlineExecutionSource'
import { tr } from './text'
import './algorithm-field.css'

const loadField = () => import('./station3d/graph-field-instrument').then(module => module.buildGraphField)

export function AlgorithmFieldLesson({ execution, workstation, step, advance, locale }: {
  execution: ProgramWalkthrough; workstation: FieldWorkstation; step: number; advance: () => void; locale: Locale
}) {
  const trace = useMemo(() => fieldWalkthrough(execution.source, execution.cases[0].input, workstation), [execution, workstation])
  const [inspection, inspect] = useState<{ step: number; id: string }>()
  const snapshot = trace.snapshots[step]
  if (!snapshot) return null
  const { field, stats } = algorithmFieldState(workstation.kind, snapshot, locale)
  const next = trace.snapshots[step + 1]
  const target = next && algorithmFieldState(workstation.kind, next, locale).focus
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const tile = inspection?.step === step ? field.tiles.find(cell => cell.id === inspection.id) : undefined
  if (tile) tile.selected = true
  const targetTile = field.tiles.find(cell => cell.id === target)
  const title = workstation.kind === 'dynamic-programming' ? t('补给电池架', 'Supply battery rack') : t('维修站路线沙盘', 'Repair station route table')
  const line = snapshot.line!
  const previous = trace.snapshots[step - 1]
  const start = previous ? trace.frames.indexOf(previous) + 1 : 0
  const recent = trace.frames.slice(start, trace.frames.indexOf(snapshot) + 1)
    .filter(frame => frame.line && frame.stack.length === 1 && ['assign', 'append', 'output'].includes(frame.kind))
  const codeLines = execution.source.split('\n')
  return <div className="algorithm-field" data-kind={workstation.kind} data-step={step}>
    <TeachingModel sceneKey={'algorithm-' + workstation.kind} locale={locale} label={title} state={field} load={loadField}
      onPick={id => { if (id === target) advance(); else inspect({ step, id }) }} />
    <p className="algorithm-field-stats">{stats.map(text => <span key={text}>{text}</span>)}</p>
    <pre className="algorithm-field-line" aria-label={t('正在执行的 Python', 'Current Python code')}>
      {recent.slice(-3).map((frame, i) => <code key={i} data-line={frame.line} aria-current={frame === snapshot ? 'step' : undefined}>
        <small>{frame.line}</small>{codeLines[frame.line! - 1].trim()}</code>)}
    </pre>
    {tile && <p aria-live="polite">{tile.label} · {tile.robot === 'sprout' ? t('芽芽', 'Sprout') : tile.robot === 'rival'
      ? t('对手', 'Rival') : tile.battery ? t('补给电池', 'Battery') : tile.pending ? t('等待处理', 'Waiting')
        : tile.visited ? t('已访问', 'Visited') : t('通道', 'Passage')}{tile.reading !== undefined && ' · ' + tile.reading}</p>}
    {targetTile && <p className="algorithm-field-pick">{t('点选 ', 'Select ')}<b>{targetTile.label}</b>{t(' 执行下一步。', ' on the table to take the next step.')}</p>}
    <details><summary>{t('查看完整程序', 'View full program')}</summary>
      <pre className="sample-code station-source"><InlineExecutionSource code={execution.source} currentLine={line} nextLine={next?.line} locale={locale} /></pre>
    </details>
  </div>
}
