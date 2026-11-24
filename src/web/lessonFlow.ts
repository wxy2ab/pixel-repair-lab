import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Localized } from '../shared/types'

type Flow = readonly Localized[]
const flow = (...phases: [string, string][]): Flow => phases.map(([zh, en]) => ({ zh, en }))

/**
 * What a learner does in each interactive lecture, phase by phase. Every lesson ends with its key points,
 * which the frame adds itself. The order of the checks follows the order in which a lecture picks its activity.
 */
const flows: [key: keyof ProgramWalkthrough, phases: Flow][] = [
  ['variableCups', flow(['贴名字、存数、读数', 'Label, store and read'], ['换块电池预测', 'Predict with a new battery'])],
  ['batterySearch', flow(['亲手找，再比较两种找法', 'Search by hand, then compare'], ['预测比较次数', 'Predict the comparisons'])],
  ['selectionSort', flow(['亲手排一遍', 'Sort a row by hand'], ['预测每轮选中的电池', 'Predict each round’s pick'])],
  ['twoPointerLesson', flow(['从两头向中间配对', 'Pair up from both ends'], ['预测移动和配对', 'Predict the moves and the pair'])],
  ['prefixTotalsLesson', flow(['逐块相加，再用累计值相减', 'Add up, then subtract running totals'], ['预测累计表和合计', 'Predict the table and the total'])],
  ['firstBatterySearch', flow(['先找到一块，再找第一块', 'Find one, then the first one'], ['预测范围和位置', 'Predict the ranges and the index'])],
  ['breadthFirstLesson', flow(['一层层把格子入队', 'Enqueue cells layer by layer'], ['预测出队顺序和路线', 'Predict the order and the route'])],
  ['debugging', flow(['试跑、找出问题、修好', 'Test, find the bug, fix it'], ['预测修好后的结果', 'Predict the fixed output'])],
  ['sequence', flow(['排好补电步骤', 'Order the steps'], ['看提前显示会怎样', 'See an early display stop'], ['修好打乱的步骤', 'Repair a shuffled order'])],
  ['functionLesson', flow(['跟着电量进出函数', 'Follow the charge through the function'], ['预测返回值和原变量', 'Predict the return and the original'])],
  ['dictionaryLesson', flow(['查电量、登记、更新', 'Look up, add and update'], ['预测读数和记录', 'Predict the reading and records'])],
  ['queueLesson', flow(['队尾加入，队头取出', 'Join the back, leave the front'], ['预测取出顺序和剩余', 'Predict what leaves and what stays'])],
  ['stackLesson', flow(['叠上去，再从顶上拿', 'Stack up, take from the top'], ['预测取出顺序和剩余', 'Predict what leaves and what stays'])],
  ['listPositions', flow(['按位置读、插入、移走', 'Read, insert and remove by index'], ['预测新顺序和取到的电池', 'Predict the order and the pick'])],
  ['structures', flow(['亲手试四种取法', 'Try four ways to take a battery'], ['按取件单选结构', 'Pick a structure for each order'])],
  ['moduleLesson', flow(['看两个文件怎样配合', 'Watch two files work together'], ['预测显示的电量', 'Predict the output'])],
  ['nestedLoops', flow(['逐排逐块补电', 'Charge row by row, battery by battery'], ['预测次数和各排结果', 'Predict the count and each row'])],
  ['collectionLesson', flow(['按位置取、按名字查', 'Read by position, look up by name'], ['预测读数和记录', 'Predict the readings and records'])],
  ['whileLoop', flow(['看两次补电循环', 'Watch two charging loops'], ['预测轮数和最终电量', 'Predict the rounds and the charge'])],
  ['forLoop', flow(['逐块补电并记录', 'Charge and record each battery'], ['预测次数和结果', 'Predict the rounds and results'])],
  ['branchLesson', flow(['看程序选哪条路', 'Watch the program choose a path'], ['预测走哪条分支', 'Predict the branch'])],
  ['boolean', flow(['看比较和 and 的结果', 'Watch the comparison and “and”'], ['预测能否出发', 'Predict whether Sprout leaves'])],
  ['assignment', flow(['对比两种写法', 'Compare two assignments'], ['预测每个格子的值', 'Predict each variable'])],
  ['guided', flow(['跟着数字走一遍', 'Follow the number through'], ['换个电量预测', 'Predict a new charge'])],
]

/** The activity phases of an interactive lecture, or nothing for lectures that show their notes beside an animation. */
export function lessonFlow(execution: ProgramWalkthrough | undefined): Flow | undefined {
  return execution && flows.find(([key]) => execution[key])?.[1]
}
