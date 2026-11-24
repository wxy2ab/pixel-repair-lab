import type { CircuitLevel, MachineLevel } from './hardware'
import { arduinoIssues } from './arduino'
import { breadboardIssues } from './breadboard'
import { projectedColumns, validDataParameters, type DataLevel } from './dataCourse'
import { parseVisionRequest, validVisionGoal, type VisionLevel } from './vision'
import Ajv2020 from 'ajv/dist/2020.js'
import schema from '../../level.schema.json'
import { parameterNames } from './cards'
import { blockingGridDevice } from './gridDevices'
import { ferryIssues } from './ferry'
import { laserTrialIssues } from './laserTrial'
import { isShortestRoute, readRouteMap } from './routeMap'
import { parseCandidate } from '../ai/core'
import { collectionRecordsMatch, isProgramOrder, nestedRowsMatch, programGraphics, programSourceLines, structureKinds, type BatterySearchRange, type FirstBatterySearchInput, type ProgramWalkthrough, type TwoPointerMove } from './programWalkthrough'
import { dispatchOrdersMatch, readDispatchCase, readDispatchResult, type DispatchCase, type DispatchResult } from './batteryDispatch'
import { batteryPipelineHelpers, readBatteryPipelineCase, readBatteryPipelineResult, type BatteryPipelineCase } from './batteryPipeline'
import { breadthFirstReference, sameBreadthCell, walkableBreadthCell, type BreadthCell, type BreadthFirstMap } from './breadthFirstLesson'
import type { AlgorithmLevel, ArenaScenario } from './advanced'
import type { AiLevel, CardInstance, GridLevel, Issue, Json, Level, Position, Scenario } from './types'

export const MAX_LEVEL_BYTES = 256 * 1024

const ajv = new Ajv2020({ allErrors: true })
ajv.addSchema(schema)
const kinds = ['grid', 'ai', 'lecture', 'replay', 'algorithm', 'arena', 'lab', 'circuit', 'machine', 'arduino', 'breadboard', 'data', 'vision'] as const
const validators = new Map(kinds.map(kind => [kind, ajv.compile<Level>({ $ref: schema.$id + '#/$defs/' + kind })]))

function scenarioIssues(scenario: Scenario, prefix: string, issues: Issue[]) {
  const report = (path: string, code: string, message: string) => issues.push({ path: prefix + path, code, message })
  const width = scenario.tiles[0].length
  if (scenario.tiles.some(row => row.length !== width)) {
    report('/tiles', 'uneven-rows', 'Map rows must all have the same length.')
  }
  const checkPosition = ({ x, y }: Position, path: string) => {
    if (scenario.tiles[y]?.[x] !== '.') report(path, 'location', 'Position must be on a floor tile.')
  }
  checkPosition(scenario.start, '/start')
  const itemIds = new Set<string>()
  for (const [index, item] of (scenario.items ?? []).entries()) {
    checkPosition(item, '/items/' + index)
    if (itemIds.has(item.id)) report('/items/' + index + '/id', 'duplicate-id', 'IDs must be unique.')
    itemIds.add(item.id)
  }
  const devices = scenario.devices ?? []
  const deviceIds = new Map(devices.map(device => [device.id, device.kind]))
  const usedIds = new Set(itemIds)
  const deviceCells = new Set<string>()
  for (const [index, device] of devices.entries()) {
    const at = '/devices/' + index
    checkPosition(device, at)
    if (usedIds.has(device.id)) report(at + '/id', 'duplicate-id', 'Device and item IDs must be unique.')
    usedIds.add(device.id)
    const cell = device.x + ',' + device.y
    if (deviceCells.has(cell)) report(at, 'device-overlap', 'Each device needs its own tile.')
    deviceCells.add(cell)
    if ('keyId' in device && device.keyId && deviceIds.get(device.keyId) !== 'key') {
      report(at + '/keyId', 'device-link', 'The lock needs a key on this map with the specified ID.')
    }
    if ('switchId' in device && device.switchId && deviceIds.get(device.switchId) !== 'switch') {
      report(at + '/switchId', 'device-link', 'The device needs a switch on this map with the specified ID.')
    }
    if (device.kind === 'cannon' && (device.phase ?? 0) >= device.period) {
      report(at + '/phase', 'device-phase', 'The phase must be smaller than the period.')
    }
    if (device.kind === 'chest') itemIds.add(device.id)
  }
  if (blockingGridDevice(scenario, undefined, scenario.start)) {
    report('/start', 'device-start', 'The starting tile must be open to the robot.')
  }
  const warehouse = scenario.warehouse
  if (warehouse) {
    if (warehouse.boxes.length !== warehouse.targets.length) {
      report('/warehouse/targets', 'warehouse-count', 'Each box needs one parking target.')
    }
    warehouse.boxes.forEach((box, index) => {
      const path = '/warehouse/boxes/' + index
      checkPosition(box, path)
      if ((box.x === scenario.start.x && box.y === scenario.start.y)
        || blockingGridDevice(scenario, undefined, box)
        || scenario.enemies?.some(({ path }) => path[0].x === box.x && path[0].y === box.y)) {
        report(path, 'warehouse-occupied', 'A box must start on a square free of robots and solid fixtures.')
      }
    })
    warehouse.targets.forEach((target, index) => checkPosition(target, '/warehouse/targets/' + index))
  }
  for (const [index, enemy] of (scenario.enemies ?? []).entries()) {
    for (const [point, position] of enemy.path.entries()) {
      checkPosition(position, '/enemies/' + index + '/path/' + point)
      const next = enemy.path[(point + 1) % enemy.path.length]
      if (Math.abs(next.x - position.x) + Math.abs(next.y - position.y) > 1) {
        report('/enemies/' + index + '/path/' + point, 'patrol', 'Each patrol step must stay in place or move to an adjacent tile.')
      }
    }
    if (enemy.path[0].x === scenario.start.x && enemy.path[0].y === scenario.start.y) {
      report('/enemies/' + index + '/path/0', 'enemy-start', 'An enemy cannot start on the player tile.')
    }
  }
  const memorySize = scenario.memory?.length ?? 0
  for (const [index, instruction] of (scenario.instructions ?? []).entries()) {
    if (instruction.op !== 'HALT' && instruction.address >= memorySize) {
      report('/instructions/' + index + '/address', 'memory', 'Address must point to a configured memory cell.')
    }
  }
  for (const [index, goal] of scenario.objectives.entries()) {
    const path = '/objectives/' + index
    if (goal.type === 'exit') checkPosition(goal, path)
    if (goal.type === 'parkBoxes' && !warehouse) report(path, 'warehouse-missing', 'A parking objective needs boxes and targets.')
    if (goal.type === 'collect' && goal.itemIds.some(id => !itemIds.has(id))) {
      report(path + '/itemIds', 'unknown-item', 'The objective refers to an unknown item.')
    }
    if (goal.type === 'memory' && goal.address >= memorySize) {
      report(path + '/address', 'memory', 'Address must point to a configured memory cell.')
    }
    if (goal.type === 'halt' && !scenario.instructions?.some(instruction => instruction.op === 'HALT')) {
      report(path, 'halt', 'A halt objective needs a HALT instruction.')
    }
  }
}

function gridIssues(level: GridLevel, issues: Issue[]) {
  scenarioIssues(level, '', issues)
  issues.push(...ferryIssues(level), ...laserTrialIssues(level))
  level.variants?.forEach((variant, index) => scenarioIssues({ ...level, ...variant }, '/variants/' + index, issues))
  const report = (path: string, code: string, message: string) => issues.push({ path, code, message })
  const byId = new Map(level.cards.map(card => [card.id, card]))
  if (byId.size !== level.cards.length) report('/cards', 'duplicate-id', 'Card IDs must be unique.')
  for (const [index, card] of level.cards.entries()) {
    const names = (card.parameters ?? []).map(parameter => parameter.name)
    const placeholders = parameterNames(card.template)
    if (new Set(names).size !== names.length || names.some(name => !placeholders.includes(name)) || placeholders.some(name => !names.includes(name))) {
      report('/cards/' + index, 'card-parameter', 'Every card parameter must match a template placeholder.')
    }
    if (card.template.trimEnd().endsWith(':') !== Boolean(card.block)) {
      report('/cards/' + index + '/block', 'card-block', 'Only block cards have a trailing colon and nested cards.')
    }
    card.parameters?.forEach((parameter, parameterIndex) => {
      if (new Set(parameter.choices.map(choice => choice.id)).size !== parameter.choices.length) {
        report('/cards/' + index + '/parameters/' + parameterIndex, 'duplicate-id', 'Choice IDs must be unique.')
      }
    })
  }

  let cardCount = 0
  function checkCards(cards: CardInstance[], prefix: string, depth: number) {
    if (depth > 5) {
      report(prefix, 'card-depth', 'A program may nest up to five levels of cards.')
      return
    }
    for (const [index, item] of cards.entries()) {
      cardCount += 1
      if (cardCount > 100) {
        report(prefix, 'card-count', 'A program may use up to 100 cards.')
        return
      }
      const path = prefix + '/' + index
      const card = byId.get(item.cardId)
      if (!card) {
        report(path + '/cardId', 'unknown-card', 'The solution refers to an unknown card.')
        continue
      }
      for (const [name, choice] of Object.entries(item.values ?? {})) {
        const parameter = card.parameters?.find(parameter => parameter.name === name)
        if (!parameter?.choices.some(option => option.id === choice)) {
          report(path + '/values/' + name, 'card-choice', 'The solution refers to an unknown choice.')
        }
      }
      if (item.children?.length) {
        if (!card.block) report(path + '/children', 'card-block', 'Only block cards can contain other cards.')
        checkCards(item.children, path + '/children', depth + 1)
      }
    }
  }
  checkCards(level.solutionCards, '/solutionCards', 0)
}

