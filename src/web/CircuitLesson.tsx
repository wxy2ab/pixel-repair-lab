import { useClassroom, CommandDesk } from './Classroom'
import { ExperimentWindow } from './ExperimentWindow'
import { CircuitSignalBench, flipCircuitBit } from './CircuitSignalBench'
import ComponentCircuitBench from './ComponentCircuitBench'
import { useState } from 'react'
import { binaryValue, circuitMeetsGoal, gateOutput, isComponentCircuit } from '../engine/circuit'
import type { Bit, CircuitCase, CircuitInput, CircuitLevel, Gate } from '../shared/hardware'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { HintSteps } from './HintSteps'
import { TaskProgress } from './TaskProgress'
import './circuit.css'

function startingInput(scenario: CircuitCase): CircuitInput {
  return { bits: [...scenario.bits], gate: scenario.gate }
}

const gateNames: Record<Gate, [string, string]> = {
  AND: ['与门', 'AND gate'],
  OR: ['或门', 'OR gate'],
  NOT: ['非门', 'NOT gate'],
  XOR: ['异或门', 'XOR gate'],
}

function TruthTable({ gate, bits, locale }: { gate: Gate; bits: Bit[]; locale: Locale }) {
  const inputs: [Bit, Bit][] = gate === 'NOT' ? [[0, 0], [1, 0]] : [[0, 0], [0, 1], [1, 0], [1, 1]]
  return <table className="lesson-table truth-table">
    <caption>{tr(locale, '真值表', 'Truth table')}</caption>
    <thead><tr><th scope="col">A</th>{gate !== 'NOT' && <th scope="col">B</th>}<th scope="col">{tr(locale, '输出', 'Output')}</th></tr></thead>
    <tbody>{inputs.map(([a, b]) => {
      const live = bits[0] === a && (gate === 'NOT' || bits[1] === b)
      return <tr key={a + ':' + b} className={live ? 'truth-active' : undefined} aria-current={live ? 'true' : undefined}>
        <td>{a}</td>{gate !== 'NOT' && <td>{b}</td>}<td>{gateOutput(gate, a, b)}</td>
      </tr>
    })}</tbody>
  </table>
}

