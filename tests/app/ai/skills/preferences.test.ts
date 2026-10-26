import { describe, expect, test } from 'bun:test'

import { enabledSkillsFrom, type SkillPreferences } from '@/app/ai/skills/preferences'

import { skillFixture } from '#tests/helpers/chat/skills'

const none: SkillPreferences = { sources: {}, skills: {}, trustedFolders: {} }

describe('enabledSkillsFrom', () => {
  test('offers every skill found until the user turns it off', () => {
    const skills = [skillFixture(), skillFixture({ name: 'type-scale', source: 'claude' })]
    expect(enabledSkillsFrom(skills, none)).toEqual(skills)
  })

  test('leaves out a source or a skill the user turned off', () => {
    const grid = skillFixture()
    const scale = skillFixture({ name: 'type-scale', source: 'claude' })
    expect(enabledSkillsFrom([grid, scale], { ...none, sources: { claude: false } })).toEqual([
      grid
    ])
    expect(enabledSkillsFrom([grid, scale], { ...none, skills: { 'agents/grid': false } })).toEqual(
      [scale]
    )
  })

  test('offers the first skill of a name, and the next once the first is off', () => {
    const shared = skillFixture()
    const claude = skillFixture({ source: 'claude' })
    expect(enabledSkillsFrom([shared, claude], none)).toEqual([shared])
    expect(
      enabledSkillsFrom([shared, claude], { ...none, skills: { 'agents/grid': false } })
    ).toEqual([claude])
  })

  test('offers a skill from a folder near the document only once the folder is trusted', () => {
    const folder = '/work/site/.agents/skills'
    const project = skillFixture({ source: 'project', skillsFolder: folder })
    const shared = skillFixture({ name: 'type-scale' })
    expect(enabledSkillsFrom([project, shared], none)).toEqual([shared])
    const trusted = { ...none, trustedFolders: { [folder]: true } }
    expect(enabledSkillsFrom([project, shared], trusted)).toEqual([project, shared])
    expect(
      enabledSkillsFrom([project], { ...trusted, skills: { [`project/${folder}/grid`]: false } })
    ).toEqual([])
  })
})
