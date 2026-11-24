import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Locale } from '../../shared/types'
import { tr } from '../text'
import { roomNames, type LessonRoomFamily } from './lessonRoom'
import { describeRoomActivity, initialRoomActivity, roomActivityReading, updateRoomActivity, type RoomActivityState, type RoomTarget } from './roomActivity'
import { RoomPosterGlyph } from './RoomPosterGlyph'
import type { createLessonRoomRenderer, RoomProp } from './lesson-room-renderer'
import './lesson-room.css'

const roomPosters = import.meta.glob<string>('./room-*.webp', { import: 'default', query: '?url', eager: true })
const targets = ['sample', 'setting', 'run'] as const
const posterAnchors = { sample: { x: .24, y: .53 }, setting: { x: .5, y: .53 }, run: { x: .76, y: .53 } }
type Anchors = typeof posterAnchors & Partial<Record<RoomProp, { x: number; y: number }>>
type RoomSession = { state: RoomActivityState; target?: RoomTarget }

export function LessonRoomScene({ family, unitId, locale, completed }: {
  family: LessonRoomFamily; unitId?: string; locale: Locale; completed: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const firstControl = useRef<HTMLButtonElement>(null)
  const engine = useRef<ReturnType<typeof createLessonRoomRenderer>>(undefined)
  const [session, setSession] = useState<RoomSession>(() => ({ state: initialRoomActivity(unitId) }))
  const [ready, setReady] = useState(false)
  const [anchors, setAnchors] = useState<Anchors>(posterAnchors)
  const [propOn, setPropOn] = useState({ lamp: true, fan: true })
  const latest = useRef({ session, completed })
  const operate = useCallback((target: RoomTarget) => {
    setSession(previous => ({ state: updateRoomActivity(family, previous.state, target), target }))
  }, [family])
  useEffect(() => {
    latest.current.session = session
    engine.current?.setActivity(session.state, session.target)
  }, [session])
  useEffect(() => {
    latest.current.completed = completed
    engine.current?.setCompleted(completed)
  }, [completed])

  useEffect(() => {
    const surface = canvas.current
    if (!surface) return
    let active = true
    function failed() {
      if (!active) return
      engine.current = undefined
      setReady(false)
      setAnchors(posterAnchors)
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      void import('./lesson-room-renderer').then(({ createLessonRoomRenderer }) => {
        if (!active) return
        engine.current = createLessonRoomRenderer(surface, family, latest.current.completed, {
          ready: () => { if (active) setReady(true) }, failed, onPick: operate, initialActivity: latest.current.session.state,
          onProject: positions => { if (active) setAnchors(positions) },
          onToggle: (prop, on) => { if (active) setPropOn(previous => ({ ...previous, [prop]: on })) },
        })
      }).catch(failed)
    }, { rootMargin: '150px' })
    observer.observe(surface)
    return () => {
      active = false
      observer.disconnect()
      engine.current?.dispose()
      engine.current = undefined
    }
  }, [family, operate])

  const name = roomNames[family][locale]
  const { controls, status } = describeRoomActivity(family, session.state, locale)
  const posterReading = ready ? undefined : roomActivityReading(family, session.state)
  const announcement = session.target === 'run' ? status : session.target ? controls[session.target].value : ''
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <section className="lesson-workbench lesson-room-layer" data-activity={family}
    data-sample={session.state.sample} data-setting={session.state.setting} data-ran={session.state.ran}
    data-completed={completed} data-ready={ready} data-renderer={ready ? 'webgl' : 'poster'}
    aria-label={name + (completed ? ' · ' + t('任务已完成', 'Activity complete') : '')}>
    <div className="room-scene-surface">
      {!ready && <picture>
        <source media="(max-width: 670px)" srcSet={roomPosters['./room-' + family + '-narrow.webp']} />
        <img src={roomPosters['./room-' + family + '.webp']} alt="" />
      </picture>}
      <canvas ref={canvas} aria-hidden="true" />
      <div className="room-scene-controls" role="group" aria-label={t('操作台面设备', 'Workbench equipment')}>
        {targets.map(target => {
          const control = controls[target], anchor = anchors[target]
          return <button key={target} type="button" className="room-scene-control" data-room-target={target}
            ref={target === 'sample' ? firstControl : undefined}
            data-anchor-x={anchor.x} data-anchor-y={anchor.y}
            aria-label={control.label} aria-description={control.value}
            style={{ '--anchor-x': anchor.x * 100 + '%', '--anchor-y': anchor.y * 100 + '%' } as CSSProperties}
            onClick={() => operate(target)}>
            {posterReading && <RoomPosterGlyph target={target} reading={posterReading} />}
          </button>
        })}
        {ready && (['lamp', 'fan'] as const).map(prop => {
          const anchor = anchors[prop]
          if (!anchor) return null
          return <button key={prop} type="button" className="room-scene-control" data-room-prop={prop}
            aria-label={prop === 'lamp' ? t('工作灯', 'Desk lamp') : t('换气扇', 'Extractor fan')}
            aria-pressed={propOn[prop]}
            style={{ '--anchor-x': anchor.x * 100 + '%', '--anchor-y': anchor.y * 100 + '%' } as CSSProperties}
            onClick={() => engine.current?.toggleProp(prop)} />
        })}
      </div>
      {session.state.revision > 0 && <button type="button" className="room-reset" data-room-reset aria-label={t('复位', 'Reset')}
        onClick={event => {
          setSession({ state: initialRoomActivity(unitId) })
          if (event.detail === 0) firstControl.current?.focus()
        }}>
        <span aria-hidden="true">↺</span>
      </button>}
    </div>
    <span className="sr-only" data-room-status aria-live="polite" aria-atomic="true">{announcement}</span>
  </section>
}
