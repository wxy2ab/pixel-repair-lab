import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ArenaFrame, ArenaLevel } from '../shared/advanced'
import { mapScenarioAt } from '../shared/mapScenarios'
import type { Locale } from '../shared/types'
import { initialArenaSnapshot } from '../engine/snapshot'
import { ArenaBoard, ArenaTurnEvents } from './ArenaPanels'
import { useArenaTurnPresentation } from './useArenaTurnPresentation'
import { arenaTurnTiming } from './arenaTurnMotion'
import { useLessonWorker } from './lessonTools'
import { MapObservationControls, useMapObservation } from './MapObservation'
import MapScenarioPicker from './MapScenarioPicker'
import { tr } from './text'

export function ArenaObservationBoard({ level, locale, initialMap, onExit }: {
  level: ArenaLevel; locale: Locale; initialMap: number; onExit: () => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const count = 1 + (level.variants?.length ?? 0)
  const maps = useRef<ArenaFrame[][]>([])
  const framesForMap = useCallback((index: number) => maps.current[index], [])
  const observation = useMapObservation(count, framesForMap, frame => arenaTurnTiming(frame.events, frame.state.actors).durationMs + 60)
  const start = observation.start
  const [failed, setFailed] = useState(false)
  const { run } = useLessonWorker<ArenaFrame[][]>()

  useEffect(() => {
    run(() => new Worker(new URL('../engine/advanced.worker.ts', import.meta.url), { type: 'module' }),
      { type: 'observe-arena', level }, frames => {
        maps.current = frames
        start(initialMap)
      }, () => setFailed(true))
  }, [initialMap, level, run, start])

  const index = observation.active ? observation.mapIndex : initialMap
  const map = useMemo(() => mapScenarioAt(level, index), [level, index])
  const frame = observation.frame
  const snapshot = frame?.state ?? initialArenaSnapshot(map)
  const presentation = useArenaTurnPresentation(index, snapshot, frame)
  const frames = maps.current[index]
  const latestShift = frames?.findLast((entry, i) => i < observation.step && entry.shift)?.shift
  return <>
    <ArenaBoard level={map} locale={locale} snapshot={snapshot} frame={frame} presentation={presentation}
      finished={!!frames && observation.step === frames.length} latestShift={latestShift}
      mapPicker={observation.active && <MapScenarioPicker locale={locale} index={index} count={count} onChange={observation.selectMap} />}>
      {observation.active ? <MapObservationControls observation={{ ...observation, exit: onExit }} locale={locale} nextBusy={presentation.inFlight} /> : <>
        <p role="status">{failed ? t('地图观察暂时无法打开，请再试一次。', 'The observation could not open. Please try again.')
          : t('正在准备地图观察…', 'Preparing the map observation…')}</p>
        <button type="button" className="subtle-button" onClick={onExit}>{t('结束观察', 'Exit observation')}</button>
      </>}
    </ArenaBoard>
    {presentation.reportedFrame && <ArenaTurnEvents frame={presentation.reportedFrame} level={map} locale={locale} />}
  </>
}
