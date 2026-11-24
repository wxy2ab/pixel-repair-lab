import { useEffect, useMemo, useState } from 'react'
import { runProgramWalkthrough } from '../engine/programWalkthrough'
import { programSourceLines, type ProgramWalkthrough, type ProgramWalkthroughFrame, type ProgramWalkthroughResult } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { CommandDesk } from './Classroom'
import { DeviceWindow } from './DeviceWindow'
import { TeachingModel } from './station3d/TeachingModel'
import { runIssueText, tr } from './text'
import './variable-cups-lesson.css'

const loadCupShelf = () => import('./station3d/python-runtime-instruments').then(module => module.buildCupShelf)

const stages = ['store', 'read', 'copy', 'replace', 'show', 'done'] as const
type Stage = typeof stages[number]
type Field = 'source' | 'copy'
type CupConfig = NonNullable<ProgramWalkthrough['variableCups']>
type Translate = (zh: string, en: string) => string
type Trial = { input: number; run?: ProgramWalkthroughResult }

function numberIn(frame: ProgramWalkthroughFrame | undefined, name: string) {
  const value = frame?.stack.find(scope => scope.name === '<module>')?.values.find(item => item.name === name)?.value
  return typeof value === 'number' ? value : undefined
}

function Cup({ address, name, value, selected, onSelect, t }: {
  address: number; name?: string; value?: number; selected: boolean; onSelect: () => void; t: Translate
}) {
  const empty = t('空杯', 'Empty')
  const description = [t('地址 ' + address, 'Address ' + address), name, value === undefined ? empty : t('值 ' + value, 'value ' + value)].filter(Boolean).join(' · ')
  return <button type="button" className="vc-cup" aria-label={description} data-cup-address={address}
    data-name={name ?? ''} data-value={value ?? ''} data-selected={selected || undefined} onClick={onSelect}>
    <span className="vc-cup-tag" data-named={!!name} aria-hidden="true">{name || ' '}</span>
    <span className="vc-socket" aria-hidden="true" />
    <span className="vc-glass" aria-hidden="true">
      <span className="vc-rim" />
      {value === undefined ? <span className="vc-empty">{empty}</span>
        : <span className="vc-number-card" key={value}>{value}</span>}
    </span>
    <span className="vc-address" aria-hidden="true">{t('地址', 'Address')} <b>{address}</b></span>
  </button>
}

