import { CodingDevice } from './CodingDevice'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import { useId, useMemo, useRef, useState } from 'react'
import { runTwoPointer, type TwoPointerStep } from '../engine/programTwoPointer'
import type { ProgramWalkthrough, TwoPointerCase, TwoPointerMove } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { SearchBatteryFace } from './BatterySearchLesson'
import { runIssueText, tr } from './text'
import './two-pointer-lesson.css'

type Translate = (zh: string, en: string) => string

function explainMove(move: TwoPointerMove, calculation: TwoPointerStep, { batteries, target }: TwoPointerCase, t: Translate) {
  const left = batteries[calculation.left].name
  const right = batteries[calculation.right].name
  if (move === 'left') {
    return t(
      `${left} 号连和电量最高的 ${right} 号配对也只有 ${calculation.total} 格，达不到 ${target} 格。换同一范围里的其他电池，总电量只会一样或更小，所以可以排除 ${left} 号。`,
      `Even paired with ${right}, the highest charge in range, ${left} gives only ${calculation.total} units. Any other partner gives the same or less, so ${left} cannot reach ${target}.`)
  }
  return t(
    `${right} 号连和电量最低的 ${left} 号配对也有 ${calculation.total} 格，超过了 ${target} 格。换同一范围里的其他电池，总电量只会一样或更大，所以可以排除 ${right} 号。`,
    `Even paired with ${left}, the lowest charge in range, ${right} gives ${calculation.total} units. Any other partner gives the same or more, so ${right} cannot make exactly ${target}.`)
}

