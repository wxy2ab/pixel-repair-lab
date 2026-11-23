import { fileURLToPath } from 'node:url'

// This source module and the packaged server entry are both one directory below the game.
export const projectDirectory = fileURLToPath(new URL('../', import.meta.url))
