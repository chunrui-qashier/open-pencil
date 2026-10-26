<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { useAIMessages } from '@open-pencil/vue/i18n'

import { foundSkills, refreshSkills } from '@/app/ai/skills/library'
import {
  isSkillEnabled,
  skillPreferenceKey,
  skillPreferences,
  withPickedSkills
} from '@/app/ai/skills/preferences'
import SettingsGroup from '@/components/settings/layout/SettingsGroup.vue'
import SettingsRow from '@/components/settings/layout/SettingsRow.vue'
import SettingsSection from '@/components/settings/layout/SettingsSection.vue'
import AppCheckbox from '@/components/ui/toggle/AppCheckbox.vue'

/**
 * The skills coding agents installed, offered to the design chat one by one: most are coding
 * workflows, so none is picked unless it already was. Shown only when there are some.
 */
const ai = useAIMessages()
const offered = computed(() =>
  foundSkills.value.skills.filter((skill) => skill.source === 'agents' || skill.source === 'claude')
)
const picked = ref(new Set<string>())

onMounted(async () => {
  await refreshSkills()
  picked.value = new Set(
    offered.value
      .filter((skill) => isSkillEnabled(skill, skillPreferences.value))
      .map(skillPreferenceKey)
  )
})

function toggle(key: string, on: boolean) {
  const next = new Set(picked.value)
  if (on) next.add(key)
  else next.delete(key)
  picked.value = next
}

/** Saves the picks with the rest of the setup. */
function apply() {
  if (offered.value.length === 0) return
  skillPreferences.value = withPickedSkills(skillPreferences.value, offered.value, picked.value)
}

defineExpose({ apply })
</script>

<template>
  <SettingsSection v-if="offered.length" data-test-id="ai-setup-skills">
    <template #title>{{ ai.aiSetupSkillsTitle }}</template>
    <template #description>{{ ai.aiSetupSkillsDescription }}</template>
    <SettingsGroup>
      <SettingsRow
        v-for="skill in offered"
        :key="skillPreferenceKey(skill)"
        as="label"
        :label="skill.name"
        :description="skill.description"
      >
        <AppCheckbox
          :model-value="picked.has(skillPreferenceKey(skill))"
          :ariaLabel="skill.name"
          @update:model-value="toggle(skillPreferenceKey(skill), $event)"
        />
      </SettingsRow>
    </SettingsGroup>
  </SettingsSection>
</template>
