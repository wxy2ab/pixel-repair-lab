import { useId, useState } from 'react'
import { runFirstBatterySearch } from '../engine/programFirstBatterySearch'
import { valuesEqual } from '../engine/values'
import type { BatterySearchRange, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale, RunIssue } from '../shared/types'
import { SearchBatteryFace } from './BatterySearchLesson'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import { runIssueText, tr } from './text'
import './charge-prediction.css'
import './for-prediction.css'
import './first-battery-search-prediction.css'

type Picks = { rangeOption?: number; index?: number }
type Attempt = { ranges: BatterySearchRange[]; index: number }

function describeRange([first, last]: BatterySearchRange, locale: Locale) {
  const bounds = `[${first}, ${last}]`
  return first <= last ? bounds : tr(locale, `空 ${bounds}`, `Empty ${bounds}`)
}

export function FirstBatterySearchPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const heading = useId()
  const [picks, setPicks] = useState<Picks>({})
  const [attempt, setAttempt] = useState<Attempt>()
  const [problem, setProblem] = useState<RunIssue | true>()
  const search = execution.firstBatterySearch
  if (!search) return null

  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { firstSource, practice } = search
  const { batteries, target, predictions } = practice
  const chosenRanges = picks.rangeOption === undefined ? undefined : predictions.ranges[picks.rangeOption]
  const rangeMatch = attempt && chosenRanges !== undefined && valuesEqual(chosenRanges, attempt.ranges)
  const indexMatch = attempt && picks.index === attempt.index
  const matched = attempt && rangeMatch === true && indexMatch === true
  const ready = chosenRanges !== undefined && picks.index !== undefined

  function choose(next: Picks) {
    setPicks(next)
    setAttempt(undefined)
    setProblem(undefined)
  }

  function verify() {
    if (!ready || chosenRanges === undefined || attempt) return
    const { result, issue } = runFirstBatterySearch(firstSource, batteries, target)
    if (issue || !result || !batteries[result.index]) {
      setProblem(issue ?? true)
      return
    }
    setProblem(undefined)
    setAttempt(result)
    if (valuesEqual(chosenRanges, result.ranges) && picks.index === result.index) onComplete()
  }

  return <section className="panel first-battery-search-prediction" aria-labelledby={heading}
    data-testid="first-battery-search-prediction" data-match={matched}>
    <div className="panel-heading"><h2 id={heading}>{t('换一排电池，先预测', 'Predict for a new row of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <AlgorithmBatteryRack scene="first-match-prediction-rack" locale={locale} label={t('选择你预测的第一块', 'Pick your predicted first match')}
        batteries={batteries} range={attempt?.ranges.at(-1)} marked={[attempt?.index ?? picks.index ?? -1]}
        onCell={matched ? undefined : index => choose({ ...picks, index })} />
      <p>{t(`这次要找最靠左的 ${target} 格电池。开始时整排都在查找范围内，位置从 0 开始数。`,
        `Find the leftmost battery with ${target} units of charge. The search starts with the whole row, numbered from 0.`)}</p>
      <div className="for-prediction-fields">
        <fieldset className="for-prediction-field" disabled={matched} data-prediction="index" data-match={indexMatch}>
          <legend>{t('最后会找到哪一格？', 'Which position will the search return?')}</legend>
          <ol className="search-battery-row first-battery-prediction-row" aria-label={t('练习用电池', 'Practice batteries')}
            data-testid="first-battery-search-practice-row">
            {batteries.map(({ name, charge }, index) => <li key={name}>
              <button type="button" className="subtle-button search-battery-tile"
                aria-pressed={picks.index === index} data-index-option={index} data-battery-name={name} data-charge={charge}
                data-found={attempt?.index === index || undefined} onClick={() => choose({ ...picks, index })}>
                <SearchBatteryFace name={name} charge={charge} index={index} locale={locale} />
              </button>
            </li>)}
          </ol>
          {attempt && <dl className="for-prediction-values">
            <div>
              <dt>{t('实际返回的位置', 'Actual position returned')}</dt>
              <dd data-testid="first-battery-search-actual-index">{attempt.index}</dd>
            </div>
            <div>
              <dt>{t('找到的电池', 'Battery found')}</dt>
              <dd>{batteries[attempt.index].name}</dd>
            </div>
          </dl>}
          {indexMatch === false && <p className="for-prediction-hint">
            {t('范围变空后，程序会返回最后记住的位置。回看哪一步记住了符合要求的电池。',
              'When the range is empty, the code returns the last position it saved. Check when it saved a battery that matched.')}
          </p>}
        </fieldset>
        <fieldset className="for-prediction-field" disabled={matched} data-prediction="ranges" data-match={rangeMatch}>
          <legend>{t('查找范围每次会缩成什么样？', 'How will the search range narrow each time?')}</legend>
          <p className="first-battery-prediction-note">{t(`从 [0, ${batteries.length - 1}] 出发，选出每次缩小后的范围。方括号内的两个位置都算在范围里。`,
            `Start at [0, ${batteries.length - 1}]. Choose the sequence of new ranges. The brackets include both ends.`)}</p>
          <div className="first-battery-range-choices">
            {predictions.ranges.map((ranges, option) => <button key={option} type="button" className="subtle-button"
              aria-pressed={picks.rangeOption === option} data-range-option={option}
              onClick={() => choose({ ...picks, rangeOption: option })}>
              {ranges.length === 0
                ? t('第一次找到就停，不再缩小', 'Stop at the first match without narrowing')
                : ranges.map((range, index) => <span key={index}>{describeRange(range, locale)}</span>)}
            </button>)}
          </div>
          {attempt && <div className="first-battery-actual-ranges">
            <p>{t('实际缩小的范围', 'Actual ranges after narrowing')}</p>
            <ol className="first-battery-range-sequence" data-testid="first-battery-search-actual-ranges"
              aria-label={t('实际缩小的范围', 'Actual ranges after narrowing')}>
              {attempt.ranges.map(([first, last], index) => <li key={index}
                data-first={first} data-last={last}>{describeRange([first, last], locale)}</li>)}
            </ol>
          </div>}
          {rangeMatch === false && <p className="for-prediction-hint">
            {t('找到一块相同电量的电池后，先记住它的位置，再把范围缩到中点左边。',
              'When the charge matches, save the position and narrow the range to the left of the middle.')}
          </p>}
        </fieldset>
      </div>
      <button className="primary-button charge-prediction-verify" type="button" onClick={verify} disabled={!ready || !!attempt}>
        {t('运行验证', 'Run to check')}
      </button>
      {problem && <p className="error-message" role="alert">{problem === true
        ? t('程序没有返回可核对的位置。请再运行一次。', 'The program did not return a position to check. Run it again.')
        : runIssueText(locale, problem)}</p>}
      {attempt && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched ? t('范围变化和最后的位置都猜对了！', 'You predicted the ranges and the final position!')
          : t('对照程序实际查找的范围和位置，再试一次。', 'Compare the actual ranges and final position, then try again.')}</p>
        {!matched && <button className="subtle-button" type="button" onClick={() => choose({
          rangeOption: rangeMatch ? picks.rangeOption : undefined,
          index: indexMatch ? picks.index : undefined,
        })}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
