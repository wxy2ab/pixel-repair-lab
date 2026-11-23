import type { AlgorithmLevel, AlgorithmResult } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { runIssueText, tr } from './text'
import { pythonValue } from './pythonValue'
import { readRouteMap } from '../shared/routeMap'
import { RouteCaseBoard } from './RouteCaseBoard'
import { courseFor } from './LearningCourse'
import { TeachingModel } from './station3d/TeachingModel'
import type { AlgorithmDebugStep } from '../engine/algorithms'
import { AlgorithmValueRack } from './AlgorithmValueRack'

const loadFunctionBench = () => import('./station3d/python-function-bench').then(module => module.buildFunctionBench)

export function FunctionInspector({ level, result, locale, index, selectCase, showTrail, checkedOverride, stepping, current, previous, pending }: {
  level: AlgorithmLevel; result?: AlgorithmResult; locale: Locale; index: number; selectCase: (index: number) => void; showTrail: boolean
  checkedOverride?: AlgorithmResult['cases'][number]
  stepping: boolean; current?: AlgorithmDebugStep; previous?: AlgorithmDebugStep; pending: boolean
}) {
  const sample = level.cases[index]
  const courseId = courseFor(level)?.id
  const checked = checkedOverride ?? (stepping && (courseId === 'python' || courseId === 'algorithms') ? undefined : result?.cases[index])
  const map = level.pathGrading && readRouteMap(sample.args)
  const invocation = current?.invocation
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <section className="function-inspector">
    <h2>{t('验证用例', 'Test cases')}</h2>
    <div className="function-samples" role="group" aria-label={t('选择要观察的输入', 'Choose an input to inspect')}>
      {level.cases.map((_, i) => <button type="button" key={i} className="subtle-button" aria-pressed={index === i}
        onClick={() => selectCase(i)}>{t('用例', 'Case')} {i + 1}</button>)}
    </div>
    {courseId === 'python' && <TeachingModel sceneKey="python-function-practice"
      label={t('函数调用工作台', 'Function call bench')} locale={locale} load={loadFunctionBench}
      state={{ locale, name: invocation?.name ?? level.functionName, args: invocation ? invocation.arguments?.map(arg => arg.value) ?? [] : sample.args,
        argumentsOmitted: Boolean(invocation && !invocation.arguments), caseIndex: index, caseCount: level.cases.length, actual: checked?.actual,
        stopped: Boolean(checked?.issue), line: current?.line, sourceName: current?.sourceName, flow: current?.flow, pending }}
      onPick={level.cases.length > 1 ? id => selectCase(Number(id)) : undefined} />}
    {map && <RouteCaseBoard key={index + '-' + Boolean(checked)} map={map} checked={checked} locale={locale} showTrail={showTrail} />}
    {courseId === 'algorithms' && <AlgorithmValueRack key={index} step={current} previous={previous} actual={checked?.actual} locale={locale}
      costs={level.topic?.id === 'weighted-path'} hasRouteMap={Boolean(map)}
      inputs={sample.args.map((value, i) => ({ name: t('输入 ', 'Input ') + (i + 1), value }))} />}
    <dl className="function-readout">
      <div><dt>{t('调用时送入', 'Call with this input')}</dt>
        <dd><code>{level.functionName}({sample.args.map(pythonValue).join(', ')})</code></dd></div>
      <div><dt>{t('函数实际交回', 'Returned by your function')}</dt>
        <dd data-testid="function-return" aria-live="polite">{checked?.issue ? runIssueText(locale, checked.issue)
          : checked?.actual !== undefined ? <code>{pythonValue(checked.actual)}</code>
          : t('等待运行', 'Waiting to run')}</dd></div>
      {!map && <div><dt>{t('这组输入的预期结果', 'Expected for this input')}</dt><dd><code>{pythonValue(sample.expected)}</code></dd></div>}
    </dl>
    <p>{t('点运行会检查全部用例。点用例可以查看它收到和交回的值。', 'Run checks every case. Select one to see what went in and what came back.')}</p>
  </section>
}
