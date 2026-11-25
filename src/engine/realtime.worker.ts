import { RealtimeArenaSession } from './realtimeArena'
import { ARENA_TURN_MS, validateRealtimeArenaCheckpoint, type ArenaChoice, type RealtimeArenaRequest, type RealtimeArenaResponse } from './realtimeProtocol'

let session: RealtimeArenaSession | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let phase: 'empty' | 'ready' | 'paused' | 'playing' | 'done' = 'empty'
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

function start(firstAction?: ArenaChoice) {
  if (!session || (phase !== 'ready' && phase !== 'paused')) return
  if (firstAction !== undefined && (phase !== 'ready' || !session.queueAction(firstAction))) return
  phase = 'playing'
  send({ type: 'started', nextAt: schedule(firstTurnMs), progress: session.progress })
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
      phase = restored ? 'paused' : 'ready'
      send({
        type: 'ready', snapshot: session.snapshot,
        restored: restored && checkpoint ? { checkpoint, frame: restored.latestFrame,
          latestShift: restored.latestShift, playerPositions: restored.playerPositions } : undefined,
      })
      break
    }
    case 'start':
      start(request.firstAction)
      break
    case 'pause':
      if (phase !== 'playing' || !session) break
      clearTimeout(timer)
      firstTurnMs = Math.max(0, Math.min(ARENA_TURN_MS, deadline - Date.now()))
      phase = 'paused'
      send({ type: 'paused', checkpoint: { ...session.progress, remainingMs: firstTurnMs } })
      break
    case 'policy': {
      if (!session || (phase !== 'ready' && phase !== 'paused' && phase !== 'playing')) break
      const validation = session.setPolicy(request.source)
      send({ type: 'policy', requestId: request.requestId, ...validation, progress: session.progress })
      if (request.startOnSuccess && !validation.issue) start()
      break
    }
    case 'action':
      if (phase !== 'playing' || !session || request.turn !== session.snapshot.turn + 1 || !session.queueAction(request.action)) break
      send({ type: 'action', turn: request.turn, progress: session.progress })
  }
})
