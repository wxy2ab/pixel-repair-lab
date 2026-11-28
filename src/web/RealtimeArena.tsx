import { useCallback, useEffect, useEffectEvent, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  ARENA_TURN_MS, type ArenaChoice, type RealtimeArenaCheckpoint, type RealtimeArenaProgress, type RealtimeArenaResult, type RealtimePolicyStep,
  type RealtimeArenaRequest, type RealtimeArenaResponse,
} from '../engine/realtimeProtocol'
import { initialArenaSnapshot } from '../engine/snapshot'
import { mapScenarioAt } from '../shared/mapScenarios'
import type { ArenaFrame, ArenaLevel, PersonalAlgorithms } from '../shared/advanced'
import type { Direction, Locale, Position, RunIssue } from '../shared/types'
import { ArenaBoard, ArenaStateReference, ArenaTurnEvents, arenaResultText } from './ArenaPanels'
import { arenaPlayerActivity } from './arenaActivities'
import { useArenaFinishPresentation, useArenaTurnPresentation } from './useArenaTurnPresentation'
import { ArenaObservationBoard } from './ArenaObservationBoard'
import { ArenaConsolePanel, ArenaConsoleToggle, type ArenaConsoleControl } from './ArenaConsole'
import { ArenaMapOutcome, ArenaMatchKeys } from './ArenaMapShortcuts'
import { focusArenaBoard, useArenaKeyboardMode, useArenaTouchMove } from './ArenaMapMode'
import MapScenarioPicker from './MapScenarioPicker'
import { runIssueText, tr } from './text'
import { CourseHelperPicker } from './CourseHelperPicker'
import { CommandDesk } from './Classroom'
import { PlayToolbar, useTrailPreference } from './PlayToolbar'
import { SaveMovesToCode } from './SaveMovesToCode'
import { ExecutionSource } from './ExecutionSource'
import { StationActionCue } from './StationActionCue'
import { ActionRobot } from './ActionRobot'
import { flowActivity } from './station3d/types'
import { ChallengeFailureReview } from './ChallengeFailureReview'
import { arenaFailureReview } from './challengeGameReview'
import { arenaGoalReplayEvidence } from './goalReplayEvidence'
import type { ChallengeRunHandlers, ChallengeScore } from './challengeScore'
import { CodeField } from './CodeField'
import { HintSteps } from './HintSteps'
import './realtimeArena.css'

export const starterArenaPolicy = 'def decide(state):\n    return "wait"\n'

function recordedPolicy(actions: ArenaChoice[]) {
  return `def decide(state):
    actions = [
${actions.map(action => `        "${action}",`).join('\n')}
    ]
    turn = state["turn"]
    if turn < len(actions):
        return actions[turn]
    return "wait"`
}

export type ArenaBoardState = 'match' | 'preview' | 'finished'

type Props = {
  consoleControl: ArenaConsoleControl
  touchMove: RefObject<((direction: Direction) => void) | null>
  onBoardStateChange: (state: ArenaBoardState) => void
  level: ArenaLevel
  locale: Locale
  onComplete: () => void
  onMistake?: () => void
  personal: PersonalAlgorithms
  course: PersonalAlgorithms
  code: string
  setCode: (source: string) => void
  challenge?: ChallengeRunHandlers
  initialCheckpoint?: RealtimeArenaCheckpoint
  onCheckpointChange?: (checkpoint?: RealtimeArenaCheckpoint) => void
}

const commands = [
  { action: 'up', icon: '↑', zh: '向上', en: 'Up' },
  { action: 'down', icon: '↓', zh: '向下', en: 'Down' },
  { action: 'left', icon: '←', zh: '向左', en: 'Left' },
  { action: 'right', icon: '→', zh: '向右', en: 'Right' },
  { action: 'pick', icon: '◆', zh: '拾取', en: 'Pick' },
  { action: 'wait', icon: '◷', zh: '等待', en: 'Wait' },
] as const

const pulseDirections = [
  { dir: 'left', icon: '←', zh: '左', en: 'left' }, { dir: 'up', icon: '↑', zh: '上', en: 'up' },
  { dir: 'down', icon: '↓', zh: '下', en: 'down' }, { dir: 'right', icon: '→', zh: '右', en: 'right' },
] as const

