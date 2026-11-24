import { useState } from 'react'
import type { MachineInstruction, MachineState } from '../shared/hardware'
import type { Locale } from '../shared/types'
import { TeachingModel } from './station3d/TeachingModel'
import { tr } from './text'
import './cpu-datapath.css'

const loadModel = () => import('./station3d/hardware-instruments').then(module => module.buildCpuModel)
export type CpuPhase = 'fetch' | 'decode' | 'execute'

type Props = {
  state: MachineState; previous?: MachineState; instruction?: MachineInstruction; line?: number; phase?: CpuPhase
  locale: Locale; onStep?: () => void; onAddress?: (address: number) => void
}

export function CpuDatapath({ state, previous = state, instruction, line, phase = 'execute', locale, onStep, onAddress }: Props) {
  const [pin, setPin] = useState<number>()
  const pinned = pin !== undefined && pin < state.memory.length ? pin : undefined
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const active = instruction && instruction.op !== 'HALT' ? instruction.address : undefined
  const address = pinned ?? (phase !== 'fetch' ? active : undefined)
  const op = instruction?.op
  const running = !!instruction && phase === 'execute'
  const math = op === 'ADD' || op === 'SUB'
  const operand = active === undefined ? undefined : previous.memory[active]
  const stored = active === undefined ? undefined : state.memory[active]
  const sourceLine = instruction && (instruction.op === 'HALT' ? 'HALT' : instruction.op + ' ' + instruction.address)
  const operandText = operand !== undefined && operand < 0 ? '(' + operand + ')' : String(operand)
  const equation = math && running ? previous.accumulator + (op === 'ADD' ? ' + ' : ' − ') + operandText + ' = ' + state.accumulator : undefined
  function inspect(value?: number) {
    setPin(value)
    if (value !== undefined) onAddress?.(value)
  }
  const label = phase === 'fetch' ? t('取指', 'Fetch') : phase === 'decode' ? t('译码', 'Decode') : t('已执行', 'Executed')
  return <section className="cpu-datapath" data-phase={phase} data-op={op} aria-label={t('CPU 数据通路', 'CPU datapath')}>
    <TeachingModel sceneKey="cpu-transfer" locale={locale} label={t('维修站 CPU 数据通路', 'Repair station CPU datapath')}
      load={loadModel} state={{ state, previous, instruction, phase, locale, pinned, equation, canStep: !!onStep }}
      onPick={key => {
        if (key === 'clock') onStep?.()
        else if (key.startsWith('ram:')) inspect(Number(key.slice(4)))
      }} />
    {instruction && <div className="cpu-instruction-readout" data-testid="cpu-current-instruction">
      <span>{label}{line !== undefined && ' · ' + t(`第 ${line} 行`, `Line ${line}`)}</span>
      <code aria-current="step">{sourceLine}</code>
      {running && <span className="cpu-counter-trace">PC {previous.pc} → {state.pc}</span>}
    </div>}
    {instruction && <ol className="cpu-signal-flow" key={previous.pc + '-' + op + '-' + phase} aria-label={t('本步数据传送', 'Data movement this step')}>
      {phase === 'fetch' ? <>
        <li data-action="read">{t('取指地址', 'Instruction address')} <code>PC {state.pc}</code></li>
        <li data-action="decode">{t('读到指令', 'Fetched')} <code>{sourceLine}</code></li>
      </> : phase === 'decode' ? <>
        <li data-action="decode">{t('指令', 'Instruction')} <code>{op}</code></li>
        {active !== undefined && <li>{t('定位地址', 'Select address')} <code>[{active}]</code></li>}
        {op === 'HALT' && <li>{t('准备停机', 'Prepare to halt')}</li>}
      </> : op === 'HALT' ? <li data-action="halt">{t('时钟停止取指', 'Instruction fetch stopped')}</li> : <>
        <li data-action="read">{t('读取', 'Read')} <code>{op === 'STORE' ? 'ACC ' + previous.accumulator : 'RAM[' + active + '] = ' + operand}</code></li>
        {equation && <li data-action="alu">{t('运算器', 'ALU')} <code>{equation}</code></li>}
        <li data-action="write" data-changed={op === 'STORE' ? operand !== stored : previous.accumulator !== state.accumulator}>
          {t('写入', 'Write')} <code>{op === 'STORE' ? 'RAM[' + active + '] ' + operand + ' → ' + stored
            : 'ACC ' + previous.accumulator + ' → ' + state.accumulator}</code>
        </li>
      </>}
    </ol>}
    {state.memory.length > 0 && <div className="cpu-probe">
      <label>{t('查看内存', 'Inspect memory')} <select value={pinned ?? ''} onChange={e => inspect(e.target.value === '' ? undefined : Number(e.target.value))}>
        <option value="">{t('跟随指令', 'Follow instruction')}</option>
        {state.memory.map((_, i) => <option key={i} value={i}>{'[' + i + ']'}</option>)}
      </select></label>
      {address !== undefined && <output data-testid="cpu-probe-reading"><code>RAM[{address}] = {state.memory[address]}</code></output>}
    </div>}
  </section>
}
