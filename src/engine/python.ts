import type { SyntaxNode } from '@lezer/common'
import { parser } from '@lezer/python'
import type { ProgramWalkthroughFrame, WalkthroughBinding } from '../shared/programWalkthrough'
import type { Json, PythonFlowEvent, RunIssue } from '../shared/types'
import type { RackRecorder } from './rackRecorder'
import {
  addOrigin, bare, collectionContains, derived, display, MAX_COLLECTION, MAX_STRING,
  plain, Values, valuesEqual, type Primitive, type Value,
} from './values'

const MAX_SOURCE = 12_000
const MAX_STEPS = 6_000
const MAX_DEPTH = 64
const MAX_CALL_DEPTH = 24
export const MAX_PYTHON_FLOW_EVENTS = 128

type GameCall = (name: string, args: Value[], line: number, sourceName?: string) => Value
type LogicalTerm = { operand: SyntaxNode; negations: number; depth: number }
type ModuleSource = string | Readonly<Partial<Record<string, string>>>
export type PythonModules = Partial<Record<'algorithms' | 'my_algorithms', ModuleSource>>
export type PythonTraceFrame = Omit<ProgramWalkthroughFrame, 'output'>
type PythonOptions = {
  rack?: RackRecorder
  modules?: PythonModules
  stepBudget?: number
  onLine?: (line: number, sourceName: string) => void
  onFlow?: (event: PythonFlowEvent) => void
  onFlowTruncated?: () => void
  flowLimit?: number
  trace?: (frame: PythonTraceFrame) => void
  traceAssignmentValues?: boolean
  traceBranches?: boolean
  traceForLoops?: boolean
  traceListEdits?: boolean
  traceWhileLoops?: boolean
  traceModules?: boolean
}

type SourceContext = { source: string; lines: number[]; pure: boolean; sourceName?: string; logicalGroups: Map<string, LogicalTerm[][]> }
type Binding = Value | UserFunction
type Scope = { bindings: Map<string, Binding>; parent?: Scope }
type UserFunction = { parameters: string[]; body: SyntaxNode; context: SourceContext; scope: Scope; definitionLine: number }
type ActiveTraceScope = { id: number; name: string; scope: Scope; parameters?: string[]; callLine?: number }
type TraceEvent = Omit<PythonTraceFrame, 'stack' | 'value'> & { value?: Value }
type FlowInput = Omit<PythonFlowEvent, 'value' | 'sourceName' | 'depth' | 'arguments'> & {
  value?: Value; sourceName?: string; depth?: number; args?: Value[]; parameters?: string[]
}

// Replays have a smaller budget than Python itself. Large values can still be returned or passed normally.
function flowValue(value: Value, budget: number) {
  try {
    const data = plain(value)
    const length = JSON.stringify(data).length
    if (length <= budget) return { data, length }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
  }
}

class ReturnValue {
  constructor(readonly value: Value, readonly line: number) {}
}

const breakLoop = Symbol('break')
const continueLoop = Symbol('continue')

export class ProgramError extends Error {
  constructor(readonly issue: RunIssue) {
    super(issue.code)
  }
}

function significant(node: SyntaxNode): SyntaxNode[] {
  const nodes: SyntaxNode[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'Comment') nodes.push(child)
  }
  return nodes
}

function expressions(nodes: SyntaxNode[]): SyntaxNode[] {
  return nodes.filter((node) => !['(', ')', '[', ']', '{', '}', ',', ':'].includes(node.name))
}

function truth(value: Value): boolean {
  if (Array.isArray(value.data)) return value.data.length > 0
  if (value.data instanceof Map) return value.data.size > 0
  return Boolean(value.data)
}

function primitive(data: Value['data']): data is Primitive {
  return data === null || typeof data !== 'object'
}

function sourceContext(source: string, pure: boolean, sourceName?: string): SourceContext {
  const lines = [0]
  if (source.length <= MAX_SOURCE) {
    for (let index = 0; index < source.length; index++) {
      if (source[index] === '\n') lines.push(index + 1)
    }
  }
  return { source, pure, lines, sourceName, logicalGroups: new Map() }
}

const comparisonOperators = ['==', '!=', '<', '<=', '>', '>=', 'in', 'not in', 'is', 'is not']

export class PythonProgram {
  private scope: Scope = { bindings: new Map() }
  private context: SourceContext
  private readonly modules = new Map<string, Scope>()
  private budget: number
  private currentLine = 1
  private calls = 0
  private loops = 0
  private traceScopes?: ActiveTraceScope[]
  private nextTraceId = 1
  private flow?: (event: FlowInput) => void
  private flowFunction?: string
  private flowLine?: number
  private flowLoop?: { loopKind: 'for' | 'while'; iteration: number; name?: string }

