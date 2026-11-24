import { RealtimeArenaSession } from './realtimeArena'
import { ARENA_TURN_MS, validateRealtimeArenaCheckpoint, type RealtimeArenaRequest, type RealtimeArenaResponse } from './realtimeProtocol'

let session: RealtimeArenaSession | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let phase: 'empty' | 'ready' | 'playing' | 'done' = 'empty'
let firstTurnMs = ARENA_TURN_MS
let deadline = 0

function send(response: RealtimeArenaResponse) {
  self.postMessage(response)
}

function schedule(delay = ARENA_TURN_MS) {
  deadline = Date.now() + delay
  timer = setTimeout(tick, delay)
  return deadline
}

function tick() {
  if (!session || phase !== 'playing') return
  const turn = session.tick()
  if (!turn) return
  if (turn.result) phase = 'done'
  send({ type: 'turn', ...turn, nextAt: turn.result ? undefined : schedule(), progress: session.progress })
}

self.addEventListener('message', (event: MessageEvent<RealtimeArenaRequest>) => {
  const request = event.data
  switch (request.type) {
    case 'prepare': {
      clearTimeout(timer)
      const checkpoint = validateRealtimeArenaCheckpoint(request.checkpoint, request.level.maxTurns, Boolean(request.level.combat))
      const restored = checkpoint && RealtimeArenaSession.restore(request.level, checkpoint, request.personal, request.course)
      session = restored ?? new RealtimeArenaSession(request.level, request.personal, request.course)
      firstTurnMs = restored && checkpoint ? checkpoint.remainingMs : ARENA_TURN_MS
      phase = 'ready'
      send({
        type: 'ready', snapshot: session.snapshot,
        restored: restored && checkpoint ? { checkpoint, frame: restored.latestFrame,
          latestShift: restored.latestShift, playerPositions: restored.playerPositions } : undefined,
      })
      break
    }
    case 'start':
      if (phase !== 'ready' || !session) break
      phase = 'playing'
      send({ type: 'started', nextAt: schedule(firstTurnMs), progress: session.progress })
      break
    case 'pause':
      if (phase !== 'playing' || !session) break
      clearTimeout(timer)
      firstTurnMs = Math.max(0, Math.min(ARENA_TURN_MS, deadline - Date.now()))
      phase = 'ready'
      send({ type: 'paused', checkpoint: { ...session.progress, remainingMs: firstTurnMs } })
      break
    case 'policy':
      if (!session || (phase !== 'ready' && phase !== 'playing')) break
      send({ type: 'policy', requestId: request.requestId, ...session.setPolicy(request.source), progress: session.progress })
      break
    case 'action':
      if (phase !== 'playing' || !session || request.turn !== session.snapshot.turn + 1 || !session.queueAction(request.action)) break
      send({ type: 'action', turn: request.turn, progress: session.progress })
  }
})