export default function CircuitLesson({ level, locale, onComplete, onMistake }: {
  level: CircuitLevel; locale: Locale; onComplete: () => void; onMistake?: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [selected, setSelected] = useState(0)
  const [histories, setHistories] = useState(() => level.cases.map(scenario => [startingInput(scenario)]))
  const [touched, setTouched] = useState<number[]>([])
  const [reviews, setReviews] = useState<Partial<Record<number, boolean>>>({})
  const scenario = level.cases[selected]
  const history = histories[selected]
  const input = history[history.length - 1]
  const demo = level.stage !== 'exercise' && level.stage !== 'challenge'
  const usesBinary = level.mode === 'binary' || level.mode === 'combined'
  const componentMode = isComponentCircuit(level.mode) ? level.mode : undefined
  const value = binaryValue(input.bits)
  const output = input.gate === undefined ? undefined : gateOutput(input.gate, input.bits[0], input.bits[1])
  const passed = level.cases.filter((_, index) => reviews[index] === true).length

  function change(next: CircuitInput) {
    setHistories(previous => previous.map((items, index) => index === selected ? [...items, next] : items))
    setTouched(previous => previous.includes(selected) ? previous : [...previous, selected])
    setReviews(previous => ({ ...previous, [selected]: undefined }))
  }

  function flip(index: number) {
    change(flipCircuitBit(input, index))
  }

  function undo() {
    if (history.length <= 1) return
    setHistories(previous => previous.map((items, index) => index === selected ? items.slice(0, -1) : items))
    setReviews(previous => ({ ...previous, [selected]: undefined }))
    if (history.length === 2) setTouched(previous => previous.filter(index => index !== selected))
  }

  function reset() {
    setHistories(previous => previous.map((items, index) => index === selected ? [startingInput(scenario)] : items))
    setReviews(previous => ({ ...previous, [selected]: undefined }))
    setTouched(previous => previous.filter(index => index !== selected))
  }

  function check() {
    const met = demo ? touched.includes(selected) : circuitMeetsGoal(scenario, input, level.mode)
    const next = { ...reviews, [selected]: met }
    setReviews(next)
    if (!demo && !met) onMistake?.()
    if (level.cases.every((_, index) => next[index] === true)) onComplete()
  }

  const classroom = useClassroom()
  const goal = scenario.goal
  const switches = <div className="bit-buttons" role="group" aria-label={t('输入开关', 'Input switches')}>
    {input.bits.map((bit, index) => {
      const weight = 2 ** (input.bits.length - index - 1)
      const name = !usesBinary ? (index === 0 ? 'A' : 'B') : t('位 ', 'Bit ') + (index + 1)
      const wire = input.gate && index < 2 ? index === 0 ? 'A' : 'B' : undefined
      return <button key={index} type="button" className="bit-switch" aria-label={name} aria-pressed={bit === 1}
        data-unwired={input.gate === 'NOT' && index === 1 || undefined} onClick={() => flip(index)}>
        <span>{name}{usesBinary && wire && <small>{wire}</small>}</span>
        <strong>{bit}</strong>
        {usesBinary && <small>{t('位权', 'Weight')} {weight}</small>}
      </button>
    })}
  </div>
  const gatePicker = level.gateChoices && <div className="segmented gate-options" role="group" aria-label={t('选择逻辑门', 'Choose a gate')}>
    {level.gateChoices.map(gate => <button key={gate} type="button" aria-pressed={input.gate === gate}
      onClick={() => { if (input.gate !== gate) change({ ...input, gate }) }}>{gate}</button>)}
  </div>

  return <div className="lesson-layout classroom-split">
    <ExperimentWindow locale={locale} kind="instrument" title={t('电路实验台', 'Circuit bench')}>
      <div className="play-column">
        {componentMode ? <ComponentCircuitBench mode={componentMode} bits={input.bits} locale={locale} onFlip={flip} /> :
        <section className="panel circuit-panel">
          <h2>{classroom ? (usesBinary ? t('二进制读数', 'Binary meter') : t('逻辑门接线板', 'Logic gate panel')) : scenario.label[locale]}</h2>
          {classroom && <CircuitSignalBench input={input} previous={history.at(-2)} binary={usesBinary}
            gates={level.gateChoices} locale={locale} onChange={change} />}
          <div className="circuit-workbench">
            {classroom && usesBinary && switches}
            {classroom && gatePicker}
            {usesBinary && <div className="binary-readout" aria-label={t('十进制读数', 'Decimal reading')}>
              <div><strong>{input.bits.join('')}</strong><small>{t('二进制', 'Binary')}</small></div>
              <span aria-hidden="true">=</span>
              <div><strong data-testid="circuit-value">{value}</strong><small>{t('十进制', 'Decimal')}</small></div>
            </div>}
            {input.gate && output !== undefined && <div className="gate-workbench">
              {classroom && !usesBinary ? <div className="gate-input-rack">{switches}</div> : classroom ? <div className="gate-input-pins">
                <span data-live={input.bits[0] === 1}>A · {input.bits[0]}</span>
                {input.gate !== 'NOT' && <span data-live={input.bits[1] === 1}>B · {input.bits[1]}</span>}
              </div> : <div className="gate-wire">{input.bits[0]}{input.gate !== 'NOT' && ' · ' + input.bits[1]}</div>}
              <div className={'gate-symbol gate-' + input.gate.toLowerCase()}>{input.gate}</div>
              <div className={'gate-wire gate-wire-' + output} />
              <div className={'gate-lamp gate-lamp-' + output} aria-label={t('门输出', 'Gate output')} data-testid="gate-output">{output}</div>
              {classroom && <span className="gate-lamp-label">{output === 1 ? t('灯亮', 'Lamp on') : t('灯灭', 'Lamp off')}</span>}
            </div>}
          </div>
        </section>}
        {input.gate && <section className="panel teaching-panel">
          <h2>{tr(locale, ...gateNames[input.gate])}</h2>
          {input.gate === 'NOT' && <p>{t('非门只反转 A，B 不参与计算。', 'NOT flips A. The value of B does not affect the output.')}</p>}
          <TruthTable gate={input.gate} bits={input.bits} locale={locale} />
        </section>}
      </div>
    </ExperimentWindow>
    <CommandDesk locale={locale}>
      <div className="play-column">
        <section className="panel circuit-panel">
          <h2>{classroom || componentMode ? t('实验任务', 'Experiment task') : t('电路开关', 'Circuit switches')}</h2>
          {level.cases.length > 1 && <div className="demo-picker circuit-cases" role="group" aria-label={t('实验场景', 'Circuit scenarios')}>
            {level.cases.map((entry, index) => <button type="button" className="subtle-button" key={index}
              aria-pressed={selected === index} onClick={() => setSelected(index)}>
              {entry.label[locale]}{reviews[index] === true && ' ✓'}
            </button>)}
          </div>}
          {!classroom && !componentMode && <>{switches}{gatePicker}</>}
          <div className="editor-footer">
            <button type="button" className="primary-button" disabled={demo && !touched.includes(selected)} onClick={check}>
              {demo ? t('记录观察', 'Record observation') : t('检查设置', 'Check settings')}
            </button>
            <button type="button" className="subtle-button" onClick={reset}>
              {componentMode ? t('重置电路', 'Reset circuit') : t('重置开关', 'Reset switches')}
            </button>
            {!componentMode && <button type="button" className="subtle-button" disabled={history.length < 2} onClick={undo}>
              {t('撤销上次操作', 'Undo last change')}
            </button>}
          </div>
        </section>
        <section className="panel teaching-panel">
          <h2>{demo ? t('观察记录', 'Observations') : t('电路目标', 'Circuit goal')}</h2>
          {goal ? <ul className="circuit-targets">
            {goal.value !== undefined && <li>{t('十进制读数', 'Decimal reading')} <code>{goal.value}</code></li>}
            {goal.output !== undefined && <li>{componentMode ? (goal.output ? t('LED 亮', 'LED on') : t('LED 灭', 'LED off')) :
              <>{t('门输出', 'Gate output')} <code>{goal.output}</code></>}</li>}
            {goal.switchClosed !== undefined && <li>{goal.switchClosed ? t('开关闭合', 'Switch closed') : t('开关断开', 'Switch open')}</li>}
            {goal.diodeForward !== undefined && <li>{goal.diodeForward ? t('二极管正向', 'Diode forward') : t('二极管反向', 'Diode reversed')}</li>}
            {goal.baseHigh !== undefined && <li>{t('基极输入', 'Base input')} <code>{goal.baseHigh ? 'HIGH' : 'LOW'}</code></li>}
            {goal.gate && <li>{t('逻辑门', 'Gate')} <code>{goal.gate}</code></li>}
          </ul> : <p>{t('改变输入，比较变化前后的读数。', 'Change an input and compare the readings.')}</p>}
          <p data-task-success={reviews[selected] === true || undefined}
            className={reviews[selected] === true ? 'win-message' : reviews[selected] === false ? 'error-message' : ''}
            role="status">
            {reviews[selected] === true ? demo ? t('已记录这一组。', 'Observation recorded.') : t('这一组设置正确。', 'This setup is correct.') :
              reviews[selected] === false ? (componentMode ? t('看看 LED 和两个控制钮的状态，哪一项和任务不同？', 'Look at the LED and both controls. Which state differs from the task?') :
                t('还有条件没满足。对照目标检查读数和门输出。', 'A target is still unmet. Compare the reading and gate output with the goal.')) :
                t('当前场景', 'Current scenario') + ' · ' + scenario.label[locale]}
          </p>
          <TaskProgress label={t('已完成场景', 'Scenarios complete')} done={passed} total={level.cases.length} />
          {level.hints.length > 0 && <details><summary>{t('任务提示', 'Mission hints')}</summary><HintSteps hints={level.hints} locale={locale} /></details>}
        </section>
      </div>
    </CommandDesk>
  </div>
}
