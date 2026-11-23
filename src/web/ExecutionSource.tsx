import { Fragment } from 'react'
import type { PersonalAlgorithms } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { executionSourceText } from './executionLine'
import { tr } from './text'
import './execution-source.css'

export type ExecutionLocation = { line: number; sourceName?: string }

type SourceProps = {
  locale: Locale; code: string; current?: ExecutionLocation; next?: ExecutionLocation
  personal?: PersonalAlgorithms; course?: PersonalAlgorithms
}

export function ExecutionSource({ locale, code, current, next, personal = {}, course = {} }: SourceProps) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const files = new Map<string, { current?: number; next?: number }>()
  for (const [kind, location] of [['current', current], ['next', next]] as const) {
    if (!location || !Number.isSafeInteger(location.line) || location.line < 1) continue
    const name = location.sourceName ?? 'main.py'
    files.set(name, { ...files.get(name), [kind]: location.line })
  }
  if (!files.size) return null

  return <section className="execution-source" data-testid="execution-source" aria-label={t('执行中的代码', 'Code execution')}>
    {[...files].map(([name, marks]) => {
      const lines = executionSourceText(name, code, personal, course)?.split(/\r?\n/)
      // Keep both steps in view even when control jumps far down a file or into a helper.
      const visible = new Set<number>()
      for (const line of Object.values(marks)) {
        visible.add(line)
        if (lines && line > 1 && line - 1 <= lines.length) visible.add(line - 1)
        if (lines && line < lines.length) visible.add(line + 1)
      }
      const numbers = [...visible].sort((a, b) => a - b)
      return <div className="execution-source__file" key={name} data-source-name={name}>
        <div className="execution-source__filename">{name}</div>
        {numbers.map((line, index) => {
          const active = marks.current === line
          const upcoming = marks.next === line
          return <Fragment key={line}>
            {index > 0 && numbers[index - 1] < line - 1 && <div className="execution-source__gap" aria-hidden="true">…</div>}
            <div className="execution-source__line" data-line={line} data-current={active || undefined} data-next={upcoming || undefined}
              aria-current={active ? 'step' : undefined}>
              <span className="execution-source__number">{line}</span>
              <code>{lines?.[line - 1] ?? t('本行源码不可用', 'Source line unavailable')}</code>
              {(active || upcoming) && <span className="execution-source__labels">
                {active && <span>{t('当前', 'Current')}</span>}
                {upcoming && <span>{t('下一条', 'Next')}</span>}
              </span>}
            </div>
          </Fragment>
        })}
      </div>
    })}
  </section>
}
