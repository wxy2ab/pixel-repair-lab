import type { ReactNode } from 'react'
import type { Locale } from '../shared/types'
import type { Roadmap, RoadmapStage } from './roadmapModel'
import { tr } from './text'
import './learning-roadmap.css'

function stateOf({ done, total }: { done: number; total: number }) {
  if (done === total && total > 0) return 'completed'
  return done > 0 ? 'in-progress' : 'not-started'
}

function stateLabel(locale: Locale, state: ReturnType<typeof stateOf>) {
  if (state === 'completed') return tr(locale, '已完成', 'Complete')
  return state === 'in-progress' ? tr(locale, '进行中', 'In progress') : tr(locale, '未开始', 'Not started')
}

function StageButton({ stage, locale, onOpen }: { stage: RoadmapStage; locale: Locale; onOpen: (id: string) => void }) {
  const state = stateOf(stage)
  return <button type="button" className="roadmap-stage" data-roadmap-unit={stage.unit.id} data-state={state}
    aria-label={`${stage.unit.title[locale]} · ${stateLabel(locale, state)} · ${stage.done}/${stage.total}`}
    onClick={() => onOpen(stage.unit.id)}>
    {state === 'completed' && <span className="roadmap-check" aria-hidden="true">✓</span>}
    <span>{stage.unit.title[locale]}</span>
    <small>{stage.done}/{stage.total}</small>
  </button>
}

export function LearningRoadmap({ roadmap, locale, onOpenLevel, onOpenUnit, review }: {
  roadmap: Roadmap; locale: Locale; onOpenLevel: (id: string) => void; onOpenUnit: (id: string) => void; review?: ReactNode;
}) {
  const { tracks, done, total, resume, recommended } = roadmap
  if (tracks.length === 0) return null

  const t = (zh: string, en: string) => tr(locale, zh, en)
  const nextLesson = resume ?? recommended
  const sharesRecommendation = nextLesson !== undefined && nextLesson.level.id === recommended?.level.id
  const reviewUnit = tracks[0].stages[0]?.unit

  return <section id="learning-roadmap" className="learning-roadmap" aria-labelledby="learning-roadmap-title">
    <div className="roadmap-heading">
      <div>
        <h2 id="learning-roadmap-title">{t('总学习路线图', 'Learning roadmap')}</h2>
        <p>{t('按推荐顺序学习，也可以直接进入任一阶段。选做挑战可跳过。', 'Follow the recommended order or jump to any stage. You can skip optional challenges.')}</p>
      </div>
      <span className="roadmap-total">{t('主线进度', 'Core progress')} <strong>{done}<span> / {total}</span></strong></span>
    </div>

    <div className="roadmap-next">
      <div {...(sharesRecommendation ? { 'data-testid': 'roadmap-recommendation' } : {})}>
        <span className="roadmap-next-kind">{nextLesson ? sharesRecommendation ? t('推荐下一课', 'Recommended next lesson')
          : t('从上次继续', 'Pick up where you left off') : t('主线已完成', 'Core route complete')}</span>
        <h3>{nextLesson ? nextLesson.level.title[locale] : t('所有主线课程已完成', 'All core lessons are complete')}</h3>
        {nextLesson && <p>{nextLesson.unit.title[locale]}</p>}
      </div>
      <div className="roadmap-actions">
        {nextLesson ? <button type="button" className="primary-button" data-testid="roadmap-resume"
          onClick={() => onOpenLevel(nextLesson.level.id)}>{t('继续学习', 'Continue learning')} <span aria-hidden="true">→</span></button>
          : reviewUnit && <button type="button" className="primary-button" data-testid="roadmap-resume"
            onClick={() => onOpenUnit(reviewUnit.id)}>{t('复习路线', 'Review the roadmap')}</button>}
        <a className="subtle-button" href="#free-choices">{t('自由选课', 'Choose a course')}</a>
      </div>
      {recommended && !sharesRecommendation && <div className="roadmap-recommendation" data-testid="roadmap-recommendation">
        <span>{t('按推荐顺序下一课', 'Next in the recommended order')}</span>
        <button type="button" className="text-button" onClick={() => onOpenLevel(recommended.level.id)}>
          {recommended.unit.title[locale]} · {recommended.level.title[locale]} <span aria-hidden="true">→</span>
        </button>
      </div>}
    </div>

    {review}
    <ol className="roadmap-track" aria-label={t('推荐学习顺序', 'Recommended study order')}>
      {tracks.map(({ course, stages, prerequisites, done: courseDone, total: courseTotal }, index) => {
        const state = stateOf({ done: courseDone, total: courseTotal })
        const recommendedCourse = recommended?.course.id === course.id
        return <li className="roadmap-course" key={course.id} data-roadmap-course={course.id} data-state={state} data-recommended={recommendedCourse || undefined}>
          <div className="roadmap-course-heading">
            <span className="roadmap-step" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h3>{course.name[locale]}</h3>
              <div className="roadmap-course-state">
                <span>{stateLabel(locale, state)}</span><span aria-hidden="true">·</span><span>{courseDone}/{courseTotal}</span>
              </div>
            </div>
          </div>
          <div className="roadmap-meter" aria-hidden="true"><span style={{ width: `${100 * courseDone / Math.max(1, courseTotal)}%` }} /></div>
          <ol className="roadmap-stages" aria-label={t('课程阶段', 'Course stages')}>
            {stages.map(stage => <li key={stage.unit.id}><StageButton stage={stage} locale={locale} onOpen={onOpenUnit} /></li>)}
          </ol>
          <div className="roadmap-prerequisites" data-testid="roadmap-prerequisites">
            {prerequisites.length ? <>
              <span>{t('建议先学', 'Study first')}</span>
              {prerequisites.map(stage => <button type="button" key={stage.unit.id} data-roadmap-prerequisite={stage.unit.id}
                onClick={() => onOpenUnit(stage.unit.id)}>{stage.unit.title[locale]}
                {stateOf(stage) === 'completed' && <span className="roadmap-check" aria-label={t('已完成', 'Complete')}>✓</span>}
              </button>)}
            </> : <span>{t('可直接开始', 'Start here anytime')}</span>}
          </div>
        </li>
      })}
    </ol>
  </section>
}
