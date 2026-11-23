import type { CardDefinition, CardInstance } from './types'

export function parameterNames(template: string) {
  return Array.from(template.matchAll(/\{\{([A-Za-z0-9_-]+)\}\}/g), match => match[1])
}

export function compileCards(definitions: CardDefinition[], cards: CardInstance[]) {
  const byId = new Map(definitions.map(card => [card.id, card]))
  const lines: string[] = []
  const linePaths: string[] = []

  function emit(source: string, path: string) {
    for (const line of source.split('\n')) {
      lines.push(line)
      linePaths.push(path)
    }
  }

  function render(items: CardInstance[], prefix: string, indentation: string) {
    for (const [index, item] of items.entries()) {
      const path = prefix + index
      const card = byId.get(item.cardId)
      if (!card) throw new Error('unknown-card')
      const line = card.template.replace(/\{\{([A-Za-z0-9_-]+)\}\}/g, (_, name: string) => {
        const parameter = card.parameters?.find(parameter => parameter.name === name)
        const choice = parameter?.choices.find(choice => choice.id === item.values?.[name]) ?? parameter?.choices[0]
        if (!choice) throw new Error('unknown-parameter')
        return choice.code
      })
      emit(indentation + line, path)
      if (card.block) {
        if (item.children?.length) render(item.children, path + '.', indentation + '    ')
        else emit(indentation + '    pass', path)
      }
    }
  }
  render(cards, '', '')
  return { source: lines.join('\n'), linePaths }
}

export function cardsToPython(definitions: CardDefinition[], cards: CardInstance[]): string {
  return compileCards(definitions, cards).source
}
