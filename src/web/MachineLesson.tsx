import { useClassroom, CommandDesk } from './Classroom'
import { ExperimentWindow } from './ExperimentWindow'
import { CpuDatapath } from './CpuDatapath'
import { useId, useMemo, useRef, useState } from 'react'
import type { MachineCase, MachineFrame, MachineLevel, MachineOp, MachineResult, MachineState } from '../shared/hardware'
import type { Locale, RunIssue } from '../shared/types'
import { runMachine } from '../engine/machine'
import { ChallengeFailureReview, type ChallengeReviewData } from './ChallengeFailureReview'
import { goalReplayIssue } from './goalReplayEvidence'
import type { MachineChallengeDraft } from './challengeDraft'
import type { ChallengeRunHandlers } from './challengeScore'
import { tr } from './text'
import { TaskProgress } from './TaskProgress'
import { CodeField } from './CodeField'
import { HintSteps } from './HintSteps'
import './machine.css'

const hints: Record<MachineOp, [string, string]> = {
  LOAD: ['把地址中的值复制到 ACC', 'Copy the value at an address into ACC'],
  ADD: ['把地址中的值加到 ACC', 'Add the value at an address to ACC'],
  SUB: ['从 ACC 减去地址中的值', 'Subtract the value at an address from ACC'],
  STORE: ['把 ACC 的值写入地址', 'Write the value in ACC to an address'],
  HALT: ['停止执行指令', 'Stop executing instructions'],
}

const errors: Record<string, [string, string]> = {
  cpuOpcode: ['检查指令名称，可以参考指令按钮。', 'Check the instruction name. Use the instruction buttons as a guide.'],
  cpuDisabled: ['请选择本关允许的指令。', 'Choose an instruction available in this lesson.'],
  cpuSyntax: ['请给读写或计算指令填写一个整数地址。HALT 单独写一行。', 'Give a read, write, or math instruction one integer address. Put HALT on a line by itself.'],
  memoryAddress: ['这个地址没有对应的内存格。看看内存面板中的地址编号。', 'This address has no memory cell. Check the address numbers in the memory panel.'],
  cpuMissingHalt: ['加入 HALT，让 CPU 在工作完成后停止。', 'Add HALT so the CPU stops after its work is done.'],
  cpuScenario: ['这个输入还无法运行。试试另一个场景。', 'This input could not run. Try another scenario.'],
  limit: ['CPU 处理不下这么多指令或这么大的数。试着缩短程序。', 'The program has too many instructions or too large a value. Try a shorter calculation.'],
  unfinished: ['CPU 已停止。核对寄存器和内存里的实际值。', 'The CPU stopped. Compare the register and memory values with the targets.'],
}

function message(locale: Locale, issue: RunIssue) {
  const text = tr(locale, ...(errors[issue.code] ?? ['CPU 无法继续。检查当前指令再试一次。', 'The CPU could not continue. Check the current instruction and try again.']))
  return issue.line === undefined ? text : tr(locale, `第 ${issue.line} 行 · ${text}`, `Line ${issue.line} · ${text}`)
}

