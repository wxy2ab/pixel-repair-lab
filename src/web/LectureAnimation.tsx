import { lazy, Suspense, useRef, type ReactNode } from 'react'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { LectureAnimation as AnimationDefinition } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { useReplayCursor } from './lessonTools'
import { ReplayControls } from './ReplayControls'
import { tr } from './text'
import { CommandDesk } from './Classroom'
import { DeviceWindow } from './DeviceWindow'
import { FrameCaption } from './FrameCaption'
import { LectureDiagram } from './LectureDiagram'
import { LecturePlot } from './LecturePlot'
import './lecture-diagram.css'

const AlgorithmFieldLesson = lazy(() => import('./AlgorithmFieldLesson').then(module => ({ default: module.AlgorithmFieldLesson })))
const CircuitLectureScene = lazy(() => import('./CircuitLectureScene').then(module => ({ default: module.CircuitLectureScene })))
const CpuLecture = lazy(() => import('./CpuLecture').then(module => ({ default: module.CpuLecture })))

export function LectureAnimation({ animation, execution, locale, title, notes, exercise }: {
  animation: AnimationDefinition; execution?: ProgramWalkthrough; locale: Locale; title: string; notes: ReactNode; exercise: ReactNode
}) {
  const count = animation.frames.length - 1
  const cursor = useReplayCursor(count, 1450)
  const screen = useRef<HTMLDivElement>(null)
  const frame = animation.frames[cursor.step]
  const t = (zh: string, en: string) => tr(locale, zh, en)

  function watch() {
    cursor.toggle()
    screen.current?.querySelector<HTMLInputElement>('.replay-controls input')?.focus({ preventScroll: true })
    screen.current?.querySelector('.device-window')?.scrollIntoView({
      block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  return <section className="classroom-split lecture-animation" aria-label={t('知识动画', 'Concept animation')}>
    <div className="play-column" ref={screen}>
      <DeviceWindow locale={locale} title={title}>
        {animation.workstation && execution && <Suspense fallback={null}><AlgorithmFieldLesson workstation={animation.workstation}
          execution={execution} locale={locale} step={cursor.step} advance={() => cursor.seek(cursor.step + 1)} /></Suspense>}
        {animation.hardware ? <Suspense fallback={<p className="loading">{t('正在打开工位…', 'Opening the workbench…')}</p>}>
          {animation.hardware.kind === 'circuit' ? <CircuitLectureScene bench={animation.hardware} step={cursor.step} locale={locale}
            caption={frame.caption[locale]} onInteract={() => cursor.seek(cursor.step)} />
            : <CpuLecture hardware={animation.hardware} step={cursor.step} locale={locale} onInspect={() => cursor.seek(cursor.step)}
              advance={cursor.step < count ? () => cursor.seek(cursor.step + 1) : undefined} />}
        </Suspense> : animation.plot ? <LecturePlot animation={animation} step={cursor.step} locale={locale} />
          : <LectureDiagram animation={animation} step={cursor.step} locale={locale} />}
        <ReplayControls cursor={cursor} count={count} locale={locale} />
        {animation.hardware?.kind !== 'circuit' && <FrameCaption caption={frame.caption[locale]} locale={locale} />}
      </DeviceWindow>
      {notes}
    </div>
    <CommandDesk locale={locale}>
      {exercise && count > 0 && cursor.step === 0 && !cursor.playing && <button type="button" className="lecture-nudge"
        onClick={watch}><span aria-hidden="true">▶</span>{t('先看动画', 'Watch the animation')}</button>}
      {exercise}
    </CommandDesk>
  </section>
}
