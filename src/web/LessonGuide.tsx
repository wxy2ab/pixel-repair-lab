import type { Level, Locale } from '../shared/types'
import { isCourseFinal, isCourseOverview, isOptionalChallenge, levelStage, stageLabel } from './lessonTools'
import { tr } from './text'
import './lesson-guide.css'

const stageVerbs = {
  explain: { zh: '学概念', en: 'Learn the idea' },
  demo: { zh: '看演示', en: 'Watch it run' },
  exercise: { zh: '动手练', en: 'Practice' },
  challenge: { zh: '综合用', en: 'Apply it' },
} as const

/** The lessons that teach the same idea as this one, in study order. */
export function topicSteps(level: Level, ordered: Level[]) {
  if (level.topic) return ordered.filter(candidate => candidate.unit?.id === level.unit?.id && candidate.topic?.id === level.topic?.id)
  if (isCourseOverview(level)) return ordered.filter(candidate => candidate.unit?.id === level.unit?.id && isCourseOverview(candidate))
  return []
}

/**
 * Shows where this lesson sits inside its topic: learn the idea, watch it run, then practise.
 * The mission list has the whole module. This keeps the current idea's path next to the lesson.
 */
export function TopicSteps({ level, ordered, completed, locale, onOpen }: {
  level: Level; ordered: Level[]; completed: string[]; locale: Locale; onOpen: (id: string) => void
}) {
  const steps = topicSteps(level, ordered)
  if (steps.length < 2) return null
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const position = steps.indexOf(level)
  const done = steps.filter(step => completed.includes(step.id)).length
  // A run of lessons at one stage, such as a course overview, is told apart by its titles.
  const titled = steps.every(step => levelStage(step) === levelStage(steps[0]))
  return <nav className="topic-steps" data-testid="topic-steps" data-titled={titled || undefined}
    aria-label={t('本知识点的学习步骤', 'Steps for this topic')}>
    <span className="topic-steps__summary">
      <strong>{t(`第 ${position + 1} 步`, `Step ${position + 1}`)}</strong>
      <span>{t(`共 ${steps.length} 步 · 已完成 ${done}`, `of ${steps.length} · ${done} done`)}</span>
    </span>
    <ol>
      {steps.map((step, index) => {
        const stage = levelStage(step)
        const sameStage = steps.filter(candidate => levelStage(candidate) === stage)
        const label = titled ? step.title[locale] : (isCourseFinal(step) ? stageLabel(step, locale) : stageVerbs[stage][locale])
          + (sameStage.length > 1 ? ' ' + (sameStage.indexOf(step) + 1) : '')
        const finished = completed.includes(step.id)
        const current = step.id === level.id
        // The title stays in the tooltip. The accessible name describes the step without repeating lesson names.
        const name = t(`步骤 ${index + 1} · ${stageVerbs[stage].zh}`, `Step ${index + 1} · ${stageVerbs[stage].en}`)
          + (finished ? t('（完成）', ' (done)') : '') + (current ? t('（当前）', ' (current)') : '')
        return <li key={step.id} data-stage={stage} data-done={finished || undefined} data-current={current || undefined}>
          <button type="button" aria-label={name} aria-current={current ? 'true' : undefined} title={step.title[locale]}
            disabled={current} onClick={() => onOpen(step.id)}>
            <span className="topic-steps__mark" aria-hidden="true">{finished ? '✓' : index + 1}</span>
            <span className="topic-steps__text" aria-hidden="true">
              <b>{label}</b>
            </span>
          </button>
        </li>
      })}
    </ol>
  </nav>
}

/** After a lesson is passed, point to the next step right where the learner finished. */
export function LessonNext({ level, ordered, locale, onOpen, onHome }: {
  level: Level; ordered: Level[]; locale: Locale; onOpen: (id: string) => void; onHome: () => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const index = ordered.indexOf(level)
  const next = ordered.slice(index + 1).find(candidate => !isOptionalChallenge(candidate))
  const sameTopic = next && level.topic && next.topic?.id === level.topic.id && next.unit?.id === level.unit?.id
  const stage = next && levelStage(next)
  return <section className="lesson-next" data-testid="lesson-next" aria-label={t('完成后的下一步', 'What to do next')}>
    <span className="lesson-next__badge" aria-hidden="true">✓</span>
    <div className="lesson-next__text">
      <strong>{t('本课已完成', 'Lesson complete')}</strong>
      <span>{next
        ? (sameTopic && stage
          ? t(`接着${stageVerbs[stage].zh} · ${next.title.zh}`, `Next, ${stageVerbs[stage].en.toLowerCase()} · ${next.title.en}`)
          : isCourseFinal(next) ? t(`可以进入结课项目 · ${next.title.zh}`, `Ready for the final project · ${next.title.en}`)
            : next.unit?.id === level.unit?.id ? t(`下一个知识点 · ${next.title.zh}`, `Next topic · ${next.title.en}`)
              : t(`下一阶段 · ${next.unit?.title.zh ?? ''} · ${next.title.zh}`, `Next stage · ${next.unit?.title.en ?? ''} · ${next.title.en}`))
        : t('这条课程的主线已经学完。', 'You finished the core lessons of this course.')}</span>
    </div>
    {next
      ? <button type="button" className="primary-button" onClick={() => onOpen(next.id)}>{t('继续前进', 'Keep going')} <span aria-hidden="true">→</span></button>
      : <button type="button" className="subtle-button" onClick={onHome}>{t('回到学习路线', 'Back to the roadmap')}</button>}
  </section>
}
