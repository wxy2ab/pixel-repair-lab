import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { AlgorithmLevel, AlgorithmResult, ArenaLevel, ArenaResult, PersonalAlgorithms } from '../shared/advanced'
import type { Json, Locale, RunIssue } from '../shared/types'
import { ARENA_TURN_MS, type RealtimeArenaCheckpoint } from '../engine/realtimeProtocol'
import { initialArenaSnapshot } from '../engine/snapshot'
import { mapScenarioAt } from '../shared/mapScenarios'
import MapScenarioPicker from './MapScenarioPicker'
import { ArenaBoard, ArenaStateReference, ArenaTurnEvents, arenaResultText, describeEvent } from './ArenaPanels'
import { arenaViewingDelay, firstArenaLine, useArenaActivities } from './arenaActivities'
import { ArenaObservationBoard } from './ArenaObservationBoard'
import { hasProgramCommands } from './MapObservation'
import { useLessonWorker, useReplayCursor } from './lessonTools'
import { ReplayControls } from './ReplayControls'
import { useClassroom, CommandDesk } from './Classroom'
import { DeviceWindow } from './DeviceWindow'
import { FunctionInspector } from './FunctionInspector'
import { AlgorithmRunToolbar, type AlgorithmDebugCursor } from './AlgorithmRunToolbar'
import { ExecutionSource } from './ExecutionSource'
import { PlayToolbar, useTrailPreference } from './PlayToolbar'
import { RealtimeArena } from './RealtimeArena'
import { CourseHelperPicker } from './CourseHelperPicker'
import { ChallengeFailureReview, type ChallengeReviewData } from './ChallengeFailureReview'
import { arenaFailureReview } from './challengeGameReview'
import { arenaGoalReplayEvidence, goalReplayIssue } from './goalReplayEvidence'
import { arenaReplayCase, arenaReplayLine, captureArenaReplayInput, type ArenaReplayInput, type ArenaReplayProgress } from './arenaReplayProgress'
import { executionLine } from './executionLine'
import type { AlgorithmChallengeDraft, ArenaChallengeDraft } from './challengeDraft'
import type { ChallengeRunHandlers } from './challengeScore'
import { runIssueText, tr } from './text'

type PlayProps = { locale: Locale; onComplete: () => void; onMistake?: () => void }

function PracticeEditor<Lesson extends AlgorithmLevel | ArenaLevel>({
  level, locale, code, setCode, pending, children, personal, inputRef, toolbar, execution,
}: {
  level: Lesson; locale: Locale; code: string; setCode: (value: string) => void; pending: boolean;
  children?: ReactNode; personal?: PersonalAlgorithms;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  toolbar?: ReactNode; execution?: ReactNode;
}) {
  const localField = useRef<HTMLTextAreaElement>(null)
  const field = inputRef ?? localField
  const focused = useRef(false)
  const t = (zh: string, en: string) => tr(locale, zh, en)

  function insert(snippet: string) {
    const input = field.current
    if (!input) return
    const append = level.kind === 'algorithm' && !focused.current
    const selectionStart = append ? code.length : input.selectionStart
    const selectionEnd = append ? code.length : input.selectionEnd
    const before = append && code && !code.endsWith('\n') ? '\n' : ''
    const text = before + snippet + (snippet.endsWith('\n') ? '' : '\n')
    setCode(code.slice(0, selectionStart) + text + code.slice(selectionEnd))
    window.requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(selectionStart + text.length, selectionStart + text.length)
    })
  }

  const saved = Object.keys(personal ?? {}).filter(name => !level.helpers?.includes(name))
  return <section className="panel editor-panel advanced-editor">
    <div className="panel-heading"><h2><span className="bracket-icon" aria-hidden="true">{'{ }'}</span>{t('程序控制台', 'Program console')}</h2></div>
    <div className="editor-body">
      {execution}
      <label htmlFor="advanced-python" className="python-label">{t('编写 Python', 'Write Python')}</label>
      <textarea id="advanced-python" ref={field} className="python-input" spellCheck={false} autoCapitalize="off" autoComplete="off" maxLength={12000}
        disabled={pending} value={code} onFocus={() => { focused.current = true }} onChange={event => setCode(event.target.value)} />
      <div className="demo-picker">
        {level.snippets.map((snippet, index) => <button type="button" className="subtle-button" key={index} disabled={pending} onClick={() => insert(snippet.code)}>
          {snippet.label[locale]}
        </button>)}
        {level.kind === 'arena' && saved.map(name => <button type="button" className="subtle-button" key={name} disabled={pending}
          onClick={() => insert('from my_algorithms import ' + name)}>{t('我的算法', 'My algorithm')} · {name}</button>)}
      </div>
      {children}
    </div>
    <div className="editor-footer">
      <button type="button" className="subtle-button" disabled={pending || code === level.starterCode} onClick={() => setCode(level.starterCode)}>
        {t('恢复起始代码', 'Restore starter code')}
      </button>
    </div>
    {toolbar}
  </section>
}