export function TwoPointerLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const heading = useId()
  const [position, setPosition] = useState(-1)
  const [mistake, setMistake] = useState<TwoPointerMove>()
  const ready = useRef(false)
  const demo = execution.twoPointerLesson?.demo
  const run = useMemo(() => demo && runTwoPointer(execution.source, demo.batteries, demo.target), [demo, execution.source])
  if (!demo || !run) return null

  const { batteries, target } = demo
  const step = run.steps[position]
  const next = run.steps[position + 1]
  const left = step?.left ?? 0
  const right = step?.right ?? batteries.length - 1
  const calculation = step?.kind === 'sum' ? step : run.steps[position - 1]
  const compared = calculation?.kind === 'sum' && calculation.total !== undefined ? calculation : undefined
  const total = compared?.total
  const relation = total === target ? '=' : total !== undefined && total < target ? '<' : '>'
  const pair = step?.kind === 'return' ? run.result?.pair : undefined
  const removed = step?.move === 'left' ? compared?.left : step?.move === 'right' ? compared?.right : undefined
  const explanation = step?.kind === 'move' && step.move && compared
    ? explainMove(step.move, compared, demo, t)
    : step?.kind === 'sum'
      ? next?.kind === 'return'
        ? t('总电量正好等于目标。确认这两块就是要找的一对。', 'The total matches the target. Confirm these two batteries as the pair.')
        : relation === '<'
          ? t('总电量偏小。要让它有机会变大，哪一端该往里移？', 'The total is too low. Which end could move inward to increase it?')
          : t('总电量偏大。要让它有机会变小，哪一端该往里移？', 'The total is too high. Which end could move inward to decrease it?')
      : undefined

  function goTo(nextPosition: number) {
    setMistake(undefined)
    setPosition(nextPosition)
    if (!ready.current && run?.steps[nextPosition]?.kind === 'return' && run.result?.pair && !run.issue) {
      ready.current = true
      onReady()
    }
  }

  function move(direction: TwoPointerMove) {
    if (next?.kind !== 'move') return
    if (direction === next.move) goTo(position + 1)
    else setMistake(direction)
  }

  return <section className="classroom-demonstration panel two-pointer-lesson" data-testid="two-pointer-lesson" aria-labelledby={heading}>
    <CodingDevice device="scanner" locale={locale} controls={<>
      {mistake && <p className="two-pointer-hint" data-testid="two-pointer-hint" role="status">
        {mistake === 'left'
          ? t('左端往里移会换成电量一样或更高的电池，总电量不会变小。', 'Moving the left end in keeps or increases its charge. The total will not go down.')
          : t('右端往里移会换成电量一样或更低的电池，总电量不会变大。', 'Moving the right end in keeps or decreases its charge. The total will not go up.')}
      </p>}
      <div className="two-pointer-controls">
        <button type="button" className="subtle-button" disabled={position < 0} onClick={() => goTo(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        {next?.kind === 'sum' && <button type="button" className="primary-button" onClick={() => goTo(position + 1)}>
          {t('算总电量', 'Add the charges')}
        </button>}
        {next?.kind === 'move' && <>
          <button type="button" className="subtle-button" onClick={() => move('left')}>
            {t('左端向右移', 'Move left end right')}
          </button>
          <button type="button" className="subtle-button" onClick={() => move('right')}>
            {t('右端向左移', 'Move right end left')}
          </button>
        </>}
        {next?.kind === 'return' && <button type="button" className="primary-button" onClick={() => goTo(position + 1)}>
          {step?.kind === 'sum' ? t('确认配对', 'Confirm the pair') : t('查看结果', 'See the result')}
        </button>}
        {step?.kind === 'return' && <button type="button" className="subtle-button" onClick={() => goTo(-1)}>
          {t('再找一次', 'Try again')}
        </button>}
      </div>
    </>}>
      <div className="panel-heading">
        <h2 id={heading}>{t('从两端找电池', 'Find a pair from both ends')}</h2>
      </div>
      <div className="two-pointer-body">
        <AlgorithmBatteryRack scene="two-pointer-rack" locale={locale} label={t('双指针配对架', 'Two-pointer pairing rack')}
          batteries={batteries} range={[left, right]} marked={[left, right]}
          badges={{ [left]: t('左端', 'Left'), [right]: left === right ? t('相遇', 'Met') : t('右端', 'Right') }}
          readout={compared ? batteries[compared.left].charge + ' + ' + batteries[compared.right].charge + ' = ' + total : undefined}
          step={step} codeId="two-pointer-code" onCell={next?.kind === 'move' ? index => {
            if (index === left) move('left')
            if (index === right) move('right')
          } : undefined} onAdvance={next && next.kind !== 'move' ? () => goTo(position + 1) : undefined} />
        <p className="two-pointer-task">
          {t(`电池已按电量从小到大排列。找两块电池，合起来正好是 ${target} 格。`,
            `The batteries are sorted from lowest to highest charge. Find two that add up to exactly ${target} units.`)}
        </p>
        <ol className="search-battery-row two-pointer-row" data-testid="two-pointer-row"
          aria-label={t('按电量从小到大排列的电池', 'Batteries sorted by charge')}>
          {batteries.map(({ name, charge }, index) => {
            const marker = index === left && index === right ? t('相遇', 'Met')
              : index === left ? t('左端', 'Left') : index === right ? t('右端', 'Right') : undefined
            const state = pair?.includes(name) ? 'found'
              : index < left || index > right ? 'excluded'
              : index === left && index === right ? 'met'
              : index === left ? 'left' : index === right ? 'right' : 'available'
            const stateLabel = state === 'excluded'
              ? removed === index ? t('刚排除', 'Just ruled out') : t('已排除', 'Ruled out')
              : state === 'found' ? t('找到的配对', 'Matching pair') : marker
            return <li key={name} className="search-battery-tile two-pointer-card" data-testid={`two-pointer-card-${name}`}
              data-battery-name={name} data-state={state} data-index={index} data-charge={charge} data-recent={removed === index || undefined}
              aria-label={stateLabel ? t(`${name} 号，${charge} 格，${stateLabel}`, `Battery ${name}, charge ${charge}, ${stateLabel}`) : undefined}>
              <SearchBatteryFace name={name} charge={charge} index={index} locale={locale} />
              {marker && <small className="two-pointer-marker">
                <span aria-hidden="true">↑ </span>{marker}
              </small>}
              {state === 'excluded' && <small className="two-pointer-marker">{t('排除', 'Out')}</small>}
            </li>
          })}
        </ol>
        <div className="two-pointer-step" data-testid="two-pointer-step" data-kind={step?.kind ?? 'start'}
          data-left={left} data-right={right} data-total={step?.total} data-move={step?.move}>
          <div className="two-pointer-status" role="status">
            {!step && <p>{t('先拿最左和最右两块，算出它们的总电量。', 'Start with the leftmost and rightmost batteries. Add their charges.')}</p>}
            {compared && <p>
              {step?.kind === 'move' && <span className="two-pointer-prior">{t('刚才的总电量', 'Previous total')}</span>}
              <span className="two-pointer-equation" data-testid="two-pointer-equation" data-relation={relation}>
                {batteries[compared.left].charge} + {batteries[compared.right].charge} = {total}{relation !== '=' && ` ${relation} ${target}`}
              </span>
            </p>}
            {explanation && <p data-testid="two-pointer-explanation">{explanation}</p>}
            {step?.kind === 'return' && <p data-testid="two-pointer-result">
              {pair ? t(`找到 ${pair[0]} 号和 ${pair[1]} 号。程序返回它们的位置 ${left} 和 ${right}。`,
                `Found batteries ${pair[0]} and ${pair[1]}. The program returns their positions, ${left} and ${right}.`)
                : t('两端相遇前没有凑出目标。程序返回空列表。', 'The pointers met without a match. The program returns an empty list.')}
            </p>}
          </div>
        </div>
        {run.issue && <p className="error-message" role="alert">{runIssueText(locale, run.issue)}</p>}
      </div>
    </CodingDevice>
  </section>
}
