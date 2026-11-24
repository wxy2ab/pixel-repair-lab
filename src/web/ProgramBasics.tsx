import { useEffect, useEffectEvent, useState, type CSSProperties, type ReactNode } from 'react'
import { runProgramWalkthrough } from '../engine/programWalkthrough'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { CommandDesk, TeachingScreen } from './Classroom'
import { DeviceWindow } from './DeviceWindow'
import { ChargeChange } from './ChargeChange'
import { StepExplanation } from './LessonNotes'
import { TeachingModel } from './station3d/TeachingModel'
import './program-basics.css'

type ProgramStep = 'input' | 'process' | 'output'
const loadCharger = () => import('./station3d/python-input-instrument').then(module => module.buildCharger)

export function ProgramBasics({ execution, locale, onReady, onNewInput, notes, exercise }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void; onNewInput: () => void;
  notes?: ReactNode; exercise?: ReactNode
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [selected, setSelected] = useState(0)
  const [step, setStep] = useState<ProgramStep>('input')
  const [result, setResult] = useState<string>()
  const [observations, setObservations] = useState<{ input: number; output: string }[]>([])
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const sample = execution.cases[selected]
  const rule = execution.intro?.rule[locale] ?? t('按预先定好的步骤处理', 'Follow the predefined steps')
  const completed = step === 'output'
  const scale = Math.max(10, ...execution.cases.map(({ input, expected }) =>
    Math.max(input, Number.isFinite(Number(expected)) ? Number(expected) : 0)))
  const chargeFill = (value: number): CSSProperties => ({
    '--fill': Math.min(100, Math.max(0, 100 * value / scale)) + '%',
  } as CSSProperties)

  function choose(index: number) {
    onNewInput()
    setPlaying(false)
    setSelected(index)
    setStep('input')
    setResult(undefined)
    setFailed(false)
  }

  function advance() {
    if (step === 'input') {
      const run = runProgramWalkthrough(execution.source, sample.input)
      setFailed(Boolean(run.issue) || run.output.length !== 1)
      if (!run.issue && run.output.length === 1) {
        setResult(run.output[0])
        setStep('process')
      } else setPlaying(false)
    } else if (step === 'process' && result !== undefined) {
      setStep('output')
      setPlaying(false)
      setObservations(previous => [...previous.filter(row => row.input !== sample.input), { input: sample.input, output: result }])
      if (observations.length === 0) onReady()
    } else {
      choose(selected)
    }
  }

  const playStep = useEffectEvent(advance)
  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => playStep(), 1500)
    return () => window.clearTimeout(timer)
  }, [playing, step])

  const status = step === 'input' ? t(`读数槽装入了 ${sample.input} 格电池。按按钮，让程序读入这个数。`,
    `The cradle holds a ${sample.input}-unit battery. Press the button to send its charge to the program.`)
    : step === 'process' ? t(`补电模块读到了 ${sample.input}，正在按这条规则处理。点「查看输出」把结果送到电量屏。`,
      `The charger read ${sample.input} and applied its rule. Select Show the output to send the result to the display.`)
    : t(`电量屏显示 ${result}。换一块电池试试，补电规则还是同一条。`,
      `The display reads ${result}. Try another battery with the same charging rule.`)
  return <section className="program-basics" data-testid="program-basics" data-program-step={step}>
    <div className="classroom-split">
      <DeviceWindow kind="instrument" locale={locale} title={t('维修站补电机', 'Workshop battery charger')} className="charger-device">
        <fieldset className="charger-tray">
          <legend>{t('选一块电池', 'Choose a battery')}</legend>
          <div className="charger-stock">
            {execution.cases.map(({ input }, index) => <button type="button" key={index} aria-pressed={index === selected}
              data-basic-case={input} onClick={() => choose(index)}>
              <span className="charger-pack" style={chargeFill(input)} aria-hidden="true"><i /></span>
              {t(`${input} 格`, `${input} ${input === 1 ? 'unit' : 'units'}`)}
            </button>)}
          </div>
        </fieldset>
        <TeachingModel sceneKey="program-charger" label={t('补电机里的数据流向', 'Follow the charge through the machine')}
          locale={locale} load={loadCharger} state={{ input: sample.input, output: step !== 'input' ? result : undefined, step, locale }}
          onPick={() => { setPlaying(false); advance() }} />
        <ol className="charger-circuit" aria-label={t('输入、处理、输出', 'Input, processing, output')}>
          <li data-testid="program-basic-input" aria-current={step === 'input' ? 'step' : undefined}>
            <h3>{t('读数槽', 'Reader')} <small>{t('输入', 'Input')}</small></h3>
            <div className="charger-cradle">
              <div className="charger-socket" aria-hidden="true" />
              <div className="charger-cell" key={selected} style={chargeFill(sample.input)}><strong>{sample.input}</strong></div>
            </div>
          </li>
          <li data-testid="program-basic-process" aria-current={step === 'process' ? 'step' : undefined}>
            <h3>{t('补电模块', 'Charger')} <small>{t('处理', 'Process')}</small></h3>
            <div className="charger-processor">
              <span className="charger-coil" aria-hidden="true"><i /><i /><i /><i /><i /></span>
              {step !== 'input' && result !== undefined && <ChargeChange input={sample.input} output={result} locale={locale} />}
              <span className={step === 'input' ? 'charger-rule' : 'sr-only'}>{rule}</span>
            </div>
          </li>
          <li data-testid="program-basic-output" aria-current={completed ? 'step' : undefined}>
            <h3>{t('电量屏', 'Display')} <small>{t('输出', 'Output')}</small></h3>
            <div className="charger-lcd" aria-label={t('电量屏读数', 'Charge readout')}>
              {completed ? <output data-testid="program-basic-result">{result}</output>
                : <span aria-label={t('等待结果', 'Awaiting result')}>––</span>}
              {completed && Number.isFinite(Number(result)) && <i className="charger-gauge" style={chargeFill(Number(result))} aria-hidden="true" />}
            </div>
          </li>
        </ol>
        <div className="charger-controls">
          <button type="button" className="charger-back" disabled={step === 'input'} onClick={() => {
            setPlaying(false)
            setStep(completed ? 'process' : 'input')
          }}>{t('上一步', 'Previous step')}</button>
          <button type="button" className="charger-run" onClick={() => { setPlaying(false); advance() }}>
            <span aria-hidden="true">{step === 'output' ? '↺' : '▶'}</span>
            {step === 'input' ? t('按规则处理', 'Apply the rule') : step === 'process' ? t('查看输出', 'Show the output') : t('重新运行', 'Run again')}
          </button>
          <button type="button" className="charger-play" aria-pressed={playing} onClick={() => {
            if (playing) setPlaying(false)
            else {
              if (completed) choose(selected)
              setPlaying(true)
            }
          }}>{playing ? t('暂停', 'Pause') : t('自动播放', 'Auto-play')}</button>
          <span role="status" className="sr-only">{status}</span>
        </div>
        <StepExplanation locale={locale}>{status}</StepExplanation>
        {failed && <p role="alert" className="error-message">{t('这次没有得到结果。重新运行一次试试。', 'The program did not return a result. Try running it again.')}</p>}
      </DeviceWindow>
      <CommandDesk locale={locale} title={t('补电记录', 'Charge log')}>
        {observations.length === 0
          ? <p className="charger-ticket-empty">{t('输入', 'Input')} <b>—</b> <span aria-hidden="true">→</span> {t('输出', 'Output')} <b>—</b></p>
          : <ul className="charger-tickets">
            {observations.map(({ input, output }) =>
              <li key={input} aria-current={completed && input === sample.input ? 'true' : undefined}>
                {t('输入', 'Input')} <b>{input}</b> <span aria-hidden="true">→</span> {t('输出', 'Output')} <b>{output}</b>
              </li>)}
          </ul>}
        {completed && exercise}
      </CommandDesk>
    </div>
    {notes && <TeachingScreen locale={locale} title={t('补电程序', 'The charging program')}>{notes}</TeachingScreen>}
  </section>
}

