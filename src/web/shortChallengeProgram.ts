import type { GridLevel } from '../shared/types'
import { shortCrossing } from '../shared/shortChallenges'
import { parseChallengeDraft, type GridChallengeDraft } from './challengeDraft'

// Keep the existing ferry key so returning players can still bring their winning programs.
const keyFor = (level: GridLevel, id: string) => 'pixel-repair-lab:' + (level.laserTrial ? 'laser' : 'ferry') + '-winning-program:' + id
const unsaved = new Map<string, string>()

export function saveCrossingProgram(level: GridLevel, draft: GridChallengeDraft) {
  const program = JSON.stringify(draft)
  const key = keyFor(level, level.id)
  try {
    localStorage.setItem(key, program)
    unsaved.delete(key)
  } catch {
    unsaved.set(key, program)
  }
}

export function carriedCrossingProgram(level: GridLevel) {
  const from = shortCrossing(level)?.carryFrom
  if (!from) return
  const key = keyFor(level, from)
  let raw = unsaved.get(key)
  if (raw === undefined) {
    try { raw = localStorage.getItem(key) ?? undefined } catch { return }
  }
  const draft = parseChallengeDraft(level, raw)
  return draft?.kind === 'grid' ? draft : undefined
}
