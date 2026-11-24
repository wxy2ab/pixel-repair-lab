import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { runProgramWalkthrough } from '../engine/programWalkthrough'
import type { ProgramInterface, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { CommandDesk, TeachingScreen } from './Classroom'
import { ProgramDevice, type DevicePhase } from './ProgramDevice'
import { StepExplanation } from './LessonNotes'
import { TeachingModel } from './station3d/TeachingModel'
import './program-interfaces.css'

type ProgramReply = { input: number; output: string }
const loadInterface = () => import('./station3d/python-input-instrument').then(module => module.buildInterface)
type ReplayStep = {
  id: DevicePhase
  title: string
  actors: string[]
  value: number | string
  detail: string
}

async function requestResult(levelId: string, input: number, signal: AbortSignal): Promise<ProgramReply> {
  const response = await fetch('/api/program/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ levelId, input }),
    signal,
  })
  if (!response.ok) throw new Error('Program request failed')
  const reply: unknown = await response.json()
  if (typeof reply !== 'object' || !reply || !('input' in reply) || reply.input !== input
    || !('output' in reply) || typeof reply.output !== 'string') throw new Error('Invalid program response')
  return { input, output: reply.output }
}

function replaySteps(mode: ProgramInterface, { input, output }: ProgramReply, command: string, rule: string, locale: Locale): ReplayStep[] {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const terminal = t('终端', 'Terminal')
  const commandLine = t('命令行', 'Command line')
  const program = t('补电程序', 'Charging program')
  const window = t('桌面窗口', 'Desktop window')
  const browser = t('浏览器', 'Browser')
  const server = t('服务器', 'Server')
  const process: ReplayStep = {
    id: 'process', title: t('按规则算出新电量', 'Calculate the new charge'), actors: [program], value: output,
    detail: t(`程序收到 ${input}。它照着预先写好的规则计算。${rule}。`,
      `The program receives ${input} and follows the rule it was given. ${rule}.`),
  }

  if (mode === 'cli') {
    return [
      { id: 'command', title: t('提交文字命令', 'Submit a text command'), actors: [commandLine], value: `${command} ${input}`,
        detail: t(`终端里的命令行读到你提交的命令。${command} 是要启动的程序。`, `The command line in the terminal reads your command. ${command} names the program to start.`) },
      { id: 'input', title: t('把数字交给程序', 'Pass the number to the program'), actors: [commandLine, program], value: input,
        detail: t(`命令行启动程序，再把命令末尾的 ${input} 交给它作为输入。`, `The command line starts the program and passes in ${input}, the number at the end of the command.`) },
      process,
      { id: 'output', title: t('把结果显示成文字', 'Print the result as text'), actors: [program, terminal], value: output,
        detail: t(`程序输出 ${output}，终端把这个数字显示在命令下面。`, `The program outputs ${output}, and the terminal shows it below the command.`) },
    ]
  }
  if (mode === 'gui') {
    return [
      { id: 'input', title: t('在窗口里选择电量', 'Choose the charge in the window'), actors: [window], value: input,
        detail: t(`窗口记住你选的起始电量 ${input}。`, `The window keeps ${input} as your selected starting charge.`) },
      { id: 'submit', title: t('点击按钮交给程序', 'Click the button to pass the input'), actors: [window, program], value: input,
        detail: t(`点「计算新电量」后，窗口把 ${input} 交给补电程序。`, `When you click Calculate the new charge, the window passes ${input} to the charging program.`) },
      process,
      { id: 'output', title: t('在窗口里显示结果', 'Show the result in the window'), actors: [program, window], value: output,
        detail: t(`程序算出的 ${output} 回到桌面窗口，显示在「输出」旁边。`, `The desktop window receives ${output} from the program and shows it next to Output.`) },
    ]
  }
  return [
    { id: 'input', title: t('读取网页上的选择', 'Read the selection on the page'), actors: [browser], value: input,
      detail: t(`浏览器读到你在网页上选了 ${input}。`, `The browser reads ${input}, the starting charge you chose on the page.`) },
    { id: 'request', title: t('发出请求', 'Send a request'), actors: [browser, server], value: input,
      detail: t(`浏览器把起始电量 ${input} 发给服务器，请它计算。`, `The browser sends the starting charge of ${input} to the server and asks it to calculate.`) },
    { ...process, actors: [server],
      detail: t(`服务器收到 ${input}，运行补电程序。${rule}，算出 ${output}。`, `The server receives ${input} and runs the charging program. ${rule}. The result is ${output}.`) },
    { id: 'response', title: t('送回结果', 'Send the result back'), actors: [server, browser], value: output,
      detail: t(`服务器把算出的 ${output} 发回浏览器。`, `The server sends the result, ${output}, back to the browser.`) },
    { id: 'output', title: t('在网页上显示输出', 'Display the output on the page'), actors: [browser], value: output,
      detail: t(`浏览器收到 ${output} 后，把它显示在网页上。`, `The browser receives ${output} and displays it on the page.`) },
  ]
}

