import * as v from 'valibot'

import type { SceneGraph, SceneNode, VectorNetwork } from '@open-pencil/scene-graph'
import { parsePluginVectorPath, parseSVGPathData } from '@open-pencil/scene-graph/parse-path'
import type { Rect } from '@open-pencil/scene-graph/primitives'
import {
  mergeVectorNetworks,
  transformVectorNetwork
} from '@open-pencil/scene-graph/vector-network'

import { parseScriptInput } from '../schema'

const FILL_RULES = { nonzero: 'NONZERO', evenodd: 'EVENODD' } as const

const vectorPropsSchema = v.pipe(
  v.object({
    d: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty())),
    fillRule: v.optional(v.picklist(['nonzero', 'evenodd'])),
    paths: v.optional(
      v.array(
        v.object({
          windingRule: v.picklist(['NONZERO', 'EVENODD', 'NONE']),
          data: v.string()
        })
      )
    )
  }),
  v.check((props) => !(props.d && props.paths), 'Expected `d` or `paths`, not both')
)

function parsedNetwork(result: ReturnType<typeof parseSVGPathData>, which: string): VectorNetwork {
  if (!result.ok) throw new Error(`Invalid <Vector> ${which}: ${result.error}`)
  return result.network
}

/**
 * The vector network a `<Vector>`'s `d` or `paths` draws, in the coordinates they are written
 * in, or null when it has neither. `d` reads as SVG does; `paths` as Figma's `vectorPaths`.
 */
function vectorNetworkProp(props: Record<string, unknown>): VectorNetwork | null {
  const parsed = parseScriptInput('Invalid <Vector> props', vectorPropsSchema, props)
  if (parsed.d) {
    const windingRule = FILL_RULES[parsed.fillRule ?? 'nonzero']
    return parsedNetwork(parseSVGPathData(parsed.d, windingRule), '`d`')
  }
  if (!parsed.paths) return null
  return mergeVectorNetworks(
    parsed.paths.map(({ windingRule, data }, index) =>
      parsedNetwork(parsePluginVectorPath(data, windingRule), `paths[${index}]`)
    )
  )
}

/** The size a `<Vector>` is given: `w` and `h` when they are numbers. */
interface VectorSize {
  width?: number
  height?: number
}

/** The size a `<Vector>`'s props give it, by `w`/`width` and `h`/`height`. */
function vectorSize(props: Record<string, unknown>): VectorSize {
  const number = (value: unknown) => (typeof value === 'number' ? value : undefined)
  return {
    width: number(props.w) ?? number(props.width),
    height: number(props.h) ?? number(props.height)
  }
}

/**
 * The fields that place a vector network in its layer. On an axis the author sized, the path is
 * drawn in the layer's own box as written, as an SVG icon is in its view box. On an axis left
 * unsized, the layer takes the network's extent and moves to where it starts, as Figma's
 * `vectorPaths` setter does.
 */
function vectorGeometry(
  network: VectorNetwork,
  bounds: Rect,
  size: VectorSize,
  position: Pick<SceneNode, 'x' | 'y'>
): Partial<SceneNode> {
  const dx = size.width === undefined ? bounds.x : 0
  const dy = size.height === undefined ? bounds.y : 0
  return {
    x: position.x + dx,
    y: position.y + dy,
    width: size.width ?? bounds.width,
    height: size.height ?? bounds.height,
    vectorNetwork: transformVectorNetwork([1, 0, -dx, 0, 1, -dy, 0, 0, 1], network)
  }
}

/**
 * A `<Vector>`'s `d` or `paths` as its vector network, the layer sized to it. `vectorBounds`
 * measures the network, curves included, which the engine provides.
 */
export function placeVectorPaths(
  graph: SceneGraph,
  node: SceneNode,
  props: Record<string, unknown>,
  vectorBounds: (network: VectorNetwork) => Rect
): void {
  if (node.type !== 'VECTOR') return
  const network = vectorNetworkProp(props)
  if (!network) return
  graph.updateNode(node.id, vectorGeometry(network, vectorBounds(network), vectorSize(props), node))
}