function sameReturnShape(actual: Json | undefined, expected: Json): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length
      && expected.every((value, index) => sameReturnShape(actual[index], value))
  }
  if (expected === null || typeof expected !== 'object') {
    return expected === null ? actual === null : typeof actual === typeof expected
  }
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false
  const fields = Object.keys(expected)
  return fields.length === Object.keys(actual).length
    && fields.every(field => Object.hasOwn(actual, field) && sameReturnShape(actual[field], expected[field]))
}

function algorithmFailureReview(level: AlgorithmLevel, result: AlgorithmResult): ChallengeReviewData | undefined {
  if (result.won) return
  const failed = result.cases.flatMap((outcome, index) =>
    !outcome.passed && outcome.issue?.code !== 'internal' ? [{ index, outcome }] : [])
  const first = failed[0]
  if (!first) {
    if (result.issue?.code !== 'limit') return
    return {
      location: { zh: '用例验证中止', en: 'Case checks stopped' },
      gaps: [{ zh: runIssueText('zh', result.issue), en: runIssueText('en', result.issue) }],
    }
  }

  const passed = result.cases.filter(outcome => outcome.passed).length
  const total = level.cases.length
  const remaining = total - passed
  const counts = {
    zh: `已通过 ${passed}/${total} 组用例，还差 ${remaining} 组。`,
    en: `Passed ${passed} of ${total} cases. ${remaining} ${remaining === 1 ? 'case still needs' : 'cases still need'} to pass.`,
  }
  const caseNumber = first.index + 1
  const issue = first.outcome.issue
  const expected = level.cases[first.index].expected
  const difference = issue
    ? { zh: runIssueText('zh', issue), en: runIssueText('en', issue) }
    : sameReturnShape(first.outcome.actual, expected)
      ? { zh: '返回值的格式符合要求。检查里面的值和顺序。', en: 'The return format matches. Check the values and their order.' }
      : { zh: '返回值的格式不符。检查值的类型、列表长度或字典字段。', en: 'The return format differs. Check the value type, list length, or dictionary fields.' }
  const numbers = failed.map(({ index }) => index + 1)
  return {
    location: {
      zh: `第 ${numbers.join('、')} 组用例未通过`,
      en: `${numbers.length === 1 ? 'Case' : 'Cases'} ${numbers.join(', ')} failed`,
    },
    gaps: [counts, { zh: `用例 ${caseNumber} · ${difference.zh}`, en: `Case ${caseNumber} · ${difference.en}` }],
    topics: issue?.code === 'missingKey' ? [{ unit: 'structures', topic: 'dictionaries' }] : undefined,
  }
}

