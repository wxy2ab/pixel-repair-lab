import type { RGB } from '../../shared/vision'
import type { ModelBuilder } from './teaching-model-types'

type PixelState = { palette: RGB[][]; x: number; y: number }

export const buildPixelInstrument: ModelBuilder<PixelState> = ({ palette, x, y }, kit, tools) => {
  const rgb = palette[y][x]
  const pitch = .61
  const depth = palette.length * pitch
  const width = palette[0].length * pitch
  const left = -width / 2 - .91
  kit.casing([0, .10, 0], [width + 2.78, .22, depth + .58], '#405d61', .08)
  kit.box([left + width / 2 - pitch / 2, .245, 0], [width + .10, .08, depth + .10], '#233a42')
  palette.forEach((row, rowIndex) => row.forEach((color, colIndex) => {
    const selected = rowIndex === y && colIndex === x
    const px = left + colIndex * pitch
    const pz = (rowIndex + .5 - palette.length / 2) * pitch
    const height = selected ? .24 : .075
    kit.box([px, .28 + height / 2, pz], [.57, height, .57], selected ? '#f8e3a5' : '#759391')
    // The enamel top is unlit so the displayed pixel preserves its original RGB.
    const tint = '#' + color.map(component => component.toString(16).padStart(2, '0')).join('')
    kit.box([px, .29 + height, pz], [.50, .02, .50], tint, undefined, 'glow')
    tools.pick(colIndex + ',' + rowIndex, [px, .29 + height / 2, pz], [.57, height + .03, .57])
  }))
  tools.label('(' + x + ', ' + y + ')', [left + width / 2 - pitch / 2, .28, depth / 2 + .19], .20)
  const right = left + width + .34
  kit.casing([right + .55, .27, .12], [1.80, .15, 1.10], '#243d44', .05)
  // The fixed full-scale mark keeps bar heights comparable when another pixel is chosen.
  const ruler = right + 1.42
  kit.rod([ruler, .39, -.30], [ruler, 1.87, -.30], .026, '#9cb5ae')
  for (const mark of [0, 128, 255]) {
    const h = .39 + mark / 255 * 1.48
    kit.rod([ruler - .12, h, -.30], [ruler, h, -.30], .018, '#ead69d')
  }
  tools.label('255', [ruler + .08, 1.98, -.30], .16, 'angled')
  const colors = ['#e16b61', '#6dd596', '#6aacef']
  rgb.forEach((value, i) => {
    const cx = right + i * .54
    const height = value / 255 * 1.48
    kit.cylinder([cx, .36, .10], .21, .23, .06, '#738c89')
    if (height > 0) kit.cylinder([cx, .39 + height / 2, .10], .16, .16, height, colors[i])
    tools.label('RGB'[i] + ' ' + value, [cx, .53 + height, .10], .16)
  })
}
