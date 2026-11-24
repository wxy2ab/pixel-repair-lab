import { CodingDevice } from './CodingDevice'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import { useId, useMemo, useRef, useState } from 'react'
import { runPrefixTotals } from '../engine/programPrefixTotals'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { SearchBatteryFace } from './BatterySearchLesson'
import { runIssueText, tr } from './text'
import './prefix-totals-lesson.css'

type Interval = { left: number; right: number }
type Translate = (zh: string, en: string) => string

function CumulativeCell({ index, value, name, highlighted, onChoose, t }: {
  index: number; value?: number; name?: string; highlighted: boolean; onChoose?: () => void; t: Translate;
}) {
  const attributes = {
    className: 'prefix-totals-value',
    'data-testid': `prefix-value-${name ?? 'start'}`,
    'data-total': value,
    'data-prefix-index': index,
    'data-highlight': highlighted || undefined,
  }
  const face = <><small>{`prefix[${index}]`}</small><strong>{value ?? '—'}</strong></>
  const label = name === undefined
    ? t(`第一块电池之前的累计值，${value} 格`, `Total before the first battery, ${value} units`)
    : t(`累计至 ${name} 号电池，${value} 格`, `Total through battery ${name}, ${value} units`)
  return onChoose && value !== undefined
    ? <button type="button" {...attributes} aria-label={label} onClick={onChoose}>{face}</button>
    : <span {...attributes}>{face}</span>
}

