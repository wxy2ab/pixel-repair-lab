import { useId } from 'react'
import type { LectureAnimation } from '../shared/advanced'
import type { Locale } from '../shared/types'
import './lecture-plot.css'

export function LecturePlot({ animation, step, locale }: { animation: LectureAnimation; step: number; locale: Locale }) {
  const gridId = useId()
  const frame = animation.frames[step]
  if (!animation.plot) return null
  const { columns, rows } = animation.plot
  const unit = Math.min(560 / columns, 295 / rows)
  const width = unit * columns
  const height = unit * rows
  const shapes = frame.items.filter(item => item.box)
  const outlines = shapes.filter(item => !item.symbol)
  const facts = frame.items.filter(item => !item.box)
  const overlaps = outlines.flatMap((first, index) => outlines.slice(index + 1).flatMap(second => {
    const [ax, ay, aw, ah] = first.box!
    const [bx, by, bw, bh] = second.box!
    const x = Math.max(ax, bx)
    const y = Math.max(ay, by)
    const w = Math.min(ax + aw, bx + bw) - x
    const h = Math.min(ay + ah, by + bh) - y
    return w > 0 && h > 0 ? [{ key: first.id + '/' + second.id, x, y, w, h }] : []
  }))
  // Fine grids (e.g. photo pixels) use ten or fewer major divisions on either axis.
  const gridUnit = unit * Math.max(1, Math.ceil(Math.max(columns, rows) / 10))
  return <figure className="lecture-plot">
    <svg className="lecture-plot__stage" viewBox={`-5 -5 ${width + 10} ${height + 10}`}
      role="img" aria-label={frame.caption[locale]}>
      <defs><pattern id={gridId} width={gridUnit} height={gridUnit} patternUnits="userSpaceOnUse">
        <path d={`M ${gridUnit} 0 H 0 V ${gridUnit}`} fill="none" stroke="#587086" strokeWidth="1.2" />
      </pattern><pattern id={gridId + '-overlap'} width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M-2 2 L2 -2 M0 10 L10 0 M8 12 L12 8" stroke="#d8f9ef" strokeWidth="2" />
      </pattern></defs>
      <rect width={width} height={height} fill="#172b3c" />
      <rect width={width} height={height} fill={`url(#${gridId})`} stroke="#587086" />
      {shapes.filter(item => item.symbol).map(item => {
        const [x, y, w, h] = item.box!
        return <text key={item.id} className="lecture-plot__symbol" data-object={item.id}
          x={(x + w / 2) * unit} y={(y + h / 2) * unit}
          fontSize={Math.min(w, h) * unit * .87} textAnchor="middle" dominantBaseline="central">
          <title>{item.label[locale]}</title>{item.symbol}
        </text>
      })}
      {overlaps.map(({ key, x, y, w, h }) => <rect key={key} className="lecture-plot__overlap" data-cells={w * h}
        x={unit * x} y={unit * y} width={unit * w} height={unit * h} fill={`url(#${gridId}-overlap)`} />)}
      {overlaps.length > 0 && <rect width={width} height={height} fill={`url(#${gridId})`} />}
      {outlines.map((item, index) => {
        const [x, y, w, h] = item.box!
        const color = item.swatch ?? '#80e2d2'
        const oppositeCorner = index % 2 === 1
        return <g key={item.id} data-box={item.id} className="lecture-plot__box"
          style={{ transform: `translate(${x * unit}px, ${y * unit}px)` }}>
          <rect width={w * unit} height={h * unit} fill={color} fillOpacity=".15" stroke={color}
            strokeWidth="3" strokeDasharray={oppositeCorner ? '8 4' : undefined} />
          <text x={oppositeCorner ? w * unit - 8 : 8} y={oppositeCorner ? h * unit - 10 : 22}
            textAnchor={oppositeCorner ? 'end' : 'start'} fill={color} className="lecture-plot__tag">
            {item.label[locale]}
          </text>
        </g>
      })}
    </svg>
    <figcaption className="lecture-plot__readings">
      {[...outlines, ...facts].map(item => <span key={item.id} data-reading={item.id}>
        {item.swatch && <i aria-hidden="true" style={{ background: item.swatch }} />}
        <strong>{item.label[locale]}</strong>
        {item.value && <b>{item.value[locale]}</b>}
        {item.annotation && <small>{item.annotation[locale]}</small>}
      </span>)}
    </figcaption>
  </figure>
}
