import { useCallback, useEffect, useState } from 'react'
import type { ArenaMatchPreviewBatch, ArenaMatchPreviewRequest, UnfinishedArenaMatch } from '../engine/arenaMatchPreview'
import type { ArenaLevel } from '../shared/advanced'
import { challengeZoneId } from '../shared/coursePrerequisites'
import type { Level } from '../shared/types'
import { readArenaMatchRecord } from './arenaMatchProgress'

export type { ArenaPreviewBoard, UnfinishedArenaMatch } from '../engine/arenaMatchPreview'

type MatchListState = { matches: UnfinishedArenaMatch[]; loading: boolean; failed: boolean }

const loadingState: MatchListState = { matches: [], loading: true, failed: false }

export function readUnfinishedArenaMatches(levels: readonly Level[]): ArenaMatchPreviewRequest[] {
  const arenas = levels.filter((level): level is ArenaLevel => level.kind === 'arena' && level.unit?.id === challengeZoneId)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
  return arenas.flatMap(level => {
    const matches: ArenaMatchPreviewRequest[] = []
    const timed = readArenaMatchRecord(level, 'timed')
    const relaxed = readArenaMatchRecord(level, 'relaxed')
    if (timed) matches.push({ level, mode: 'timed', ...timed })
    if (relaxed) matches.push({ level, mode: 'relaxed', ...relaxed })
    return matches
  }).sort((left, right) => (right.savedAt ?? -1) - (left.savedAt ?? -1))
}

export function useUnfinishedArenaMatches(levels: readonly Level[], limit?: number, includeBoard = false) {
  const [state, setState] = useState<MatchListState>(loadingState)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(previous => previous + 1), [])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key.startsWith('pixel-repair-lab:arena-match:')) reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [reload])

  useEffect(() => {
    const requests = readUnfinishedArenaMatches(levels)
    if (!requests.length) {
      setState({ matches: [], loading: false, failed: false })
      return
    }
    setState(loadingState)
    let worker: Worker | undefined
    let timer: number | undefined
    let pending = true

    function dispose() {
      if (!pending) return
      pending = false
      window.clearTimeout(timer)
      worker?.terminate()
    }

    function complete(matches: UnfinishedArenaMatch[], failed: boolean) {
      if (!pending) return
      dispose()
      setState({ matches, loading: false, failed })
    }

    function fail() {
      complete([], true)
    }

    try {
      worker = new Worker(new URL('../engine/arenaMatchPreview.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<UnfinishedArenaMatch[]>) => complete(event.data, false)
      worker.onerror = fail
      worker.onmessageerror = fail
      timer = window.setTimeout(fail, 12_000)
      const batch: ArenaMatchPreviewBatch = { requests, limit, includeBoard }
      worker.postMessage(batch)
    } catch {
      fail()
    }

    return dispose
  }, [levels, limit, includeBoard, revision])

  return { ...state, reload }
}