export function AlgorithmPractice({ level, locale, onComplete, onMistake, personal, course, onSave, challenge, initialDraft, onDraftChange }: PlayProps & {
  level: AlgorithmLevel; personal: PersonalAlgorithms; course: PersonalAlgorithms; onSave?: (name: string, source: string) => void;
  challenge?: ChallengeRunHandlers;
  initialDraft?: AlgorithmChallengeDraft; onDraftChange?: (draft: AlgorithmChallengeDraft) => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const classroom = useClassroom()
  const [code, setCode] = useState(() => initialDraft?.source ?? level.starterCode)
  const [result, setResult] = useState<AlgorithmResult>()
  const [verified, setVerified] = useState<string>()
  const [saved, setSaved] = useState(false)
  const editor = useRef<HTMLTextAreaElement>(null)
  const checks = useRef(0)
  const worker = useLessonWorker<AlgorithmResult>()
  const passing = result?.cases.filter(candidate => candidate.passed).length ?? 0
  const review = result && algorithmFailureReview(level, result)
  const [caseIndex, setCaseIndex] = useState(0)
  const [debug, setDebug] = useState<AlgorithmDebugCursor>()
  const current = debug?.run.steps[debug.position]
  const next = debug?.run.steps[debug.position + 1]
  const debugOutcome = debug && !next ? debug.run.outcome : undefined
  const trail = useTrailPreference()

  function selectCase(index: number) {
    if (index === caseIndex) return
    setCaseIndex(index)
    setDebug(undefined)
  }

  function retry() {
    challenge?.onStart()
    setResult(undefined)
    setDebug(undefined)
    editor.current?.focus()
  }

  function updateCode(value: string) {
    challenge?.onStart()
    setCode(value)
    setResult(undefined)
    setDebug(undefined)
    onDraftChange?.({ kind: 'algorithm', source: value })
    setSaved(false)
  }

  function run() {
    challenge?.onStart()
    setResult(undefined)
    setDebug(undefined)
    setVerified(undefined)
    setSaved(false)
    worker.run(() => new Worker(new URL('../engine/advanced.worker.ts', import.meta.url), { type: 'module' }), { level, source: code, personal, course },
      outcome => {
        setResult(outcome)
        if (challenge && outcome.cases.some(candidate => candidate.issue?.code !== 'internal')) checks.current++
        const cases = challenge ? outcome.cases.flatMap((test, index) => test.issue?.code === 'internal'
          ? [] : [{ index: index + 1, passed: test.passed }]) : undefined
        if (!outcome.won) {
          if (outcome.cases.some(test => !test.passed && test.issue?.code !== 'internal')) {
            onMistake?.()
            challenge?.onFailure({ kind: 'algorithm', passed: outcome.cases.filter(test => test.passed).length,
              total: level.cases.length, checks: checks.current }, { ...goalReplayIssue(algorithmFailureReview(level, outcome)), cases })
          }
          return
        }
        setVerified(code)
        onComplete()
        if (challenge) {
          const score = { kind: 'algorithm' as const, passed: outcome.cases.length, total: level.cases.length, checks: checks.current }
          checks.current = 0
          challenge.onWin(score, retry, { cases })
        }
      }, issue => setResult({ won: false, cases: [], issue }))
  }

  const programEditor = <PracticeEditor level={level} locale={locale} code={code} setCode={updateCode}
    pending={worker.pending} inputRef={editor} execution={<ExecutionSource locale={locale} code={code} personal={personal} course={course}
      current={current} next={next} />}>
    <CourseHelperPicker names={level.helpers} course={course} personal={personal} code={code} locale={locale}
      disabled={worker.pending} onChange={updateCode} />
  </PracticeEditor>
  const feedback = <section className="panel teaching-panel">
    <h2>{t('运行反馈', 'Run feedback')}</h2>
    <p role="status" className={result?.won ? 'win-message' : result?.issue ? 'error-message' : ''}>
      {worker.pending ? t('正在检查用例…', 'Checking cases…') :
        result?.issue ? runIssueText(locale, result.issue) :
          result ? passing + '/' + level.cases.length + ' ' + t('个用例通过', 'cases passed') :
            t('运行后查看每组输入和实际结果。', 'Run to compare results for each input.')}
    </p>
    {review && <ChallengeFailureReview review={review} onRetry={retry} />}
    {level.hints.length > 0 && <details><summary>{t('任务提示', 'Mission hints')}</summary>
      {level.hints.map((hint, index) => <p key={index}>{hint[locale]}</p>)}
    </details>}
    {onSave && result?.won && code === verified && <button type="button" className="primary-button" disabled={saved || personal[level.functionName] === verified}
      onClick={() => { onSave(level.functionName, code); setSaved(true) }}>
      {saved || personal[level.functionName] === verified ? t('已保存到我的算法', 'Saved to My algorithms')
        : Object.hasOwn(personal, level.functionName) ? t('替换我的算法', 'Replace my algorithm') : t('保存到我的算法', 'Save to My algorithms')}
    </button>}
  </section>
  const toolbar = <AlgorithmRunToolbar key={caseIndex + ':' + code} level={level} code={code}
    index={caseIndex} personal={personal} course={course} locale={locale} pending={worker.pending}
    onRun={run} onStop={worker.stop} cursor={debug} onCursor={setDebug} trail={level.pathGrading ? trail : undefined} />
  const inspector = <FunctionInspector level={level} locale={locale} result={result} index={caseIndex}
    selectCase={selectCase} checkedOverride={debugOutcome} showTrail={trail.visible} stepping={Boolean(debug)} current={current}
    pending={worker.pending} previous={debug?.run.steps[debug.position - 1]} />
  if (classroom) return <><DeviceWindow locale={locale} title={t('Python 函数工作区', 'Python function workspace')} className="function-device">
    <div className="function-workspace">
      {programEditor}
      {inspector}
    </div>
    {feedback}
  </DeviceWindow>{toolbar}</>
  return <><div className="lesson-layout">
    {level.pathGrading ? inspector : <section className="panel teaching-panel">
      <h2>{t('验证用例', 'Test cases')}</h2>
      <p><code>{level.functionName}()</code></p>
      <ol className="function-cases">{level.cases.map((test, index) => {
        const checked = (index === caseIndex && debugOutcome) || result?.cases[index]
        return <li key={index}>
          <button type="button" className="subtle-button" aria-pressed={index === caseIndex} onClick={() => selectCase(index)}>{t('用例', 'Case')} {index + 1}</button>
          <pre className="sample-code">{JSON.stringify(test.args, null, 1)}</pre>
          <div>{t('预期', 'Expected')} <code>{JSON.stringify(test.expected)}</code></div>
          {checked && <div className={checked.passed ? 'win-message' : 'error-message'}>
            {checked.issue ? runIssueText(locale, checked.issue) : (checked.passed ? t('通过', 'Passed') : t('得到', 'Got')) + ' ' + JSON.stringify(checked.actual)}
          </div>}
        </li>
      })}</ol>
    </section>}
    <div className="play-column">{programEditor}{feedback}</div>
  </div>{toolbar}</>
}

type ArenaProps = PlayProps & {
  level: ArenaLevel; personal: PersonalAlgorithms; course: PersonalAlgorithms; challenge?: ChallengeRunHandlers;
  initialArenaMode?: 'relaxed' | 'timed'
}

export function ArenaPlay({ initialDraft, onDraftChange, initialTimedCheckpoint, onTimedCheckpointChange,
  initialReplayProgress, onReplayProgressChange, ...props }: ArenaProps & {
  initialDraft?: ArenaChallengeDraft; onDraftChange?: (draft: ArenaChallengeDraft) => void;
  initialTimedCheckpoint?: RealtimeArenaCheckpoint; onTimedCheckpointChange?: (value?: RealtimeArenaCheckpoint) => void;
  initialReplayProgress?: ArenaReplayProgress; onReplayProgressChange?: (value?: ArenaReplayProgress) => void;
}) {
  const { level, locale, challenge, initialArenaMode } = props
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [draft, setDraft] = useState(() => ({
    mode: initialArenaMode ?? initialDraft?.mode ?? 'relaxed',
    source: initialDraft?.source ?? level.starterCode,
    policy: initialDraft?.policy ?? 'def decide(state):\n    return "wait"\n',
  }))
  const timedCheckpoint = useRef(initialTimedCheckpoint)
  const replayProgress = useRef(initialReplayProgress)
  const timed = draft.mode === 'timed'

  function updateDraft(next: typeof draft) {
    setDraft(next)
    onDraftChange?.({ kind: 'arena', ...next })
  }

  function changePace(mode: ArenaChallengeDraft['mode']) {
    if (mode === draft.mode) return
    challenge?.onStart()
    updateDraft({ ...draft, mode })
  }
  const secondsPerTurn = ARENA_TURN_MS / 1000
  const paceRule = level.shifts?.length
    ? timed
      ? t(`每 ${secondsPerTurn} 秒结算一回合。可点按或启用 Python 策略。`, `Each turn takes ${secondsPerTurn} seconds. Play by clicking or enabling a Python policy.`)
      : t('运行 Python，按回合回放对抗。', 'Run Python and replay the match turn by turn.')
    : timed
      ? t('按下开始后，对手每隔 1.8 秒行动。可让 Python 选择下一步，也可用按钮接管一回合。', 'Once you press Start, rivals act every 1.8 seconds. Let Python choose each move, or override one turn with a button.')
      : t('先编好程序，运行后逐回合查看双方动作。', 'Write your program first, then run it and inspect each turn in the replay.')

  return <>
    <CommandDesk locale={locale} title={t('对局设置', 'Match settings')}>
      <section className="panel arena-pace">
        <div className="arena-pace-heading">
          <h2>{t('对抗节奏', 'Arena pace')}</h2>
          <div className="segmented" role="group" aria-label={t('选择对抗节奏', 'Choose arena pace')}>
            <button type="button" aria-pressed={!timed} onClick={() => changePace('relaxed')}>{t('从容', 'Relaxed')}</button>
            <button type="button" aria-pressed={timed} onClick={() => changePace('timed')}>{t('紧张', 'Timed')}</button>
          </div>
        </div>
        <p>{paceRule}</p>
      </section>
    </CommandDesk>
    {timed
      ? <RealtimeArena {...props} code={draft.policy} setCode={policy => updateDraft({ ...draft, policy })}
        initialCheckpoint={timedCheckpoint.current} onCheckpointChange={onTimedCheckpointChange && (checkpoint => {
          timedCheckpoint.current = checkpoint
          onTimedCheckpointChange(checkpoint)
        })} />
      : <RelaxedArena {...props} code={draft.source} setCode={source => updateDraft({ ...draft, source })}
        initialReplayProgress={replayProgress.current} onReplayProgressChange={onReplayProgressChange && (progress => {
          replayProgress.current = progress
          onReplayProgressChange(progress)
        })} />}
  </>
}

function RelaxedArena({ level, locale, onComplete, onMistake, personal, course, code, setCode, challenge,
  initialReplayProgress, onReplayProgressChange }: ArenaProps & {
  code: string; setCode: (code: string) => void;
  initialReplayProgress?: ArenaReplayProgress; onReplayProgressChange?: (value?: ArenaReplayProgress) => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [session, setSession] = useState<{ result: ArenaResult; runMap: number; source: string; input?: ArenaReplayInput }>()
  const [observing, setObserving] = useState(false)
  const trail = useTrailPreference()
  const [stepping, setStepping] = useState(false)
  const pendingStepFailure = useRef<ArenaResult | undefined>(undefined)
  const [mapIndex, setMapIndex] = useState(0)
  const viewedMap = useRef(0)
  const mapSteps = useRef(new Map<number, number>())
  const [savedProgress] = useState(() => initialReplayProgress)
  const silentStop = useRef<{ result: ArenaResult; map: number; step: number } | undefined>(undefined)
  const soughtTurn = useRef<{ result: ArenaResult; map: number; step: number } | undefined>(undefined)
  const [failure, setFailure] = useState<RunIssue>()
  const editor = useRef<HTMLTextAreaElement>(null)
  const creditedResult = useRef<ArenaResult | undefined>(undefined)
  const closedProgress = useRef<ArenaResult | undefined>(undefined)
  const publishProgress = useRef(onReplayProgressChange)
  const worker = useLessonWorker<ArenaResult>()
  const runWorker = worker.run
  const result = session?.result
  const shownLevel = mapScenarioAt(level, mapIndex)
  const replay = arenaReplayCase(result, mapIndex)
  const { frames, issue: caseIssue, count } = replay
  const cursor = useReplayCursor(count, step => arenaViewingDelay(frames?.[step - 1]))
  const restartCursor = cursor.restart
  const turnFrame = frames?.[cursor.step - 1]
  const quiet = silentStop.current
  const suppressed = !!quiet && quiet.result === result && quiet.map === mapIndex && quiet.step === cursor.step
  const sought = soughtTurn.current
  const turnOnly = !!sought && sought.result === result && sought.map === mapIndex && sought.step === cursor.step
  const trailing = cursor.step === count ? result?.trailingProgram?.[mapIndex] : undefined
  const errorLine = cursor.step === count && caseIssue?.line ? { line: caseIssue.line, sourceName: caseIssue.sourceName } : undefined
  const program = useArenaActivities(turnFrame, trailing, suppressed || observing, errorLine, stepping, turnOnly)
  const { beat } = program
  const shownTurns = cursor.step - Number(Boolean(beat?.beforeTurn))
  const previous = frames?.[Math.min(shownTurns, frames.length) - 1]
  const snapshot = previous?.state ?? initialArenaSnapshot(shownLevel)
  const route = trail.visible && frames ? [shownLevel.start, ...frames.slice(0, shownTurns).map(frame => frame.state.actors[0])] : undefined
  useEffect(() => { if (!suppressed) silentStop.current = undefined }, [suppressed, result, mapIndex, cursor.step])
  useEffect(() => { if (!turnOnly) soughtTurn.current = undefined }, [turnOnly, result, mapIndex, cursor.step])
  const atEnd = Boolean(frames && cursor.step === count && !program.more)
  const finishRun = atEnd && (mapIndex === 0 || mapIndex === session?.runMap)
  const mainStep = mapIndex === 0 ? shownTurns : mapSteps.current.get(0) ?? 0
  const review = result && (atEnd || !frames) && !result.won ? arenaFailureReview(result) : undefined
  const dynamic = Boolean(level.shifts?.length)
  const latestShift = frames?.findLast((frame, index) => index < shownTurns && frame.shift)?.shift
  const hasCommands = hasProgramCommands(code)
  const currentSession = session?.source === code
  const showExecution = currentSession && !observing
  const replayPlaying = cursor.playing || (currentSession && !stepping && program.more)
  const current = showExecution ? beat?.line ?? arenaReplayLine(replay, cursor.step) : undefined
  function nextInstruction() {
    if (!showExecution) return
    if (program.nextBeat) return program.nextBeat.line
    const nextFrame = frames?.[cursor.step]
    if (nextFrame) return firstArenaLine(nextFrame)
    const firstTrailing = cursor.step + 1 === count ? result?.trailingProgram?.[mapIndex]?.[0] : undefined
    return firstTrailing ? firstTrailing.kind === 'scan' ? firstTrailing.scan : firstTrailing : arenaReplayLine(replay, cursor.step + 1)
  }
  const next = nextInstruction()
  const runPersonal = session?.input?.personal ?? personal
  const runCourse = session?.input?.course ?? course
  const playerEvent = previous?.events.find(event => event.actorId === 'player')
  const actionLabel = beat?.flow && current ? t(`第 ${snapshot.turn} 回合 · 第 ${current.line} 行`, `Turn ${snapshot.turn} · Line ${current.line}`)
    : beat?.scan ? t(`第 ${beat.scan.value.turn} 回合 · 读取局势`, `Turn ${beat.scan.value.turn} · Scanned the board`) : previous && playerEvent && [
    t(`第 ${snapshot.turn} 回合`, `Turn ${snapshot.turn}`),
    previous.line > 0 && t(`第 ${previous.line} 行`, `Line ${previous.line}`),
    describeEvent(playerEvent, locale, dynamic),
  ].filter(Boolean).join(' · ')
  const stepDescription = failure ? runIssueText(locale, failure) : stepping && currentSession
    ? atEnd && caseIssue ? t(`第 ${snapshot.turn} 回合`, `Turn ${snapshot.turn}`) + ' · ' + runIssueText(locale, caseIssue)
      : [actionLabel, (atEnd || !frames) && result && arenaResultText(result, locale, dynamic)].filter(Boolean).join(' · ') : undefined
  const stepSource = stepping && current ? executionLine(current.line, current.sourceName, code, runPersonal, runCourse) : undefined
  const stepStatus = stepDescription && <>{stepDescription}{stepSource && <code className="arena-step-source" title={stepSource}>{stepSource}</code>}</>

  function changeMap(index: number) {
    mapSteps.current.set(mapIndex, shownTurns)
    viewedMap.current = index
    setMapIndex(index)
    const inspectFinal = atEnd && index !== 0 && index !== session?.runMap
    const start = mapSteps.current.get(index) ?? (inspectFinal ? arenaReplayCase(result, index).count : 0)
    if (result) silentStop.current = { result, map: index, step: start }
    restartCursor(false, start)
  }

  function retry() {
    setObserving(false)
    setStepping(false)
    pendingStepFailure.current = undefined
    challenge?.onStart()
    publishProgress.current?.()
    setSession(undefined)
    setFailure(undefined)
    mapSteps.current.clear()
    cursor.restart(false)
    editor.current?.focus()
  }

  useLayoutEffect(() => { publishProgress.current = onReplayProgressChange }, [onReplayProgressChange])

  useEffect(() => {
    if (!savedProgress) return
    const { step, ...input } = savedProgress
    runWorker(createArenaReplayWorker, { level, ...input }, outcome => {
      if (step >= arenaReplayCase(outcome, 0).count) {
        publishProgress.current?.()
        return
      }
      mapSteps.current.set(0, step)
      silentStop.current = { result: outcome, map: 0, step }
      restartCursor(false, viewedMap.current === 0 ? step : 0)
      setSession({ result: outcome, runMap: 0, source: input.source, input })
    }, issue => {
      publishProgress.current?.()
      setFailure(issue)
    })
  }, [level, restartCursor, runWorker, savedProgress])

  useLayoutEffect(() => {
    if (!session?.input || closedProgress.current === session.result) return
    const mainCount = arenaReplayCase(session.result, 0).count
    if (finishRun || !mainCount) {
      closedProgress.current = session.result
      publishProgress.current?.()
    } else if (mainStep < mainCount) {
      // Existing unfinished matches describe the main board, including while a variant is inspected.
      publishProgress.current?.({ ...session.input, step: mainStep })
    }
  }, [finishRun, mainStep, session])

  useEffect(() => {
    if (result?.won && finishRun && creditedResult.current !== result) {
      creditedResult.current = result
      onComplete()
      challenge?.onWin({
        kind: 'arena', mode: 'relaxed', goal: level.objective.kind,
        turns: result.final.turn, score: result.final.actors[0].score,
        passed: result.passedCases, total: result.totalCases,
      }, retry, arenaGoalReplayEvidence(result))
    }
  }, [challenge, finishRun, level.objective.kind, onComplete, result, retry])

  function reportFailure(outcome: ArenaResult) {
    onMistake?.()
    challenge?.onFailure({ kind: 'arena', mode: 'relaxed', goal: level.objective.kind,
      turns: outcome.final.turn, score: outcome.final.actors[0].score,
      passed: outcome.passedCases, total: outcome.totalCases }, arenaGoalReplayEvidence(outcome))
  }

  useEffect(() => {
    if (result && pendingStepFailure.current === result && (finishRun || !frames)) {
      pendingStepFailure.current = undefined
      reportFailure(result)
    }
  }, [result, finishRun, frames])

  function run(singleStep = false) {
    setObserving(false)
    setStepping(singleStep)
    pendingStepFailure.current = undefined
    challenge?.onStart()
    publishProgress.current?.()
    setSession(undefined)
    setFailure(undefined)
    mapSteps.current.clear()
    cursor.restart(false)
    const input = onReplayProgressChange ? captureArenaReplayInput(code, personal, course) : undefined
    worker.run(createArenaReplayWorker, { level, source: code, personal, course }, outcome => {
      setSession({ result: outcome, runMap: mapIndex, source: code, input })
      const sameMap = viewedMap.current === mapIndex
      const firstStep = sameMap && singleStep && arenaReplayCase(outcome, mapIndex).count > 0 ? 1 : 0
      cursor.restart(sameMap && !singleStep, firstStep)
      if (!outcome.won && outcome.issue?.code !== 'internal') {
        if (singleStep) pendingStepFailure.current = outcome
        else reportFailure(outcome)
      }
    }, setFailure)
  }

  function stepOnce() {
    if (!currentSession) return run(true)
    setStepping(true)
    if (program.advance()) { cursor.seek(cursor.step); return }
    cursor.seek(cursor.step + 1)
  }

  function seekTurn(step: number) {
    if (result) soughtTurn.current = { result, map: mapIndex, step }
    cursor.seek(step)
  }

  function runOrContinue() {
    if (currentSession && replayPlaying) {
      setStepping(true)
      cursor.seek(cursor.step)
    } else if (currentSession && frames && stepping && !atEnd) {
      setStepping(false)
      cursor.restart(true, cursor.step)
    } else run()
  }

  const toolbar = <PlayToolbar locale={locale} trail={trail} status={!observing && stepStatus}>
    {observing ? <button type="button" className="primary-button" onClick={() => setObserving(false)}>{t('返回程序', 'Return to program')}</button>
      : worker.pending ? <button type="button" className="primary-button" onClick={worker.stop}>{t('停止', 'Stop')}</button> : <>
        {hasCommands && <button type="button" className="primary-button play-toolbar__run" onClick={runOrContinue}>
          {currentSession && replayPlaying ? t('暂停运行', 'Pause run') : t('运行', 'Run')}
        </button>}
        {hasCommands && <button type="button" className="subtle-button play-toolbar__step" disabled={currentSession && (atEnd || !frames)} onClick={stepOnce}>
          {t('单步执行', 'Step once')}
        </button>}
        <button type="button" className={hasCommands ? 'subtle-button' : 'primary-button'} data-testid="map-observe-start"
          onClick={() => {
            if (result) silentStop.current = { result, map: mapIndex, step: shownTurns }
            cursor.seek(shownTurns)
            setObserving(true)
          }}>{t('观察地图', 'Observe map')}</button>
      </>}
  </PlayToolbar>

  return <div className="lesson-layout">
    <div className="play-column">
      {observing ? <ArenaObservationBoard level={level} locale={locale} initialMap={mapIndex} onExit={() => setObserving(false)} /> : <>
      <ArenaBoard level={shownLevel} locale={locale} snapshot={snapshot} latestShift={latestShift} finished={atEnd} trail={route}
        activity={beat?.activity} scan={beat?.scan ?? (beat?.beforeTurn ? undefined : turnFrame?.scan)}
        mapPicker={<MapScenarioPicker locale={locale} index={mapIndex} count={1 + (level.variants?.length ?? 0)} onChange={changeMap} />}>
        {result && result.totalCases > 1 && <p data-testid="arena-map-result">{!frames
          ? t('前面的地图未通过，本次还没检查这张地图。', 'An earlier map failed, so this map was not checked in this run.')
          : mapIndex < result.passedCases ? t('这张地图已通过。', 'This map passed.') : t('这张地图未通过。', 'This map did not pass.')}</p>}
        {program.shortened && <button className="subtle-button" type="button" onClick={() => {
          setStepping(true)
          cursor.seek(cursor.step)
          program.rewind()
        }}>{t('展开本回合的程序步骤', 'Step through this turn’s calculation')}</button>}
        {result?.programTruncated?.[mapIndex] && atEnd && <p>{t('这次运算较长，程序动画只记录了前段。所有回合均已执行。',
          'This calculation was long. The replay shows its first program steps and every match turn.')}</p>}
        <ReplayControls cursor={{ ...cursor, seek: seekTurn, toggle: () => {
          setStepping(cursor.playing)
          cursor.toggle()
        } }} count={count} locale={locale} />
      </ArenaBoard>
      {previous && <ArenaTurnEvents frame={previous} level={shownLevel} locale={locale} />}
      </>}
    </div>
    <CommandDesk locale={locale}>
      <div className="play-column">
        <PracticeEditor level={level} locale={locale} code={code} setCode={setCode} pending={worker.pending}
          execution={<ExecutionSource locale={locale} code={code} current={current} next={next} personal={runPersonal} course={runCourse} />}
          personal={personal} inputRef={editor} toolbar={toolbar}>
          <CourseHelperPicker names={level.helpers} course={course} personal={personal} code={code} locale={locale}
            disabled={worker.pending} onChange={setCode} />
          <div className="api-list">{['scan', 'move', 'pick', 'wait'].map(api => <code key={api}>{api}()</code>)}</div>
          {dynamic && <ArenaStateReference locale={locale} />}
        </PracticeEditor>
        {!observing && <section className="panel teaching-panel">
          <h2>{t('回合结果', 'Arena result')}</h2>
          <p role="status" className={atEnd && result ? result.won ? 'win-message' : 'error-message' : failure ? 'error-message' : ''}>
            {failure ? runIssueText(locale, failure) : result && (atEnd || !frames) ? arenaResultText(result, locale, dynamic) :
              result ? replayPlaying ? t('正在回放。', 'Replay in progress.') : t('回放已暂停。', 'Replay paused.') :
                dynamic ? t('尚未运行。', 'Ready to run.') :
                  t('运行程序，看看你的机器人怎样应对多个对手。', 'Run your code to see how your robot handles several rivals.')}
          </p>
          {result && (atEnd || !frames) && result.totalCases > 1 && <p>{t('场景通过', 'Scenarios passed')} {result.passedCases}/{result.totalCases}</p>}
          {review && <ChallengeFailureReview review={review} onRetry={retry} />}
          {level.hints.length > 0 && <details><summary>{t('任务提示', 'Mission hints')}</summary>{level.hints.map((hint, index) => <p key={index}>{hint[locale]}</p>)}</details>}
        </section>}
      </div>
    </CommandDesk>
  </div>
}

function createArenaReplayWorker() {
  return new Worker(new URL('../engine/advanced.worker.ts', import.meta.url), { type: 'module' })
}