  constructor(
    source: string,
    private readonly values: Values,
    private readonly gameCall: GameCall,
    private readonly options: PythonOptions = {},
  ) {
    this.context = sourceContext(source, false, options.traceModules ? 'main.py' : undefined)
    this.budget = options.stepBudget ?? MAX_STEPS
    const publish = options.onFlow
    if (publish) {
      let remaining = options.flowLimit ?? MAX_PYTHON_FLOW_EVENTS
      this.flow = ({ value, args, parameters, ...event }) => {
        if (remaining-- <= 0) {
          this.flow = undefined
          options.onFlowTruncated?.()
          return
        }
        const output: PythonFlowEvent = { sourceName: this.context.sourceName ?? 'main.py', depth: this.calls,
          ...(this.flowFunction && { functionName: this.flowFunction }), ...event }
        if (value !== undefined) {
          const snapshot = flowValue(value, 1024)
          if (snapshot) output.value = snapshot.data
        }
        if (args && parameters) {
          const bindings = []
          let budget = 1022 // Account for the enclosing [] and each {"name":…,"value":…} below.
          for (const [index, argument] of args.entries()) {
            const name = parameters[index]
            budget -= JSON.stringify(name).length + 19
            const snapshot = flowValue(argument, budget)
            if (!snapshot) break
            bindings.push({ name, value: snapshot.data })
            budget -= snapshot.length
          }
          if (bindings.length === args.length) output.arguments = bindings
        }
        publish(output)
      }
    }
  }

  run(): void {
    if (this.options.trace) this.traceScopes = [{ id: 0, name: '<module>', scope: this.scope }]
    this.withLimits(() => {
      if (this.traceScopes) this.emitTrace({ kind: 'start' })
      this.block(this.parse(), 0)
      if (this.traceScopes) this.emitTrace({ kind: 'end' })
    })
  }

  /** A function-only file can be driven by the game. Scripts with top-level actions run themselves. */
  isFunctionModule(name: string): boolean {
    if (!this.context.source.includes(name)) return false
    const statements = significant(this.parse())
    return statements.every(node => node.name === 'FunctionDefinition' || node.name === 'ImportStatement')
      && statements.some(node => {
        const identifier = node.name === 'FunctionDefinition' && node.getChild('VariableName')
        return identifier && this.text(identifier) === name
      })
  }

  private emitTrace({ value, ...event }: TraceEvent): void {
    const trace = this.options.trace
    if (!trace || !this.traceScopes) return
    let remaining = 32_000
    const snapshot = (binding: Value): Json => {
      const data = plain(binding)
      remaining -= JSON.stringify(data).length
      if (remaining < 0) throw new ProgramError({ code: 'limit', line: event.line })
      return data
    }
    const stack = this.traceScopes.map(({ id, name, scope, parameters, callLine }) => {
      const values: WalkthroughBinding[] = []
      for (const [key, binding] of scope.bindings) {
        if (!('data' in binding)) continue
        const data = snapshot(binding)
        values.push(parameters?.includes(key) ? { name: key, value: data, parameter: true } : { name: key, value: data })
      }
      return { id, name, values, callLine }
    })
    const sourceName = this.context.sourceName
    trace({ ...(sourceName && { sourceName }), ...event, stack, ...(value !== undefined && { value: snapshot(value) }) })
  }

  runPureFunction(name: string, args: Value[], allowImports = false, onReturn?: (line: number) => void): Value {
    if (this.options.trace) this.traceScopes = [{ id: 0, name: '<module>', scope: this.scope }]
    return this.withLimits(() => {
      if (this.traceScopes) this.emitTrace({ kind: 'start' })
      const definitions = this.defineModule(this.context.source, allowImports, this.context.sourceName)
      const target = definitions.bindings.get(name)
      if (!target || 'data' in target) this.fail('unknownName', undefined, name)
      const value = this.invoke(target, args, this.traceScopes ? target.definitionLine : 1, name, target.definitionLine, onReturn)
      if (this.traceScopes) this.emitTrace({ kind: 'end' })
      return value
    })
  }

  private withLimits<T>(execute: () => T): T {
    try {
      return execute()
    } catch (error) {
      if (error instanceof RangeError) this.fail('limit')
      throw error
    }
  }

  private parse(): SyntaxNode {
    if (this.context.source.length > MAX_SOURCE) this.fail('limit')
    const tree = parser.parse(this.context.source)
    tree.iterate({
      enter: (node) => {
        if (node.type.isError) this.fail('syntax', node.node)
      },
    })
    return tree.topNode
  }

