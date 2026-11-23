import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { LectureLevel, ReplayExample, ReplayLevel } from '../shared/advanced'
import type { Candidate, GridLevel, Locale, RunIssue, RunResult } from '../shared/types'
import { gradeCandidate, runPracticeTurn } from '../ai/core'
import { initialSnapshot } from '../engine/snapshot'
import { Board } from './Board'
import { useLessonWorker, useReplayCursor } from './lessonTools'
import { ReplayControls } from './ReplayControls'
import { LectureAnimation } from './LectureAnimation'
import { CommandDesk, TeachingScreen } from './Classroom'
import { DeviceWindow } from './DeviceWindow'
import { GridReadout } from './GridReadout'
import { actionViewingDelay, gridPlayback, gridStepActivity } from './gridExecution'
import { InlineExecutionSource } from './InlineExecutionSource'
import { AlgorithmValueRack } from './AlgorithmValueRack'
import { courseFor } from './LearningCourse'
import { ExecutionSource } from './ExecutionSource'
import './teaching-stages.css'
import { runIssueText, tr } from './text'

type LearningProps = { locale: Locale; onComplete: () => void }
const ProgramWalkthrough = lazy(() => import('./ProgramWalkthrough').then(module => ({ default: module.ProgramWalkthrough })))
const VisualProgramGuide = lazy(() => import('./VisualProgramGuide').then(module => ({ default: module.VisualProgramGuide })))
const ProgramBasics = lazy(() => import('./ProgramBasics').then(module => ({ default: module.ProgramBasics })))
const ProgramInterfaces = lazy(() => import('./ProgramInterfaces').then(module => ({ default: module.ProgramInterfaces })))
const GuidedProgram = lazy(() => import('./GuidedProgram').then(module => ({ default: module.GuidedProgram })))
const ChargePrediction = lazy(() => import('./ChargePrediction').then(module => ({ default: module.ChargePrediction })))
const SequenceLesson = lazy(() => import('./SequenceLesson').then(module => ({ default: module.SequenceLesson })))
const VariableCupsLesson = lazy(() => import('./VariableCupsLesson').then(module => ({ default: module.VariableCupsLesson })))
const AssignmentLesson = lazy(() => import('./AssignmentLesson').then(module => ({ default: module.AssignmentLesson })))
const VariablePrediction = lazy(() => import('./VariablePrediction').then(module => ({ default: module.VariablePrediction })))
const BooleanLesson = lazy(() => import('./BooleanLesson').then(module => ({ default: module.BooleanLesson })))
const DeparturePrediction = lazy(() => import('./DeparturePrediction').then(module => ({ default: module.DeparturePrediction })))
const FunctionPrediction = lazy(() => import('./FunctionPrediction').then(module => ({ default: module.FunctionPrediction })))
const BranchLesson = lazy(() => import('./BranchLesson').then(module => ({ default: module.BranchLesson })))
const ForLesson = lazy(() => import('./ForLesson').then(module => ({ default: module.ForLesson })))
const ForPrediction = lazy(() => import('./ForPrediction').then(module => ({ default: module.ForPrediction })))
const WhileLesson = lazy(() => import('./WhileLesson').then(module => ({ default: module.WhileLesson })))
const WhilePrediction = lazy(() => import('./WhilePrediction').then(module => ({ default: module.WhilePrediction })))
const CollectionLesson = lazy(() => import('./CollectionLesson').then(module => ({ default: module.CollectionLesson })))
const CollectionPrediction = lazy(() => import('./CollectionPrediction').then(module => ({ default: module.CollectionPrediction })))
const NestedLoopsLesson = lazy(() => import('./NestedLoopsLesson').then(module => ({ default: module.NestedLoopsLesson })))
const NestedLoopsPrediction = lazy(() => import('./NestedLoopsPrediction').then(module => ({ default: module.NestedLoopsPrediction })))
const ModuleLesson = lazy(() => import('./ModuleLesson').then(module => ({ default: module.ModuleLesson })))
const ModulePrediction = lazy(() => import('./ModulePrediction').then(module => ({ default: module.ModulePrediction })))
const DebuggingLesson = lazy(() => import('./DebuggingLesson').then(module => ({ default: module.DebuggingLesson })))
const DebuggingPrediction = lazy(() => import('./DebuggingPrediction').then(module => ({ default: module.DebuggingPrediction })))
const StructuresLesson = lazy(() => import('./StructuresLesson').then(module => ({ default: module.StructuresLesson })))
const StructuresPrediction = lazy(() => import('./StructuresPrediction').then(module => ({ default: module.StructuresPrediction })))
const ListPositionsLesson = lazy(() => import('./ListPositionsLesson').then(module => ({ default: module.ListPositionsLesson })))
const ListPositionsPrediction = lazy(() => import('./ListPositionsPrediction').then(module => ({ default: module.ListPositionsPrediction })))
const StackLesson = lazy(() => import('./StackLesson').then(module => ({ default: module.StackLesson })))
const StackPrediction = lazy(() => import('./StackPrediction').then(module => ({ default: module.StackPrediction })))
const QueueLesson = lazy(() => import('./QueueLesson').then(module => ({ default: module.QueueLesson })))
const QueuePrediction = lazy(() => import('./QueuePrediction').then(module => ({ default: module.QueuePrediction })))
const DictionaryLesson = lazy(() => import('./DictionaryLesson').then(module => ({ default: module.DictionaryLesson })))
const DictionaryPrediction = lazy(() => import('./DictionaryPrediction').then(module => ({ default: module.DictionaryPrediction })))
const BatterySearchLesson = lazy(() => import('./BatterySearchLesson').then(module => ({ default: module.BatterySearchLesson })))
const BatterySearchPrediction = lazy(() => import('./BatterySearchPrediction').then(module => ({ default: module.BatterySearchPrediction })))
const SelectionSortLesson = lazy(() => import('./SelectionSortLesson').then(module => ({ default: module.SelectionSortLesson })))
const SelectionSortPrediction = lazy(() => import('./SelectionSortPrediction').then(module => ({ default: module.SelectionSortPrediction })))
const TwoPointerLesson = lazy(() => import('./TwoPointerLesson').then(module => ({ default: module.TwoPointerLesson })))
const TwoPointerPrediction = lazy(() => import('./TwoPointerPrediction').then(module => ({ default: module.TwoPointerPrediction })))
const PrefixTotalsLesson = lazy(() => import('./PrefixTotalsLesson').then(module => ({ default: module.PrefixTotalsLesson })))
const PrefixTotalsPrediction = lazy(() => import('./PrefixTotalsPrediction').then(module => ({ default: module.PrefixTotalsPrediction })))
const FirstBatterySearchLesson = lazy(() => import('./FirstBatterySearchLesson').then(module => ({ default: module.FirstBatterySearchLesson })))
const FirstBatterySearchPrediction = lazy(() => import('./FirstBatterySearchPrediction').then(module => ({ default: module.FirstBatterySearchPrediction })))
const BreadthFirstLesson = lazy(() => import('./BreadthFirstLesson').then(module => ({ default: module.BreadthFirstLesson })))
const BreadthFirstPrediction = lazy(() => import('./BreadthFirstPrediction').then(module => ({ default: module.BreadthFirstPrediction })))

