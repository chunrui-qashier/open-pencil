<script setup lang="ts">
import type { CompletionSource } from '@codemirror/autocomplete'
import type { ChatStatus } from 'ai'
import { TooltipProvider } from 'reka-ui'
import { computed, useTemplateRef } from 'vue'

import { useI18n } from '@open-pencil/vue/i18n'

import { useChatEditor } from '@/components/chat/composer/useChatEditor'
import IconButton from '@/components/ui/button/IconButton.vue'
import InputGroup from '@/components/ui/input/InputGroup.vue'

const {
  status,
  disabled = false,
  completions = []
} = defineProps<{
  status: ChatStatus
  disabled?: boolean
  /** What `@` and `/` offer; read once, when the field mounts. */
  completions?: CompletionSource[]
}>()
const emit = defineEmits<{
  submit: [text: string]
  stop: []
  settings: []
  paste: [event: ClipboardEvent]
}>()
const { ai } = useI18n()
const isStreaming = computed(() => disabled || status === 'streaming' || status === 'submitted')
const host = useTemplateRef<HTMLDivElement>('host')
const editor = useChatEditor(host, {
  label: () => ai.value.describeChange,
  placeholder: () => ai.value.describeChange,
  editable: () => !isStreaming.value,
  attributes: { 'data-test-id': 'chat-input' },
  completions,
  onSubmit: submit
})
const { text } = editor

function submit() {
  if (isStreaming.value) return
  const message = text.value.trim()
  if (!message) return
  emit('submit', message)
  editor.setText('')
}

function handleSubmit(event: Event) {
  event.preventDefault()
  submit()
}

/**
 * Puts back a message that could not be sent, unless something new was typed meanwhile.
 * Returns whether it did.
 */
function restoreDraft(draft: string): boolean {
  if (text.value.trim()) return false
  editor.setText(draft)
  return true
}
defineExpose({ restoreDraft, insert: editor.insert, focus: editor.focus })
</script>
<template>
  <TooltipProvider>
    <div class="shrink-0 border-t border-border p-2.5">
      <form class="relative" @submit="handleSubmit" @paste.stop="emit('paste', $event)">
        <InputGroup :disabled="isStreaming">
          <template v-if="$slots.attachment" #attachment><slot name="attachment" /></template>

          <div ref="host" class="min-w-0" @copy.stop @cut.stop />

          <template #leading><slot name="leading" /></template>

          <template #model><slot name="model" /></template>

          <template #actions>
            <IconButton
              :label="ai.providerSettings"
              size="sm"
              data-test-id="provider-settings-trigger"
              @click="emit('settings')"
            >
              <icon-lucide-settings class="size-3.5" />
            </IconButton>
            <IconButton
              v-if="isStreaming"
              :label="ai.stopGenerating"
              size="sm"
              data-test-id="chat-stop-button"
              class="border border-border"
              @click="emit('stop')"
            >
              <icon-lucide-square class="size-3" />
            </IconButton>
            <IconButton
              v-else
              :label="ai.sendMessage"
              size="sm"
              type="submit"
              data-test-id="chat-send-button"
              class="bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent"
              :disabled="!text.trim()"
            >
              <icon-lucide-send class="size-3.5" />
            </IconButton>
          </template>
        </InputGroup>
        <!-- Over the input while files are dragged onto the chat. -->
        <slot name="overlay" />
      </form>
    </div>
  </TooltipProvider>
</template>
