import type { GridLevel, Locale, RunResult } from '../shared/types'
import { runIssueText, tr } from './text'
import './ferry-crossing.css'

export function FerryPulseClock({ level, locale, turn }: { level: GridLevel; locale: Locale; turn: number }) {
  const cannon = level.devices?.find(device => device.kind === 'cannon')
  if (!cannon || !level.turnLimit) return null
  const label = tr(locale, '桥上脉冲', 'Bridge pulses')
  const turns = Array.from({ length: Math.min(level.turnLimit, cannon.period * 2) }, (_, i) => i + 1)
  return <div className="ferry-clock">
    <strong>{label}</strong>
    <ol aria-label={label}>{turns.map(beat => {
      const pulse = beat % cannon.period === (cannon.phase ?? 0)
      const description = tr(locale, `第 ${beat} 回合，${pulse ? '有脉冲' : '无脉冲'}`,
        `Turn ${beat}, ${pulse ? 'pulse' : 'clear'}`)
      return <li key={beat} data-pulse={pulse || undefined} aria-current={beat === turn ? 'step' : undefined} title={description}>
        <span aria-hidden="true">{pulse && 'ϟ '}{beat}</span><span className="sr-only">{description}</span>
      </li>
    })}</ol>
  </div>
}

export function ferryCrossingResult(locale: Locale, result: RunResult) {
  const turn = result.final.turn
  if (result.won) return tr(locale, `第 ${turn} 回合登船，赶上了！`, `On board on turn ${turn}. You caught the ferry!`)
  const issue = result.issue
  if (!issue) return undefined
  const line = issue.line ? tr(locale, `程序停在第 ${issue.line} 行。`, `The program stopped on line ${issue.line}.`) : ''
  switch (issue.code) {
    case 'cannonHit':
      return tr(locale, `第 ${turn} 回合，芽芽停在了脉冲照到的桥格上。`, `On turn ${turn}, Sprout was on the bridge when the pulse struck. `) + line
    case 'blocked':
      return tr(locale, '芽芽前面没有通路。', 'The way ahead was blocked. ') + line
    case 'fixtureBlocked':
      return tr(locale, '这格被脉冲发射器占住了。', 'The pulse emitter occupied that square. ') + line
    case 'turnLimit':
      return tr(locale, `第 ${turn} 回合结束，渡船已经离岸。`, `Turn ${turn} ended and the ferry left. `) + line
    case 'unfinished':
      return tr(locale, `程序在第 ${turn} 回合结束，芽芽还没到登船点。`, `The program ended on turn ${turn}. Sprout hadn't reached the landing.`)
    default:
      return runIssueText(locale, issue)
  }
}
