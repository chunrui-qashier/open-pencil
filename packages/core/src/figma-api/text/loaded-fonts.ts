import type { SceneNode } from '@open-pencil/scene-graph'
import type { FontFamilyStyle } from '@open-pencil/scene-graph/font-style'

import { fontManager } from '#core/text/fonts'
import { collectNodeFontFaces } from '#core/text/requirements'

function loadHint({ family, style }: FontFamilyStyle): string {
  return `Please call figma.loadFontAsync({ family: "${family}", style: "${style}" }) and await the returned promise first.`
}

function isLoaded({ family, style }: FontFamilyStyle): boolean {
  return fontManager.isStyleLoaded(family, style)
}

/**
 * Figma refuses an edit that lays text out again until every font the text uses is loaded, so
 * the text is never measured in a stand-in font. Paints, links, and transforms need no font.
 */
export function assertTextFontsLoaded(method: string, node: SceneNode): void {
  const unloaded = collectNodeFontFaces(node).find((face) => !isLoaded(face))
  if (!unloaded) return
  throw new Error(
    `in ${method}: Cannot write to node with unloaded font "${unloaded.family} ${unloaded.style}". ${loadHint(unloaded)}`
  )
}

/** Figma refuses a font that is not loaded yet, before it checks the text's own. */
export function assertFontLoaded(method: string, font: FontFamilyStyle): void {
  if (isLoaded(font)) return
  throw new Error(
    `in ${method}: Cannot use unloaded font "${font.family} ${font.style}". ${loadHint(font)}`
  )
}
