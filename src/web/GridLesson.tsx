import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compileCards } from '../shared/cards'
import { mapScenarioAt } from '../shared/mapScenarios'
import type { PersonalAlgorithms } from '../shared/advanced'
import type { GridLevel, GridMapRun, Locale, RunResult } from '../shared/types'
import { Board } from './Board'
import { useClassroom } from './Classroom'
import { DeviceWindow } from './DeviceWindow'
import { GridReadout } from './GridReadout'
import { GridHardwareBench, gridBenchKind } from './GridHardwareBench'
import MapScenarioPicker from './MapScenarioPicker'
import { hasProgramCommands, MapObservationControls, useMapObservation } from './MapObservation'
import { gridObservationFrames, gridObservationTurns, initialSnapshot } from '../engine/snapshot'
import { ProgramEditor } from './ProgramEditor'
import { CourseHelperPicker } from './CourseHelperPicker'
import { ChallengeFailureReview } from './ChallengeFailureReview'
import type { GridChallengeDraft } from './challengeDraft'
import { gridFailureReview } from './challengeGameReview'
import { gridGoalReplayEvidence } from './goalReplayEvidence'
import type { ChallengeRunHandlers } from './challengeScore'
import { runIssueText, tr } from './text'
import { PlayToolbar, useTrailPreference } from './PlayToolbar'
import { gridTrailAt } from './playTrail'
import { executionLine } from './executionLine'
import { ExecutionSource } from './ExecutionSource'
import { InlineExecutionSource } from './InlineExecutionSource'
import { actionViewingDelay, gridPlayback, gridStepActivity } from './gridExecution'

type Phase = 'idle' | 'running' | 'replaying' | 'paused' | 'done'
type GridPlayback = RunResult & { inspected?: { index: number; run: GridMapRun } }

function currentRun(result: GridPlayback | undefined, index: number) {
  if (!result) return
  return result.mapRuns?.[index] ?? (index === 0 ? result : result.inspected?.index === index ? result.inspected.run : undefined)
}

