import 'fake-indexeddb/auto'
import { expect, spyOn, test } from 'bun:test'

import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'

import { FigmaAPI } from '@open-pencil/core/figma-api'

import type { ThinkingLevel } from '@/app/ai/models/types'
import type { Skill } from '@/app/ai/skills/types'
import { aiToolOverrides } from '@/app/ai/tools/preferences'
import { createToolLoopTransport } from '@/app/ai/transports/tool-loop'
import * as figmaFactory from '@/app/automation/bridge/figma-factory'
import { createEditorStore } from '@/app/editor/session/create'

import { skillFixture } from '#tests/helpers/chat/skills'
import { MOCK_USAGE } from '#tests/helpers/chat/usage'

function replyModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: null,
        chunkDelayInMs: null,
        chunks: [
          { type: 'text-start', id: 'reply' },
          { type: 'text-delta', id: 'reply', delta: 'Done' },
          { type: 'text-end', id: 'reply' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            usage: MOCK_USAGE
          }
        ]
      })
    })
  })
}

async function send(transport: ReturnType<typeof createToolLoopTransport>): Promise<void> {
  const stream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'thinking-level',
    messageId: undefined,
    abortSignal: undefined,
    messages: [{ id: 'user', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }]
  })
  const reader = stream.getReader()
  try {
    while (!(await reader.read()).done);
  } finally {
    reader.releaseLock()
  }
}

test('each message uses the thinking level chosen when it is sent', async () => {
  const store = createEditorStore()
  const model = replyModel()
  let level: ThinkingLevel = 'high'
  try {
    const transport = createToolLoopTransport({
      store,
      providerID: 'anthropic',
      model,
      effectiveModelID: 'claude-test',
      maxOutputTokens: 100,
      thinkingLevel: () => level
    })
    await send(transport)
    level = 'off'
    await send(transport)
    level = 'default'
    await send(transport)
    expect(model.doStreamCalls.map((call) => call.reasoning)).toEqual(['high', 'none', undefined])
    // Prompt caching survives alongside the reasoning level.
    expect(model.doStreamCalls[0]?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } }
    })
  } finally {
    store.dispose()
  }
})

test('OpenRouter receives the level as its own reasoning option', async () => {
  const store = createEditorStore()
  const model = replyModel()
  try {
    const transport = createToolLoopTransport({
      store,
      providerID: 'openrouter',
      model,
      effectiveModelID: 'openai/gpt-test',
      maxOutputTokens: 100,
      thinkingLevel: () => 'minimal'
    })
    await send(transport)
    expect(model.doStreamCalls[0]?.providerOptions).toEqual({
      openrouter: { reasoning: { effort: 'minimal' } }
    })
  } finally {
    store.dispose()
  }
})

test('enabled skills reach the model as a listing and the tools that load them', async () => {
  const store = createEditorStore()
  const model = replyModel()
  // Each message reads the skills again; the second finds none left.
  const reads: Skill[][] = [[skillFixture()], []]
  let enabled: Skill[] = []
  try {
    const transport = createToolLoopTransport({
      store,
      providerID: 'anthropic',
      model,
      effectiveModelID: 'claude-test',
      maxOutputTokens: 100,
      thinkingLevel: () => 'default',
      skills: {
        refresh: async () => {
          enabled = reads.shift() ?? []
        },
        enabled: () => enabled
      }
    })
    await send(transport)
    await send(transport)
    const [withSkills, without] = model.doStreamCalls.map((call) => ({
      system: call.prompt.flatMap((message) =>
        message.role === 'system' ? [message.content] : []
      ),
      tools: (call.tools ?? []).map((tool) => tool.name)
    }))
    expect(withSkills?.system.join('\n')).toContain('<name>grid</name>')
    expect(withSkills?.tools).toEqual(expect.arrayContaining(['load_skill', 'read_skill_file']))
    expect(without?.system.join('\n')).not.toContain('<name>grid</name>')
    expect(without?.tools).not.toContain('load_skill')
  } finally {
    store.dispose()
  }
})

test('skills the user runs only by name are neither listed nor loadable', async () => {
  const store = createEditorStore()
  const model = replyModel()
  const manual = skillFixture({ name: 'release', modelInvocable: false })
  try {
    const transport = createToolLoopTransport({
      store,
      providerID: 'anthropic',
      model,
      effectiveModelID: 'claude-test',
      maxOutputTokens: 100,
      thinkingLevel: () => 'default',
      skills: { refresh: async () => undefined, enabled: () => [manual] }
    })
    await send(transport)
    const [call] = model.doStreamCalls
    expect((call?.tools ?? []).map((tool) => tool.name)).not.toContain('load_skill')
    expect(JSON.stringify(call?.prompt)).not.toContain('release')
  } finally {
    store.dispose()
  }
})

test('a waiting message ends the run once the current tool calls finish', async () => {
  const previousTools = aiToolOverrides.value
  const store = createEditorStore()
  const factory = spyOn(figmaFactory, 'makeFigmaFromStore').mockImplementation(
    (editor) => new FigmaAPI(editor.graph)
  )
  let calls = 0
  const model = new MockLanguageModelV4({
    doStream: async () => {
      calls++
      return {
        stream: simulateReadableStream({
          initialDelayInMs: null,
          chunkDelayInMs: null,
          chunks: [
            {
              type: 'tool-call',
              toolCallId: `call-${calls}`,
              toolName: 'get_selection',
              input: '{}'
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: undefined },
              usage: MOCK_USAGE
            }
          ]
        })
      }
    }
  })
  let waiting = false
  try {
    aiToolOverrides.value = {}
    const transport = createToolLoopTransport({
      store,
      providerID: 'openai',
      model,
      effectiveModelID: 'test',
      maxOutputTokens: 100,
      thinkingLevel: () => 'default',
      yieldWhen: () => waiting
    })
    waiting = true
    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'steer',
      messageId: undefined,
      messages: [{ id: 'user', role: 'user', parts: [{ type: 'text', text: 'Inspect' }] }],
      abortSignal: undefined
    })
    const reader = stream.getReader()
    const types: string[] = []
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        types.push(next.value.type)
      }
    } finally {
      reader.releaseLock()
    }
    // One model step: its tool call ran and has its result, then the run gave way.
    expect(calls).toBe(1)
    expect(types).toContain('tool-output-available')
  } finally {
    aiToolOverrides.value = previousTools
    factory.mockRestore()
    store.dispose()
  }
})
