import type { FerryCommand, GridLevel, Locale } from '../shared/types'
import { directionArrow } from './gridDeviceDisplay'
import { tr } from './text'
import './ferry-race.css'

const glyphs = { ...directionArrow, pick: '＋', wait: 'Ⅱ' }

export function RaceRouteEditor<T extends FerryCommand>({ level, locale, family, commands, allowed, onChange, onRun }: {
  level: GridLevel; locale: Locale; family: 'ferry' | 'mirror'; commands: T[]; allowed: (id: string) => id is T
  onChange: (commands: T[]) => void; onRun: () => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <div className="ferry-plan">
    <h3>{t('我的路线', 'My route')}</h3>
    <div className="ferry-command-palette">
      {level.cards.map(({ id, label }) => allowed(id) && <button type="button" key={id}
        data-ferry-command={family === 'ferry' ? id : undefined} data-mirror-command={family === 'mirror' ? id : undefined}
        disabled={commands.length >= 240} onClick={() => onChange([...commands, id])}>
        <b aria-hidden="true">{glyphs[id]}</b>{label[locale]}</button>)}
    </div>
    <ol className="ferry-command-list" aria-label={t('已排指令', 'Queued commands')}>
      {commands.map((command, i) => {
        const label = level.cards.find(card => card.id === command)?.label[locale] ?? command
        const remove = t(`移除第 ${i + 1} 步 · ${label}`, `Remove step ${i + 1} · ${label}`)
        return <li key={i}><button type="button" title={remove} aria-label={remove}
          onClick={() => onChange(commands.filter((_, index) => index !== i))}>{glyphs[command]}</button></li>
      })}
    </ol>
    <div className="ferry-plan-actions"><button type="button" className="subtle-button" disabled={!commands.length}
      data-testid={family + '-race-undo'} onClick={() => onChange(commands.slice(0, -1))}>{t('撤销一步', 'Undo last step')}</button>
      <button type="button" className="primary-button" data-testid={family + '-race-run'} onClick={onRun}>{t('同时出发', 'Start both routes')}</button></div>
  </div>
}
