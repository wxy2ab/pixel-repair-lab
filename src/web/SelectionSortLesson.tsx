import { CodingDevice } from './CodingDevice'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import { StepExplanation } from './LessonNotes'
import { useBatteryMotion } from './useBatteryMotion'
import { useId, useMemo, useRef, useState } from 'react'
import { runSelectionSort, type SelectionSortStep } from '../engine/programSelectionSort'
import type { CollectionBattery, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { SearchBatteryFace } from './BatterySearchLesson'
import { runIssueText, tr } from './text'
import './selection-sort-lesson.css'

type Translate = (zh: string, en: string) => string

function tileToPress(step: SelectionSortStep | undefined) {
  switch (step?.kind) {
    case 'compare': return step.index
    case 'select': return step.candidate
    case 'swap': return step.start
  }
}

function caption(step: SelectionSortStep | undefined, t: Translate) {
  if (!step) return t('先将待排序区的第一块记作当前最小，再往右逐块比较。',
    'Start with the first unsorted battery as the smallest so far. Then check each battery to its right.')

  const first = step.start === undefined ? undefined : step.row[step.start]
  const minimum = step.candidate === undefined ? undefined : step.row[step.candidate]
  const current = step.index === undefined ? undefined : step.row[step.index]
  switch (step.kind) {
    case 'candidate':
      return t(`先记住 ${minimum?.name} 号。它是目前电量最小的电池。`,
        `Start with battery ${minimum?.name}. It is the smallest seen so far.`)
    case 'compare':
      return step.smaller
        ? t(`${current?.name} 号的电量更小，可以换掉当前记住的电池。`,
          `Battery ${current?.name} has a lower charge. It can take over as the smallest so far.`)
        : t(`${current?.name} 号的电量没有更小，保留 ${minimum?.name} 号。`,
          `Battery ${current?.name} does not have a lower charge. Keep battery ${minimum?.name}.`)
    case 'minimum':
      return t(`把 ${minimum?.name} 号记作当前最小。`,
        `Remember battery ${minimum?.name} as the smallest so far.`)
    case 'select':
      return step.candidate === step.start
        ? t(`${minimum?.name} 号电量最小，刚好在待排序区第一格，这一轮不用交换。`,
          `Battery ${minimum?.name} has the lowest charge and is already first in the unsorted section. No swap is needed.`)
        : t(`${minimum?.name} 号是这一轮选中的电池。接下来把它换到待排序区的第一格。`,
          `Battery ${minimum?.name} is the choice for this round. Swap it into the first unsorted position.`)
    case 'swap':
      return t(`交换完成。${first?.name} 号到了待排序区第一格，${minimum?.name} 号到了它原来的位置。`,
        `The swap moved battery ${first?.name} to the first unsorted position and battery ${minimum?.name} to its old spot.`)
    case 'fix':
      return step.sorted === step.row.length
        ? t('只剩一块电池，它已经在最后一格，直接归入排好的范围。',
          'Only one battery remains. It is already in the final position, so it joins the sorted section.')
        : t(`${step.row[step.sorted - 1]?.name} 号的位置已固定，下一轮只比较还没排好的电池。`,
          `Battery ${step.row[step.sorted - 1]?.name} is in place. The next round only checks the remaining unsorted batteries.`)
    case 'return':
      return t('电池已按电量从小到大排好。程序交回每轮选中的电池和最后的顺序。',
        'The batteries are now sorted from lowest to highest charge. The program returns each round’s choice and the final order.')
  }
}

function actionPrompt(next: SelectionSortStep | undefined, t: Translate) {
  switch (next?.kind) {
    case 'compare': return t('按顺序点右边下一块还没比较的电池。', 'Select the next unchecked battery to the right.')
    case 'select': return t('这轮都比过了。点待排序区里电量最小的那块。', 'This round’s checks are done. Select the unsorted battery with the lowest charge.')
    case 'swap': return t('点待排序区的第一块，让它和选中的电池交换位置。', 'Select the first unsorted battery to swap it with the chosen battery.')
  }
}

function advanceLabel(next: SelectionSortStep | undefined, initial: boolean, t: Translate) {
  switch (next?.kind) {
    case 'candidate': return initial ? t('开始第一轮', 'Start round one') : t('开始下一轮', 'Start the next round')
    case 'minimum': return t('设为当前最小', 'Keep the new minimum')
    case 'fix':
      return next.sorted === next.row.length ? t('确认最后一格', 'Confirm the last position') : t('固定这一格', 'Fix this position')
    case 'return': return t('查看结果', 'See the result')
  }
}

export function SelectionSortLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const heading = useId()
  const prompt = useId()
  const [position, setPosition] = useState(-1)
  const motion = useBatteryMotion(position)
  const [swapIndex, setSwapIndex] = useState<number>()
  const [mistake, setMistake] = useState<number>()
  const ready = useRef(false)
  const demo = execution.selectionSort?.demo
  const run = useMemo(() => demo && runSelectionSort(execution.source, demo.batteries), [demo, execution.source])
  if (!demo || !run) return null

  const step = run.steps[position]
  const next = run.steps[position + 1]
  const exchange = swapIndex === undefined ? undefined : step?.swapFrames?.[swapIndex]
  const row = exchange?.row ?? step?.row ?? demo.batteries
  const swapCount = step?.swapFrames?.length ?? 0
  const sorted = step?.sorted ?? 0
  const candidate = step?.kind === 'candidate' || step?.kind === 'minimum' || step?.kind === 'compare' || step?.kind === 'select'
    ? step.candidate : undefined
  const checking = step?.kind === 'compare' ? step.index : undefined
  const swapping = step?.kind === 'swap'
  const tile = tileToPress(next)
  const nextAction = advanceLabel(next, position < 0, t)
  const compare = checking !== undefined && candidate !== undefined
    ? `${row[checking].charge} < ${row[candidate].charge}` : undefined
  const round = sorted < row.length ? (step?.start ?? 0) + 1 : undefined
  const firstComparison = step?.kind === 'compare' && run.steps[position - 1]?.kind === 'candidate' && step.start === 0

  function goTo(nextPosition: number) {
    motion.capture()
    setSwapIndex(undefined)
    setMistake(undefined)
    setPosition(nextPosition)
    if (!ready.current && run?.steps[nextPosition]?.kind === 'return' && run.result && !run.issue) {
      ready.current = true
      onReady()
    }
  }

  function choose(index: number) {
    if (tile === undefined) return
    if (tile === index) goTo(position + 1)
    else setMistake(index)
  }

  function card(battery: CollectionBattery, index: number, fixed: boolean) {
    const { name, charge } = battery
    const label = t(`${name} 号电池，${charge} 格电量，位置 ${index}`,
      `Battery ${name}, charge ${charge}, index ${index}`)
    const state = fixed ? 'fixed' : candidate === index ? 'minimum' : checking === index ? 'checking'
      : swapping && (step?.start === index || step?.candidate === index) ? 'swapped' : 'waiting'
    const attributes = {
      'data-testid': `selection-sort-card-${name}`, 'data-battery-name': name, 'data-charge': charge,
      'data-index': index, 'data-state': state, 'data-mistake': mistake === index || undefined,
    }
    const face = <>
      <SearchBatteryFace name={name} charge={charge} index={index} locale={locale} />
      {state === 'minimum' && <small className="selection-card-marker">{t('最小', 'Min')}</small>}
      {state === 'checking' && compare && <small className="selection-card-marker" data-testid="selection-sort-relation">
        {compare} {step?.smaller ? '✓' : '✕'}
      </small>}
      {state === 'swapped' && <small className="selection-card-marker">{t('⇄ 交换', '⇄ Swap')}</small>}
    </>
    return <li key={index}>
      {fixed || tile === undefined
        ? <div className="search-battery-tile selection-sort-card" {...attributes}>{face}</div>
        : <button type="button" className="subtle-button search-battery-tile selection-sort-card" {...attributes}
          aria-label={label} aria-describedby={prompt} onClick={() => choose(index)}>{face}</button>}
    </li>
  }

  return <section className="classroom-demonstration panel selection-sort-lesson" data-testid="selection-sort-lesson" aria-labelledby={heading}>
    <CodingDevice device="sorter" locale={locale} controls={<>
      {tile !== undefined && <p className="selection-sort-prompt" id={prompt}>{actionPrompt(next, t)}</p>}
      {mistake !== undefined && <p role="status" className="selection-sort-mistake">
        {next?.kind === 'compare' ? t('先点挨着上一块、还没比过的电池。', 'Check the next battery in order before skipping ahead.')
          : next?.kind === 'select' ? t('再看看刚才记下的最小电量。', 'Check which battery you kept as the smallest.')
            : t('交换的另一块是待排序区最左边的电池。', 'The other battery in the swap is the leftmost unsorted battery.')}
      </p>}
      <div className="selection-sort-controls">
        <button type="button" className="subtle-button" disabled={position < 0} onClick={() => goTo(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        {nextAction && <button type="button" className="primary-button" onClick={() => goTo(position + 1)}>{nextAction}</button>}
        {step?.kind === 'return' && <button type="button" className="subtle-button" onClick={() => goTo(-1)}>
          {t('再排一次', 'Sort again')}
        </button>}
        {round !== undefined && <span className="selection-sort-round" data-testid="selection-sort-round">
          {t(`第 ${round} 轮`, `Round ${round}`)}
        </span>}
      </div>
    </>}>
      <div className="panel-heading">
        <h2 id={heading}>{t('按电量从小到大排好', 'Sort the batteries from lowest to highest charge')}</h2>
      </div>
      <div className="selection-sort-body">
        <AlgorithmBatteryRack scene="selection-sort-rack" label={t('电池交换台', 'Battery swapping bench')} locale={locale}
          batteries={row} held={exchange?.held} fixed={sorted} range={[sorted, row.length - 1]}
          marked={[candidate, checking].filter((i): i is number => i !== undefined)}
          badges={{ ...(candidate === undefined ? {} : { [candidate]: t('最小', 'Min') }),
            ...(checking === undefined ? {} : { [checking]: t('比较', 'Check') }) }}
          swap={swapping && step.start !== undefined && step.candidate !== undefined ? [step.start, step.candidate] : undefined}
          step={exchange ?? step} codeId="selection-sort-code" readout={compare} onCell={tile !== undefined ? index => {
            if (index >= sorted) choose(index)
          } : undefined} onAdvance={exchange && swapIndex !== undefined && swapIndex < swapCount - 1
            ? () => setSwapIndex(swapIndex + 1) : nextAction ? () => goTo(position + 1) : undefined} />
        {step?.swapFrames && <div className="selection-sort-controls">
          {swapIndex === undefined ? <button type="button" className="subtle-button" onClick={() => setSwapIndex(0)}>
            {t('逐行看这次交换', 'Inspect the swap line by line')}
          </button> : <>
            <button type="button" className="subtle-button" disabled={swapIndex === 0} onClick={() => setSwapIndex(swapIndex - 1)}>
              {t('上一行', 'Previous line')}
            </button>
            <span>{swapIndex + 1} / {step.swapFrames.length}</span>
            {exchange && <output><code>held = ["{exchange.held.name}", {exchange.held.charge}]</code></output>}
            <button type="button" className="subtle-button" disabled={swapIndex === step.swapFrames.length - 1} onClick={() => setSwapIndex(swapIndex + 1)}>
              {t('下一行', 'Next line')}
            </button>
            <button type="button" className="subtle-button" onClick={() => setSwapIndex(undefined)}>{t('返回本轮', 'Return to this round')}</button>
          </>}
        </div>}
        <div className="selection-sort-board" ref={motion.board}>
          <section className="selection-sort-lane is-fixed">
            <h3>{t('已排好', 'Sorted')} <strong>{sorted}</strong></h3>
            {sorted === 0 && <p>{t('还没有固定位置', 'No positions fixed yet')}</p>}
            <ol className="search-battery-row" data-testid="selection-sort-fixed" aria-label={t('已排好的电池', 'Sorted batteries')}>
              {row.slice(0, sorted).map((battery, index) => card(battery, index, true))}
            </ol>
          </section>
          <section className="selection-sort-lane is-unsorted">
            <h3>{t('待排序', 'Unsorted')} <strong>{row.length - sorted}</strong></h3>
            {sorted === row.length && <p>{t('全部电池都已排好', 'All batteries are sorted')}</p>}
            <ol className="search-battery-row" data-testid="selection-sort-unsorted" aria-label={t('待排序的电池', 'Unsorted batteries')}>
              {row.slice(sorted).map((battery, index) => card(battery, sorted + index, false))}
            </ol>
          </section>
        </div>
        <div className="selection-sort-step" data-testid="selection-sort-step" data-kind={step?.kind ?? 'start'}
          data-sorted={sorted} data-start={step?.start} data-candidate={step?.candidate} data-index={step?.index} data-line={step?.line}
          data-next-kind={next?.kind}>
          <StepExplanation locale={locale}>
            {exchange && swapIndex === 0 ? t('先将待排序区第一格的电池记在 held 里。', 'Save the first unsorted battery in held.')
              : exchange && swapIndex === 1 ? t('把选中的电池写入第一格。原来那块还记在 held 里。', 'Write the selected battery into the first slot. The original battery is still saved in held.')
              : caption(step, t)}
          {firstComparison && <p className="selection-sort-code-note">
            {t('每块电池存成 [名字, 电量]。row[index][1] 取这块电池的电量。',
              'Each battery is stored as [name, charge]. row[index][1] reads that battery’s charge.')}
          </p>}
          </StepExplanation>
        </div>
        {run.issue && <p className="error-message" role="alert">{runIssueText(locale, run.issue)}</p>}
      </div>
    </CodingDevice>
  </section>
}
