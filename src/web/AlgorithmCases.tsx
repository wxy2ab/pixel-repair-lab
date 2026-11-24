import type { AlgorithmLevel, AlgorithmResult } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { functionParameters, pythonLayout, pythonValue } from './pythonValue'
import { runIssueText, tr } from './text'
import './algorithm-cases.css'

type CaseOutcome = AlgorithmResult['cases'][number]

/**
 * Test cases for a challenge function. Every case is one chip that turns green or red after a run,
 * and the selected case shows each argument under its parameter name with the expected and actual return.
 */
export function AlgorithmCases({ level, locale, index, selectCase, outcomes, stepped }: {
  level: AlgorithmLevel; locale: Locale; index: number; selectCase: (index: number) => void
  outcomes?: CaseOutcome[]; stepped?: CaseOutcome
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const declared = functionParameters(level.starterCode, level.functionName)
  const sample = level.cases[index]
  const names = sample.args.map((_, position) => declared.length === sample.args.length ? declared[position] : t(`参数 ${position + 1}`, `arg ${position + 1}`))
  const outcomeAt = (position: number) => (position === index && stepped) || outcomes?.[position]
  const checked = outcomeAt(index)
  const passed = outcomes?.filter(outcome => outcome.passed).length ?? 0
  const state = (outcome?: CaseOutcome) => outcome ? outcome.passed ? 'passed' : 'failed' : undefined

  return <section className="panel teaching-panel algorithm-cases">
    <div className="algorithm-cases__head">
      <h2>{t('验证用例', 'Test cases')}</h2>
      <code className="algorithm-cases__signature">{level.functionName}({declared.join(', ')})</code>
      {outcomes && outcomes.length > 0 && <span className="algorithm-cases__tally" data-all={passed === level.cases.length || undefined}>
        {t(`已通过 ${passed} / ${level.cases.length}`, `${passed} / ${level.cases.length} passing`)}
      </span>}
    </div>
    <div className="algorithm-cases__tabs" role="group" aria-label={t('选择要查看的用例', 'Choose a case to inspect')}>
      {level.cases.map((_, position) => {
        const outcome = outcomeAt(position)
        return <button type="button" key={position} className="subtle-button" aria-pressed={position === index} data-outcome={state(outcome)}
          aria-description={outcome ? outcome.passed ? t('已通过', 'Passed') : t('未通过', 'Not passing') : undefined}
          onClick={() => selectCase(position)}>{t('用例', 'Case')} {position + 1}</button>
      })}
    </div>
    <dl className="algorithm-case" data-outcome={state(checked)}>
      <div>
        <dt>{t('输入', 'Input')}</dt>
        <dd className="algorithm-case__args">
          {sample.args.map((value, position) => <div key={position}>
            <span className="algorithm-case__name">{names[position]} =</span>
            <pre>{pythonLayout(value)}</pre>
          </div>)}
        </dd>
      </div>
      <div>
        <dt>{t('预期返回', 'Expected return')}</dt>
        <dd><pre>{pythonLayout(sample.expected)}</pre></dd>
      </div>
      {checked && <div className="algorithm-case__actual">
        <dt>{t('实际返回', 'Your return')}</dt>
        <dd>
          {checked.issue ? <p className="error-message">{runIssueText(locale, checked.issue)}</p>
            : <pre>{checked.actual === undefined ? t('没有返回值', 'Nothing returned') : pythonLayout(checked.actual)}</pre>}
          <span className="algorithm-case__verdict">{checked.passed ? t('✓ 与预期一致', '✓ Matches') : t('× 与预期不同', '× Differs')}</span>
        </dd>
      </div>}
    </dl>
    {level.cases.length > 1 && <details className="algorithm-cases__all">
      <summary>{t(`全部 ${level.cases.length} 组用例一览`, `All ${level.cases.length} cases at a glance`)}</summary>
      <div className="algorithm-cases__scroll">
        <table>
          <thead><tr><th scope="col">#</th><th scope="col">{t('输入', 'Input')}</th><th scope="col">{t('预期返回', 'Expected return')}</th>
            {outcomes && <th scope="col">{t('实际返回', 'Your return')}</th>}</tr></thead>
          <tbody>{level.cases.map((test, position) => {
            const outcome = outcomeAt(position)
            return <tr key={position} data-outcome={state(outcome)} data-selected={position === index || undefined}>
              <th scope="row">{position + 1}</th>
              <td><code>{test.args.map(pythonValue).join(', ')}</code></td>
              <td><code>{pythonValue(test.expected)}</code></td>
              {outcomes && <td>{outcome ? outcome.issue ? runIssueText(locale, outcome.issue)
                : <code>{outcome.passed ? '✓' : outcome.actual === undefined ? '—' : pythonValue(outcome.actual)}</code> : ''}</td>}
            </tr>
          })}</tbody>
        </table>
      </div>
    </details>}
  </section>
}
