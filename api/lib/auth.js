import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const authClient = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null

export async function getAuthenticatedUser(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!authClient || !token) return null
  const { data, error } = await authClient.auth.getUser(token)
  return error ? null : data?.user || null
}

export function isSameUser(authenticatedUser, requestedUserId) {
  return Boolean(authenticatedUser?.id && requestedUserId && authenticatedUser.id === requestedUserId)
}

export function unauthorized(res) {
  return res.status(401).json({ error: 'Sesi login tidak valid atau sudah berakhir.' })
}
