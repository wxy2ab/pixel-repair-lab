import { CodingDevice } from './CodingDevice'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { runModuleLesson, type ModuleLessonStep } from '../engine/programModuleLesson'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { StepCount } from './LessonFrame'
import { StepExplanation } from './LessonNotes'
import './for-lesson.css'
import './module-lesson.css'
import { TeachingModel } from './station3d/TeachingModel'

const loadFileLink = () => import('./station3d/python-runtime-instruments').then(module => module.buildFileLink)

type Lesson = NonNullable<ProgramWalkthrough['moduleLesson']>
type Translate = (zh: string, en: string) => string

function describe(step: ModuleLessonStep | undefined, lesson: Lesson, t: Translate) {
  if (!step) return t('维修台旁有两个文件。主程序安排补电，另一个文件保存补电函数。',
    'There are two files at the repair station. The main program runs the task. The other file holds the charging function.')

  const { moduleName, functionName, parameter, resultVariable, increment } = lesson
  const moduleFile = `${moduleName}.py`
  switch (step.kind) {
    case 'define':
      return t(`主程序开始导入，先找到 ${moduleFile} 里的 ${functionName} 定义。函数体会在调用时运行。`,
        `The import begins by loading the definition of ${functionName} in ${moduleFile}. The function body runs when called.`)
    case 'import':
      return t(`导入完成。main.py 现在能用 ${functionName} 这个名字调用模块里的函数。`,
        `The import gives main.py the name ${functionName}, ready to call the function in the module.`)
    case 'input':
      return t(`主程序读到电池的起始电量是 ${step.value} 格。`, `The main program reads the starting charge of ${step.value}.`)
    case 'call':
      return t(`主程序调用 ${functionName}，把 ${step.value} 格传给参数 ${parameter}。`,
        `The main program calls ${functionName} and passes ${step.value} to its parameter ${parameter}.`)
    case 'calculate':
      return t(`函数给收到的电量加 ${increment} 格，算出 ${step.value} 格。`,
        `The function adds ${increment} to the charge it received and calculates ${step.value}.`)
    case 'return':
      return t(`return 把 ${step.value} 格交回 main.py，主程序继续处理刚才的调用。`,
        `return sends ${step.value} back to main.py, where the original call continues.`)
    case 'store':
      return t(`主程序把返回的 ${step.value} 格存进 ${resultVariable}。`,
        `The main program stores the returned value ${step.value} in ${resultVariable}.`)
    case 'output':
      return t(`主程序显示 ${step.value} 格。换一块电池，先猜补电后的电量，再运行验证。`,
        `The main program displays ${step.value}. Try another battery, predict its charge, and run the program to check.`)
  }
}

function FileCard({ file, name, label, revealed, step, children }: {
  file: ModuleLessonStep['file']; name: string; label: string;
  revealed: ModuleLessonStep[]; step?: ModuleLessonStep; children: ReactNode;
}) {
  const current = step?.file === file
  const lines = new Map(revealed.filter(frame => frame.file === file).map(({ line, code }) => [line, code]))

  return <article className="module-file" data-file={file} data-active={current || undefined}>
    <header className="module-file-header">
      <span className="module-file-icon" aria-hidden="true" />
      <div>
        <h3>{name}</h3>
        <p>{label}</p>
      </div>
    </header>
    <div className="module-file-content">
      {children}
      {lines.size > 0 && <ol className="for-source module-file-source" aria-label={name}>
        {Array.from(lines, ([line, code]) => <li key={line} data-line={line}
          aria-current={current && line === step?.line ? 'step' : undefined}>
          <span aria-hidden="true">{line}</span><code>{code}</code>
        </li>)}
      </ol>}
    </div>
  </article>
}

function FileValue({ label, value, testId }: { label: ReactNode; value: ReactNode; testId?: string }) {
  return <div className="module-file-value">
    <dt>{label}</dt>
    <dd data-testid={testId}>{value}</dd>
  </div>
}

function Transfer({ step, functionName, t }: { step?: ModuleLessonStep; functionName: string; t: Translate }) {
  if (step?.kind !== 'import' && step?.kind !== 'call' && step?.kind !== 'return') return null

  const labels = {
    import: t('引入函数名', 'Import name'),
    call: t('传入电量', 'Pass charge'),
    return: t('送回结果', 'Return value'),
  }
  return <div className="module-transfer" data-testid="module-transfer" data-direction={step.kind}>
    <span>{labels[step.kind]}</span>
    <div className="module-transfer-line"><code>{step.kind === 'import' ? functionName : step.value}</code></div>
  </div>
}

