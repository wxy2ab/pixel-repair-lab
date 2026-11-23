import { useId, useState } from 'react'
import { runTwoPointer } from '../engine/programTwoPointer'
import { valuesEqual } from '../engine/values'
import type { ProgramWalkthrough, TwoPointerMove } from '../shared/programWalkthrough'
import type { Locale, RunIssue } from '../shared/types'
import { SearchBatteryFace } from './BatterySearchLesson'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import { runIssueText, tr } from './text'
import './charge-prediction.css'
import './for-prediction.css'
import './two-pointer-prediction.css'

type Prediction = { moves: TwoPointerMove[]; pair: string[] }
type Attempt = {
  moves: TwoPointerMove[]
  pair: [string, string]
  sums: { left: number; right: number; total: number }[]
}

function moveLabel(move: TwoPointerMove, locale: Locale) {
  return move === 'left' ? tr(locale, '左端向右移', 'Move left end right') : tr(locale, '右端向左移', 'Move right end left')
}

function samePair(picked: string[], actual: [string, string]) {
  return picked.length === 2 && actual.every(name => picked.includes(name))
}

export function TwoPointerPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const heading = useId()
  const [prediction, setPrediction] = useState<Prediction>({ moves: [], pair: [] })
  const [attempt, setAttempt] = useState<Attempt>()
  const [problem, setProblem] = useState<RunIssue | true>()
  const sample = execution.twoPointerLesson?.practice
  if (!sample) return null

  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { moves, pair } = prediction
  const moveMatch = attempt && valuesEqual(moves, attempt.moves)
  const pairMatch = attempt && samePair(pair, attempt.pair)
  const matched = attempt && moveMatch === true && pairMatch === true
  const canMove = moves.length < sample.batteries.length - 2
  const leftIndex = moves.filter(move => move === 'left').length
  const rightIndex = sample.batteries.length - 1 - (moves.length - leftIndex)
  const firstMismatch = attempt?.moves.findIndex((move, index) => move !== moves[index]) ?? -1

  function change(next: Prediction) {
    setPrediction(next)
    setAttempt(undefined)
    setProblem(undefined)
  }

  function verify() {
    if (!sample || pair.length !== 2 || attempt) return
    const { result, issue, steps } = runTwoPointer(execution.source, sample.batteries, sample.target)
    if (issue || !result?.pair) {
      setProblem(issue ?? true)
      return
    }
    const sums = steps.flatMap(({ kind, left, right, total }) =>
      kind === 'sum' && total !== undefined ? [{ left, right, total }] : [])
    setProblem(undefined)
    setAttempt({ moves: result.moves, pair: result.pair, sums })
    if (valuesEqual(moves, result.moves) && samePair(pair, result.pair)) onComplete()
  }

  return <section className="panel two-pointer-prediction" aria-labelledby={heading}
    data-testid="two-pointer-prediction" data-match={matched}>
    <div className="panel-heading"><h2 id={heading}>{t('换一排电池，先预测', 'Predict for a new row of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <AlgorithmBatteryRack scene="pair-prediction-rack" locale={locale} label={t('点选你预测的配对', 'Pick your predicted battery pair')}
        batteries={sample.batteries} range={attempt ? undefined : [leftIndex, rightIndex]}
        marked={sample.batteries.flatMap(({ name }, i) => (attempt?.pair ?? pair).includes(name) ? [i] : [])}
        badges={attempt ? undefined : { [leftIndex]: t('左端', 'Left'), [rightIndex]: t('右端', 'Right') }}
        onCell={matched ? undefined : index => {
          const name = sample.batteries[index].name
          if (pair.includes(name)) change({ ...prediction, pair: pair.filter(value => value !== name) })
          else if (pair.length < 2) change({ ...prediction, pair: [...pair, name] })
        }} />
      <p>{t(`从两头出发，找出总电量正好是 ${sample.target} 格的两块电池。`,
        `Start from the two ends and find a pair with exactly ${sample.target} units of charge.`)}</p>
      <div className="for-prediction-fields">
        <fieldset className="for-prediction-field two-pointer-pick" disabled={matched} data-prediction="moves" data-match={moveMatch}>
          <legend>{t('哪一端先动，接着怎么动？', 'Which end moves first, and what moves next?')}</legend>
          <p className="two-pointer-prediction-hint">{t('按顺序加入每一步。两端起初就凑够时，可以不移动。',
            'Add the moves in order. Leave them empty if the two ends already add up to the target.')}</p>
          <div className="two-pointer-prediction-controls">
            {(['left', 'right'] as const).map(move => <button key={move} type="button" className="subtle-button"
              data-testid={`two-pointer-move-${move}`} disabled={!canMove}
              onClick={() => change({ ...prediction, moves: [...moves, move] })}>{moveLabel(move, locale)}</button>)}
          </div>
          {moves.length === 0 && <p className="two-pointer-prediction-hint">{t('尚未添加移动。', 'No moves added yet.')}</p>}
          <ol className="two-pointer-moves" data-testid="two-pointer-predicted-moves" aria-label={t('预测的移动', 'Predicted moves')}>
            {moves.map((move, index) => <li key={index} data-move={move} data-match={attempt ? attempt.moves[index] === move : undefined}>
              {moveLabel(move, locale)}
            </li>)}
          </ol>
          <div className="two-pointer-prediction-controls">
            <button type="button" className="subtle-button" disabled={moves.length === 0} data-testid="two-pointer-undo"
              onClick={() => change({ ...prediction, moves: moves.slice(0, -1) })}>{t('撤回上一步', 'Undo last move')}</button>
            <button type="button" className="subtle-button" disabled={moves.length === 0} data-testid="two-pointer-clear"
              onClick={() => change({ ...prediction, moves: [] })}>{t('清空移动', 'Clear moves')}</button>
          </div>
          {attempt && <dl className="for-prediction-values">
            <div>
              <dt>{t('实际移动', 'Actual moves')}</dt>
              <dd data-testid="two-pointer-actual-moves">
                {attempt.moves.length === 0 ? t('无须移动', 'No moves needed') : attempt.moves.map((move, index) =>
                  <span key={index}>{index > 0 && ' → '}<span data-move={move}>{moveLabel(move, locale)}</span></span>)}
              </dd>
            </div>
          </dl>}
          {moveMatch === false && <p className="for-prediction-hint">
            {firstMismatch < 0
              ? t('达到目标时就停下。检查是否多加了移动。', 'Stop when the sum reaches the target. Check for extra moves.')
              : t(`从第 ${firstMismatch + 1} 步重新想起，比较两端的和与目标。`,
                `Check move ${firstMismatch + 1} first. Compare the sum at the two ends with the target.`)}
          </p>}
        </fieldset>
        <fieldset className="for-prediction-field two-pointer-pick" disabled={matched} data-prediction="pair" data-match={pairMatch}>
          <legend>{t('最后会找到哪两块？', 'Which two batteries will be found?')}</legend>
          <p className="two-pointer-prediction-hint">{t('点选两块电池。左右标记跟着你预测的移动变化。',
            'Choose two batteries. The left and right markers follow the moves you predict.')}</p>
          <ol className="search-battery-row two-pointer-pair-row" data-testid="two-pointer-prediction-row"
            aria-label={t('已按电量排序的电池', 'Batteries sorted by charge')}>
            {sample.batteries.map(({ name, charge }, index) => {
              const selected = pair.includes(name)
              const pointer = index === leftIndex ? 'left' : index === rightIndex ? 'right' : undefined
              const pointerText = pointer === 'left' ? t('左端', 'Left') : pointer === 'right' ? t('右端', 'Right') : undefined
              return <li key={name}>
                <button type="button" className="subtle-button search-battery-tile" data-battery-name={name}
                  data-pointer={pointer} aria-pressed={selected} disabled={!selected && pair.length === 2}
                  onClick={() => change({ ...prediction, pair: selected ? pair.filter(battery => battery !== name) : [...pair, name] })}>
                  <SearchBatteryFace name={name} charge={charge} locale={locale} />
                  {pointerText && <span className="two-pointer-prediction-marker">{pointerText}</span>}
                </button>
              </li>
            })}
          </ol>
          {attempt && <dl className="for-prediction-values">
            <div>
              <dt>{t('实际找到的配对', 'Actual pair')}</dt>
              <dd data-testid="two-pointer-actual-pair">{attempt.pair.join(' + ')}</dd>
            </div>
          </dl>}
          {pairMatch === false && <p className="for-prediction-hint">
            {t('查看程序算到目标电量时，两端各指着哪块。', 'Look at the two ends where the program reaches the target.')}
          </p>}
        </fieldset>
      </div>
      <button className="primary-button charge-prediction-verify" type="button" onClick={verify} disabled={pair.length !== 2 || !!attempt}>
        {t('运行验证', 'Run to check')}
      </button>
      {problem && <p className="error-message" role="alert">{problem === true
        ? t('程序还没有给出可核对的配对。请再运行一次。', 'The program did not return a pair to check. Run it again.')
        : runIssueText(locale, problem)}</p>}
      {attempt && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched ? t('移动顺序和最终配对都猜对了！', 'You predicted the moves and the final pair!')
          : t('对照实际移动和找到的配对，再试一次。', 'Check the actual moves and pair, then try again.')}</p>
        {attempt.sums.length > 0 && <details className="two-pointer-actual-sums">
          <summary>{t('查看每步计算', 'See each calculation')}</summary>
          <ol data-testid="two-pointer-actual-sums">
            {attempt.sums.map(({ left, right, total }, index) => {
              const first = sample.batteries[left]
              const last = sample.batteries[right]
              return <li key={index}>{first.name} + {last.name} <code>{first.charge} + {last.charge} = {total}</code></li>
            })}
          </ol>
        </details>}
        {!matched && <button className="subtle-button" type="button" onClick={() => change({
          moves: moveMatch ? moves : [],
          pair: pairMatch ? pair : [],
        })}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
