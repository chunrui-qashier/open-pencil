import type { HarnessSkill } from '@open-pencil/harness'

import { appSkillLibrary, type SkillLibrary } from './library'
import type { Skill } from './types'

/**
 * Text a session may carry in skills, well inside the harness protocol's 1 MB line, which also
 * holds the instructions and MCP settings. Files past it are left out; the instructions stay.
 */
const MAX_SKILLS_TEXT = 512 * 1024

async function skillFiles(skill: Skill, budget: { left: number }): Promise<HarnessSkill['files']> {
  const files: NonNullable<HarnessSkill['files']> = []
  for (const path of skill.files) {
    const content = await skill.readFile(path).catch(() => null)
    if (content === null || content.length > budget.left) continue
    budget.left -= content.length
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
  const budget = { left: MAX_SKILLS_TEXT }
  const skills: HarnessSkill[] = []
  for (const skill of library.enabled()) {
    if (!skill.modelInvocable) continue
    const size = skill.description.length + skill.instructions.length
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
