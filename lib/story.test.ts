import { describe, it, expect } from 'vitest'
import { buildStorySourceText } from './story'

describe('buildStorySourceText', () => {
  it('chat channel: formats turns as You/Biographer Q&A', () => {
    const turns = [
      { role: 'biographer', content: 'Tell me about your childhood.' },
      { role: 'user', content: 'I grew up in Texas.' },
    ]
    const result = buildStorySourceText(turns, 'chat')
    expect(result).toBe('Biographer: Tell me about your childhood.\n\nYou: I grew up in Texas.')
  })

  it('email channel: returns only user turn content joined', () => {
    const turns = [
      { role: 'biographer', content: 'Tell me about your first job.' },
      { role: 'user', content: 'I worked at Arby\'s.' },
    ]
    const result = buildStorySourceText(turns, 'email')
    expect(result).toBe('I worked at Arby\'s.')
  })

  it('email channel: excludes biographer turns, joins multiple user turns', () => {
    const turns = [
      { role: 'biographer', content: 'Question?' },
      { role: 'user', content: 'First part.' },
      { role: 'biographer', content: 'Follow up?' },
      { role: 'user', content: 'Second part.' },
    ]
    const result = buildStorySourceText(turns, 'email')
    expect(result).toBe('First part.\n\nSecond part.')
  })

  it('chat channel: skips turns with empty content', () => {
    const turns = [
      { role: 'biographer', content: '' },
      { role: 'user', content: 'My response.' },
    ]
    const result = buildStorySourceText(turns, 'chat')
    expect(result).toBe('You: My response.')
  })

  it('returns empty string for empty turns array', () => {
    expect(buildStorySourceText([], 'chat')).toBe('')
    expect(buildStorySourceText([], 'email')).toBe('')
  })
})
