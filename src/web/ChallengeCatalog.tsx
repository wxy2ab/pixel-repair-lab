import { useRef, type CSSProperties } from 'react'
import type { Level, Locale, Localized, Position } from '../shared/types'
import { challengeZoneId } from '../shared/coursePrerequisites'
import {
  buildChallengePreparation, challengeDifficulties, challengeDifficultyLabels, challengeTypeLabels, type buildChallengeCatalog,
  challengeTypes, filterChallenges, type ChallengeEntry, type ChallengeFilters, type ChallengePreparation,
  type ChallengePrerequisite, type ChallengeType,
} from './challengeModel'
import type { ChallengeRoute } from './challengeRoutes'
import { ChallengeRouteList } from './ChallengeRouteList'
import type { LearningGroup } from './roadmapModel'
import { tr } from './text'
import './challenge-catalog.css'
import { WorkshopHub } from './station3d/WorkshopHub'

type OpenPreparation = (challengeId: string, lessonId: string) => void

function PreparationProgress({ preparation, locale }: { preparation: ChallengePreparation; locale: Locale }) {
  const { completedLessons, totalLessons } = preparation
  if (!totalLessons) return null
  const label = tr(locale, '准备进度', 'Preparation progress')
  const lessons = tr(locale, '节', totalLessons === 1 ? 'lesson' : 'lessons')
  return <span className="challenge-prep-meter">
    <span className="challenge-prep-meter-text">
      <span>{label}</span>
      <strong>{completedLessons} / {totalLessons} {lessons}</strong>
    </span>
    <progress aria-label={label} value={completedLessons} max={totalLessons} />
  </span>
}

function courseKey({ unitId, topicId }: ChallengePrerequisite) {
  return unitId + '/' + (topicId ?? '')
}

function courseName(course: ChallengePrerequisite, locale: Locale) {
  return course.label?.[locale] ?? [course.unitId, course.topicId].filter(Boolean).join(' · ')
}

function courseStatus(course: ChallengePrerequisite) {
  return course.complete ? 'complete' : 'pending'
}

function PrerequisiteStatus({ course, locale }: { course: ChallengePrerequisite; locale: Locale }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const remaining = course.missingLessons.length
  return <span className="challenge-prep-status">
    {course.complete ? t('已学完', 'Finished') : course.totalLessons ? t('待补', 'To study') : t('课程暂不可用', 'Lesson unavailable')}
    {remaining > 0 && <small>{remaining} {t('节', remaining === 1 ? 'lesson' : 'lessons')}</small>}
  </span>
}

export function ChallengePrerequisites({ level, groups, locale, completed, onOpenLevel, onStartPreparation }: {
  level: Level; groups: LearningGroup[]; locale: Locale; onOpenLevel?: (id: string) => void
  completed?: string[]; onStartPreparation?: OpenPreparation
}) {
  const preparation = buildChallengePreparation(level, groups, new Set(completed))
  if (!preparation.prerequisites.length) return null
  return <section className="panel challenge-prerequisites" aria-labelledby="challenge-prerequisites-title">
    <div className="challenge-prerequisites-heading">
      <h2 id="challenge-prerequisites-title">{tr(locale, '建议先学', 'Recommended before playing')}</h2>
      {completed && <PreparationProgress preparation={preparation} locale={locale} />}
    </div>
    <ul className="challenge-prep-courses">
      {preparation.prerequisites.map(course => {
        const next = course.missingLessons[0]
        const review = course.lessonId
        const name = courseName(course, locale)
        const status = 'challenge-course-status-' + level.id + '-' + courseKey(course)
        const open = next && onStartPreparation ? () => onStartPreparation(level.id, next.id)
          : review && onOpenLevel ? () => onOpenLevel(review) : undefined
        return <li className="challenge-prep-course" key={courseKey(course)} data-prep-status={courseStatus(course)}
          data-prep-unit={course.unitId} data-prep-topic={course.topicId}>
          {open
            ? <button className="subtle-button challenge-prep-course-name" type="button" aria-describedby={completed && status} onClick={open}>
              {name}<span aria-hidden="true"> →</span>
            </button>
            : <span className="challenge-prep-course-name">{name}</span>}
          {completed && <span id={status}><PrerequisiteStatus course={course} locale={locale} /></span>}
        </li>
      })}
    </ul>
    {completed && preparation.missingLessons.length > 0 && <details className="challenge-prep-remaining">
      <summary>{tr(locale, '查看待补课节', 'See remaining lessons')}</summary>
      <ol>{preparation.missingLessons.map(lesson => <li key={lesson.id}>{lesson.title[locale]}</li>)}</ol>
    </details>}
  </section>
}

