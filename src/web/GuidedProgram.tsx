import { ChargeInput, CodingDevice } from './CodingDevice'
import { RuntimeStack } from './PythonRuntimeInstrument'
import { useMemo, useRef, useState } from 'react'
import { runProgramWalkthrough } from '../engine/programWalkthrough'
import {
  programGraphics, programSourceLines, type ProgramGraphic, type ProgramWalkthrough, type ProgramWalkthroughFrame, type WalkthroughScope,
} from '../shared/programWalkthrough'
import type { Json, Locale } from '../shared/types'
import { runIssueText, tr } from './text'
import { StepCount } from './LessonFrame'
import './guided-program.css'

type Translate = (zh: string, en: string) => string
type Transfer = { title?: string; from: string; to: string; numbers: { name?: string; value: string }[]; note: string }

function displayValue(value: Json | undefined): string {
  if (value === undefined) return ''
  if (value === null) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function describeTransfer(
  frames: ProgramWalkthroughFrame[], index: number, locale: Locale, t: Translate, scopeTitle: (name?: string) => string, graphic?: ProgramGraphic,
  functionLesson?: ProgramWalkthrough['functionLesson'],
): Transfer | undefined {
  const frame = frames[index]
  const activeScope = frame.stack.at(-1)
  const scope = scopeTitle(activeScope?.name)
  const value = displayValue(frame.value)
  const numbers = [{ value }]
  switch (frame.kind) {
    case 'assign': {
      const name = frame.name ?? ''
      if (graphic?.icon === 'battery') return {
        from: t('电池', 'Battery'), to: name, numbers,
        note: t(`读到 ${value} 格，把这个数存进主程序里名叫 ${name} 的变量。`,
          `The main program reads ${value} units and stores that number in the variable called ${name}.`),
      }
      if (frames[index - 1]?.kind === 'return') return {
        title: t('把返回值存进变量', 'Store the returned value'),
        from: t('交回来的数字', 'Returned number'), to: name, numbers,
        note: t(`${scope}接着执行，把交回的 ${value} 存进 ${name}。`, `${scope} continues and stores the returned ${value} in ${name}.`),
      }
      if (functionLesson && activeScope?.name === functionLesson.functionName && name === functionLesson.parameter) {
        const mainValue = frame.stack[0]?.values.find(binding => binding.name === name)?.value
        if (mainValue !== undefined) {
          const main = displayValue(mainValue)
          const compared = t(`函数里的 ${name} 是 ${value}。主程序里的 ${name} 是 ${main}。`,
            `The function’s ${name} is ${value}. The main program’s ${name} is ${main}.`)
          return { from: scope, to: name, numbers, note: graphic ? `${graphic.note[locale]} ${compared}` : compared }
        }
      }
      const stored = t(`${scope}把 ${value} 存进自己的变量 ${name}。`, `${scope} stores ${value} in its own variable called ${name}.`)
      return {
        from: scope, to: name, numbers,
        note: graphic?.icon === 'compute' ? `${graphic.note[locale]} ${stored}` : stored,
      }
    }
    case 'call': {
      const caller = scopeTitle(frame.stack.at(-2)?.name)
      const parameters = (activeScope?.values ?? []).filter(binding => binding.parameter)
      const focus = functionLesson && activeScope?.name === functionLesson.functionName
        ? parameters.find(binding => binding.name === functionLesson.parameter)
        : undefined
      const argument = displayValue(focus?.value)
      return {
        from: caller, to: scope, numbers: parameters.map(({ name, value }) => ({ name, value: displayValue(value) })),
        note: focus
          ? t(`${caller}把 ${focus.name} 的值 ${argument} 传给${scope}的参数 ${focus.name}，然后等它交回结果。`,
            `${caller} passes ${argument} from ${focus.name} to the function’s parameter ${focus.name}, then waits for the result.`)
          : t(`${caller}停在调用这一行。${scope}叠到最上面，用自己的参数接住传来的数字。`,
            `${caller} waits on the call. ${scope} goes on top and receives the numbers in its own parameters.`),
      }
    }
    case 'return': {
      const returning = scopeTitle(frame.name)
      return {
        from: returning, to: scope, numbers,
        note: functionLesson
          ? t(`return 把 ${value} 交回${scope}。这次函数调用结束，${scope}接着执行。`,
            `return hands ${value} back to the main program. The function call ends and the main program resumes.`)
          : t(`${returning}把 ${value} 交回来，它的这一层退出。${scope}回到原来等待的位置。`,
            `${returning} hands back ${value} and its frame leaves the stack. ${scope} resumes where it was waiting.`),
      }
    }
    case 'output':
      return {
        from: scope, to: t('屏幕', 'Screen'), numbers,
        note: t(`${scope}把算好的 ${value} 显示在屏幕上。`, `${scope} shows the result, ${value}, on the screen.`),
      }
    default: return undefined
  }
}

function ScopeCard({ entry, previous, isActive, finished, scopeTitle, t }: {
  entry: WalkthroughScope; previous?: WalkthroughScope; isActive: boolean; finished: boolean;
  scopeTitle: string; t: Translate;
}) {
  const status = finished ? t('已结束', 'Finished') : isActive ? t('当前执行', 'Running') : t('等待返回', 'Waiting for a result')
  return <li className="guided-scope" data-stack-frame={entry.id} data-scope-role={entry.name === '<module>' ? 'main' : 'function'}
    data-active={isActive || undefined}
    data-waiting={!isActive && !finished || undefined}>
    <div className="guided-scope-heading">
      <strong>{scopeTitle}</strong>
      <span>{status}</span>
    </div>
    {entry.values.length === 0 ? <p>{t('还没有存下数字。', 'No numbers stored yet.')}</p>
      : <dl className="guided-variables">
        {entry.values.map(({ name, value, parameter }) => {
          const stored = displayValue(value)
          const prior = previous?.values.find(binding => binding.name === name)
          const changed = !prior || displayValue(prior.value) !== stored
          return <div key={name} data-binding={name} data-changed={changed || undefined} data-parameter={parameter || undefined}>
            <dt>{name}{parameter && <small>{t('参数', 'Parameter')}</small>}</dt>
            <dd>{stored}</dd>
          </div>
        })}
      </dl>}
  </li>
}

export function GuidedProgram({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const input = execution.cases[0].input
  const source = execution.source
  const visual = execution.visual
  const functionLesson = execution.functionLesson
  const [index, setIndex] = useState(0)
  const notified = useRef(false)
  const { frames, issue } = useMemo(() => {
    const result = runProgramWalkthrough(source, input)
    return { frames: result.frames.filter(frame => frame.kind !== 'define'), issue: result.issue }
  }, [source, input])
  const frame = frames[index]
  const previous = frames[index - 1]
  const isFinished = frame?.kind === 'end'
  const stack = frame?.stack ?? []
  const activeScope = stack.at(-1)
  const displayedScopes = functionLesson ? stack : stack.toReversed()
  const output = frame?.output ?? []
  const functions = visual?.functions ?? []
  const graphic = visual && programGraphics(visual).find(block => block.line === frame?.line)

  function scopeTitle(name?: string) {
    if (!name || name === '<module>') return t('主程序', 'Main program')
    return functions.find(group => group.id === name)?.title[locale] ?? name
  }

  const transfer = frame && describeTransfer(frames, index, locale, t, scopeTitle, graphic, functionLesson)
  const action = transfer?.title ?? graphic?.label[locale]
  const seenLines = new Set<number>()
  const definitionLines = new Set<number>()
  for (const step of frames.slice(0, index + 1)) {
    if (step.line !== undefined) seenLines.add(step.line)
    if (step.kind !== 'call') continue
    const definition = functions.find(group => group.id === step.name)?.header.line
    if (definition === undefined) continue
    seenLines.add(definition)
    definitionLines.add(definition)
  }

  function stepTo(next: number) {
    setIndex(next)
    if (frames[next]?.kind === 'end' && !issue && !notified.current) {
      notified.current = true
      onReady()
    }
  }

  const readyMessage = functionLesson
    ? t(`换一个起始电量，猜猜函数会返回多少、主程序里的 ${functionLesson.parameter} 会是多少。`,
      `Try a different starting charge. Predict what the function will return and the value of ${functionLesson.parameter} in the main program.`)
    : t('补电程序跑完了。在下面换一个起始电量，先猜猜屏幕会显示多少。',
      'The charging program has finished. Choose a different starting charge below and predict what the screen will show.')
  const startMessage = functionLesson
    ? t('点电池读取起始电量，再跟着这个数字走进补电函数。',
      'Select the battery to read its charge, then follow that number into the function.')
    : t('点电池，把起始电量交给主程序。小帮手等到被叫时才开始。',
      'Select the battery to send its charge to the main program. The helpers wait until they are called.')
  const scopeLabel = functionLesson ? t('主程序和函数的变量', 'Main program and function variables')
    : t('调用堆栈，从顶部开始', 'Call stack, top first')

  return <section className="classroom-demonstration panel guided-program" aria-label={t('补电程序的运行过程', 'Charging program walkthrough')}
    data-testid="guided-program" data-trace-kind={frame?.kind} data-trace-line={frame?.line}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      <div className="guided-program-nav">
        <button className="subtle-button" type="button" disabled={index === 0} onClick={() => stepTo(index - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        <button className="primary-button" type="button" disabled={index >= frames.length - 1} onClick={() => stepTo(index + 1)}>
          {t('下一步', 'Next step')}
        </button>
        <StepCount position={index} total={frames.length - 1} locale={locale} />
      </div>
    </>}>
      <div className="panel-heading guided-program-heading">
        <h2>{visual?.title[locale] ?? t('给芽芽补电', 'Top up Sprout’s battery')}</h2>
      </div>
      <div className="guided-program-body">
        <RuntimeStack frame={frame} input={input} locale={locale} onPick={id => {
          if (id === 'input' && frames.length > 1) stepTo(1)
          if (id === 'step' && index + 1 < frames.length) stepTo(index + 1)
        }} />
        <div className="guided-endpoints">
          <div className="guided-endpoint" data-active={graphic?.icon === 'battery' || undefined}>
            <span>{t('起始电量', 'Starting charge')}</span>
            {frames.length > 1 ? <ChargeInput value={input} locale={locale} onRead={() => stepTo(1)} started={index > 0}
              className="guided-battery" testId="guided-input" /> : <strong data-testid="guided-input">{input}</strong>}
          </div>
          <div className="guided-endpoint-path" aria-hidden="true">
            <span>→</span><span>{t('程序', 'Program')}</span><span>→</span>
          </div>
          <div className="guided-endpoint" data-active={frame?.kind === 'output' || undefined}>
            <span>{t('屏幕', 'Screen')}</span>
            <output className="guided-screen" data-testid="walkthrough-output">
              {output.length > 0 ? output.join('\n') : t('还没有输出', 'No output yet')}
            </output>
          </div>
        </div>
        <div className="guided-transfer-area" role="status">
          {transfer && frame ? <div key={index} data-testid="guided-transfer" data-transfer-kind={frame.kind} className="guided-transfer">
            {action && <strong>{action}</strong>}
            <div className="guided-transfer-path" aria-hidden="true">
              <span className="guided-transfer-side">{transfer.from}</span>
              <span className="guided-transfer-center">
                {transfer.numbers.map(({ name, value }) => <span className="guided-transfer-token" key={name ?? value}>
                  {name && <span>{name}</span>}<b>{value}</b>
                </span>)}
              </span>
              <span className="guided-transfer-side">{transfer.to}</span>
            </div>
            <p>{transfer.note}</p>
          </div> : <p>{isFinished ? readyMessage : startMessage}</p>}
        </div>
        <div className="guided-workspace" data-has-code={seenLines.size > 0 || undefined} data-function-lesson={!!functionLesson || undefined}>
          <section className="guided-stack-panel">
            <h3>{functionLesson ? scopeLabel : t('调用堆栈', 'Call stack')}</h3>
            {functionLesson
              ? displayedScopes.length > 1 && <p>{t(`两处各有一个叫 ${functionLesson.parameter} 的变量。`,
                `The main program and the function each have a variable named ${functionLesson.parameter}.`)}</p>
              : <p>{t('最上面的一层正在做事，下面的层等它交回结果。', 'The top frame runs while the frames below wait for a result.')}</p>}
            <ol data-testid="walkthrough-stack" aria-label={scopeLabel} className="guided-stack" data-scope-comparison={!!functionLesson || undefined}>
              {displayedScopes.map(entry => <ScopeCard key={entry.id} entry={entry} scopeTitle={scopeTitle(entry.name)}
                previous={previous?.stack.find(old => old.id === entry.id)} isActive={entry.id === activeScope?.id && !isFinished}
                finished={isFinished} t={t} />)}
            </ol>
          </section>
          <section className="guided-source-panel" data-testid="walkthrough-code" hidden={seenLines.size === 0}>
            <h3>{t('Python 代码', 'Python code')}</h3>
            <ol className="guided-source">
              {programSourceLines(source).map((line, lineIndex) => {
                const number = lineIndex + 1
                if (!seenLines.has(number)) return null
                return <li key={number} data-line={number} aria-current={frame?.line === number ? 'step' : undefined}
                  data-resuming={frame?.resumeLine === number || undefined}>
                  <span className="guided-line-number" aria-hidden="true">{number}</span>
                  <code>{line}</code>
                  {definitionLines.has(number) && <span className="guided-definition-label">{t('函数的开头', 'Function definition')}</span>}
                </li>
              })}
            </ol>
          </section>
        </div>
        {issue && index >= frames.length - 1 && <p className="error-message" role="alert">{runIssueText(locale, issue)}</p>}
      </div>
    </CodingDevice>
  </section>
}
