import { useEffect, useRef, useState } from 'react'
import type { Level, Locale } from '../../shared/types'
import { courseFor } from '../LearningCourse'
import { tr } from '../text'
import type { createLessonRenderer, LessonActivity } from './lesson-renderer'
import './lesson-workbench.css'

const posters = import.meta.glob<string>('./desk-*.webp', { query: '?url', import: 'default', eager: true })
const labels = {
  coding: ['芽芽的编程终端', 'Sprout’s coding terminal'],
  data: ['芽芽的样本分拣台', 'Sprout’s sample sorter'],
  vision: ['芽芽的图像检测仪', 'Sprout’s inspection camera'],
  ai: ['芽芽和 AI 搭档的工作台', 'Sprout and the AI assistant'],
} as const

export function LessonWorkbench({ locale, activity, completed }: { locale: Locale; activity: LessonActivity; completed: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<ReturnType<typeof createLessonRenderer> | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const finished = useRef(completed)
  useEffect(() => {
    finished.current = completed
    renderer.current?.setCompleted(completed)
  }, [completed])
  useEffect(() => {
    const surface = canvas.current
    if (!surface) return
    let active = true
    setReady(false)
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      void import('./lesson-renderer').then(({ createLessonRenderer }) => {
        if (!active) return
        renderer.current = createLessonRenderer(surface, activity, finished.current, {
          ready: () => { if (active) setReady(true) },
          failed: () => { if (active) setReady(false) },
        })
      }).catch(() => { if (active) setReady(false) })
    }, { rootMargin: '100px' })
    observer.observe(surface)
    return () => {
      active = false
      observer.disconnect()
      renderer.current?.dispose()
      renderer.current = undefined
    }
  }, [activity])
  const [zh, en] = labels[activity]
  const label = tr(locale, zh, en)
  const status = completed ? tr(locale, '任务已完成', 'Activity complete') : ''
  const command = tr(locale, '启动设备', 'Operate equipment')
  const accessible = [label, status, ready ? command : ''].filter(Boolean).join(' · ')
  return <button type="button" className="lesson-workbench" data-activity={activity} data-ready={ready}
    data-completed={completed} aria-label={accessible} title={accessible} disabled={!ready} onClick={() => renderer.current?.operate()}>
    <img src={posters['./desk-' + activity + (completed ? '-done' : '') + '.webp']} alt="" aria-hidden="true" />
    <canvas key={activity} ref={canvas} aria-hidden="true" />
  </button>
}

export function WorkshopForLesson({ level, locale, completed }: { level: Level; locale: Locale; completed: boolean }) {
  if (level.kind === 'grid' || level.kind === 'arena' || (level.kind === 'replay' && level.mode === 'grid')) return null
  let activity: LessonActivity = 'coding'
  if (level.kind === 'ai' || level.kind === 'replay') activity = 'ai'
  else if (level.kind === 'lab') activity = level.recipe === 'opencv' || level.recipe === 'yolox' ? 'vision' : 'data'
  else if (level.kind === 'vision' || level.kind === 'data') activity = level.kind
  else if (level.kind === 'lecture') {
    const course = courseFor(level)?.id
    if (course === 'vision' || course === 'data' || course === 'ai') activity = course
  }
  return <LessonWorkbench activity={activity} locale={locale} completed={completed} />
}
