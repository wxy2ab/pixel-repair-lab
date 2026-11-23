import { useId, useState } from 'react'
import { runSelectionSort } from '../engine/programSelectionSort'
import { valuesEqual } from '../engine/values'
import type { CollectionBattery, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale, RunIssue } from '../shared/types'
import { SearchBatteryFace } from './BatterySearchLesson'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import { runIssueText, tr } from './text'
import './charge-prediction.css'
import './for-prediction.css'
import './selection-sort-prediction.css'

type SequenceKind = 'rounds' | 'order'
type Sequences = Record<SequenceKind, string[]>

function SequencePicker({ kind, batteries, sequence, actual, locale, disabled, onChange }: {
  kind: SequenceKind; batteries: CollectionBattery[]; sequence: string[]; actual?: string[];
  locale: Locale; disabled: boolean; onChange: (next: string[]) => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const rounds = kind === 'rounds'
  const limit = batteries.length - (rounds ? 1 : 0)
  const matches = actual ? valuesEqual(sequence, actual) : undefined
  const firstMismatch = actual?.findIndex((name, index) => sequence[index] !== name) ?? -1

  return <fieldset className="for-prediction-field sort-pick-field" disabled={disabled}
    data-testid={`selection-sort-pick-${kind}`} data-match={matches}>
    <legend>{rounds ? t('每轮选中哪块？', 'Which battery will each round select?')
      : t('最后怎样排列？', 'What will the final order be?')}</legend>
    <ol className="sort-pick-slots" data-testid={`selection-sort-${kind}-slots`}>
      {Array.from({ length: limit }, (_, index) => {
        const label = rounds ? t(`第 ${index + 1} 轮`, `Round ${index + 1}`) : t(`第 ${index + 1} 格`, `Slot ${index + 1}`)
        const match = actual ? sequence[index] === actual[index] : undefined
        return <li key={index} data-slot-index={index} data-match={match}
          data-next={sequence.length === index || undefined}>
          <small>{label}</small>
          <strong>{sequence[index] ?? '—'}</strong>
          {match !== undefined && <span className="sort-pick-status" role="img"
            aria-label={match ? t('正确', 'Correct') : t('需要再想想', 'Check again')}>{match ? '✓' : '×'}</span>}
        </li>
      })}
    </ol>
    <div className="search-battery-row sort-pick-options" role="group" aria-label={t('可选电池', 'Available batteries')}>
      {batteries.map(({ name, charge }) => {
        const used = sequence.includes(name)
        return <button key={name} type="button" className="subtle-button search-battery-tile"
          data-battery-name={name} data-used={used || undefined} aria-disabled={used || sequence.length === limit}
          onClick={() => {
            if (!disabled && !used && sequence.length < limit) onChange([...sequence, name])
          }}>
          <SearchBatteryFace name={name} charge={charge} locale={locale} />
        </button>
      })}
    </div>
    <div className="sort-pick-actions">
      <button className="subtle-button" type="button" disabled={sequence.length === 0}
        onClick={() => onChange(sequence.slice(0, -1))}>{t('撤回上一步', 'Undo last pick')}</button>
      <button className="subtle-button" type="button" disabled={sequence.length === 0}
        onClick={() => onChange([])}>{t('清空', 'Clear picks')}</button>
    </div>
    {actual && <dl className="for-prediction-values">
      <div>
        <dt>{rounds ? t('实际选中顺序', 'Actual selections') : t('实际排列', 'Actual final order')}</dt>
        <dd data-testid={`selection-sort-actual-${kind}`}>{actual.join(' → ')}</dd>
      </div>
    </dl>}
    {actual && firstMismatch >= 0 && <p className="for-prediction-hint">
      {rounds
        ? t(`从第 ${firstMismatch + 1} 轮回想起，这轮只在待排序区里找最小的。`,
          `Look back at round ${firstMismatch + 1}. Search only the unsorted section for its smallest charge.`)
        : t(`先检查第 ${firstMismatch + 1} 格，再从左到右核对电量。`,
          `Start by checking slot ${firstMismatch + 1}, then compare the charges from left to right.`)}
    </p>}
  </fieldset>
}

export function SelectionSortPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const heading = useId()
  const [picks, setPicks] = useState<Sequences>({ rounds: [], order: [] })
  const [actual, setActual] = useState<Sequences>()
  const [problem, setProblem] = useState<RunIssue | true>()
  const sample = execution.selectionSort?.practice
  if (!sample) return null

  const t = (zh: string, en: string) => tr(locale, zh, en)
  const matched = actual && valuesEqual(picks.rounds, actual.rounds) && valuesEqual(picks.order, actual.order)
  const ready = picks.rounds.length === sample.batteries.length - 1 && picks.order.length === sample.batteries.length
  const rackField = picks.rounds.length < sample.batteries.length - 1 ? 'rounds' : 'order'
  const rackRow = actual ? actual.order.flatMap(name => sample.batteries.filter(battery => battery.name === name)) : sample.batteries

  function change(next: Sequences) {
    setPicks(next)
    setActual(undefined)
    setProblem(undefined)
  }

  function verify() {
    if (!sample || !ready || actual) return
    const { result, issue } = runSelectionSort(execution.source, sample.batteries)
    if (issue || !result) {
      setProblem(issue ?? true)
      return
    }
    setProblem(undefined)
    setActual({ rounds: result.selected, order: result.order })
    if (valuesEqual(picks.rounds, result.selected) && valuesEqual(picks.order, result.order)) onComplete()
  }

  return <section className="panel selection-sort-prediction" aria-labelledby={heading}
    data-testid="selection-sort-prediction" data-match={matched}>
    <div className="panel-heading">
      <h2 id={heading}>{t('换一排电池，先预测', 'Predict for a new row of batteries')}</h2>
    </div>
    <div className="charge-prediction-body">
      <AlgorithmBatteryRack scene="sort-prediction-rack" locale={locale} batteries={rackRow}
        label={actual ? t('程序排好的电池', 'The sorted batteries from the program')
          : rackField === 'rounds' ? t('按轮次点选最小电池', 'Pick the minimum for each round') : t('按预测的最终顺序点电池', 'Pick batteries in your predicted final order')}
        fixed={actual?.order.length} marked={rackRow.flatMap((battery, i) => !actual && picks[rackField].includes(battery.name) ? [i] : [])}
        onCell={actual || ready ? undefined : i => {
          const name = rackRow[i].name
          if (!picks[rackField].includes(name)) change({ ...picks, [rackField]: [...picks[rackField], name] })
        }} />
      <p>{t('从这排电池出发，依次填上每轮选中的电池，再填最终顺序。只剩最后一块时，它直接留在末尾。',
        'Start with this row. Pick the battery selected in each round, then arrange the final order. The last remaining battery stays where it is.')}</p>
      <ol className="search-battery-row" aria-label={t('这排电池的起始顺序', 'Starting order of the batteries')}
        data-testid="selection-sort-practice-row">
        {sample.batteries.map(({ name, charge }, index) => <li key={name} className="search-battery-tile"
          data-battery-name={name} data-charge={charge}>
          <SearchBatteryFace name={name} charge={charge} index={index} locale={locale} />
        </li>)}
      </ol>
      <div className="for-prediction-fields">
        {(['rounds', 'order'] as const).map(kind => <SequencePicker key={kind} kind={kind} batteries={sample.batteries}
          sequence={picks[kind]} actual={actual?.[kind]} locale={locale} disabled={matched === true}
          onChange={sequence => change({ ...picks, [kind]: sequence })} />)}
      </div>
      <button className="primary-button charge-prediction-verify" type="button" onClick={verify} disabled={!ready || !!actual}>
        {t('运行验证', 'Run to check')}
      </button>
      {problem && <p className="error-message" role="alert">{problem === true
        ? t('程序还没有给出可核对的顺序。请再运行一次。', 'The program did not give an order to check. Run it again.')
        : runIssueText(locale, problem)}</p>}
      {actual && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched
          ? t('每轮选中的电池和最终顺序都猜对了！', 'You predicted every round and the final order!')
          : t('对照 Python 跑出的顺序，再试一次。', 'Compare your predictions with what Python returned and try again.')}</p>
        {!matched && <button className="subtle-button" type="button" onClick={() => change({
          rounds: valuesEqual(picks.rounds, actual.rounds) ? picks.rounds : [],
          order: valuesEqual(picks.order, actual.order) ? picks.order : [],
        })}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
