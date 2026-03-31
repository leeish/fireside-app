import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encrypt } from '../lib/crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const TEST_HEX_KEY = '0'.repeat(64)

// Must be set before importing ai module so resolveApiKey reads the right key
process.env.MEMORY_ENCRYPTION_KEY = TEST_HEX_KEY
process.env.ANTHROPIC_API_KEY = 'platform-key'

import { resolveApiKey, withUserKeyFallback, getApiKeyErrorType } from '../lib/ai'

// ─── Supabase mock helpers ────────────────────────────────────

function makeSelectMock(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

function makeUpdateMock() {
  const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) })
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
        }),
      }),
      update: updateFn,
    }),
    _updateFn: updateFn,
  } as unknown as SupabaseClient & { _updateFn: ReturnType<typeof vi.fn> }
}

// ─── resolveApiKey ────────────────────────────────────────────

describe('resolveApiKey', () => {
  it('returns decrypted key when one is stored', async () => {
    const plainKey = 'sk-ant-test-key-abc123'
    const encrypted = encrypt(plainKey, TEST_HEX_KEY)
    const supabase = makeSelectMock({ anthropic_api_key: encrypted })

    const result = await resolveApiKey('user-1', supabase)
    expect(result).toBe(plainKey)
  })

  it('returns undefined when anthropic_api_key is null', async () => {
    const supabase = makeSelectMock({ anthropic_api_key: null })
    const result = await resolveApiKey('user-1', supabase)
    expect(result).toBeUndefined()
  })

  it('returns undefined when no user row found', async () => {
    const supabase = makeSelectMock(null)
    const result = await resolveApiKey('user-1', supabase)
    expect(result).toBeUndefined()
  })
})

// ─── getApiKeyErrorType ───────────────────────────────────────

describe('getApiKeyErrorType', () => {
  it('returns invalid for 401', () => {
    expect(getApiKeyErrorType({ status: 401, message: 'Unauthorized' })).toBe('invalid')
  })

  it('returns invalid for 403 without credit mention', () => {
    expect(getApiKeyErrorType({ status: 403, message: 'Permission denied' })).toBe('invalid')
  })

  it('returns quota_exceeded when message contains "credit"', () => {
    expect(getApiKeyErrorType({ status: 400, message: 'Your credit balance is too low' })).toBe('quota_exceeded')
  })

  it('returns quota_exceeded when message contains "billing"', () => {
    expect(getApiKeyErrorType({ status: 403, message: 'Billing issue detected' })).toBe('quota_exceeded')
  })

  it('returns quota_exceeded when message contains "quota"', () => {
    expect(getApiKeyErrorType({ status: 429, message: 'quota exceeded' })).toBe('quota_exceeded')
  })

  it('returns null for unrelated errors', () => {
    expect(getApiKeyErrorType({ status: 500, message: 'Internal server error' })).toBeNull()
  })

  it('returns null for non-objects', () => {
    expect(getApiKeyErrorType('some string')).toBeNull()
    expect(getApiKeyErrorType(null)).toBeNull()
  })

  it('returns null when no status field', () => {
    expect(getApiKeyErrorType({ message: 'Something' })).toBeNull()
  })
})

// ─── withUserKeyFallback ──────────────────────────────────────

describe('withUserKeyFallback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls fn with user key and returns result when successful', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const supabase = makeSelectMock({})

    const result = await withUserKeyFallback('user-1', supabase, 'user-key', fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('user-key')
  })

  it('calls fn with undefined directly when no user key provided', async () => {
    const fn = vi.fn().mockResolvedValue('platform-result')
    const supabase = makeSelectMock({})

    const result = await withUserKeyFallback('user-1', supabase, undefined, fn)
    expect(result).toBe('platform-result')
    expect(fn).toHaveBeenCalledWith(undefined)
  })

  it('falls back to platform key and marks key invalid on 401 error', async () => {
    const authError = Object.assign(new Error('Unauthorized'), { status: 401 })
    const fn = vi.fn()
      .mockRejectedValueOnce(authError)
      .mockResolvedValueOnce('fallback-result')
    const mock = makeUpdateMock()

    const result = await withUserKeyFallback('user-1', mock, 'user-key', fn)
    expect(result).toBe('fallback-result')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(undefined)
    expect(mock._updateFn).toHaveBeenCalledWith(expect.objectContaining({ anthropic_api_key_status: 'invalid' }))
  })

  it('falls back and marks quota_exceeded when credit error occurs', async () => {
    const quotaError = Object.assign(new Error('Your credit balance is too low'), { status: 400 })
    const fn = vi.fn()
      .mockRejectedValueOnce(quotaError)
      .mockResolvedValueOnce('fallback-result')
    const mock = makeUpdateMock()

    const result = await withUserKeyFallback('user-1', mock, 'user-key', fn)
    expect(result).toBe('fallback-result')
    expect(mock._updateFn).toHaveBeenCalledWith(expect.objectContaining({ anthropic_api_key_status: 'quota_exceeded' }))
  })

  it('re-throws errors unrelated to API key problems', async () => {
    const serverError = Object.assign(new Error('Internal server error'), { status: 500 })
    const fn = vi.fn().mockRejectedValue(serverError)
    const supabase = makeSelectMock({})

    await expect(withUserKeyFallback('user-1', supabase, 'user-key', fn)).rejects.toThrow('Internal server error')
    expect(fn).toHaveBeenCalledOnce()
  })
})
