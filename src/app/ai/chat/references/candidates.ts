import type { SceneGraph } from '@open-pencil/scene-graph'

import type { AgentCommand } from '@/app/ai/agents/acp/commands'
import { runnableSkills } from '@/app/ai/skills/invoke'
import type { Skill } from '@/app/ai/skills/types'

import type { ChatReference } from './link'

/** Layers past this many are left out of `@` completions; typing more narrows the rest. */
const MAX_LAYERS = 500

/** Something `@` can insert, with what to show beside it: a layer's page. */
export interface ReferenceCandidate {
  reference: ChatReference
  detail: string | null
}

/** A command `/` starts a message with: a skill to run, or one of an ACP agent's commands. */
export interface CommandCandidate {
  label: string
  detail: string
  /** The text the message starts with. */
  insert: string
}

/**
 * What `@` offers: layers on the current page, then on the other loaded pages, then the pages
 * themselves and the skills. Pages that have not loaded yet contribute only their name.
 */
export function referenceCandidates(
  graph: Pick<SceneGraph, 'getPages' | 'getChildren'>,
  currentPageId: string,
  skills: readonly Skill[]
): ReferenceCandidate[] {
  const pages = graph.getPages()
  const ordered = [
    ...pages.filter((page) => page.id === currentPageId),
    ...pages.filter((page) => page.id !== currentPageId)
  ]
  const layers: ReferenceCandidate[] = []
  const walk = (parentId: string, pageName: string | null) => {
    for (const child of graph.getChildren(parentId)) {
      if (layers.length >= MAX_LAYERS) return
      layers.push({
        reference: { kind: 'node', id: child.id, label: child.name },
        detail: pageName
      })
      walk(child.id, pageName)
    }
  }
  for (const page of ordered) walk(page.id, page.id === currentPageId ? null : page.name)
  return [
    ...layers,
    ...pages.map((page) => ({
      reference: { kind: 'page' as const, id: page.id, label: page.name },
      detail: null
    })),
    ...skills.map((skill) => ({
      reference: { kind: 'skill' as const, id: skill.name, label: skill.name },
      detail: null
    }))
  ]
}

/** What `/` offers: an ACP agent's own commands, or else the skills the user can run. */
export function commandCandidates(
  agentCommands: readonly AgentCommand[] | null,
  skills: readonly Skill[]
): CommandCandidate[] {
  if (agentCommands) {
    return agentCommands.map((command) => ({
      label: `/${command.name}`,
      detail: command.description,
      insert: `/${command.name} `
    }))
  }
  return runnableSkills(skills).map((skill) => ({
    label: `/skill:${skill.name}`,
    detail: skill.description,
    insert: `/skill:${skill.name} `
  }))
}
