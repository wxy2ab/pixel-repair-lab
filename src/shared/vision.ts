import type { LevelMetadata, Localized } from './types'

export type VisionField = readonly (number | string)[] | { min: number; max: number }
export const visionFields = {
  pixels: { x: { min: 0, max: 5 }, y: { min: 0, max: 3 } },
  color: { x: { min: 0, max: 5 }, y: { min: 0, max: 3 }, channel: ['rgb', 'red', 'green', 'blue', 'gray'] },
  filter: { blur: [0, 3, 7], threshold: { min: 0, max: 255 } },
  detect: { confidence: { min: 10, max: 95 }, target: ['all', 'dog', 'person'] },
  boxes: { x: { min: 0, max: 99 }, y: { min: 0, max: 99 }, w: { min: 1, max: 100 }, h: { min: 1, max: 100 } },
  project: { maxSide: [320, 480, 640], tone: ['original', 'brighten', 'gray'], confidence: { min: 10, max: 95 } },
} satisfies Record<string, Record<string, VisionField>>

export type VisionMode = keyof typeof visionFields
export type VisionImage = 'calibration' | 'labrador' | 'astronaut' | 'pair'
export type VisionParameters = Record<string, number | string>
export type VisionRequest = { mode: VisionMode; image: VisionImage; params: VisionParameters; action: 'prepare' | 'run' }
export type VisionBox = [x: number, y: number, width: number, height: number]
export type RGB = [red: number, green: number, blue: number]
export type VisionDetection = { label: string; score: number; box: VisionBox }
export type VisionFrame = {
  id: Exclude<VisionImage, 'pair'>; width: number; height: number; original: string; processed: string;
  intermediate?: string; detections: VisionDetection[]; annotation?: VisionBox; iou?: number;
}
export type VisionResult = {
  mode: VisionMode; engine: string; code: string; frames: VisionFrame[];
  palette?: RGB[][]; sample?: { x: number; y: number; rgb: RGB; value?: number };
  regions?: number; whitePixels?: number; channel?: string; target?: string; preprocessing?: { maxSide: number; tone: string };
}
type VisionGoal = {
  x?: number; y?: number; rgb?: RGB; channel?: string; channelValue?: number;
  regions?: number; whitePixelRange?: [number, number]; labels?: string[]; target?: string; minIou?: number;
  maxSide?: number; tone?: string; labelsByImage?: { labrador: string[]; astronaut: string[] };
}
export type VisionCase = {
  image: VisionImage; label: Localized; prompt: Localized; initial: VisionParameters;
  goal?: VisionGoal; solution?: VisionParameters;
}
export type VisionLevel = LevelMetadata & {
  kind: 'vision'; stage: 'demo' | 'exercise' | 'challenge'; mode: VisionMode; cases: VisionCase[]; courseFinal?: true;
}

const allowedImages: Record<VisionMode, VisionImage[]> = {
  pixels: ['calibration'], color: ['calibration'], filter: ['calibration'], detect: ['labrador', 'astronaut'],
  boxes: ['labrador', 'astronaut'], project: ['pair'],
}
const goalKeys: Record<VisionMode, (keyof VisionGoal)[]> = {
  pixels: ['x', 'y', 'rgb'], color: ['x', 'y', 'rgb', 'channel', 'channelValue'], filter: ['regions', 'whitePixelRange'],
  detect: ['labels', 'target'], boxes: ['minIou'], project: ['maxSide', 'tone', 'labelsByImage'],
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseVisionRequest(value: unknown): VisionRequest | null {
  if (!record(value) || Object.keys(value).length !== 4 || typeof value.mode !== 'string' || !Object.hasOwn(visionFields, value.mode)
    || (value.action !== 'run' && value.action !== 'prepare') || !record(value.params)) return null
  const mode = value.mode as VisionMode
  const image = value.image as VisionImage
  if (!allowedImages[mode].includes(image) || (value.action === 'prepare' && mode !== 'project')) return null
  const params = value.params as VisionParameters
  const fields: [string, VisionField][] = Object.entries(visionFields[mode])
  if (Object.keys(params).length !== fields.length || !fields.every(([key, field]) => {
    if (!Object.hasOwn(params, key)) return false
    const entry = params[key]
    return 'min' in field ? typeof entry === 'number' && Number.isInteger(entry) && entry >= field.min && entry <= field.max : field.includes(entry)
  })) return null
  if (mode === 'boxes' && (Number(params.x) + Number(params.w) > 100 || Number(params.y) + Number(params.h) > 100)) return null
  return { mode, image, params, action: value.action }
}

export function validVisionGoal(mode: VisionMode, goal: VisionGoal): boolean {
  const keys = Object.keys(goal) as (keyof VisionGoal)[]
  if (!keys.length || keys.some(key => !goalKeys[mode].includes(key))) return false
  if (goal.whitePixelRange && goal.whitePixelRange[0] > goal.whitePixelRange[1]) return false
  return mode !== 'project' || Boolean(goal.labelsByImage)
}

function sameLabels(detections: VisionDetection[], labels: string[]) {
  const sorted = labels.toSorted()
  return detections.length === sorted.length && detections.map(detection => detection.label).sort().every((label, index) => label === sorted[index])
}

export function visionMeetsGoal(result: VisionResult, goal: VisionGoal): boolean {
  const { sample } = result
  const frame = result.frames[0]
  return Boolean(frame)
    && (goal.x === undefined || goal.x === sample?.x)
    && (goal.y === undefined || goal.y === sample?.y)
    && (!goal.rgb || goal.rgb.every((value, index) => value === sample?.rgb[index]))
    && (goal.channel === undefined || goal.channel === result.channel)
    && (goal.channelValue === undefined || goal.channelValue === sample?.value)
    && (goal.regions === undefined || goal.regions === result.regions)
    && (!goal.whitePixelRange || (result.whitePixels !== undefined && result.whitePixels >= goal.whitePixelRange[0] && result.whitePixels <= goal.whitePixelRange[1]))
    && (!goal.labels || sameLabels(frame.detections, goal.labels))
    && (goal.target === undefined || goal.target === result.target)
    && (goal.minIou === undefined || (frame.iou ?? -1) >= goal.minIou)
    && (goal.maxSide === undefined || result.frames.every(item => Math.max(item.width, item.height) === goal.maxSide))
    && (goal.tone === undefined || goal.tone === result.preprocessing?.tone)
    && (!goal.labelsByImage || (result.frames.length === 2 && Object.entries(goal.labelsByImage).every(([id, labels]) => {
      const photo = result.frames.find(item => item.id === id)
      return photo && sameLabels(photo.detections, labels)
    })))
}
