/**
 * Test suite for Repository Pattern
 * Demonstrates test infrastructure setup for P0 task
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  authRepository,
  careerProfileRepository,
  chatHistoryRepository,
  genomeScoreRepository,
  growthStateRepository,
  milestonesRepository,
  userRepository
} from './repository.js'

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

    it('should sign out successfully', async () => {
      const { supabase } = await import('./supabase.js')
      supabase.auth.signOut.mockResolvedValue({ error: null })

      const result = await authRepository.signOut()

      expect(result.success).toBe(true)
    })

    it('should get user successfully', async () => {
      const mockUser = { id: '123', email: 'test@example.com' }
      const { supabase } = await import('./supabase.js')
      supabase.auth.getUser.mockResolvedValue({ 
        data: { user: mockUser }, 
        error: null 
      })

      const result = await authRepository.getUser()

      expect(result.success).toBe(true)
      expect(result.user).toEqual(mockUser)
    })

    it('should handle sign in with OAuth', async () => {
      const mockData = { url: 'https://oauth.provider.com' }
      const { supabase } = await import('./supabase.js')
      supabase.auth.signInWithOAuth.mockResolvedValue({ data: mockData, error: null })

      const result = await authRepository.signInWithOAuth('github', 'https://localhost:3000')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockData)
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

  describe('userRepository', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should find user by ID', async () => {
      const mockUser = { id: '123', email: 'test@example.com' }
      const { supabase } = await import('./supabase.js')
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockUser, error: null })
      })

      const result = await userRepository.findById('123')

      expect(result).toEqual(mockUser)
      expect(supabase.from).toHaveBeenCalledWith('users')
    })

    it('should create user', async () => {
      const mockUser = { id: '123', email: 'test@example.com' }
      const { supabase } = await import('./supabase.js')
      supabase.from.mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockUser, error: null })
      })

      const result = await userRepository.create({ email: 'test@example.com' })

      expect(result).toEqual(mockUser)
    })

    it('should update user', async () => {
      const mockUser = { id: '123', email: 'updated@example.com' }
      const { supabase } = await import('./supabase.js')
      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockUser, error: null })
      })

      const result = await userRepository.update('123', { email: 'updated@example.com' })

      expect(result).toEqual(mockUser)
    })
  })

  describe('careerProfileRepository', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should find career profile by user ID', async () => {
      const mockProfile = { id: '1', user_id: '123', career_readiness: 75 }
      const { supabase } = await import('./supabase.js')
      
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

  describe('genomeScoreRepository', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should find genome scores by user ID', async () => {
      const mockScores = { user_id: '123', analytical: 75, leadership: 80 }
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockScores, error: null })
      })

      const result = await genomeScoreRepository.findByUserId('123')

      expect(result).toEqual(mockScores)
      expect(supabase.from).toHaveBeenCalledWith('user_genome_scores')
    })

    it('should upsert genome scores', async () => {
      const mockScores = { user_id: '123', analytical: 80, leadership: 85 }
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockScores, error: null })
      })

      const result = await genomeScoreRepository.upsert({ 
        user_id: '123', 
        analytical: 80,
        leadership: 85
      })

      expect(result).toEqual(mockScores)
    })
  })

  describe('growthStateRepository', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should find growth state by user ID', async () => {
      const mockState = { user_id: '123', career_stage: 'Career Builder' }
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockState, error: null })
      })

      const result = await growthStateRepository.findByUserId('123')

      expect(result).toEqual(mockState)
      expect(supabase.from).toHaveBeenCalledWith('user_growth_state')
    })

    it('should upsert growth state', async () => {
      const mockState = { user_id: '123', career_stage: 'Career Expert' }
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockState, error: null })
      })

      const result = await growthStateRepository.upsert({ 
        user_id: '123', 
        career_stage: 'Career Expert' 
      })

      expect(result).toEqual(mockState)
    })
  })

  describe('milestonesRepository', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should find milestones by user ID', async () => {
      const mockMilestones = [
        { id: '1', user_id: '123', title: 'Learn React' },
        { id: '2', user_id: '123', title: 'Build Project' }
      ]
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockMilestones, error: null })
      })

      const result = await milestonesRepository.findByUserId('123')

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(2)
      expect(supabase.from).toHaveBeenCalledWith('user_milestones')
    })

    it('should return empty array when no milestones found', async () => {
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: null })
      })

      const result = await milestonesRepository.findByUserId('123')

      expect(result).toEqual([])
    })

    it('should create milestone', async () => {
      const mockMilestone = { id: '1', user_id: '123', title: 'Learn React' }
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockMilestone, error: null })
      })

      const result = await milestonesRepository.create({ 
        user_id: '123', 
        title: 'Learn React' 
      })

      expect(result).toEqual(mockMilestone)
    })

    it('should bulk insert milestones', async () => {
      const mockMilestones = [
        { id: '1', user_id: '123', title: 'Learn React' },
        { id: '2', user_id: '123', title: 'Build Project' }
      ]
      const { supabase } = await import('./supabase.js')
      
      supabase.from.mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: mockMilestones, error: null })
      })

      const result = await milestonesRepository.bulkInsert([
        { user_id: '123', title: 'Learn React' },
        { user_id: '123', title: 'Build Project' }
      ])

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(2)
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
    expect(genomeScoreRepository).toBeDefined()
    expect(growthStateRepository).toBeDefined()
    expect(milestonesRepository).toBeDefined()
    expect(userRepository).toBeDefined()
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

  it('supports GDPR compliance with delete methods', () => {
    expect(chatHistoryRepository.deleteByUserId).toBeDefined()
    expect(typeof chatHistoryRepository.deleteByUserId).toBe('function')
  })
})
