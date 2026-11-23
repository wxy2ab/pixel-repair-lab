import { useEffect, useRef, useState } from 'react'
import type { Level, Locale } from '../shared/types'
import {
  challengeScoreSeries, isBestChallengeScore, scoreMetrics,
  type ChallengeScore, type ChallengeScoreHistory as ScoreHistory, type ChallengeScoreMetric, type ChallengeScoreSeries,
} from './challengeScore'
import { ChallengeGoalEditor } from './ChallengeGoalEditor'
import { goalForScore, type ChallengeGoal, type ChallengeGoals } from './challengeGoals'
import { metricLabel, modeOf, valueOf } from './challengeScoreDisplay'
import { tr } from './text'
import './challenge-score-history.css'

type ArenaMode = 'relaxed' | 'timed'
type AiMode = 'offline' | 'online' | 'mixed'

type Props = {
  levels: Level[]
  history: ScoreHistory
  goals: ChallengeGoals
  locale: Locale
  levelId?: string
  arenaMode?: ArenaMode
  onSelection: (levelId: string, arenaMode?: ArenaMode) => void
  onReplay: (levelId: string, arenaMode?: ArenaMode) => void
  onSaveGoal: (levelId: string, score: ChallengeScore, goal: ChallengeGoal) => void
  onRemoveGoal: (levelId: string, score: ChallengeScore) => void
  onBack: () => void
}

function latestSeries(series: ChallengeScoreSeries[]) {
  return series.reduce<ChallengeScoreSeries | undefined>((recent, group) =>
    !recent || (group.attempts.at(-1)?.at ?? 0) >= (recent.attempts.at(-1)?.at ?? 0) ? group : recent, undefined)
}

function groupLabel({ score }: ChallengeScoreSeries, locale: Locale) {
  if (score.kind === 'ai') return modeOf(score, locale)
  const count = score.kind === 'data' ? tr(locale, `${score.total} 个步骤`, `${score.total} steps`)
    : score.kind === 'grid' || score.kind === 'arena' ? tr(locale, `${score.total} 个场景`, `${score.total} maps`)
      : tr(locale, `${score.total} 个用例`, `${score.total} cases`)
  return score.kind === 'arena'
    ? (score.goal === 'escape' ? tr(locale, '撤离', 'Escape') : tr(locale, '计分对抗', 'Score battle')) + ' · ' + count
    : count
}

