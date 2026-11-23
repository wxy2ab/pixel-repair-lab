import type { ArenaLevel, ArenaSnapshot } from '../shared/advanced'
import type { ArenaMatchMode } from '../web/arenaMatchProgress'
import type { ArenaReplayProgress } from '../web/arenaReplayProgress'
import { ArenaSession, arenaModules } from './arena'
import { RealtimeArenaSession } from './realtimeArena'
import type { RealtimeArenaCheckpoint } from './realtimeProtocol'
import { initialArenaSnapshot } from './snapshot'

export type ArenaMatchPreviewRequest = { level: ArenaLevel; savedAt?: number } & (
  | { mode: 'timed'; progress: RealtimeArenaCheckpoint }
  | { mode: 'relaxed'; progress: ArenaReplayProgress }
)

export type ArenaMatchPreviewBatch = { requests: readonly ArenaMatchPreviewRequest[]; limit?: number; includeBoard?: boolean }

export type ArenaPreviewBoard = {
  tiles: string[]
  actors: ArenaSnapshot['actors']
  items: ArenaSnapshot['items']
}

export type UnfinishedArenaMatch = {
  levelId: string
  mode: ArenaMatchMode
  turn: number
  scores: { id: string; score: number }[]
  remainingMs?: number
  savedAt?: number
  board?: ArenaPreviewBoard
}

function replaySnapshot(level: ArenaLevel, { source, personal, course, step }: ArenaReplayProgress) {
  const arena = new ArenaSession(level)
  const { issue } = arena.run(source, arenaModules(level, personal, course))
  if (step >= arena.frames.length + Number(!!issue)) return
  return step === 0 ? initialArenaSnapshot(level) : arena.frames[step - 1]?.state
}

export function previewArenaMatch(request: ArenaMatchPreviewRequest, includeBoard = false): UnfinishedArenaMatch | undefined {
  const { level, mode, progress, savedAt } = request
  const snapshot = mode === 'timed' ? RealtimeArenaSession.restore(level, progress)?.snapshot
    : replaySnapshot(level, progress)
  if (!snapshot) return
  return {
    levelId: level.id,
    mode,
    turn: snapshot.turn,
    scores: snapshot.actors.map(({ id, score }) => ({ id, score })),
    ...(mode === 'timed' ? { remainingMs: progress.remainingMs } : {}),
    ...(savedAt === undefined ? {} : { savedAt }),
    ...(includeBoard ? { board: { tiles: snapshot.tiles ?? level.tiles, actors: snapshot.actors, items: snapshot.items } } : {}),
  }
}

export function previewArenaMatches({ requests, limit = requests.length, includeBoard = false }: ArenaMatchPreviewBatch): UnfinishedArenaMatch[] {
  const matches: UnfinishedArenaMatch[] = []
  for (const request of requests) {
    if (matches.length >= limit) break
    const match = previewArenaMatch(request, includeBoard)
    if (match) matches.push(match)
  }
  return matches
}
