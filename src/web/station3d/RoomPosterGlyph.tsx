import type { RoomActivityReading, RoomTarget } from './roomActivity'
import './room-poster-glyph.css'

export function RoomPosterGlyph({ target, reading }: { target: RoomTarget; reading: RoomActivityReading }) {
  const { kind, mode, input, output } = reading
  if (target === 'setting') {
    return <span aria-hidden="true" className="room-poster-dial"><i /></span>
  }

  const values = target === 'sample' ? input : output
  const lamps = kind === 'systems' || kind === 'electronics' || (target === 'run' && mode === 'mask')
  const scale = kind === 'pixels' ? 255 : kind === 'vision' ? 100 : 10
  return <span aria-hidden="true" className="room-poster-meter" data-target={target}>
    {values === null ? <i className="room-poster-play" /> : values.map((value, index) => (
      lamps
        ? <i key={index} className="room-poster-lamp" data-lit={value !== 0} />
        : <i key={index} className="room-poster-column" style={{ height: Math.max(2, 19 * Math.min(1, value / scale)) }} />
    ))}
  </span>
}
