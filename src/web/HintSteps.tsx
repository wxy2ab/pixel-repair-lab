import { useState } from 'react'
import type { Locale, Localized } from '../shared/types'
import { tr } from './text'
import './hint-steps.css'

/**
 * Hints arrive one at a time. The first is enough for many learners,
 * and asking for the next one keeps the rest of the thinking with them.
 */
export function HintSteps({ hints, locale }: { hints: readonly Localized[]; locale: Locale }) {
  const [shown, setShown] = useState(1)
  const remaining = hints.length - shown
  return <div className="hint-steps">
    <ol>
      {hints.slice(0, shown).map((hint, index) => <li key={index}>{hint[locale]}</li>)}
    </ol>
    {remaining > 0 && <button type="button" className="hint-steps__more" onClick={() => setShown(shown + 1)}>
      {tr(locale, `再给一条提示（还有 ${remaining} 条）`, `Show another hint (${remaining} more)`)}
    </button>}
  </div>
}
