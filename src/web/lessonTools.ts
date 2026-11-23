import { useCallback, useEffect, useRef, useState } from 'react'
import type { Stage, Unit } from '../shared/advanced'
import type { Level, Locale, RunIssue } from '../shared/types'

const labels: Record<Stage, Record<Locale, string>> = {
  explain: { zh: '讲解', en: 'Learn' },
  demo: { zh: '演示', en: 'Demo' },
  exercise: { zh: '练习', en: 'Exercise' },
  challenge: { zh: '实践', en: 'Challenge' },
}
const stageOrder = Object.keys(labels) as Stage[]
const other: Unit = { id: 'other', order: 9999, title: { zh: '其他任务', en: 'Other missions' } }

export function levelStage(level: Level): Stage {
  if (level.stage) return level.stage
  if (level.kind === 'lecture') return 'explain'
  if (level.kind === 'replay' || level.kind === 'lab' || level.kind === 'machine' || level.kind === 'circuit') return 'demo'
  if (level.kind === 'arena') return 'challenge'
  return 'exercise'
}

export function stageLabel(level: Level, locale: Locale) {
  if (isCourseFinal(level)) return locale === 'zh' ? '结课项目' : 'Final project'
  return labels[levelStage(level)][locale]
}

export function isCourseFinal(level: Level): boolean {
  return 'courseFinal' in level && level.courseFinal === true
}

export function isCourseOverview(level: Level): boolean {
  return level.kind === 'lecture' && level.overview === true
}

export function isOptionalChallenge(level: Level): boolean {
  return levelStage(level) === 'challenge' && !isCourseFinal(level)
}

function projectOrder(level: Level) {
  if (level.kind === 'breadboard' && level.board.faults?.length) return 2
  return Number(isCourseFinal(level))
}

export function groupLevels(levels: Level[]) {
  const groups = new Map<string, { unit: Unit; levels: Level[] }>()
  for (const level of levels) {
    const unit = level.unit ?? other
    const group = groups.get(unit.id) ?? { unit, levels: [] }
    group.levels.push(level)
    groups.set(unit.id, group)
  }
  return [...groups.values()].sort((a, b) => a.unit.order - b.unit.order).map(group => ({
    ...group,
    levels: group.levels.sort((a, b) => Number(isCourseOverview(b)) - Number(isCourseOverview(a))
      || projectOrder(a) - projectOrder(b)
      || (a.topic?.order ?? Number.MAX_SAFE_INTEGER) - (b.topic?.order ?? Number.MAX_SAFE_INTEGER)
      || stageOrder.indexOf(levelStage(a)) - stageOrder.indexOf(levelStage(b))
      || a.order - b.order),
  }))
}

export function useLessonWorker<Response>() {
  const worker = useRef<Worker | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const dispose = useCallback(() => {
    worker.current?.terminate()
    worker.current = null
    window.clearTimeout(timer.current)
  }, [])
  useEffect(() => dispose, [dispose])

  const stop = useCallback(() => {
    dispose()
    setPending(false)
  }, [dispose])

  const run = useCallback((create: () => Worker, input: unknown, receive: (result: Response) => void, fail: (issue: RunIssue) => void) => {
    stop()
    setPending(true)
    try {
      const instance = create()
      worker.current = instance
      instance.onmessage = (event: MessageEvent<Response>) => {
        if (worker.current !== instance) return
        stop()
        receive(event.data)
      }
      instance.onerror = () => {
        if (worker.current !== instance) return
        stop()
        fail({ code: 'internal' })
      }
      timer.current = window.setTimeout(() => {
        if (worker.current !== instance) return
        stop()
        fail({ code: 'limit' })
      }, 3000)
      instance.postMessage(input)
    } catch {
      stop()
      fail({ code: 'internal' })
    }
  }, [stop])
  return { pending, run, stop }
}

export function useReplayCursor(count: number, delayOverride?: number | ((step: number) => number | undefined)) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const delay = (typeof delayOverride === 'function' ? delayOverride(step) : delayOverride) ?? Math.min(380, Math.max(75, 5200 / count))
  useEffect(() => {
    if (!playing || step >= count) return
    const timer = window.setTimeout(() => setStep(step + 1), delay)
    return () => window.clearTimeout(timer)
  }, [count, delay, playing, step])

  function seek(target: number) {
    setPlaying(false)
    setStep(Math.max(0, Math.min(target, count)))
  }
  const restart = useCallback((autoplay: boolean, start = 0) => {
    setStep(start)
    setPlaying(autoplay)
  }, [])
  function toggle() {
    if (step >= count) setStep(0)
    setPlaying(!playing || step >= count)
  }
  return { step, playing: playing && step < count, seek, restart, toggle }
}

export type ReplayCursor = ReturnType<typeof useReplayCursor>
