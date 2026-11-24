import assert from 'node:assert/strict'
import test from 'node:test'
import { backspaceIndent, indentSelection, newlineWithIndent, outdentSelection } from '../src/web/codeEditing'

test('Tab moves the caret to the next four-column stop and replaces a single-line selection', () => {
  assert.deepEqual(indentSelection('ab', 2, 2), { value: 'ab  ', selectionStart: 4, selectionEnd: 4 })
  assert.deepEqual(indentSelection('', 0, 0), { value: '    ', selectionStart: 4, selectionEnd: 4 })
  assert.deepEqual(indentSelection('x = 1', 4, 5), { value: 'x =     ', selectionStart: 8, selectionEnd: 8 })
})

test('Tab and Shift+Tab shift every selected line and leave blank lines alone', () => {
  const source = 'if ready:\nmove()\n\npick()\n'
  const indented = indentSelection(source, 10, source.length - 1)
  assert.equal(indented.value, 'if ready:\n    move()\n\n    pick()\n')
  assert.deepEqual([indented.selectionStart, indented.selectionEnd], [14, indented.value.length - 1])
  const restored = outdentSelection(indented.value, indented.selectionStart, indented.selectionEnd)
  assert.equal(restored.value, source)
  assert.deepEqual([restored.selectionStart, restored.selectionEnd], [10, source.length - 1])
})

test('Shift+Tab removes at most one level and never eats code', () => {
  assert.equal(outdentSelection('      deep()', 8, 8).value, '  deep()')
  assert.deepEqual(outdentSelection('  x', 1, 1), { value: 'x', selectionStart: 0, selectionEnd: 0 })
  assert.equal(outdentSelection('top()', 3, 3).value, 'top()')
})

test('Enter keeps the indentation and goes one level deeper after a Python block opener', () => {
  const opener = 'def charge(total):'
  assert.deepEqual(newlineWithIndent(opener, opener.length, opener.length),
    { value: opener + '\n    ', selectionStart: opener.length + 5, selectionEnd: opener.length + 5 })
  const body = '    total += 1'
  assert.equal(newlineWithIndent(body, body.length, body.length).value, body + '\n    ')
  assert.equal(newlineWithIndent('while True:  # keep going', 25, 25).value, 'while True:  # keep going\n    ')
  // Assembly has no blocks, so a trailing colon means nothing there.
  assert.equal(newlineWithIndent('label:', 6, 6, false).value, 'label:\n')
  // A plain line only gets the newline, which the editor leaves to the browser.
  assert.equal(newlineWithIndent('x = 1', 5, 5).selectionStart, 6)
})

test('Backspace inside leading spaces steps back one indentation stop', () => {
  assert.deepEqual(backspaceIndent('        x', 8, 8), { value: '    x', selectionStart: 4, selectionEnd: 4 })
  assert.deepEqual(backspaceIndent('      x', 6, 6), { value: '    x', selectionStart: 4, selectionEnd: 4 })
  assert.equal(backspaceIndent('    x', 5, 5), undefined)
  assert.equal(backspaceIndent(' x', 1, 1), undefined)
  assert.equal(backspaceIndent('    x', 2, 4), undefined)
})