function arenaActionLabel(action: ArenaChoice, locale: Locale) {
  const direction = pulseDirections.find(({ dir }) => action === dir || action === 'shoot-' + dir)
  if (direction) {
    return action === direction.dir ? tr(locale, '向' + direction.zh, 'Move ' + direction.en)
      : tr(locale, '向' + direction.zh + '发射', 'Fire ' + direction.en)
  }
  if (action === 'pick') return tr(locale, '拾取', 'Pick')
  if (action === 'guard') return tr(locale, '防守', 'Guard')
  return tr(locale, '等待', 'Wait')
}

function CombatPad({ locale, queued, choose }: { locale: Locale; queued?: ArenaChoice; choose: (action: ArenaChoice) => void }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  function button(action: ArenaChoice, face?: string) {
    const label = arenaActionLabel(action, locale)
    return <button type="button" key={action} className="subtle-button" aria-label={label} title={label}
      data-arena-action={action} aria-pressed={queued === action} onClick={() => choose(action)}>{face ?? label}</button>
  }
  return <div className="arena-combat-pad" role="group" aria-label={t('下一回合动作', 'Action for the next turn')}>
    <div className="arena-combat-axes">{(['move', 'shoot'] as const).map(kind =>
      <div key={kind} data-action-group={kind}><span>{kind === 'shoot' ? t('发射', 'Fire') : t('移动', 'Move')}</span>
        {pulseDirections.map(({ dir, icon }) => button(kind === 'shoot' ? `shoot-${dir}` : dir, icon))}
      </div>)}</div>
    <div className="arena-combat-utility">
      {button('guard')}{button('pick')}{button('wait')}
    </div>
  </div>
}

type Phase = 'preparing' | 'ready' | 'paused' | 'starting' | 'playing' | 'done' | 'failed'
type Clock = { deadline: number } | { remainingMs: number; presenting?: boolean }

function decisionClock(nextAt?: number): Clock {
  return nextAt === undefined ? { remainingMs: ARENA_TURN_MS, presenting: true } : { deadline: nextAt }
}

function usePolicyPlayback(step: RealtimePolicyStep | undefined, paused: boolean) {
  const [selection, setSelection] = useState<{ step: RealtimePolicyStep; index: number; manual: boolean }>()
  const events = step?.flow ?? []
  const index = selection && selection.step === step ? selection.index : 0
  const manual = selection && selection.step === step && selection.manual
  const event = events[index]
  useEffect(() => {
    if (!step || !event || manual || paused) return
    // Leave time to see the chosen move within the decision window.
    // All captured steps remain available on the slider, including the ones fast-forwarded here.
    const next = index === 4 ? Math.max(index + 1, events.length - 1) : index + 1
    const timer = window.setTimeout(() => setSelection({ step, index: next, manual: false }), 215)
    return () => window.clearTimeout(timer)
  }, [step, event, events.length, index, manual, paused])
  return { event, index, count: events.length, seek: (index: number) => { if (step) setSelection({ step, index, manual: true }) } }
}

function PolicyPlayback({ cursor, step, frame, locale }: {
  cursor: ReturnType<typeof usePolicyPlayback>; step: RealtimePolicyStep; frame: ArenaFrame; locale: Locale
}) {
  const activity = cursor.event ? flowActivity(cursor.event) : arenaPlayerActivity(frame)
  return <div className="timed-policy-playback" data-testid="policy-playback">
    <div className="timed-policy-action"><ActionRobot locale={locale} activity={activity} /><StationActionCue locale={locale} activity={activity} /></div>
    <label>{tr(locale, '本回合的策略步骤', 'Policy steps this turn')}
      <input type="range" min={0} max={cursor.count} value={cursor.index} onChange={e => cursor.seek(Number(e.currentTarget.value))} />
      <output>{cursor.index + 1}/{cursor.count + 1}</output>
    </label>
    {step.truncated && <small>{tr(locale, '这段策略较长，展示前段步骤和最终动作。', 'Long policy. Showing its first steps and final action.')}</small>}
  </div>
}

function remainingTime(clock: Clock) {
  return 'deadline' in clock ? Math.min(ARENA_TURN_MS, Math.max(0, clock.deadline - Date.now())) : clock.remainingMs
}

function TurnTimer({ clock, locale }: { clock: Clock; locale: Locale }) {
  const [remaining, setRemaining] = useState(() => remainingTime(clock))
  const running = 'deadline' in clock
  const displayed = running ? remaining : clock.remainingMs
  const volley = !running && clock.presenting ? tr(locale, '交火中', 'Volley') : undefined
  useEffect(() => {
    if (!running) return
    const pulse = () => setRemaining(remainingTime(clock))
    pulse()
    const interval = window.setInterval(pulse, 60)
    return () => window.clearInterval(interval)
  }, [clock, running])
  return <div className="arena-clock" data-paused={!running}>
    <progress value={displayed} max={ARENA_TURN_MS} aria-label={tr(locale, '距离下一回合', 'Time until next turn')} aria-valuetext={volley} />
    <span aria-hidden="true">{volley ?? (displayed / 1000).toFixed(1) + tr(locale, ' 秒', ' s')}</span>
  </div>
}