export function ProgramInterfaces({ execution, levelId, locale, onReady, preview = false, notes, exercise }: {
  execution: ProgramWalkthrough; levelId: string; locale: Locale; onReady: () => void; preview?: boolean;
  notes?: ReactNode; exercise?: ReactNode
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const mode = execution.intro?.interface ?? 'cli'
  const rule = execution.intro?.rule[locale] ?? ''
  const command = execution.intro?.command ?? 'charge'
  const [selected, setSelected] = useState(0)
  const [reply, setReply] = useState<ProgramReply>()
  const [previousCommand, setPreviousCommand] = useState<ProgramReply>()
  const [cursor, setCursor] = useState<number>()
  const [playing, setPlaying] = useState<number>()
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const notified = useRef(false)
  const request = useRef<AbortController | undefined>(undefined)
  const replayHeading = useRef<HTMLHeadingElement>(null)
  const sample = execution.cases[selected]
  const replaying = cursor !== undefined
  const steps = reply ? replaySteps(mode, reply, command, rule, locale) : []
  const current = cursor !== undefined ? steps[cursor] : undefined
  const position = cursor ?? playing
  const phase = position !== undefined ? steps[position].id : busy ? 'request' : failed ? 'error' : reply ? 'output' : 'idle'
  const lastStep = cursor === steps.length - 1
  const showExercise = playing === undefined && !busy && (!replaying || lastStep)
  const instructions = {
    cli: t('在终端点一个数字，看命令末尾怎样变化，再点「提交命令」。', 'Pick a number in the terminal. Watch the end of the command change, then submit it.'),
    gui: t('在计算器上选起始电量，再点「计算新电量」，看看输出框。', 'Pick a starting charge on the calculator, then press Calculate and look at its output.'),
    web: t('在网页上选起始电量，再点「发送到服务器」。留意请求带走哪个数，回信带回哪个数。', 'Pick a starting charge on the page and send it to the server. Look for the number in the request and the number in the reply.'),
  }
  const description = playing !== undefined ? steps[playing].detail
    : busy ? t(`浏览器已经发出 ${sample.input}，正在等回信。`, `The browser has sent ${sample.input} and is waiting for a reply.`)
      : reply ? t(`刚才送入 ${reply.input}，程序交回 ${reply.output}。可以换一个数，或回放刚才的过程。`,
        `You sent in ${reply.input}, and the program returned ${reply.output}. Try another number or replay this run.`)
        : instructions[mode]
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (replaying) replayHeading.current?.focus({ preventScroll: true })
  }, [replaying])
  useEffect(() => {
    if (playing === undefined) return
    const timer = window.setTimeout(() => {
      setPlaying(playing + 1 < steps.length - 1 ? playing + 1 : undefined)
    }, 580)
    return () => window.clearTimeout(timer)
  }, [playing, steps.length])
  const advanceReplay = useEffectEvent(() => {
    if (cursor !== undefined && !lastStep) moveReplay(cursor + 1)
  })
  useEffect(() => {
    if (!replayPlaying) return
    const timer = window.setTimeout(() => advanceReplay(), 1500)
    return () => window.clearTimeout(timer)
  }, [cursor, replayPlaying])

  function choose(index: number) {
    if (selected === index) return
    if (mode === 'cli' && reply) setPreviousCommand(reply)
    setSelected(index)
    setReply(undefined)
    setCursor(undefined)
    setPlaying(undefined)
    setReplayPlaying(false)
    setFailed(false)
  }

  async function run() {
    if (request.current) return
    setReply(undefined)
    setCursor(undefined)
    setPlaying(undefined)
    setReplayPlaying(false)
    setFailed(false)
    const { input } = sample
    if (mode !== 'web' || preview) {
      const result = runProgramWalkthrough(execution.source, input)
      if (result.issue || result.output.length !== 1) setFailed(true)
      else {
        setReply({ input, output: result.output[0] })
        setPlaying(0)
      }
      return
    }

    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    try {
      const result = await requestResult(levelId, input, controller.signal)
      if (!controller.signal.aborted) {
        setReply(result)
        setPlaying(1)
      }
    } catch {
      if (!controller.signal.aborted) setFailed(true)
    } finally {
      request.current = undefined
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function moveReplay(next: number) {
    setCursor(next)
    if (next === steps.length - 1) setReplayPlaying(false)
    if (next === steps.length - 1 && !notified.current) {
      notified.current = true
      onReady()
    }
  }

  const screen = mode === 'cli' ? t('终端', 'Terminal')
    : mode === 'gui' ? t('补电计算器', 'Charge calculator') : t('浏览器里的补电页', 'Charge page in the browser')
  return <section className="program-interfaces" aria-label={t('补电任务', 'Charging task')}
    data-testid="program-interfaces" data-program-interface={mode}>
    <div className="classroom-split" data-testid={replaying ? 'program-interface-replay' : undefined}
      data-replay-step={current?.id}>
      <TeachingScreen locale={locale} variant="monitor" title={screen}>
        <ProgramDevice mode={mode} locale={locale} cases={execution.cases} selected={selected} command={command} rule={rule}
          phase={phase} reply={reply} previousCommand={replaying ? undefined : previousCommand}
          preview={preview} locked={busy || playing !== undefined} choose={choose} run={run} />
        <TeachingModel sceneKey={'program-' + mode}
          label={mode === 'web' ? t('浏览器与服务器之间的往返', 'The round trip from browser to server') :
            mode === 'cli' ? t('命令怎样交给程序', 'How a command reaches the program') : t('窗口怎样调用补电程序', 'How the window calls the charger')}
          state={{ mode, phase, input: sample.input, output: reply?.output, command, locale, replaying }} locale={locale} load={loadInterface}
          onPick={busy || playing !== undefined || (replaying && lastStep) ? undefined : id => {
            if (cursor !== undefined) { setReplayPlaying(false); moveReplay(cursor + 1) }
            else if (id === 'client') void run()
          }} />
        {failed && <p className="error-message" role="alert">{t('这次没有算出结果。再试一次。', 'The program could not finish this time. Try again.')}</p>}
        {showExercise && notes}
      </TeachingScreen>
      <CommandDesk locale={locale}>
        {!replaying && <StepExplanation locale={locale} className="program-interface-instruction">{description}</StepExplanation>}
        {playing !== undefined && <button type="button" className="subtle-button" onClick={() => {
          moveReplay(playing)
          setPlaying(undefined)
        }}>{t('暂停', 'Pause')}</button>}
        {reply && playing === undefined && !replaying && <button type="button" className="subtle-button" onClick={() => setCursor(0)}>
          {t('回放这次运行', 'Replay this run')}
        </button>}
        {current && cursor !== undefined && <section className="program-interface-replay">
          <h2 tabIndex={-1} ref={replayHeading}>{t('运行回放', 'Run replay')}</h2>
          <ol className="program-replay-steps">
            {steps.map((step, index) => <li key={step.id} data-step={step.id} data-active={index === cursor || undefined}
              data-visited={index < cursor || undefined} aria-current={index === cursor ? 'step' : undefined}>
              <strong>{step.title}</strong>
              {index === cursor && <div className="program-replay-detail" role="status">
                <div className="program-replay-actors">
                  <span>{current.actors[0]}</span>
                  {current.actors[1] && <> <b aria-hidden="true">→</b> <span>{current.actors[1]}</span></>}
                  <code>{current.value}</code>
                </div>
                <StepExplanation locale={locale}>{current.detail}</StepExplanation>
              </div>}
            </li>)}
          </ol>
        </section>}
        {current && cursor !== undefined && <div className="program-replay-actions">
          <button type="button" className="subtle-button" disabled={cursor === 0} onClick={() => { setReplayPlaying(false); moveReplay(cursor - 1) }}>{t('上一步', 'Previous step')}</button>
          <button type="button" className="primary-button" disabled={lastStep} onClick={() => { setReplayPlaying(false); moveReplay(cursor + 1) }}>{t('下一步', 'Next step')}</button>
          <button type="button" className="subtle-button" aria-pressed={replayPlaying} onClick={() => {
            if (lastStep) moveReplay(0)
            setReplayPlaying(!replayPlaying)
          }}>{replayPlaying ? t('暂停', 'Pause') : t('自动播放', 'Auto-play')}</button>
        </div>}
        {showExercise && exercise}
      </CommandDesk>
    </div>
  </section>
}
