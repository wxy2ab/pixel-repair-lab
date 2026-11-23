import type { BoardDevice } from './gridDeviceDisplay'
import './grid-devices.css'

export function GridDeviceGlyph({ device, legend = false }: { device: BoardDevice; legend?: boolean }) {
  return <span aria-hidden="true" className={legend ? 'mechanism-glyph mechanism-swatch' : 'mechanism-glyph'}
    data-symbol={device.kind} data-status={legend ? undefined : device.status}
    data-direction={'direction' in device ? device.direction : undefined}
    data-orientation={device.kind === 'mirror' ? device.orientation : undefined}>
    <i>{!legend && device.kind === 'bomb' && device.status === 'armed' ? device.remaining : null}</i>
  </span>
}
