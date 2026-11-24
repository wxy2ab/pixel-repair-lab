import type { GridSnapshot, Locale, RunFrame, Scenario } from '../shared/types'
import { gridGoals } from './gridGoalList'
import { tr } from './text'
import './grid-goals.css'

/**
 * The map's objectives as a checklist that follows the replay, so a learner can see what is
 * still open at any step. Challenges with several goals read the same way as a first exercise.
 */
export function GridGoals({ scenario, snapshot, frames, locale }: {
  scenario: Scenario; snapshot: GridSnapshot; frames: readonly RunFrame[]; locale: Locale
}) {
  const goals = gridGoals(scenario, snapshot, frames, locale)
  if (!goals.length) return null
  const finished = goals.filter(goal => goal.done).length
  return <div className="grid-goals" data-testid="grid-goals" data-complete={finished === goals.length || undefined}>
    <div className="grid-goals__progress">
      <span className="grid-goals__title">{tr(locale, '本图目标', 'Goals')}
        <b aria-live="polite" aria-atomic="true"><span className="sr-only">{tr(locale, '已达成', 'Completed')} </span>{finished}/{goals.length}</b>
      </span>
      <span className="grid-goals__track" aria-hidden="true"><i style={{ width: (finished / goals.length * 100) + '%' }} /></span>
    </div>
    <ul aria-label={tr(locale, '本图目标清单', 'Goals for this map')}>
      {goals.map(goal => <li key={goal.key} data-done={goal.done || undefined}>
        <i aria-hidden="true">{goal.done ? '✓' : ''}</i>
        <span>{goal.label}</span>
        {goal.progress && <em>{goal.progress}</em>}
        <span className="sr-only">{goal.done ? tr(locale, '（已达成）', ' (done)') : tr(locale, '（未达成）', ' (open)')}</span>
      </li>)}
    </ul>
  </div>
}
