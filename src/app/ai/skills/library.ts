import { computed, shallowRef } from 'vue'

import { IS_TAURI } from '@open-pencil/core/constants'

import { enabledSkillsFrom, skillPreferences } from './preferences'
import { nativeHomeSkillReader, readHomeSkills } from './sources/home'
import {
  createIDBUploadedSkillStore,
  skillFromUpload,
  skillsFromUploads,
  type SkillUpload,
  type UploadedSkillStore
} from './sources/uploaded'
import type { Skill, SkillScan } from './types'

/** What the chat needs from skills: a fresh read before a message, then the enabled list. */
export interface SkillLibrary {
  refresh: () => Promise<void>
  enabled: () => readonly Skill[]
}

/** Every skill found, and the folders that failed, from the last read. */
export const foundSkills = shallowRef<SkillScan>({ skills: [], problems: [] })

export const enabledSkills = computed(() =>
  enabledSkillsFrom(foundSkills.value.skills, skillPreferences.value)
)

let uploads: UploadedSkillStore | null = null
function uploadedSkillStore(): UploadedSkillStore {
  uploads ??= createIDBUploadedSkillStore()
  return uploads
}

async function readHomeFolders(): Promise<SkillScan> {
  // The browser has no skill folders to read.
  if (!IS_TAURI) return { skills: [], problems: [] }
  const { homeDir } = await import('@tauri-apps/api/path')
  return readHomeSkills(await homeDir(), await nativeHomeSkillReader())
}

let reading: Promise<void> | null = null

/** Reads uploaded skills and the skill folders again; uploads come first when names repeat. */
export function refreshSkills(): Promise<void> {
  reading ??= (async () => {
    try {
      const [uploaded, home] = await Promise.all([
        uploadedSkillStore().list().then(skillsFromUploads),
        readHomeFolders()
      ])
      foundSkills.value = {
        skills: [...uploaded.skills, ...home.skills],
        problems: [...uploaded.problems, ...home.problems]
      }
    } catch (error) {
      // The last read stays; a message must not fail because a folder could not be read.
      console.warn('Could not read skills', error)
    } finally {
      reading = null
    }
  })()
  return reading
}

/** Keeps a picked file as a skill when it is one, replacing an upload with the same name. */
export async function uploadSkill(file: File): Promise<SkillUpload> {
  const upload = await skillFromUpload(file)
  if (upload.ok) {
    await uploadedSkillStore().put(upload.skill)
    await refreshSkills()
  }
  return upload
}

export async function removeUploadedSkill(name: string): Promise<void> {
  await uploadedSkillStore().remove(name)
  await refreshSkills()
}

export const appSkillLibrary: SkillLibrary = {
  refresh: refreshSkills,
  enabled: () => enabledSkills.value
}
