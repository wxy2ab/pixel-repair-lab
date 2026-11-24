import type { AiLevel, Candidate, Locale } from '../shared/types'
import type { ReactNode } from 'react'
import { gradeCandidate } from './core'
import './packing-bench.css'

// Unfamiliar supplies from imported lessons use a parcel alongside their configured name.
const symbols: Record<string, string> = {
  water: '💧', battery: '🔋', magnet: '🧲', scissors: '✂️', glove: '🧤', wrench: '🔧',
  label: '🏷️', waterproof: '🏷️', tag: '🏷️', marker: '🖊️', screw: '🔩', brush: '🖌️', clip: '📎',
  lamp: '💡', lantern: '🏮', compass: '🧭', wheel: '🛞', cloth: '▧', wipe: '▧',
  manual: '📖', lock: '🔒', cable: '🔌', adaptor: '🔌', glue: '🧴', cleaner: '🧴', towel: '▧',
}

const hardware: Record<string, ReactNode> = {
  tie: <><path d="M17 15C9 24 2 16 5 10s9-7 12 1" /><path d="m16 15 6-11" /><rect x="14" y="12" width="5" height="4" rx="1" fill="#e4b36c" /></>,
  tape: <><ellipse cx="10" cy="12" rx="7" ry="8" fill="#d7ad62" /><ellipse cx="10" cy="12" rx="3" ry="4" fill="#243a42" /><path d="m14 18 7-2 1-3" /></>,
  washer: <><circle cx="12" cy="12" r="8" fill="#a4bec2" /><circle cx="12" cy="12" r="4" fill="#243a42" /></>,
  fuse: <><path d="M2 12h3m14 0h3" /><rect x="5" y="7" width="14" height="10" rx="2" /><path d="M8 8v8m8-8v8M8 12l3-2 2 4 3-2" /></>,
  wire: <><path d="M2 15c3 0 2-8 7-8s1 10 8 10" stroke="#9ce0dc" /><path d="m17 17 5-2M2 15v4" stroke="#f2bb88" /></>,
  coil: <><path d="M1 17h3c0-14 7-14 7-6s-7 8-5 2 11-13 11-2-9 10-6 2 11-12 10-4v8h2" stroke="#ffba85" /></>,
  board: <><rect x="3" y="5" width="18" height="14" rx="2" fill="#4c9c81" /><path d="M5 9h6v4h7M8 17v-3m7-7v3h4" /><circle cx="6" cy="8" r="1" /></>,
  filter: <><rect x="3" y="4" width="18" height="16" rx="2" fill="#4e6e75" /><path d="M8 5v14m5-14v14m5-14v14M4 9h16M4 15h16" /></>,
  pad: <><path d="m2 14 12-7 8 5-12 8z" fill="#a7c89d" /><path d="m2 17 8 5 12-8" /></>,
  wrap: <><path d="m3 12 11-7 8 4v9l-13 4-6-4Z" fill="#cfa971" /><path d="m4 12 5 3 13-6M9 16v5" /></>,
  sensor: <><path d="m3 20 9-10" /><path d="m10 13 6-9 4 3-7 9Z" fill="#84c4bd" /><path d="m18 5 3-3" /></>,
  cap: <><path d="M5 16V9c0-6 14-6 14 0v7" fill="#81abb5" /><ellipse cx="12" cy="16" rx="8" ry="3" /></>,
  bead: <><circle cx="12" cy="12" r="8" fill="#db9cb2" /><ellipse cx="13" cy="9" rx="2" ry="1.5" fill="#243a42" /></>,
}

function Tray({ item, amount, waiting, numericClass }: { item: string; amount: number; waiting?: boolean; numericClass?: string }) {
  const drawing = Object.hasOwn(hardware, item) ? hardware[item] : undefined
  const symbol = Object.hasOwn(symbols, item) ? symbols[item] : '📦'
  return <div className="supply-tray" data-multiple={amount > 4 || undefined} data-pending={waiting || undefined}>
    <span className="supply-tray__parts" aria-hidden="true">{!waiting && Array.from({ length: amount > 4 ? 1 : amount }, (_, i) =>
      <i key={i} data-symbol={drawing ? undefined : symbol}>{drawing && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{drawing}</svg>}</i>)}</span>
    <strong className={numericClass}>{waiting ? '…' : amount}</strong>
  </div>
}

type Audit = { selected: string[]; toggle: (id: string) => void }

export function PackingBench({ level, locale, candidate, previous, graded = false, audit }: {
  level: AiLevel; locale: Locale; candidate?: Candidate; previous?: Candidate; graded?: boolean; audit?: Audit
}) {
  const t = (zh: string, en: string) => locale === 'zh' ? zh : en
  const before = new Map(previous?.items.map(item => [item.id, item.quantity]))
  return <table className="ai-table packing-bench" aria-label={t('装箱核对台', 'Packing bench')}>
    <thead><tr><th scope="col">{t('物品', 'Item')}</th><th scope="col">{t('工单', 'Order')}</th>
      <th scope="col">{t('AI 装箱', 'AI packed')}</th>
      {(graded || audit) && <th scope="col">{audit ? t('标记', 'Flag') : t('核对', 'Check')}</th>}
    </tr></thead>
    <tbody>{gradeCandidate(level, candidate ?? { items: [] }).map(({ id, expected, actual }, index) => {
      const label = level.inventory[index].label[locale]
      const match = expected === actual
      const oldCount = before.get(id) ?? 0
      const changed = graded && previous && oldCount !== actual
      return <tr key={id} data-supply={id} data-check={graded ? match ? 'match' : 'revise' : undefined}>
        <th scope="row">{label}</th>
        <td><Tray item={id} amount={expected} /></td>
        <td><Tray key={candidate ? actual : 'pending'} item={id} amount={actual} waiting={!candidate}
          numericClass={graded ? match ? 'win-message' : 'error-message' : undefined} /></td>
        {audit && <td><label className="packing-bench__flag">
          <input type="checkbox" data-ai-audit={id} aria-label={t('标记差异 · ', 'Flag differences · ') + label}
            checked={audit.selected.includes(id)} onChange={() => audit.toggle(id)} />
        </label></td>}
        {graded && <td className={match ? 'ai-match' : 'ai-mismatch'}>
          {changed && <small className="packing-delta" aria-label={t('上轮与本轮', 'Last round to this round')}>{oldCount} → {actual}</small>}
          <span>{match ? '✓' : '↻'} <span className="sr-only">{match ? t('正确', 'Matches') : t('待修改', 'Needs a change')}</span>
            {match ? null : actual < expected ? t(`少 ${expected - actual}`, `${expected - actual} short`) : t(`多 ${actual - expected}`, `${actual - expected} extra`)}</span>
        </td>}
      </tr>
    })}</tbody>
  </table>
}
