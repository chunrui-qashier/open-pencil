import { parseSkill } from './parse'
import type { Skill, SkillProblem, SkillSourceID } from './types'

/** A skill folder as a source holds it: its SKILL.md and the other files it can read. */
export interface SkillFolderContents {
  source: SkillSourceID
  /** The folder's name, or null for a SKILL.md that came without one. */
  folder: string | null
  location: string
  skillFile: string
  files: readonly string[]
  readFile: (path: string) => Promise<string>
}

/** The skill a folder holds, or why it holds none. */
export function skillFromFolder(contents: SkillFolderContents): Skill | SkillProblem {
  const { source, folder, location, skillFile, files, readFile } = contents
  const parsed = parseSkill(skillFile, folder)
  if (!parsed.ok) return { source, folder: folder ?? location, location, error: parsed.error }
  return { ...parsed.skill, source, location, files, readFile, warnings: parsed.warnings }
}

export function isSkill(entry: Skill | SkillProblem): entry is Skill {
  return !('error' in entry)
}
