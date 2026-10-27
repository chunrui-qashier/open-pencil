import { describe, expect, test } from 'bun:test'

import { expectDefined, getNodeOrThrow } from '#core-tests/helpers/assert'

import { renderJSX } from '@open-pencil/core/design-jsx'
import { SceneGraph } from '@open-pencil/scene-graph'
import { vectorNetworkPaths } from '@open-pencil/scene-graph/vector-network'

async function render(jsx: string) {
  const graph = new SceneGraph()
  const [node] = await renderJSX(graph, jsx)
  return getNodeOrThrow(graph, node.id)
}

describe('<Vector> paths', () => {
  test('draw a d as SVG does, the layer taking its bounds', async () => {
    const node = await render('<Vector x={10} y={20} d="M4 2 L20 2 L12 18 Z" bg="#000" />')
    expect(node).toMatchObject({ x: 14, y: 22, width: 16, height: 16 })
    expect(vectorNetworkPaths(expectDefined(node.vectorNetwork, 'network'))).toEqual([
      { windingRule: 'NONZERO', data: 'M0 0L16 0L8 16L0 0Z' }
    ])
  })

  test('take relative commands and arcs in d, and fillRule for holes', async () => {
    const node = await render(
      '<Vector d="m0 0 h20 v20 h-20 z M5 5 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z" fillRule="evenodd" />'
    )
    expect(node).toMatchObject({ width: 20, height: 20 })
    expect(node.vectorNetwork?.regions.map((region) => region.windingRule)).toEqual(['EVENODD'])
  })

  test('size a curve by where it reaches, not by its control points', async () => {
    const node = await render('<Vector d="M0 0 C0 40 40 40 40 0" stroke="#000" />')
    expect(node.width).toBe(40)
    expect(node.height).toBe(30)
  })

  test('take paths as Figma writes them, an open path with NONE', async () => {
    const node = await render(
      `<Vector paths={[{ windingRule: 'EVENODD', data: 'M0 0 L10 0 L10 10 Z' }, { windingRule: 'NONE', data: 'M0 20 L10 20' }]} />`
    )
    expect(vectorNetworkPaths(expectDefined(node.vectorNetwork, 'network'))).toEqual([
      { windingRule: 'EVENODD', data: 'M0 0L10 0L10 10L0 0Z' },
      { windingRule: 'NONE', data: 'M0 20L10 20' }
    ])
  })

  test('draw in the box they are given as written, as an icon in its view box', async () => {
    const node = await render('<Vector w={24} h={24} d="M4 4 L20 4 L20 20 Z" />')
    expect(node).toMatchObject({ x: 0, y: 0, width: 24, height: 24 })
    expect(node.vectorNetwork?.vertices).toEqual([
      { x: 4, y: 4 },
      { x: 20, y: 4 },
      { x: 20, y: 20 }
    ])
  })

  test('say what is wrong with a path', async () => {
    await expect(render('<Vector d="M0 0 L" />')).rejects.toThrow('Invalid <Vector> `d`')
    await expect(
      render(`<Vector paths={[{ windingRule: 'NONZERO', data: 'M0 0 h10 v10 Z' }]} />`)
    ).rejects.toThrow('Invalid <Vector> paths[0]')
    await expect(render('<Vector d="M0 0 L1 1" paths={[]} />')).rejects.toThrow('not both')
  })
})
