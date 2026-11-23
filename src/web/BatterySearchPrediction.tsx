import { useId, useRef, useState } from 'react'
import { runBatterySearch } from '../engine/programBatterySearch'
import type { BatterySearchMethod, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale, RunIssue } from '../shared/types'
import { SearchBatteryFace } from './BatterySearchLesson'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import { runIssueText, tr } from './text'
import './charge-prediction.css'
import './for-prediction.css'
import './battery-search-prediction.css'

const methods = ['linear', 'binary'] as const

type SearchPrediction = { battery?: string } & Partial<Record<BatterySearchMethod, number>>
type SearchAnswer = { battery: string } & Record<BatterySearchMethod, number>
type SearchAttempt = {
  answers: SearchAnswer
  paths: Record<BatterySearchMethod, string[]>
  matches: Record<keyof SearchAnswer, boolean>
}

export function BatterySearchPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const title = useId()
  const firstBattery = useRef<HTMLButtonElement>(null)
  const [prediction, setPrediction] = useState<SearchPrediction>({})
  const [attempt, setAttempt] = useState<SearchAttempt>()
  const [problem, setProblem] = useState<RunIssue | true>()
  const lesson = execution.batterySearch
  if (!lesson) return null

  const sample = lesson.practice
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const matched = attempt && Object.values(attempt.matches).every(Boolean)
  const allSelected = prediction.battery !== undefined && prediction.linear !== undefined && prediction.binary !== undefined

  function choose(next: SearchPrediction) {
    setPrediction(next)
    setAttempt(undefined)
    setProblem(undefined)
  }

  function verify() {
    if (!lesson || !allSelected || attempt) return
    const linear = runBatterySearch('linear', execution.source, sample.batteries, sample.target)
    const binary = runBatterySearch('binary', lesson.binarySource, sample.batteries, sample.target)
    const issue = linear.issue ?? binary.issue
    if (issue || !linear.result || !binary.result) {
      setProblem(issue ?? true)
      return
    }

    const found = sample.batteries[linear.result.index]
    if (!found || found.charge !== sample.target || linear.result.index !== binary.result.index) {
      setProblem(true)
      return
    }
    const answers = { battery: found.name, linear: linear.result.comparisons, binary: binary.result.comparisons }
    const matches = {
      battery: answers.battery === prediction.battery,
      linear: answers.linear === prediction.linear,
      binary: answers.binary === prediction.binary,
    }
    function inspected(run: typeof linear) {
      return run.steps.flatMap(step => {
        const battery = step.kind === 'compare' && step.index !== undefined ? sample.batteries[step.index] : undefined
        return battery ? [battery.name] : []
      })
    }
    setProblem(undefined)
    setAttempt({ answers, matches, paths: { linear: inspected(linear), binary: inspected(binary) } })
    if (Object.values(matches).every(Boolean)) onComplete()
  }

  return <section className="panel battery-search-prediction" data-testid="battery-search-prediction" data-match={matched} aria-labelledby={title}>
    <div className="panel-heading"><h2 id={title}>{t('换一排电池，先预测', 'Predict for a new row of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <AlgorithmBatteryRack scene="search-prediction-rack" locale={locale} label={t('选择你预测的电池', 'Pick your predicted battery')}
        batteries={sample.batteries} marked={sample.batteries.flatMap(({ name }, i) => name === (attempt?.answers.battery ?? prediction.battery) ? [i] : [])}
        onCell={matched ? undefined : index => choose({ ...prediction, battery: sample.batteries[index].name })} />
      <p>{t(`两种方法都在这排从低到高摆好的电池里找 ${sample.target} 格。每检查一块电池，就记一次比较。`,
        `Both methods look for ${sample.target} units in this row, sorted from lowest to highest charge. Count one comparison for each battery checked.`)}</p>
      <fieldset className="for-prediction-field search-prediction-pick" data-search-field="battery" data-match={attempt?.matches.battery} disabled={matched}>
        <legend>{t('程序会找到哪块电池？', 'Which battery will the programs find?')}</legend>
        <ol className="search-battery-row" data-testid="battery-search-practice-row">
          {sample.batteries.map(({ name, charge }, index) => <li key={name}>
            <button type="button" className="subtle-button search-battery-tile" ref={index === 0 ? firstBattery : undefined}
              data-battery-name={name} data-battery-index={index} data-charge={charge} aria-pressed={prediction.battery === name}
              onClick={() => { if (prediction.battery !== name) choose({ ...prediction, battery: name }) }}>
              <SearchBatteryFace name={name} charge={charge} index={index} locale={locale} />
            </button>
          </li>)}
        </ol>
        {attempt && <dl className="for-prediction-values">
          <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{prediction.battery}</dd></div>
          <div><dt>{t('实际找到', 'Actual battery')}</dt><dd data-testid="battery-search-actual-battery">{attempt.answers.battery}</dd></div>
        </dl>}
        {attempt?.matches.battery === false && <p className="for-prediction-hint">
          {t('先看哪块电池的电量等于目标，再读它的名字。', 'Find the battery with the target charge, then read its name.')}
        </p>}
      </fieldset>
      <div className="for-prediction-fields">
        {methods.map(method => <fieldset className="for-prediction-field" key={method} data-search-field={method} data-match={attempt?.matches[method]} disabled={matched}>
          <legend>{method === 'linear'
            ? t('逐块查找要比较几次？', 'How many checks does linear search make?')
            : t('折半查找要比较几次？', 'How many checks does binary search make?')}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {sample.predictions[method].map(count => <button key={count} type="button" className="subtle-button"
              data-linear-option={method === 'linear' ? count : undefined}
              data-binary-option={method === 'binary' ? count : undefined}
              aria-pressed={prediction[method] === count} onClick={() => {
                if (prediction[method] !== count) choose({ ...prediction, [method]: count })
              }}>{t(`${count} 次`, count === 1 ? '1 check' : `${count} checks`)}</button>)}
          </div>
          {attempt && <>
            <dl className="for-prediction-values">
              <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{prediction[method]}</dd></div>
              <div><dt>{t('实际比较次数', 'Actual checks')}</dt><dd data-testid={`battery-search-actual-${method}`}>{attempt.answers[method]}</dd></div>
            </dl>
            <p className="search-prediction-path">{t('依次比较', 'Checked in order')} <code data-testid={`battery-search-path-${method}`}>{attempt.paths[method].join(' → ')}</code></p>
            {!attempt.matches[method] && <p className="for-prediction-hint">{method === 'linear'
              ? t('从左边第一块开始数，找到目标的那一次也算。', 'Count from the leftmost battery, including the check that finds the target.')
              : t('每次只数当前范围的中间一块，被排除的电池不用数。', 'Count only the middle battery of each remaining range. Skip the batteries that were ruled out.')}</p>}
          </>}
        </fieldset>)}
      </div>
      <button className="primary-button charge-prediction-verify" type="button" onClick={verify} disabled={!allSelected || !!attempt}>
        {t('运行验证', 'Run to check')}
      </button>
      {problem && <p className="error-message" role="alert">{problem === true
        ? t('程序没有找到可核对的电池。可以再运行一次。', 'The programs did not return a battery to check. You can run them again.')
        : runIssueText(locale, problem)}</p>}
      {attempt && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched ? t('找到了对的电池，两种比较次数也都猜对了！', 'You predicted the right battery and both comparison counts!')
          : t('对照两种方法实际检查电池的顺序，再试一次。', 'Check the order in which each method looked at the batteries, then try again.')}</p>
        {!matched && <button className="subtle-button" type="button" onClick={() => {
          choose({})
          firstBattery.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
