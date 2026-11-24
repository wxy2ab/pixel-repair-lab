import { lazy, Suspense, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { LectureAnimation as AnimationDefinition } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { useReplayCursor } from './lessonTools'
import { ReplayControls } from './ReplayControls'
import { tr } from './text'
import { CommandDesk, TeachingScreen } from './Classroom'
import { DeviceWindow } from './DeviceWindow'

const AlgorithmFieldLesson = lazy(() => import('./AlgorithmFieldLesson').then(module => ({ default: module.AlgorithmFieldLesson })))
const CircuitLectureScene = lazy(() => import('./CircuitLectureScene').then(module => ({ default: module.CircuitLectureScene })))
const CpuLecture = lazy(() => import('./CpuLecture').then(module => ({ default: module.CpuLecture })))

export function LectureAnimation({ animation, execution, locale, title, notes, exercise }: {
  animation: AnimationDefinition; execution?: ProgramWalkthrough; locale: Locale; title: string; notes: ReactNode; exercise: ReactNode
}) {
  const count = animation.frames.length - 1
  const cursor = useReplayCursor(count, 1450)
  const nodes = useRef(new Map<string, HTMLElement>())
  const positions = useRef(new Map<string, DOMRect>())
  const frame = animation.frames[cursor.step]
  const t = (zh: string, en: string) => tr(locale, zh, en)

  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const next = new Map<string, DOMRect>()
    for (const [id, element] of nodes.current) {
      const rect = element.getBoundingClientRect()
      const previous = positions.current.get(id)
      next.set(id, rect)
      if (reduce || !positions.current.size) continue
      if (!previous) {
        element.animate([{ opacity: .35, transform: 'scale(.86)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 250, easing: 'ease-out' })
        continue
      }
      const dx = previous.left - rect.left
      const dy = previous.top - rect.top
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        element.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }],
          { duration: 290, easing: 'cubic-bezier(.2,.6,.25,1)' })
      }
    }
    positions.current = next
  }, [cursor.step, locale])

  return <section className="classroom-split lecture-animation" aria-label={t('知识动画', 'Concept animation')}>
    <div className="play-column">
      <DeviceWindow locale={locale} title={title}>
        {animation.workstation && execution && <Suspense fallback={null}><AlgorithmFieldLesson workstation={animation.workstation}
          execution={execution} locale={locale} step={cursor.step} advance={() => cursor.seek(cursor.step + 1)} /></Suspense>}
        {animation.hardware ? <Suspense fallback={<p className="loading">{t('正在打开工位…', 'Opening the workbench…')}</p>}>
          {animation.hardware.kind === 'circuit' ? <CircuitLectureScene bench={animation.hardware} step={cursor.step} locale={locale}
            caption={frame.caption[locale]} onInteract={() => cursor.seek(cursor.step)} />
            : <CpuLecture hardware={animation.hardware} step={cursor.step} locale={locale} onInspect={() => cursor.seek(cursor.step)}
              advance={cursor.step < count ? () => cursor.seek(cursor.step + 1) : undefined} />}
        </Suspense> : <div className={'diagram diagram-' + animation.layout}
          style={{ '--diagram-size': Math.min(4, Math.ceil(Math.sqrt(frame.items.length))) } as CSSProperties}>
          {frame.items.map(item => <div key={item.id}
            ref={element => { if (element) nodes.current.set(item.id, element); else nodes.current.delete(item.id) }}
            className={'diagram-item diagram-' + (item.state ?? 'neutral')}
            style={{ '--bar': (item.height ?? 55) + '%' } as CSSProperties}>
            {animation.layout === 'bars' && <div className="diagram-bar-well"><span className="diagram-bar" /></div>}
            {item.swatch && <span className="diagram-swatch" style={{ backgroundColor: item.swatch }} aria-hidden="true" />}
            <div className="diagram-label">{item.label[locale]}</div>
            {item.value && <div className="diagram-value">{item.value[locale]}</div>}
          </div>)}
        </div>}
        {animation.hardware?.kind !== 'circuit' && <p className="animation-caption" aria-live="polite">{frame.caption[locale]}</p>}
        <ReplayControls cursor={cursor} count={count} locale={locale} />
      </DeviceWindow>
      {notes && <TeachingScreen locale={locale}>{notes}</TeachingScreen>}
    </div>
    <CommandDesk locale={locale}>
      {exercise && count > 0 && cursor.step === 0 && !cursor.playing && <p className="lecture-nudge">
        <span aria-hidden="true">▶</span>{t('先播放左边的动画，看清每一步，再来回答。', 'Play the animation first and follow each step, then answer.')}
      </p>}
      {exercise}
    </CommandDesk>
  </section>
}
