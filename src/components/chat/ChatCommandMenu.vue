<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from 'reka-ui'
import { tv } from 'tailwind-variants'

import { useAIMessages } from '@open-pencil/vue/i18n'

import type { ChatCommandItem } from '@/app/ai/chat/commands'
import { menuItem, useMenuUI } from '@/components/ui/menu/menu'
import MenuScrollArea from '@/components/ui/menu/MenuScrollArea.vue'
import Tip from '@/components/ui/overlay/Tip.vue'
import iconButtonTheme from '@/theme/button/icon-button'

const {
  items,
  heading,
  empty,
  disabled = false
} = defineProps<{
  items: readonly ChatCommandItem[]
  heading: string
  /** Why the list is empty and where its entries come from. */
  empty: string
  disabled?: boolean
}>()
const emit = defineEmits<{ open: []; pick: [command: string] }>()

const ai = useAIMessages()
const menu = useMenuUI({ content: 'w-72' })
const item = menuItem({ justify: 'start' })
const triggerClass = tv(iconButtonTheme)({ size: 'sm' })

/** The command picked, handed over once the menu has closed so focus can go to the message. */
let picked: string | null = null

function pick(command: string) {
  picked = command
}

function closeAutoFocus(event: Event) {
  if (picked === null) return
  event.preventDefault()
  emit('pick', picked)
  picked = null
}
</script>

<template>
  <DropdownMenuRoot @update:open="$event && emit('open')">
    <Tip :label="ai.chatCommands">
      <DropdownMenuTrigger
        :class="triggerClass"
        :aria-label="ai.chatCommands"
        :disabled="disabled"
        data-test-id="chat-command-menu"
      >
        <icon-lucide-square-slash class="size-4" />
      </DropdownMenuTrigger>
    </Tip>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="start"
        side="top"
        :side-offset="6"
        :collision-padding="8"
        :class="menu.content"
        @close-auto-focus="closeAutoFocus"
      >
        <DropdownMenuLabel :class="menu.label">{{ heading }}</DropdownMenuLabel>
        <MenuScrollArea>
          <DropdownMenuItem
            v-for="entry in items"
            :key="entry.command"
            :class="[item, 'items-start']"
            @select="pick(entry.command)"
          >
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="truncate font-medium">{{ entry.name }}</span>
              <span class="line-clamp-2 text-muted">{{ entry.description }}</span>
            </span>
          </DropdownMenuItem>
          <p v-if="!items.length" class="px-2 py-1.5 text-[11px] text-muted">
            {{ empty }}
          </p>
        </MenuScrollArea>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
