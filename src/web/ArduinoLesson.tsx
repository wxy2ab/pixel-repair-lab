import { useEffect, useMemo, useState } from 'react'
import { arduinoMeetsGoal, buildUnoProgram, pin2Level, powerOnUno, stepUno, type UnoState } from '../engine/arduino'
import type { ArduinoLevel, ArduinoSketch } from '../shared/arduino'
import type { Locale } from '../shared/types'
import { CommandDesk } from './Classroom'
import { DeviceWindow } from './DeviceWindow'
import { tr } from './text'
import './arduino-lesson.css'

type Translate = (zh: string, en: string) => string

function PinBoard({ state, button, toggle, t }: { state: UnoState; button: boolean; toggle: () => void; t: Translate }) {
  const input = pin2Level(state)
  return <div className="uno-station">
    <div className="uno-board">
      <div className="uno-pinrow" aria-hidden="true"><b>GND</b><b>D13</b><b>D2</b></div>
      <div className="uno-board-face">
        <span className="uno-usb" aria-hidden="true">USB</span>
        <div className="uno-chip"><strong>UNO</strong><span>R3</span></div>
        <div className="uno-lamp" data-on={state.led === 1} data-testid="uno-led">
          <span aria-hidden="true" className="uno-led-core" /><strong>L</strong>
          <span>{state.led ? t('灯亮', 'On') : t('灯灭', 'Off')}</span>
        </div>
      </div>
      <div className="uno-pinrow uno-lower-pins" aria-hidden="true" />
    </div>
    {button && <button type="button" className="uno-switch" aria-pressed={state.pressed} onClick={toggle} data-testid="uno-button">
      <span className="uno-contact-pair" aria-hidden="true"><b>D2</b><i /><b>GND</b></span>
      {state.pressed ? t('松开按钮', 'Release the button') : t('按下按钮', 'Press the button')}
    </button>}
    <dl className="uno-readout">
      {button && <div><dt>{t('D2 输入', 'D2 input')}</dt><dd data-testid="uno-d2">{input === null ? t('悬空', 'Floating') : input ? 'HIGH · 1' : 'LOW · 0'}</dd></div>}
      {button && <div><dt>{t('程序读到的 button', 'Sampled button')}</dt><dd>{state.sample === null ? '—' : state.sample ? 'HIGH · 1' : 'LOW · 0'}</dd></div>}
      <div><dt>{t('D13 输出', 'D13 output')}</dt><dd data-testid="uno-d13">{!state.output ? t('尚未配置', 'Not set') : state.led ? 'HIGH · 1' : 'LOW · 0'}</dd></div>
      <div><dt>{t('模拟时间', 'Simulated time')}</dt><dd data-testid="uno-time">{state.elapsedMs} ms</dd></div>
    </dl>
  </div>
}

function taskText(sketch: ArduinoSketch, t: Translate) {
  if (sketch.mode === 'blink') {
    const goal = sketch.goal
    return goal ? t(`让灯每次亮 ${goal.onMs} ms、灭 ${goal.offMs} ms。运行一个完整周期，再检查实测时间。`,
      `Make the LED stay on for ${goal.onMs} ms and off for ${goal.offMs} ms. Run a full cycle, then check the measured times.`)
      : t('运行一个完整的亮灭周期，看看两次 delay 各让灯保持了多久。', 'Run a full blink cycle. See how long each delay holds the light on or off.')
  }
  const active = sketch.goal?.lightWhen ?? sketch.lightWhen
  return active === 'pressed'
    ? t('让指示灯在按钮按下时亮、松开时灭。分别试这两种状态，等程序把读数写到灯上再验收。', 'Make the light turn on when pressed and off when released. Try both positions and let the sketch write each reading to the LED before checking.')
    : t('让待机灯在按钮松开时亮、按下时灭。分别试这两种状态，等程序把读数写到灯上再验收。', 'Make the standby light glow when released and go dark when pressed. Try both positions and let the sketch write each reading to the LED before checking.')
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
      <PinBoard state={state} button={sketch.mode === 'button'} t={t} toggle={() => {
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
        <p className="uno-connection">{sketch.mode === 'button' ? t('D2 通过内部上拉电阻接高电平。按下按钮会接通 D2 和 GND。板载 L 灯接 D13。', 'D2 is pulled high by an internal resistor. Pressing the button connects D2 to GND. The onboard L light is on D13.')
          : t('D13 控制板载 L 灯。setup() 在复位后运行一次，loop() 会重复。', 'D13 drives the onboard L light. After reset, setup() runs once, then loop() repeats.')}</p>
        <div className="uno-observation" data-testid="uno-observations">
          <h3>{t('实测记录', 'Observations')}</h3>
          {sketch.mode === 'blink' ? <p>{t('灯亮', 'Light on')} · <b>{state.onMs === undefined ? '—' : state.onMs + ' ms'}</b>
            <br />{t('灯灭', 'Light off')} · <b>{state.offMs === undefined ? '—' : state.offMs + ' ms'}</b></p>
            : <p>{t('按下时', 'Pressed')} · <b>{showLamp(state.pressedLed)}</b><br />{t('松开时', 'Released')} · <b>{showLamp(state.releasedLed)}</b></p>}
          <button type="button" className="primary-button" disabled={!observed || checked === true} onClick={check} data-testid="uno-check">
            {level.stage === 'demo' ? t('记录观察', 'Record observations') : t('检查信号灯', 'Check the light')}</button>
          {checked !== undefined && <p role="status" className={checked ? 'win-message' : 'error-message'}>{checked ? t('实测记录符合任务。', 'Your readings match the task.')
            : t('把两条实测记录和任务对一对。改好设置后，再跑一遍。', 'Compare both readings with the task. Adjust the setting and run again.')}</p>}
        </div>
      </div>
    </CommandDesk>
  </div>
}
