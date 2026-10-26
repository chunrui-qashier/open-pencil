import { computed, ref, shallowRef } from 'vue'

import { IS_TAURI } from '@open-pencil/core/constants'

import {
  enabledSkills,
  foundSkills,
  refreshSkills,
  removeUploadedSkill,
  uploadSkill
} from '../library'
import {
  isSkillEnabled,
  isSkillSourceEnabled,
  skillPreferenceKey,
  skillPreferences
} from '../preferences'
import { HOME_SKILL_SOURCES } from '../sources/home'
import type { SkillUploadFailure } from '../sources/uploaded'
import type { Skill, SkillProblem, SkillSourceID } from '../types'

export interface SkillListEntry {
  skill: Skill
  enabled: boolean
  /** On, but another source's skill with the same name is offered instead. */
  shadowed: boolean
}

/** The skill the details show, with whether its source is on. */
export interface SelectedSkill extends SkillListEntry {
  sourceEnabled: boolean
}

export interface SkillSourceGroup {
  source: SkillSourceID
  /** The folder it reads, as the user sees it; null for uploads. */
  folder: string | null
  enabled: boolean
  skills: SkillListEntry[]
  problems: SkillProblem[]
}

/** Uploads exist everywhere; the folders other agents keep are read only on the desktop. */
const SOURCES: readonly { source: SkillSourceID; folder: string | null }[] = [
  { source: 'openpencil', folder: null },
  ...(IS_TAURI
    ? HOME_SKILL_SOURCES.map(({ id, folder }) => ({ source: id, folder: `~/${folder.join('/')}` }))
    : [])
]

export function useSkillsSettings() {
  const loading = ref(true)
  const uploading = ref(false)
  const uploadFailure = shallowRef<SkillUploadFailure | null>(null)
  const selectedKey = ref<string | null>(null)
  /** The details stay on the skill they showed while they slide away. */
  const detailOpen = ref(false)

  const groups = computed<SkillSourceGroup[]>(() => {
    const preferences = skillPreferences.value
    const offered = new Set(enabledSkills.value)
    return SOURCES.map(({ source, folder }) => ({
      source,
      folder,
      enabled: isSkillSourceEnabled(source, preferences),
      skills: foundSkills.value.skills
        .filter((skill) => skill.source === source)
        .map((skill) => {
          const enabled = isSkillEnabled(skill, preferences)
          return { skill, enabled, shadowed: enabled && !offered.has(skill) }
        }),
      problems: foundSkills.value.problems.filter((problem) => problem.source === source)
    }))
  })

  const selected = computed<SelectedSkill | null>(() => {
    const key = selectedKey.value
    if (key === null) return null
    for (const group of groups.value) {
      const entry = group.skills.find(({ skill }) => skillPreferenceKey(skill) === key)
      if (entry) return { ...entry, sourceEnabled: group.enabled }
    }
    return null
  })

  async function reload() {
    loading.value = true
    try {
      await refreshSkills()
    } finally {
      loading.value = false
    }
  }

  function setSourceEnabled(source: SkillSourceID, enabled: boolean) {
    const preferences = skillPreferences.value
    skillPreferences.value = {
      ...preferences,
      sources: { ...preferences.sources, [source]: enabled }
    }
  }

  function setSkillEnabled(skill: Skill, enabled: boolean) {
    const preferences = skillPreferences.value
    skillPreferences.value = {
      ...preferences,
      skills: { ...preferences.skills, [skillPreferenceKey(skill)]: enabled }
    }
  }

  async function upload(file: File) {
    uploading.value = true
    uploadFailure.value = null
    try {
      const result = await uploadSkill(file)
      if (!result.ok) uploadFailure.value = result
    } catch {
      uploadFailure.value = { reason: 'unreadable' }
    } finally {
      uploading.value = false
    }
  }

  function open(skill: Skill) {
    selectedKey.value = skillPreferenceKey(skill)
    detailOpen.value = true
  }

  function close() {
    detailOpen.value = false
  }

  function closed() {
    if (!detailOpen.value) selectedKey.value = null
  }

  async function remove(skill: Skill) {
    await removeUploadedSkill(skill.name)
    if (selectedKey.value === skillPreferenceKey(skill)) close()
  }

  void reload()

  return {
    groups,
    loading,
    uploading,
    uploadFailure,
    selected,
    detailOpen,
    open,
    close,
    closed,
    reload,
    setSourceEnabled,
    setSkillEnabled,
    upload,
    remove
  }
}
