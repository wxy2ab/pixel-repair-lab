import type { Locale } from '../shared/types'
import { tr } from './text'
import './map-scenario-picker.css'

type Props = { locale: Locale; index: number; count: number; onChange: (index: number) => void }

export default function MapScenarioPicker({ locale, index, count, onChange }: Props) {
  if (count < 2) return null
  const label = tr(locale, '切换地图', 'Switch map')
  return <div className="map-scenario-picker" role="group" aria-label={label} data-testid="map-scenario-picker">
    <span aria-hidden="true">{label}</span>
    {Array.from({ length: count }, (_, i) => <button key={i} type="button" aria-pressed={index === i}
      data-testid={'map-scenario-' + i} onClick={() => { if (i !== index) onChange(i) }}>
      {tr(locale, '地图 ', 'Map ')}{i + 1}
    </button>)}
  </div>
}
