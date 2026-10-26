import type { Completion, CompletionContext, CompletionSource } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import type { Component } from 'vue'
import IconBookOpen from '~icons/lucide/book-open'
import IconFile from '~icons/lucide/file'
import IconSquareSlash from '~icons/lucide/square-slash'

import type { CommandCandidate, ReferenceCandidate } from '@/app/ai/chat/references/candidates'
import { referenceLink, type ChatReferenceKind } from '@/app/ai/chat/references/link'
import { sceneNodeIcon } from '@/components/icons'

/** A completion with the glyph its row shows: a layer's kind, a page, a skill, a command. */
export interface ComposerCompletion extends Completion {
  icon: Component
}

export function completionIcon(completion: Completion): Component | null {
  return 'icon' in completion ? (completion as ComposerCompletion).icon : null
}

export interface ComposerSections {
  node: string
  page: string
  skill: string
  command: string
}

/** A layer shows its own kind's glyph; these stand in for the rest. */
const KIND_ICONS: Record<ChatReferenceKind, Component> = {
  node: IconFile,
  page: IconFile,
  skill: IconBookOpen
}

const SECTION_RANK: Record<ChatReferenceKind, number> = { node: 0, page: 1, skill: 2 }

/** Replaces the typed `@query`, its `@` included, with the reference and a space after it. */
function insertReference(link: string) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const insert = `${link} `
    view.dispatch({
      changes: { from: from - 1, to, insert },
      selection: { anchor: from - 1 + insert.length },
      userEvent: 'input.complete'
    })
  }
}

/** `@` anywhere offers layers, pages, and skills, inserted as reference links. */
export function referenceCompletion(
  candidates: (query: string) => readonly ReferenceCandidate[],
  sections: () => ComposerSections
): CompletionSource {
  return (context: CompletionContext) => {
    const typed = context.matchBefore(/(?:^|[\s([])@[^\s@]*$/)
    if (!typed) return null
    const at = typed.text.lastIndexOf('@')
    const names = sections()
    // No `validFor`: the source runs again as the query grows, since it caps how many it lists.
    return {
      from: typed.from + at + 1,
      options: candidates(typed.text.slice(at + 1)).map(
        ({ reference, detail, node }): ComposerCompletion => ({
          icon: node ? sceneNodeIcon(node) : KIND_ICONS[reference.kind],
          label: reference.label || reference.id,
          detail: detail ?? undefined,
          section: { name: names[reference.kind], rank: SECTION_RANK[reference.kind] },
          apply: insertReference(referenceLink(reference))
        })
      )
    }
  }
}

/** `/` at the start of a message offers commands; one replaces any command already there. */
export function commandCompletion(
  candidates: () => readonly CommandCandidate[],
  sections: () => ComposerSections
): CompletionSource {
  return (context: CompletionContext) => {
    const typed = context.matchBefore(/^\/\S*$/)
    if (typed?.from !== 0) return null
    const section = sections().command
    return {
      from: 0,
      validFor: /^\/\S*$/,
      options: candidates().map((command): ComposerCompletion => ({
        icon: command.kind === 'skill' ? IconBookOpen : IconSquareSlash,
        label: command.label,
        detail: command.detail,
        section,
        apply: command.insert
      }))
    }
  }
}
