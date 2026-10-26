import type { Completion, CompletionContext, CompletionSource } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'

import type { CommandCandidate, ReferenceCandidate } from '@/app/ai/chat/references/candidates'
import { referenceLink, type ChatReferenceKind } from '@/app/ai/chat/references/link'

export interface ComposerSections {
  node: string
  page: string
  skill: string
  command: string
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
  candidates: () => readonly ReferenceCandidate[],
  sections: () => ComposerSections
): CompletionSource {
  return (context: CompletionContext) => {
    const typed = context.matchBefore(/(?:^|[\s([])@[^\s@]*$/)
    if (!typed) return null
    const at = typed.text.lastIndexOf('@')
    const names = sections()
    return {
      from: typed.from + at + 1,
      validFor: /^[^\s@]*$/,
      options: candidates().map(({ reference, detail }) => ({
        label: reference.label || reference.id,
        detail: detail ?? undefined,
        section: { name: names[reference.kind], rank: SECTION_RANK[reference.kind] },
        apply: insertReference(referenceLink(reference))
      }))
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
      options: candidates().map((command) => ({
        label: command.label,
        detail: command.detail,
        section,
        apply: command.insert
      }))
    }
  }
}
