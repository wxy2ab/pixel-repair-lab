import { useState } from 'react'
import type { Level, Locale } from '../shared/types'
import { briefParts, briefSentences, declaredNames } from './briefText'
import { challengeDifficultyLabels, challengeType, challengeTypeLabels } from './challengeModel'
import { tr } from './text'
import './mission-brief.css'

const pinKey = 'pixel-repair-lab:pin-brief'

function readPinned() {
  try { return localStorage.getItem(pinKey) === 'on' } catch { return false }
}

function facts(level: Level, locale: Locale) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  const list: string[] = []
  if (level.kind === 'grid' && level.warehouse) {
    const count = level.warehouse.boxes.length
    list.push(t(`${count} 只货箱`, plural(count, 'crate', 'crates')))
  }
  const turns = level.kind === 'arena' ? level.maxTurns : level.kind === 'grid' ? level.turnLimit : undefined
  const rivals = level.kind === 'arena' ? level.opponents.length : level.kind === 'grid' ? level.enemies?.length ?? 0 : 0
  if (turns !== undefined) list.push(t(`回合上限 ${turns}`, `${turns}-turn budget`))
  if (rivals) list.push(t(`对手 ${rivals} 台`, plural(rivals, 'rival', 'rivals')))
  if (level.kind === 'arena' || level.kind === 'grid') {
    const maps = (level.variants?.length ?? 0) + 1
    if (maps > 1) list.push(level.kind === 'arena'
      ? t(`从容模式用同一程序过 ${maps} 张地图`, `One program for ${maps} maps in relaxed mode`)
      : t(`同一程序过 ${maps} 张地图`, `One program, ${maps} maps`))
  } else if ('cases' in level && level.cases.length > 1) {
    list.push(level.kind === 'machine'
      ? t(`同一程序过 ${level.cases.length} 组数据`, `One program, ${level.cases.length} data sets`)
      : t(`${level.cases.length} 组用例全部通过`, `Pass all ${level.cases.length} cases`))
  }
  if (level.kind === 'data' && level.steps.length > 1) list.push(t(`${level.steps.length} 个步骤`, plural(level.steps.length, 'step', 'steps')))
  return list
}

function Sentence({ text, names }: { text: string; names: readonly string[] }) {
  return <>{briefParts(text, names).map((part, index) => part.code ? <code key={index}>{part.text}</code> : part.text)}</>
}

/** A brief as a lead sentence and one rule per line. Short briefs stay a single paragraph. */
export function BriefBody({ text, names = [], className = 'mission-brief__goal' }: { text: string; names?: readonly string[]; className?: string }) {
  const [goal, ...rules] = briefSentences(text)
  if (rules.length < 2) return <p className={className}><Sentence text={text} names={names} /></p>
  return <>
    <p className={className}><Sentence text={goal} names={names} /></p>
    <ul className="mission-brief__rules">
      {rules.map((rule, index) => <li key={index}><Sentence text={rule} names={names} /></li>)}
    </ul>
  </>
}

/**
 * The mission brief for a challenge. Long briefs pack a goal and several rules into one paragraph,
 * so the goal leads and each rule gets its own line. The brief can stay in view while coding.
 */
export function ChallengeBrief({ level, locale }: { level: Level; locale: Locale }) {
  const laser = level.kind === 'grid' && Boolean(level.laserTrial)
  const [pinned, setPinned] = useState(readPinned)
  const [open, setOpen] = useState(() => pinned || !laser || !window.matchMedia('(max-width: 700px)').matches)
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const difficulty = level.difficulty ?? 'intermediate'
  // In Chinese text a Latin name can only be an identifier. English prose shares too many of these words.
  const names = locale === 'zh' && 'starterCode' in level && typeof level.starterCode === 'string' ? declaredNames(level.starterCode) : []
  const [laserGoal, ...laserRules] = laser ? briefSentences(level.brief[locale]) : []

  function togglePin() {
    const next = !pinned
    setPinned(next)
    if (next) setOpen(true)
    try { localStorage.setItem(pinKey, next ? 'on' : 'off') } catch { /* The choice still applies to this visit. */ }
  }

  return <section className="mission-brief" data-laser={laser || undefined} data-pinned={pinned || undefined} data-open={open || undefined}
    data-testid="mission-brief" aria-label={t('任务简报', 'Mission brief')}>
    <div className="mission-brief__bar">
      {laser ? <p className="mission-brief__goal">{laserGoal}</p> : <>
        <span className="mission-brief__title" aria-hidden="true">{t('任务简报', 'Mission brief')}</span>
        <ul className="mission-brief__facts" aria-label={t('规则速览', 'Rules at a glance')}>
          <li data-difficulty={difficulty}>{challengeDifficultyLabels[difficulty][locale]}</li>
          <li>{challengeTypeLabels[challengeType(level)][locale]}</li>
          {facts(level, locale).map(fact => <li key={fact}>{fact}</li>)}
        </ul>
      </>}
      <div className="mission-brief__tools">
        <button type="button" className="text-button" aria-pressed={pinned} onClick={togglePin}
          title={t('滚动页面时，简报留在顶部', 'Keep the brief at the top while you scroll')}>
          <span aria-hidden="true">{pinned ? '◆' : '◇'}</span> {pinned ? t('取消固定', 'Unpin') : t('固定简报', 'Pin brief')}
        </button>
        <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {laser ? (open ? t('收起规则', 'Hide rules') : t('查看规则', 'Show rules'))
            : (open ? t('收起', 'Collapse') : t('展开', 'Expand'))}
        </button>
      </div>
    </div>
    {open && <div className="mission-brief__body">{laser ? <ul className="mission-brief__rules">
      {laserRules.map((rule, i) => <li key={i}>{rule}</li>)}
    </ul> : <BriefBody text={level.brief[locale]} names={names} />}</div>}
  </section>
}
