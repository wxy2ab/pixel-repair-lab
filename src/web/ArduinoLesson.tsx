import { useEffect, useMemo, useState } from 'react'
import { arduinoMeetsGoal, buildUnoProgram, pin2Level, powerOnUno, stepUno, type UnoProgram, type UnoState } from '../engine/arduino'
import type { ArduinoLevel, ArduinoSketch } from '../shared/arduino'
import type { Locale } from '../shared/types'
import { CommandDesk } from './Classroom'
import { DeviceWindow } from './DeviceWindow'
import { StepExplanation } from './LessonNotes'
import { tr } from './text'
import './arduino-lesson.css'

type Translate = (zh: string, en: string) => string

type UnoInstruction = UnoProgram['steps'][number]['instruction']

function PinBoard({ state, instruction, sketch, toggle, t }: {
  state: UnoState; instruction?: UnoInstruction; sketch: ArduinoSketch; toggle: () => void; t: Translate
}) {
  const input = pin2Level(state)
  const waitingForRead = state.sample !== null && input !== state.sample
  const button = sketch.mode === 'button'
  const op = instruction?.op
  const writing = op === 'write' || op === 'writeCondition'
  const conditionVisible = op === 'compare' || op === 'writeCondition' || op === 'delay'
  const bit = (value: number) => value ? 'HIGH · 1' : 'LOW · 0'
  return <div className="uno-station">
    <div className="uno-board" data-uno-op={op} role="group" aria-label={t('开发板信号通路', 'Board signal path')}>
      <div className="uno-board-top"><b>UNO R3</b><span>{t('模拟时间', 'Time')} <b data-testid="uno-time">{state.elapsedMs} ms</b></span></div>
      <div className="uno-board-face">
        {button && <>
          <div className="uno-input" data-focused={op === 'pullup' || op === 'read'}>
            <strong>{t('D2 输入', 'D2 input')}</strong>
            <output data-testid="uno-d2">{input === null ? t('悬空', 'Floating') : bit(input)}</output>
            {state.pullup && <small>{t('↑ 内部上拉', '↑ Pull-up')}</small>}
            <button type="button" className="uno-switch" aria-pressed={state.pressed} onClick={toggle} data-testid="uno-button">
              <span className="uno-contact-pair" aria-hidden="true"><b>D2</b><i /><b>GND</b></span>
              {state.pressed ? t('松开按钮', 'Release button') : t('按下按钮', 'Press button')}
            </button>
          </div>
          <span className="uno-wire" data-transfer={op === 'read' && !waitingForRead || undefined} aria-hidden="true" />
        </>}
        <div className="uno-chip" data-focused={op === 'read' || op === 'compare' || (!button && op === 'delay')}>
          {button ? <>
            <strong>{t('采样', 'Sample')}</strong>
            <code data-testid="uno-sample">button = {state.sample ?? '—'}</code>
            {waitingForRead && <small className="uno-waiting">{t('等待读取 D2', 'Awaiting D2 read')}</small>}
            {conditionVisible && <small data-testid="uno-compare">{state.sample ?? '—'} == {sketch.lightWhen === 'pressed' ? 0 : 1}
              {' → '}{state.condition ? '1' : '0'}</small>}
          </> : <>
            <strong>{op === 'delay' ? 'delay' : 'UNO'}</strong>
            <code>{instruction?.op === 'delay' ? instruction.ms + ' ms' : writing ? 'digitalWrite' : 'D13'}</code>
          </>}
        </div>
        <span className="uno-wire" data-transfer={writing || undefined} aria-hidden="true" />
        <div className="uno-lamp" data-focused={writing || op === 'delay' || op === 'output'} data-on={state.led === 1} data-testid="uno-led">
          <strong>{t('D13 输出', 'D13 output')}</strong>
          <output data-testid="uno-d13">{!state.output ? t('未配置', 'Not set') : bit(state.led)}</output>
          <span aria-hidden="true" className="uno-led-core" />
          <span>{state.led ? t('灯亮', 'Light on') : t('灯灭', 'Light off')}</span>
          {!button && instruction?.op === 'delay' && <small data-testid="uno-lamp-hold">{t('保持', 'Hold')} {instruction.ms} ms</small>}
        </div>
      </div>
    </div>
  </div>
}

