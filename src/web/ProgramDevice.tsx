import type { ReactNode } from 'react'
import type { ProgramInterface, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { ChargeChange } from './ChargeChange'

export type DevicePhase = 'idle' | 'command' | 'input' | 'submit' | 'request' | 'process' | 'response' | 'output' | 'error'

type DeviceProps = {
  mode: ProgramInterface
  locale: Locale
  cases: ProgramWalkthrough['cases']
  selected: number
  command: string
  rule: string
  phase: DevicePhase
  reply?: { input: number; output: string }
  previousCommand?: { input: number; output: string }
  preview: boolean
  locked: boolean
  choose: (index: number) => void
  run: () => void
}

function DeviceBar({ children, icon }: { children: ReactNode; icon: string }) {
  return <div className="device-window-bar"><span aria-hidden="true" className="device-window-icon">{icon}</span>{children}</div>
}

export function ProgramDevice({ mode, locale, cases, selected, command, rule, phase, reply, previousCommand, preview, locked, choose, run }: DeviceProps) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const input = cases[selected].input
  const web = mode === 'web'
  const sent = ['submit', 'request', 'process', 'response', 'output'].includes(phase) || (mode === 'cli' && phase === 'input')
  const calculated = phase === 'process' || phase === 'response' || phase === 'output'
  const returning = phase === 'response' || phase === 'output'
  const field = t('起始电量', 'Starting charge')
  const output = <div className="device-readout" data-current={phase === 'output' || undefined}>
    <span>{t('输出', 'Output')}</span>
    <output data-testid="program-interface-output">{phase === 'output' ? reply?.output : '—'}</output>
  </div>
  const choices = <fieldset className="device-keys">
    <legend>{mode === 'cli' ? t('选一个数字填进命令', 'Choose a number for the command') : field}</legend>
    {cases.map(({ input: value, label }, index) => <button type="button" key={index} aria-label={label[locale]}
      title={label[locale]} aria-pressed={selected === index} disabled={locked} onClick={() => choose(index)}>{value}</button>)}
  </fieldset>
  const action = <button type="button" className="device-submit" disabled={locked} onClick={run}>
    <span aria-hidden="true">{mode === 'cli' ? '↵' : web ? '↑' : '='}</span>
    {mode === 'cli' ? t('提交命令', 'Submit command') : web ? t('发送到服务器', 'Send to server') : t('计算新电量', 'Calculate the new charge')}
  </button>
  const program = web ? t('服务器', 'Server') : t('补电程序', 'Charging program')
  return <div className="program-device" data-phase={phase} data-testid="program-device">
    <div className="device-pair" data-mode={mode}>
      {mode === 'cli' ? <section className="device-client device-shell" aria-label={t('模拟终端', 'Simulated terminal')}>
        <DeviceBar icon="›_">{t('维修站终端', 'Station terminal')}</DeviceBar>
        <div className="device-shell-display">
          {previousCommand && <div className="device-terminal-history">
            <small>{t('上一条命令', 'Previous command')}</small>
            <code>$ {command} {previousCommand.input}</code>
            <samp>{previousCommand.output}</samp>
          </div>}
          <code><span aria-hidden="true">$ </span>{command} <b>{input}</b><i aria-hidden="true" /></code>
          {output}
        </div>
        <div className="device-keyboard">{choices}{action}</div>
      </section> : mode === 'gui' ? <section className="device-client device-calculator" aria-label={t('模拟计算器', 'Simulated calculator')}>
        <DeviceBar icon="▦">{t('补电计算器', 'Charge calculator')}</DeviceBar>
        <div className="calculator-lcd">
          <div className="device-readout"><span>{field}</span><strong>{input}</strong></div>
          <b aria-hidden="true">→</b>{output}
        </div>
        <div className="device-keyboard">{choices}{action}</div>
      </section> : <section className="device-client device-browser" aria-label={t('模拟浏览器', 'Simulated browser')}>
        <DeviceBar icon="▤">{t('浏览器', 'Browser')}</DeviceBar>
        <div className="device-url"><span aria-hidden="true">⌕</span><span>station.test/charge</span></div>
        <div className="device-webpage">
          <h3>{t('芽芽补电站', 'Sprout’s charging station')}</h3>
          {choices}{action}{output}
        </div>
      </section>}
      <div className="device-link" aria-label={t('数据传递', 'Data transfer')}>
        <div className="device-parcel" data-travel="out" data-moving={sent && !calculated || undefined}>
          <span>{web ? t('请求', 'Request') : t('送入', 'Send in')}</span>
          <strong>{sent ? input : '·'}</strong><i aria-hidden="true" />
        </div>
        <div className="device-parcel" data-travel="back" data-moving={phase === 'response' || undefined}>
          <span>{web ? t('回信', 'Reply') : t('交回', 'Return')}</span>
          <strong>{returning ? reply?.output : '·'}</strong><i aria-hidden="true" />
        </div>
      </div>
      <section className="device-processor" data-active={phase === 'process' || undefined}
        data-testid="interface-processor" aria-label={program}>
        <div className="device-processor-head"><span className="device-machine-icon" aria-hidden="true"><i /><i /></span><h3>{program}</h3></div>
        <dl>
          <div><dt>{t('收到', 'Received')}</dt><dd data-testid="processor-input">{calculated ? reply?.input : '—'}</dd></div>
          <div><dt>{t('算出', 'Calculated')}</dt><dd data-testid="processor-result">{calculated ? reply?.output : '—'}</dd></div>
        </dl>
        <div className="device-rule">{calculated && reply
          ? <ChargeChange input={reply.input} output={reply.output} locale={locale} /> : rule}</div>
        {web && preview && <small>{t('试玩使用模拟服务器', 'Preview uses a simulated server')}</small>}
      </section>
    </div>
  </div>
}
