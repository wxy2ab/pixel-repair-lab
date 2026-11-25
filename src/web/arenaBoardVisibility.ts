export function arenaBoardSurface(workspace: Element) {
  return workspace.querySelector<HTMLElement>(
    '.station-viewport[data-view="3d"] canvas, .station-viewport[data-view="2d"] .tilemap',
  )
}

// Measure the playing field, excluding the space occupied by the floating controls.
// Large zoomed maps can only expose a viewport-sized part of the whole board.
export function arenaBoardInView(surface: HTMLElement) {
  const board = surface.getBoundingClientRect()
  const workspace = surface.closest('.arena-map-workspace')
  const toolbar = workspace?.querySelector('.play-toolbar')?.getBoundingClientRect()
  const bottom = toolbar && board.left < toolbar.right && board.right > toolbar.left
    ? Math.min(innerHeight, toolbar.top) : innerHeight
  if (bottom <= 0 || !board.width || !board.height) return false
  const top = Math.max(0, board.top), left = Math.max(0, board.left)
  const right = Math.min(innerWidth, board.right), edge = Math.min(bottom, board.bottom)
  const width = right - left, height = edge - top
  const possibleWidth = Math.min(board.width, innerWidth), possibleHeight = Math.min(board.height, bottom)
  if (height < possibleHeight * .6 || width < possibleWidth * .6) return false
  const panel = workspace?.querySelector('.arena-console:not([hidden])')?.getBoundingClientRect()
  if (!panel) return true
  const overlap = Math.max(0, Math.min(right, panel.right) - Math.max(left, panel.left))
    * Math.max(0, Math.min(edge, panel.bottom) - Math.max(top, panel.top))
  return width * height - overlap >= possibleWidth * possibleHeight * .5
}
