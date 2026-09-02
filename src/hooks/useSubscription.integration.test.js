import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSubscription } from './useSubscription'

const { maybeSingle, countQuery, from } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  countQuery: vi.fn(),
  from: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: { from } }))

function subscriptionQuery() {
  return { select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle }) }) }) }) }
}

function usageQuery() {
  return { select: () => ({ eq: () => ({ eq: () => ({ gte: countQuery }) }) }) }
}

describe('subscription integration flow', () => {
  beforeEach(() => {
    maybeSingle.mockReset()
    countQuery.mockReset()
    from.mockReset()
    from.mockImplementation((table) => table === 'subscriptions' ? subscriptionQuery() : usageQuery())
    maybeSingle.mockResolvedValue({ data: null, error: null })
    countQuery.mockResolvedValue({ count: 0, error: null })
  })

  it('defaults to free when the user has no subscription', async () => {
    const { result } = renderHook(() => useSubscription('user-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.plan).toBe('free')
    expect(result.current.isExpired).toBe(false)
    expect(await result.current.checkUsage('chat')).toBe(true)
  })

  it('keeps an active premium subscription unlimited', async () => {
    maybeSingle.mockResolvedValue({
      data: { plan: 'premium', status: 'active', expires_at: new Date(Date.now() + 86400000).toISOString() },
      error: null,
    })
    const { result } = renderHook(() => useSubscription('user-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.plan).toBe('premium')
    expect(result.current.isExpired).toBe(false)
    expect(await result.current.checkUsage('chat')).toBe(true)
    expect(await result.current.getRemainingChat()).toBe(999)
  })

  it('downgrades expired premium to free and exposes the expiry state', async () => {
    maybeSingle.mockResolvedValue({
      data: { plan: 'premium', status: 'active', expires_at: new Date(Date.now() - 86400000).toISOString() },
      error: null,
    })
    const { result } = renderHook(() => useSubscription('user-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.plan).toBe('free')
    expect(result.current.isExpired).toBe(true)
    expect(await result.current.checkUsage('chat')).toBe(true)
  })

  it('blocks free chat when today usage reaches the limit', async () => {
    countQuery.mockResolvedValue({ count: 15, error: null })
    const { result } = renderHook(() => useSubscription('user-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      expect(await result.current.checkUsage('chat')).toBe(false)
    })
  })
})