function ChallengeMap({ level }: { level: Level }) {
  if (level.kind !== 'grid' && level.kind !== 'arena') return null

  const opponents = level.kind === 'grid' ? level.enemies?.map(enemy => enemy.path[0]) ?? []
    : level.opponents.map(opponent => opponent.start)
  const exit = level.kind === 'grid' ? level.objectives.find(objective => objective.type === 'exit')
    : level.objective.kind === 'escape' ? level.objective.exit : undefined
  const at = (position: Position | undefined, x: number, y: number) => position?.x === x && position.y === y
  const size = { '--challenge-columns': level.tiles[0].length, '--challenge-rows': level.tiles.length } as CSSProperties

  return <span className="challenge-preview" aria-hidden="true">
    <span className="challenge-preview-map" style={size}>
      {level.tiles.flatMap((row, y) => Array.from(row, (tile, x) => {
        const marker = at(level.start, x, y) ? 'start' : at(exit, x, y) ? 'exit'
          : opponents.some(opponent => at(opponent, x, y)) ? 'opponent'
            : level.items?.some(item => at(item, x, y)) ? 'item' : undefined
        return <span key={`${x},${y}`} data-tile={tile === '#' ? 'wall' : 'floor'} data-marker={marker} />
      }))}
    </span>
  </span>
}

function ChallengeRules({ id, level, locale }: { id: string; level: Level; locale: Locale }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const turns = level.kind === 'arena' ? level.maxTurns : level.kind === 'grid' ? level.turnLimit : undefined
  const opponents = level.kind === 'arena' ? level.opponents.length : level.kind === 'grid' ? level.enemies?.length : undefined
  const cases = level.kind === 'arena' || level.kind === 'grid' ? (level.variants?.length ?? 0) + 1
    : 'cases' in level ? level.cases.length : 1
  const steps = level.kind === 'data' ? level.steps.length : 0

  return <span id={id} className="challenge-rules">
    {turns !== undefined && <span>{t(`限 ${turns} 回合`, `${turns}-turn limit`)}</span>}
    {opponents ? <span>{t(`${opponents} 台对手`, `${opponents} ${opponents === 1 ? 'opponent' : 'opponents'}`)}</span> : null}
    {cases > 1 && <span>{t(`${cases} 个场景`, `${cases} scenarios`)}</span>}
    {steps > 1 && <span>{t(`${steps} 个步骤`, `${steps} steps`)}</span>}
  </span>
}

function ChallengeDifficulty({ difficulty, locale }: Pick<ChallengeEntry, 'difficulty'> & { locale: Locale }) {
  return <span className="challenge-difficulty" data-difficulty={difficulty}>{challengeDifficultyLabels[difficulty][locale]}</span>
}

