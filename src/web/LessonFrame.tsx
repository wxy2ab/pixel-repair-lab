import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { LectureLevel } from '../shared/advanced'
import type { Locale, Localized } from '../shared/types'
import { CommandDesk, TeachingScreen } from './Classroom'
import { LessonNotes } from './LessonNotes'
import { tr } from './text'
import './lesson-frame.css'

/** How far a step-by-step demonstration has come. Step 0 is the start, before anything has run. */
export function StepCount({ position, total, locale }: { position: number; total: number; locale: Locale }) {
  if (total < 2) return null
  const shown = Math.max(0, Math.min(position, total))
  return <span className="lesson-step-count" data-testid="lesson-step-count">
    <span>{shown === 0 ? tr(locale, `共 ${total} 步`, `${total} steps`) : tr(locale, `第 ${shown} / ${total} 步`, `Step ${shown} of ${total}`)}</span>
    <i aria-hidden="true"><b style={{ width: shown / total * 100 + '%' }} /></i>
  </span>
}

function Phases({ flow, current, recap, locale, onJump }: {
  flow: readonly Localized[]; current: number; recap: boolean; locale: Locale; onJump: (index: number) => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const labels = [...flow.map(phase => phase[locale]), t('要点小结', 'Key points')]
  return <ol className="lesson-phases" data-testid="lesson-phases" aria-label={t('本课流程', 'This lesson, step by step')}>
    {labels.map((label, index) => {
      const last = index === flow.length
      const state = last ? recap ? 'open' : 'upcoming' : index < current ? 'done' : index === current ? 'current' : 'upcoming'
      // A phase whose part of the page exists can be jumped to. Earlier phases stay in place above.
      const reachable = last ? recap : index <= current
      const body = <>
        <span className="lesson-phases__mark" aria-hidden="true">{state === 'done' ? '✓' : index + 1}</span>
        <span>{label}</span>
        <span className="sr-only">{state === 'done' ? t('（已完成）', ' (done)') : state === 'current' ? t('（进行中）', ' (current)')
          : state === 'open' ? t('（可查看）', ' (available)') : ''}</span>
      </>
      return <li key={index} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
        {reachable ? <button type="button" onClick={() => onJump(index)}>{body}</button> : <span>{body}</span>}
      </li>
    })}
  </ol>
}

function Recap({ level, locale }: { level: LectureLevel; locale: Locale }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [selected, setSelected] = useState<number>()
  const { question } = level
  const correct = selected === question.correct
  return <div className="classroom-split lesson-recap" data-testid="lesson-recap">
    <TeachingScreen locale={locale} variant="blackboard" title={t('本课要点', 'Key points')}>
      <LessonNotes level={level} locale={locale} />
    </TeachingScreen>
    <CommandDesk locale={locale} title={t('再想一想 · 选做', 'Think it over · optional')}>
      <section className="teaching-panel lesson-prediction">
        <p>{question.prompt[locale]}</p>
        <div className="choices-column">
          {question.options.map((option, index) => <button type="button" key={index} className="subtle-button"
            aria-pressed={selected === index} data-result={selected === index ? correct ? 'right' : 'wrong' : undefined}
            onClick={() => setSelected(index)}>{option[locale]}</button>)}
        </div>
        {selected !== undefined && <p role="status" data-task-success={correct || undefined} data-task-pop={correct || undefined}
          className={(correct ? 'win-message' : 'error-message') + ' prediction-feedback'}>
          {correct ? t('答对了！', 'That’s right! ') + question.feedback[locale]
            : t('再想想上面的要点，换一个答案试试。', 'Look at the key points again and try another answer.')}
        </p>}
      </section>
    </CommandDesk>
  </div>
}

/**
 * The frame every interactive lecture shares: a strip that names this lesson's phases,
 * the activity itself, and, once the lesson is passed, its key points with an optional self-check.
 */
export function LessonFrame({ level, locale, flow, phase, finished, children }: {
  level: LectureLevel; locale: Locale; flow: readonly Localized[]
  /** Index of the phase the learner is in. */
  phase: number
  /** The lesson has been passed, now or on an earlier visit. */
  finished: boolean
  children: ReactNode
}) {
  const frame = useRef<HTMLDivElement>(null)
  const recapId = useId()
  const announced = useRef(finished)
  const [justFinished, setJustFinished] = useState(false)
  useEffect(() => {
    if (finished && !announced.current) setJustFinished(true)
    announced.current = finished
  }, [finished])

  function jump(index: number) {
    const root = frame.current
    if (!root) return
    const activity = root.querySelector<HTMLElement>('.lesson-frame__activity')
    const desks = activity?.querySelectorAll<HTMLElement>('.command-desk')
    // The closing prediction sits on the last desk. Earlier phases share the demonstration above it.
    const target = index === flow.length ? document.getElementById(recapId)
      : index > 0 && index === flow.length - 1 && desks?.length ? desks[desks.length - 1] : activity
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target?.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' })
  }

  return <div className="lecture-layout lesson-frame" ref={frame} data-phase={phase} data-finished={finished || undefined}>
    <Phases flow={flow} current={finished && phase >= flow.length - 1 ? flow.length : phase} recap={finished} locale={locale} onJump={jump} />
    <div className="lecture-layout lesson-frame__activity">{children}</div>
    {finished && <section id={recapId} className="lesson-frame__recap" data-new={justFinished || undefined}
      aria-label={tr(locale, '本课要点', 'Key points of this lesson')}>
      <Recap level={level} locale={locale} />
    </section>}
  </div>
}
