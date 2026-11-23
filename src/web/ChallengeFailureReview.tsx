import { createContext, useContext, useId, useState, type ReactNode } from 'react'
import type { CoursePrerequisite, Level, Locale, Localized } from '../shared/types'
import { buildChallengePreparation } from './challengeModel'
import { groupLevels, levelStage, stageLabel } from './lessonTools'
import { tr } from './text'
import './challenge-failure-review.css'

export type ChallengeReviewData = {
  location: Localized
  gaps: Localized[]
  topics?: CoursePrerequisite[]
}

type ReviewContext = {
  level: Level
  catalog: Level[]
  completed: string[]
  locale: Locale
  onStudy: (challengeId: string, lessonId: string) => void
}

const context = createContext<ReviewContext | null>(null)

export function ChallengeReviewProvider({ children, ...value }: ReviewContext & { children: ReactNode }) {
  return <context.Provider value={value}>{children}</context.Provider>
}

function reviewLessons(level: Level, catalog: Level[], completed: string[], topics: CoursePrerequisite[] = []) {
  const passed = new Set(completed)
  const { requiredLessons } = buildChallengePreparation(level, groupLevels(catalog), passed)
  const matching = [...topics, ...(level.prerequisites ?? [])].map(scope => requiredLessons.filter(lesson =>
    lesson.unit?.id === scope.unit && (!scope.topic || scope.topic === lesson.topic?.id)))
    .find(lessons => lessons.length > 0) ?? []
  const explanation = matching.find(lesson => levelStage(lesson) === 'explain') ?? matching[0]
  const exercises = matching.filter(lesson => levelStage(lesson) === 'exercise' && lesson !== explanation)
  const sameTopic = exercises.filter(lesson => lesson.topic?.id === explanation?.topic?.id)
  const practice = (sameTopic.length ? sameTopic : exercises).find(lesson => !passed.has(lesson.id))
    ?? sameTopic[0] ?? exercises[0]
  return [explanation, practice].flatMap(lesson => lesson ? [lesson] : [])
}

export function ChallengeFailureReview({ review, onRetry }: { review: ChallengeReviewData; onRetry: () => void }) {
  const attempt = useContext(context)
  const [expanded, setExpanded] = useState(false)
  const body = useId()
  if (!attempt) return null
  const { level, catalog, completed, locale, onStudy } = attempt
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const lessons = expanded ? reviewLessons(level, catalog, completed, review.topics) : []

  return <section className="challenge-failure-review" aria-label={t('失败复盘', 'Failed attempt review')}>
    <div className="challenge-review-actions">
      <button type="button" className="subtle-button" aria-expanded={expanded} aria-controls={body}
        onClick={() => setExpanded(value => !value)}>{t('复盘这次', 'Review this attempt')}</button>
      <button type="button" className="subtle-button" onClick={() => { setExpanded(false); onRetry() }}>
        {t('直接重试', 'Try again')}
      </button>
    </div>
    <div id={body} hidden={!expanded} className="challenge-review-body">
      {expanded && <>
        <h3>{t('卡在哪儿', 'Where it stopped')}</h3>
        <p>{review.location[locale]}</p>
        <h3>{t('离目标还差什么', 'What’s left')}</h3>
        <ul className="challenge-review-gaps">{review.gaps.map((gap, index) => <li key={index}>{gap[locale]}</li>)}</ul>
        {lessons.length > 0 && <>
          <h3>{t('可以回看或练一练', 'Lessons to revisit')}</h3>
          <ul className="challenge-review-lessons">{lessons.map(lesson => <li key={lesson.id}>
            <button type="button" className="subtle-button" onClick={() => onStudy(level.id, lesson.id)}>
              <span>{stageLabel(lesson, locale)}</span>{lesson.title[locale]}
            </button>
          </li>)}</ul>
        </>}
      </>}
    </div>
  </section>
}