const batteryLessons = [
  { key: 'batterySearch', Demonstration: BatterySearchLesson, Prediction: BatterySearchPrediction },
  { key: 'selectionSort', Demonstration: SelectionSortLesson, Prediction: SelectionSortPrediction },
  { key: 'twoPointerLesson', Demonstration: TwoPointerLesson, Prediction: TwoPointerPrediction },
  { key: 'prefixTotalsLesson', Demonstration: PrefixTotalsLesson, Prediction: PrefixTotalsPrediction },
  { key: 'firstBatterySearch', Demonstration: FirstBatterySearchLesson, Prediction: FirstBatterySearchPrediction },
  { key: 'breadthFirstLesson', Demonstration: BreadthFirstLesson, Prediction: BreadthFirstPrediction },
] as const

export function Lecture({ level, locale, onComplete, preview }: LearningProps & { level: LectureLevel; preview?: boolean }) {
  const [selected, setSelected] = useState<number>()
  const [runWithCode, setRunWithCode] = useState(false)
  const [readyForPractice, setReadyForPractice] = useState(false)
  const [repairedSource, setRepairedSource] = useState<string>()
  const correct = selected === level.question.correct
  const execution = level.execution
  if (execution?.variableCups) {
    return <Suspense fallback={<p role="status" className="loading">{tr(locale, '正在摆放记忆杯…', 'Setting up the memory cups…')}</p>}>
      <VariableCupsLesson execution={execution} locale={locale} onComplete={onComplete} />
    </Suspense>
  }
  const batteryLesson = execution && batteryLessons.find(({ key }) => execution[key])
  if (execution && batteryLesson) {
    const { Demonstration, Prediction } = batteryLesson
    return <Suspense fallback={<p role="status" className="loading">{tr(locale, '正在加载电池演示…', 'Loading the battery demonstration…')}</p>}>
      <div className="lecture-layout">
        <Demonstration execution={execution} locale={locale} onReady={() => setReadyForPractice(true)} />
        {readyForPractice && <Suspense fallback={<p role="status" className="loading">{tr(locale, '正在加载预测练习…', 'Loading the prediction exercise…')}</p>}>
          <CommandDesk locale={locale}><Prediction execution={execution} locale={locale} onComplete={onComplete} /></CommandDesk>
        </Suspense>}
      </div>
    </Suspense>
  }
  if (execution?.debugging) {
    return <Suspense fallback={<p role="status" className="loading">{tr(locale, '正在加载补电程序…', 'Loading the charging program…')}</p>}>
      <div className="lecture-layout">
        <DebuggingLesson execution={execution} locale={locale} onReady={setRepairedSource} />
        {repairedSource !== undefined && <Suspense fallback={<p role="status" className="loading">{tr(locale, '正在加载预测练习…', 'Loading the prediction exercise…')}</p>}>
          <CommandDesk locale={locale}><DebuggingPrediction source={repairedSource} execution={execution} locale={locale} onComplete={onComplete} /></CommandDesk>
        </Suspense>}
      </div>
    </Suspense>
  }
  if (execution?.sequence) {
    return <Suspense fallback={<p role="status" className="loading">{tr(locale, '正在加载指令卡…', 'Loading the command cards…')}</p>}>
      <SequenceLesson execution={execution} locale={locale} onComplete={onComplete} />
    </Suspense>
  }
  if (execution?.guided || execution?.assignment || execution?.boolean || execution?.branchLesson
    || execution?.forLoop || execution?.whileLoop || execution?.collectionLesson || execution?.nestedLoops
    || execution?.moduleLesson || execution?.structures || execution?.listPositions || execution?.stackLesson || execution?.queueLesson
    || execution?.dictionaryLesson) {
    const Demonstration = execution.dictionaryLesson ? DictionaryLesson : execution.queueLesson ? QueueLesson : execution.stackLesson ? StackLesson
      : execution.listPositions ? ListPositionsLesson : execution.structures ? StructuresLesson
      : execution.moduleLesson ? ModuleLesson : execution.nestedLoops ? NestedLoopsLesson
      : execution.collectionLesson ? CollectionLesson : execution.whileLoop ? WhileLesson
      : execution.forLoop ? ForLesson : execution.branchLesson ? BranchLesson
      : execution.boolean ? BooleanLesson : execution.assignment ? AssignmentLesson : GuidedProgram
    const Prediction = execution.dictionaryLesson ? DictionaryPrediction : execution.queueLesson ? QueuePrediction
      : execution.stackLesson ? StackPrediction : execution.listPositions ? ListPositionsPrediction
      : execution.structures ? StructuresPrediction : execution.moduleLesson ? ModulePrediction
      : execution.nestedLoops ? NestedLoopsPrediction : execution.collectionLesson ? CollectionPrediction
      : execution.whileLoop ? WhilePrediction : execution.forLoop ? ForPrediction
      : execution.branchLesson || execution.boolean ? DeparturePrediction : execution.assignment ? VariablePrediction
      : execution.functionLesson ? FunctionPrediction : ChargePrediction
    return <Suspense fallback={<p role="status" className="loading">{tr(locale, '正在加载程序演示…', 'Loading the program demonstration…')}</p>}>
      <div className="lecture-layout">
        <Demonstration execution={execution} locale={locale} onReady={() => setReadyForPractice(true)} />
        {readyForPractice && <Suspense fallback={<p role="status" className="loading">{tr(locale, '正在加载预测练习…', 'Loading the prediction exercise…')}</p>}>
          <CommandDesk locale={locale}><Prediction execution={execution} locale={locale} onComplete={onComplete} /></CommandDesk>
        </Suspense>}
      </div>
    </Suspense>
  }
  if (execution?.visual && !runWithCode) {
    return <Suspense fallback={<p role="status" className="loading">{tr(locale, '正在加载程序步骤…', 'Loading the program steps…')}</p>}>
      <VisualProgramGuide execution={execution} visual={execution.visual} locale={locale} onReady={() => setRunWithCode(true)} />
    </Suspense>
  }
  const intro = execution?.intro
  const interfaceLesson = intro?.mode === 'interfaces'
  const showPractice = !intro || readyForPractice
  const notes = showPractice && <div className="lesson-annotations">{level.sections.map((section, index) =>
    <article key={index}><h3>{section.title[locale]}</h3><p>{section.body[locale]}</p></article>)}</div>
  const exercise = showPractice && <section className="teaching-panel lesson-prediction">
    <h2>{interfaceLesson ? tr(locale, '小练习', 'Quick practice') : tr(locale, '猜一猜', 'Make a prediction')}</h2>
    <p>{level.question.prompt[locale]}</p>
    <div className="choices-column">
      {level.question.options.map((option, index) => <button type="button" key={index} className="subtle-button"
        aria-pressed={selected === index} onClick={() => {
          setSelected(index)
          if (index === level.question.correct) onComplete()
        }}>
        {option[locale]}
      </button>)}
    </div>
    {selected !== undefined && <p role="status" className={correct ? 'win-message' : 'error-message'}>
      {correct ? tr(locale, '答对了！', 'That’s right! ') + level.question.feedback[locale]
        : interfaceLesson ? tr(locale, '再看看刚才回放的步骤，然后试一次。', 'Check the steps in the replay, then try again.')
          : tr(locale, '再试一次。想想刚才的例子。', 'Try again. Think about the example.')}
    </p>}
  </section>
  const slots = { notes, exercise }
  if (execution && intro) {
    return <Suspense fallback={<p role="status" className="loading">{tr(locale, '正在加载程序演示…', 'Loading program execution…')}</p>}>
      {interfaceLesson ? <ProgramInterfaces {...slots} execution={execution} levelId={level.id} locale={locale} preview={preview} onReady={() => setReadyForPractice(true)} />
        : <ProgramBasics {...slots} execution={execution} locale={locale} onReady={() => setReadyForPractice(true)} onNewInput={() => setSelected(undefined)} />}
    </Suspense>
  }
  if (level.animation && (!execution || level.animation.workstation || level.animation.hardware)) {
    return <LectureAnimation {...slots} animation={level.animation} execution={execution} title={level.concept[locale]} locale={locale} />
  }
  return <div className="lecture-layout">
    {execution && <Suspense fallback={<p role="status" className="loading">{tr(locale, '正在加载程序演示…', 'Loading program execution…')}</p>}>
      <ProgramWalkthrough execution={execution} locale={locale} onRevisit={execution.visual ? () => setRunWithCode(false) : undefined} />
    </Suspense>}
    <div className="classroom-split">
      <TeachingScreen locale={locale} variant="blackboard" title={level.concept[locale]}>{notes}</TeachingScreen>
      <CommandDesk locale={locale}>{exercise}</CommandDesk>
    </div>
  </div>
}