function scoreRange(values: number[]) {
  let min = values[0]
  let max = values[0]
  for (const value of values) {
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  if (min === max) return { min: Math.max(0, min - 1), max: max + 1, ticks: [min] }
  if (max - min <= 4) return { min, max, ticks: Array.from({ length: max - min + 1 }, (_, index) => max - index) }
  const center = min + Math.round((max - min) / 2)
  return { min, max, ticks: [max, center, min] }
}

type TrendPoint = { index: number; value: number; x: number; y: number; legacy: boolean }

function TrendLine({ start, end }: { start: TrendPoint; end: TrendPoint }) {
  const flat = start.y === end.y
  return <span className="score-trend-line" data-slope={flat ? 'flat' : start.y > end.y ? 'up' : 'down'}
    style={{ left: `${start.x}%`, top: `${Math.min(start.y, end.y)}%`,
      width: `${end.x - start.x}%`, height: flat ? undefined : `${Math.abs(end.y - start.y)}%` }} />
}

function ScoreTrend({ series, metric, locale }: { series: ChallengeScoreSeries; metric: ChallengeScoreMetric; locale: Locale }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const values = series.attempts.map(attempt => scoreMetrics(attempt.score).find(value => value.id === metric.id)?.value ?? metric.value)
  if (!values.length) return null
  const { min, max, ticks } = scoreRange(values)
  const y = (value: number) => 100 - (value - min) / (max - min) * 100
  const best = values.reduce((value, candidate) => metric.preference === 'lower' ? Math.min(value, candidate) : Math.max(value, candidate))
  const points = values.map((value, index): TrendPoint => ({
    index, value, legacy: Boolean(series.attempts[index].legacy),
    x: values.length === 1 ? 50 : index / (values.length - 1) * 100, y: y(value),
  }))
  const latest = values.at(-1)
  const label = metricLabel(metric.id, series.score, locale)
  const hasLegacy = points.some(point => point.legacy)

  return <figure className="panel score-history-trend">
    <figcaption className="score-trend-heading">
      <h2>{t('通关趋势', 'Clearance trend')}</h2>
      <span>{label}</span>
    </figcaption>
    <div role="img" aria-label={t('通关趋势', 'Clearance trend')}
      aria-description={t(`${label}，最近 ${latest}，指标最好 ${best}。完整数值见通关成绩表。`,
        `${label}. Latest ${latest}, best for this metric ${best}. Full values in the clearances table.`)}>
      <div className="score-trend-chart" aria-hidden="true">
        <div className="score-trend-axis">
          {ticks.map(tick => <span key={tick} style={{ top: `${y(tick)}%` }}>{tick}</span>)}
        </div>
        <div className="score-trend-plot">
          {ticks.map(tick => <span className="score-trend-grid" key={tick} style={{ top: `${y(tick)}%` }} />)}
          {points.slice(1).map((point, index) => point.legacy || points[index].legacy ? null
            : <TrendLine key={point.index} start={points[index]} end={point} />)}
          {points.map(point => <span className="score-trend-point" key={point.index} data-score-point={point.index + 1}
            data-metric-best={point.value === best || undefined} data-legacy={point.legacy || undefined}
            title={String(point.value)} style={{ left: `${point.x}%`, top: `${point.y}%` }} />)}
        </div>
        <div className="score-trend-time">
          {values.length === 1 ? <span>{t('这次记录', 'This entry')}</span>
            : <><span>{t('最早记录', 'Earliest entry')}</span><span>{t('最近记录', 'Latest entry')}</span></>}
        </div>
      </div>
    </div>
    <div className="score-trend-legend">
      <span><i className="score-legend-best" aria-hidden="true" />{t('指标最好', 'Best for this metric')} <strong>{best}</strong></span>
      {hasLegacy && <span><i className="score-legend-legacy" aria-hidden="true" />{t('旧记录', 'Earlier record')}</span>}
    </div>
    {values.length === 1 && <p className="score-history-note">{t('再通关一次，就能看到成绩的变化。', 'Complete another run to see how your result changes.')}</p>}
  </figure>
}

function ScoreTable({ series, locale }: { series: ChallengeScoreSeries; locale: Locale }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const metrics = scoreMetrics(series.score)
  const format = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' })
  let known = 0
  const rows = series.attempts.map((attempt, index) => ({
    attempt, index: index + 1, number: attempt.legacy ? undefined : ++known,
    result: scoreMetrics(attempt.score), best: isBestChallengeScore(attempt.score, series.best),
  })).reverse()
  return <section className="panel score-history-table-panel">
    <h2>{t('通关成绩', 'Clearances')}</h2>
    <div className="score-history-table-wrap" tabIndex={0} aria-label={t('查看通关成绩', 'Browse clearances')}>
      <table className="score-history-table" aria-label={t('通关成绩', 'Clearances')}>
        <thead><tr>
          <th scope="col">{t('通关记录', 'Win')}</th>
          {metrics.map(metric => <th key={metric.id} scope="col">{metricLabel(metric.id, series.score, locale)}</th>)}
        </tr></thead>
        <tbody>{rows.map(({ attempt, index, number, result, best }) => {
          const instant = attempt.at === null ? null : new Date(attempt.at)
          return <tr key={index} data-score-attempt={index} data-personal-best={best || undefined} data-legacy={attempt.legacy}>
            <th scope="row">
              <span>{number === undefined ? t('旧记录', 'Earlier record') : t(`第 ${number} 次记录`, `Recorded win ${number}`)}</span>
              {best && <> <strong className="score-personal-best">{t('个人最好', 'Personal best')}</strong></>}
              {instant && !Number.isNaN(instant.getTime())
                ? <time dateTime={instant.toISOString()}>{format.format(instant)}</time>
                : <small>{t('日期未知', 'Date unknown')}</small>}
            </th>
            {metrics.map(metric => <td key={metric.id} data-score-metric={metric.id}>
              {valueOf(result.find(other => other.id === metric.id))}
            </td>)}
          </tr>
        })}</tbody>
      </table>
    </div>
    {rows.some(row => row.attempt.legacy) && <p className="score-history-note">
      {t('旧记录保留了当时的最近和最好成绩。', 'Earlier records contain the last and best results saved at the time.')}
    </p>}
  </section>
}

export function ChallengeScoreHistory({
  levels, history, goals, locale, levelId, arenaMode, onSelection, onReplay, onSaveGoal, onRemoveGoal, onBack,
}: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [selectedGroup, setSelectedGroup] = useState<string>()
  const [selectedMetric, setSelectedMetric] = useState<ChallengeScoreMetric['id']>()
  const [selectedAiMode, setSelectedAiMode] = useState<AiMode>()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  const level = levels.find(candidate => candidate.id === levelId)
    ?? levels.find(candidate => challengeScoreSeries(history, candidate.id).length > 0) ?? levels[0]
  const recorded = level ? challengeScoreSeries(history, level.id) : []
  const aiScores = recorded.map(group => group.score).flatMap(score => score.kind === 'ai' ? [score] : [])
  const aiModes = [...new Set(aiScores.map(score => score.mode))]
  const recent = latestSeries(recorded)?.score
  const arena = level?.kind === 'arena' ? arenaMode ?? (recent?.kind === 'arena' ? recent.mode : 'relaxed') : undefined
  const ai = level?.kind === 'ai' ? selectedAiMode && aiModes.includes(selectedAiMode) ? selectedAiMode
    : recent?.kind === 'ai' ? recent.mode : aiModes[0] : undefined

  const groups = recorded.filter(({ score }) => {
    if (level?.kind === 'arena') return score.kind === 'arena' && score.mode === arena
    if (level?.kind === 'ai') return score.kind === 'ai' && score.mode === ai
    return true
  })
  const series = groups.find(group => group.id === selectedGroup) ?? latestSeries(groups)
  const metrics = series ? scoreMetrics(series.score) : []
  const metric = metrics.find(value => value.id === selectedMetric) ?? metrics.find(value => value.id !== 'cases') ?? metrics[0]
  const changeLevel = (id: string) => {
    setSelectedGroup(undefined)
    setSelectedMetric(undefined)
    setSelectedAiMode(undefined)
    onSelection(id)
  }

  return <section className="score-history" aria-labelledby="challenge-records-title">
    <div className="score-history-header">
      <h1 id="challenge-records-title" tabIndex={-1} ref={heading}>{t('成绩记录', 'Challenge records')}</h1>
      <button type="button" className="subtle-button" onClick={onBack}>{t('返回挑战场', 'Back to challenge arena')}</button>
    </div>
    {level && <div className="panel score-history-filters">
      <label className="score-filter-level">{t('关卡', 'Challenge')}
        <select value={level.id} onChange={event => changeLevel(event.currentTarget.value)}>
          {levels.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title[locale]}</option>)}
        </select>
      </label>
      {arena && <label>{t('玩法', 'Mode')}
        <select value={arena} onChange={event => onSelection(level.id, event.currentTarget.value as ArenaMode)}>
          <option value="relaxed">{t('从容', 'Relaxed')}</option>
          <option value="timed">{t('紧张', 'Timed')}</option>
        </select>
      </label>}
      {ai && aiModes.length > 1 && <label>{t('玩法', 'Mode')}
        <select value={ai} onChange={event => setSelectedAiMode(event.currentTarget.value as AiMode)}>
          {aiModes.map(mode => <option value={mode} key={mode}>{modeOf(aiScores.find(score => score.mode === mode)!, locale)}</option>)}
        </select>
      </label>}
      {series && groups.length > 1 && <label>{t('测试范围', 'Test set')}
        <select value={series.id} onChange={event => setSelectedGroup(event.currentTarget.value)}>
          {groups.map(group => <option key={group.id} value={group.id}>{groupLabel(group, locale)}</option>)}
        </select>
      </label>}
      {series && metric && <label>{t('指标', 'Metric')}
        <select value={metric.id} onChange={event => setSelectedMetric(event.currentTarget.value as ChallengeScoreMetric['id'])}>
          {metrics.map(value => <option key={value.id} value={value.id}>{metricLabel(value.id, series.score, locale)}</option>)}
        </select>
      </label>}
      <button type="button" className="primary-button" onClick={() => onReplay(level.id, arena)}>
        {t('重玩这关', 'Replay challenge')}
      </button>
    </div>}
    {level && series && metric ? <>
      <ChallengeGoalEditor key={`${level.id}/${series.id}`} score={series.score} locale={locale}
        goal={goalForScore(goals, level.id, series.score)}
        onSave={goal => onSaveGoal(level.id, series.score, goal)}
        onClear={() => onRemoveGoal(level.id, series.score)} />
      <ScoreTrend series={series} metric={metric} locale={locale} />
      <ScoreTable series={series} locale={locale} />
    </> : <section className="panel score-history-empty score-goal" aria-labelledby="score-goal-title">
      <h2 id="score-goal-title">{t('下次小目标', 'Next challenge goal')}</h2>
      <p>{arena ? t('这个玩法还没有通关记录。', 'No clearances for this mode yet.')
        : t('这关还没有通关记录。', 'No clearances for this challenge yet.')}</p>
      <p>{t('通关一次后，就能定下次的小目标。', 'Complete a run to set a goal for next time.')}</p>
    </section>}
  </section>
}
