import { previewArenaMatches, type ArenaMatchPreviewBatch } from './arenaMatchPreview'

self.addEventListener('message', (event: MessageEvent<ArenaMatchPreviewBatch>) => {
  self.postMessage(previewArenaMatches(event.data))
})
