import { createContext, useContext, useId, type ReactNode } from 'react'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { LessonRoomScene } from './station3d/LessonRoomScene'
import type { LessonRoomFamily } from './station3d/lessonRoom'
import './classroom.css'
import './classroom-demonstration.css'
import './classroom-instruments.css'

const ClassroomContext = createContext(false)

export function useClassroom() {
  return useContext(ClassroomContext)
}

type SurfaceProps = {
  children: ReactNode
  locale: Locale
  title?: ReactNode
  className?: string
  'aria-labelledby'?: string
}

export function Classroom({ children, family, locale, completed, unitId }: {
  children: ReactNode; family: LessonRoomFamily; locale: Locale; completed: boolean; unitId?: string
}) {
  return <ClassroomContext.Provider value={true}>
    <div className="classroom-workspace" data-family={family}>
      <LessonRoomScene key={family + '/' + (unitId ?? '')} family={family} unitId={unitId} locale={locale} completed={completed} />
      <div className="lesson-room-desk">{children}</div>
    </div>
  </ClassroomContext.Provider>
}

export function TeachingScreen({ children, locale, variant = 'blackboard', title, className = '', 'aria-labelledby': labelledBy }:
  SurfaceProps & { variant?: 'blackboard' | 'monitor' }) {
  const enabled = useClassroom()
  const id = useId()
  if (!enabled) return <>{children}</>
  const label = variant === 'blackboard' ? tr(locale, '教学黑板', 'Lesson board') : tr(locale, '演示屏', 'Demo monitor')
  return <section className={'teaching-screen ' + className} data-surface={variant} aria-labelledby={labelledBy ?? id}>
    <div className="teaching-screen__heading" id={id}>
      <span className="classroom-screen-icon" aria-hidden="true" />
      <span>{label}</span>{title && <strong>{title}</strong>}
    </div>
    <div className="teaching-screen__body">{children}</div>
    <div className="teaching-screen__ledge" aria-hidden="true"><i /><i /><b /></div>
  </section>
}

export function CommandDesk({ children, locale, title, className = '', 'aria-labelledby': labelledBy }: SurfaceProps) {
  const enabled = useClassroom()
  const id = useId()
  if (!enabled) return <>{children}</>
  return <section className={'command-desk ' + className} aria-labelledby={labelledBy ?? id}>
    <div className="command-desk__heading" id={id}>
      <span className="classroom-control-icon" aria-hidden="true"><i /><i /></span>
      <span>{tr(locale, '操作台', 'Control desk')}</span>{title && <strong>{title}</strong>}
    </div>
    <div className="command-desk__body">{children}</div>
  </section>
}