function taskText(sketch: ArduinoSketch, t: Translate) {
  if (sketch.mode === 'blink') {
    const goal = sketch.goal
    return goal ? t(`亮 ${goal.onMs} ms，灭 ${goal.offMs} ms。`, `On for ${goal.onMs} ms, off for ${goal.offMs} ms.`)
      : t('运行一个亮灭周期。', 'Run one blink cycle.')
  }
  const active = sketch.goal?.lightWhen ?? sketch.lightWhen
  return active === 'pressed'
    ? t('按下 → 灯亮，松开 → 灯灭。', 'Pressed → light on. Released → light off.')
    : t('松开 → 灯亮，按下 → 灯灭。', 'Released → light on. Pressed → light off.')
}

export default function ArduinoLesson({ level, locale, onComplete, onMistake }: {
  level: ArduinoLevel; locale: Locale; onComplete: () => void; onMistake?: () => void
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const [sketch, setSketch] = useState(level.sketch)
  const [state, setState] = useState(powerOnUno)
  const [playing, setPlaying] = useState(false)
  const [checked, setChecked] = useState<boolean>()
  const program = useMemo(() => buildUnoProgram(sketch), [sketch])
  useEffect(() => {
    if (!playing) return
    const next = program.steps[state.next].instruction
    const timer = window.setTimeout(() => setState(previous => stepUno(program, previous)), next.op === 'delay' ? next.ms : 350)
    return () => window.clearTimeout(timer)
  }, [playing, program, state.next])

  function reset() {
    setPlaying(false)
    setState(powerOnUno())
    setChecked(undefined)
  }
  function change(next: ArduinoSketch) {
    reset()
    setSketch(next)
  }
  function check() {
    setPlaying(false)
    const pass = arduinoMeetsGoal(sketch, state)
    setChecked(pass)
    if (pass) onComplete()
    else if (level.stage !== 'demo') onMistake?.()
  }
  const showLamp = (value?: number) => value === undefined ? t('待采样', 'Not sampled') : value ? t('亮', 'On') : t('灭', 'Off')
  const observed = sketch.mode === 'blink' ? state.onMs !== undefined && state.offMs !== undefined
    : state.releasedLed !== undefined && state.pressedLed !== undefined
  const currentStep = state.line === null ? -1 : program.steps.findIndex(step => step.line === state.line)
  const phase = currentStep < 0 ? t('等待启动', 'Ready') : currentStep < program.loopStart ? 'setup()' : `loop() · ${Math.max(1, state.loops + Number(state.next !== program.loopStart))}`
  const filename = sketch.mode === 'blink' ? 'beacon.ino' : 'signal.ino'
  return <div className="classroom-split uno-workbench">
    <DeviceWindow locale={locale} kind="instrument" title={t('Arduino Uno R3 模拟板', 'Arduino Uno R3 simulator')}>
      <PinBoard state={state} instruction={program.steps[currentStep]?.instruction} sketch={sketch} t={t} toggle={() => {
        setChecked(undefined)
        setState(previous => ({ ...previous, pressed: !previous.pressed }))
      }} />
      <div className="uno-sketch">
        <div className="uno-file"><strong>{filename}</strong><span data-testid="uno-phase">{phase}</span>
          <a download={filename} href={'data:text/plain;charset=utf-8,' + encodeURIComponent(program.lines.join('\n') + '\n')}>{t('下载程序', 'Save sketch')}</a>
        </div>
        <ol data-testid="uno-source" aria-label={t('Arduino 程序', 'Arduino sketch')}>{program.lines.map((source, index) =>
          <li key={index} aria-current={state.line === index ? 'step' : undefined}><code>{source || ' '}</code></li>)}</ol>
      </div>
    </DeviceWindow>
    <CommandDesk locale={locale}>
      <div className="uno-controls">
        <h2>{t('试运行', 'Test the sketch')}</h2>
        <p>{taskText(sketch, t)}</p>
        {sketch.mode === 'blink' ? (['onMs', 'offMs'] as const).map(key =>
          <fieldset key={key}><legend>{key === 'onMs' ? t('亮灯等待', 'Time on') : t('灭灯等待', 'Time off')}</legend>
            <div className="uno-keys">{sketch.delayChoices.map(ms => <button type="button" key={ms} className="subtle-button"
              aria-pressed={sketch[key] === ms} data-uno-timing={key} data-ms={ms}
              onClick={() => { if (sketch[key] !== ms) change({ ...sketch, [key]: ms }) }}>{ms} ms</button>)}</div>
          </fieldset>) :
          <fieldset><legend>{t('点亮指示灯的 D2 读数', 'D2 reading that turns the LED on')}</legend><div className="uno-keys">
            {(['pressed', 'released'] as const).map(position => <button type="button" key={position} className="subtle-button"
              aria-pressed={sketch.lightWhen === position} data-uno-active={position}
              onClick={() => { if (sketch.lightWhen !== position) change({ ...sketch, lightWhen: position }) }}>{position === 'pressed' ? 'LOW' : 'HIGH'}</button>)}
          </div></fieldset>}
        <div className="uno-keys">
          <button type="button" className="primary-button" data-testid="uno-run" onClick={() => setPlaying(!playing)}>
            {playing ? t('暂停运行', 'Pause') : t('慢速运行', 'Run slowly')}</button>
          <button type="button" className="subtle-button" data-testid="uno-step" onClick={() => {
            setPlaying(false)
            setState(previous => stepUno(program, previous))
          }}>{t('执行一步', 'Step once')}</button>
          <button type="button" className="subtle-button" data-testid="uno-reset" onClick={reset}>{t('复位开发板', 'Reset board')}</button>
        </div>
        <StepExplanation locale={locale}>{sketch.mode === 'button' ? t('按下按钮会接通 D2 和 GND。松开时，上拉电阻让 D2 回到高电平。digitalRead 把当时的读数存进 button。执行 digitalWrite 后，板载 L 灯才显示结果。', 'Pressing the button connects D2 to GND. Releasing it lets the pull-up resistor bring D2 high. digitalRead saves that reading in button. The onboard light changes when digitalWrite runs.')
          : t('D13 控制板载 L 灯。delay 期间灯保持当前状态。setup() 在复位后运行一次，loop() 会重复。', 'D13 drives the onboard light. During delay the light holds its current state. After reset, setup() runs once, then loop() repeats.')}</StepExplanation>
        <div className="uno-observation" data-testid="uno-observations">
          <h3>{t('实测记录', 'Observations')}</h3>
          {sketch.mode === 'blink' ? <p>{t('灯亮', 'Light on')} · <b>{state.onMs === undefined ? '—' : state.onMs + ' ms'}</b>
            <br />{t('灯灭', 'Light off')} · <b>{state.offMs === undefined ? '—' : state.offMs + ' ms'}</b></p>
            : <p>{t('按下时', 'Pressed')} · <b>{showLamp(state.pressedLed)}</b><br />{t('松开时', 'Released')} · <b>{showLamp(state.releasedLed)}</b></p>}
          <button type="button" className="primary-button" disabled={!observed || checked === true} onClick={check} data-testid="uno-check">
            {level.stage === 'demo' ? t('记录观察', 'Record observations') : t('检查信号灯', 'Check the light')}</button>
          {checked !== undefined && <p role="status" data-task-success={checked || undefined} className={checked ? 'win-message' : 'error-message'}>{checked ? t('实测记录符合任务。', 'Your readings match the task.')
            : t('把两条实测记录和任务对一对。改好设置后，再跑一遍。', 'Compare both readings with the task. Adjust the setting and run again.')}</p>}
        </div>
      </div>
    </CommandDesk>
  </div>
}