function CupPractice({ execution, config, locale, t, onTrial, onComplete }: {
  execution: ProgramWalkthrough; config: CupConfig; locale: Locale; t: Translate; onTrial: (trial: Trial) => void; onComplete: () => void
}) {
  const [sampleIndex, setSampleIndex] = useState(1)
  const [guesses, setGuesses] = useState<Partial<Record<Field, string>>>({})
  const [actual, setActual] = useState<Record<Field, string>>()
  const [failed, setFailed] = useState(false)
  const sample = execution.cases[sampleIndex]
  if (!sample) return null
  const fields = [['source', config.variable], ['copy', config.snapshot]] as const
  const matched = actual && fields.every(([field]) => actual[field] === guesses[field])

  function selectBattery(index: number) {
    if (sampleIndex === index) {
      if (guesses.source === undefined && guesses.copy === undefined) onTrial({ input: sample.input })
      return
    }
    setSampleIndex(index)
    setGuesses({})
    setActual(undefined)
    setFailed(false)
    onTrial({ input: execution.cases[index].input })
  }

  function verify() {
    const run = runProgramWalkthrough(execution.source, sample.input)
    const end = run.frames.at(-1)
    const value = numberIn(end, config.variable)
    const savedValue = numberIn(end, config.snapshot)
    if (run.issue || end?.kind !== 'end' || value === undefined || savedValue === undefined) {
      setFailed(true)
      return
    }
    const result = { source: String(value), copy: String(savedValue) }
    setActual(result)
    onTrial({ input: sample.input, run })
    if (fields.every(([field]) => result[field] === guesses[field])) onComplete()
  }

  return <CommandDesk locale={locale}>
    <section className="vc-practice" aria-label={t('换块电池试一试', 'Try a new battery')}>
      <h2>{t('换块电池试一试', 'Try a new battery')}</h2>
      <fieldset><legend>{t('选一块电池', 'Choose a battery')}</legend>
        <div className="vc-choices">{execution.cases.slice(1).map((entry, i) => <button type="button"
          className="subtle-button" key={i} data-testid="cup-sample" data-input={entry.input} aria-pressed={i + 1 === sampleIndex}
          onClick={() => selectBattery(i + 1)}>{entry.label[locale]}</button>)}</div>
      </fieldset>
      <p>{t('把 ' + sample.input + ' 记到 ' + config.variable + '，把读数留给 ' + config.snapshot + '，再把 ' + config.variable + ' 换成 0。猜猜最后两张标签各会读到几？',
        'Store ' + sample.input + ' in ' + config.variable + ', save that reading in ' + config.snapshot + ', then set ' + config.variable + ' to 0. What will each name give you at the end?')}</p>
      <div className="vc-predictions">{fields.map(([field, name]) => <fieldset key={field} data-cup-prediction={field}>
        <legend><code>{name}</code></legend>
        <div className="vc-choices">{sample.predictions?.map(option => <button type="button" key={option} className="subtle-button"
          data-guess={option} aria-pressed={guesses[field] === option} onClick={() => {
            setActual(undefined)
            setFailed(false)
            setGuesses(previous => ({ ...previous, [field]: option }))
            onTrial({ input: sample.input })
          }}>{option}</button>)}</div>
        {actual && <p className="vc-result">{t('猜的是 ', 'You chose ') + guesses[field] + t('，实际读到 ', '. The program read ')}<b>{actual[field]}</b></p>}
      </fieldset>)}</div>
      <button type="button" className="primary-button" data-testid="cup-verify" disabled={!guesses.source || !guesses.copy || !!actual}
        onClick={verify}>{t('运行验证', 'Run to check')}</button>
      {actual && <p role="status" className="vc-feedback" data-testid="cup-feedback" data-match={matched}>{matched
        ? t('两个都猜对了！你找到了每个名字现在对应的数。', 'Both match! You found the number each name now gives you.')
        : t('再看看最后一次写入的是哪张标签。你可以改选数字，再运行一次。', 'Look at the name that changed last. Pick another number and run again.')}</p>}
      {failed && <p role="alert" className="error-message">{t('程序没能读到两个数。请再运行一次。', 'The program could not read both numbers. Try running again.')}</p>}
    </section>
  </CommandDesk>
}

