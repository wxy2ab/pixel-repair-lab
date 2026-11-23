import { useState } from 'react'
import type { GridSnapshot, Json, Locale, RunFrame, Scenario } from '../shared/types'
import { TeachingModel } from './station3d/TeachingModel'
import { CpuDatapath } from './CpuDatapath'
import type { GridBenchState } from './station3d/grid-hardware-bench'
import { pythonValue } from './pythonValue'
import { tr } from './text'
import './grid-hardware-bench.css'

const load = () => import('./station3d/grid-hardware-bench').then(module => module.buildGridHardware)

export function gridBenchKind(unit: string | undefined, scenario: Scenario) {
  if (unit === 'architecture') {
    if (scenario.instructions?.length) return 'cpu'
    if (scenario.memory?.length) return 'memory'
  }
  if (unit !== 'computer' || !Array.isArray(scenario.input) || !scenario.input.length || scenario.input.length > 8) return
  if (scenario.input.every(bit => typeof bit === 'boolean')) return 'logic'
  if (scenario.input.every(bit => bit === 0 || bit === 1)) return 'binary'
}

export function GridHardwareBench({ mode, scenario, snapshot, before, frame, submitted, locale, onStep }: {
  mode: GridBenchState['mode'] | 'cpu'; scenario: Scenario; snapshot: GridSnapshot; before: GridSnapshot
  frame?: RunFrame; submitted?: Json; locale: Locale; onStep?: () => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [probe, setProbe] = useState<number>()
  if (mode === 'cpu') {
    const executed = frame?.action === 'step' && snapshot.pc !== before.pc
    const pc = executed ? before.pc : snapshot.pc
    const instruction = scenario.instructions?.[pc]
    return <section className="grid-hardware-bench" data-testid="grid-cpu-bench">
      <CpuDatapath state={{ ...snapshot, steps: snapshot.pc }} previous={{ ...before, steps: before.pc }}
        instruction={instruction} phase={executed ? 'execute' : 'fetch'} locale={locale} onStep={onStep} />
      <ol className="grid-instruction-tape" aria-label={t('CPU 指令', 'CPU instructions')}>
        {scenario.instructions?.map((cmd, i) => <li key={i} data-current={executed && i === pc || undefined}
          data-next={!snapshot.halted && i === snapshot.pc || undefined} aria-current={executed && i === pc ? 'step' : undefined}>
          <small>{i}</small><code>{cmd.op}{'address' in cmd ? ' ' + cmd.address : ''}</code>
          {executed && i === pc ? <b>{t('刚执行', 'Executed')}</b> : !snapshot.halted && i === snapshot.pc ? <small>{t('下一条', 'Next')}</small> : null}
        </li>)}
      </ol>
    </section>
  }
  const memory = mode === 'memory'
  const values = memory ? snapshot.memory : (scenario.input as Json[]).map(Number)
  const address = frame?.memoryAddress
  const action = frame?.action
  const operation = action === 'load' || action === 'store' || action === 'scan' || action === 'submit' ? action : undefined
  const selected = probe ?? address ?? 0
  const port = memory && address !== undefined ? frame?.value : submitted
  const reading = port === undefined ? undefined : pythonValue(port)
  const label = memory ? t('内存寻址台', 'Memory address bench') : t('芽芽的信号接收台', 'Sprout’s signal receiver')
  const name = (i: number) => memory ? 'RAM[' + i + ']' : mode === 'logic' ? String.fromCharCode(65 + i) : t('位权 ', 'Weight ') + 2 ** (values.length - i - 1)
  return <section className="grid-hardware-bench" data-testid="grid-hardware-bench" data-access={operation} data-address={address}>
    <TeachingModel sceneKey={'grid-' + mode + '-bench'} label={label} locale={locale} load={load}
      state={{ mode, values, selected, locale, action: operation, address, reading: reading && reading.length > 10 ? reading.slice(0, 9) + '…' : reading }}
      onPick={id => setProbe(Number(id))} />
    <div className="grid-bench-readings">
      <label>{t('探针', 'Probe')} <select value={probe ?? ''} onChange={e => setProbe(e.target.value === '' ? undefined : Number(e.target.value))}>
        <option value="">{t('跟随程序', 'Follow program')}</option>
        {values.map((_, i) => <option key={i} value={i}>{name(i)}</option>)}
      </select></label>
      <code>{name(selected)} = {values[selected]}</code>
    </div>
    {memory && address !== undefined && <p className="grid-bench-transfer" data-changed={before.memory[address] !== snapshot.memory[address]}>
      {action === 'store' ? t('写入', 'Write') : t('读取', 'Read')} <code>{'RAM[' + address + ']'}</code>
      {' · '}<strong>{action === 'store' ? before.memory[address] + ' → ' + snapshot.memory[address] : snapshot.memory[address]}</strong>
    </p>}
    {!memory && <div className="grid-bench-readings"><span>{t('传感器', 'Sensor')} <code>{pythonValue(scenario.input!)}</code></span>
      <span>{t('程序提交', 'Submitted by the program')} <code>{reading ?? '—'}</code></span></div>}
  </section>
}
