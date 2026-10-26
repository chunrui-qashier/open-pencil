import { useLocalStorage } from '@vueuse/core'
import * as v from 'valibot'

import type { Skill, SkillSourceID } from './types'

const skillPreferencesSchema = v.object({
  sources: v.optional(v.record(v.string(), v.boolean()), {}),
  skills: v.optional(v.record(v.string(), v.boolean()), {}),
  trustedFolders: v.optional(v.record(v.string(), v.boolean()), {})
})

/**
 * The sources and skills the user turned off or back on, where everything else is on, as in
 * pi; and the skills folders near documents the user trusts, where everything else is off.
 */
export type SkillPreferences = v.InferOutput<typeof skillPreferencesSchema>

const storedPreferencesSchema = v.pipe(v.string(), v.parseJson(), skillPreferencesSchema)

export const skillPreferences = useLocalStorage<SkillPreferences>(
  'open-pencil:ai:skills',
  { sources: {}, skills: {}, trustedFolders: {} },
  {
    serializer: {
      read: (raw) => {
        const result = v.safeParse(storedPreferencesSchema, raw)
        return result.success ? result.output : { sources: {}, skills: {}, trustedFolders: {} }
      },
      write: JSON.stringify
    }
  }
)

/** A skill's toggle belongs to its source and folder, so the same name elsewhere keeps its own. */
export function skillPreferenceKey(skill: Pick<Skill, 'source' | 'name' | 'skillsFolder'>): string {
  return skill.skillsFolder === undefined
    ? `${skill.source}/${skill.name}`
    : `${skill.source}/${skill.skillsFolder}/${skill.name}`
}

/** A skills folder near a document runs nothing until the user trusts it. */
export function isSkillsFolderTrusted(path: string, preferences: SkillPreferences): boolean {
  return preferences.trustedFolders[path] ?? false
}

export function isSkillSourceEnabled(source: SkillSourceID, preferences: SkillPreferences) {
  return preferences.sources[source] ?? true
}

export function isSkillEnabled(skill: Skill, preferences: SkillPreferences): boolean {
  return (
    isSkillSourceEnabled(skill.source, preferences) &&
    (skill.skillsFolder === undefined || isSkillsFolderTrusted(skill.skillsFolder, preferences)) &&
    (preferences.skills[skillPreferenceKey(skill)] ?? true)
  )
}

/**
 * The skills the chat offers: those switched on, the first of each name in source order, as
 * pi and Amp resolve a name found twice. Turning the first off lets the next one through.
 */
export function enabledSkillsFrom(
  skills: readonly Skill[],
  preferences: SkillPreferences
): Skill[] {
  const seen = new Set<string>()
  return skills.filter((skill) => {
    if (!isSkillEnabled(skill, preferences) || seen.has(skill.name)) return false
    seen.add(skill.name)
    return true
  })
}