function GridReplay({ examples, locale, onComplete, observeRack }: LearningProps & { examples: ReplayExample[]; observeRack: boolean }) {
  const [selected, setSelected] = useState(0)
  const example = examples[selected]
  const worker = useLessonWorker<RunResult>()
  const [result, setResult] = useState<RunResult>()
  const [error, setError] = useState<RunIssue>()
  const [showHelpers, setShowHelpers] = useState(false)
  const steps = useMemo(() => gridPlayback(result, result?.rackSteps, !result?.rackSteps?.length || showHelpers), [result, showHelpers])
  const count = steps.length
  const cursor = useReplayCursor(count, position => actionViewingDelay(steps[position - 1]?.flow?.kind ?? steps[position - 1]?.action?.action, count))
  const step = steps[cursor.step - 1]
  const frame = step && result?.frames[step.frameIndex]
  const current = step?.position, next = steps[cursor.step]?.position
  const helperCode = [current, next].some(mark => mark?.sourceName && mark.sourceName !== 'main.py')
  const level = example.scenario
  const snapshot = frame?.state ?? initialSnapshot(level)

  useEffect(() => {
    if (result?.won && cursor.step === count) onComplete()
  }, [count, cursor.step, onComplete, result])

  function selectExample(index: number) {
    if (index === selected) return
    worker.stop()
    cursor.restart(false)
    setResult(undefined)
    setError(undefined)
    setSelected(index)
  }

  function run(autoplay: boolean) {
    setError(undefined)
    setResult(undefined)
    cursor.restart(false)
    const replay: GridLevel = {
      version: 1, id: 'demo-replay', order: 0, kind: 'grid',
      title: example.title, brief: example.title, concept: example.title, hints: [],
      ...level, cards: [], solutionCards: [],
    }
    worker.run(() => new Worker(new URL('../engine/python.worker.ts', import.meta.url), { type: 'module' }),
      { level: replay, source: example.source, observeRack, observeFlow: true }, outcome => {
        setResult(outcome)
        cursor.restart(autoplay, autoplay ? 0 : 1)
      }, setError)
  }

  return <DeviceWindow locale={locale} title={tr(locale, '芽芽遥控台', 'Sprout control station')} caption={example.title[locale]}>
    <div className="station-program">
      <div className="board-panel">
        {observeRack && <AlgorithmValueRack key={selected} locale={locale} step={step?.rack} previous={steps[cursor.step - 2]?.rack}
          inputs={level.input === undefined ? [] : [{ name: 'scan()', value: level.input }]} />}
        <Board level={level} snapshot={snapshot} locale={locale} activity={gridStepActivity(step)} />
        <GridReadout frame={step?.action} locale={locale} />
      </div>
      <div>
        <h3 className="replay-subheading">{tr(locale, '示例程序', 'Example program')}</h3>
        {helperCode ? <ExecutionSource code={example.source} locale={locale} current={current} next={next} />
          : <pre className="sample-code station-source"><InlineExecutionSource code={example.source} locale={locale}
            currentLine={current?.line} nextLine={next?.line} /></pre>}
        <div className="teaching-result" role="status">
          {result?.flowTruncated && <p>{tr(locale, '程序走了很多步，后面的函数和判断动画已省略。', 'This program ran for many steps. Later function and control-flow animations are omitted.')}</p>}
          {result?.issue && cursor.step === count && <p className="error-message">{runIssueText(locale, result.issue)}</p>}
          {error && <p className="error-message">{runIssueText(locale, error)}</p>}
          {result?.won && cursor.step === count && <p className="win-message">{tr(locale, '演示完成', 'Demonstration complete')}</p>}
        </div>
        {examples.length > 1 && <fieldset className="replay-example-picker"><legend>{tr(locale, '选择示例', 'Choose an example')}</legend>
          <div className="demo-picker">
            {examples.map((item, index) => <button key={index} type="button" className="subtle-button" aria-pressed={selected === index}
              onClick={() => selectExample(index)}>{item.title[locale]}</button>)}
          </div>
        </fieldset>}
        {result?.rackSteps?.some(step => step.sourceName !== 'main.py') && <label className="replay-helper-choice">
          <input type="checkbox" checked={showHelpers} onChange={e => { setShowHelpers(e.target.checked); cursor.restart(false) }} />
          {tr(locale, '展开导入函数的步骤', 'Include steps inside imported functions')}
        </label>}
        <button type="button" className="primary-button" disabled={worker.pending} onClick={() => run(true)}>{tr(locale, '运行演示', 'Run demonstration')}</button>
        {!result && <button type="button" className="subtle-button" disabled={worker.pending}
          onClick={() => run(false)}>{tr(locale, '单步执行', 'Step once')}</button>}
        <ReplayControls cursor={cursor} count={count} locale={locale} />
      </div>
    </div>
  </DeviceWindow>
}

