import { useState } from 'react'
import { binaryValue, gateOutput } from '../engine/circuit'
import type { CircuitInput, CircuitLectureConfig, Gate } from '../shared/hardware'
import type { Locale } from '../shared/types'
import { CircuitSignalBench, flipCircuitBit } from './CircuitSignalBench'
import { tr } from './text'

type Edits = { base: string; history: CircuitInput[]; lastStep?: number }

export function CircuitLectureScene({ bench, step, locale, caption, onInteract }: {
  bench: CircuitLectureConfig; step: number; locale: Locale; caption: string; onInteract: () => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const frame = bench.frames[step]
  const binary = bench.mode === 'binary'
  // A child's custom bit pattern travels through all place values of the same
  // example. Each logic frame introduces a fresh prescribed gate and inputs.
  const base = binary ? frame.bits.join('') : step + '/' + frame.gate + '/' + frame.bits.join('')
  const [edits, setEdits] = useState<Edits>({ base, history: [] })
  if (edits.base !== base) setEdits({ base, history: [] })
  const history = edits.base === base ? edits.history : []
  const input = history.at(-1) ?? frame
  const justEdited = history.length > 0 && edits.lastStep === step
  const previous = justEdited ? history.at(-2) ?? frame : step > 0 ? binary && history.length ? input : bench.frames[step - 1] : undefined
  const gates = [...new Set(bench.frames.map(entry => entry.gate).filter((gate): gate is Gate => gate !== undefined))]
  const weight = (i: number) => 2 ** (input.bits.length - 1 - i)
  function change(next: CircuitInput) {
    onInteract()
    setEdits({ base, history: [...history, next], lastStep: step })
  }
  let explanation = caption
  if (history.length && binary && frame.bitIndex !== undefined) {
    const i = frame.bitIndex
    const total = binaryValue(input.bits.map((bit, index) => index <= i ? bit : 0))
    explanation = t(`你的开关是 ${input.bits.join('')}。位权 ${weight(i)} 的开关为 ${input.bits[i]}，读到这里合计 ${total}。`,
      `Your switches read ${input.bits.join('')}. The switch worth ${weight(i)} is ${input.bits[i]}. The total so far is ${total}.`)
  } else if (history.length && input.gate) {
    const [a, b] = input.bits
    const output = gateOutput(input.gate, a, b)
    explanation = input.gate === 'NOT'
      ? t(`非门只读 A。A 为 ${a}，反转后输出 ${output}。`, `NOT reads A alone. A is ${a}, so its inverse is ${output}.`)
      : t(`A 为 ${a}，B 为 ${b}。这两路信号经过 ${input.gate} 门，输出为 ${output}。`,
        `A is ${a} and B is ${b}. The ${input.gate} gate turns these signals into ${output}.`)
  }
  return <section className="circuit-lecture" aria-label={t('维修站信号台', 'Repair station signal bench')}>
    <CircuitSignalBench input={input} previous={previous} binary={binary} focusBit={frame.bitIndex}
      previousFocus={justEdited ? frame.bitIndex : bench.frames[step - 1]?.bitIndex} gates={gates} locale={locale} onChange={change} />
    <div className="circuit-lecture-controls" role="group" aria-label={t('输入开关', 'Input switches')}>
      {input.bits.map((bit, i) => <button type="button" className="subtle-button" key={i} aria-pressed={bit === 1}
        aria-label={binary ? t('位权 ', 'Weight ') + weight(i) : i === 0 ? 'A' : 'B'}
        onClick={() => change(flipCircuitBit(input, i))}>
        {binary ? t('位权 ', 'Weight ') + weight(i) : i === 0 ? 'A' : 'B'} · {bit}
      </button>)}
      {gates.length > 1 && <label>{t('逻辑门', 'Gate')} <select value={input.gate}
        onChange={event => change({ ...input, gate: event.target.value as Gate })}>
        {gates.map(gate => <option value={gate} key={gate}>{gate}</option>)}</select></label>}
      {history.length > 0 && <button className="subtle-button" type="button" onClick={() => {
        onInteract()
        setEdits({ base, history: history.slice(0, -1), lastStep: step })
      }}>{t('撤销上次操作', 'Undo last change')}</button>}
    </div>
    <p className="animation-caption" aria-live="polite">{explanation}</p>
  </section>
}