  private defineModule(source: string, allowImports = false, sourceName?: string): Scope {
    const context = this.context
    const scope = this.scope
    const callerLine = this.flowLine
    const moduleScope: Scope = { bindings: new Map() }
    this.context = sourceContext(source, true, sourceName)
    this.scope = moduleScope
    try {
      for (const statement of significant(this.parse())) {
        this.noteLine(statement)
        if (allowImports && statement.name === 'ImportStatement') {
          this.useModule(statement, significant(statement), true)
          continue
        }
        if (statement.name !== 'FunctionDefinition') this.fail('unsupported', statement, this.text(statement).slice(0, 30))
        this.define(statement, 1)
      }
      return moduleScope
    } finally {
      this.context = context
      this.scope = scope
      this.flowLine = callerLine
    }
  }

  private text(node: SyntaxNode): string {
    return this.context.source.slice(node.from, node.to)
  }

  private line(node: SyntaxNode): number {
    const lines = this.context.lines
    let lower = 0
    let upper = lines.length
    while (lower + 1 < upper) {
      const middle = (lower + upper) >> 1
      if (lines[middle] > node.from) upper = middle
      else lower = middle
    }
    return lower + 1
  }

  private fail(code: string, node?: SyntaxNode, detail?: string): never {
    this.failAtLine(code, node ? this.line(node) : this.currentLine, detail)
  }

  private failAtLine(code: string, line: number, detail?: string): never {
    const file = this.context.sourceName
    throw new ProgramError({ code, line, detail, ...(this.options.traceModules && file && (file !== 'main.py' || this.options.onLine) && { sourceName: file }) })
  }

  private tick(node: SyntaxNode, depth: number): void {
    this.currentLine = this.line(node)
    if (--this.budget < 0 || depth > MAX_DEPTH) this.fail('limit', node)
  }

  private block(node: SyntaxNode, depth: number): void {
    for (const child of expressions(significant(node))) this.statement(child, depth + 1)
  }

  private noteLine(node: SyntaxNode): void {
    if (!this.flow && !this.options.onLine && !this.options.rack) return
    const line = this.line(node)
    const file = this.context.sourceName ?? 'main.py'
    if (this.flow) this.flowLine = line
    this.options.onLine?.(line, file)
    this.options.rack?.enter(line, file, this.scope.bindings)
  }