function AiReplay({ level, locale, onComplete }: LearningProps & { level: Extract<ReplayLevel, { mode: 'ai' }> }) {
  const [turn, setTurn] = useState(0)
  const prompts = level.example.examplePrompts[locale]
  let candidate: Candidate | undefined
  let injected = false
  for (const [index, prompt] of prompts.slice(0, turn).entries()) {
    const result = runPracticeTurn(level.example, prompt, candidate, index)
    candidate = result.candidate
    injected = Boolean(result.fault)
  }
  const checks = candidate && gradeCandidate(level.example, candidate)
  const finished = turn === prompts.length && checks?.every(check => check.actual === check.expected)
  useEffect(() => {
    if (finished) onComplete()
  }, [finished, onComplete])
  return <DeviceWindow locale={locale} title={tr(locale, '与 AI 装箱助手对话', 'Chat with the AI packing assistant')} className="packing-chat">
    {turn > 0 && <div className="replay-dispatch">
      <h3>{tr(locale, '已发送的提示词', 'Sent prompt')}</h3>
      <p>{prompts[turn - 1]}</p>
    </div>}
    {checks ? <>
      <p role="status">{injected ? tr(locale, '这里加入了一次模拟错误。', 'This round includes a simulated mistake.') :
        checks.every(check => check.actual === check.expected) ? tr(locale, '清单正确。', 'The manifest is correct.') : tr(locale, '继续检查数量。', 'Keep checking the quantities.')}</p>
      <table className="lesson-table"><thead><tr><th>{tr(locale, '物品', 'Item')}</th><th>{tr(locale, '目标', 'Expected')}</th><th>{tr(locale, '清单', 'Actual')}</th></tr></thead>
        <tbody>{checks.map(check => <tr key={check.id}><th scope="row">{level.example.inventory.find(item => item.id === check.id)?.label[locale]}</th>
          <td>{check.expected}</td><td className={check.expected === check.actual ? 'win-message' : 'error-message'}>{check.actual}</td></tr>)}</tbody>
      </table>
    </> : <p>{tr(locale, '发送示例后核对每件物品的数量。', 'Send the example, then compare the quantities.')}</p>}
    <div className="packing-chat-compose">
      {turn < prompts.length && <div className="replay-dispatch">
        <h3>{turn === 0 ? tr(locale, '示例提示词', 'Example prompt') : tr(locale, '下一条提示词', 'Next prompt')}</h3>
        <p>{prompts[turn]}</p>
      </div>}
      {turn < prompts.length ? <button type="button" className="primary-button" onClick={() => setTurn(turn + 1)}>
        {turn === 0 ? tr(locale, '发送示例提示词', 'Send example') : tr(locale, '发送修正', 'Send correction')}</button>
        : <button type="button" className="subtle-button" onClick={() => setTurn(0)}>{tr(locale, '重看演示', 'Replay demonstration')}</button>}
    </div>
  </DeviceWindow>
}

export function TeachingReplay({ level, locale, onComplete }: LearningProps & { level: ReplayLevel }) {
  if (level.mode === 'ai') return <AiReplay level={level} locale={locale} onComplete={onComplete} />
  return <GridReplay examples={level.examples} locale={locale} onComplete={onComplete} observeRack={courseFor(level)?.id === 'algorithms'} />
}
