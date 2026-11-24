import { CodingDevice } from './CodingDevice'
import { useMemo, useState } from 'react'
import { runProgramWalkthrough } from '../engine/programWalkthrough'
import { programGraphics, reorderProgramSource, type ProgramGraphic, type ProgramVisual, type ProgramWalkthrough, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { ProgramDiagram } from './ProgramDiagram'
import { tr } from './text'
import './visual-program-guide.css'

type Phase = 'observe' | 'order' | 'reveal'
type Trial = { result: ReturnType<typeof runProgramWalkthrough>; passed: boolean; blocked?: ProgramGraphic }
type ReviewReturn = { phase: Exclude<Phase, 'observe'>; active?: string }

function latestValues(frames: ProgramWalkthroughFrame[], byLine: ReadonlyMap<number, string>) {
  const values: Record<string, string> = {}
  for (const { line, value } of frames) {
    const id = line === undefined ? undefined : byLine.get(line)
    if (id && (typeof value === 'number' || typeof value === 'string')) values[id] = String(value)
  }
  return values
}

export function VisualProgramGuide({ execution, visual, locale, onReady }: {
  execution: ProgramWalkthrough; visual: ProgramVisual; locale: Locale; onReady: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [phase, setPhase] = useState<Phase>('observe')
  const [visualStep, setVisualStep] = useState(0)
  const [structure, setStructure] = useState(false)
  const [active, setActive] = useState<string>()
  const [round, setRound] = useState(0)
  const [order, setOrder] = useState(() => [...visual.practice[0].order])
  const [trial, setTrial] = useState<Trial>()
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set())
  const [reviewReturn, setReviewReturn] = useState<ReviewReturn>()
  const sample = execution.cases[0]
  const { frames } = useMemo(() => runProgramWalkthrough(execution.source, sample.input), [execution.source, sample.input])
  const graphics = programGraphics(visual)
  const byId = new Map(graphics.map(item => [item.id, item]))
  const byLine = new Map(graphics.map(item => [item.line, item.id]))
  const visibleStep = visual.main[visualStep - 1]
  const visibleFrame = visibleStep ? frames.findLastIndex(frame => frame.line === visibleStep.line) : -1
  const observedValues = latestValues(frames.slice(0, visibleFrame + 1), byLine)
  const focus = active ? byId.get(active) : undefined
  const nextGraphic = graphics.find(item => !revealed.has(item.id))
  const trialLines = new Map(byLine)
  visual.main.forEach((item, index) => trialLines.set(item.line, order[index]))
  const stages: [Phase, string][] = [
    ['observe', t('观察步骤', 'Follow the steps')],
    ['order', t('安排顺序', 'Put the steps in order')],
    ['reveal', t('查看指令', 'Read the instructions')],
  ]

  function pickGraphic(item: ProgramGraphic) {
    setActive(item.id)
    if (phase === 'reveal') setRevealed(previous => new Set([...previous, item.id]))
  }

  function stepForward() {
    const next = visual.main[visualStep]
    if (!next) return
    setVisualStep(visualStep + 1)
    setActive(next.id)
  }

  function showStructure() {
    setStructure(true)
    setActive(visual.main.find(item => item.calls)?.id)
  }

  function startRound(index: number) {
    setRound(index)
    setOrder([...visual.practice[index].order])
    setTrial(undefined)
    setActive(undefined)
    setPhase('order')
  }

  function move(id: string, offset: -1 | 1) {
    const from = order.indexOf(id)
    const to = from + offset
    if (from < 0 || to < 0 || to >= order.length) return
    const next = [...order]
    const target = next[to]
    next[to] = id
    next[from] = target
    setOrder(next)
    setActive(id)
    setTrial(undefined)
  }

  function check() {
    const result = runProgramWalkthrough(reorderProgramSource(execution, order), sample.input)
    const id = result.issue?.line === undefined ? undefined : trialLines.get(result.issue.line)
    const blocked = id ? byId.get(id) : undefined
    const passed = !result.issue && result.output.length === 1 && result.output[0] === sample.expected
    setTrial({ result, passed, blocked })
    setActive(blocked?.id ?? (passed ? order.at(-1) : undefined))
  }

  function startReveal() {
    setActive(undefined)
    setPhase('reveal')
  }

  function reviewPictures(from: ReviewReturn['phase']) {
    setReviewReturn({ phase: from, active })
    setPhase('observe')
    setStructure(false)
    setVisualStep(visual.main.length)
    setActive(undefined)
  }

  function returnToActivity() {
    if (!reviewReturn) return
    setPhase(reviewReturn.phase)
    setActive(reviewReturn.active)
    setReviewReturn(undefined)
  }

  const values = phase === 'observe' ? observedValues
    : phase === 'order' && trial ? latestValues(trial.result.frames, trialLines) : undefined
  const instruction = phase === 'observe' ? structure
    ? t('连线指向帮手的工作台。点一个步骤，看看帮手要做什么。它完成后会把数字交回来。', 'A link leads to the helper’s workbench. Tap an action to find out what it does. The helper sends the number back when it finishes.')
    : t('沿着箭头走一步，看看电量从哪里读到、在哪里计算、最后怎样显示。', 'Follow the arrows to see where the charge is read, calculated and displayed.')
    : phase === 'order' ? visual.practice[round].prompt[locale]
      : t('点一个步骤，看看电脑执行它时用的是哪条指令。', 'Tap a step to see the instruction the computer uses to perform it.')

  return <section className="classroom-demonstration panel visual-program-guide" aria-label={t('程序步骤', 'Program steps')} data-visual-phase={phase}>
    <ol className="visual-program-stages" aria-label={t('学习步骤', 'Learning steps')}>
      {stages.map(([key, label]) => <li key={key} aria-current={key === phase ? 'step' : undefined}>{label}</li>)}
    </ol>
    <CodingDevice device="debugger" locale={locale} controls={<>
      {phase === 'order' && <h3 className="visual-program-trial">{visual.practice[round].title[locale]}</h3>}
      <p className="visual-program-instruction">{instruction}</p>
      {phase === 'order' && <ProgramDiagram visual={visual} locale={locale} source={execution.source} order={order}
        active={active} values={values} onPick={pickGraphic} onMove={move} showFunctions={false} />}
      <div className="visual-program-actions">
        {phase === 'observe' && (structure
          ? <>
            <button type="button" className="subtle-button" onClick={() => setStructure(false)}>{t('回看主程序', 'Review the main program')}</button>
            {!reviewReturn && <button type="button" className="primary-button" onClick={() => startRound(0)}>{t('开始排顺序', 'Start ordering')}</button>}
          </>
          : <>
            {visualStep < visual.main.length && <button type="button" className="primary-button" onClick={stepForward}>{t('走一步', 'Follow one step')}</button>}
            {visualStep > 0 && <button type="button" className="subtle-button" onClick={() => {
              setVisualStep(0)
              setActive(undefined)
            }}>{t('从头看', 'Start from the beginning')}</button>}
            <button type="button" className={visualStep === visual.main.length ? 'primary-button' : 'subtle-button'}
              disabled={visualStep < visual.main.length} onClick={showStructure}>{t('看程序结构', 'See the program structure')}</button>
          </>)}
        {phase === 'observe' && reviewReturn && <button type="button" className="primary-button" onClick={returnToActivity}>
          {reviewReturn.phase === 'order' ? t('继续排顺序', 'Continue ordering') : t('继续查看指令', 'Continue reading the instructions')}
        </button>}
        {phase === 'order' && <>
          <button type="button" className={trial?.passed ? 'subtle-button' : 'primary-button'} onClick={check}>{t('检查顺序', 'Check the order')}</button>
          <button type="button" className="subtle-button" onClick={() => startRound(round)}>{t('重排这一轮', 'Reset this round')}</button>
          {trial?.passed && (round + 1 < visual.practice.length
            ? <button type="button" className="primary-button" onClick={() => startRound(round + 1)}>{t('下一轮', 'Next round')}</button>
            : <button type="button" className="primary-button" onClick={startReveal}>{t('查看程序指令', 'Read the program instructions')}</button>)}
        </>}
        {phase === 'reveal' && (nextGraphic
          ? <button type="button" className="primary-button" onClick={() => pickGraphic(nextGraphic)}>{t('查看下一条指令', 'Read the next instruction')}</button>
          : <button type="button" className="primary-button" onClick={onReady}>{t('运行完整程序', 'Run the full program')}</button>)}
        {phase !== 'observe' && <button type="button" className="subtle-button" onClick={() => reviewPictures(phase)}>{t('回看程序步骤', 'Review the program steps')}</button>}
      </div>
    </>}>
      <div className="visual-program-heading">
        <h2>{t('程序步骤', 'Program steps')}</h2>
      </div>
      <div className="visual-program-body">
        {phase === 'order'
          ? <ol className="visual-program-current-order" aria-label={t('当前顺序', 'Current order')}>
            {order.map(id => <li key={id} aria-current={id === active ? 'step' : undefined}>{byId.get(id)?.label[locale]}</li>)}
          </ol>
          : <ProgramDiagram visual={visual} locale={locale} source={execution.source} active={active}
            revealed={phase === 'reveal' ? revealed : undefined} values={values} onPick={pickGraphic}
            showFunctions={phase === 'reveal' || structure} />}
        <div className="visual-program-response" role="status" data-testid="visual-program-feedback">
          {phase === 'order' && trial ? trial.passed
            ? <p className="win-message" data-task-success="true" data-task-pop="true">{t('顺序正确。屏幕显示', 'The order works. The screen shows')} <strong>{trial.result.output[0]}</strong>{t('。', '.')}</p>
            : <p className="error-message">{trial.blocked && trial.result.issue?.code === 'unknownName'
              ? t(`「${trial.blocked.label.zh}」还在等需要的数字。把能给它这个数字的图放到前面。`, `“${trial.blocked.label.en}” needs a number that is still missing. Move the picture that provides it earlier.`)
              : t('沿箭头看看哪一步能先提供需要的数字。', 'Follow the arrows and find the first action that can provide the number.')}</p>
            : focus && <p>{focus.note[locale]}</p>}
        </div>
      </div>
    </CodingDevice>
  </section>
}
