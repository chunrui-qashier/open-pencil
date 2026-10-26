import type { HarnessSkill } from '@open-pencil/harness'

import { appSkillLibrary, type SkillLibrary } from './library'
import type { Skill } from './types'

/**
 * UTF-8 bytes a session may carry in skills, well inside the harness protocol's 1 MB line, which
 * also holds the instructions and MCP settings, and JSON escaping can nearly double plain text.
 * Files past it are left out; the instructions stay.
 */
const MAX_SKILLS_BYTES = 384 * 1024

const encoder = new TextEncoder()
const byteLength = (text: string) => encoder.encode(text).byteLength

async function skillFiles(skill: Skill, budget: { left: number }): Promise<HarnessSkill['files']> {
  const files: NonNullable<HarnessSkill['files']> = []
  for (const path of skill.files) {
    const content = await skill.readFile(path).catch(() => null)
    const size = content === null ? 0 : byteLength(content)
    if (content === null || size > budget.left) continue
    budget.left -= size
    files.push({ path, content })
  }
  return files
}

/**
 * The enabled skills the model may load, as Pi's harness writes them into its own skills
 * folder; Pi lists them and loads them itself.
 */
export async function harnessSkills(
  library: SkillLibrary = appSkillLibrary
): Promise<HarnessSkill[]> {
  await library.refresh()
  const budget = { left: MAX_SKILLS_BYTES }
  const skills: HarnessSkill[] = []
  for (const skill of library.enabled()) {
    if (!skill.modelInvocable) continue
    const size = byteLength(skill.description) + byteLength(skill.instructions)
    if (size > budget.left) continue
    budget.left -= size
    skills.push({
      name: skill.name,
      description: skill.description,
      content: skill.instructions,
      files: await skillFiles(skill, budget)
    })
  }
  return skills
}
