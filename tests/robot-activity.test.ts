import assert from 'node:assert/strict'
import test from 'node:test'
import { createStationModels } from '../src/web/station3d/models'
import { createRobotSignals } from '../src/web/station3d/robotActivity'
import { flowActivity, type StationAction } from '../src/web/station3d/types'
import { describeFlow } from '../src/web/stationFlowCue'

test('seeking back to a scan restores the head and both arms after a delivery or a failed action', () => {
  const models = createStationModels()
  try {
    const robot = models.robot()
    const head = robot.getObjectByName('sprout-helmet')!
    const arm = robot.getObjectByName('sprout-arm-1')!
    const otherArm = robot.getObjectByName('sprout-arm--1')!
    models.gesture(robot, 'scan', .25)
    const before = [head, arm, otherArm].map(joint => joint.quaternion.toArray())
    assert.ok(head.rotation.y < 0)
    models.gesture(robot, 'scan', .74)
    assert.ok(head.rotation.y > 0)
    models.gesture(robot, 'submit', .30)
    const early = [arm.rotation.x, otherArm.rotation.x]
    models.gesture(robot, 'submit', .70)
    assert.ok(arm.rotation.x < early[0] && otherArm.rotation.x < early[1])
    models.gesture(robot, 'failed', .58)
    models.gesture(robot, 'scan', .25)
    assert.deepEqual([head, arm, otherArm].map(joint => joint.quaternion.toArray()), before)
  } finally { models.dispose() }
})

test('handing a packet out and taking one in move in opposite directions', () => {
  const effects = createRobotSignals()
  try {
    function visible() {
      const props = effects.group.children.filter(object => object.visible)
      assert.equal(props.length, 1)
      return props[0]
    }
    effects.show('submit', .25)
    const packet = visible()
    const near = packet.position.z
    effects.show('submit', .75)
    assert.ok(packet.position.z > near)
    effects.show('load', .25)
    assert.equal(visible(), packet)
    const far = packet.position.z
    effects.show('load', .75)
    assert.ok(packet.position.z < far)
    effects.show('failed', .45)
    assert.notEqual(visible(), packet)
    effects.show('scan', .45)
    assert.notEqual(visible(), packet)
  } finally { effects.dispose() }
})

test('every scene command changes the rig and control directions remain visible at rest', () => {
  const models = createStationModels()
  const signals = createRobotSignals()
  try {
    const robot = models.robot()
    const joints = ['sprout-helmet', 'sprout-arm--1', 'sprout-arm-1'].map(name => robot.getObjectByName(name)!)
    const pose = () => joints.map(joint => joint.quaternion.toArray())
    const rest = pose()
    // Covers the complete command union, including movement which uses the walking rig.
    const commands: Record<StationAction, true> = { scan: true, read_map: true, move: true, pick: true,
      say: true, wait: true, load: true, store: true, step: true, submit: true, if: true, for: true,
      while: true, call: true, return: true, break: true, continue: true }
    for (const action of Object.keys(commands) as StationAction[]) {
      if (action === 'move') models.pose(robot, 'walk', .12)
      else {
        models.gesture(robot, action, .47)
        signals.show(action, .47)
        assert.equal(signals.group.children.filter(p => p.visible).length, 1, action)
      }
      assert.notDeepEqual(pose(), rest, action)
    }
    for (const action of ['if', 'for', 'while'] as const) {
      models.gesture(robot, action, .47, true)
      const active = pose()
      models.gesture(robot, action, .47, false)
      assert.notDeepEqual(pose(), active, action)
    }
    signals.show('call', .25)
    const stack = signals.group.children.find(child => child.visible)!
    const earlyHeight = stack.children[1].position.y
    signals.show('call', .75)
    assert.ok(stack.children[1].position.y < earlyHeight)
    signals.show('return', .75)
    assert.equal(stack.children[1].position.y, earlyHeight)
  } finally { models.dispose(); signals.dispose() }
})

test('flow cues use the actual branch, iteration, and returned value in both languages', () => {
  const location = { line: 3, sourceName: 'main.py', depth: 1 }
  const returned = { ...location, kind: 'return' as const, name: 'charge', value: 0 }
  assert.equal(flowActivity(returned).token, returned)
  assert.equal(describeFlow({ ...returned, kind: 'call', arguments: [{ name: 'old', value: 0 }] }, 'en').code, 'charge(old=0)')
  assert.deepEqual(describeFlow(returned, 'zh'), { label: '函数返回', code: 'charge()', symbol: '↰', detail: '返回 0 · 第 1 层调用' })
  assert.match(describeFlow({ ...returned, value: null }, 'en').detail, /Returned None/)
  assert.match(describeFlow({ ...location, kind: 'if', condition: false }, 'en').detail, /False · Skip/)
  assert.match(describeFlow({ ...location, kind: 'if', name: 'else', condition: true }, 'zh').detail, /else/)
  assert.equal(describeFlow({ ...location, kind: 'for', condition: true, iteration: 2, name: 'item', value: false }, 'en').detail, 'Iteration 2 · item = False')
  assert.equal(describeFlow({ ...location, kind: 'while', condition: false, iteration: 0 }, 'zh').detail, 'False · 循环结束，共 0 轮')
  assert.match(describeFlow({ ...location, kind: 'break' }, 'en').detail, /after this loop/)
  assert.match(describeFlow({ ...location, kind: 'continue' }, 'en').detail, /go back to the loop header/)
})

test('opening a chest uses its hinged lid, and collected keys have their own prop', () => {
  const models = createStationModels(), effects = createRobotSignals()
  try {
    const chest = { kind: 'chest' as const, x: 1, y: 2, id: 'gear-chest' }
    const closed = models.device({ ...chest, status: 'ready' }).getObjectByName('chest-lid')!
    const opened = models.device({ ...chest, status: 'open' }).getObjectByName('chest-lid')!
    assert.equal(closed.rotation.x, 0)
    assert.ok(opened.rotation.x < -1)
    const poses = ['pick', 'collect-key', 'open-chest'] as const
    const props = poses.map(action => {
      effects.show(action, .47)
      return effects.group.children.find(child => child.visible)
    })
    assert.ok(props.every(prop => prop !== undefined))
    assert.equal(new Set(props).size, 3)
  } finally { models.dispose(); effects.dispose() }
})