export function RealtimeArena(props: Props) {
  const [attempt, setAttempt] = useState<{ index: number; initialPolicy?: string }>({ index: 0 })
  const startAttempt = props.challenge?.onStart
  const reset = useCallback((initialPolicy?: string) => {
    startAttempt?.()
    setAttempt(last => ({ index: last.index + 1, initialPolicy }))
  }, [startAttempt])
  return <RealtimeMatch key={attempt.index} {...props} initialPolicy={attempt.initialPolicy}
    initialCheckpoint={attempt.index === 0 ? props.initialCheckpoint : undefined} reset={reset} />
}

function RealtimeMatch({ level, locale, onComplete, onMistake, personal, course, code, setCode, challenge, initialCheckpoint, onCheckpointChange, reset, consoleControl, initialPolicy, onBoardStateChange, touchMove }: Props & {
  reset: (initialPolicy?: string) => void; initialPolicy?: string
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [phase, setPhase] = useState<Phase>('preparing')
  const [mapIndex, setMapIndex] = useState(0)
  const [observing, setObserving] = useState(false)
  const keyboardMode = useArenaKeyboardMode()
  const touchEnabled = Boolean(useArenaTouchMove())
  const openingMove = useRef<{ action: ArenaChoice; input: 'key' | 'touch' } | undefined>(undefined)
  const [initial, setInitial] = useState(() => initialArenaSnapshot(level))
  const [frame, setFrame] = useState<ArenaFrame>()
  const [activityFrame, setActivityFrame] = useState<ArenaFrame>()
  const [playerPositions, setPlayerPositions] = useState<Position[]>(() => [level.start])
  const trail = useTrailPreference()
  const [latestShift, setLatestShift] = useState<ArenaFrame['shift']>()
  const [result, setResult] = useState<RealtimeArenaResult>()
  const [progress, setProgress] = useState<RealtimeArenaProgress>({ actions: [], policyOnly: true })
  const practice = progress.policyOnly !== true
  const [clock, setClock] = useState<Clock>()
  const [queued, setQueued] = useState<ArenaChoice>()
  const [appliedPolicy, setAppliedPolicy] = useState<string>()
  const [disabledDraft, setDisabledDraft] = useState<string>()
  const [policyPending, setPolicyPending] = useState(false)
  const [policyIssue, setPolicyIssue] = useState<RunIssue>()
  const [policyStep, setPolicyStep] = useState<RealtimePolicyStep>()
  const policyEditor = useRef<HTMLTextAreaElement>(null)
  const focusPolicyIssue = useRef(false)
  const worker = useRef<Worker | null>(null)
  const requestId = useRef(0)
  const completion = useRef(onComplete)
  const creditedResult = useRef<RealtimeArenaResult | undefined>(undefined)
  const mistake = useRef(onMistake)
  const runModules = useRef(personal)
  const runCourse = useRef(course)
  const resumeFrom = useRef(initialCheckpoint)
  const writeCheckpoint = useRef(onCheckpointChange)
  const saved = useRef<{ progress: RealtimeArenaProgress; clock: Clock } | undefined>(undefined)
  const snapshot = frame?.state ?? initial
  const queueAction = useCallback((action: ArenaChoice) => {
    worker.current?.postMessage({ type: 'action', action, turn: snapshot.turn + 1 } satisfies RealtimeArenaRequest)
  }, [snapshot.turn])
  const active = phase === 'ready' || phase === 'paused' || phase === 'playing'
  const dynamic = Boolean(level.shifts?.length)
  const shownLevel = useMemo(() => mapScenarioAt(level, mapIndex), [level, mapIndex])
  const activity = useMemo(() => arenaPlayerActivity(activityFrame), [activityFrame])
  const preview = mapIndex > 0
  const readOnlyMap = observing || preview
  const visibleSnapshot = preview ? initialArenaSnapshot(shownLevel) : snapshot
  const presentation = useArenaTurnPresentation(mapIndex, visibleSnapshot, preview ? undefined : frame, !readOnlyMap && frame === activityFrame, consoleControl.uncoverVolley)
  useEffect(() => {
    if (frame && !presentation.inFlight && frame.events.some(event => event.action === 'shoot')) {
      worker.current?.postMessage({ type: 'presented', turn: frame.state.turn } satisfies RealtimeArenaRequest)
    }
  }, [frame, presentation.inFlight])
  const showResult = phase === 'done' && !presentation.inFlight
  useArenaFinishPresentation(level.id, phase === 'done' && presentation.inFlight)
  const boardState: ArenaBoardState = readOnlyMap ? 'preview' : phase === 'done' || phase === 'failed' ? 'finished' : 'match'
  const playerControls = keyboardMode === 'player' && !readOnlyMap
  const touchControls = touchEnabled && boardState === 'match'
  const preparingFresh = phase === 'preparing' && !initialCheckpoint && initialPolicy === undefined
  const canOpenManually = !policyPending && (preparingFresh || phase === 'ready')
  const policyCursor = usePolicyPlayback(policyStep, phase === 'paused' || readOnlyMap)
  const review = showResult && result && !result.won ? arenaFailureReview(result) : undefined

  useLayoutEffect(() => {
    if (boardState === 'match') return
    onBoardStateChange(boardState)
    return () => onBoardStateChange('match')
  }, [boardState, onBoardStateChange])

  useLayoutEffect(() => {
    const opening = openingMove.current
    if (opening && !(opening.input === 'touch' ? touchControls : playerControls)) openingMove.current = undefined
  }, [playerControls, touchControls])

  const revealRetryBoard = useEffectEvent(() => consoleControl.revealBoard())
  useLayoutEffect(() => {
    // A Python retry mounts a fresh board and a taller toolbar before the first turn.
    if (initialPolicy !== undefined && phase === 'playing' && !frame) revealRetryBoard()
  }, [initialPolicy, phase, frame])

  useEffect(() => { completion.current = onComplete }, [onComplete])
  useEffect(() => { mistake.current = onMistake }, [onMistake])
  useEffect(() => { writeCheckpoint.current = onCheckpointChange }, [onCheckpointChange])

  const saveCheckpoint = useCallback(() => {
    const state = saved.current
    if (state) writeCheckpoint.current?.({ ...state.progress, remainingMs: remainingTime(state.clock) })
  }, [])

  const clearCheckpoint = useCallback(() => {
    saved.current = undefined
    writeCheckpoint.current?.()
  }, [])

  const resetMatch = useCallback(() => {
    clearCheckpoint()
    reset()
  }, [clearCheckpoint, reset])

  useEffect(() => {
    if (!challenge || !result?.policyOnly || creditedResult.current === result) return
    creditedResult.current = result
    const score: ChallengeScore = {
      kind: 'arena', mode: 'timed', goal: level.objective.kind,
      turns: result.final.turn, score: result.final.actors[0].score,
      passed: result.passedCases, total: result.totalCases,
    }
    if (result.won) challenge.onWin(score, resetMatch, arenaGoalReplayEvidence(result))
    else if (result.issue?.code !== 'internal') challenge.onFailure(score, arenaGoalReplayEvidence(result))
  }, [challenge, level.objective.kind, resetMatch, result])

  const finishPreparation = useEffectEvent(() => {
    const opening = openingMove.current
    openingMove.current = undefined
    if (opening && (opening.input === 'touch' ? touchControls : playerControls)) start(opening.action)
    else setPhase('ready')
  })
  const revealPolicyIssue = useEffectEvent(() => {
    focusPolicyIssue.current = true
    if (!consoleControl.open) consoleControl.toggle()
  })
  useLayoutEffect(() => {
    if (policyIssue && consoleControl.open && focusPolicyIssue.current) {
      focusPolicyIssue.current = false
      policyEditor.current?.focus()
    }
  }, [policyIssue, consoleControl.open])

  useEffect(() => {
    let runner: Worker
    try {
      runner = new Worker(new URL('../engine/realtime.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      setPhase('failed')
      return
    }
    worker.current = runner

    function updateProgress(progress: RealtimeArenaProgress, nextClock = saved.current?.clock) {
      if (nextClock) {
        saved.current = { progress, clock: nextClock }
        saveCheckpoint()
      }
    }

    runner.onmessage = (event: MessageEvent<RealtimeArenaResponse>) => {
      if (worker.current !== runner) return
      const message = event.data
      switch (message.type) {
        case 'ready': {
          setInitial(message.snapshot)
          if (message.restored) {
            const { checkpoint, frame, latestShift } = message.restored
            const { remainingMs, ...progress } = checkpoint
            const clock = { remainingMs }
            setFrame(frame)
            setPlayerPositions([level.start, ...message.restored.playerPositions])
            setProgress(progress)
            setLatestShift(latestShift)
            setQueued(progress.queued)
            setAppliedPolicy(progress.policy)
            setClock(clock)
            setPhase('paused')
            updateProgress(progress, clock)
          } else {
            if (resumeFrom.current) clearCheckpoint()
            finishPreparation()
          }
          break
        }
        case 'started': {
          const clock = decisionClock(message.nextAt)
          setClock(clock)
          setQueued(message.progress.queued)
          setPhase('playing')
          updateProgress(message.progress, clock)
          break
        }
        case 'paused': {
          const { remainingMs, ...progress } = message.checkpoint
          const stopped = { remainingMs }
          setClock(stopped)
          setPhase('paused')
          updateProgress(progress, stopped)
          break
        }
        case 'policy':
          updateProgress(message.progress)
          if (requestId.current !== message.requestId) break
          setPolicyPending(false)
          setAppliedPolicy(message.progress.policy)
          setPolicyIssue(message.issue)
          if (message.issue) {
            setPhase(current => current === 'starting' ? 'ready' : current)
            revealPolicyIssue()
          }
          break
        case 'action':
          setQueued(message.progress.queued)
          updateProgress(message.progress)
          break
        case 'turn': {
          const clock = message.result ? undefined : decisionClock(message.nextAt)
          setFrame(message.frame)
          setActivityFrame(message.frame)
          setPolicyStep(message.policyStep)
          setPlayerPositions(positions => [...positions, message.frame.state.actors[0]])
          setProgress(message.progress)
          if (message.frame.shift) setLatestShift(message.frame.shift)
          setClock(clock)
          setQueued(message.progress.queued)
          if (message.issue) {
            setPolicyIssue(message.issue)
            setAppliedPolicy(undefined)
          }
          if (message.result) {
            clearCheckpoint()
            setResult(message.result)
            setPolicyPending(false)
            setPhase('done')
            if (message.result.policyOnly) {
              if (message.result.won) completion.current()
              else if (message.result.issue?.code !== 'internal') mistake.current?.()
            }
          } else if (clock) updateProgress(message.progress, clock)
          break
        }
      }
    }
    runner.onerror = () => {
      if (worker.current === runner) {
        const state = saved.current
        if (state) {
          state.clock = { remainingMs: remainingTime(state.clock) }
          saveCheckpoint()
        }
        setPhase('failed')
        setClock(undefined)
        setPolicyPending(false)
        runner.terminate()
        worker.current = null
      }
    }
    const request: RealtimeArenaRequest = {
      type: 'prepare', level, personal: runModules.current, course: runCourse.current, checkpoint: resumeFrom.current,
    }
    runner.postMessage(request)
    if (initialPolicy !== undefined) {
      setPolicyPending(true)
      runner.postMessage({ type: 'policy', source: initialPolicy, requestId: ++requestId.current, startOnSuccess: true } satisfies RealtimeArenaRequest)
    }
    window.addEventListener('pagehide', saveCheckpoint)
    return () => {
      window.removeEventListener('pagehide', saveCheckpoint)
      saveCheckpoint()
      worker.current = null
      runner.terminate()
    }
  }, [clearCheckpoint, initialPolicy, level, saveCheckpoint])

  function send(request: RealtimeArenaRequest) {
    worker.current?.postMessage(request)
  }

  function start(firstAction?: ArenaChoice) {
    consoleControl.revealBoard()
    if (phase !== 'paused') challenge?.onStart()
    setPhase('starting')
    if (phase === 'ready' && firstAction === undefined) {
      // A fresh Start runs the visible draft. Resume uses the saved match's applied policy.
      const desiredPolicy = code !== disabledDraft && (hasDraftPolicy || code === appliedPolicy) ? code : undefined
      if (desiredPolicy !== appliedPolicy) {
        applyPolicy(desiredPolicy ?? '', true)
        return
      }
    }
    send({ type: 'start', firstAction })
  }

  function chooseManualAction(action: ArenaChoice, input: 'key' | 'touch') {
    if (readOnlyMap) return
    if (phase === 'playing') queueAction(action)
    else if (canOpenManually && phase === 'ready') start(action)
    else if (canOpenManually && preparingFresh) openingMove.current ??= { action, input }
  }

  useImperativeHandle(touchMove, () => direction => {
    if (touchControls) chooseManualAction(direction, 'touch')
  })

  function changeMap(index: number) {
    if (index !== 0 && mapIndex === 0 && (phase === 'playing' || phase === 'starting')) {
      send({ type: 'pause' })
    }
    setActivityFrame(undefined)
    setMapIndex(index)
  }

  function applyPolicy(source: string, startOnSuccess = false) {
    setDisabledDraft(source ? undefined : code)
    setPolicyPending(true)
    setPolicyIssue(undefined)
    setPolicyStep(undefined)
    send({ type: 'policy', source, requestId: ++requestId.current, startOnSuccess })
  }

  function insertImport(module: 'algorithms' | 'my_algorithms', name: string) {
    const statement = `from ${module} import ${name}`
    if (!code.split('\n').includes(statement)) setCode(`${statement}\n\n${code}`)
  }

  let policyFeedback = policyIssue && runIssueText(locale, policyIssue)
  if (policyIssue?.detail === 'decide') {
    const line = policyIssue.line ? t(`第 ${policyIssue.line} 行 · `, `Line ${policyIssue.line} · `) : ''
    policyFeedback = line + t('策略需要写成 decide(state)，并返回一个可用动作。', 'Define decide(state) and return one of the available actions.')
  }

  const canStart = phase === 'ready' || phase === 'paused'
  const canReset = phase === 'paused' || phase === 'playing' || phase === 'done' || phase === 'failed'
  const observeButton = (canStart || showResult) && <button type="button" className="subtle-button" data-testid="map-observe-start"
    onClick={() => { setActivityFrame(undefined); setObserving(true) }}>{t('观察地图', 'Observe map')}</button>
  const resume = clock && 'remainingMs' in clock
  const readyHint = touchControls ? t('在棋盘上滑动，走出第一步就开局。', 'Swipe the board to make your first move and start.')
    : t('按方向键或 WASD，第一步就能开局。', 'Press an arrow key or WASD to make your first move and start.')
  const pausedHint = t('已暂停。点「继续对局」后可控制芽芽。', 'Paused. Choose Resume match to control Sprout.')
  const nextAction = phase === 'playing' && queued ? arenaActionLabel(queued, locale) : undefined
  const controlCue = playerControls || touchControls ? nextAction ? t(`下一回合 · ${nextAction}`, `Next turn · ${nextAction}`)
    : canOpenManually ? readyHint : phase === 'paused' ? pausedHint : undefined : undefined
  const matchResult = result && arenaResultText(result, locale, dynamic)
  const outcome = result && !result.policyOnly
    ? t(`练习结束 · ${matchResult} 让 Python 从第 1 回合独立达成目标，就能通关。`,
      `Practice complete · ${matchResult} To clear the level, reach the goal with Python from turn 1.`) : matchResult
  const status = (showResult ? outcome : undefined) ?? {
    preparing: resumeFrom.current ? t('正在恢复棋盘…', 'Restoring the board…') : t('正在准备棋盘…', 'Setting up the board…'),
    ready: t('尚未开始。准备好再出发。', 'Waiting to start. Begin when you are ready.'),
    paused: t('对局已暂停。点继续对局后再计时。', 'Match paused. The timer resumes when you continue.'),
    starting: t('正在开始…', 'Starting…'),
    playing: practice ? t('对抗练习进行中', 'Practice match in progress') : t('对抗进行中', 'Match in progress'),
    done: presentation.inFlight ? t('本回合进行中', 'Turn in progress') : undefined,
    failed: t('赛场连接中断。重新准备再试。', 'The arena stopped responding. Set up a new round to retry.'),
  }[phase]

  const acceptsActions = phase === 'playing' && !readOnlyMap
  const showPad = acceptsActions && (Boolean(level.combat) || consoleControl.mapMode)
  const manualActions = <div className="arena-manual-actions" role="group" aria-label={t('下一回合动作', 'Action for the next turn')}>
    {commands.map(command => <button key={command.action} type="button" className="subtle-button" aria-pressed={queued === command.action}
      onClick={() => queueAction(command.action)}>
      <b aria-hidden="true">{command.icon}</b>{t(command.zh, command.en)}
    </button>)}
  </div>
  const hasDraftPolicy = Boolean(code.trim()) && code.trim() !== starterArenaPolicy.trim()
  const draftStartsMatch = hasDraftPolicy && code !== disabledDraft
  let policyStatus = t('尚未启用策略', 'No active policy')
  if (policyPending) policyStatus = t('正在检查策略…', 'Checking policy…')
  else if (code === appliedPolicy) policyStatus = t('策略已启用', 'Policy active')
  else if (phase === 'ready' && draftStartsMatch) policyStatus = t('点「开始」从第 1 回合运行这段代码。', 'Choose Start to run this code from turn 1.')
  else if (appliedPolicy) policyStatus = t('草稿已修改。点「替换策略」可启用当前代码。', 'Draft edited. Choose Replace policy to use this code.')
  return <>
    <ArenaMatchKeys playing={!readOnlyMap && (phase === 'playing' || canOpenManually)} combat={Boolean(level.combat)} onChoose={action => chooseManualAction(action, 'key')} />
    {consoleControl.mapMode && controlCue && <p className="arena-keyboard-cue" role="status">{controlCue}</p>}
    <ArenaMapOutcome won={showResult && result?.policyOnly && result.won} text={!observing && !preview && (phase === 'failed' || showResult) ? status : undefined} />
    <div className="play-column">
      {observing ? <ArenaObservationBoard level={level} locale={locale} initialMap={mapIndex} onExit={() => setObserving(false)} consoleControl={consoleControl} /> : <>
      <ArenaBoard level={shownLevel} locale={locale} snapshot={visibleSnapshot} frame={preview ? undefined : frame} presentation={presentation}
        activity={!preview ? activity : undefined}
        trail={trail.visible && !preview ? playerPositions : undefined}
        latestShift={preview ? undefined : latestShift} finished={!preview && (phase === 'done' || phase === 'failed')}
        mapPicker={<MapScenarioPicker locale={locale} count={1 + (level.variants?.length ?? 0)} index={mapIndex} onChange={changeMap} />}>
        {preview ? <p role="status">{t('地图预览。紧张模式在地图 1 进行。', 'Map preview. Timed matches take place on Map 1.')}</p> : <div className="timed-arena-controls">
          <p role="status" className={showResult && result?.won ? 'win-message' : showResult || phase === 'failed' ? 'error-message' : undefined}>
            {consoleControl.mapMode ? status : controlCue ?? status}
          </p>
          {clock && !showPad && <TurnTimer clock={clock} locale={locale} />}
          {frame && policyStep && policyCursor.count > 0 && <PolicyPlayback step={policyStep} frame={frame} cursor={policyCursor} locale={locale} />}
          {acceptsActions && !showPad && manualActions}
        </div>}
      </ArenaBoard>
      {!preview && review && <ChallengeFailureReview review={review} onRetry={resetMatch} />}
      {!preview && presentation.reportedFrame && <ArenaTurnEvents frame={presentation.reportedFrame} level={level} locale={locale} />}
      </>}
    </div>
    <ArenaConsolePanel control={consoleControl} locale={locale}><CommandDesk locale={locale}>
      <div className="play-column">
        <section className="panel editor-panel timed-policy-panel">
          <div className="panel-heading"><h2><span className="bracket-icon" aria-hidden="true">{'{ }'}</span>{t('实时 Python 策略', 'Live Python policy')}</h2></div>
          <div className="editor-body">
            <label htmlFor="realtime-python" className="python-label">{dynamic ? 'decide(state)' : t('编写 decide(state)', 'Write decide(state)')}</label>
            <CodeField id="realtime-python" inputRef={policyEditor} locale={locale} maxLength={12000} value={code} onChange={setCode}
              onRun={!readOnlyMap && phase === 'ready' && !policyPending ? () => start() : undefined} />
            <p role={policyFeedback ? 'alert' : 'status'} className={'timed-policy-status' + (policyFeedback ? ' error-message' : '')}>
              {policyFeedback ?? policyStatus}
            </p>
            {!preview && !observing && phase !== 'failed' && frame && policyStep?.source === code &&
              <ExecutionSource locale={locale} code={code} current={policyCursor.event ?? policyStep}
                personal={runModules.current} course={runCourse.current} />}
            <p className="timed-policy-note">{t('手动操作可以接管下一回合。正式通关时，让 Python 从第 1 回合起选择每一步。',
              'Use manual controls to take over the next turn. To clear the level, let Python choose every move from turn 1.')}</p>
            <div className="api-list">{[...commands.map(({ action }) => action), ...(level.combat ? ['guard', ...pulseDirections.map(({ dir }) => 'shoot-' + dir)] : [])]
              .map(action => <code key={action}>{JSON.stringify(action)}</code>)}</div>
            <CourseHelperPicker names={level.helpers} course={course} personal={personal} code={code} locale={locale} onChange={setCode} />
            {(dynamic || level.combat) && <ArenaStateReference locale={locale} timed dynamic={dynamic} combat={Boolean(level.combat)}
              hasSwitches={Boolean(level.combat?.switches?.length)} />}
            {(!dynamic || Object.keys(personal).some(name => !level.helpers?.includes(name))) && <details className="timed-policy-note">
              <summary>{dynamic ? t('我的算法', 'My algorithms') : t('查看赛场数据和算法', 'Arena data and algorithms')}</summary>
              {!dynamic && <p>{t('state 包含棋盘 tiles、自己的坐标 player、对手 opponents、零件 items、回合 turn，以及出口 exit。坐标顺序是 x、y。',
                'state contains tiles, player coordinates, opponents, items, turn, and exit. Coordinates use x, y order.')}</p>}
              <div className="demo-picker">
                {!dynamic && !level.helpers?.includes('shortest_step') && <button className="subtle-button" type="button" onClick={() => insertImport('algorithms', 'shortest_step')}>{t('导入课程算法', 'Import course algorithm')}</button>}
                {Object.keys(personal).filter(name => !level.helpers?.includes(name)).map(name => <button key={name} type="button" className="subtle-button" onClick={() => insertImport('my_algorithms', name)}>
                  {t('我的算法', 'My algorithm')} · {name}
                </button>)}
              </div>
            </details>}
          </div>
        </section>
        {level.hints.length > 0 && <details className="panel teaching-panel">
          <summary>{t('任务提示', 'Mission hints')}</summary><HintSteps hints={level.hints} locale={locale} />
        </details>}
      </div>
    </CommandDesk></ArenaConsolePanel>
    <PlayToolbar locale={locale} trail={trail} quickActions={showPad && <>
      {clock && <TurnTimer clock={clock} locale={locale} />}
      {level.combat ? <CombatPad locale={locale} queued={queued} choose={queueAction} /> : manualActions}
    </>}>
      {observing ? <button type="button" className="primary-button" onClick={() => setObserving(false)}>{t('返回对局', 'Return to match')}</button> : <>
        {!preview && (canStart || phase === 'preparing' || phase === 'starting') && <button type="button" className="primary-button" disabled={!canStart || policyPending} onClick={event => {
          if (playerControls) focusArenaBoard(event.currentTarget.closest<HTMLElement>('.arena-map-workspace'))
          start()
        }}>
          {resume ? t('继续对局', 'Resume match') : t('开始', 'Start')}
        </button>}
        {!preview && phase === 'playing' && <button type="button" className="primary-button" onClick={() => send({ type: 'pause' })}>
          {t('暂停对局', 'Pause match')}
        </button>}
        {!preview && practice && progress.actions.length > 0 &&
          <SaveMovesToCode locale={locale} draft={hasDraftPolicy ? code : undefined}
            getCode={() => recordedPolicy(progress.actions)}
            onSave={source => {
              if (phase === 'playing') send({ type: 'pause' })
              setCode(source)
              if (!consoleControl.open) consoleControl.toggle()
              requestAnimationFrame(() => policyEditor.current?.focus())
            }} />}
        {preview && <button type="button" className="primary-button" onClick={() => changeMap(0)}>{t('返回对局地图', 'Return to match map')}</button>}
        {!preview && active && <button type="button" className="subtle-button" disabled={policyPending || !code.trim()} onClick={() => applyPolicy(code)}>
          {appliedPolicy ? t('替换策略', 'Replace policy') : t('应用策略', 'Apply policy')}
        </button>}
        {!preview && active && appliedPolicy && <button type="button" className="subtle-button" disabled={policyPending} onClick={() => applyPolicy('')}>
          {t('停用策略', 'Disable policy')}
        </button>}
        {!preview && showResult && result && !result.policyOnly && <button type="button" className="primary-button" onClick={() => {
          if (hasDraftPolicy) {
            clearCheckpoint()
            reset(code)
          } else {
            if (!consoleControl.open) consoleControl.toggle()
            requestAnimationFrame(() => policyEditor.current?.focus())
          }
        }}>{hasDraftPolicy ? t('用 Python 从头挑战', 'Retry with Python') : t('编写通关策略', 'Write a Python policy')}</button>}
        {!preview && canReset && <button type="button" className="subtle-button" onClick={resetMatch}>{t('重新准备', 'Reset match')}</button>}
        {observeButton}
      </>}
      {consoleControl.mapMode && <ArenaConsoleToggle control={consoleControl} locale={locale} />}
    </PlayToolbar>
  </>
}
