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

import { chatComplete } from './ai'

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
      expect(callArgs.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' })
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
      expect(callArgs.system[0].cache_control).toEqual({ type: 'ephemeral' })

      // Check that first message has cache_control
      expect(Array.isArray(callArgs.messages[0].content)).toBe(true)
      expect(callArgs.messages[0].content[0].type).toBe('text')
      expect(callArgs.messages[0].content[0].text).toBe('First message')
      expect(callArgs.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' })

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
  })
})
