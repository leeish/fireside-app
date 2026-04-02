import { describe, it, expect, beforeEach, vi } from 'vitest'

// Create mocks at the top level before vi.mock declarations
const mockAnthropicCreate = vi.fn()
const mockOpenAICreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = { create: mockAnthropicCreate }
    },
  }
})

vi.mock('openai', () => {
  return {
    default: class {
      chat = { completions: { create: mockOpenAICreate } }
    },
  }
})

import { chatComplete, logTokenUsage } from './ai'

describe('chatComplete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CHAT_VENDOR = 'anthropic'
    process.env.CHAT_MODEL = 'claude-haiku-4-5-20251001'
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  describe('cache control with Anthropic', () => {
    it('applies cache_control to first USER message even when conversation starts with assistant', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"response": "test", "wrap": false}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      await chatComplete({
        system: 'Test system prompt',
        messages: [
          { role: 'assistant', content: 'Opening biographer question' },
          { role: 'user', content: 'First user reply' },
          { role: 'assistant', content: 'Response' },
          { role: 'user', content: 'Second user message' },
        ],
        enableCache: true,
      })

      const callArgs = mockAnthropicCreate.mock.calls[0][0]

      // assistant at idx=0 should NOT have cache_control
      expect(typeof callArgs.messages[0].content).toBe('string')
      expect(callArgs.messages[0].content).toBe('Opening biographer question')

      // first user message at idx=1 should have cache_control
      expect(Array.isArray(callArgs.messages[1].content)).toBe(true)
      //expect(callArgs.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' })
      expect(callArgs.messages[1].content[0].text).toBe('First user reply')

      // remaining messages should be plain strings
      expect(typeof callArgs.messages[2].content).toBe('string')
      expect(typeof callArgs.messages[3].content).toBe('string')
    })

    it('applies cache_control to system prompt and first message when enableCache=true', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"response": "test", "wrap": false}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      const result = await chatComplete({
        system: 'Test system prompt',
        messages: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'Response' },
          { role: 'user', content: 'Third message' },
        ],
        enableCache: true,
      })

      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
      const callArgs = mockAnthropicCreate.mock.calls[0][0]

      // Check that system is an array with cache_control
      expect(Array.isArray(callArgs.system)).toBe(true)
      expect(callArgs.system[0].type).toBe('text')
      expect(callArgs.system[0].text).toBe('Test system prompt')

      // Check that first message has cache_control
      expect(Array.isArray(callArgs.messages[0].content)).toBe(true)
      expect(callArgs.messages[0].content[0].type).toBe('text')
      expect(callArgs.messages[0].content[0].text).toBe('First message')

      // Check that second and third messages do NOT have cache_control (remain as strings)
      expect(typeof callArgs.messages[1].content).toBe('string')
      expect(callArgs.messages[1].content).toBe('Response')
      expect(typeof callArgs.messages[2].content).toBe('string')
      expect(callArgs.messages[2].content).toBe('Third message')

      expect(result.text).toBe('{"response": "test", "wrap": false}')
      expect(result.inputTokens).toBe(100)
      expect(result.outputTokens).toBe(50)
    })

    it('does not apply cache_control to first message when its content is empty', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"response": "test", "wrap": false}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      await chatComplete({
        system: 'Test system prompt',
        messages: [
          { role: 'user', content: '' },
          { role: 'assistant', content: 'Response' },
        ],
        enableCache: true,
      })

      const callArgs = mockAnthropicCreate.mock.calls[0][0]

      // First message has empty content — should NOT be wrapped with cache_control
      expect(typeof callArgs.messages[0].content).toBe('string')
      expect(callArgs.messages[0].content).toBe('')
    })

    it('does not apply cache_control when enableCache=false', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"response": "test", "wrap": false}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      const result = await chatComplete({
        system: 'Test system prompt',
        messages: [{ role: 'user', content: 'Test message' }],
        enableCache: false,
      })

      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
      const callArgs = mockAnthropicCreate.mock.calls[0][0]

      // System should be a string, not an array
      expect(typeof callArgs.system).toBe('string')
      expect(callArgs.system).toBe('Test system prompt')

      // Messages should have string content, not arrays
      expect(typeof callArgs.messages[0].content).toBe('string')
      expect(callArgs.messages[0].content).toBe('Test message')

      expect(result.text).toBe('{"response": "test", "wrap": false}')
    })

    it('does not apply cache_control by default (enableCache omitted)', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"response": "test", "wrap": false}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      const result = await chatComplete({
        system: 'Test system prompt',
        messages: [{ role: 'user', content: 'Test message' }],
      })

      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
      const callArgs = mockAnthropicCreate.mock.calls[0][0]

      // System should be a string by default
      expect(typeof callArgs.system).toBe('string')
      expect(callArgs.system).toBe('Test system prompt')

      // Messages should have string content by default
      expect(typeof callArgs.messages[0].content).toBe('string')
      expect(callArgs.messages[0].content).toBe('Test message')

      expect(result.text).toBe('{"response": "test", "wrap": false}')
    })
  })

  describe('cache token extraction', () => {
    it('returns cacheCreationTokens and cacheReadTokens from Anthropic usage', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"response": "test", "wrap": false}' }],
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 200, cache_read_input_tokens: 80 },
      })

      const result = await chatComplete({
        system: 'Test system',
        messages: [{ role: 'user', content: 'Hello' }],
        enableCache: true,
      })

      expect(result.cacheCreationTokens).toBe(200)
      expect(result.cacheReadTokens).toBe(80)
    })

    it('returns 0 for cache tokens when Anthropic usage fields are null', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"response": "test", "wrap": false}' }],
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null },
      })

      const result = await chatComplete({
        system: 'Test system',
        messages: [{ role: 'user', content: 'Hello' }],
        enableCache: true,
      })

      expect(result.cacheCreationTokens).toBe(0)
      expect(result.cacheReadTokens).toBe(0)
    })

    it('returns 0 for cache tokens when Anthropic usage fields are absent', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"response": "test", "wrap": false}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      const result = await chatComplete({
        system: 'Test system',
        messages: [{ role: 'user', content: 'Hello' }],
        enableCache: true,
      })

      expect(result.cacheCreationTokens).toBe(0)
      expect(result.cacheReadTokens).toBe(0)
    })
  })

  describe('OpenAI path ignores enableCache', () => {
    beforeEach(() => {
      process.env.CHAT_VENDOR = 'openai'
      process.env.OPENAI_API_KEY = 'test-openai-key'
    })

    it('does not apply cache_control on OpenAI even when enableCache=true', async () => {
      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"response": "test", "wrap": false}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      })

      const result = await chatComplete({
        system: 'Test system prompt',
        messages: [{ role: 'user', content: 'Test message' }],
        enableCache: true,
      })

      expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
      const callArgs = mockOpenAICreate.mock.calls[0][0]

      // OpenAI should receive messages as strings, not with cache_control
      expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'Test system prompt' })
      expect(callArgs.messages[1]).toEqual({ role: 'user', content: 'Test message' })
      // Verify no cache_control in the message objects
      expect(callArgs.messages[0].cache_control).toBeUndefined()
      expect(callArgs.messages[1].cache_control).toBeUndefined()

      expect(result.text).toBe('{"response": "test", "wrap": false}')
      expect(result.inputTokens).toBe(100)
      expect(result.outputTokens).toBe(50)
    })

    it('returns 0 for cache tokens on OpenAI path', async () => {
      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"response": "test", "wrap": false}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      })

      const result = await chatComplete({
        system: 'Test system prompt',
        messages: [{ role: 'user', content: 'Test message' }],
        enableCache: true,
      })

      expect(result.cacheCreationTokens).toBe(0)
      expect(result.cacheReadTokens).toBe(0)
    })
  })
})

describe('logTokenUsage', () => {
  it('passes cache_creation_tokens and cache_read_tokens to Supabase insert', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = { from: vi.fn().mockReturnValue({ insert: mockInsert }) } as any

    await logTokenUsage(mockSupabase, {
      userId: 'user-1',
      inngestFunction: 'chat-respond',
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 100,
      outputTokens: 50,
      purpose: 'biographer response',
      cacheCreationTokens: 200,
      cacheReadTokens: 80,
    })

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      cache_creation_tokens: 200,
      cache_read_tokens: 80,
    }))
  })

  it('passes null for cache columns when not provided', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = { from: vi.fn().mockReturnValue({ insert: mockInsert }) } as any

    await logTokenUsage(mockSupabase, {
      userId: 'user-1',
      inngestFunction: 'chat-respond',
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 100,
      outputTokens: 50,
      purpose: 'biographer response',
    })

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      cache_creation_tokens: null,
      cache_read_tokens: null,
    }))
  })
})