  private statement(node: SyntaxNode, depth: number): void {
    this.tick(node, depth)
    const parts = significant(node)
    if (node.name !== 'WhileStatement' && node.name !== 'IfStatement') this.noteLine(node)
    switch (node.name) {
      case 'ExpressionStatement':
        if (parts.length !== 1) this.fail('unsupported', node)
        this.expression(parts[0], depth + 1)
        return
      case 'AssignStatement':
      case 'UpdateStatement': {
        if (parts.length !== 3) this.fail('unsupported', node)
        const [target, operator, expression] = parts
        let value = this.expression(expression, depth + 1)
        if (this.text(operator) !== '=') {
          const current = this.expression(target, depth + 1)
          value = this.binary(this.text(operator).slice(0, -1), current, value, node)
        }
        if (this.traceScopes && this.options.traceAssignmentValues) {
          this.emitTrace({ kind: 'evaluate', line: this.line(node), name: this.text(target), value })
        }
        this.assign(target, value, depth + 1)
        if (this.traceScopes) this.emitTrace({ kind: 'assign', line: this.line(node), name: this.text(target), value })
        return
      }
      case 'ForStatement': {
        if (parts.length !== 5 || parts[0].name !== 'for' || parts[1].name !== 'VariableName' || parts[2].name !== 'in') {
          this.fail('unsupported', node)
        }
        const iterable = this.expression(parts[3], depth + 1)
        const variable = this.text(parts[1])
        let iteration = 0
        for (const value of this.iterable(iterable, parts[3])) {
          this.tick(node, depth)
          this.scope.bindings.set(variable, value)
          iteration++
          this.flow?.({ kind: 'for', line: this.line(node), name: variable, condition: true, iteration, value })
          if (this.options.traceForLoops) {
            this.emitTrace({ kind: 'iterate', line: this.line(node), name: variable, value })
          }
          if (this.loopBody(parts[4], depth + 1, 'for', iteration, variable)) return
          this.noteLine(node)
        }
        if (this.options.traceForLoops) {
          this.emitTrace({ kind: 'loop-end', line: this.line(node), name: variable })
        }
        this.flow?.({ kind: 'for', line: this.line(node), name: variable, condition: false, iteration })
        return
      }
      case 'WhileStatement': {
        if (parts.length !== 3) this.fail('unsupported', node)
        let iteration = 0
        while (true) {
          this.noteLine(node)
          const condition = truth(this.expression(parts[1], depth + 1))
          if (condition) iteration++
          this.flow?.({ kind: 'while', line: this.line(node), condition, iteration })
          if (this.options.traceWhileLoops) {
            this.emitTrace({ kind: 'while-check', line: this.line(node), value: bare(condition) })
          }
          if (!condition) break
          this.tick(node, depth)
          if (this.loopBody(parts[2], depth + 1, 'while', iteration)) break
        }
        return
      }
      case 'IfStatement': {
        for (let index = 0; index < parts.length;) {
          const header = parts[index]
          this.noteLine(header)
          const otherwise = header.name === 'else'
          const condition = otherwise || truth(this.expression(parts[index + 1], depth + 1))
          this.flow?.({ kind: 'if', name: header.name, line: this.line(header), condition })
          if (condition) {
            if (this.options.traceBranches) {
              this.emitTrace({ kind: 'branch', name: header.name, line: this.line(header), guardLine: this.line(parts[0]) })
            }
            this.block(parts[index + (otherwise ? 1 : 2)], depth + 1)
            return
          }
          index += 3
        }
        return
      }
      case 'PassStatement':
        return
      case 'FunctionDefinition':
        if (depth !== 1) this.fail('unsupported', node, 'def')
        this.define(node, depth)
        return
      case 'ReturnStatement':
        if (!this.calls || parts.length > 2) this.fail('unsupported', node, 'return')
        throw new ReturnValue(parts[1] ? this.expression(parts[1], depth + 1) : bare(null), this.line(node))
      case 'ImportStatement':
        this.useModule(node, parts)
        return
      case 'BreakStatement':
      case 'ContinueStatement':
        if (!this.loops) this.fail('unsupported', node, this.text(node))
        this.flow?.({ kind: node.name === 'BreakStatement' ? 'break' : 'continue', line: this.line(node), ...this.flowLoop })
        throw node.name === 'BreakStatement' ? breakLoop : continueLoop
      default:
        this.fail('unsupported', node, this.text(node).split(/[\s(]/, 1)[0]?.slice(0, 30))
    }
  }

  private loopBody(node: SyntaxNode, depth: number, loopKind: 'for' | 'while', iteration: number, name?: string): boolean {
    const outerLoop = this.flowLoop
    if (this.flow) this.flowLoop = { loopKind, iteration, ...(name && { name }) }
    this.loops++
    try {
      this.block(node, depth)
      return false
    } catch (error) {
      if (error === breakLoop) return true
      if (error === continueLoop) return false
      throw error
    } finally {
      this.flowLoop = outerLoop
      this.loops--
    }
  }

  private define(node: SyntaxNode, depth: number): void {
    this.tick(node, depth)
    const [keyword, name, parameters, body, extra] = significant(node)
    if (keyword?.name !== 'def' || name?.name !== 'VariableName' || parameters?.name !== 'ParamList' || body?.name !== 'Body' || extra) {
      this.fail('unsupported', node, 'def')
    }
    const parameterNodes = expressions(significant(parameters))
    if (parameterNodes.some((parameter) => parameter.name !== 'VariableName')) this.fail('unsupported', parameters, 'parameters')
    const names = parameterNodes.map((parameter) => this.text(parameter))
    if (new Set(names).size !== names.length) this.fail('syntax', parameters)
    const functionName = this.text(name)
    const definitionLine = this.line(node)
    this.scope.bindings.set(functionName, { parameters: names, body, context: this.context, scope: this.scope, definitionLine })
    if (this.traceScopes) this.emitTrace({ kind: 'define', line: definitionLine, name: functionName })
  }

  private useModule(node: SyntaxNode, parts: SyntaxNode[], allowPure = false): void {
    const [from, module, keyword, imported, extra] = parts
    if ((this.context.pure && !allowPure) || from?.name !== 'from' || module?.name !== 'VariableName' || keyword?.name !== 'import' || imported?.name !== 'VariableName' || extra) {
      this.fail('unsupported', node, 'import')
    }
    const moduleName = this.text(module)
    const importName = this.text(imported)
    if (moduleName !== 'algorithms' && moduleName !== 'my_algorithms') this.fail('unsupported', node, moduleName)
    const entry = this.options.modules?.[moduleName]
    const source = typeof entry === 'string' ? entry : entry && Object.hasOwn(entry, importName) ? entry[importName] : undefined
    if (!source) this.fail('unknownName', node, moduleName)
    const cacheKey = typeof entry === 'string' ? moduleName : `${moduleName}.${importName}`
    let defined = this.modules.get(cacheKey)
    if (!defined) {
      const importing = this.options.rack?.current
      defined = this.defineModule(source, false, this.options.traceModules || this.flow ? cacheKey + '.py' : undefined)
      this.options.rack?.resume(importing, this.scope.bindings)
      this.modules.set(cacheKey, defined)
    }
    const binding = defined.bindings.get(importName)
    if (!binding) this.fail('unknownName', node, importName)
    this.scope.bindings.set(importName, binding)
    if (this.traceScopes && this.options.traceModules) {
      this.emitTrace({ kind: 'import', line: this.line(node), name: importName, moduleName })
    }
  }

  private lookup(name: string): Binding | undefined {
    return this.scope.bindings.get(name) ?? this.scope.parent?.bindings.get(name)
  }

  private invoke(target: UserFunction, args: Value[], line: number, name: string, callSite = line, onReturn?: (line: number) => void): Value {
    const caller = this.options.rack?.current
    if (this.calls >= MAX_CALL_DEPTH) this.failAtLine('limit', line)
    if (target.parameters.length !== args.length) this.failAtLine('wrongArguments', line, name)
    const context = this.context
    const scope = this.scope
    const loops = this.loops
    const callerName = this.flowFunction
    const callerLine = this.flowLine
    const argumentsBefore = target.context.pure && !context.pure ? args.map(plain) : undefined
    let value = bare(null)
    let returnLine: number | undefined
    let lastBodyLine = target.definitionLine
    this.context = target.context
    this.scope = { bindings: new Map(target.parameters.map((parameter, index) => [parameter, args[index]])), parent: target.scope }
    this.loops = 0
    this.calls++
    this.flowFunction = name
    this.flowLine = target.definitionLine
    const traceScopes = this.traceScopes
    traceScopes?.push({ id: this.nextTraceId++, name, scope: this.scope, parameters: target.parameters, callLine: line })
    try {
      this.flow?.({ kind: 'call', name, line: callSite, sourceName: context.sourceName ?? 'main.py',
        targetSourceName: target.context.sourceName ?? 'main.py', args, parameters: target.parameters })
      if (traceScopes) {
        this.emitTrace({ kind: 'call', name, line, ...(context.sourceName && { sourceName: context.sourceName }) })
      }
      this.block(target.body, 1)
      lastBodyLine = this.flowLine ?? target.definitionLine
    } catch (error) {
      if (!(error instanceof ReturnValue)) throw error
      value = error.value
      returnLine = error.line
    } finally {
      traceScopes?.pop()
      this.flowFunction = callerName
      this.flowLine = callerLine
      this.context = context
      this.scope = scope
      this.loops = loops
      this.calls--
    }
    if (argumentsBefore?.some((argument, index) => !valuesEqual(argument, plain(args[index])))) {
      this.failAtLine('unsupported', line, 'input mutation')
    }
    this.flow?.({ kind: 'return', name, functionName: name, depth: this.calls + 1,
      line: returnLine ?? lastBodyLine, sourceName: target.context.sourceName ?? 'main.py',
      targetSourceName: context.sourceName ?? 'main.py', resumeLine: callSite, value })
    if (traceScopes) {
      const sourceName = target.context.sourceName
      const resumeSourceName = context.sourceName
      this.emitTrace({
        kind: 'return', name, line: returnLine, resumeLine: line, value,
        ...(sourceName && { sourceName }), ...(resumeSourceName && { resumeSourceName }),
      })
    }
    this.options.rack?.resume(caller, scope.bindings)
    onReturn?.(returnLine ?? lastBodyLine)
    return value
  }

  private assign(target: SyntaxNode, value: Value, depth: number): void {
    if (target.name === 'VariableName') {
      this.scope.bindings.set(this.text(target), value)
      return
    }
    if (target.name !== 'MemberExpression') this.fail('unsupported', target)
    const parts = significant(target)
    if (parts.length !== 4 || parts[1].name !== '[' || parts[3].name !== ']') this.fail('unsupported', target)
    const [object, , index] = parts
    const container = this.expression(object, depth + 1)
    const key = this.expression(index, depth + 1)
    if (collectionContains(container, value)) this.fail('limit', target)
    if (Array.isArray(container.data) && !container.range) {
      container.data[this.index(key, container.data.length, target)] = value
      return
    }
    if (container.data instanceof Map && primitive(key.data)) {
      if (!container.data.has(key.data) && container.data.size >= MAX_COLLECTION) this.fail('limit', target)
      container.data.set(key.data, value)
      return
    }
    this.fail('type', target)
  }

  private expression(node: SyntaxNode, depth: number): Value {
    this.tick(node, depth)
    const parts = significant(node)
    const next = (part: SyntaxNode) => this.expression(part, depth + 1)
    switch (node.name) {
      case 'Number': {
        const value = Number(this.text(node).replaceAll('_', ''))
        return this.number(value, node)
      }
      case 'String':
        return bare(this.stringLiteral(node))
      case 'Boolean':
        return bare(this.text(node) === 'True')
      case 'None':
        return bare(null)
      case 'VariableName': {
        const name = this.text(node)
        const value = this.lookup(name)
        if (!value) this.fail('unknownName', node, name)
        if (!('data' in value)) this.fail('unsupported', node, name)
        return value
      }
      case 'ParenthesizedExpression': {
        const content = expressions(parts)
        if (content.length !== 1) this.fail('unsupported', node)
        return next(content[0])
      }
      case 'ArrayExpression': {
        const elements = expressions(parts)
        if (elements.length > MAX_COLLECTION) this.fail('limit', node)
        return this.values.list(elements.map(next))
      }
      case 'DictionaryExpression': {
        const entries = expressions(parts)
        if (entries.length / 2 > MAX_COLLECTION) this.fail('limit', node)
        if (entries.length % 2 !== 0) this.fail('unsupported', node)
        const dictionary = new Map<Primitive, Value>()
        for (let index = 0; index < entries.length; index += 2) {
          const key = next(entries[index])
          if (!primitive(key.data)) this.fail('type', entries[index])
          dictionary.set(key.data, next(entries[index + 1]))
        }
        return this.values.dictionary(dictionary)
      }
      case 'CallExpression':
        return this.call(node, depth)
      case 'MemberExpression':
        return this.member(node, depth)
      case 'UnaryExpression': {
        const operator = this.text(parts[0])
        if (operator === 'not') return this.logicalExpression(node, depth)
        const value = next(parts[1])
        if (operator !== '-' && operator !== '+' && operator !== '~') this.fail('unsupported', node, operator)
        const number = this.numeric(value, node)
        if (operator === '~') return this.number(-number - 1, node, [value])
        return this.number(operator === '-' ? -number : number, node, [value])
      }
      case 'BinaryExpression': {
        const operator = this.operator(parts)
        if (comparisonOperators.includes(operator)) return this.comparison(node, depth)
        if (operator === 'and' || operator === 'or') return this.logicalExpression(node, depth)
        const left = next(parts[0])
        return this.binary(operator, left, next(parts[parts.length - 1]), node)
      }
      default:
        this.fail('unsupported', node, this.text(node).slice(0, 30))
    }
  }

  private operator(parts: SyntaxNode[]): string {
    return parts.slice(1, -1).map((part) => this.text(part)).join(' ')
  }

  // Lezer can put the rest of a boolean chain inside a leading "not".
  // Walk it in source order; a comparison or a parenthesized group stays one operand.
  private logicalGroups(node: SyntaxNode): LogicalTerm[][] {
    const key = `${node.from}:${node.to}`
    const cached = this.context.logicalGroups.get(key)
    if (cached) return cached
    const groups: LogicalTerm[][] = [[]]
    const pending = [{ operand: node, negations: 0, depth: 0, beginsGroup: false }]
    while (pending.length) {
      const { operand, negations, depth, beginsGroup } = pending.pop()!
      const parts = significant(operand)
      if (operand.name === 'UnaryExpression' && parts[0].name === 'not') {
        pending.push({ operand: parts[1], negations: negations + 1, depth: depth + 1, beginsGroup })
      } else if (operand.name === 'BinaryExpression' && (parts[1].name === 'and' || parts[1].name === 'or')) {
        pending.push({ operand: parts[2], negations: 0, depth: depth + 1, beginsGroup: parts[1].name === 'or' })
        pending.push({ operand: parts[0], negations, depth: depth + 1, beginsGroup })
      } else {
        if (beginsGroup) groups.push([])
        groups[groups.length - 1].push({ operand, negations, depth })
      }
    }
    this.context.logicalGroups.set(key, groups)
    return groups
  }

  private logicalExpression(node: SyntaxNode, depth: number): Value {
    let result = bare(false)
    for (const group of this.logicalGroups(node)) {
      for (const term of group) {
        result = this.expression(term.operand, depth + term.depth)
        for (let i = 0; i < term.negations; i++) result = derived(!truth(result), [result])
        if (!truth(result)) break
      }
      if (truth(result)) break
    }
    return result
  }

  private comparison(node: SyntaxNode, depth: number): Value {
    const chain: { operator: string; right: SyntaxNode }[] = []
    let left = node
    while (left.name === 'BinaryExpression') {
      const parts = significant(left)
      const operator = this.operator(parts)
      if (!comparisonOperators.includes(operator)) break
      chain.unshift({ operator, right: parts[parts.length - 1] })
      left = parts[0]
      if (chain.length > MAX_DEPTH) this.fail('limit', node)
    }
    let previous = this.expression(left, depth + 1)
    const compared = [previous]
    for (const { operator, right } of chain) {
      const next = this.expression(right, depth + 1)
      compared.push(next)
      if (!truth(this.binary(operator, previous, next, node))) return derived(false, compared)
      previous = next
    }
    return derived(true, compared)
  }

  private stringLiteral(node: SyntaxNode): string {
    const literal = this.text(node)
    const quote = literal[0]
    if (quote !== '"' && quote !== "'") this.fail('unsupported', node)
    const delimiter = literal.startsWith(quote.repeat(3)) ? quote.repeat(3) : quote
    const body = literal.slice(delimiter.length, -delimiter.length)
    const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', a: '\x07', '\\': '\\', '"': '"', "'": "'" }
    const value = body.replace(/\\(\r?\n|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{2}|[0-7]{1,3}|.)/gs,
      (match, escaped: string) => {
        if (escaped === '\n' || escaped === '\r\n') return ''
        if (Object.hasOwn(escapes, escaped)) return escapes[escaped]
        if (/^[uUx]/.test(escaped) && escaped.length > 1) {
          const point = Number.parseInt(escaped.slice(1), 16)
          if (point > 0x10ffff) this.fail('syntax', node)
          return String.fromCodePoint(point)
        }
        if (/^[0-7]/.test(escaped)) return String.fromCodePoint(Number.parseInt(escaped, 8))
        return match
      })
    if (value.length > MAX_STRING) this.fail('limit', node)
    return value
  }

  private index(key: Value, length: number, node: SyntaxNode): number {
    const index = this.integer(key, node)
    const normalized = index < 0 ? index + length : index
    if (normalized < 0 || normalized >= length) this.fail('index', node, String(index))
    return normalized
  }

  private member(node: SyntaxNode, depth: number): Value {
    const parts = significant(node)
    if (parts.length !== 4 || parts[1].name !== '[' || parts[3].name !== ']') this.fail('unsupported', node)
    const owner = this.expression(parts[0], depth + 1)
    const key = this.expression(parts[2], depth + 1)
    if (Array.isArray(owner.data)) {
      const value = owner.data[this.index(key, owner.data.length, node)]
      if (owner.range) return value
      return addOrigin(value, { kind: 'list-index', container: owner.container! })
    }
    if (owner.data instanceof Map && primitive(key.data)) {
      const value = owner.data.get(key.data)
      if (!value) this.fail('missingKey', node, display(key))
      return addOrigin(value, { kind: 'dict-index', container: owner.container! })
    }
    if (typeof owner.data === 'string') {
      const chars = [...owner.data]
      return derived(chars[this.index(key, chars.length, node)], [owner])
    }
    this.fail('type', node)
  }

  private call(node: SyntaxNode, depth: number): Value {
    const [target, argumentsNode] = significant(node)
    const args = expressions(significant(argumentsNode)).map((argument) => this.expression(argument, depth + 1))
    if (target.name === 'MemberExpression') return this.method(target, args, depth + 1)
    if (target.name !== 'VariableName') this.fail('unsupported', node)
    const name = this.text(target)
    const binding = this.lookup(name)
    if (binding) {
      if ('data' in binding) this.fail('type', node, name)
      return this.invoke(binding, args, this.line(node), name)
    }
    if (name === 'range') {
      this.arity(name, args, 1, 3, node)
      const integers = args.map((argument) => this.integer(argument, node))
      const start = integers.length === 1 ? 0 : integers[0]
      const stop = integers.length === 1 ? integers[0] : integers[1]
      const step = integers[2] ?? 1
      if (step === 0) this.fail('wrongArguments', node, name)
      const sequence: Value[] = []
      for (let current = start; step > 0 ? current < stop : current > stop; current += step) {
        if (sequence.length >= MAX_COLLECTION) this.fail('limit', node)
        sequence.push(bare(current))
      }
      return this.values.range(sequence)
    }
    if (name === 'len') {
      this.arity(name, args, 1, 1, node)
      const owner = args[0].data
      if (Array.isArray(owner)) return bare(owner.length)
      if (owner instanceof Map) return bare(owner.size)
      if (typeof owner === 'string') return bare([...owner].length)
      this.fail('type', node, name)
    }
    if (name === 'str' || name === 'bool') {
      this.arity(name, args, 1, 1, node)
      if (name === 'bool') return derived(truth(args[0]), args)
      const text = display(args[0])
      if (text.length > MAX_STRING) this.fail('limit', node)
      return derived(text, args)
    }
    if (this.context.pure) this.fail('unknownName', node, name)
    const line = this.line(node)
    const value = this.gameCall(name, args, line, this.context.sourceName)
    if (this.traceScopes && name === 'say' && args.length === 1) this.emitTrace({ kind: 'output', name, line, value: args[0] })
    return value
  }

  private method(node: SyntaxNode, args: Value[], depth: number): Value {
    const [target, dot, method] = significant(node)
    if (dot?.name !== '.' || method?.name !== 'PropertyName') this.fail('unsupported', node)
    const name = this.text(method)
    const owner = this.expression(target, depth + 1)
    if (!Array.isArray(owner.data) || owner.range) this.fail('type', node, name)
    if (name === 'append') {
      this.arity(name, args, 1, 1, node)
      if (owner.data.length >= MAX_COLLECTION || collectionContains(owner, args[0])) this.fail('limit', node)
      owner.data.push(args[0])
      if (this.options.traceForLoops) {
        this.emitTrace({ kind: 'append', line: this.line(node), name: this.text(target), value: args[0] })
      }
      return bare(null)
    }
    if (name === 'insert') {
      this.arity(name, args, 2, 2, node)
      const offset = this.integer(args[0], node)
      const value = args[1]
      if (owner.data.length >= MAX_COLLECTION || collectionContains(owner, value)) this.fail('limit', node)
      const size = owner.data.length
      const index = Math.max(0, Math.min(size, offset < 0 ? size + offset : offset))
      owner.data.splice(index, 0, value)
      if (this.options.traceListEdits) {
        this.emitTrace({ kind: 'insert', line: this.line(node), name: this.text(target), value })
      }
      return bare(null)
    }
    if (name === 'pop') {
      this.arity(name, args, 0, 1, node)
      const offset = args.length ? this.integer(args[0], node) : -1
      const index = this.index(bare(offset), owner.data.length, node)
      const [value] = owner.data.splice(index, 1)
      if (offset === 0) return addOrigin(value, { kind: 'queue-pop', container: owner.container! })
      if (offset === -1 || index === owner.data.length) return addOrigin(value, { kind: 'stack-pop', container: owner.container! })
      return value
    }
    this.fail('unsupported', node, name)
  }

  private iterable(value: Value, node: SyntaxNode): Iterable<Value> {
    if (Array.isArray(value.data)) return value.data
    if (value.data instanceof Map) return [...value.data.keys()].map(bare)
    if (typeof value.data === 'string') return [...value.data].map((character) => derived(character, [value]))
    this.fail('type', node)
  }

  private arity(name: string, args: Value[], min: number, max: number, node: SyntaxNode): void {
    if (args.length < min || args.length > max) this.fail('wrongArguments', node, name)
  }

  private numeric(value: Value, node: SyntaxNode): number {
    if (typeof value.data === 'number') return value.data
    if (typeof value.data === 'boolean') return Number(value.data)
    this.fail('type', node)
  }

  private integer(value: Value, node: SyntaxNode): number {
    const number = this.numeric(value, node)
    if (!Number.isSafeInteger(number)) this.fail('type', node)
    return number
  }

  private number(value: number, node: SyntaxNode, sources: Value[] = []): Value {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) this.fail('limit', node)
    return derived(value, sources)
  }

