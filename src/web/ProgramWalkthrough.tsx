import { CodingDevice } from './CodingDevice'
import { RuntimeStack } from './PythonRuntimeInstrument'
import { useMemo, useState } from 'react'
import { runProgramWalkthrough } from '../engine/programWalkthrough'
import { programGraphics, programSourceLines, type ProgramWalkthrough as Execution, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import { pythonValue } from './pythonValue'
import type { Locale } from '../shared/types'
import { useReplayCursor } from './lessonTools'
import { ReplayControls } from './ReplayControls'
import { ProgramDiagram } from './ProgramDiagram'
import { runIssueText, tr } from './text'
import './program-walkthrough.css'
import './inline-execution-source.css'

type StackFrame = ProgramWalkthroughFrame['stack'][number]


function EventCaption({ frame, locale }: { frame: ProgramWalkthroughFrame; locale: Locale }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const name = frame.name ?? ''
  const value = frame.value === undefined ? null : <code>{pythonValue(frame.value)}</code>
  const resume = frame.resumeLine === undefined ? '' : t(`回到第 ${frame.resumeLine} 行。`, ` Resume on line ${frame.resumeLine}.`)
  switch (frame.kind) {
    case 'start': return <>{t('主程序从上往下执行。点「下一步」，看看最先发生什么。', 'The main program starts at the top. Step forward to see what happens first.')}</>
    case 'define': return <>{t('定义函数', 'Define')} <code>{name}()</code>{t('，把这段代码记下来，等调用时再执行。', ' and keep its code ready for a later call.')}</>
    case 'import': return <>{t('导入函数', 'Import')} <code>{name}()</code>{t('，让当前文件可以调用它。', ' so this file can call it.')}</>
    case 'evaluate': return <>{t('先算出右边的值 ', 'Evaluate the right side first to get ')}{value}{t('。', '.')}</>
    case 'assign': return <><code>{name}</code>{t(' 现在保存 ', ' now holds ')}{value}{t('。', '.')}</>
    case 'branch': return <>{t('程序走 ', 'The program takes the ')}<code>{name}</code>{t(' 分支。', ' branch.')}</>
    case 'iterate': return <><code>{name}</code>{t(' 取到下一项 ', ' takes the next value ')}{value}{t('。', '.')}</>
    case 'append': return <>{t('把 ', 'Append ')}{value}{t(' 追加到列表末尾。', ' to the end of the list.')}</>
    case 'insert': return <>{t('把 ', 'Insert ')}{value}{t(' 插入列表。', ' into the list.')}</>
    case 'loop-end': return <>{t('没有下一项，循环结束。', 'There are no more items. The loop ends.')}</>
    case 'while-check': return <>{t('检查循环条件，得到 ', 'Checking the loop condition gives ')}{value}{t('。', '.')}</>
    case 'call': return <>{t('调用', 'Call')} <code>{name}()</code>{t('。调用者暂停，新的一层开始执行。', '. The caller waits while a new frame runs.')}</>
    case 'return': return <><code>{name}()</code>{t(' 交回 ', ' returns ')}{value}{t('，这一层退出。', ' and its frame is removed.')}{resume}</>
    case 'output': return <><code>say()</code>{t(' 把结果显示在输出区。', ' sends the result to the output panel.')}</>
    case 'end': return <>{t('主程序运行结束。可以换一组输入，看看同一段代码会得到什么结果。', 'The main program is finished. Try a different input with the same code.')}</>
  }
}

function StackCard({ entry, previous, active, finished, locale }: {
  entry: StackFrame; previous?: StackFrame; active: boolean; finished: boolean; locale: Locale;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const main = entry.name === '<module>'
  return <li className="walkthrough-frame" data-stack-frame={entry.id} data-active={active || undefined}>
    <div className="walkthrough-frame-title">
      {main ? <strong>{t('主程序', 'Main program')}</strong> : <code>{entry.name}()</code>}
      <span>{finished ? t('已结束', 'Finished') : active ? t('当前执行', 'Running') : t('等待返回', 'Waiting')}</span>
    </div>
    {entry.values.length > 0 ? <dl className="walkthrough-values">
      {entry.values.map(({ name, value, parameter }) => {
        const formatted = pythonValue(value)
        const prior = previous?.values.find(binding => binding.name === name)
        const changed = !prior || pythonValue(prior.value) !== formatted
        return <div key={name} data-binding={name} data-changed={changed || undefined}>
          <dt><code>{name}</code>{parameter && <small>{t('参数', 'Parameter')}</small>}</dt>
          <dd><code>{formatted}</code></dd>
        </div>
      })}
    </dl> : <p>{t('这一层还没有变量。', 'This frame has no variables yet.')}</p>}
  </li>
}

export function ProgramWalkthrough({ execution, locale, onRevisit }: { execution: Execution; locale: Locale; onRevisit?: () => void }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [selected, setSelected] = useState(0)
  const sample = execution.cases[selected]
  const { frames, issue } = useMemo(() => runProgramWalkthrough(execution.source, sample.input), [execution.source, sample.input])
  const count = Math.max(0, frames.length - 1)
  const cursor = useReplayCursor(count, 1100)
  const index = Math.min(cursor.step, count)
  const frame = frames[index]
  const previous = frames[index - 1]
  const lines = programSourceLines(execution.source)
  const stack = frame?.stack ?? []
  const output = frame?.output ?? []
  const diagrams = execution.visual ? programGraphics(execution.visual) : []
  const active = diagrams.find(block => block.line === frame?.line)?.id

  function seekLine(line: number) {
    const target = frames.findIndex(entry => entry.line === line)
    if (target !== -1) cursor.seek(target)
  }

  return <section className="classroom-demonstration panel program-walkthrough" aria-label={t('程序运行演示', 'Program execution')}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      {onRevisit && <button type="button" className="subtle-button" onClick={onRevisit}>{t('重看操作步骤', 'Review the steps')}</button>}
      <ReplayControls cursor={cursor} count={count} locale={locale} />
    </>}>
      <div className="panel-heading walkthrough-heading">
        <h2>{t('程序运行演示', 'Program execution')}</h2>
      </div>
      <RuntimeStack frame={frame} input={sample.input} locale={locale} onPick={id => {
        if (id === 'input') cursor.restart(false)
        if (id === 'step' && index < count) cursor.seek(index + 1)
      }} />
      <div className="walkthrough-ports">
        <div>
          <h3>{t('送进程序的值', 'Input to the program')}</h3>
          <strong className="walkthrough-reading">{sample.input}</strong>
          <div className="walkthrough-inputs" role="group" aria-label={t('选择输入', 'Choose input')}>
            {execution.cases.map((item, sampleIndex) => <button type="button" className="subtle-button" key={sampleIndex}
              aria-pressed={selected === sampleIndex} onClick={() => {
                setSelected(sampleIndex)
                cursor.restart(false)
              }}>{item.label[locale]}</button>)}
          </div>
        </div>
        <span className="walkthrough-wire" aria-hidden="true">→</span>
        <div>
          <h3>{frame?.line ? t(`运行第 ${frame.line} 行`, `Running line ${frame.line}`) : t('程序', 'Program')}</h3>
          {frame && <p className="walkthrough-caption" role="status"><EventCaption frame={frame} locale={locale} /></p>}
        </div>
        <span className="walkthrough-wire" aria-hidden="true">→</span>
        <div className="walkthrough-output">
          <h3>{t('程序输出', 'Program output')}</h3>
          <pre data-testid="walkthrough-output">{output.length > 0 ? output.join('\n') : t('还没有输出', 'No output yet')}</pre>
        </div>
      </div>
      {issue && index === count && <p className="walkthrough-caption error-message" role="alert">{runIssueText(locale, issue)}</p>}
      {execution.visual && <section className="walkthrough-diagram" aria-label={t('步骤示意', 'Steps at a glance')}>
        <ProgramDiagram visual={execution.visual} source={execution.source} locale={locale} compact showFunctions active={active}
          onPick={block => seekLine(block.line)} />
      </section>}
      <div className="walkthrough-workspace">
        <div className="walkthrough-source">
          <h3>{t('Python 代码', 'Python code')}</h3>
          <ol data-testid="walkthrough-code" className="walkthrough-code" aria-label={t('Python 代码', 'Python code')}>
            {lines.map((line, lineIndex) => {
              const number = lineIndex + 1
              const current = frame?.line === number
              const next = frames[index + 1]?.line === number
              const waiting = !current && stack.some(entry => entry.callLine === number)
              const resuming = !current && frame?.resumeLine === number
              const graphic = diagrams.find(block => block.line === number)
              return <li key={number} className="execution-marked-line" data-line={number} aria-current={current ? 'step' : undefined}
                data-next={next || undefined} aria-description={next ? t('下一条指令', 'Next instruction') : undefined}
                data-waiting={waiting || undefined} data-resuming={resuming || undefined} data-graphic={graphic?.id}>
                <span aria-hidden="true">{number}</span>
                {graphic ? <button className="walkthrough-line-action" type="button" onClick={() => seekLine(number)} aria-label={graphic.label[locale]}><code>{line}</code></button>
                  : <code>{line || ' '}</code>}
              </li>
            })}
          </ol>
        </div>
        <div className="walkthrough-state">
          <h3>{t('调用堆栈与变量', 'Call stack and variables')}</h3>
          <ol data-testid="walkthrough-stack" className="walkthrough-stack" aria-label={t('调用堆栈', 'Call stack')}>
            {stack.toReversed().map((entry, stackIndex) => <StackCard key={entry.id} entry={entry}
              previous={previous?.stack.find(old => old.id === entry.id)} active={stackIndex === 0 && frame?.kind !== 'end'}
              finished={frame?.kind === 'end'} locale={locale} />)}
          </ol>
        </div>
      </div>
    </CodingDevice>
  </section>
}
