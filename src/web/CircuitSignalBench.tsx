import { binaryValue, gateOutput } from '../engine/circuit'
import type { Bit, CircuitInput, Gate } from '../shared/hardware'
import type { Locale } from '../shared/types'
import { TeachingModel } from './station3d/TeachingModel'
import { tr } from './text'
import './circuit-signal-bench.css'

const loadSwitchboard = () => import('./station3d/hardware-instruments').then(module => module.buildSwitchboardModel)

export function flipCircuitBit(input: CircuitInput, slot: number): CircuitInput {
  return { ...input, bits: input.bits.map((bit, i): Bit => i === slot ? (bit === 1 ? 0 : 1) : bit) }
}

function reading(input: CircuitInput, bitIndex?: number) {
  return binaryValue(bitIndex === undefined ? input.bits : input.bits.map((bit, i) => i <= bitIndex ? bit : 0))
}

export function CircuitSignalBench({ input, previous, binary, focusBit, previousFocus, gates, locale, onChange }: {
  input: CircuitInput; previous?: CircuitInput; binary: boolean; focusBit?: number; previousFocus?: number
  gates?: Gate[]; locale: Locale; onChange: (next: CircuitInput) => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { bits, gate } = input
  const value = reading(input, focusBit)
  const before = previous && reading(previous, previousFocus)
  const output = gate && gateOutput(gate, bits[0], bits[1])
  const beforeOutput = previous?.gate && gateOutput(previous.gate, previous.bits[0], previous.bits[1])
  const changedBits = bits.map((bit, i) => !!previous && bit !== previous.bits[i])
  const changedGate = !!previous && previous.gate !== gate
  const weight = (index: number) => 2 ** (bits.length - index - 1)
  const sum = bits.slice(0, focusBit === undefined ? bits.length : focusBit + 1)
  const gateSelectable = !!gate && !!gates && gates.length > 1
  function trace(before: number | undefined, after: number) {
    if (before === undefined) return String(after)
    return before === after ? t('保持 ' + after, 'still ' + after) : before + ' → ' + after
  }
  return <div className="circuit-signals">
    <TeachingModel sceneKey="circuit-switchboard" locale={locale}
      label={binary ? t('二进制开关与读数', 'Binary switches and reading') : t('逻辑门与输出灯', 'Logic gate and output lamp')}
      state={{ ...input, binary, value, output, focusBit, changedBits, changedGate,
        changedValue: before !== undefined && value !== before, changedOutput: beforeOutput !== undefined && output !== beforeOutput, gateSelectable }}
      load={loadSwitchboard} onPick={id => {
        if (id === 'gate' && gate && gates && gateSelectable) onChange({ ...input, gate: gates[(gates.indexOf(gate) + 1) % gates.length] })
        else if (/^\d+$/.test(id)) onChange(flipCircuitBit(input, Number(id)))
      }} />
    <div className="circuit-signal-lines" aria-live="polite">
      {binary && <div className="circuit-formula" data-testid="binary-formula">
        <span>{focusBit === undefined ? t('位权之和', 'Sum of active weights') : t('累计到位权 ' + weight(focusBit), 'Sum through weight ' + weight(focusBit))}</span>
        <code>{sum.map((bit, i) => <span key={i}>{i > 0 && ' + '}<b data-focus={focusBit === i || changedBits[i] || undefined}>{weight(i)} × {bit}</b></span>)} = {value}</code>
      </div>}
      {gate && <div className="circuit-formula" data-testid="gate-formula">
        <span>{t('逻辑门计算', 'Gate operation')}</span>
        <code>{gate === 'NOT' ? 'NOT ' + bits[0] : bits[0] + ' ' + gate + ' ' + bits[1]} = {output}</code>
      </div>}
      {previous && <div className="circuit-deltas" data-testid="signal-changes">
        {changedBits.map((changed, i) => changed && <span key={i} data-changed>
          {binary ? t('位权 ', 'Weight ') + weight(i) : i === 0 ? 'A' : 'B'} · {trace(previous.bits[i], bits[i])}
        </span>)}
        {changedGate && <span data-changed>{previous.gate} → {gate}</span>}
        {binary && <span data-changed={before !== value || undefined}>{t('读数', 'Reading')} · {trace(before, value)}</span>}
        {output !== undefined && <span data-changed={beforeOutput !== output || undefined}>
          {t('输出灯', 'Output lamp')} · {trace(beforeOutput, output)}
        </span>}
      </div>}
    </div>
  </div>
}
