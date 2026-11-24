import type { ReactNode } from 'react'
import type { LectureLevel } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './lesson-notes.css'

/** Keep the explanation available while the workbench shows the current state. */
export function StepExplanation({ locale, children, className = '' }: { locale: Locale; children: ReactNode; className?: string }) {
  return <details className={'step-explanation ' + className}>
    <summary>{tr(locale, '这一步为什么？', 'Why this step?')}</summary>
    <div>{children}</div>
  </details>
}

export function LessonNotes({ level, locale }: { level: LectureLevel; locale: Locale }) {
  const notes = <div className="lesson-annotations">
    <p>{level.brief[locale]}</p>
    {level.sections.map((section, index) => <article key={index}>
      <h3>{section.title[locale]}</h3><p>{section.body[locale]}</p>
    </article>)}
  </div>
  // Imported text-only lessons still need a visible teaching surface.
  return level.animation || level.execution ? <details className="lesson-notes">
    <summary>{tr(locale, '查看讲解笔记', 'Lesson notes')}</summary>
    {notes}
  </details> : notes
}