export function ModuleLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const lesson = execution.moduleLesson
  const example = execution.cases[0]
  const run = useMemo(() => example && runModuleLesson(execution, example.input), [execution, example])
  const [position, setPosition] = useState(0)
  const notified = useRef(false)
  if (!lesson || !example) return null

  const step = run?.steps[position - 1]
  const stage = step?.kind ?? 'start'
  const revealed = run?.steps.slice(0, position) ?? []
  const imported = revealed.some(frame => frame.kind === 'import')
  const input = revealed.find(frame => frame.kind === 'input')?.value
  const argument = revealed.find(frame => frame.kind === 'call')?.value
  const stored = revealed.find(frame => frame.kind === 'store')?.value
  const title = t('用两个文件完成补电', 'Charge a battery with two files')

  function goTo(next: number) {
    setPosition(next)
    if (run?.steps[next - 1]?.kind === 'output' && !notified.current) {
      notified.current = true
      onReady()
    }
  }

  return <section className="classroom-demonstration panel module-lesson" aria-label={title} data-testid="module-lesson" data-module-stage={stage}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      <div className="module-navigation">
        <button type="button" className="subtle-button" disabled={position === 0} onClick={() => goTo(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        <button type="button" className="primary-button" disabled={!run || position >= run.steps.length} onClick={() => goTo(position + 1)}>
          {t('下一步', 'Next step')}
        </button>
        <StepCount position={position} total={run?.steps.length ?? 0} locale={locale} />
      </div>
    </>}>
      <div className="panel-heading module-lesson-heading">
        <h2>{title}</h2>
      </div>
      <div className="module-lesson-body">
        <TeachingModel sceneKey="python-module-link" locale={locale} label={t('主程序与模块之间的连接', 'Connection between the main program and the module')}
          load={loadFileLink} state={{ file: lesson.moduleName + '.py', name: lesson.functionName, parameter: lesson.parameter,
            resultName: lesson.resultVariable, steps: revealed, locale }} />
        <div className="module-files">
          <FileCard file="main" name="main.py" label={t('主程序', 'Main program')} revealed={revealed} step={step}>
            {imported ? <dl className="module-file-values">
              <FileValue label={t('已导入的函数名', 'Imported function name')} value={lesson.functionName} testId="module-imported-name" />
              {input !== undefined && <FileValue label={t('起始电量', 'Starting charge')} value={input} testId="module-input" />}
              {stored !== undefined && <FileValue label={<code>{lesson.resultVariable}</code>} value={stored} testId="module-result" />}
              {stage === 'output' && <FileValue label={t('屏幕输出', 'Program output')} value={<output>{run?.output}</output>}
                testId="module-output" />}
            </dl> : <p className="module-file-waiting">{t('等待导入', 'Waiting to import')}</p>}
          </FileCard>
          <Transfer step={step} functionName={lesson.functionName} t={t} />
          <FileCard file="module" name={`${lesson.moduleName}.py`} label={t('补电模块', 'Charging module')} revealed={revealed} step={step}>
            <dl className="module-file-values">
              <FileValue label={t('补电函数', 'Charging function')} value={lesson.functionName} />
              {(stage === 'call' || stage === 'calculate') && <FileValue label={<code>{lesson.parameter}</code>} value={argument}
                testId="module-argument" />}
              {stage === 'calculate' && <FileValue label={t('补电计算', 'Charge calculation')}
                value={`${argument} + ${lesson.increment} → ${step?.value}`} />}
              {stage === 'return' && <FileValue label={t('返回值', 'Returned value')} value={step?.value} testId="module-return-value" />}
            </dl>
          </FileCard>
        </div>
        {run ? <StepExplanation locale={locale} className="module-description">{describe(step, lesson, t)}</StepExplanation>
          : <p className="error-message" role="alert">{t('这次没有得到可以展示的补电过程。', 'The program did not produce a charging trace to show.')}</p>}
      </div>
    </CodingDevice>
  </section>
}
