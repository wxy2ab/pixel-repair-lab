import type { Json } from '../shared/types'
import { pythonValue } from './pythonValue'
import { tr } from './text'
import { TeachingModel } from './station3d/TeachingModel'
import type { StructureInstrumentState } from './station3d/structure-instrument'

const loadInstrument = () => import('./station3d/structure-instrument').then(module => module.buildStructureInstrument)
const instrumentNames = {
  list: { zh: '位置槽架', en: 'Indexed battery slots' },
  stack: { zh: '叠放架', en: 'Stacking rack' },
  queue: { zh: '排队传送带', en: 'Queue conveyor' },
  dictionary: { zh: '按名字查电量', en: 'Charge by battery name' },
}

type RackProps = Omit<StructureInstrumentState, 'inserting' | 'capacity'> & {
  capacity?: number
  onPick?: (name: string) => void
  onInsert?: (index: number) => void
}

export function StructureRack({ onPick, onInsert, capacity, ...rack }: RackProps) {
  return <TeachingModel<StructureInstrumentState> sceneKey={'structure-' + rack.kind} label={instrumentNames[rack.kind][rack.locale]}
    locale={rack.locale} state={{ ...rack, capacity: capacity ?? rack.names.length, inserting: Boolean(onInsert) }} load={loadInstrument}
    onPick={onInsert ? id => { if (id.startsWith('insert:')) onInsert(Number(id.slice(7))) } : onPick} />
}

export function BatteryMemory({ title, snapshot, ...rack }: RackProps & { title: string; snapshot?: Json }) {
  const { kind, names, values, active, locale } = rack
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const ordered = kind === 'stack' ? names.toReversed() : names
  function positionLabel(index: number) {
    if (kind === 'list') return t(`位置 ${index}`, `Index ${index}`)
    if (kind === 'stack' && index === 0) return t('顶端', 'Top')
    if (kind === 'queue') {
      if (ordered.length === 1) return t('队头和队尾', 'Front and back')
      if (index === 0) return t('队头', 'Front')
      if (index === ordered.length - 1) return t('队尾', 'Back')
    }
  }

  return <figure className="battery-memory" data-structure={kind}>
    <figcaption>{title}</figcaption>
    <StructureRack {...rack} />
    {ordered.length ? <ol aria-label={title}>
      {ordered.map((name, index) => <li key={name} data-current={name === active || undefined}>
        <span>{name}{values && <><i aria-hidden="true"> → </i><strong>{values[name]}</strong></>}</span>
        <small>{positionLabel(index)}</small>
      </li>)}
    </ol> : <p>{t('里面还没有电池', 'No batteries inside')}</p>}
    {snapshot !== undefined && <div className="battery-memory-register">
      <span>{t('程序记下的值', 'Stored by the program')}</span><code>{pythonValue(snapshot)}</code>
    </div>}
  </figure>
}
