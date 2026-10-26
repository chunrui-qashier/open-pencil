import { describe, expect, test } from 'bun:test'

import { enabledSkillsFrom, type SkillPreferences } from '@/app/ai/skills/preferences'

import { skillFixture } from '#tests/helpers/chat/skills'

const none: SkillPreferences = { sources: {}, skills: {} }

describe('enabledSkillsFrom', () => {
  test('offers every skill found until the user turns it off', () => {
    const skills = [skillFixture(), skillFixture({ name: 'type-scale', source: 'claude' })]
    expect(enabledSkillsFrom(skills, none)).toEqual(skills)
  })

  test('leaves out a source or a skill the user turned off', () => {
    const grid = skillFixture()
    const scale = skillFixture({ name: 'type-scale', source: 'claude' })
    expect(enabledSkillsFrom([grid, scale], { sources: { claude: false }, skills: {} })).toEqual([
      grid
    ])
    expect(
      enabledSkillsFrom([grid, scale], { sources: {}, skills: { 'agents/grid': false } })
    ).toEqual([scale])
  })

  test('offers the first skill of a name, and the next once the first is off', () => {
    const shared = skillFixture()
    const claude = skillFixture({ source: 'claude' })
    expect(enabledSkillsFrom([shared, claude], none)).toEqual([shared])
    expect(
      enabledSkillsFrom([shared, claude], { sources: {}, skills: { 'agents/grid': false } })
    ).toEqual([claude])
  })
})
