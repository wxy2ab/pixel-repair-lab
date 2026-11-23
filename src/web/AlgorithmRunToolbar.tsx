import type { AlgorithmDebugRun } from '../engine/algorithms'
import type { AlgorithmLevel, PersonalAlgorithms } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { PlayToolbar, type useTrailPreference } from './PlayToolbar'
import { useLessonWorker } from './lessonTools'
import { pythonValue } from './pythonValue'
import { runIssueText, tr } from './text'
import { executionLine } from './executionLine'
import { courseFor } from './LearningCourse'
import { flowActivity } from './station3d/types'
import { ActionRobot } from './ActionRobot'
import { StationActionCue } from './StationActionCue'

export type AlgorithmDebugCursor = { run: AlgorithmDebugRun; position: number }

export function AlgorithmRunToolbar({ level, index, code, personal, course, locale, pending, onRun, onStop, cursor, onCursor, trail }: {
  level: AlgorithmLevel; index: number; code: string; personal: PersonalAlgorithms; course: PersonalAlgorithms;
  locale: Locale; pending: boolean; onRun: () => void; onStop: () => void; trail?: ReturnType<typeof useTrailPreference>
  cursor?: AlgorithmDebugCursor; onCursor: (cursor: AlgorithmDebugCursor) => void
}) {
  const debug = cursor?.run
  const position = cursor?.position ?? 0
  const worker = useLessonWorker<AlgorithmDebugRun>()
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const current = debug?.steps[position]
  const activity = current?.flow && flowActivity(current.flow)
  const last = !!debug && position >= debug.steps.length - 1
  function step() {
    if (debug) {
      onCursor({ run: debug, position: position + 1 })
      return
    }
    worker.run(() => new Worker(new URL('../engine/advanced.worker.ts', import.meta.url), { type: 'module' }),
      { type: 'debug-algorithm', level, index, source: code, personal, course, observeRack: courseFor(level)?.id === 'algorithms' },
      run => onCursor({ run, position: 0 }),
      issue => onCursor({ run: { steps: [], outcome: { passed: false, issue } }, position: 0 }))
  }
  const outcome = debug?.outcome
  const returned = last && outcome?.actual !== undefined ? pythonValue(outcome.actual) : undefined
  const readout = debug && <div data-testid="algorithm-step-status">
    {activity && <div className="algorithm-step-gesture"><ActionRobot activity={activity} locale={locale} /><StationActionCue activity={activity} locale={locale} /></div>}
    {t(`用例 ${index + 1}`, `Case ${index + 1}`)}
    {current && <> · {current.sourceName !== 'main.py' && current.sourceName + ' · '}
      {t(`第 ${current.line} 行`, `Line ${current.line}`)} <code>{executionLine(current.line, current.sourceName, code, personal, course)}</code>
      {' · '}{t(`第 ${position + 1}/${debug.steps.length} 步`, `Step ${position + 1}/${debug.steps.length}`)}</>}
    {last && outcome && <> · {outcome.issue ? <span className="error-message">{runIssueText(locale, { ...outcome.issue, line: undefined })}</span>
      : <>{outcome.passed ? t('这个用例通过了', 'This case passed') : t('返回值和预期不同', 'The return value differs from the expected result')}
        {returned !== undefined && <> · <code>{returned.length > 160 ? returned.slice(0, 159) + '…' : returned}</code></>}</>}</>}
    {debug.flowTruncated && last && <small>{t('后面的控制步骤只标出代码行。', 'Later control steps show their source lines only.')}</small>}
  </div>
  return <PlayToolbar locale={locale} trail={trail} status={readout}>
    {pending || worker.pending
      ? <button type="button" className="subtle-button" onClick={() => { worker.stop(); onStop() }}>{t('停止', 'Stop')}</button>
      : <button type="button" className="primary-button" disabled={!code.trim()} onClick={onRun}>{t('运行', 'Run')}</button>}
    <button type="button" className="subtle-button" disabled={pending || worker.pending || !code.trim() || last}
      onClick={step}>{t('单步执行', 'Step once')}</button>
    {debug && <button type="button" className="subtle-button" disabled={position === 0}
      onClick={() => onCursor({ run: debug, position: position - 1 })}>{t('回看上一步', 'Review previous step')}</button>}
  </PlayToolbar>
}
