import type { Kit } from './workshop'

export type ModelPoint = [number, number, number]

export type TeachingModelTools = {
  label: (text: string, position: ModelPoint, size?: number, onlyIn?: 'angled') => void
  pick: (id: string, centre: ModelPoint, size: ModelPoint) => void
}

export type ModelBuilder<State> = (state: State, kit: Kit, tools: TeachingModelTools) => void