function machineFailureReview(level: MachineLevel, outcomes: Partial<Record<number, MachineResult>>): ChallengeReviewData | undefined {
  const changes = new Set<string>()
  const failed = level.cases.flatMap((scenario, index) => {
    const outcome = outcomes[index]
    if (!outcome || outcome.won) return []
    const { issue, final } = outcome
    const details = []

    if (issue && issue.code !== 'unfinished') {
      changes.add(issue.code === 'memoryAddress' ? 'memory' : 'instructions')
      if (issue.code !== 'cpuMissingHalt') {
        return [{ label: scenario.label, zh: message('zh', issue), en: message('en', issue) }]
      }
      details.push(issue.line
        ? { zh: `第 ${issue.line} 行执行后，程序结束但 CPU 未停机。`,
          en: `The program ended after line ${issue.line} without halting the CPU.` }
        : { zh: '程序结束时 CPU 未停机。', en: 'The program ended without halting the CPU.' })
    }

    if (scenario.goal?.accumulator !== undefined && final.accumulator !== scenario.goal.accumulator) {
      changes.add('registers')
      details.push({ zh: 'ACC 的值还不符合目标。', en: 'The value in ACC still differs from the target.' })
    }
    const addresses = scenario.goal?.memory?.filter(({ address, value }) => final.memory[address] !== value)
      .map(({ address }) => address) ?? []
    if (addresses.length) {
      changes.add('memory')
      details.push({
        zh: `内存地址 ${addresses.join('、')} 的值还不符合目标。`,
        en: `${addresses.length === 1 ? 'The value at address' : 'The values at addresses'} ${addresses.join(', ')} still ${addresses.length === 1 ? 'differs' : 'differ'} from the target.`,
      })
    }
    return [{ label: scenario.label, zh: details.map(detail => detail.zh).join(''), en: details.map(detail => detail.en).join(' ') }]
  })
  if (!failed.length) return

  const passed = level.cases.filter((_, index) => outcomes[index]?.won).length
  const total = level.cases.length
  const remaining = total - passed
  return {
    location: {
      zh: `未通过的场景 · ${failed.map(scenario => scenario.label.zh).join('、')}`,
      en: `Failed ${failed.length === 1 ? 'scenario' : 'scenarios'} · ${failed.map(scenario => scenario.label.en).join(', ')}`,
    },
    gaps: [
      { zh: `已通过 ${passed}/${total} 个场景，还差 ${remaining} 个。`,
        en: `Passed ${passed} of ${total} scenarios. ${remaining} ${remaining === 1 ? 'scenario still needs' : 'scenarios still need'} to pass.` },
      ...failed.map(({ label, zh, en }) => failed.length > 1 ? { zh: `${label.zh} · ${zh}`, en: `${label.en} · ${en}` } : { zh, en }),
    ],
    topics: [...changes].map(topic => ({ unit: 'architecture', topic })),
  }
}

