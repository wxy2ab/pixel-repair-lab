import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ARENA_TURN_MS, type ArenaChoice, type RealtimeArenaCheckpoint, type RealtimeArenaProgress, type RealtimePolicyStep,
  type RealtimeArenaRequest, type RealtimeArenaResponse,
} from '../engine/realtimeProtocol'
import { initialArenaSnapshot } from '../engine/snapshot'
import { mapScenarioAt } from '../shared/mapScenarios'
import type { ArenaFrame, ArenaLevel, ArenaResult, PersonalAlgorithms } from '../shared/advanced'
import type { Locale, Position, RunIssue } from '../shared/types'
import { ArenaBoard, ArenaStateReference, ArenaTurnEvents, arenaResultText } from './ArenaPanels'
import { arenaPlayerActivity } from './arenaActivities'
import { ArenaObservationBoard } from './ArenaObservationBoard'
import MapScenarioPicker from './MapScenarioPicker'
import { runIssueText, tr } from './text'
import { CourseHelperPicker } from './CourseHelperPicker'
import { CommandDesk } from './Classroom'
import { PlayToolbar, useTrailPreference } from './PlayToolbar'
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

type Props = {
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

type Phase = 'preparing' | 'ready' | 'paused' | 'starting' | 'playing' | 'done' | 'failed'
type Clock = { deadline: number } | { remainingMs: number }

function usePolicyPlayback(step: RealtimePolicyStep | undefined, paused: boolean) {
  const [selection, setSelection] = useState<{ step: RealtimePolicyStep; index: number; manual: boolean }>()
  const events = step?.flow ?? []
  const index = selection && selection.step === step ? selection.index : 0
  const manual = selection && selection.step === step && selection.manual
  const event = events[index]
  useEffect(() => {
    if (!step || !event || manual || paused) return
    // A long policy must leave time to see the chosen move before the next 1.8s turn.
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
  useEffect(() => {
    if (!running) return
    const pulse = () => setRemaining(remainingTime(clock))
    pulse()
    const interval = window.setInterval(pulse, 60)
    return () => window.clearInterval(interval)
  }, [clock, running])
  return <div className="arena-clock" data-paused={!running}>
    <progress value={displayed} max={ARENA_TURN_MS} aria-label={tr(locale, '距离下一回合', 'Time until next turn')} />
    <span aria-hidden="true">{(displayed / 1000).toFixed(1)}{tr(locale, ' 秒', ' s')}</span>
  </div>
}

export function RealtimeArena(props: Props) {
  const [attempt, setAttempt] = useState(0)
  const startAttempt = props.challenge?.onStart
  const reset = useCallback(() => {
    startAttempt?.()
    setAttempt(value => value + 1)
  }, [startAttempt])
  return <RealtimeMatch key={attempt} {...props} initialCheckpoint={attempt === 0 ? props.initialCheckpoint : undefined} reset={reset} />
}

function RealtimeMatch({ level, locale, onComplete, onMistake, personal, course, code, setCode, challenge, initialCheckpoint, onCheckpointChange, reset }: Props & { reset: () => void }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [phase, setPhase] = useState<Phase>('preparing')
  const [mapIndex, setMapIndex] = useState(0)
  const [observing, setObserving] = useState(false)
  const [initial, setInitial] = useState(() => initialArenaSnapshot(level))
  const [frame, setFrame] = useState<ArenaFrame>()
  const [activityFrame, setActivityFrame] = useState<ArenaFrame>()
  const [playerPositions, setPlayerPositions] = useState<Position[]>(() => [level.start])
  const trail = useTrailPreference()
  const [latestShift, setLatestShift] = useState<ArenaFrame['shift']>()
  const [result, setResult] = useState<ArenaResult>()
  const [clock, setClock] = useState<Clock>()
  const [queued, setQueued] = useState<ArenaChoice>()
  const [policyActive, setPolicyActive] = useState(false)
  const [policyPending, setPolicyPending] = useState(false)
  const [policyIssue, setPolicyIssue] = useState<RunIssue>()
  const [policyStep, setPolicyStep] = useState<RealtimePolicyStep>()
  const worker = useRef<Worker | null>(null)
  const requestId = useRef(0)
  const completion = useRef(onComplete)
  const creditedResult = useRef<ArenaResult | undefined>(undefined)
  const mistake = useRef(onMistake)
  const runModules = useRef(personal)
  const runCourse = useRef(course)
  const resumeFrom = useRef(initialCheckpoint)
  const writeCheckpoint = useRef(onCheckpointChange)
  const saved = useRef<{ progress: RealtimeArenaProgress; clock: Clock } | undefined>(undefined)
  const snapshot = frame?.state ?? initial
  const active = phase === 'ready' || phase === 'paused' || phase === 'playing'
  const dynamic = Boolean(level.shifts?.length)
  const shownLevel = mapScenarioAt(level, mapIndex)
  const preview = mapIndex > 0
  const policyCursor = usePolicyPlayback(policyStep, phase === 'paused' || observing || preview)
  const review = phase === 'done' && result && !result.won ? arenaFailureReview(result) : undefined

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
    if (!challenge || !result || creditedResult.current === result) return
    creditedResult.current = result
    const score: ChallengeScore = {
      kind: 'arena', mode: 'timed', goal: level.objective.kind,
      turns: result.final.turn, score: result.final.actors[0].score,
      passed: result.passedCases, total: result.totalCases,
    }
    if (result.won) challenge.onWin(score, resetMatch, arenaGoalReplayEvidence(result))
    else if (result.issue?.code !== 'internal') challenge.onFailure(score, arenaGoalReplayEvidence(result))
  }, [challenge, level.objective.kind, resetMatch, result])
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
            setLatestShift(latestShift)
            setQueued(progress.queued)
            setPolicyActive(Boolean(progress.policy))
            setClock(clock)
            setPhase('paused')
            updateProgress(progress, clock)
          } else {
            if (resumeFrom.current) clearCheckpoint()
            setPhase('ready')
          }
          break
        }
        case 'started': {
          const clock = { deadline: message.nextAt }
          setClock(clock)
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
          setPolicyActive(message.active)
          setPolicyIssue(message.issue)
          break
        case 'action':
          setQueued(message.progress.queued)
          updateProgress(message.progress)
          break
        case 'turn': {
          const clock = message.nextAt !== undefined ? { deadline: message.nextAt } : undefined
          setFrame(message.frame)
          setActivityFrame(message.frame)
          setPolicyStep(message.policyStep)
          setPlayerPositions(positions => [...positions, message.frame.state.actors[0]])
          if (message.frame.shift) setLatestShift(message.frame.shift)
          setClock(clock)
          setQueued(message.progress.queued)
          if (message.issue) {
            setPolicyIssue(message.issue)
            setPolicyActive(false)
          }
          if (message.result) {
            clearCheckpoint()
            setResult(message.result)
            setPolicyPending(false)
            setPhase('done')
            if (message.result.won) completion.current()
            else if (message.result.issue?.code !== 'internal') mistake.current?.()
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
    window.addEventListener('pagehide', saveCheckpoint)
    return () => {
      window.removeEventListener('pagehide', saveCheckpoint)
      saveCheckpoint()
      worker.current = null
      runner.terminate()
    }
  }, [clearCheckpoint, level, saveCheckpoint])

  function send(request: RealtimeArenaRequest) {
    worker.current?.postMessage(request)
  }

  function start() {
    if (phase === 'ready') challenge?.onStart()
    setPhase('starting')
    send({ type: 'start' })
  }

  function changeMap(index: number) {
    if (index !== 0 && mapIndex === 0 && (phase === 'playing' || phase === 'starting')) {
      send({ type: 'pause' })
    }
    setActivityFrame(undefined)
    setMapIndex(index)
  }

  function applyPolicy(source: string) {
    setPolicyPending(true)
    setPolicyIssue(undefined)
    setPolicyStep(undefined)
    send({ type: 'policy', source, requestId: ++requestId.current })
  }

  function insertImport(module: 'algorithms' | 'my_algorithms', name: string) {
    const statement = `from ${module} import ${name}`
    if (!code.split('\n').includes(statement)) setCode(`${statement}\n\n${code}`)
  }

  const policyFeedback = policyIssue?.detail === 'decide'
    ? t('策略需要写成 decide(state)，并返回一个可用动作。', 'Define decide(state) and return one of the available actions.')
    : policyIssue ? runIssueText(locale, policyIssue) : undefined

  const canStart = phase === 'ready' || phase === 'paused'
  const canReset = phase === 'paused' || phase === 'playing' || phase === 'done' || phase === 'failed'
  const observeButton = (canStart || phase === 'done') && <button type="button" className="subtle-button" data-testid="map-observe-start"
    onClick={() => { setActivityFrame(undefined); setObserving(true) }}>{t('观察地图', 'Observe map')}</button>
  const resume = clock && 'remainingMs' in clock
  const status = result ? arenaResultText(result, locale, dynamic) : {
    preparing: resumeFrom.current ? t('正在恢复棋盘…', 'Restoring the board…') : t('正在准备棋盘…', 'Setting up the board…'),
    ready: t('尚未开始。准备好再出发。', 'Waiting to start. Begin when you are ready.'),
    paused: t('对局已暂停。点继续对局后再计时。', 'Match paused. The timer resumes when you continue.'),
    starting: t('正在开始…', 'Starting…'),
    playing: t('对抗进行中', 'Match in progress'),
    done: undefined,
    failed: t('赛场连接中断。重新准备再试。', 'The arena stopped responding. Set up a new round to retry.'),
  }[phase]

  return <div className="lesson-layout">
    <div className="play-column">
      {observing ? <ArenaObservationBoard level={level} locale={locale} initialMap={mapIndex} onExit={() => setObserving(false)} /> : <>
      <ArenaBoard level={shownLevel} locale={locale} snapshot={preview ? initialArenaSnapshot(shownLevel) : snapshot}
        activity={!preview ? arenaPlayerActivity(activityFrame) : undefined}
        trail={trail.visible && !preview ? playerPositions : undefined}
        latestShift={preview ? undefined : latestShift} finished={!preview && (phase === 'done' || phase === 'failed')}
        mapPicker={<MapScenarioPicker locale={locale} count={1 + (level.variants?.length ?? 0)} index={mapIndex} onChange={changeMap} />}>
        {preview ? <p role="status">{t('地图预览。紧张模式在地图 1 进行。', 'Map preview. Timed matches take place on Map 1.')}</p> : <div className="timed-arena-controls">
          <p role="status" className={result?.won ? 'win-message' : result || phase === 'failed' ? 'error-message' : undefined}>
            {status}
          </p>
          {clock && <TurnTimer clock={clock} locale={locale} />}
          {frame && policyStep && policyCursor.count > 0 && <PolicyPlayback step={policyStep} frame={frame} cursor={policyCursor} locale={locale} />}
          {phase === 'playing' && <div className="arena-manual-actions" role="group" aria-label={t('下一回合动作', 'Action for the next turn')}>
            {commands.map(command => <button key={command.action} type="button" className="subtle-button" aria-pressed={queued === command.action}
              onClick={() => send({ type: 'action', action: command.action, turn: snapshot.turn + 1 })}>
              <b aria-hidden="true">{command.icon}</b>{t(command.zh, command.en)}
            </button>)}
          </div>}
        </div>}
      </ArenaBoard>
      {!preview && review && <ChallengeFailureReview review={review} onRetry={resetMatch} />}
      {!preview && frame && <ArenaTurnEvents frame={frame} level={level} locale={locale} />}
      </>}
    </div>
    <CommandDesk locale={locale}>
      <div className="play-column">
        <section className="panel editor-panel timed-policy-panel">
          <div className="panel-heading"><h2><span className="bracket-icon" aria-hidden="true">{'{ }'}</span>{t('实时 Python 策略', 'Live Python policy')}</h2></div>
          <div className="editor-body">
            <label htmlFor="realtime-python" className="python-label">{dynamic ? 'decide(state)' : t('编写 decide(state)', 'Write decide(state)')}</label>
            <CodeField id="realtime-python" locale={locale} maxLength={12000} value={code} onChange={setCode} />
            {!preview && !observing && phase !== 'failed' && frame && policyStep?.source === code &&
              <ExecutionSource locale={locale} code={code} current={policyCursor.event ?? policyStep}
                personal={runModules.current} course={runCourse.current} />}
            <p className="timed-policy-note">{dynamic
              ? t('每回合执行一个动作。点按优先于策略，两者均无时原地等待。',
                'One action per turn. A button press overrides the policy. Sprout waits if neither supplies an action.')
              : t('每回合把最新的赛场交给策略。返回一个动作。没有策略或接管指令时，芽芽会原地等待。',
                'Your policy gets the latest arena each turn. Return one action. Sprout waits whenever there is no policy or button press.')}</p>
            <div className="api-list">{commands.map(({ action }) => <code key={action}>{JSON.stringify(action)}</code>)}</div>
            <CourseHelperPicker names={level.helpers} course={course} personal={personal} code={code} locale={locale} onChange={setCode} />
            {dynamic && <ArenaStateReference locale={locale} timed />}
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
          <p role="status" className={'timed-policy-status' + (policyFeedback ? ' error-message' : '')}>
            {policyFeedback ?? (policyPending ? t('正在检查策略…', 'Checking policy…') : policyActive ? t('策略已启用', 'Policy active') : t('尚未启用策略', 'No active policy'))}
          </p>
        </section>
        {level.hints.length > 0 && <details className="panel teaching-panel">
          <summary>{t('任务提示', 'Mission hints')}</summary><HintSteps hints={level.hints} locale={locale} />
        </details>}
      </div>
    </CommandDesk>
    <PlayToolbar locale={locale} trail={trail}>
      {observing ? <button type="button" className="primary-button" onClick={() => setObserving(false)}>{t('返回对局', 'Return to match')}</button> : <>
        {!preview && (canStart || phase === 'preparing' || phase === 'starting') && <button type="button" className="primary-button" disabled={!canStart} onClick={start}>
          {resume ? t('继续对局', 'Resume match') : t('开始', 'Start')}
        </button>}
        {!preview && phase === 'playing' && <button type="button" className="primary-button" onClick={() => send({ type: 'pause' })}>
          {t('暂停对局', 'Pause match')}
        </button>}
        {preview && <button type="button" className="primary-button" onClick={() => changeMap(0)}>{t('返回对局地图', 'Return to match map')}</button>}
        {!preview && active && <button type="button" className="subtle-button" disabled={policyPending || !code.trim()} onClick={() => applyPolicy(code)}>
          {policyActive ? t('替换策略', 'Replace policy') : t('应用策略', 'Apply policy')}
        </button>}
        {!preview && active && policyActive && <button type="button" className="subtle-button" disabled={policyPending} onClick={() => applyPolicy('')}>
          {t('停用策略', 'Disable policy')}
        </button>}
        {!preview && canReset && <button type="button" className="subtle-button" onClick={resetMatch}>{t('重新准备', 'Reset match')}</button>}
        {observeButton}
      </>}
    </PlayToolbar>
  </div>
}