function ChallengeCard({ entry, locale, onOpen }: { entry: ChallengeEntry; locale: Locale; onOpen: () => void }) {
  const { level, type, difficulty, won, preparation } = entry
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const title = 'challenge-title-' + level.id
  const brief = 'challenge-brief-' + level.id
  const rules = 'challenge-rules-' + level.id
  const status = 'challenge-status-' + level.id
  const difficultyId = 'challenge-difficulty-' + level.id
  const prerequisiteId = 'challenge-prerequisites-' + level.id
  const courses = preparation.prerequisites
  const description = [difficultyId, ...(courses.length ? [prerequisiteId] : []), brief, rules, ...(won ? [status] : [])]

  return <button type="button" className="challenge-card" data-challenge-level={level.id} data-completed={won || undefined}
    data-type={type} data-difficulty={difficulty} aria-labelledby={title} aria-describedby={description.join(' ')} onClick={onOpen}>
    <span className="challenge-card-top">
      <ChallengeMap level={level} />
      <span className="challenge-card-title">
        <span className="challenge-card-head">
          <strong id={title}>{level.title[locale]}</strong>
          {won && <span id={status} className="challenge-check" role="img" aria-label={t('已完成', 'Complete')}>✓</span>}
        </span>
        <span id={difficultyId} className="challenge-card-tags"><ChallengeDifficulty difficulty={difficulty} locale={locale} /></span>
      </span>
    </span>
    {courses.length > 0 && <span id={prerequisiteId} className="challenge-card-courses">
      <PreparationProgress preparation={preparation} locale={locale} />
      <strong>{t('建议先学', 'Recommended before playing')}</strong>
      <span className="challenge-prep-courses">
        {courses.map(course => <span className="challenge-prep-course" key={courseKey(course)} data-prep-status={courseStatus(course)}
          data-prep-unit={course.unitId} data-prep-topic={course.topicId}>
          <span className="challenge-prep-course-name">{courseName(course, locale)}</span>
          <PrerequisiteStatus course={course} locale={locale} />
        </span>)}
      </span>
    </span>}
    <span id={brief} className="challenge-brief">{level.brief[locale]}</span>
    <ChallengeRules id={rules} level={level} locale={locale} />
    <span className="challenge-open">{won ? t('再挑战', 'Play again') : t('进入挑战', 'Play challenge')} <span aria-hidden="true">→</span></span>
  </button>
}

function NearestChallenge({ entry, locale, onStartPreparation, onOpenLevel }: {
  entry: ChallengeEntry; locale: Locale; onStartPreparation: OpenPreparation; onOpenLevel: (id: string) => void
}) {
  const { level, difficulty, preparation } = entry
  const [next] = preparation.missingLessons
  const remaining = preparation.missingLessons.length
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <div className="challenge-nearest" data-testid="nearest-challenge" data-challenge-id={level.id}>
    <div className="challenge-nearest-info">
      <span className="challenge-nearest-caption">{t('最近可以挑战', 'Closest to ready')}</span>
      <h4>{level.title[locale]} <ChallengeDifficulty difficulty={difficulty} locale={locale} /></h4>
      <p><strong>{t(`还差 ${remaining} 节课`, `${remaining} ${remaining === 1 ? 'lesson' : 'lessons'} left`)}</strong>
        <span>{t('下一课', 'Next lesson')} · {next.title[locale]}</span>
      </p>
    </div>
    <div className="challenge-nearest-actions">
      <button type="button" className="primary-button" onClick={() => onStartPreparation(level.id, next.id)}>
        {t('去补课', 'Study next lesson')}
      </button>
      <button type="button" className="subtle-button" onClick={() => onOpenLevel(level.id)}>{t('直接挑战', 'Play now')}</button>
    </div>
  </div>
}