function StateView({ state, previous, frame, locale }: {
  state: MachineState; previous: MachineState; frame?: MachineFrame; locale: Locale
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const access = frame?.instruction
  return <section className="panel machine-state">
    <div className="machine-panel-heading">
      <h2>{t('CPU 状态', 'CPU state')}</h2>
      <span className={state.halted ? 'machine-state-label machine-stopped' : 'machine-state-label'}>
        {state.halted ? t('已停机', 'Halted') : t('等待单步', 'Ready to step')}
      </span>
    </div>
    <dl className="machine-registers">
      <div className={state.accumulator !== previous.accumulator ? 'machine-changed' : undefined}>
        <dt><code>ACC</code> {t('累加器', 'Accumulator')}</dt>
        <dd data-register="accumulator">{state.accumulator}</dd>
      </div>
      <div className={state.pc !== previous.pc ? 'machine-changed' : undefined}>
        <dt><code>PC</code> {t('程序计数器', 'Program counter')}</dt>
        <dd data-register="pc">{state.pc}</dd>
      </div>
    </dl>
    <h3>{t('内存', 'Memory')}</h3>
    <dl className="machine-memory">
      {state.memory.map((value, index) => {
        const operation = access?.op !== 'HALT' && access?.address === index ? access.op : undefined
        const changed = previous.memory[index] !== value
        return <div key={index} data-address={index} data-changed={changed} className={
          changed ? 'machine-changed' : operation ? 'machine-accessed' : undefined
        }>
          <dt>{t(`地址 ${index}`, `Address ${index}`)}</dt>
          <dd>{value}</dd>
          {operation && <small>{operation === 'STORE' ? t('写入', 'Write') : t('读取', 'Read')}</small>}
        </div>
      })}
    </dl>
  </section>
}

function Targets({ test, state, locale }: { test: MachineCase; state: MachineState; locale: Locale }) {
  if (!test.goal) return null
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const targets = [
    ...(test.goal.accumulator === undefined ? [] : [{ key: 'ACC', label: 'ACC', current: state.accumulator, expected: test.goal.accumulator }]),
    ...(test.goal.memory ?? []).map(({ address, value }) => ({
      key: String(address), label: t(`地址 ${address}`, `Address ${address}`), current: state.memory[address], expected: value,
    })),
  ]
  return <section className="panel machine-targets">
    <h2>{t('核对结果', 'Check the result')}</h2>
    <table>
      <thead><tr><th scope="col">{t('位置', 'Location')}</th><th scope="col">{t('当前值', 'Current')}</th><th scope="col">{t('目标值', 'Target')}</th></tr></thead>
      <tbody>{targets.map(({ key, label, current, expected }) => <tr key={key}>
        <th scope="row">{label}</th><td className={current === expected ? 'machine-matching' : undefined}>{current}</td><td>{expected}</td>
      </tr>)}</tbody>
    </table>
  </section>
}

type Props = {
  level: MachineLevel; locale: Locale; onComplete: () => void; onMistake?: () => void; challenge?: ChallengeRunHandlers;
  initialDraft?: MachineChallengeDraft; onDraftChange?: (draft: MachineChallengeDraft) => void;
}

function Session({ level, locale, onComplete, onMistake, challenge, initialDraft, onDraftChange }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const classroom = useClassroom()
  const demo = level.stage !== 'exercise' && level.stage !== 'challenge'
  const [source, setSource] = useState(() => initialDraft?.source ?? level.starterCode)
  const [scenario, setScenario] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [addressChoice, setAddressChoice] = useState(0)
  const [checked, setChecked] = useState<Partial<Record<number, MachineResult>>>({})
  const editor = useRef<HTMLTextAreaElement>(null)
  const countedFailure = useRef(false)
  const editorId = useId()
  const addressId = useId()
  const result = useMemo(() => runMachine(level, source, scenario), [level, source, scenario])
  const frame = result.frames[cursor - 1]
  const next = result.frames[cursor]
  const state = frame?.state ?? result.initial
  const previous = result.frames[cursor - 2]?.state ?? result.initial
  const terminal = next === undefined
  const issue = terminal ? result.issue : undefined
  const lines = source.split(/\r\n?|\n/u).map((code, index) => ({ code, line: index + 1 }))
  const instructions = lines.filter(({ code }) => code.split('#')[0].trim())
  const address = Math.min(addressChoice, Math.max(0, result.initial.memory.length - 1))
  const complete = level.cases.every((_, index) => checked[index]?.won === true)
  const tested = Object.keys(checked).length
  const visibleOutcomes = terminal && instructions.length > 0 && !result.won && !checked[scenario]
    ? { ...checked, [scenario]: result } : checked
  const review = !demo && machineFailureReview(level, visibleOutcomes)

  function retry() {
    challenge?.onStart()
    countedFailure.current = false
    setCursor(0)
    setChecked({})
    editor.current?.focus()
  }

  function replay() {
    setScenario(0)
    setAddressChoice(0)
    retry()
  }

  function updateSource(text: string) {
    if (text === source || text.length > 12_000) return
    challenge?.onStart()
    countedFailure.current = false
    setSource(text)
    onDraftChange?.({ kind: 'machine', source: text })
    setCursor(0)
    setChecked({})
  }

  function add(op: MachineOp) {
    const halt = lines.findIndex(({ code }) => /^\s*halt\s*(?:#.*)?$/iu.test(code))
    if (op === 'HALT' && halt >= 0) return
    const command = op === 'HALT' ? op : `${op} ${address}`
    if (op === 'HALT' || halt === -1) {
      const before = source.trimEnd()
      updateSource((before ? before + '\n' : '') + command + '\n')
    } else {
      const text = lines.map(({ code }) => code)
      text.splice(halt, 0, command)
      updateSource(text.join('\n'))
    }
  }

  function record(outcomes: Partial<Record<number, MachineResult>>) {
    setChecked(outcomes)
    const cases = challenge ? level.cases.flatMap((_, index) => {
      const outcome = outcomes[index]
      return outcome && outcome.issue?.code !== 'internal' ? [{ index: index + 1, passed: outcome.won }] : []
    }) : undefined
    if (!demo && level.cases.some((_, index) => !checked[index] && outcomes[index]?.won === false)) {
      onMistake?.()
      if (challenge && !countedFailure.current) {
        countedFailure.current = true
        const results = Object.values(outcomes).filter(result => result !== undefined)
        challenge.onFailure({ kind: 'machine', passed: results.filter(result => result.won).length,
          total: level.cases.length, instructions: Math.max(...results.map(result => result.final.steps)) },
          { ...goalReplayIssue(machineFailureReview(level, outcomes)), cases })
      }
    }
    if (!complete && level.cases.every((_, index) => outcomes[index]?.won === true)) {
      onComplete()
      if (challenge) {
        const total = level.cases.length
        const instructions = Math.max(...level.cases.map((_, index) => outcomes[index]?.final.steps ?? 0))
        challenge.onWin({ kind: 'machine', passed: total, total, instructions }, replay, { cases })
      }
    }
  }

  function step() {
    if (!next) return
    setCursor(cursor + 1)
    if (cursor + 1 === result.frames.length) record({ ...checked, [scenario]: result })
  }

  function checkAll() {
    if (!terminal || result.frames.length === 0) return
    record(Object.fromEntries(level.cases.map((_, index) => [index, index === scenario ? result : runMachine(level, source, index)])))
  }

  const listing = instructions.length > 0 && <ol className="machine-instructions" aria-label={t('指令执行顺序', 'Instruction order')}>
    {instructions.map(({ code, line }) => <li key={line} className={issue?.line === line ? 'machine-line-error'
      : next?.line === line ? 'machine-line-next' : frame?.line === line ? 'machine-line-last' : undefined}
      data-current={frame?.line === line || undefined} data-next={next?.line === line || undefined}
      aria-current={next?.line === line ? 'step' : undefined}>
      <span className="machine-line-number">{line}</span><code>{code}</code>
      {next?.line === line && <span className="machine-line-label">{t('下一条', 'Next')}</span>}
      {frame?.line === line && <span className="machine-line-label">{t('刚执行', 'Executed')}</span>}
      {!demo && <button className="text-button machine-remove" type="button"
        aria-label={t(`删除第 ${line} 行`, `Delete line ${line}`)}
        onClick={() => updateSource(lines.filter((entry) => entry.line !== line).map((entry) => entry.code).join('\n'))}>×</button>}
    </li>)}
  </ol>

  const controls = <div className="machine-actions">
    <button type="button" className="primary-button" disabled={terminal} onClick={step}>{t('单步执行', 'Step')}</button>
    <button type="button" className="subtle-button" disabled={cursor === 0} onClick={() => setCursor(cursor - 1)}>{t('上一步', 'Previous step')}</button>
    <button type="button" className="subtle-button" disabled={cursor === 0}
      onClick={() => challenge && complete ? replay() : setCursor(0)}>{t('重置 CPU', 'Reset CPU')}</button>
    {!demo && source !== level.starterCode && <button type="button" className="text-button" onClick={() => updateSource(level.starterCode)}>
      {t('恢复起始程序', 'Restore starter program')}
    </button>}
  </div>

  return <div className="machine-lesson" aria-label={level.title[locale]}>
    <div className="machine-workspace classroom-split">
      <ExperimentWindow locale={locale} kind="instrument" title={t('CPU 单步调试器', 'CPU step debugger')}>
        <div className="machine-side">
          {classroom && <>
            <CpuDatapath key={scenario} state={state} previous={previous} instruction={frame?.instruction} line={frame?.line}
              locale={locale} onStep={next ? step : undefined} onAddress={setAddressChoice} />
            {!frame && !next && <p className="experiment-receipt">{t('等待可执行的指令。', 'Waiting for an instruction.')}</p>}
            {controls}
          </>}
          <StateView state={state} previous={previous} frame={frame} locale={locale} />
          {!demo && <Targets test={level.cases[scenario]} state={state} locale={locale} />}
          {demo && listing}
          {!classroom && frame && <p className="machine-step-summary" role="status">
            <code>{frame.instruction.op}</code>{' · '}
            <code>PC {previous.pc} → {state.pc}</code>{' · '}
            <code>ACC {previous.accumulator} → {state.accumulator}</code>
            {frame.instruction.op === 'STORE' && <>{' · '}{t('地址', 'Address')} {frame.instruction.address}{' '}
              <code>{previous.memory[frame.instruction.address]} → {state.memory[frame.instruction.address]}</code></>}
          </p>}
        </div>
      </ExperimentWindow>
      <CommandDesk locale={locale}>
        <section className="panel machine-program">
          <div className="machine-panel-heading"><h2>{t('指令程序', 'Instruction program')}</h2>
            <span className="machine-position">{t('已执行', 'Executed')} {state.steps}</span>
          </div>
          <div className="machine-scenarios" aria-label={t('测试场景', 'Test scenarios')} role="group">
            {level.cases.map((test, index) => <button type="button" className="subtle-button" key={index}
              aria-pressed={scenario === index} onClick={() => {
                if (scenario !== index) { setScenario(index); setCursor(0) }
              }}>
              {test.label[locale]}
              {checked[index] && <span className={checked[index]?.won ? 'machine-matching' : 'machine-failed'}
                aria-label={checked[index]?.won ? t('已通过', 'Passed') : t('待修正', 'Needs changes')}>
                {checked[index]?.won ? '✓' : '×'}
              </span>}
            </button>)}
          </div>
          {!demo && <>
            <label className="machine-editor-label" htmlFor={editorId}>{t('编写汇编', 'Write assembly')}</label>
            <CodeField id={editorId} inputRef={editor} className="machine-source" python={false} locale={locale} value={source}
              maxLength={12_000} onChange={updateSource} />
            <div className="machine-palette" role="group" aria-label={t('添加指令', 'Add instructions')}>
              <label htmlFor={addressId}>{t('地址', 'Address')}</label>
              <select id={addressId} value={address} onChange={(event) => setAddressChoice(Number(event.currentTarget.value))}>
                {result.initial.memory.map((_, index) => <option key={index} value={index}>{index}</option>)}
              </select>
              {level.allowedOps.map((op) => <button type="button" className="subtle-button" key={op} title={tr(locale, ...hints[op])}
                aria-label={t(`添加 ${op}`, `Add ${op}`)} onClick={() => add(op)}>{op}</button>)}
            </div>
          </>}
          {!demo && listing}
          {!classroom && controls}
          {issue && <p className="machine-feedback machine-failed" role="alert">{message(locale, issue)}</p>}
          {!demo && level.cases.length > 1 && <div className="machine-verification">
            <button type="button" className="subtle-button" disabled={!terminal || result.frames.length === 0} onClick={checkAll}>
              {t('检验全部场景', 'Check all scenarios')}
            </button>
            {tested > 0 && <TaskProgress label={t('已通过', 'Passed')} done={level.cases.filter((_, index) => checked[index]?.won).length} total={level.cases.length} />}
          </div>}
          {complete && <p className="machine-feedback machine-matching" role="status" data-task-success="true">{demo
            ? t('已执行到 HALT，演示完成。', 'HALT reached. Demo complete.')
            : t('同一份程序通过了所有场景。', 'The same program passed all scenarios.')}</p>}
          {!complete && !demo && terminal && result.won && <p className="machine-feedback machine-matching" role="status" data-task-success="true">
            {t('当前场景通过。', 'This scenario passed.')}
          </p>}
          {review && <ChallengeFailureReview review={review} onRetry={retry} />}
          {level.hints.length > 0 && <details className="machine-hints"><summary>{t('任务提示', 'Mission hints')}</summary>
            <HintSteps hints={level.hints} locale={locale} />
          </details>}
        </section>
      </CommandDesk>
    </div>
  </div>
}

export default function MachineLesson(props: Props) {
  return <Session key={props.level.id} {...props} />
}
