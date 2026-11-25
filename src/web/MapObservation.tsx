import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './map-observation.css'

export function hasProgramCommands(source: string) {
  return source.split('\n').some(line => {
    const trimmed = line.trim()
    return trimmed.length > 0 && !trimmed.startsWith('#')
  })
}

type Observation<T> = {
  first: number
  count: number
  index: number
  step: number
  playing: boolean
  frames: readonly T[]
  framesAt: (index: number) => readonly T[]
}

function onLastFrame<T>(view: Observation<T>) {
  const nextMap = (view.index + 1) % view.count
  return view.step === view.frames.length && nextMap === view.first
}

function showMap<T>(view: Observation<T>, index: number) {
  return { ...view, index, step: 0, frames: view.framesAt(index) }
}

function advance<T>(view: Observation<T>) {
  if (onLastFrame(view)) return view
  return view.step < view.frames.length
    ? { ...view, step: view.step + 1 }
    : showMap(view, (view.index + 1) % view.count)
}

// Step zero always shows the configured initial board. Maps without moving parts
// have no turn frames and advance straight to the next map after a viewing pause.
export function useMapObservation<T>(mapCount: number, framesForMap: (index: number) => readonly T[]) {
  const [view, setView] = useState<Observation<T>>()
  const [viewed, setViewed] = useState<Observation<T>>()
  const atEnd = !!view && onLastFrame(view)
  const playing = !!view?.playing && !atEnd
  useEffect(() => {
    if (!view || !playing) return
    const delay = view.step === view.frames.length ? 1600 : 750
    const timer = window.setTimeout(() => setViewed(view), delay)
    return () => window.clearTimeout(timer)
  }, [view, playing])
  const autoAdvance = useMemo(() => {
    if (!view || !playing || viewed !== view) return
    return () => setView(current => current === view ? advance(view) : current)
  }, [view, viewed, playing])

  const start = useCallback((index: number) => {
    const cache = new Map<number, readonly T[]>()
    function framesAt(map: number) {
      const saved = cache.get(map)
      if (saved) return saved
      const frames = framesForMap(map)
      cache.set(map, frames)
      return frames
    }
    setView({ first: index, count: mapCount, index, step: 0, playing: true, frames: framesAt(index), framesAt })
  }, [mapCount, framesForMap])
  function selectMap(index: number) {
    setView(current => current && { ...showMap(current, index), playing: false })
  }
  function toggle() {
    setView(current => {
      if (!current) return
      return onLastFrame(current)
        ? { ...showMap(current, current.first), playing: true }
        : { ...current, playing: !current.playing }
    })
  }
  function next() {
    setView(current => current && { ...advance(current), playing: false })
  }
  function previous() {
    setView(current => {
      if (!current) return
      if (current.step > 0) return { ...current, step: current.step - 1, playing: false }
      if (current.index === current.first) return current
      const prior = showMap(current, (current.index + current.count - 1) % current.count)
      return { ...prior, step: prior.frames.length, playing: false }
    })
  }
  const exit = useCallback(() => {
    setView(undefined)
    setViewed(undefined)
  }, [])
  return {
    active: !!view, mapIndex: view?.index ?? 0, step: view?.step ?? 0, frame: view?.frames[view.step - 1],
    playing, atEnd, atStart: !!view && view.step === 0 && view.index === view.first,
    start, selectMap, toggle, previous, next, exit, autoAdvance,
  }
}

export function MapObservationControls<T>({ observation: o, locale, nextBusy, revealBoard }: {
  observation: ReturnType<typeof useMapObservation<T>>; locale: Locale; nextBusy?: boolean; revealBoard?: () => void
}) {
  const playButton = useRef<HTMLButtonElement>(null)
  const revealOnOpen = useEffectEvent(() => {
    if (revealBoard) {
      revealBoard()
      return
    }
    const board = playButton.current?.closest('.board-panel')?.querySelector('.station-viewport')
    if (board) {
      const bounds = board.getBoundingClientRect()
      if (bounds.bottom < window.innerHeight * .2 || bounds.top > window.innerHeight * .8) {
        board.scrollIntoView({ block: 'start' })
      }
    }
  })
  // The minimum reading time can elapse while an offscreen combat animation is paused.
  // Advance only when the board also reports that the current action has finished.
  useEffect(() => {
    if (!nextBusy) o.autoAdvance?.()
  }, [nextBusy, o.autoAdvance])
  useEffect(() => {
    if (!o.active) return
    playButton.current?.focus({ preventScroll: true })
    revealOnOpen()
  }, [o.active])
  if (!o.active) return null
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <section className="map-observation" data-testid="map-observe-controls" data-map-index={o.mapIndex} data-step={o.step}
    aria-label={t('地图观察', 'Map observation')}>
    <div className="map-observation-heading">
      <strong role="status">{o.atEnd && !nextBusy ? t('观察完毕', 'Observation complete') : o.playing || (o.atEnd && nextBusy)
        ? t('正在观察地图', 'Observing the map') : t('观察已暂停', 'Observation paused')}</strong>
      <button type="button" className="subtle-button" data-testid="map-observe-exit" onClick={o.exit}>{t('结束观察', 'Exit observation')}</button>
    </div>
    <div className="map-observation-playback" role="group" aria-label={t('观察回放控制', 'Observation playback controls')}>
      <button type="button" className="subtle-button" disabled={o.atStart} onClick={o.previous} data-testid="map-observe-prev">{t('上一步', 'Previous')}</button>
      <button type="button" ref={playButton} className="primary-button" aria-pressed={o.playing} disabled={o.atEnd && nextBusy} onClick={() => {
        if (!o.playing) revealBoard?.()
        o.toggle()
      }} data-testid="map-observe-play">
        {o.atEnd ? t('再看一次', 'Replay') : o.playing ? t('暂停', 'Pause') : t('继续播放', 'Resume')}
      </button>
      <button type="button" className="subtle-button" disabled={o.atEnd || nextBusy} onClick={() => { revealBoard?.(); o.next() }} data-testid="map-observe-next">{t('下一步', 'Next')}</button>
    </div>
  </section>
}