export function ChallengeCatalog({
  title, catalog, routes, locale, filters, onFiltersChange, onOpenLevel, onStartPreparation, onRecords, onGoals, onUnfinished,
  selectedRoute, skippedRouteIds, onSelectRoute, onSetRouteSkipped, onOpenRouteLevel, onLearn, nextMatch,
}: {
  title: Localized; catalog: ReturnType<typeof buildChallengeCatalog>; routes: ChallengeRoute[]; locale: Locale;
  filters: ChallengeFilters; onFiltersChange: (filters: ChallengeFilters) => void; onOpenLevel: (id: string) => void;
  onStartPreparation: OpenPreparation; onRecords: () => void; onGoals: () => void; onUnfinished: () => void
  selectedRoute?: ChallengeType; skippedRouteIds: string[]; onSelectRoute: (type: ChallengeType) => void
  onSetRouteSkipped: (id: string, skipped: boolean) => void; onOpenRouteLevel: (id: string) => void
  onLearn: () => void; nextMatch?: Level
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { entries, recommendations, courses, nearest } = catalog
  const done = entries.filter(entry => entry.won).length
  const filtered = filterChallenges(entries, filters)
  const sets = challengeTypes.map(type => ({ type, entries: filtered.filter(entry => entry.type === type) }))
    .filter(section => section.entries.length)
  const courseValue = filters.course ? [filters.course.unitId, filters.course.topicId].filter(Boolean).join('/') : ''
  const browsing = useRef<HTMLElement>(null)
  const emptyMessage = done === entries.length
    ? t('全部挑战已通关，随时可以重玩。', 'You cleared every challenge. Replay any of them below.')
    : entries.some(entry => entry.ready)
      ? t('适合当前进度的挑战都已通关。继续学新课，或从下方自由选关。', 'You cleared the challenges that match your progress. Keep learning or choose a challenge below.')
      : t('学完前序课程后，这里会出现适合你的推荐。', 'Complete the prerequisite lessons to get recommendations here.')

  function browseStarters() {
    onFiltersChange({ difficulty: 'starter' })
    browsing.current?.focus({ preventScroll: true })
    browsing.current?.scrollIntoView({ block: 'start' })
  }

  return <section id={challengeZoneId} className="challenge-catalog" aria-labelledby="challenge-zone-title" tabIndex={-1}>
    <WorkshopHub locale={locale} variant="arena" onLearn={onLearn} onChallenge={nextMatch ? () => onOpenRouteLevel(nextMatch.id) : undefined}>
      <h2 id="challenge-zone-title">{title[locale]}</h2>
      <p className="challenge-catalog-progress workshop-intro-stat">{t('已通关', 'Cleared')} <strong>{done} / {entries.length}</strong></p>
      {nextMatch && <p className="workshop-intro-next">{t('对抗关卡', 'Arena mission')} · <strong>{nextMatch.title[locale]}</strong></p>}
    </WorkshopHub>
    <div className="challenge-catalog-heading">
      <div className="challenge-catalog-actions">
        <button type="button" className="primary-button" onClick={onGoals}>{t('我的小目标', 'My challenge goals')}</button>
        <button type="button" className="subtle-button" onClick={onRecords}>{t('成绩记录', 'Challenge records')}</button>
        <button type="button" className="subtle-button" onClick={onUnfinished}>{t('未完成的对局', 'Unfinished matches')}</button>
      </div>
    </div>
    <section className="challenge-recommendations" aria-labelledby="challenge-recommendations-title">
      <h3 id="challenge-recommendations-title">{t('适合现在挑战', 'Ready for you')}</h3>
      {recommendations.length ? <>
        <p>{t('你已学完这些关卡的前序课程。', 'You’ve finished the prerequisites for these challenges.')}</p>
        <ul>
          {recommendations.map(({ level, difficulty, type }) => <li key={level.id}>
            <button type="button" data-recommended-challenge={level.id}
              aria-label={t(`开始 ${level.title.zh}`, `Start ${level.title.en}`)} onClick={() => onOpenLevel(level.id)}>
              <span className="challenge-recommendation-text">
                <strong>{level.title[locale]}</strong>
                <span>{challengeTypeLabels[type][locale]} <ChallengeDifficulty difficulty={difficulty} locale={locale} /></span>
              </span>
              <span className="challenge-recommendation-arrow" aria-hidden="true">→</span>
            </button>
          </li>)}
        </ul>
      </> : nearest ? <NearestChallenge entry={nearest} locale={locale}
        onStartPreparation={onStartPreparation} onOpenLevel={onOpenLevel} />
      : <div className="challenge-recommendation-empty">
        <p>{emptyMessage}</p>
        {done !== entries.length && entries.some(entry => entry.difficulty === 'starter') &&
          <button type="button" className="subtle-button" onClick={browseStarters}>{t('查看入门挑战', 'See starter challenges')}</button>}
      </div>}
    </section>

    <ChallengeRouteList routes={routes} skippedIds={skippedRouteIds} selectedType={selectedRoute}
      locale={locale} onSelect={onSelectRoute} onSetSkipped={onSetRouteSkipped} onOpen={onOpenRouteLevel} />

    <section id="challenge-browse" className="challenge-browse" aria-labelledby="challenge-browse-title" tabIndex={-1} ref={browsing}>
      <h3 id="challenge-browse-title">{t('自由选关', 'Browse challenges')}</h3>
      <div className="challenge-filters">
        <label>{t('类型', 'Type')}
          <select value={filters.type ?? ''} onChange={event => onFiltersChange({
            ...filters, type: challengeTypes.find(type => type === event.target.value),
          })}>
            <option value="">{t('全部类型', 'All types')}</option>
            {challengeTypes.filter(type => entries.some(entry => entry.type === type)).map(type =>
              <option value={type} key={type}>{challengeTypeLabels[type][locale]}</option>)}
          </select>
        </label>
        <label>{t('难度', 'Difficulty')}
          <select value={filters.difficulty ?? ''} onChange={event => onFiltersChange({
            ...filters, difficulty: challengeDifficulties.find(tier => tier === event.target.value),
          })}>
            <option value="">{t('全部难度', 'All difficulties')}</option>
            {challengeDifficulties.filter(tier => entries.some(entry => entry.difficulty === tier)).map(tier =>
              <option value={tier} key={tier}>{challengeDifficultyLabels[tier][locale]}</option>)}
          </select>
        </label>
        <label>{t('前序课程或模块', 'Prerequisite course or topic')}
          <select value={courseValue} onChange={event => {
            const [unitId, topicId] = event.target.value.split('/')
            onFiltersChange({ ...filters, course: unitId ? { unitId, topicId } : undefined })
          }}>
            <option value="">{t('全部课程', 'All courses')}</option>
            {courses.map(course => <optgroup label={course.label[locale]} key={course.unitId}>
              <option value={course.unitId}>{course.label[locale]} {t('（含各知识点）', '(all topics)')}</option>
              {course.topics.map(topic => <option key={topic.topicId} value={course.unitId + '/' + topic.topicId}>
                {topic.label[locale]}
              </option>)}
            </optgroup>)}
          </select>
        </label>
      </div>
      <div className="challenge-filter-result">
        <p role="status">{t(`显示 ${filtered.length} / ${entries.length} 关`, `${filtered.length} of ${entries.length} challenges`)}</p>
        {(filters.type || filters.difficulty || filters.course) && <button type="button" className="subtle-button"
          onClick={() => onFiltersChange({})}>{t('清除筛选', 'Clear filters')}</button>}
      </div>
      {!sets.length && <p className="challenge-filter-empty">{t('没有符合筛选条件的挑战。', 'No challenges match these filters.')}</p>}
      {sets.map(section => <section className="challenge-type" aria-labelledby={`challenge-type-${section.type}`} key={section.type}>
        <h4 id={`challenge-type-${section.type}`}>{challengeTypeLabels[section.type][locale]}</h4>
        <ul className="challenge-cards">
          {section.entries.map(entry => <li key={entry.level.id}>
            <ChallengeCard entry={entry} locale={locale} onOpen={() => onOpenLevel(entry.level.id)} />
          </li>)}
        </ul>
      </section>)}
    </section>
  </section>
}