export function VariableCupsLesson({ execution, locale, onComplete, onPhase }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void
  /** Reports 0 while the learner sets up the cups and 1 once the prediction opens. */
  onPhase?: (phase: number) => void
}) {
  const config = execution.variableCups
  const sample = execution.cases[0]
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const [step, setStep] = useState(0)
  const [sourceAddress, setSourceAddress] = useState<number>()
  const [copyAddress, setCopyAddress] = useState<number>()
  const [lastAddress, setLastAddress] = useState<number>()
  const [miss, setMiss] = useState<number>()
  const [readChoice, setReadChoice] = useState<'choose' | 'address'>()
  const [trial, setTrial] = useState<Trial>()
  const practising = stages[step] === 'done'
  useEffect(() => onPhase?.(Number(practising)), [onPhase, practising])
  const run = useMemo(() => sample && runProgramWalkthrough(execution.source, sample.input), [execution.source, sample])
  if (!config || !sample || !run) return null
  const { variable, snapshot } = config
  const demoSteps = run.frames.filter(frame => frame.kind === 'assign' || frame.kind === 'output')
  if (run.issue || demoSteps.length !== stages.length - 1) return <p role="alert" className="error-message">{run.issue
    ? runIssueText(locale, run.issue) : t('这段示例程序没有读到完整的数字卡。', 'The sample did not produce a complete set of number cards.')}</p>
  const stage = stages[step]
  const pending = !!trial && !trial.run
  const visibleSteps = trial ? (trial.run?.frames.filter(frame => frame.kind === 'assign' || frame.kind === 'output') ?? []) : demoSteps.slice(0, step)
  const current = visibleSteps.at(-1)
  const source = programSourceLines(execution.source)
  const reading = numberIn(current, variable)
  const saved = numberIn(current, snapshot)
  const latest = current?.output.at(-1)
  const cups = config.addresses.map(address => ({
    address,
    name: pending ? undefined : address === sourceAddress ? variable : address === copyAddress ? snapshot : undefined,
    value: address === sourceAddress ? reading : address === copyAddress ? saved : undefined,
  }))

  const instructions: Record<Stage, string> = {
    store: t('芽芽读到了 ' + sample.input + ' 格电。点一个空杯，贴上 ' + variable + '（电量）的标签，把数字卡放进去。',
      'Sprout reads ' + sample.input + ' units. Tap any empty cup to label it ' + variable + ' and put the number card inside.'),
    read: readChoice ? t('你找到了 ' + variable + '。屏幕要显示电量，应该读哪个数？',
      'You found ' + variable + '. Which number should the display use for the charge?')
      : t('程序想知道电量。点贴着 ' + variable + ' 的杯子。', 'The program needs the charge. Tap the cup tagged ' + variable + '.'),
    copy: t('读过以后，卡片还在杯里。点另一个空杯，贴上 ' + snapshot + '（留存的读数），把刚才的读数也记在那里。',
      'The card stays in its cup after a read. Tap a different empty cup, label it ' + snapshot + ', and keep the same reading there.'),
    replace: t('电池用完了。点贴着 ' + variable + ' 的杯子，把它的数字卡换成 0。留心杯子下面的地址。',
      'The battery has run down. Tap ' + variable + ' to replace its card with 0. Watch the address underneath.'),
    show: t('地址 ' + sourceAddress + ' 里装的是数字 0，旁边的空杯里连卡片都没有。点 ' + snapshot + '，读出之前留下的电量。',
      'Address ' + sourceAddress + ' holds the number 0. An empty cup has no card at all. Tap ' + snapshot + ' to read the earlier charge.'),
    done: trial ? pending
      ? t('这次换成 ' + trial.input + ' 格的电池。先在操作台选出两个预测，再运行看看杯子里装了什么。',
        'The new battery has ' + trial.input + ' units. Predict both values at the control desk, then run to fill the cups.')
      : t('刚刚运行的是 ' + trial.input + ' 格的电池。程序用 ' + variable + ' 读到 ' + reading + '，用 ' + snapshot + ' 读到之前留下的 ' + saved + '。',
        'You just ran the battery with ' + trial.input + ' units. ' + variable + ' holds ' + reading + ', and ' + snapshot + ' still gives you the earlier reading of ' + saved + '.')
      : t('刚才这块电池，用 ' + variable + ' 读到 ' + reading + '，用 ' + snapshot + ' 还会读到 ' + saved + '。变量就是程序用来记住一个值的名字。',
        'With the example battery, ' + variable + ' gives you ' + reading + ', while ' + snapshot + ' still gives you ' + saved + '. A variable is a name a program uses to remember a value.'),
  }
  let hint: string | undefined
  if (miss !== undefined) {
    hint = stage === 'copy' ? t('这个杯子已经有标签。找一个空杯来留存读数。', 'This cup already has a name. Choose an empty cup for the saved reading.')
      : t('看看杯口的名字。请找 ' + (stage === 'show' ? snapshot : variable) + '。', 'Look at the tags. Find ' + (stage === 'show' ? snapshot : variable) + '.')
  } else if (readChoice === 'address') {
    hint = t('架上的 ' + sourceAddress + ' 告诉芽芽去哪里找。读电量要看杯子里面的数字卡。再选一次。',
      'The shelf number ' + sourceAddress + ' tells Sprout where to look. For the charge, look at the card inside. Try again.')
  }

  function act(address: number) {
    if (stage === 'done') { setLastAddress(address); return }
    const valid = stage === 'store' || (stage === 'copy' ? address !== sourceAddress : address === (stage === 'show' ? copyAddress : sourceAddress))
    if (!valid) { setMiss(address); setReadChoice(undefined); return }
    if (stage === 'store') setSourceAddress(address)
    if (stage === 'copy') setCopyAddress(address)
    setLastAddress(address)
    setMiss(undefined)
    if (stage === 'read') { setReadChoice('choose'); return }
    setStep(step + 1)
  }

  function reset() {
    setStep(0)
    setSourceAddress(undefined)
    setCopyAddress(undefined)
    setLastAddress(undefined)
    setMiss(undefined)
    setReadChoice(undefined)
    setTrial(undefined)
  }

  return <div className="lecture-layout vc-lesson" data-testid="variable-cups" data-stage={stage} data-trial-input={trial?.input}>
    <DeviceWindow kind="instrument" className="vc-station" locale={locale} title={t('维修站的记忆杯架', 'Workshop memory shelf')}>
      <div className="vc-instruction"><p role="status">{instructions[stage]}</p></div>
      <TeachingModel sceneKey="python-address-cups" locale={locale} load={loadCupShelf}
        label={t('按地址取放数字卡', 'Store and read cards by address')} state={{ cups, selected: lastAddress }}
        onPick={id => act(Number(id))} />
      <div className="vc-shelf" aria-label={t('按地址排列的杯子', 'Cups in address order')} role="group">
        {cups.map(cup => <Cup key={cup.address} {...cup} t={t} selected={lastAddress === cup.address} onSelect={() => act(cup.address)} />)}
      </div>
      {stage === 'read' && readChoice && <div className="vc-choices vc-read-choice">
        <button type="button" className="subtle-button" data-testid="cup-read-choice" data-kind="address" onClick={() => setReadChoice('address')}>
          {t('架上的 ', 'Shelf number ') + sourceAddress}
        </button>
        <button type="button" className="subtle-button" data-testid="cup-read-choice" data-kind="value" onClick={() => { setReadChoice(undefined); setStep(step + 1) }}>
          {t('杯里的 ', 'Number card ') + reading}
        </button>
      </div>}
      {hint && <p className="vc-hint" role="status" data-testid="cup-hint">{hint}</p>}
      <div className="vc-base">
        <div className="vc-terminal" aria-label={t('程序屏幕', 'Program display')}>
          <span>{t('程序屏幕', 'Program display')}</span>
          <output data-testid="cup-output">{latest ?? '—'}</output>
        </div>
        {visibleSteps.length > 0 && <div className="vc-code"><h3>{t('刚执行的 Python', 'Python so far')}</h3>
          <ol data-testid="cup-code">{visibleSteps.map(frame => <li key={frame.line} data-line={frame.line} aria-current={frame === current ? 'step' : undefined}>
            <span aria-hidden="true">{frame.line}</span><code>{source[(frame.line ?? 1) - 1]}</code>
          </li>)}</ol>
        </div>}
      </div>
      <div className="vc-foot"><p>{t('把这排杯子想成一小片内存。架上的号码叫地址，告诉你杯子在哪儿。写 Python 时，用名字就能找到值，电脑会安排真正的存放位置。',
        'Imagine this shelf as a tiny memory. Each shelf number is an address that tells you where a cup sits. In Python, a name finds a value. The computer handles its real storage.')}</p>
        {step > 0 && <button type="button" className="subtle-button" onClick={reset}>{t('重新摆杯', 'Reset shelf')}</button>}
      </div>
    </DeviceWindow>
    {stage === 'done' && <CupPractice execution={execution} config={config} locale={locale} t={t} onComplete={onComplete}
      onTrial={next => { setTrial(next); setLastAddress(next.run ? copyAddress : undefined) }} />}
  </div>
}