function aiIssues(level: AiLevel, issues: Issue[]) {
  const ids = new Set(level.inventory.map(item => item.id))
  if (ids.size !== level.inventory.length) issues.push({ path: '/inventory', code: 'duplicate-id', message: 'Inventory IDs must be unique.' })
  for (const id of Object.keys(level.required)) {
    if (!ids.has(id)) issues.push({ path: '/required/' + id, code: 'unknown-item', message: 'The task refers to an unknown inventory item.' })
  }
  const { workflow, trainingFault } = level
  const faults = workflow?.faults ?? (trainingFault ? [trainingFault] : [])
  for (const [index, { itemId, quantity }] of faults.entries()) {
    if (!ids.has(itemId) || (Object.hasOwn(level.required, itemId) ? level.required[itemId] : 0) === quantity) {
      issues.push({ path: workflow ? '/workflow/faults/' + index : '/trainingFault', code: 'training-fault',
        message: 'The training fault must change the expected quantity of an inventory item.' })
    }
  }
  if (workflow?.draft && !parseCandidate(level, workflow.draft)) {
    issues.push({ path: '/workflow/draft', code: 'ai-workflow', message: 'The draft must use unique inventory item IDs and valid quantities.' })
  }
  if (Object.values(level.examplePrompts).some(prompts => prompts.length <= faults.length)) {
    issues.push({ path: '/examplePrompts', code: 'ai-workflow', message: 'Provide an initial prompt and a correction after each training fault.' })
  }
  if (level.courseFinal && (level.unit?.id !== 'ai-review' || level.stage !== 'challenge' || level.topic || workflow?.review !== 'manual' || faults.length < 2)) {
    issues.push({ path: '/courseFinal', code: 'ai-workflow', message: 'The AI final project is a challenge in Review and Revision with manual review and at least two simulated faults.' })
  }
}

function arenaIssues(scenario: ArenaScenario, prefix: string, issues: Issue[]) {
  const { tiles, start, items, opponents, objective } = scenario
  const objectives: Scenario['objectives'] = []
  if (objective.kind === 'escape') objectives.push({ type: 'exit', ...objective.exit })
  if ('itemIds' in objective) objectives.push({ type: 'collect', itemIds: objective.itemIds })
  scenarioIssues({ tiles, start, items, objectives }, prefix, issues)
  const ids = new Set(['player'])
  const starts = new Set([start.x + ',' + start.y])
  const report = (path: string, code: string, message: string) => issues.push({ path: prefix + path, code, message })
  if (objective.kind === 'eliminate' && !scenario.combat) {
    report('/objective', 'arena-combat', 'Enable combat for an elimination objective.')
  }
  if (objective.kind === 'score' && !items.length) report('/items', 'arena-score', 'A score race needs at least one item.')
  const buffIds = new Set<string>()
  for (const [index, buff] of (scenario.combat?.buffs ?? []).entries()) {
    if (buffIds.has(buff.id) || !items.some(item => item.id === buff.id)) {
      report('/combat/buffs/' + index + '/id', 'arena-buff', 'Each chip must refer to a different item on this map.')
    }
    buffIds.add(buff.id)
  }
  for (const [index, opponent] of opponents.entries()) {
    const path = '/opponents/' + index
    if (ids.has(opponent.id)) report(path + '/id', 'duplicate-id', 'Opponent IDs must be unique and cannot be player.')
    ids.add(opponent.id)
    if (tiles[opponent.start.y]?.[opponent.start.x] !== '.') {
      report(path + '/start', 'location', 'Position must be on a floor tile.')
    }
    const startKey = opponent.start.x + ',' + opponent.start.y
    if (starts.has(startKey)) report(path + '/start', 'enemy-start', 'Each robot needs a separate starting tile.')
    starts.add(startKey)
    if (opponent.policy.kind === 'duelist' && !scenario.combat) report(path + '/policy', 'arena-combat', 'Duelists need combat rules.')

    if (opponent.policy.kind !== 'patrol') continue
    const patrol = opponent.policy.path
    if (patrol[0].x !== opponent.start.x || patrol[0].y !== opponent.start.y) {
      report(path + '/policy/path/0', 'patrol-start', 'The patrol must begin at the opponent’s starting position.')
    }
    for (const [step, point] of patrol.entries()) {
      const next = patrol[(step + 1) % patrol.length]
      if (tiles[point.y]?.[point.x] !== '.') report(path + '/policy/path/' + step, 'location', 'Position must be on a floor tile.')
      if (Math.abs(point.x - next.x) + Math.abs(point.y - next.y) > 1) {
        report(path + '/policy/path/' + step, 'patrol', 'Each patrol step must stay in place or move to an adjacent tile.')
      }
    }
  }
  arenaShiftIssues(scenario, prefix, issues)
}

function arenaShiftIssues({ shifts, tiles, items, maxTurns }: ArenaScenario, prefix: string, issues: Issue[]) {
  if (!shifts?.length) return
  const board = tiles.map(row => row.split(''))
  const itemPositions = new Map<string, Position>(items.map(item => [item.id, item]))
  const report = (path: string, message: string) => issues.push({ path: prefix + '/shifts/' + path, code: 'arena-shift', message })
  const positionKey = ({ x, y }: Position) => x + ',' + y
  const onBoard = ({ x, y }: Position) => board[y]?.[x] !== undefined
  let previousTurn = 0

  for (const [index, shift] of shifts.entries()) {
    if (shift.turn <= previousTurn || shift.turn >= maxTurns) {
      report(index + '/turn', 'Schedule each shift on a different increasing turn before the last turn.')
    }
    previousTurn = shift.turn
    const opened = new Set<string>()
    for (const [point, position] of (shift.open ?? []).entries()) {
      if (!onBoard(position)) report(index + '/open/' + point, 'A gate must be on the board.')
      else board[position.y][position.x] = '.'
      opened.add(positionKey(position))
    }
    const moved = new Set<string>()
    for (const [point, item] of (shift.moveItems ?? []).entries()) {
      const path = index + '/moveItems/' + point
      if (!itemPositions.has(item.id)) report(path + '/id', 'Choose a battery that starts in this arena.')
      else if (moved.has(item.id)) report(path + '/id', 'Move each battery at most once per shift.')
      else if (board[item.y]?.[item.x] !== '.') report(path, 'Move the battery to a floor tile after any gates open.')
      else if ([...itemPositions].some(([id, position]) => id !== item.id && positionKey(position) === positionKey(item))) {
        report(path, 'A battery’s destination must be free of other batteries.')
      } else itemPositions.set(item.id, item)
      moved.add(item.id)
    }
    for (const [point, position] of (shift.close ?? []).entries()) {
      const path = index + '/close/' + point
      if (!onBoard(position)) report(path, 'A gate must be on the board.')
      else if (opened.has(positionKey(position))) report(path, 'Do not open and close the same gate in one shift.')
      else board[position.y][position.x] = '#'
    }
  }
}

function circuitIssues(level: CircuitLevel, issues: Issue[]) {
  const report = (path: string, message: string) => issues.push({ path, code: 'circuit-config', message })
  const gates = new Set(level.gateChoices ?? [])
  const usesGate = level.mode === 'logic' || level.mode === 'combined'
  const component = level.mode === 'diode' || level.mode === 'transistor'
  const scored = level.stage === 'exercise' || level.stage === 'challenge'
  if (usesGate !== Boolean(gates.size)) report('/gateChoices', 'Only gate circuits use a list of gates.')
  for (const [index, scenario] of level.cases.entries()) {
    const path = '/cases/' + index
    if (level.mode === 'logic' && scenario.bits.length !== 2) report(path + '/bits', 'A logic gate needs two input positions.')
    if (component && scenario.bits.length !== 2) report(path + '/bits', 'A component circuit needs a load switch and a device control.')
    if (usesGate ? !scenario.gate || !gates.has(scenario.gate) : scenario.gate !== undefined) {
      report(path + '/gate', 'Choose an initial gate from the available gates in a gate mode.')
    }
    if (scored && (!scenario.goal || !scenario.solution)) report(path, 'Each scored case needs a goal and a reference switch setting.')
    if (scenario.goal) {
      const { value, output, gate, switchClosed, diodeForward, baseHigh } = scenario.goal
      if ((level.mode === 'logic' && value !== undefined) || (level.mode === 'binary' && (output !== undefined || gate !== undefined))
        || (component && (value !== undefined || gate !== undefined || output === undefined))
        || (!component && switchClosed !== undefined) || (level.mode !== 'diode' && diodeForward !== undefined)
        || (level.mode !== 'transistor' && baseHigh !== undefined)) {
        report(path + '/goal', 'Choose targets that the current circuit can display.')
      }
      if (value !== undefined && value >= 2 ** scenario.bits.length) report(path + '/goal/value', 'This target does not fit the number of bits.')
      if (gate !== undefined && !gates.has(gate)) report(path + '/goal/gate', 'This gate is unavailable.')
    }
    if (scenario.solution) {
      if (scenario.solution.bits.length !== scenario.bits.length) report(path + '/solution/bits', 'The reference must set the same number of bits.')
      if (usesGate ? !scenario.solution.gate || !gates.has(scenario.solution.gate) : scenario.solution.gate !== undefined) {
        report(path + '/solution/gate', 'Set an available gate in the reference for a gate mode.')
      }
    }
  }
}

function machineIssues(level: MachineLevel, issues: Issue[]) {
  const report = (path: string, message: string) => issues.push({ path, code: 'machine-config', message })
  const scored = level.stage === 'exercise' || level.stage === 'challenge'
  if (scored && !level.solutionCode?.trim()) report('/solutionCode', 'Write reference instructions for this scored machine.')
  for (const [index, scenario] of level.cases.entries()) {
    const path = '/cases/' + index + '/goal'
    if (scored && !scenario.goal) report(path, 'Set an accumulator or memory goal for this scored case.')
    const checks = scenario.goal?.memory ?? []
    if (checks.some(check => check.address >= scenario.memory.length)) report(path + '/memory', 'The target address must exist in this case.')
    if (new Set(checks.map(check => check.address)).size !== checks.length) report(path + '/memory', 'Each target address needs one expected value.')
  }
}

