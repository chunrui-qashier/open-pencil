import { agentCommand, type AgentCommand } from '@/app/ai/agents/acp/commands'
import { runnableSkills, skillCommand } from '@/app/ai/skills/invoke'
import type { Skill } from '@/app/ai/skills/types'

/** One thing the person can run by name: a skill, or a command the agent offers. */
export interface ChatCommandItem {
  name: string
  description: string
  /** What the composer starts the message with: `/skill:grid ` or `/review `. */
  command: string
}

/** An ACP agent's own commands, which include its skills. */
export function agentCommandItems(commands: readonly AgentCommand[]): ChatCommandItem[] {
  return commands.map((command) => ({
    name: `/${command.name}`,
    description: command.description,
    command: agentCommand(command.name)
  }))
}

/** The user's skills, which the built-in chat and Pi run. */
export function skillCommandItems(skills: readonly Skill[]): ChatCommandItem[] {
  return runnableSkills(skills).map((skill) => ({
    name: skill.name,
    description: skill.description,
    command: skillCommand(skill.name)
  }))
}
