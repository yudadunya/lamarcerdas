import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Free = 15 chat/hari, Premium = unlimited
export const LIMITS = {
  free:    { chat: 15 },
  premium: { chat: 999 },
}

export const PLAN_LABEL  = { free: 'Free', premium: 'Premium ⭐' }

export function useSubscription(userId) {
  const [plan, setPlan]           = useState('free')
  const [loading, setLoading]     = useState(true)
  const [isExpired, setIsExpired] = useState(false)
  const [expiresAt, setExpiresAt] = useState(null)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    fetchPlan()
  }, [userId])

  const fetchPlan = async () => {
    setLoading(true)
    try {
      // Ambil subscription terbaru — aktif atau tidak
      const { data, error } = await supabase
        .from('subscriptions')
        .select('plan, status, expires_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) console.error('[useSubscription] fetchPlan error:', error.message)

      if (data?.plan && LIMITS[data.plan]) {
        const expired = data.expires_at && new Date(data.expires_at) < new Date()
        if (!expired && data.status === 'active') {
          setPlan(data.plan)
          setIsExpired(false)
          setExpiresAt(data.plan === 'premium' ? (data.expires_at || null) : null)
        } else if (expired && data.plan === 'premium') {
          // Pernah premium tapi sudah habis
          setPlan('free')
          setIsExpired(true)
          setExpiresAt(null)
        } else {
          setPlan('free')
          setIsExpired(false)
          setExpiresAt(null)
        }
      } else {
        setPlan('free')
        setIsExpired(false)
        setExpiresAt(null)
      }
    } catch (e) {
      console.error('[useSubscription] fetchPlan exception:', e)
      setPlan('free')
      setIsExpired(false)
      setExpiresAt(null)
    }
    setLoading(false)
  }

  // Sisa hari premium (null kalau bukan premium / tidak ada tanggal kedaluwarsa)
  const getDaysRemaining = () => {
    if (plan !== 'premium' || !expiresAt) return null
    const diffMs = new Date(expiresAt) - new Date()
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  }

  // Cek usage — chat: limit harian (15 free / unlimited premium)
  const checkUsage = async (feature) => {
    const limit = LIMITS[plan]?.[feature] ?? 0
    if (limit === 0) return false
    if (limit >= 999) return true

    if (!userId) return false

    try {
      let since
      if (feature === 'chat') {
        // Chat: reset harian
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        since = today.toISOString()
      } else {
        // Fitur: reset bulanan
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        since = monthStart.toISOString()
      }

      const { count, error } = await supabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('feature', feature)
        .gte('created_at', since)

      if (error) {
        console.error('[useSubscription] checkUsage error:', error.message)
        return false
      }

      const used = count ?? 0
      const resetLabel = feature === 'chat' ? 'hari ini' : 'bulan ini'
      console.log(`[usage] ${feature}: ${used}/${limit} (${resetLabel})`)
      return used < limit

    } catch (e) {
      console.error('[useSubscription] checkUsage exception:', e)
      return false
    }
  }

  // Cek berapa sisa chat hari ini (untuk UI badge)
  const getRemainingChat = async () => {
    if (plan === 'premium') return 999
    if (!userId) return LIMITS.free.chat

    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { count } = await supabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('feature', 'chat')
        .gte('created_at', today.toISOString())
      return Math.max(0, LIMITS.free.chat - (count ?? 0))
    } catch {
      return LIMITS.free.chat
    }
  }

  const logUsage = async (feature) => {
    if (!userId) return
    const { error } = await supabase
      .from('usage_logs')
      .insert({ user_id: userId, feature })
    if (error) console.error('[useSubscription] logUsage error:', error.message)
  }

  return { plan, loading, checkUsage, logUsage, fetchPlan, getRemainingChat, isExpired, expiresAt, getDaysRemaining }
}