function dataIssues(level: DataLevel, issues: Issue[]) {
  const report = (path: string, message: string) => issues.push({ path, code: 'data-config', message })
  if (level.courseFinal && (level.stage !== 'challenge' || level.topic || level.unit?.id !== 'database')) {
    report('/courseFinal', 'The final project belongs to the database unit, uses the challenge stage, and has no topic.')
  }
  let previous: string[] | undefined
  for (const [index, step] of level.steps.entries()) {
    const path = '/steps/' + index
    const { operation, input, initial, goal, solution } = step
    if (!index && input === 'previous') report(path + '/input', 'The first step needs the original or prepared data.')
    if (!validDataParameters(operation, initial)) report(path + '/initial', 'Set the available controls for this operation.')
    if (level.stage !== 'demo' && (!goal || !solution)) report(path, 'Each scored step needs a target table and reference settings.')
    if (level.stage === 'demo' && (goal || solution)) report(path, 'A demonstration uses initial settings and has no graded target.')
    if (solution && !validDataParameters(operation, solution)) report(path + '/solution', 'Set the available controls for the reference.')

    const start = projectedColumns({ operation, input, params: initial }, previous)
    const reference = solution ? projectedColumns({ operation, input, params: solution }, previous) : start
    if (!start || !reference) report(path + '/input', 'The input table must have the columns needed by this step.')
    if (goal && (goal.rows.some(row => row.length !== goal.columns.length) || !reference
      || goal.columns.length !== reference.length || goal.columns.some((name, column) => name !== reference[column]))) {
      report(path + '/goal', 'The target rows must match the reference output columns in order.')
    }
    previous = reference
  }
}

function visionIssues(level: VisionLevel, issues: Issue[]) {
  const report = (path: string, message: string) => issues.push({ path, code: 'vision-config', message })
  if (level.courseFinal && (level.stage !== 'challenge' || level.topic || level.unit?.id !== 'yolox' || level.mode !== 'project')) {
    report('/courseFinal', 'The final vision project uses project mode, belongs to the YOLOX unit, and uses the challenge stage without a topic.')
  }
  for (const [index, entry] of level.cases.entries()) {
    const path = '/cases/' + index
    const { image, initial, goal, solution } = entry
    if (!parseVisionRequest({ mode: level.mode, image, params: initial, action: 'run' })) report(path + '/initial', 'Choose an image and settings available in this experiment.')
    if (level.stage === 'demo' && (goal || solution)) report(path, 'A demonstration has no graded target.')
    if (level.stage !== 'demo' && (!goal || !solution)) report(path, 'Each scored image needs a target and reference settings.')
    if (goal && !validVisionGoal(level.mode, goal)) report(path + '/goal', 'Use a target supported by the experiment.')
    if (solution && !parseVisionRequest({ mode: level.mode, image, params: solution, action: 'run' })) report(path + '/solution', 'The reference settings must be valid for the experiment.')
  }
}

function sequenceIssues({ sequence, intro, guided, visual, cases }: ProgramWalkthrough, issues: Issue[]) {
  if (!sequence) return
  const report = (path: string, message: string) => issues.push({ path: '/execution' + path, code: 'program-sequence', message })
  if (intro || guided || !visual || visual.functions.length ||
    visual.main.map(card => card.icon).join(',') !== 'battery,compute,display') {
    report('/sequence', 'Use a sequence of three cards for reading, calculating, and displaying.')
    return
  }
  if (!cases[1] || cases[0].input === cases[1].input) {
    report('/cases', 'Provide a different input for the repair activity.')
  }
  for (const [phase, order] of Object.entries(sequence)) {
    if (!isProgramOrder(visual.main, order) || visual.main.every((card, index) => card.id === order[index])) {
      report(`/sequence/${phase}`, 'Use each card once in a different order than the source.')
    }
  }
  if (new Set(Object.values(sequence).map(order => order.join(','))).size !== 3) {
    report('/sequence', 'Use a different card order for each activity.')
  }
}

function booleanIssues({ boolean, intro, visual, guided, sequence, assignment, cases }: ProgramWalkthrough, issues: Issue[]) {
  if (!boolean) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/' + field, code: 'program-boolean', message })
  if (intro || visual || guided || sequence || assignment) {
    report('boolean', 'Use only the Boolean comparison presentation.')
  }
  if (cases.some(({ activity, doorOpen, expected }) => !activity || doorOpen === undefined || (expected !== 'True' && expected !== 'False'))) {
    report('cases', 'Each Boolean example needs an activity, a door state, and an expected True or False.')
    return
  }
  const compare = cases.filter(({ activity }) => activity === 'compare')
  const combine = cases.filter(({ activity }) => activity === 'combine')
  const predict = cases.filter(({ activity }) => activity === 'predict')
  const { threshold } = boolean
  if (compare.length !== 3 || compare.some(({ input }, index) => input !== threshold - 1 + index)) {
    report('cases', 'List the comparison points just below, at, and just above the threshold.')
  }
  const [closed, open] = combine
  if (combine.length !== 2 || closed.input < threshold || open.input !== closed.input || closed.doorOpen || !open.doorOpen) {
    report('cases', 'Demonstrate the same sufficient reading with the door closed and then open.')
  }
  if (!predict.length || predict.some(sample => combine.some(demo => demo.input === sample.input && demo.doorOpen === sample.doorOpen))) {
    report('cases', 'Add a prediction with a different charge and door combination.')
  }
}

function branchLessonIssues({ branchLesson, intro, visual, guided, sequence, assignment, boolean, cases }: ProgramWalkthrough, issues: Issue[]) {
  if (!branchLesson) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/' + field, code: 'program-branch', message })
  if (intro || visual || guided || sequence || assignment || boolean) {
    report('branchLesson', 'Use only the branch presentation.')
  }
  if (cases.some(({ activity, doorOpen }) => (activity !== 'branch' && activity !== 'predict') || doorOpen === undefined)) {
    report('cases', 'Each branch example needs an activity and a door state.')
    return
  }
  const examples = cases.filter(({ activity }) => activity === 'branch')
  const [open, closed] = examples
  if (examples.length !== 2 || open.input < branchLesson.threshold || closed.input !== open.input || !open.doorOpen || closed.doorOpen) {
    report('cases', 'Demonstrate the same sufficient reading with the door open and then closed.')
  }
  const predict = cases.filter(({ activity }) => activity === 'predict')
  if (!predict.length || predict.some(sample => examples.some(demo => demo.input === sample.input && demo.doorOpen === sample.doorOpen))) {
    report('cases', 'Add a prediction with a different charge and door combination.')
  }
}

function forLoopIssues({ forLoop, intro, visual, guided, sequence, assignment, boolean, branchLesson }: ProgramWalkthrough, issues: Issue[]) {
  if (!forLoop) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/forLoop' + field, code: 'program-for', message })
  if (intro || visual || guided || sequence || assignment || boolean || branchLesson) {
    report('', 'Use only the for-loop presentation.')
  }
  const [demo, ...practice] = forLoop.cases
  if (!demo.batteries.length) report('/cases/0/batteries', 'Include at least one battery in the demonstration.')
  forLoop.cases.forEach(({ batteries, expected }, index) => {
    if (batteries.length !== expected.length) {
      report(`/cases/${index}/expected`, 'Include one charged value for each battery.')
    }
  })
  practice.forEach(({ batteries, expected, predictions }, index) => {
    if (!predictions?.rounds.includes(batteries.length) || !predictions.results.some(result =>
      result.length === expected.length && result.every((value, position) => value === expected[position]))) {
      report(`/cases/${index + 1}/predictions`, 'Include the correct number of turns and the expected result list.')
    }
  })
}

function whileLoopIssues({ whileLoop, intro, visual, guided, sequence, assignment, boolean, branchLesson, forLoop, cases }: ProgramWalkthrough, issues: Issue[]) {
  if (!whileLoop) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/' + field, code: 'program-while', message })
  if (intro || visual || guided || sequence || assignment || boolean || branchLesson || forLoop) {
    report('whileLoop', 'Use only the while-loop presentation.')
  }
  const { threshold, increment } = whileLoop
  const [needsCharge, ready, ...practice] = cases
  if (!needsCharge || !ready || !practice.length || needsCharge.input >= threshold || ready.input < threshold) {
    report('cases', 'Start with an example that needs charging and one that is already ready, then provide a prediction.')
  }
  if (new Set(cases.map(({ input }) => input)).size !== cases.length || cases.some(({ input }) => input < 0)) {
    report('cases', 'Use different nonnegative starting charges for the examples and predictions.')
  }
  practice.forEach(({ input, expected, predictions, roundPredictions }, index) => {
    const rounds = Math.max(0, Math.ceil((threshold - input) / increment))
    if (!roundPredictions?.includes(rounds) || !predictions?.includes(expected)) {
      report(`cases/${index + 2}`, 'Include the correct round count and expected final charge in the prediction choices.')
    }
  })
}

function collectionLessonIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { collectionLesson, intro, visual, guided, sequence, assignment, boolean, branchLesson, forLoop, whileLoop, functionLesson } = execution
  if (!collectionLesson) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/collectionLesson' + field, code: 'program-collection', message })
  if (intro || visual || guided || sequence || assignment || boolean || branchLesson || forLoop || whileLoop || functionLesson) {
    report('', 'Use only the list and dictionary presentation.')
  }
  const { cases, index, key } = collectionLesson
  const signatures = cases.map(({ batteries }) => JSON.stringify(batteries.map(({ name, charge }) => [name, charge])))
  if (new Set(signatures).size !== signatures.length) report('/cases', 'Use a different battery row in every case.')
  cases.forEach(({ batteries, expected, predictions }, caseIndex) => {
    const path = `/cases/${caseIndex}`
    const names = new Set(batteries.map(battery => battery.name))
    if (!batteries[index] || !names.has(key) || names.size !== batteries.length) {
      report(`${path}/batteries`, 'Give each battery a unique name and include the requested position and name.')
    }
    const recordsMatchNames = (record: Record<string, number>) => Object.keys(record).length === names.size
      && Object.keys(record).every(name => names.has(name))
    if (!recordsMatchNames(expected.records)) report(`${path}/expected/records`, 'Include a charge for each named battery.')
    if (caseIndex > 0 && (!predictions?.position.includes(expected.position) || !predictions.named.includes(expected.named)
      || !predictions.records.every(recordsMatchNames)
      || !predictions.records.some(record => collectionRecordsMatch(record, expected.records)))) {
      report(`${path}/predictions`, 'Include the correct reads and the correct updated record. Use the scenario’s names in all record choices.')
    }
  })
}

function dictionaryLessonIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { dictionaryLesson, intro, visual, guided, sequence, assignment, boolean, branchLesson, forLoop, whileLoop,
    functionLesson, collectionLesson, nestedLoops, moduleLesson, debugging, structures, listPositions, stackLesson, queueLesson } = execution
  if (!dictionaryLesson) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/dictionaryLesson' + field, code: 'program-dictionary-lesson', message })
  if (intro || visual || guided || sequence || assignment || boolean || branchLesson || forLoop || whileLoop
    || functionLesson || collectionLesson || nestedLoops || moduleLesson || debugging || structures || listPositions || stackLesson || queueLesson) {
    report('', 'Use only the dictionary registration presentation.')
  }
  const inputs = new Set<string>()
  dictionaryLesson.cases.forEach(({ batteries, key, arrival, increment, source, expected, predictions }, index) => {
    const path = `/cases/${index}`
    const signature = JSON.stringify(batteries.map(({ name, charge }) => [name, charge]))
    if (inputs.has(signature)) report(`${path}/batteries`, 'Choose a different set of batteries for every case.')
    inputs.add(signature)
    if (source && programSourceLines(source).length > 30) report(`${path}/source`, 'Use at most 30 lines for the program.')

    const names = new Set(batteries.map(battery => battery.name))
    const reading = batteries.find(battery => battery.name === key)?.charge
    if (names.size !== batteries.length || names.has(arrival.name) || reading === undefined) {
      report(path, 'Use unique names, look up a registered battery, and give the new battery a fresh name.')
      return
    }
    const records = Object.fromEntries([...batteries, arrival].map(({ name, charge }) => [name, charge]))
    records[key] = reading + increment
    if (expected.reading !== reading || !collectionRecordsMatch(expected.records, records)) {
      report(`${path}/expected`, 'Include the original reading, the new record, and the updated charge under the existing name.')
    }
    names.add(arrival.name)
    if (index > 0 && (!predictions?.readings.includes(expected.reading)
      || !predictions.records.some(choice => collectionRecordsMatch(choice, expected.records))
      || !predictions.records.every(choice => Object.keys(choice).every(name => names.has(name))))) {
      report(`${path}/predictions`, 'Provide both correct options and include only names from this case.')
    }
  })
}

function nestedLoopsIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { nestedLoops, intro, visual, guided, sequence, assignment, boolean, branchLesson, forLoop, whileLoop, functionLesson, collectionLesson } = execution
  if (!nestedLoops) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/nestedLoops' + field, code: 'program-nested-loops', message })
  if (intro || visual || guided || sequence || assignment || boolean || branchLesson || forLoop || whileLoop || functionLesson || collectionLesson) {
    report('', 'Use only the nested-loop presentation.')
  }
  const [demo, ...practice] = nestedLoops.cases
  if (!demo.rows.some(row => row.length > 0)) report('/cases/0/rows', 'Include a battery in the demonstration.')
  const inputs = new Set(nestedLoops.cases.map(({ rows }) => JSON.stringify(rows)))
  if (inputs.size !== nestedLoops.cases.length) report('/cases', 'Use a different battery layout for each case.')
  nestedLoops.cases.forEach(({ rows, expected }, index) => {
    if (expected.rounds !== rows.flat().length || expected.rows.length !== rows.length
      || expected.rows.some((row, position) => row.length !== rows[position].length)) {
      report(`/cases/${index}/expected`, 'Include one turn and one result for every battery and preserve the rows.')
    }
  })
  practice.forEach(({ expected, predictions }, index) => {
    if (!predictions?.rounds.includes(expected.rounds) || !predictions.rows.some(rows => nestedRowsMatch(rows, expected.rows))) {
      report(`/cases/${index + 1}/predictions`, 'Include the correct turn count and all correctly charged rows in the choices.')
    }
  })
}

function moduleLessonIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { moduleLesson, intro, visual, guided, sequence, assignment, boolean, branchLesson,
    forLoop, whileLoop, functionLesson, collectionLesson, nestedLoops, cases } = execution
  if (!moduleLesson) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/' + field, code: 'program-module', message })
  if (intro || visual || guided || sequence || assignment || boolean || branchLesson
    || forLoop || whileLoop || functionLesson || collectionLesson || nestedLoops) {
    report('moduleLesson', 'Use only the module presentation.')
  }
  if (programSourceLines(moduleLesson.source).length > 30) {
    report('moduleLesson/source', 'Use at most 30 lines in the module file.')
  }
  if (cases.length < 2 || cases.some(({ input }) => input < 0) || new Set(cases.map(({ input }) => input)).size !== cases.length) {
    report('cases', 'Provide distinct nonnegative charges for the demonstration and predictions.')
  }
  cases.forEach(({ input, expected, predictions }, index) => {
    if (expected !== String(input + moduleLesson.increment)) {
      report(`cases/${index}/expected`, 'Use the starting charge plus the configured increment as the expected output.')
    }
    if (index > 0 && (!predictions?.includes(expected) || predictions.some(value => !/^(?:0|[1-9]\d{0,4})$/u.test(value)))) {
      report(`cases/${index}/predictions`, 'Provide whole-number charge options including the correct output.')
    }
  })
}

function debuggingIssues(execution: ProgramWalkthrough, lines: string[], issues: Issue[]) {
  const { debugging, intro, visual, guided, sequence, assignment, boolean, branchLesson,
    forLoop, whileLoop, functionLesson, collectionLesson, nestedLoops, moduleLesson } = execution
  if (!debugging) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/debugging' + field, code: 'program-debugging', message })
  if (intro || visual || guided || sequence || assignment || boolean || branchLesson
    || forLoop || whileLoop || functionLesson || collectionLesson || nestedLoops || moduleLesson) {
    report('', 'Use only the debugging presentation.')
  }
  const { cases, loopLine, returnLine, increment } = debugging
  if (loopLine >= returnLine || !/^\s+for\b/u.test(lines[loopLine - 1] ?? '') || !/^\s+return\b/u.test(lines[returnLine - 1] ?? '')) {
    report('/returnLine', 'Point to the return statement inside the charging loop.')
  }
  if (cases[0].batteries.length !== 1 || cases[1].batteries.length < 2) {
    report('/cases', 'Start with one battery, then use a row of batteries to show the bug.')
  }
  if (new Set(cases.map(({ batteries }) => JSON.stringify(batteries))).size !== cases.length) {
    report('/cases', 'Use different batteries for each run.')
  }
  cases.forEach(({ batteries, expected, predictions }, index) => {
    if (expected.length !== batteries.length || expected.some((charge, position) => charge !== batteries[position] + increment)) {
      report(`/cases/${index}/expected`, 'Show the increased charge of each battery in its original order.')
    }
    if (index > 1 && !predictions?.some(result => result.length === expected.length
      && result.every((charge, position) => charge === expected[position]))) {
      report(`/cases/${index}/predictions`, 'Include the expected charges in the prediction choices.')
    }
  })
}

function structuresIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { structures, intro, visual, guided, sequence, assignment, boolean, branchLesson, forLoop, whileLoop,
    functionLesson, collectionLesson, nestedLoops, moduleLesson, debugging } = execution
  if (!structures) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/structures' + field, code: 'program-structures', message })
  if (intro || visual || guided || sequence || assignment || boolean || branchLesson || forLoop || whileLoop
    || functionLesson || collectionLesson || nestedLoops || moduleLesson || debugging) {
    report('', 'Use only the four-structures presentation.')
  }
  const { demo, practice, sources } = structures
  for (const [id, { batteries, index, key }] of Object.entries({ demo, practice })) {
    const names = new Set(batteries.map(({ name }) => name))
    if (names.size !== batteries.length || !names.has(key) || index >= batteries.length) {
      report(`/${id}`, 'Give each battery a unique name and include the requested index and key.')
    }
  }
  if (JSON.stringify(demo.batteries.map(({ name, charge }) => [name, charge])) === JSON.stringify(practice.batteries.map(({ name, charge }) => [name, charge]))) {
    report('/practice/batteries', 'Choose a different batch for prediction.')
  }
  if (new Set(practice.tasks.map(task => task.kind)).size !== structureKinds.length) {
    report('/practice/tasks', 'Provide one task for each of the four structures.')
  }
  for (const [kind, source] of Object.entries(sources)) {
    if (programSourceLines(source).length > 30) report(`/sources/${kind}`, 'Use at most 30 lines for each structure.')
  }
}

function listPositionsIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { listPositions, intro, visual, guided, sequence, assignment, boolean, branchLesson, forLoop, whileLoop,
    functionLesson, collectionLesson, nestedLoops, moduleLesson, debugging, structures } = execution
  if (!listPositions) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/listPositions' + field, code: 'program-list-positions', message })
  if (intro || visual || guided || sequence || assignment || boolean || branchLesson || forLoop || whileLoop
    || functionLesson || collectionLesson || nestedLoops || moduleLesson || debugging || structures) {
    report('', 'Use only the list position presentation.')
  }
  const rows = new Set<string>()
  listPositions.cases.forEach(({ batteries, spare, readIndex, insertIndex, removeIndex, pickIndex, expected, predictions }, index) => {
    const path = `/cases/${index}`
    const names = batteries.map(battery => battery.name)
    const available = new Set([...names, spare.name])
    if (available.size !== names.length + 1 || readIndex >= names.length || pickIndex >= names.length
      || insertIndex > names.length || removeIndex > names.length) {
      report(path, 'Give each battery a different name and use positions within the row at each operation.')
    }
    const signature = JSON.stringify(batteries.map(({ name, charge }) => [name, charge]))
    if (rows.has(signature)) report(`${path}/batteries`, 'Choose a different row for every case.')
    rows.add(signature)

    names.splice(insertIndex, 0, spare.name)
    names.splice(removeIndex, 1)
    if (expected.order.length !== names.length || expected.order.some((name, position) => name !== names[position])
      || expected.picked !== names[pickIndex]) {
      report(`${path}/expected`, 'Include the final order and the battery at the requested position.')
    }
    if (index > 0 && (!predictions?.picked.includes(expected.picked) || !predictions.picked.every(name => available.has(name))
      || !predictions.orders.every(order => order.length === names.length && order.every(name => available.has(name)))
      || !predictions.orders.some(order => order.length === expected.order.length && order.every((name, position) => name === expected.order[position])))) {
      report(`${path}/predictions`, 'Make both correct answers available and use batteries from this case in the choices.')
    }
  })
}

function batterySequenceIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { stackLesson, queueLesson, intro, visual, guided, sequence, assignment, boolean, branchLesson, forLoop, whileLoop,
    functionLesson, collectionLesson, nestedLoops, moduleLesson, debugging, structures, listPositions } = execution
  const lesson = queueLesson ?? stackLesson
  if (!lesson) return
  const queue = queueLesson !== undefined
  const report = (field: string, message: string) => issues.push({
    path: `/execution/${queue ? 'queueLesson' : 'stackLesson'}${field}`, code: queue ? 'program-queue-lesson' : 'program-stack-lesson', message,
  })
  if (intro || visual || guided || sequence || assignment || boolean || branchLesson || forLoop || whileLoop
    || functionLesson || collectionLesson || nestedLoops || moduleLesson || debugging || structures || listPositions || (stackLesson && queueLesson)) {
    report('', 'Use one battery sequence presentation.')
  }
  const seen = new Set<string>()
  const same = (left: string[], right: string[]) => left.length === right.length && left.every((name, index) => name === right[index])
  lesson.cases.forEach(({ batteries, operations, source, expected, predictions }, index) => {
    const path = `/cases/${index}`
    const names = new Set(batteries.map(battery => battery.name))
    if (names.size !== batteries.length) report(`${path}/batteries`, 'Give each battery a unique name.')
    const signature = JSON.stringify(batteries.map(({ name, charge }) => [name, charge]))
    if (seen.has(signature)) report(`${path}/batteries`, 'Choose a different set of batteries for every case.')
    seen.add(signature)
    if (source && programSourceLines(source).length > 30) report(`${path}/source`, 'Use at most 30 lines for each program.')

    const remaining: string[] = []
    const popped: string[] = []
    for (const [offset, operation] of operations.entries()) {
      if (operation.kind === 'push') {
        if (!names.has(operation.battery) || remaining.includes(operation.battery)) {
          report(`${path}/operations/${offset}`, 'Add an available battery from the bench.')
        }
        remaining.push(operation.battery)
      } else {
        const next = queue ? remaining.shift() : remaining.pop()
        if (next === undefined) report(`${path}/operations/${offset}`, 'Add a battery before taking one out.')
        else popped.push(next)
      }
    }
    if (!popped.length || !same(expected.popped, popped) || !same(expected.remaining, remaining)) {
      report(`${path}/expected`, queue ? 'Include the batteries taken in order and the remaining queue from front to back.'
        : 'Include the batteries taken in order and the remaining stack from bottom to top.')
    }
    if (index > 0 && (!predictions?.popped.some(order => same(order, expected.popped))
      || !predictions.remaining.some(order => same(order, expected.remaining))
      || ![...predictions.popped, ...predictions.remaining].every(order => order.every(name => names.has(name))))) {
      report(`${path}/predictions`, 'Include both correct orders and use batteries from this case.')
    }
  })
}

function binarySearchComparisons(size: number, targetIndex: number): number {
  let first = 0
  let last = size - 1
  let comparisons = 1
  let middle = Math.floor((first + last) / 2)
  while (middle !== targetIndex) {
    if (middle < targetIndex) first = middle + 1
    else last = middle - 1
    middle = Math.floor((first + last) / 2)
    comparisons++
  }
  return comparisons
}

function batterySearchIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { batterySearch, cases, ...otherPresentation } = execution
  if (!batterySearch) return
  const { binarySource, demo, practice } = batterySearch
  const report = (field: string, message: string) => issues.push({ path: '/execution/batterySearch' + field, code: 'program-battery-search', message })
  if (Object.keys(otherPresentation).some(field => field !== 'source') || cases.length) {
    report('', 'Use only the battery search presentation.')
  }
  if (programSourceLines(binarySource).length > 30) report('/binarySource', 'Use at most 30 lines for the program.')

  for (const [key, { batteries, target, expected }] of Object.entries({ demo, practice })) {
    const names = new Set(batteries.map(battery => battery.name))
    if (names.size !== batteries.length || batteries.some((battery, index) => index > 0 && battery.charge <= batteries[index - 1].charge)) {
      report('/' + key + '/batteries', 'Use unique battery names and charges in increasing order.')
    }
    const index = batteries.findIndex(battery => battery.charge === target)
    if (index < 0) {
      report('/' + key + '/target', 'Choose a charge in the battery row.')
    } else if (expected.battery !== batteries[index].name || expected.linear !== index + 1
      || expected.binary !== binarySearchComparisons(batteries.length, index)) {
      report('/' + key + '/expected', 'Provide the matching battery and the number of batteries checked by each method.')
    }
  }

  if (demo.manualOrder.length !== demo.batteries.length || !demo.batteries.every(battery => demo.manualOrder.includes(battery.name))) {
    report('/demo/manualOrder', 'Put each demonstration battery in the manual row exactly once.')
  }
  if (demo.target === practice.target && demo.batteries.length === practice.batteries.length
    && demo.batteries.every((battery, index) => battery.charge === practice.batteries[index].charge)) {
    report('/practice', 'Give the learner a fresh set of charges or a different target.')
  }
  for (const [method, options] of Object.entries(practice.predictions)) {
    const correct = method === 'linear' ? practice.expected.linear : practice.expected.binary
    if (!options.includes(correct) || options.some(option => option > practice.batteries.length)) {
      report('/practice/predictions/' + method, 'Include the expected count and keep counts within the number of available batteries.')
    }
  }
}

function firstBatterySearchExpected({ batteries, target }: FirstBatterySearchInput) {
  const ranges: BatterySearchRange[] = []
  let first = 0
  let last = batteries.length - 1
  let index = -1
  while (first <= last) {
    const middle = Math.floor((first + last) / 2)
    const { charge } = batteries[middle]
    if (charge === target) index = middle
    if (charge < target) first = middle + 1
    else last = middle - 1
    ranges.push([first, last])
  }
  return { ranges, index }
}

function firstBatterySearchIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { firstBatterySearch, cases, ...otherPresentation } = execution
  if (!firstBatterySearch) return
  const { firstSource, demo: { unique, repeated }, practice } = firstBatterySearch
  const report = (field: string, message: string) => issues.push({
    path: '/execution/firstBatterySearch' + field, code: 'program-first-battery-search', message,
  })
  if (Object.keys(otherPresentation).some(field => field !== 'source') || cases.length) {
    report('', 'Use only the first-battery-search presentation.')
  }
  if (programSourceLines(firstSource).length > 30) report('/firstSource', 'Use at most 30 lines for the program.')

  for (const [path, row, minimumMatches] of [
    ['/demo/unique', unique, 1], ['/demo/repeated', repeated, 2], ['/practice', practice, 2],
  ] as const) {
    const { batteries, target } = row
    const names = new Set(batteries.map(battery => battery.name))
    const strictlyIncreasing = path === '/demo/unique'
    if (names.size !== batteries.length || batteries.some(({ charge }, index) => index > 0
      && (charge < batteries[index - 1].charge || (strictlyIncreasing && charge === batteries[index - 1].charge)))) {
      report(path + '/batteries', strictlyIncreasing
        ? 'Use distinct names and strictly increasing charges for the first demonstration.'
        : 'Use distinct names and charges in nondecreasing order.')
    }
    if (batteries.filter(battery => battery.charge === target).length < minimumMatches) {
      report(path + '/target', minimumMatches === 1 ? 'Choose a charge in the row.' : 'Choose a charge shared by at least two batteries.')
    }
  }

  const uniqueNames = new Set(unique.batteries.map(battery => battery.name))
  const retained = repeated.batteries.filter(battery => uniqueNames.has(battery.name))
  const added = repeated.batteries.filter(battery => !uniqueNames.has(battery.name))
  if (unique.target !== repeated.target || retained.length !== unique.batteries.length || !added.length
    || retained.some(({ name, charge }, index) => name !== unique.batteries[index].name || charge !== unique.batteries[index].charge)
    || added.some(battery => battery.charge !== repeated.target)) {
    report('/demo/repeated', 'Keep the original row and target, and add batteries that share the target charge.')
  }

  if (repeated.target === practice.target && repeated.batteries.length === practice.batteries.length
    && repeated.batteries.every(({ charge }, index) => charge === practice.batteries[index].charge)) {
    report('/practice', 'Give the learner a fresh row or a different target.')
  }

  const expected = firstBatterySearchExpected(practice)
  if (practice.expected.index !== expected.index || !nestedRowsMatch(practice.expected.ranges, expected.ranges)) {
    report('/practice/expected', 'Provide the actual post-update ranges and the first matching battery index.')
  }
  const { ranges } = practice.predictions
  const size = practice.batteries.length
  if (!ranges.some(option => nestedRowsMatch(option, expected.ranges))
    || ranges.some(option => option.some(([first, last]) => first < 0 || first > size || last >= size || first > last + 1))) {
    report('/practice/predictions/ranges', 'Use valid ranges for this row and include the actual series of ranges.')
  }
}

function selectionSortIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { selectionSort, cases, ...otherPresentation } = execution
  if (!selectionSort) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/selectionSort' + field, code: 'program-selection-sort', message })
  if (Object.keys(otherPresentation).some(field => field !== 'source') || cases.length) {
    report('', 'Use only the selection sort presentation.')
  }

  const { demo, practice } = selectionSort
  for (const [key, { batteries, expected }] of Object.entries({ demo, practice })) {
    if (new Set(batteries.map(battery => battery.name)).size !== batteries.length) {
      report('/' + key + '/batteries', 'Use a different name for each battery.')
    }
    if (batteries.every((battery, index) => index === 0 || batteries[index - 1].charge <= battery.charge)) {
      report('/' + key + '/batteries', 'Begin with a battery row that needs sorting.')
    }

    const row = [...batteries]
    for (let start = 0; start < row.length - 1; start++) {
      let minimum = start
      for (let index = start + 1; index < row.length; index++) {
        if (row[index].charge < row[minimum].charge) minimum = index
      }
      const first = row[start]
      row[start] = row[minimum]
      row[minimum] = first
    }
    const order = row.map(battery => battery.name)
    if (!dispatchOrdersMatch(expected.order, order) || !dispatchOrdersMatch(expected.selected, order.slice(0, -1))) {
      report('/' + key + '/expected', 'Provide the minimum names for each pass and the resulting order after the swaps.')
    }
  }

  if (demo.batteries.length === practice.batteries.length
    && demo.batteries.every(({ charge }, index) => charge === practice.batteries[index].charge)) {
    report('/practice', 'Give the learner a different starting row of charges.')
  }
}

function twoPointerIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { twoPointerLesson, cases, ...otherPresentation } = execution
  if (!twoPointerLesson) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/twoPointerLesson' + field, code: 'program-two-pointer', message })
  if (Object.keys(otherPresentation).some(field => field !== 'source') || cases.length) {
    report('', 'Use only the two-pointer presentation.')
  }

  const { demo, practice } = twoPointerLesson
  for (const [key, { batteries, target, expected }] of Object.entries({ demo, practice })) {
    const names = new Set(batteries.map(battery => battery.name))
    if (names.size !== batteries.length || batteries.some((battery, index) => index > 0 && battery.charge < batteries[index - 1].charge)) {
      report('/' + key + '/batteries', 'Use unique battery names and put the charges in nondecreasing order.')
      continue
    }

    let left = 0
    let right = batteries.length - 1
    const moves: TwoPointerMove[] = []
    while (left < right) {
      const total = batteries[left].charge + batteries[right].charge
      if (total === target) break
      if (total < target) {
        moves.push('left')
        left++
      } else {
        moves.push('right')
        right--
      }
    }

    if (left === right) {
      report('/' + key + '/target', 'Choose a total that two different batteries can make.')
    } else if (!dispatchOrdersMatch(expected.moves, moves)
      || !dispatchOrdersMatch(expected.pair, [batteries[left].name, batteries[right].name])) {
      report('/' + key + '/expected', 'Provide the sequence of inward moves and the two battery names in left-to-right order.')
    }
  }

  if (demo.target === practice.target && demo.batteries.length === practice.batteries.length
    && demo.batteries.every(({ charge }, index) => charge === practice.batteries[index].charge)) {
    report('/practice', 'Give the learner a new battery row or a different target.')
  }
}

function prefixTotalsIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { prefixTotalsLesson, cases, ...otherPresentation } = execution
  if (!prefixTotalsLesson) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/prefixTotalsLesson' + field, code: 'program-prefix-totals', message })
  if (Object.keys(otherPresentation).some(field => field !== 'source') || cases.length) {
    report('', 'Use only the prefix totals presentation.')
  }

  const { demo, practice } = prefixTotalsLesson
  for (const [key, { batteries }] of Object.entries({ demo, practice })) {
    if (new Set(batteries.map(battery => battery.name)).size !== batteries.length) {
      report('/' + key + '/batteries', 'Use unique battery names.')
    }
  }

  const charges = practice.batteries.map(({ charge }) => charge)
  const sameRow = (left: number[], right: number[]) =>
    left.length === right.length && left.every((value, index) => value === right[index])
  if (sameRow(demo.batteries.map(({ charge }) => charge), charges)) {
    report('/practice/batteries', 'Give the learner a new row of battery charges.')
  }
  if (practice.left > practice.right || practice.right >= charges.length) {
    report('/practice', 'Choose an inclusive interval within the battery row.')
    return
  }

  const prefix = [0]
  for (const charge of charges) prefix.push(prefix.at(-1)! + charge)
  const total = prefix[practice.right + 1] - prefix[practice.left]
  if (!sameRow(practice.expected.prefix, prefix) || practice.expected.total !== total) {
    report('/practice/expected', 'Provide the prefix row with its opening zero and the inclusive interval total.')
  }

  const predictions = practice.predictions
  if (predictions.prefix.some(row => row.length !== prefix.length) || !predictions.prefix.some(row => sameRow(row, prefix))) {
    report('/practice/predictions/prefix', 'Supply a value for each prefix position and include the correct row.')
  }
  if (!predictions.totals.includes(total)) {
    report('/practice/predictions/totals', 'Include the actual interval total.')
  }
}

function breadthFirstLessonIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { breadthFirstLesson, cases, ...otherPresentation } = execution
  if (!breadthFirstLesson) return
  const report = (path: string, message: string) => issues.push({
    path: '/execution/breadthFirstLesson' + path, code: 'program-breadth-first', message,
  })
  if (Object.keys(otherPresentation).some(field => field !== 'source') || cases.length) {
    report('', 'Use only the breadth-first search presentation.')
  }

  const { demo, practice } = breadthFirstLesson
  function hasRoute({ tiles, start, goal }: BreadthFirstMap, path: string) {
    if (!tiles.every(row => row.length === tiles[0].length)) {
      report(path + '/tiles', 'Make all rows the same width.')
      return
    }
    if (!walkableBreadthCell(tiles, start) || !walkableBreadthCell(tiles, goal)) {
      report(path, 'Put both the start and battery on walkable cells.')
      return
    }
    const result = breadthFirstReference({ tiles, start, goal })
    if (!result.path.length) {
      report(path, 'Give Sprout a route to the battery.')
      return
    }
    return result
  }

  hasRoute(demo, '/demo')
  const { tiles, start, goal, expected, predictions } = practice
  const result = hasRoute(practice, '/practice')
  if (!result) return
  if (tiles.length === demo.tiles.length && tiles.every((row, index) => row === demo.tiles[index])
    && sameBreadthCell(start, demo.start) && sameBreadthCell(goal, demo.goal)) {
    report('/practice', 'Choose a different map, start, or battery position for the prediction.')
  }
  if (!nestedRowsMatch(expected.order, result.order) || !nestedRowsMatch(expected.path, result.path)) {
    report('/practice/expected', 'Provide the dequeue order and route chosen by the up, right, down, left search.')
  }

  const onFloor = (cells: BreadthCell[]) => cells.every(cell => walkableBreadthCell(tiles, cell))
  const adjacentFromStartToGoal = (cells: BreadthCell[]) =>
    sameBreadthCell(cells[0], start) && sameBreadthCell(cells.at(-1), goal)
    && cells.every(([x, y], index) => index === 0 || Math.abs(x - cells[index - 1][0]) + Math.abs(y - cells[index - 1][1]) === 1)

  if (!predictions.orders.some(option => nestedRowsMatch(option, result.order))
    || predictions.orders.some(option => !onFloor(option) || new Set(option.map(cell => cell.join(','))).size !== option.length)) {
    report('/practice/predictions/orders', 'Use distinct walkable cells in each order and include the actual dequeue sequence.')
  }
  if (!predictions.paths.some(option => nestedRowsMatch(option, result.path))
    || predictions.paths.some(option => !onFloor(option) || !adjacentFromStartToGoal(option))) {
    report('/practice/predictions/paths', 'Use walkable routes through adjacent cells and include the actual route.')
  }
}

function variableCupIssues({ variableCups, cases, source, ...otherModes }: ProgramWalkthrough, issues: Issue[]) {
  if (!variableCups) return
  const report = (field: string, message: string) => issues.push({ path: '/execution/' + field, code: 'variable-cups', message })
  const { addresses, variable, snapshot } = variableCups
  if (Object.keys(otherModes).length || variable === snapshot) {
    report('variableCups', 'Give the two name tags different names and use the cup presentation on its own.')
  }
  if (addresses.some((address, i) => i > 0 && address !== addresses[i - 1] + 1)) {
    report('variableCups/addresses', 'Number the cup positions consecutively from left to right.')
  }
  if (cases[0] && addresses.includes(cases[0].input)) {
    report('cases/0/input', 'Use a demonstration reading different from every address so the two read choices are distinct.')
  }
  const program = programSourceLines(source).filter(line => line.trim() && !line.trimStart().startsWith('#'))
  const operations = [
    `${variable}=scan()`, `say(str(${variable}))`, `${snapshot}=${variable}`, `${variable}=0`, `say(str(${snapshot}))`,
  ]
  if (program.length !== operations.length || program.some((line, i) => line.replace(/\s+/gu, '') !== operations[i])) {
    report('source', 'Read and display the first number, remember it under the second name, set the first to zero, then display the remembered number.')
  }
  if (cases.length < 2 || new Set(cases.map(sample => sample.input)).size !== cases.length) {
    report('cases', 'Offer a fresh starting number for the prediction.')
  }
  cases.forEach(({ input, expected, predictions }, i) => {
    if (input <= 0 || expected !== String(input)) report('cases/' + i, 'Use a positive charge and keep the original reading as the remembered value.')
    if (i && (!predictions?.includes(expected) || !predictions.includes('0') || predictions.some(value => !/^(0|[1-9]\d*)$/u.test(value)))) {
      report('cases/' + i + '/predictions', 'Offer numeric choices that include zero and the remembered number.')
    }
  })
}

