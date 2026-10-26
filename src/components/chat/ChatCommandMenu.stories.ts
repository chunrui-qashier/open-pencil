import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'

import type { ChatCommandItem } from '@/app/ai/chat/commands'

import ChatCommandMenu from './ChatCommandMenu.vue'

type Args = {
  items: ChatCommandItem[]
  heading: string
  empty: string
  onPick: (command: string) => void
}

const skills: ChatCommandItem[] = [
  {
    name: 'brand-review',
    description:
      'Check a layout against the brand guide: colors, type scale, spacing, and logo clear space.',
    command: '/skill:brand-review '
  },
  { name: 'grid', description: 'Lay out pages on an eight-point grid.', command: '/skill:grid ' }
]

const meta = {
  title: 'App/Chat/Command Menu',
  component: ChatCommandMenu,
  args: {
    items: skills,
    heading: 'Skills',
    empty: 'No skills to run. Add them in Settings › Skills.',
    onPick: fn()
  },
  render: (args) => ({
    components: { ChatCommandMenu },
    setup: () => ({ args }),
    template:
      '<div class="flex h-80 items-end bg-panel p-3"><ChatCommandMenu v-bind="args" /></div>'
  })
} satisfies Meta<Args>

export default meta
type Story = StoryObj<typeof meta>

export const Skills: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Skills and commands' })
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: /^grid / }))
    await expect(args.onPick).toHaveBeenCalledWith('/skill:grid ')
  }
}

export const AgentCommands: Story = {
  args: {
    heading: 'Claude Code commands',
    items: [
      { name: '/review', description: 'Review the current changes.', command: '/review ' },
      { name: '/init', description: 'Write a CLAUDE.md for this project.', command: '/init ' }
    ]
  }
}

export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Skills and commands' })
    )
    await expect(
      await screen.findByText('No skills to run. Add them in Settings › Skills.')
    ).toBeVisible()
  }
}
