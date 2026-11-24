import { CodingDevice } from './CodingDevice'
import { useEffect, useRef, useState } from 'react'
import { runProgramSequence } from '../engine/programSequence'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Json, Locale } from '../shared/types'
import { ProgramDiagram } from './ProgramDiagram'
import { SequenceBench } from './ProgramFlowBenches'
import { runIssueText, tr } from './text'
import { StepCount } from './LessonFrame'
import './sequence-lesson.css'

type Phase = 'arrange' | 'debug' | 'repair'
type Sample = ProgramWalkthrough['cases'][number]
type Trace = ReturnType<typeof runProgramSequence>
type Attempt = { sample: Sample; trace: Trace }

function accepted({ sample, trace }: Attempt) {
  return !trace.issue && trace.output.length === 1 && trace.output[0] === sample.expected
}

function storedValue(value: Json) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const phaseOrder: readonly Phase[] = ['arrange', 'debug', 'repair']

export function SequenceLesson({ execution, locale, onComplete, onPhase }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
  /** Reports which of the three parts is open: ordering, watching the early display, or repairing. */
  onPhase?: (phase: number) => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { visual, sequence } = execution
  const [phase, setPhase] = useState<Phase>('arrange')
  const [order, setOrder] = useState<readonly string[]>(sequence?.arrange ?? [])
  const [attempt, setAttempt] = useState<Attempt>()
  const [step, setStep] = useState(0)
  const recorded = useRef(false)
  useEffect(() => onPhase?.(phaseOrder.indexOf(phase)), [onPhase, phase])
  if (!visual || !sequence) return null

  const firstSample = execution.cases[0]
  const repairSample = execution.cases[1]
  const sample = attempt?.sample ?? (phase === 'repair' ? repairSample : firstSample)
  const trace = attempt?.trace
  const steps = phase === 'debug' ? trace?.steps.slice(0, step) ?? []
    : phase === 'repair' ? trace?.steps ?? [] : []
  const current = steps.at(-1)
  const currentCard = current && visual.main.find(card => card.id === current.cardId)
  const blocked = current?.issue ?? (phase === 'repair' && steps.length === 0 ? trace?.issue : undefined)
  const bindings = current?.frame.stack[0]?.values ?? []
  const output = current?.frame.output ?? []
  const passed = attempt !== undefined && accepted(attempt)
  const values = Object.fromEntries(steps.flatMap(({ cardId, frame, issue }) =>
    !issue && frame.value !== undefined ? [[cardId, storedValue(frame.value)]] : []))

  function evaluate(cards: readonly string[], scenario: Sample): Attempt {
    return { sample: scenario, trace: runProgramSequence(execution, cards, scenario.input) }
  }

  function move(cardId: string, offset: -1 | 1) {
    const from = order.indexOf(cardId)
    const to = from + offset
    if (from < 0 || to < 0 || to >= order.length) return
    const next = [...order]
    next[from] = order[to]
    next[to] = order[from]
    setOrder(next)
    setAttempt(undefined)
  }

  function startDebug(cards: readonly string[]) {
    setPhase('debug')
    setOrder(cards)
    setStep(0)
    setAttempt(evaluate(cards, firstSample))
  }

  function startRepair(cards: readonly string[]) {
    setPhase('repair')
    setOrder(cards)
    setStep(0)
    setAttempt(undefined)
  }

  function verify() {
    const shown = evaluate(order, repairSample)
    setAttempt(shown)
    if (accepted(shown) && !recorded.current) {
      recorded.current = true
      onComplete()
    }
  }

  const finishedDebug = phase === 'debug' && trace?.steps.length === step
  const nextStation = phase === 'debug' ? trace?.steps[step]?.cardId : undefined
  function pickStation(id: string) {
    if (phase === 'debug') {
      if (id === 'step' && nextStation) setStep(step + 1)
      return
    }
    const divider = id.indexOf(':')
    const direction = Number(id.slice(0, divider))
    if (divider > 0 && (direction === -1 || direction === 1)) move(id.slice(divider + 1), direction)
  }
  const instructions = {
    arrange: t('点图卡上的箭头，把芽芽的动作排好顺序。', 'Use the arrows on the cards to put Sprout’s actions in order.'),
    debug: t('显示已经移到补电前面。一步步看程序会怎么做。', 'The display card is now before charging. Follow the program one step at a time.'),
    repair: t('这次起始电量变了。把打乱的图卡排好，再运行验证。', 'The starting charge has changed. Put these shuffled cards in order, then run the program to check.'),
  }[phase]

  let feedback = ''
  if (phase === 'arrange' && attempt) {
    feedback = passed
      ? t('这个顺序能补好电。试试把显示往前移，看看会发生什么。', 'This order charges the battery. Move the display earlier to see what happens.')
      : t('这组顺序还没补好电。想想每张图卡需要前一步准备什么。', 'This order did not finish charging. Think about what each card needs from an earlier step.')
  } else if (blocked) {
    const nextCard = visual.main.find(card => card.id === order[steps.length])
    const later = nextCard ? t(`后面的「${nextCard.label.zh}」还没执行。`, ` The next card, “${nextCard.label.en},” did not run.`) : ''
    const stop = current ? t(`程序在第 ${current.line} 步停住了。`, `The program stopped at step ${current.line}. `) : ''
    const need = blocked.code === 'unknownName' && blocked.detail
      ? currentCard?.icon === 'display'
        ? t(`屏幕要用 ${blocked.detail}，但补电还没算出这个值。`, `The screen needs ${blocked.detail}, but the charging step has not calculated that value yet.`)
        : t(`这一步需要 ${blocked.detail} 的值，可是它还没有值。`, `This step needs a value for ${blocked.detail}, but none is available yet.`)
      : runIssueText(locale, blocked)
    feedback = stop + need + later
  } else if (phase === 'repair' && attempt) {
    feedback = passed
      ? t(`修好了！屏幕显示 ${output[0]} 格。`, `Fixed! The screen shows ${output[0]} units.`)
      : t('输出还不符合预期。调整图卡后再试一次。', 'The output did not match. Move the cards and try again.')
  } else if (currentCard) {
    feedback = currentCard.note[locale]
  }

  return <section className="classroom-demonstration panel sequence-lesson" aria-label={t('补电程序的指令顺序', 'Charging program order')}
    data-testid="sequence-lesson" data-phase={phase} data-step={phase === 'debug' ? step : undefined} data-blocked={!!blocked || undefined}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      <p>{instructions}</p>
      {phase !== 'debug' && <ProgramDiagram visual={visual} locale={locale} source={execution.source} order={order}
        values={values} active={current?.cardId} onMove={move} showFunctions={false} />}
      <div className="sequence-actions">
        {phase === 'arrange' && <>
          <button type="button" className={passed ? 'subtle-button' : 'primary-button'} onClick={() => setAttempt(evaluate(order, firstSample))}>
            {t('检查顺序', 'Check the order')}
          </button>
          {passed && <button type="button" className="primary-button" onClick={() => startDebug(sequence.broken)}>
            {t('把显示提前', 'Move display earlier')}
          </button>}
        </>}
        {phase === 'debug' && <>
          <button type="button" className="subtle-button" disabled={step === 0} onClick={() => setStep(step - 1)}>
            {t('上一步', 'Previous step')}
          </button>
          <button type="button" className="primary-button" disabled={finishedDebug} onClick={() => setStep(step + 1)}>
            {t('下一步', 'Next step')}
          </button>
          {finishedDebug && <button type="button" className="primary-button" onClick={() => startRepair(sequence.repair)}>
            {t('修复打乱的步骤', 'Fix the shuffled steps')}
          </button>}
          <StepCount position={step} total={trace?.steps.length ?? 0} locale={locale} />
        </>}
        {phase === 'repair' && <button type="button" className="primary-button" onClick={verify}>
          {t('运行验证', 'Run to check')}
        </button>}
      </div>
    </>}>
      <div className="panel-heading">
        <h2>{{ arrange: t('给补电步骤排顺序', 'Order the charging steps'), debug: t('看看哪里卡住', 'Find where it stops'), repair: t('修好打乱的步骤', 'Fix the shuffled steps') }[phase]}</h2>
      </div>
      <div className="sequence-body">
        <SequenceBench locale={locale} onPick={phase !== 'debug' || nextStation ? pickStation : undefined}
          state={{ input: sample.input, move: phase !== 'debug', active: current?.cardId,
            blocked: blocked && (blocked.detail || t('停住', 'Stopped')), next: nextStation, output: output.at(-1),
            cards: order.flatMap(id => {
              const card = visual.main.find(item => item.id === id)
              return card ? [{ id, icon: card.icon, label: card.label[locale], reading: values[id] }] : []
            }) }} />
        {phase === 'debug' && <ProgramDiagram visual={visual} locale={locale} source={execution.source} order={order}
          values={values} active={current?.cardId} showFunctions={false} compact />}
        <dl className="sequence-data" aria-label={t('电量的变化', 'How the charge changes')}>
          <div className="sequence-reading">
            <dt>{t('起始电量', 'Starting charge')}</dt>
            <dd data-testid="sequence-input">{sample.input}</dd>
          </div>
          <div className="sequence-memory">
            <dt>{t('程序记下的数字', 'Numbers stored by the program')}</dt>
            <dd>{bindings.length ? bindings.map(({ name, value }) => <span key={name} data-binding={name}>
              <span>{name}</span><strong>{storedValue(value)}</strong>
            </span>) : <span>{t('还没有保存数字', 'No numbers stored yet')}</span>}</dd>
          </div>
          <div className="sequence-screen">
            <dt>{t('屏幕', 'Screen')}</dt>
            <dd><output data-testid="sequence-output">{output.length ? output.join(', ') : t('还没有输出', 'No output yet')}</output></dd>
          </div>
        </dl>
        <section className="sequence-code" data-testid="sequence-code" aria-label={t('Python 代码', 'Python code')} hidden={!steps.length}>
          <h3>{t('Python 代码', 'Python code')}</h3>
          <ol>{steps.map(({ cardId, line, code, issue }) => <li key={line} data-line={line} data-card-id={cardId}
            data-blocked={!!issue || undefined} aria-current={current?.line === line ? 'step' : undefined}>
            <span aria-hidden="true">{line}</span><code>{code}</code>
            {issue && <small>{t('卡在这一步', 'Stopped here')}</small>}
          </li>)}</ol>
        </section>
        <p className="sequence-feedback" role="status" data-testid="sequence-feedback" data-error={!!blocked || undefined}>
          {feedback}
        </p>
      </div>
    </CodingDevice>
  </section>
}
