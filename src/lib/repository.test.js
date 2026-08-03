/**
 * Test suite for Repository Pattern
 * Demonstrates test infrastructure setup for P0 task
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { authRepository, careerProfileRepository, chatHistoryRepository } from './repository.js'

// Mock supabase client
vi.mock('./supabase.js', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
      signInWithOAuth: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn()
          }
        }
      }))
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis()
    }))
  }
}))

describe('Repository Pattern - P0 Implementation', () => {
  describe('authRepository', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should sign up successfully', async () => {
      const mockData = { user: { id: '123', email: 'test@example.com' } }
      const { supabase } = await import('./supabase.js')
      supabase.auth.signUp.mockResolvedValue({ data: mockData, error: null })

      const result = await authRepository.signUp('test@example.com', 'password123', 'Test User')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockData)
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          data: { full_name: 'Test User' }
        }
      })
    })

    it('should handle sign up error', async () => {
      const { supabase } = await import('./supabase.js')
      supabase.auth.signUp.mockResolvedValue({ 
        data: null, 
        error: { message: 'Email already exists' } 
      })

      const result = await authRepository.signUp('existing@example.com', 'password123', 'Test User')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Email already exists')
    })

    it('should sign in successfully', async () => {
      const mockData = { user: { id: '123', email: 'test@example.com' }, session: { access_token: 'token' } }
      const { supabase } = await import('./supabase.js')
      supabase.auth.signInWithPassword.mockResolvedValue({ data: mockData, error: null })

      const result = await authRepository.signIn('test@example.com', 'password123')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockData)
    })

    it('should get session successfully', async () => {
      const mockSession = { access_token: 'token', user: { id: '123' } }
      const { supabase } = await import('./supabase.js')
      supabase.auth.getSession.mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      })

      const result = await authRepository.getSession()

      expect(result.success).toBe(true)
      expect(result.session).toEqual(mockSession)
    })

    it('should subscribe to auth state changes', async () => {
      const callback = vi.fn()
      const { supabase } = await import('./supabase.js')
      
      const subscription = authRepository.onAuthStateChange(callback)

      expect(supabase.auth.onAuthStateChange).toHaveBeenCalledWith(callback)
      expect(subscription.unsubscribe).toBeDefined()
      expect(typeof subscription.unsubscribe).toBe('function')
    })
  })

  describe('careerProfileRepository', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should find career profile by user ID', async () => {
      const mockProfile = { id: '1', user_id: '123', career_readiness: 75 }
      const { supabase } = await import('./supabase.js')
      
      // Mock the chain of calls
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null })
      })

      const result = await careerProfileRepository.findByUserId('123')

      expect(result).toEqual(mockProfile)
      expect(supabase.from).toHaveBeenCalledWith('user_career_profiles')
    })

    it('should return null when profile not found', async () => {
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
      })

      const result = await careerProfileRepository.findByUserId('nonexistent')

      expect(result).toBeNull()
    })

    it('should upsert career profile', async () => {
      const mockProfile = { id: '1', user_id: '123', career_readiness: 80 }
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockProfile, error: null })
      })

      const result = await careerProfileRepository.upsert({ 
        user_id: '123', 
        career_readiness: 80 
      })

      expect(result).toEqual(mockProfile)
    })
  })

  describe('chatHistoryRepository', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should get chat history for user', async () => {
      const mockChats = [
        { id: '1', user_id: '123', message: 'Hello', created_at: '2024-01-01' },
        { id: '2', user_id: '123', message: 'Hi', created_at: '2024-01-02' }
      ]
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockChats, error: null })
      })

      const result = await chatHistoryRepository.findByUserId('123', 50)

      expect(result).toEqual(mockChats)
      expect(result.length).toBe(2)
    })

    it('should return empty array when no chat history', async () => {
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: null })
      })

      const result = await chatHistoryRepository.findByUserId('123')

      expect(result).toEqual([])
    })

    it('should create chat message', async () => {
      const mockMessage = { id: '1', user_id: '123', message: 'Test' }
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockMessage, error: null })
      })

      const result = await chatHistoryRepository.create({ 
        user_id: '123', 
        message: 'Test' 
      })

      expect(result).toEqual(mockMessage)
    })

    it('should delete chat history for GDPR compliance', async () => {
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      })

      const result = await chatHistoryRepository.deleteByUserId('123')

      expect(result).toBe(true)
      expect(supabase.from).toHaveBeenCalledWith('chat_history')
    })
  })
})

describe('Repository Pattern Benefits', () => {
  it('demonstrates decoupling from Supabase', () => {
    // This test shows that repositories can be tested independently
    // In the future, we could swap Supabase for another provider
    // without changing application code
    expect(authRepository).toBeDefined()
    expect(careerProfileRepository).toBeDefined()
    expect(chatHistoryRepository).toBeDefined()
  })

  it('provides consistent error handling', async () => {
    const { supabase } = await import('./supabase.js')
    supabase.auth.getUser.mockResolvedValue({ 
      data: { user: null }, 
      error: { message: 'Not authenticated' } 
    })

    const result = await authRepository.getUser()

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('enables easy mocking for tests', () => {
    // The repository pattern makes it easy to mock database operations
    // This is crucial for achieving 70%+ test coverage
    expect(vi.isMockFunction(authRepository.signUp)).toBe(false)
    // Note: We mock the underlying supabase client, not the repository itself
  })
})