function walkthroughIssues(execution: ProgramWalkthrough, issues: Issue[]) {
  const { intro, visual, source, guided, sequence, assignment, functionLesson, cases } = execution
  const lines = programSourceLines(source)
  if (lines.length > 30) issues.push({ path: '/execution/source', code: 'program-walkthrough', message: 'Use at most 30 lines in a program walkthrough.' })
  if (intro && (visual || (intro.mode === 'basics' && intro.interface))) {
    issues.push({ path: '/execution/intro', code: 'program-intro', message: 'Use one presentation and choose an interface only for interface lessons.' })
  }
  if (intro?.mode === 'interfaces' && (intro.interface ?? 'cli') === 'cli' && !intro.command) {
    issues.push({ path: '/execution/intro/command', code: 'program-command', message: 'Provide a command for the command-line lesson.' })
  }
  if (guided && (intro || !visual)) {
    issues.push({ path: '/execution/guided', code: 'program-guided', message: 'Use the guided trace with visual steps.' })
  }
  if (functionLesson && (!guided || visual?.functions.length !== 1 || visual.functions[0].id !== functionLesson.functionName
    || functionLesson.parameter === functionLesson.resultVariable)) {
    issues.push({ path: '/execution/functionLesson', code: 'program-function',
      message: 'Use a guided trace for the named function and give its parameter and return destination different names.' })
  }
  if (assignment && (intro || guided || visual || sequence || assignment.inputVariable === assignment.resultVariable)) {
    issues.push({ path: '/execution/assignment', code: 'program-assignment', message: 'Use only the assignment presentation and two different variable names.' })
  }
  if (assignment && programSourceLines(assignment.overwriteSource).length > 30) {
    issues.push({ path: '/execution/assignment/overwriteSource', code: 'program-walkthrough', message: 'Use at most 30 lines in a program walkthrough.' })
  }
  if (guided || assignment) {
    if (cases.length < 2 || new Set(cases.map(({ input }) => input)).size !== cases.length) {
      issues.push({ path: '/execution/cases', code: 'program-inputs', message: 'Provide a different input for the prediction.' })
    }
    const predictsInput = assignment || functionLesson
    cases.slice(1).forEach(({ predictions, expected, input }, index) => {
      const requiredChoices = predictsInput ? [expected, String(input)] : [expected]
      if (!requiredChoices.every(choice => predictions?.includes(choice))) {
        issues.push({
          path: `/execution/cases/${index + 1}/predictions`,
          code: predictsInput ? 'program-assignment-input' : 'program-predictions',
          message: predictsInput ? 'Include the starting charge and the expected result.' : 'Include the expected output among the predictions.',
        })
      }
    })
  }
  variableCupIssues(execution, issues)
  sequenceIssues(execution, issues)
  booleanIssues(execution, issues)
  branchLessonIssues(execution, issues)
  forLoopIssues(execution, issues)
  whileLoopIssues(execution, issues)
  collectionLessonIssues(execution, issues)
  dictionaryLessonIssues(execution, issues)
  nestedLoopsIssues(execution, issues)
  moduleLessonIssues(execution, issues)
  debuggingIssues(execution, lines, issues)
  structuresIssues(execution, issues)
  listPositionsIssues(execution, issues)
  batterySequenceIssues(execution, issues)
  batterySearchIssues(execution, issues)
  firstBatterySearchIssues(execution, issues)
  selectionSortIssues(execution, issues)
  twoPointerIssues(execution, issues)
  prefixTotalsIssues(execution, issues)
  breadthFirstLessonIssues(execution, issues)
  if (!visual) return
  const report = (path: string, message: string) => issues.push({ path: '/execution/visual' + path, code: 'program-visual', message })
  if (!guided && !sequence && !visual.practice.length) report('/practice', 'Provide at least one ordering practice.')
  const hasCode = (line: string) => Boolean(line.trim()) && !line.trimStart().startsWith('#')
  const blocks = programGraphics(visual)
  const mappedLines = new Set(blocks.map(block => block.line))
  const functions = new Set(visual.functions.map(group => group.id))
  if (new Set(blocks.map(block => block.id)).size !== blocks.length || functions.size !== visual.functions.length) {
    report('/', 'Graphic and function IDs must each be unique.')
  }
  if (mappedLines.size !== blocks.length || lines.some((line, index) => hasCode(line) !== mappedLines.has(index + 1))
    || blocks.some(block => block.line > lines.length)) {
    report('/', 'Map exactly one graphic to each line of code.')
  }
  if (blocks.some(block => block.calls && !functions.has(block.calls))) report('/', 'Calls must point to a configured function.')
  const mainLines = lines.flatMap((line, index) => hasCode(line) && !/^\s|^def\b/u.test(line) ? [index + 1] : [])
  if (visual.main.length !== mainLines.length || visual.main.some((block, index) => block.line !== mainLines[index])) {
    report('/main', 'List main program lines in source order.')
  }
  visual.functions.forEach(({ id, header, steps }, index) => {
    const name = /^def\s+(\w+)\s*\(/u.exec(lines[header.line - 1] ?? '')?.[1]
    const body: number[] = []
    for (let next = header.line; next < lines.length; next++) {
      if (!hasCode(lines[next])) continue
      if (!/^\s/u.test(lines[next])) break
      body.push(next + 1)
    }
    if (name !== id || steps.length !== body.length || steps.some((block, position) => block.line !== body[position])) {
      report(`/functions/${index}`, 'Match the function name and its indented lines in source order.')
    }
  })
  visual.practice.forEach(({ order }, index) => {
    if (!isProgramOrder(visual.main, order) || visual.main.every((block, position) => block.id === order[position])) {
      report(`/practice/${index}/order`, 'Shuffle the main program graphics for this practice.')
    }
  })
}

function isChargeRows(value: Json | undefined): value is number[][] {
  return Array.isArray(value) && value.length <= 4 && value.every(row => Array.isArray(row) && row.length <= 6
    && row.every(charge => typeof charge === 'number' && Number.isSafeInteger(charge) && charge >= 0 && charge <= 20000))
}

function chargingChallengeIssues(level: AlgorithmLevel, issues: Issue[]) {
  if (!level.chargingChallenge) return
  const { trialCase, predictions } = level.chargingChallenge
  const report = (path: string, message: string) => issues.push({ path, code: 'charging-challenge', message })
  if (level.stage !== 'challenge' || level.topic || level.helpers?.length !== 1) {
    report('/chargingChallenge', 'Use an optional challenge with one earlier charging helper.')
  }
  const trial = level.cases[trialCase]?.args[0]
  if (!isChargeRows(trial) || trial.filter(row => row.length > 0).length < 2) {
    report('/chargingChallenge/trialCase', 'Choose a small trial with at least two populated rows.')
  }
  level.cases.forEach(({ args, expected }, index) => {
    const [rows, added] = args
    if (args.length !== 2 || !isChargeRows(rows) || typeof added !== 'number' || !Number.isSafeInteger(added)
      || added < 0 || added > 1000 || !isChargeRows(expected)
      || !nestedRowsMatch(expected, rows.map(row => row.map(charge => charge + added)))) {
      report(`/cases/${index}`, 'Provide an array of rows, the amount to add, and every new charge in row order.')
    }
  })
  const used = new Set([trialCase])
  predictions.forEach(({ caseIndex, options }, index) => {
    const expected = level.cases[caseIndex]?.expected
    if (used.has(caseIndex) || !isChargeRows(expected) || !options.some(option => nestedRowsMatch(option, expected))) {
      report(`/chargingChallenge/predictions/${index}`, 'Use a fresh test case and include its charged rows in the options.')
    }
    used.add(caseIndex)
  })
}

function dispatchExpectation({ arrivals, records, increment, actions }: DispatchCase): DispatchResult | undefined {
  const names = new Set(arrivals)
  if (names.size !== arrivals.length || names.size === 0 || names.size > 7 || Object.keys(records).length !== names.size
    || arrivals.some(name => !Object.hasOwn(records, name)) || actions.length > 2 * arrivals.length) return undefined

  const stack: string[] = []
  const order: string[] = []
  const finalRecords = { ...records }
  let nextArrival = 0
  for (const action of actions) {
    if (action === 'stage') {
      const name = arrivals[nextArrival++]
      if (name === undefined) return undefined
      stack.push(name)
    } else {
      const name = stack.pop()
      if (name === undefined) return undefined
      order.push(name)
      finalRecords[name] += increment
    }
  }
  if (order.length) return { order, records: finalRecords }
}

function batteryDispatchIssues(level: AlgorithmLevel, issues: Issue[]) {
  if (!level.batteryDispatch) return
  const { trialCase, predictions } = level.batteryDispatch
  const report = (path: string, message: string) => issues.push({ path, code: 'battery-dispatch', message })
  if (level.stage !== 'challenge' || !level.unit || level.topic || level.chargingChallenge) {
    report('/batteryDispatch', 'Use a standalone optional challenge within a unit.')
  }
  const cases = level.cases.map(readDispatchCase)
  if ((cases[trialCase]?.arrivals.length ?? 0) < 2) {
    report('/batteryDispatch/trialCase', 'Choose a trial with at least two batteries.')
  }
  const expected = level.cases.map(({ expected }, index) => {
    const result = readDispatchResult(expected)
    const sample = cases[index]
    const required = sample && dispatchExpectation(sample)
    if (!result || !required || !dispatchOrdersMatch(result.order, required.order)
      || !collectionRecordsMatch(result.records, required.records)) {
      report(`/cases/${index}`, 'Provide named batteries, starting charges, a charging amount, and valid queue and stack actions with their expected results.')
      return undefined
    }
    return result
  })

  const used = new Set([trialCase])
  predictions.forEach(({ caseIndex, orders, records }, index) => {
    const result = expected[caseIndex]
    const sample = cases[caseIndex]
    const path = `/batteryDispatch/predictions/${index}`
    if (used.has(caseIndex) || !sample || !result) {
      report(path, 'Choose a valid new case for this prediction.')
      return
    }
    used.add(caseIndex)
    if (!orders.some(option => dispatchOrdersMatch(option, result.order))
      || orders.some(option => option.length !== result.order.length || option.some(name => !sample.arrivals.includes(name)))) {
      report(path + '/orders', 'Give possible pickup orders using this case’s names and include its actual order.')
    }
    if (!records.some(option => collectionRecordsMatch(option, result.records))
      || records.some(option => Object.keys(option).length !== sample.arrivals.length
        || sample.arrivals.some(name => !Object.hasOwn(option, name)))) {
      report(path + '/records', 'Give charge records for this batch’s names and include its actual final records.')
    }
  })
}

function sameCharges(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((charge, index) => charge === right[index])
}

function batteryPipelineExpectation({ values, target, left, right }: BatteryPipelineCase) {
  const ordered = values.toSorted((a, b) => a - b)
  let low = 0
  let high = ordered.length - 1
  while (low < high) {
    const combined = ordered[low] + ordered[high]
    if (combined === target) break
    if (combined < target) low++
    else high--
  }
  return {
    ordered,
    pair: low < high ? [ordered[low], ordered[high]] : [],
    total: ordered.slice(left, right + 1).reduce((sum, charge) => sum + charge, 0),
  }
}

function batteryPipelineIssues(level: AlgorithmLevel, issues: Issue[]) {
  if (!level.batteryPipeline) return
  const { trialCase, prediction } = level.batteryPipeline
  const report = (path: string, message: string) => issues.push({ path, code: 'battery-pipeline', message })
  if (level.stage !== 'challenge' || !level.unit || level.topic || level.chargingChallenge || level.batteryDispatch) {
    report('/batteryPipeline', 'Use a standalone optional challenge within a unit.')
  }
  if (level.helpers?.length !== batteryPipelineHelpers.length
    || batteryPipelineHelpers.some(name => !level.helpers?.includes(name))) {
    report('/helpers', 'Include sort_ascending, sorted_has_pair, and prefix_totals.')
  }
  const samples = level.cases.map((scenario, index) => {
    const input = readBatteryPipelineCase(scenario)
    const actual = readBatteryPipelineResult(scenario.expected)
    if (input && actual) {
      const expected = batteryPipelineExpectation(input)
      if (sameCharges(actual.ordered, expected.ordered) && sameCharges(actual.pair, expected.pair) && actual.total === expected.total) {
        return { input, expected }
      }
    }
    report('/cases/' + index, 'Provide a battery row, a target pair sum, and inclusive bounds on the sorted row with their expected results.')
    return undefined
  })
  const trial = samples[trialCase]
  const fresh = samples[prediction.caseIndex]
  const path = '/batteryPipeline/prediction'
  if (!trial?.expected.pair.length) {
    report('/batteryPipeline/trialCase', 'Choose a trial with a matching pair of batteries.')
  }
  if (!fresh?.expected.pair.length || prediction.caseIndex === trialCase
    || (trial && sameCharges(trial.input.values, fresh.input.values))) {
    report(path + '/caseIndex', 'Choose a new row with a matching pair for prediction.')
    return
  }
  const { input, expected } = fresh
  if (!prediction.orders.some(order => sameCharges(order, expected.ordered))
    || prediction.orders.some(order => !sameCharges(order.toSorted((a, b) => a - b), expected.ordered))) {
    report(path + '/orders', 'Use the same batteries in each option and include the correct sorted row.')
  }
  if (!prediction.pairs.some(pair => sameCharges(pair, expected.pair)) || prediction.pairs.some(pair => {
    if (pair.length === 0) return false
    const [low, high] = pair
    return pair.length !== 2 || low > high || !input.values.includes(low) || !input.values.includes(high)
      || (low === high && input.values.filter(charge => charge === low).length < 2)
  })) {
    report(path + '/pairs', 'Use two available batteries in ascending order and include the matching pair.')
  }
  if (!prediction.totals.includes(expected.total)) {
    report(path + '/totals', 'Include the actual charge total within the two bounds.')
  }
}

export function validateLevel(value: unknown): { level?: Level; issues: Issue[] } {
  const kind = value && typeof value === 'object' && 'kind' in value ? value.kind : undefined
  const validator = validators.get(kind as Level['kind'])
  if (!validator) {
    return { issues: [{ path: '/kind', code: 'kind', message: 'Choose a supported level kind: ' + kinds.join(', ') + '.' }] }
  }
  try {
    if (!validator(value)) {
      return { issues: (validator.errors ?? []).slice(0, 24).map(error => ({
        path: error.instancePath + (error.keyword === 'required' ? '/' + error.params.missingProperty : '') || '/',
        code: 'schema-' + error.keyword,
        message: error.message ?? 'Invalid value.',
      })) }
    }
  } catch {
    return { issues: [{ path: '/', code: 'complexity', message: 'The JSON is nested too deeply.' }] }
  }
  const level = value as Level
  const issues: Issue[] = []
  switch (level.kind) {
    case 'grid': gridIssues(level, issues); break
    case 'ai': aiIssues(level, issues); break
    case 'arena':
      arenaIssues(level, '', issues)
      level.variants?.forEach((variant, index) => arenaIssues({ ...level, ...variant }, '/variants/' + index, issues))
      break
    case 'circuit': circuitIssues(level, issues); break
    case 'machine': machineIssues(level, issues); break
    case 'arduino': issues.push(...arduinoIssues(level)); break
    case 'breadboard': issues.push(...breadboardIssues(level)); break
    case 'data': dataIssues(level, issues); break
    case 'vision': visionIssues(level, issues); break
    case 'algorithm':
      if (level.pathGrading === 'shortest') level.cases.forEach(({ args, expected }, index) => {
        const map = readRouteMap(args)
        if (!map || !isShortestRoute(map, expected)) issues.push({ path: '/cases/' + index, code: 'shortest-path-case',
          message: 'Use a rectangular map, floor coordinates for the start and goal, and a shortest reference route (empty if unreachable).' })
      })
      if (level.helpers?.includes(level.functionName)) {
        issues.push({ path: '/helpers', code: 'self-helper', message: 'A function cannot use itself as a course helper.' })
      }
      chargingChallengeIssues(level, issues)
      batteryDispatchIssues(level, issues)
      batteryPipelineIssues(level, issues)
      break
    case 'lecture':
      if (level.overview && (!level.unit || level.topic || !(level.animation || level.execution))) {
        issues.push({ path: '/overview', code: 'course-overview', message: 'A course overview needs a unit and an animation or execution, without a topic.' })
      }
      if (level.execution) walkthroughIssues(level.execution, issues)
      if (level.animation?.hardware) {
        const { hardware, frames } = level.animation
        const states = hardware.kind === 'cpu' ? hardware.checkpoints : hardware.frames
        if (states.length !== frames.length) {
          issues.push({ path: '/animation/hardware', code: 'hardware-frames', message: 'Use one hardware state per caption.' })
        }
        if (hardware.kind === 'circuit') {
          hardware.frames.forEach((frame, i) => {
            const valid = hardware.mode === 'logic' ? frame.bits.length === 2 && !!frame.gate && frame.bitIndex === undefined
              : !frame.gate && frame.bitIndex !== undefined && frame.bitIndex < frame.bits.length
            if (!valid) issues.push({ path: '/animation/hardware/frames/' + i, code: 'hardware-frame', message: 'Provide two inputs and a gate, or an index within the binary switch bank.' })
          })
        }
      }
      if (level.animation?.workstation && (!level.execution?.cases.length ||
        level.animation.workstation.checkpoints.length !== level.animation.frames.length ||
        level.animation.workstation.checkpoints.some(({ line }) => line > programSourceLines(level.execution!.source).length))) {
        issues.push({ path: '/animation/workstation', code: 'workstation-trace', message: 'Provide an executable example and one source checkpoint per animation frame.' })
      }
      level.animation?.frames.forEach(({ items }, index) => {
        if (new Set(items.map(item => item.id)).size !== items.length) {
          issues.push({ path: '/animation/frames/' + index + '/items', code: 'duplicate-id', message: 'Animation item IDs must be unique within a frame.' })
        }
        const plot = level.animation?.plot
        items.forEach(({ box }, itemIndex) => {
          if (box && (!plot || box[0] + box[2] > plot.columns || box[1] + box[3] > plot.rows)) {
            issues.push({ path: '/animation/frames/' + index + '/items/' + itemIndex + '/box', code: 'animation-box',
              message: 'Place the box within the configured plot.' })
          }
        })
      })
      if (level.question.correct >= level.question.options.length) {
        issues.push({ path: '/question/correct', code: 'question-answer', message: 'The answer index must point to one of the options.' })
      }
      break
    case 'replay':
      if (level.mode === 'grid') level.examples.forEach((example, index) => scenarioIssues(example.scenario, '/examples/' + index + '/scenario', issues))
      else aiIssues(level.example, issues)
      break
  }
  return issues.length ? { issues } : { level, issues }
}

export function parseLevel(content: string): { level?: Level; issues: Issue[] } {
  if (new TextEncoder().encode(content).length > MAX_LEVEL_BYTES) {
    return { issues: [{ path: '/', code: 'size', message: 'Level files must be at most 256 KiB.' }] }
  }
  try {
    return validateLevel(JSON.parse(content.replace(/^\uFEFF/, '')))
  } catch {
    return { issues: [{ path: '/', code: 'json', message: 'This file is not valid JSON.' }] }
  }
}