export function PrefixTotalsLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const heading = useId()
  const ready = useRef(false)
  const [anchor, setAnchor] = useState<number>()
  const [interval, setInterval] = useState<Interval>()
  const [position, setPosition] = useState(-1)
  const [mistake, setMistake] = useState(false)
  const batteries = execution.prefixTotalsLesson?.demo.batteries
  const run = useMemo(() => interval && batteries
    ? runPrefixTotals(execution.source, batteries, interval.left, interval.right)
    : undefined, [batteries, execution.source, interval])
  if (!batteries) return null

  const t: Translate = (zh, en) => tr(locale, zh, en)
  const step = run?.steps[position]
  const next = run?.steps[position + 1]
  const previous = run?.steps[position - 1]
  const prefix = step?.prefix ?? []
  const displayPrefix = prefix.length > 0
  const batteryAction = next?.kind === 'direct' || next?.kind === 'prefix'
  const operandAction = next?.kind === 'included' || next?.kind === 'before'
  const rightValueIndex = interval ? interval.right + 1 : undefined
  const beforeValueIndex = interval?.left
  const visibleSteps = run?.steps.slice(0, position + 1)
  const included = visibleSteps?.find(item => item.kind === 'included')?.value
  const before = visibleSteps?.find(item => item.kind === 'before')?.value
  const result = step?.kind === 'return' ? run?.result : undefined
  const difference = step?.kind === 'subtract' ? step.value : result?.total

  function goTo(nextPosition: number) {
    setMistake(false)
    setPosition(nextPosition)
    if (!ready.current && run?.steps[nextPosition]?.kind === 'return' && run.result && !run.issue) {
      ready.current = true
      onReady()
    }
  }

  function chooseBattery(index: number) {
    if (!interval) {
      if (anchor === undefined) setAnchor(index)
      else setInterval({ left: Math.min(index, anchor), right: Math.max(index, anchor) })
      return
    }
    if (!batteryAction) return
    if (index === next.index) goTo(position + 1)
    else setMistake(true)
  }

  function chooseCumulative(index: number) {
    if (!operandAction) return
    const expected = next.kind === 'included' ? rightValueIndex : beforeValueIndex
    if (index === expected) goTo(position + 1)
    else setMistake(true)
  }

  function reset() {
    setAnchor(undefined)
    setInterval(undefined)
    goTo(-1)
  }

  function prompt() {
    if (!interval) {
      return anchor === undefined
        ? t('先点一块电池，选出区间的一端。', 'Choose a battery to mark one end of the range.')
        : t('再点另一端。想只算一块，可以再点刚才那块。', 'Choose the other end. Click the same battery again to use just that one.')
    }
    switch (next?.kind) {
      case 'direct': return t('从所选区间的左端开始，向右逐块点选，把电量加起来。', 'Start at the left of your range. Click its batteries in order to add their charges.')
      case 'prefix': return t('从整排第一块开始，向右逐块点选，把新的累计值记下来。', 'Start at the very first battery. Click in order to record each running total.')
      case 'included': return t('点所选区间右端下面的累计值。它包括这段电池，也包括它左边的电池。', 'Choose the total under the right end of the range. It includes the range and all batteries before it.')
      case 'before': return interval.left === 0
        ? t('区间左端前没有电池。点最开头的 0。', 'There are no batteries before this range. Choose the starting zero.')
        : t('点所选区间左端前一块电池下面的累计值。这部分要减掉。', 'Choose the total under the battery just before the left end. This is the part to subtract.')
    }
  }

  function cumulativeCell(index: number, name?: string) {
    return <CumulativeCell index={index} name={name} value={prefix[index]} t={t}
      highlighted={(included !== undefined && index === rightValueIndex) || (before !== undefined && index === beforeValueIndex)}
      onChoose={operandAction ? () => chooseCumulative(index) : undefined} />
  }

  const selectedNames = interval && [batteries[interval.left].name, batteries[interval.right].name]
  const currentBattery = step?.index === undefined ? undefined : batteries[step.index]
  const arithmetic = step?.kind === 'direct' && currentBattery
    ? `${previous?.direct ?? 0} + ${currentBattery.charge} = ${step.direct}`
    : step?.kind === 'prefix' && currentBattery && step.index !== undefined
      ? `${prefix[step.index]} + ${currentBattery.charge} = ${prefix[step.index + 1]}`
      : undefined
  const instruction = prompt()

  return <section className="classroom-demonstration panel prefix-totals-lesson" data-testid="prefix-totals-lesson" aria-labelledby={heading}>
    <CodingDevice device="scanner" locale={locale} workbench controls={<>
      <ol className="prefix-totals-row" data-testid="prefix-totals-row" aria-label={t('电池及其累计值', 'Batteries and cumulative totals')}>
        {displayPrefix && <li className="prefix-totals-column prefix-totals-origin">
          <span className="prefix-totals-origin-label">{t('起始值', 'Start')}</span>
          {cumulativeCell(0)}
        </li>}
        {batteries.map(({ name, charge }, index) => {
          const state = interval ? index < interval.left ? 'before' : index > interval.right ? 'after' : 'selected'
            : index === anchor ? 'anchor' : 'idle'
          const attributes = {
            className: 'search-battery-tile prefix-totals-battery',
            'data-testid': `prefix-battery-${name}`,
            'data-battery-name': name,
            'data-charge': charge,
            'data-state': state,
            'data-current': step?.index === index || undefined,
          }
          const face = <SearchBatteryFace name={name} charge={charge} index={index} locale={locale} />
          return <li key={name} className="prefix-totals-column">
            {!interval || batteryAction
              ? <button type="button" {...attributes} aria-pressed={!interval ? state === 'anchor' : undefined}
                onClick={() => chooseBattery(index)}>{face}</button>
              : <span {...attributes}>{face}</span>}
            {displayPrefix && cumulativeCell(index + 1, name)}
          </li>
        })}
      </ol>
      {mistake && <p className="prefix-totals-hint" data-testid="prefix-totals-hint" role="status">
        {t('再看看这一步该用哪一格。', 'Look again at which cell this step needs.')}
      </p>}
      <div className="prefix-totals-controls">
        <button type="button" className="subtle-button" disabled={position < 0} onClick={() => goTo(position - 1)}>{t('上一步', 'Previous step')}</button>
        {next?.kind === 'zero' && <button type="button" className="primary-button" onClick={() => goTo(position + 1)}>{t('开始累计', 'Start the running totals')}</button>}
        {next?.kind === 'subtract' && <button type="button" className="primary-button" onClick={() => goTo(position + 1)}>{t('相减', 'Subtract')}</button>}
        {next?.kind === 'return' && <button type="button" className="primary-button" onClick={() => goTo(position + 1)}>{t('核对结果', 'Compare the results')}</button>}
        {(anchor !== undefined || interval) && <button type="button" className="subtle-button" onClick={reset}>{t('重选区间', 'Choose another range')}</button>}
      </div>
      {/* What to do next sits under the buttons, beside the batteries and totals the learner taps. */}
      <div className="prefix-totals-step" data-testid="prefix-totals-step" data-kind={step?.kind ?? (interval ? 'start' : 'select')}
        data-left={interval?.left} data-right={interval?.right} data-index={step?.index}>
        <div className="prefix-totals-status" role="status">
          {instruction && <p>{instruction}</p>}
          {interval && <p>
            {t('逐块相加', 'Direct total')} <strong data-testid="prefix-totals-direct">{step?.direct ?? 0}</strong>
            {step?.kind === 'direct' && arithmetic && <code className="prefix-totals-math" data-testid="prefix-totals-arithmetic">{arithmetic}</code>}
          </p>}
          {step?.kind === 'prefix' && arithmetic && <p>
            {t(`累计到 ${currentBattery?.name} 号`, `Total through battery ${currentBattery?.name}`)}
            <code className="prefix-totals-math" data-testid="prefix-totals-arithmetic">{arithmetic}</code>
          </p>}
          {step?.kind === 'before' && <p>{interval?.left === 0
            ? t('左端就是第一块，区间前没有电池。从右端累计里减去 0。', 'The range starts at the first battery. Subtract zero from the total through the right end.')
            : t('右端累计包括左边的蓝色电池和所选的绿色电池。减去蓝色电池的累计值，就只剩所选区间。',
              'The total through the right end covers the earlier blue batteries and the selected green ones. Subtract the blue batteries’ total to leave just your range.')}</p>}
          {result && <p data-testid="prefix-totals-result">
            {t(`${included} − ${before} = ${result.total} 格，和逐块相加的 ${result.direct} 格一样。`, `${included} − ${before} = ${result.total} units, the same as adding each battery (${result.direct}).`)}
          </p>}
        </div>
      </div>
    </>}>
      <div className="panel-heading"><h2 id={heading}>{t('给一段电池算总电量', 'Find the charge of a battery range')}</h2></div>
      <div className="prefix-totals-body">
        <AlgorithmBatteryRack scene="prefix-totals-rack" locale={locale} label={t('区间电量与累计表', 'Range charge and cumulative totals')}
          batteries={batteries} range={interval && [interval.left, interval.right]}
          marked={[interval ? undefined : anchor, step?.index].filter((i): i is number => i !== undefined)}
          prefix={displayPrefix ? prefix : undefined}
          operands={[included === undefined ? undefined : rightValueIndex, before === undefined ? undefined : beforeValueIndex].filter((i): i is number => i !== undefined)}
          readout={difference !== undefined ? included + ' − ' + before + ' = ' + difference : arithmetic}
          step={step} codeId="prefix-totals-code" onCell={!interval || batteryAction ? chooseBattery : undefined}
          onPrefix={operandAction ? chooseCumulative : undefined}
          onAdvance={next && !batteryAction && !operandAction ? () => goTo(position + 1) : undefined} />
        {selectedNames && <p className="prefix-totals-selected">
          {t('所选区间', 'Selected range')} <strong>{selectedNames[0] === selectedNames[1] ? selectedNames[0] : selectedNames.join(' → ')}</strong>
        </p>}
        {displayPrefix && <p className="prefix-totals-offset">
          {included !== undefined && interval && selectedNames
            ? t(`开头的 prefix[0] 表示还没加任何电池。右端 ${selectedNames[1]} 号的位置是 ${interval.right}，累计值在 prefix[${interval.right + 1}]。`,
              `The initial prefix[0] covers no batteries. The right end, battery ${selectedNames[1]}, is at index ${interval.right}, and its total is in prefix[${interval.right + 1}].`)
            : t('最开头的 0 表示还没加任何电池，所以位置 i 的累计值记在 prefix[i + 1]。', 'The initial zero means no batteries have been added. The total through battery index i is stored at prefix[i + 1].')}
        </p>}
        {included !== undefined && <div className="prefix-totals-operands" aria-label={t('累计值相减', 'Subtract the cumulative totals')}>
          <span className="prefix-totals-through"><small>{t('累计到右端', 'Through the right end')}</small><strong>{included}</strong></span>
          {before !== undefined && <>
            <span aria-hidden="true">−</span>
            <span className="prefix-totals-before"><small>{t('累计到左端前', 'Before the left end')}</small><strong>{before}</strong></span>
          </>}
          {difference !== undefined && <>
            <span aria-hidden="true">=</span>
            <span className="prefix-totals-difference"><small>{t('所选区间', 'Selected range')}</small><strong>{difference}</strong></span>
          </>}
        </div>}
        {run?.issue && <p className="error-message" role="alert">{runIssueText(locale, run.issue)}</p>}
      </div>
    </CodingDevice>
  </section>
}
