import { describe, expect, test } from 'bun:test'

import type { VectorNetwork } from '@open-pencil/scene-graph'
import {
  mergeVectorNetworks,
  vectorNetworkToSVGPaths
} from '@open-pencil/scene-graph/vector-network'

import { expectDefined } from './helpers/assert'

function lineNetwork(x: number): VectorNetwork {
  return {
    vertices: [
      { x, y: 0 },
      { x: x + 1, y: 1 }
    ],
    segments: [
      {
        start: 0,
        end: 1,
        tangentStart: { x: 0, y: 0 },
        tangentEnd: { x: 0, y: 0 }
      }
    ],
    regions: [{ windingRule: 'NONZERO', loops: [[0]] }]
  }
}

describe('mergeVectorNetworks', () => {
  test('offsets indices and returns independent geometry', () => {
    const first = lineNetwork(0)
    const second = lineNetwork(10)
    const merged = mergeVectorNetworks([first, second])

    expect(merged.vertices).toHaveLength(4)
    expect(merged.segments.map(({ start, end }) => [start, end])).toEqual([
      [0, 1],
      [2, 3]
    ])
    expect(merged.regions.map(({ loops }) => loops)).toEqual([[[0]], [[1]]])

    expectDefined(merged.vertices[0]).x = 50
    expectDefined(merged.segments[0]).tangentStart.x = 50
    expectDefined(expectDefined(merged.regions[0]).loops[0])[0] = 50
    expect(expectDefined(first.vertices[0]).x).toBe(0)
    expect(expectDefined(first.segments[0]).tangentStart.x).toBe(0)
    expect(expectDefined(expectDefined(first.regions[0]).loops[0])[0]).toBe(0)
  })
})

describe('vectorNetworkToSVGPaths()', () => {
  test('single straight segment', () => {
    const paths = vectorNetworkToSVGPaths({
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 100 }
      ],
      segments: [
        {
          start: 0,
          end: 1,
          tangentStart: { x: 0, y: 0 },
          tangentEnd: { x: 0, y: 0 }
        }
      ],
      regions: []
    })
    expect(paths).toHaveLength(1)
    expect(paths[0]).toContain('M0 0')
    expect(paths[0]).toContain('L100 100')
  })

  test('curved segment', () => {
    const paths = vectorNetworkToSVGPaths({
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      ],
      segments: [
        {
          start: 0,
          end: 1,
          tangentStart: { x: 0, y: 50 },
          tangentEnd: { x: 0, y: 50 }
        }
      ],
      regions: []
    })
    expect(paths).toHaveLength(1)
    expect(paths[0]).toContain('C')
  })

  test('traces arbitrarily ordered open segments as one path', () => {
    const paths = vectorNetworkToSVGPaths({
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 }
      ],
      segments: [
        { start: 1, end: 2, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } },
        { start: 0, end: 1, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } },
        { start: 2, end: 3, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }
      ],
      regions: []
    })

    expect(paths).toEqual(['M0 0L10 0L20 0L30 0'])
  })

  test('region with loop', () => {
    const paths = vectorNetworkToSVGPaths({
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 }
      ],
      segments: [
        { start: 0, end: 1, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } },
        { start: 1, end: 2, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } },
        { start: 2, end: 0, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }
      ],
      regions: [{ windingRule: 'NONZERO', loops: [[0, 1, 2]] }]
    })
    expect(paths).toHaveLength(1)
    expect(paths[0]).toContain('M0 0')
    expect(paths[0]).toContain('Z')
  })

  test('traces non-directional region segments continuously', () => {
    const paths = vectorNetworkToSVGPaths({
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 }
      ],
      segments: [
        { start: 1, end: 0, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } },
        { start: 1, end: 2, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } },
        { start: 0, end: 2, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }
      ],
      regions: [{ windingRule: 'NONZERO', loops: [[0, 1, 2]] }]
    })

    expect(paths).toEqual(['M0 0L100 0L50 100L0 0Z'])
  })

  test('starts a new subpath for disconnected region segments', () => {
    const paths = vectorNetworkToSVGPaths({
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 }
      ],
      segments: [
        { start: 0, end: 1, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } },
        { start: 2, end: 3, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }
      ],
      regions: [{ windingRule: 'NONZERO', loops: [[0, 1]] }]
    })

    expect(paths).toEqual(['M0 0L10 0M20 0L30 0'])
  })

  test('recognizes closed unfilled segment chains', () => {
    const paths = vectorNetworkToSVGPaths({
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 }
      ],
      segments: [
        { start: 0, end: 1, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } },
        { start: 1, end: 2, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } },
        { start: 2, end: 0, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }
      ],
      regions: []
    })

    expect(paths).toEqual(['M10 0L0 10L0 0L10 0Z'])
  })

  test('empty network', () => {
    const paths = vectorNetworkToSVGPaths({ vertices: [], segments: [], regions: [] })
    expect(paths).toHaveLength(0)
  })
})

describe('vectorNetworkToSVGPaths() with regions and open segments', () => {
  const corner = { x: 0, y: 0 }
  const line = (start: number, end: number) => ({
    start,
    end,
    tangentStart: corner,
    tangentEnd: corner
  })

  /** A skip-back icon: a filled triangle beside a bar, which no region encloses. */
  const network: VectorNetwork = {
    vertices: [
      { x: 19, y: 20 },
      { x: 9, y: 12 },
      { x: 19, y: 4 },
      { x: 5, y: 19 },
      { x: 5, y: 5 }
    ],
    segments: [line(0, 1), line(1, 2), line(2, 0), line(3, 4)],
    regions: [{ windingRule: 'NONZERO', loops: [[0, 1, 2]] }]
  }

  test('segments outside every region draw as open paths after the regions', () => {
    expect(vectorNetworkToSVGPaths(network)).toEqual(['M19 20L9 12L19 4L19 20Z', 'M5 19L5 5'])
  })

  test('a network with regions only draws the regions', () => {
    expect(vectorNetworkToSVGPaths({ ...network, segments: network.segments.slice(0, 3) })).toEqual(
      ['M19 20L9 12L19 4L19 20Z']
    )
  })
})