  private binary(operator: string, left: Value, right: Value, node: SyntaxNode): Value {
    const operands = [left, right]
    const a = left.data
    const b = right.data
    if (operator === '==' || operator === '!=') {
      const bothNumeric = [typeof a, typeof b].every((type) => type === 'number' || type === 'boolean')
      const equal = bothNumeric ? Number(a) === Number(b) : valuesEqual(plain(left), plain(right))
      return derived(operator === '==' ? equal : !equal, operands)
    }
    if (operator === 'is' || operator === 'is not') return derived(operator === 'is' ? a === b : a !== b, operands)
    if (operator === 'in' || operator === 'not in') {
      let included: boolean
      if (typeof a === 'string' && typeof b === 'string') included = b.includes(a)
      else if (Array.isArray(b)) included = b.some((item) => valuesEqual(plain(left), plain(item)))
      else if (b instanceof Map && primitive(a)) included = b.has(a)
      else this.fail('type', node)
      return derived(operator === 'in' ? included : !included, operands)
    }
    if (operator === '+' && typeof a === 'string' && typeof b === 'string') {
      if (a.length + b.length > MAX_STRING) this.fail('limit', node)
      return derived(a + b, operands)
    }
    if (operator === '+' && Array.isArray(a) && Array.isArray(b) && !left.range && !right.range) {
      if (a.length + b.length > MAX_COLLECTION) this.fail('limit', node)
      return this.values.list([...a, ...b])
    }
    if (['<', '<=', '>', '>='].includes(operator)) {
      let comparison: number
      if (typeof a === 'string' && typeof b === 'string') comparison = a < b ? -1 : a === b ? 0 : 1
      else comparison = this.numeric(left, node) - this.numeric(right, node)
      const matches = operator === '<' ? comparison < 0 : operator === '<=' ? comparison <= 0 : operator === '>' ? comparison > 0 : comparison >= 0
      return derived(matches, operands)
    }
    const x = this.numeric(left, node)
    const y = this.numeric(right, node)
    if (['/', '//', '%'].includes(operator) && y === 0) this.fail('divideByZero', node)
    switch (operator) {
      case '+': return this.number(x + y, node, operands)
      case '-': return this.number(x - y, node, operands)
      case '*': return this.number(x * y, node, operands)
      case '/': return this.number(x / y, node, operands)
      case '//': return this.number(Math.floor(x / y), node, operands)
      case '%': return this.number(x - y * Math.floor(x / y), node, operands)
      case '**': return this.number(x ** y, node, operands)
      default: this.fail('unsupported', node, operator)
    }
  }
}
