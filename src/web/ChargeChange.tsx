import type { CSSProperties } from 'react'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './charge-change.css'

/** Shows the observed change in charge only after a program returns its result. */
export function ChargeChange({ input, output, locale }: { input: number; output: string; locale: Locale }) {
  const end = Number(output)
  const count = Math.max(input, end)
  const drawCells = Number.isInteger(input) && input >= 0 && Number.isInteger(end) && end >= 0
    && String(end) === output && count > 0 && count <= 16
  const difference = end - input
  return <span className="charge-change" role="img" aria-label={tr(locale, `电量从 ${input} 变为 ${output}`, `Charge changes from ${input} to ${output}`)}>
    {drawCells && <span className="charge-change__meter" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <i key={i} data-state={i < Math.min(input, end) ? 'kept' : end > input ? 'added' : 'removed'}
        style={{ '--cell-order': Math.max(0, i - Math.min(input, end)) } as CSSProperties} />)}
    </span>}
    <span className="charge-change__reading" aria-hidden="true"><b>{input}</b>
      {drawCells && difference !== 0 && <small>{difference > 0 ? '+' + difference : '−' + Math.abs(difference)}</small>}
      <span>→</span><b>{output}</b>
    </span>
  </span>
}
