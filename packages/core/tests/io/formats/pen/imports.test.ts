import { describe, expect, test } from 'bun:test'

import { getNodeOrThrow } from '#core-tests/helpers/assert'

import { IORegistry, penFormat } from '@open-pencil/core/io'

const io = new IORegistry([penFormat])

const BLUE = { r: 0, g: 0, b: 1, a: 1 }

function penBytes(fields: Record<string, unknown>) {
  return new TextEncoder().encode(JSON.stringify({ version: '2.21', ...fields }))
}

/** A host holding `files` by their path relative to the document, recording what it is asked. */
function host(files: Partial<Record<string, Record<string, unknown>>>, asked: string[]) {
  return async (path: string) => {
    asked.push(path)
    const file = files[path]
    return file ? penBytes(file) : null
  }
}

const screen = {
  imports: { ui: '../library/ui.lib.pen' },
  children: [
    {
      id: 'screen',
      type: 'frame',
      fill: '$ui:color-primary',
      children: [{ id: 'cta', type: 'ref', ref: 'ui:button' }]
    }
  ]
}

describe('penFormat.readDocument — imports', () => {
  test('reads imports through the host, by their path from the document', async () => {
    const asked: string[] = []
    const { graph } = await io.readDocument({
      name: 'screens/checkout.pen',
      data: penBytes(screen),
      readImport: host(
        {
          '../library/ui.lib.pen': {
            imports: { base: './base.lib.pen' },
            children: [
              {
                id: 'button',
                type: 'frame',
                reusable: true,
                children: [{ id: 'face', type: 'ref', ref: 'base:pill' }]
              }
            ]
          },
          '../library/base.lib.pen': {
            variables: { 'color-primary': { type: 'color', value: '#0000FF' } },
            children: [
              { id: 'pill', type: 'frame', reusable: true, fill: '$color-primary', width: 40 }
            ]
          }
        },
        asked
      )
    })
    expect([...asked].sort()).toEqual(['../library/base.lib.pen', '../library/ui.lib.pen'])
    const cta = getNodeOrThrow(graph, 'cta')
    expect(cta.componentId).toBe('ui:button')
    const [face] = graph.getChildren(cta.id)
    expect(face.fills[0]?.color).toEqual(BLUE)
  })

  test('leaves out an import that imports itself through others', async () => {
    const asked: string[] = []
    const { graph } = await io.readDocument({
      name: 'checkout.pen',
      data: penBytes(screen),
      readImport: host(
        {
          '../library/ui.lib.pen': {
            imports: { again: './ui.lib.pen' },
            variables: { 'color-primary': { type: 'color', value: '#0000FF' } },
            children: [{ id: 'button', type: 'frame', reusable: true }]
          }
        },
        asked
      )
    })
    expect(asked).toEqual(['../library/ui.lib.pen'])
    expect(getNodeOrThrow(graph, 'screen').fills[0]?.color).toEqual(BLUE)
  })

  test('reads a document whose imports the host cannot read', async () => {
    const { graph } = await io.readDocument({
      name: 'checkout.pen',
      data: penBytes(screen),
      readImport: () => Promise.resolve(null)
    })
    expect(graph.getNode('screen')).toBeDefined()
    expect(graph.getPages().map((page) => page.name)).toEqual(['Page 1'])
  })
})