export function GridLesson({ level, locale, onWin, onMistake, personal = {}, course = {}, challenge, initialDraft, onDraftChange }: {
  level: GridLevel; locale: Locale; onWin: () => void; onMistake?: () => void; personal?: PersonalAlgorithms; course?: PersonalAlgorithms;
  challenge?: ChallengeRunHandlers;
  initialDraft?: GridChallengeDraft; onDraftChange?: (draft: GridChallengeDraft) => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const classroom = useClassroom()
  const [draft, setDraft] = useState<GridChallengeDraft>(() => initialDraft ?? { kind: 'grid', mode: 'cards', cards: [] })
  const { mode, cards, source: typedCode } = draft
  const [tutorial, setTutorial] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<GridPlayback>()
  const [mapIndex, setMapIndex] = useState(0)
  const [frameIndex, setFrameIndex] = useState(-1)
  const worker = useRef<Worker | null>(null)
  const workerTimeout = useRef<number | undefined>(undefined)
  const creditedResult = useRef<RunResult | undefined>(undefined)
  const editor = useRef<HTMLElement>(null)
  const trail = useTrailPreference()
  const { source: generated, linePaths } = useMemo(() => compileCards(level.cards, cards), [level.cards, cards])
  const activeCode = mode === 'cards' ? generated : typedCode ?? ''
  const tutorialStep = level.tutorial?.[tutorial]
  const mapCount = 1 + (level.variants?.length ?? 0)
  const hasCommands = hasProgramCommands(activeCode)
  const canObserve = mapCount > 1 || gridObservationTurns(level) > 0
  const observeMap = useCallback((index: number) => gridObservationFrames(mapScenarioAt(level, index)), [level])
  const observation = useMapObservation(mapCount, observeMap)
  const exitObservation = observation.exit
  const shownMap = observation.active ? observation.mapIndex : mapIndex
  const scenario = mapScenarioAt(level, shownMap)
  const mapRun = observation.active ? undefined : currentRun(result, mapIndex)
  const playback = useMemo(() => gridPlayback(mapRun), [mapRun])
  const lastStep = playback.length - 1
  const playbackIndex = phase === 'done' ? lastStep : frameIndex
  const currentStep = playback[playbackIndex]
  const current = currentStep?.position, next = playback[playbackIndex + 1]?.position
  const mainLine = current?.sourceName && current.sourceName !== 'main.py' ? undefined : current?.line
  const nextMainLine = next?.sourceName && next.sourceName !== 'main.py' ? undefined : next?.line
  const shownFrame = currentStep?.frameIndex ?? -1
  const frame = mapRun?.frames[shownFrame]
  const runSnapshot = phase === 'done' ? mapRun?.final : frame?.state
  const snapshot = (observation.active ? observation.frame : runSnapshot) ?? initialSnapshot(scenario)
  const bench = classroom && gridBenchKind(level.unit?.id, scenario)
  const displayedAction = currentStep?.action
  const observedHazard = observation.active && snapshot.devices?.hazards.find(cell => cell.x === snapshot.player.x && cell.y === snapshot.player.y)
  const disabled = phase === 'running' || phase === 'replaying'
  const review = !observation.active && phase === 'done' && result && !result.won ? gridFailureReview(result) : undefined

  function updateDraft(changes: Partial<Omit<GridChallengeDraft, 'kind'>>) {
    if (phase === 'paused' || phase === 'done') reset()
    else if (observation.active) exitObservation()
    const next = { ...draft, ...changes }
    setDraft(next)
    onDraftChange?.(next)
  }

  useEffect(() => () => {
    worker.current?.terminate()
    window.clearTimeout(workerTimeout.current)
  }, [])

  useEffect(() => {
    if (phase !== 'replaying') return
    if (lastStep < 0) {
      setPhase('done')
      return
    }
    const delay = actionViewingDelay(currentStep?.flow?.kind ?? displayedAction?.action, lastStep + 1) ?? Math.min(330, Math.max(65, 4400 / (lastStep + 1)))
    const timer = window.setTimeout(() => {
      if (frameIndex < lastStep) setFrameIndex(frameIndex + 1)
      else setPhase('done')
    }, delay)
    return () => window.clearTimeout(timer)
  }, [phase, lastStep, frameIndex, currentStep, displayedAction])

  function selectMap(index: number) {
    if (index === mapIndex) return
    if (phase === 'running' || phase === 'replaying' || phase === 'paused') reset()
    setMapIndex(index)
    setFrameIndex(-1)
  }

  function finishReplay() {
    if (!result) return
    setPhase('done')
  }

  const reset = useCallback(() => {
    challenge?.onStart()
    exitObservation()
    worker.current?.terminate()
    worker.current = null
    window.clearTimeout(workerTimeout.current)
    setResult(undefined)
    setFrameIndex(-1)
    setPhase('idle')
  }, [challenge, exitObservation])

  const retry = useCallback(() => {
    reset()
    editor.current?.querySelector<HTMLElement>('textarea, [data-add-card]')?.focus()
  }, [reset])

  useEffect(() => {
    if (phase !== 'done' || !result || creditedResult.current === result) return
    creditedResult.current = result
    const score = { kind: 'grid' as const, turns: result.final.turn, passed: result.passedCases, total: result.totalCases }
    if (result.won) {
      onWin()
      challenge?.onWin(score, retry, gridGoalReplayEvidence(level, result))
    } else if (result.issue?.code !== 'internal') {
      onMistake?.()
      challenge?.onFailure(score, gridGoalReplayEvidence(level, result))
    }
  }, [challenge, level, onWin, onMistake, phase, result, retry])

  function run(singleStep: boolean, clock = false) {
    if (!hasCommands || disabled) return
    reset()
    setPhase('running')
    function accept(outcome: GridPlayback) {
      worker.current?.terminate()
      worker.current = null
      window.clearTimeout(workerTimeout.current)
      setResult(outcome)
      if (singleStep) {
        const steps = gridPlayback(currentRun(outcome, mapIndex))
        const tick = clock ? steps.findIndex(item => item.action?.action === 'step' || item.action?.issue) : 0
        const index = tick < 0 ? steps.length - 1 : tick
        setFrameIndex(index)
        setPhase(index >= steps.length - 1 ? 'done' : 'paused')
      } else {
        setFrameIndex(-1)
        setPhase('replaying')
      }
    }
    function fail(code: string) {
      accept({ won: false, frames: [], final: initialSnapshot(level), passedCases: 0, totalCases: 1 + (level.variants?.length ?? 0), issue: { code } })
    }
    try {
      const runner = new Worker(new URL('../engine/python.worker.ts', import.meta.url), { type: 'module' })
      worker.current = runner
      runner.onmessage = (event: MessageEvent<GridPlayback>) => {
        if (worker.current !== runner) return
        accept(event.data)
      }
      runner.onerror = () => { if (worker.current === runner) fail('internal') }
      workerTimeout.current = window.setTimeout(() => { if (worker.current === runner) fail('limit') }, 2500)
      runner.postMessage({ level, source: activeCode, personal, course, observeFlow: true, inspectMap: singleStep ? mapIndex : undefined })
    } catch {
      fail('internal')
    }
  }

  function singleStep() {
    if (phase === 'idle' || phase === 'done') return run(true)
    if (phase !== 'paused' && phase !== 'replaying') return
    const next = Math.min(frameIndex + 1, lastStep)
    setFrameIndex(next)
    setPhase(next >= lastStep ? 'done' : 'paused')
  }

  function pulseClock() {
    if (phase === 'idle') return run(true, true)
    const tick = playback.findIndex((item, index) => index > playbackIndex && (item.action?.action === 'step' || item.action?.issue))
    setFrameIndex(tick < 0 ? lastStep : tick)
    setPhase(tick < 0 || tick === lastStep ? 'done' : 'paused')
  }

  const transition = (
    <button type="button" role="tab" id="python-tab" aria-selected={mode === 'python'} aria-controls="python-panel"
      disabled={disabled} onClick={() => { if (mode !== 'python') updateDraft({ mode: 'python', source: typedCode ?? generated }) }}>Python</button>
  )

  const board = <section className={'panel board-panel' + (tutorialStep?.target === 'board' ? ' guided' : '')}>
    <div className="panel-heading">
      <h2><span className="bracket-icon" aria-hidden="true">⌗</span>{t('维修区', 'Workshop')}</h2>
      <span className="board-size">{scenario.tiles[0].length} × {scenario.tiles.length}</span>
    </div>
    <MapScenarioPicker locale={locale} index={shownMap} count={mapCount} onChange={observation.active ? observation.selectMap : selectMap} />
    {bench && <GridHardwareBench key={shownMap} mode={bench} scenario={scenario} locale={locale} snapshot={snapshot}
      before={displayedAction ? mapRun?.frames[shownFrame - 1]?.state ?? initialSnapshot(scenario) : snapshot} frame={displayedAction}
      submitted={mapRun?.frames.slice(0, shownFrame + 1).findLast(item => item.action === 'submit')?.value}
      onStep={hasCommands && !observation.active && phase !== 'running' && phase !== 'done' ? pulseClock : undefined} />}
    <Board level={scenario} locale={locale} snapshot={snapshot} activity={gridStepActivity(currentStep)} showHardware={!bench}
      trail={trail.visible && !observation.active ? gridTrailAt(scenario, mapRun, shownFrame) : undefined} />
    {observation.active && <MapObservationControls observation={observation} locale={locale} />}
    {!observation.active && phase === 'done' && mapCount > 1 && <p className="grid-map-outcome" role="status">{!mapRun
      ? t('本次运行还没检查到这张地图。', 'This map was not reached in this run.')
      : mapRun.issue ? runIssueText(locale, mapRun.issue) : t('这张地图已通过。', 'This map passed.')}</p>}
  </section>
  const guide = tutorialStep ? <section className="guide-panel">
    <span className="guide-lamp" aria-hidden="true">✦</span>
    <div className="guide-content">
      <div className="section-label">
        <h2>{t('操作引导', 'Walkthrough')}</h2>
        <span>{tutorial + 1} / {level.tutorial?.length}</span>
      </div>
      <p>{tutorialStep.text[locale]}</p>
      <div className="guide-actions">
        {tutorial > 0 && <button type="button" className="text-button" onClick={() => setTutorial(tutorial - 1)}>{t('上一步', 'Previous')}</button>}
        <button type="button" className="subtle-button" onClick={() => setTutorial(tutorial + 1)}>
          {tutorial + 1 === level.tutorial?.length ? t('完成引导', 'Finish guide') : t('下一步', 'Next step')}
        </button>
      </div>
    </div>
  </section> : (level.hints.length > 0 || level.tutorial?.length) ? <details className="panel hints">
    <summary>{t('任务提示', 'Mission hints')}</summary>
    {level.hints.map((hint, index) => <p key={index}>{hint[locale]}</p>)}
    {level.tutorial && <button type="button" className="text-button" onClick={() => setTutorial(0)}>{t('重看引导', 'Review walkthrough')}</button>}
  </details> : null
  const programEditor = <section className="panel editor-panel" ref={editor}>
    <div className="panel-heading">
      <h2><span className="bracket-icon" aria-hidden="true">{'{ }'}</span>{t('程序控制台', 'Program console')}</h2>
      <div className="segmented" role="tablist" aria-label={t('编辑方式', 'Editing mode')}>
        <button type="button" role="tab" id="cards-tab" aria-selected={mode === 'cards'} aria-controls="cards-panel" disabled={disabled}
          onClick={() => { if (mode !== 'cards') updateDraft({ mode: 'cards' }) }}>{t('指令卡', 'Cards')}</button>
        {transition}
      </div>
    </div>
    {mode === 'cards' ? <div className="editor-body" id="cards-panel" role="tabpanel" aria-labelledby="cards-tab">
      <ProgramEditor level={level} locale={locale} cards={cards} setCards={cards => updateDraft({ cards })} disabled={disabled} guideTarget={tutorialStep?.target}
        linePaths={linePaths} currentLine={mainLine} nextLine={nextMainLine} />
      <div className="code-preview">
        <div><span>Python</span><button type="button" className="text-button" disabled={disabled || !generated} onClick={() => {
          if (typedCode && typedCode !== generated && !window.confirm(t('用卡片生成的代码替换当前手写草稿？', 'Replace the current Python draft with code from the cards?'))) return
          updateDraft({ mode: 'python', source: generated })
        }}>{t('复制到手写模式', 'Copy to editor')}</button></div>
        <pre data-testid="generated-code">{generated
          ? <InlineExecutionSource code={generated} currentLine={mainLine} nextLine={nextMainLine} locale={locale} />
          : t('# 还没有指令', '# Add a command to get started')}</pre>
      </div>
      {(current && !mainLine || next && !nextMainLine) && <ExecutionSource locale={locale} code={generated} personal={personal} course={course}
        current={mainLine ? undefined : current} next={nextMainLine ? undefined : next} />}
    </div> : <div className="editor-body" id="python-panel" role="tabpanel" aria-labelledby="python-tab">
      <ExecutionSource locale={locale} code={activeCode} current={current} next={next} personal={personal} course={course} />
      <label className="python-label" htmlFor="python-code">{t('编写 Python', 'Write Python')}</label>
      <textarea className="python-input" id="python-code" value={typedCode ?? ''} spellCheck={false} autoCapitalize="off" autoComplete="off"
        disabled={disabled} onChange={event => updateDraft({ source: event.target.value })} />
      <CourseHelperPicker names={level.helpers} course={course} personal={personal} code={typedCode ?? ''} locale={locale}
        disabled={disabled} onChange={source => updateDraft({ source })} />
      {Object.keys(personal).some(name => !level.helpers?.includes(name)) && <div className="demo-picker">{Object.keys(personal).filter(name => !level.helpers?.includes(name)).map(name => <button type="button" key={name}
        className="subtle-button" disabled={disabled} onClick={() => updateDraft({ source: 'from my_algorithms import ' + name + '\n' + (typedCode ?? '') })}>
        {t('导入', 'Import')} {name}
      </button>)}</div>}
      <div className="api-list">{level.allowedApi.map(api => <code key={api}>{api}()</code>)}</div>
    </div>}
  </section>
  const active = phase === 'paused' || phase === 'replaying'
  const terminalIssue = phase === 'done' && (mapRun?.issue ?? result?.failure?.issue ?? result?.issue)
  const stepIssue = playbackIndex >= 0 && playbackIndex === lastStep ? mapRun?.issue : undefined
  const stepLine = current?.line
  const file = current?.sourceName
  const statement = stepLine ? executionLine(stepLine, file, activeCode, personal, course) : undefined
  const nextStatement = next && executionLine(next.line, next.sourceName, activeCode, personal, course)
  const failingMap = result?.failure && result.passedCases !== mapIndex && !mapRun?.issue
    ? t(`地图 ${result.passedCases + 1} · `, `Map ${result.passedCases + 1} · `) : ''
  const errorFile = terminalIssue && terminalIssue.sourceName
  const errorText = terminalIssue ? failingMap + (errorFile && errorFile !== 'main.py' ? errorFile + ' · ' : '') + runIssueText(locale, terminalIssue) : undefined
  const stepStatus = !observation.active && (active || phase === 'done') && (stepIssue || current || next) ?
    <div className="grid-step-pair">
      {(current || stepIssue) && <span className="grid-step-reading" data-testid="grid-step-reading" data-line={stepLine}>
        {stepIssue
          ? <strong className="grid-step-error">{file && file !== 'main.py' ? file + ' · ' : ''}{runIssueText(locale, stepIssue)}</strong>
          : <strong>{t(`当前 · 第 ${stepLine} 行`, `Current · Line ${stepLine}`)}</strong>}
        {statement && <code title={statement}>{statement}</code>}
      </span>}
      {next && <span className="grid-step-reading grid-step-upcoming">
        <strong>{t(`下一条 · 第 ${next.line} 行`, `Next · Line ${next.line}`)}</strong>
        {nextStatement && <code title={nextStatement}>{nextStatement}</code>}
      </span>}
    </div> : undefined
  const observeOnly = !hasCommands && canObserve
  const toolbar = <PlayToolbar locale={locale} guided={tutorialStep?.target === 'run'} trail={trail} status={stepStatus}>
    {observation.active ? <button type="button" className="primary-button" onClick={exitObservation}>{t('返回程序', 'Back to program')}</button> : <>
      {observeOnly ? <button type="button" className="primary-button play-toolbar__run" data-testid="map-observe-start"
        onClick={() => observation.start(mapIndex)}>{t('观察地图', 'Observe map')}</button> :
        <button type="button" className="primary-button play-toolbar__run" disabled={!hasCommands || phase === 'running'}
          onClick={() => active ? setPhase(phase === 'paused' ? 'replaying' : 'paused') : run(false)}>
          <span aria-hidden="true">{phase === 'replaying' ? 'Ⅱ' : '▶'}</span>
          {phase === 'paused' ? t('继续运行', 'Resume') : phase === 'replaying' ? t('暂停', 'Pause') : t('运行', 'Run')}
        </button>}
      <button type="button" className="subtle-button play-toolbar__step" data-testid="grid-single-step"
        disabled={!hasCommands || phase === 'running'} onClick={singleStep}
        title={t('每次看一步程序怎样执行', 'Follow one program step at a time')}>{t('单步执行', 'Step once')}</button>
      {mapRun && <button type="button" className="subtle-button" disabled={playbackIndex < 0 || phase === 'running'}
        onClick={() => { setFrameIndex(playbackIndex - 1); setPhase('paused') }}>{t('回看上一步', 'Review previous step')}</button>}
      {active ? <button type="button" className="subtle-button" onClick={finishReplay}>{t('查看结果', 'Show result')}</button> :
        canObserve && !observeOnly && <button type="button" className="subtle-button" data-testid="map-observe-start"
          disabled={phase === 'running'} onClick={() => observation.start(mapIndex)}>{t('观察地图', 'Observe map')}</button>}
      <button type="button" className="subtle-button" onClick={reset}>{active || phase === 'running' ? t('停止', 'Stop') : t('重置棋盘', 'Reset board')}</button>
    </>}
  </PlayToolbar>
  const feedback = <section className={'panel output-panel' + (!observation.active && phase === 'done' && result?.won ? ' output-panel--win' : '')}>
    <div className="panel-heading"><h2><span className="bracket-icon" aria-hidden="true">›_</span>{t('运行反馈', 'Run feedback')}</h2></div>
    <div className="output-body" role="status">
      {observation.active ? <p>{snapshot.enemies.some(enemy => enemy.x === snapshot.player.x && enemy.y === snapshot.player.y)
        ? t('巡逻机器人到了芽芽站的格子。', 'A patrol reached Sprout’s square.')
        : observedHazard ? runIssueText(locale, { code: observedHazard.kind + 'Hit' })
        : t('芽芽留在起点。', 'Sprout stays at the start.')}</p> : <>
        {phase === 'idle' && <p>{t('运行程序后，机器人会照着指令行动。', 'Run your program to see Sprout follow its commands.')}</p>}
        {phase === 'running' && <p>{t('正在读取程序…', 'Reading the program…')}</p>}
        {active && current && <p>{t('第 ', 'Line ')}{current.line}{t(' 行 · ', ' · ')}<code>{statement}</code></p>}
        {mapRun?.flowTruncated && <p>{t('程序走了很多步。后面的函数和判断动画已省略，棋盘仍显示每次行动。', 'This program ran for many steps. Later function and control-flow animations are omitted. All board actions are shown.')}</p>}
        {phase === 'done' && result?.won && <p className="win-message">{t('任务完成！', 'Mission complete!')}{result.totalCases > 1 && ' ' + result.passedCases + '/' + result.totalCases}</p>}
        {errorText && <p className="error-message">{errorText}</p>}
      </>}
    </div>
    {review && <ChallengeFailureReview review={review} onRetry={retry} />}
    {mapRun && <ol className="run-log">
      {mapRun.frames.slice(0, shownFrame + 1).filter(event => ['say', 'scan', 'submit', 'read_map'].includes(event.action)).slice(-8).map((event, index) => <li key={index}>
        <code>{event.action}()</code> <span>{typeof event.value === 'string' ? event.value : JSON.stringify(event.value)}</span>
      </li>)}
    </ol>}
  </section>
  if (classroom) return <div className="lecture-layout">
    {guide}
    <DeviceWindow locale={locale} kind="desktop" title={t('芽芽遥控台', 'Sprout control station')}>
      <div className="station-program">
        <div className="play-column">
          {board}
          <GridReadout frame={displayedAction} locale={locale} />
          {feedback}
        </div>
        {programEditor}
      </div>
    </DeviceWindow>
    {toolbar}
  </div>
  return <div className="lesson-layout">
    <div className="play-column">{board}</div>
    <div className="play-column">{guide}{programEditor}{feedback}</div>
    {toolbar}
  </div>
}
