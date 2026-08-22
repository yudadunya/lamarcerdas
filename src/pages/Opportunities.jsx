import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

const CACHE_KEY  = 'lc_job_matches'
const CACHE_TTL  = 6 * 60 * 60 * 1000 // 6 jam dalam ms

function loadCache(userId) {
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY}_${userId}`)
    if (!raw) return null
    const { jobs, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return jobs
  } catch { return null }
}

function saveCache(userId, jobs) {
  try {
    sessionStorage.setItem(`${CACHE_KEY}_${userId}`, JSON.stringify({ jobs, ts: Date.now() }))
  } catch {}
}

function clearCache(userId) {
  try { sessionStorage.removeItem(`${CACHE_KEY}_${userId}`) } catch {}
}

export default function Opportunities({ user, loading = false }) {
  const navigate   = useNavigate()
  const [isPremium, setIsPremium] = useState(null)
  const [jobs,      setJobs]      = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    if (loading) return
    if (!user) { navigate('/'); return }

    supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const premium = !!data?.plan && data.plan !== 'free'
        setIsPremium(premium)
        if (!premium) return

        // Pakai cache kalau masih fresh — tidak fetch ulang
        const cached = loadCache(user.id)
        if (cached) { setJobs(cached); return }

        fetchJobs()
      })
  }, [user?.id])

  const fetchJobs = async (forceRefresh = false) => {
    if (forceRefresh) clearCache(user.id)
    setDataLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/utils?action=job-match', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setJobs(data.jobs)
      saveCache(user.id, data.jobs)
    } catch (e) {
      setError(e.message)
    } finally {
      setDataLoading(false)
    }
  }

  if (!user) return null

  // ── Non-premium gate ──────────────────────────────────────────────────────
  if (isPremium === false) return (
    <div style={{
      minHeight: '100vh', background: '#0a0f0d',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '0 24px', textAlign: 'center', paddingBottom: 90,
    }}>
      <div style={{ fontSize: '3rem', marginBottom: 16 }}>🌿</div>
      <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', marginBottom: 10 }}>
        Rekomendasi Self-Care
      </div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', lineHeight: 1.7, marginBottom: 28 }}>
        Lihat aktivitas self-care yang benar-benar cocok<br />dengan pola diri kamu.<br /><br />
        Fitur ini tersedia untuk pengguna Premium.
      </div>
      <button
        onClick={() => window.location.href = '/pricing'}
        style={{ padding: '13px 32px', background: 'linear-gradient(135deg,#25D366,#128C7E)', color: '#fff', fontWeight: 700, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: '0.9rem', boxShadow: '0 4px 16px rgba(37,211,102,0.3)' }}
      >
        🚀 Upgrade Premium
      </button>
      <button
        onClick={() => window.history.back()}
        style={{ marginTop: 12, background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', cursor: 'pointer' }}
      >
        ← Kembali
      </button>
      <BottomNav isPremium={false} />
    </div>
  )

  // ── Loading state (initial) ───────────────────────────────────────────────
  if (isPremium === null) return null

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--wa-bg)', paddingBottom: '80px' }}>
      <div className="wa-header">
        <div className="wa-header-title">🌿 Rekomendasi Self-Care</div>
      </div>

      <div style={{ padding: '16px' }}>

        {/* Loading */}
        {dataLoading && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔍</div>
            <div style={{ color: '#666', fontSize: '0.85rem', lineHeight: 1.7 }}>
              Diah Anna sedang nyariin<br />aktivitas terbaik buat kamu...
            </div>
          </div>
        )}

        {/* Error */}
        {!dataLoading && error && (
          <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 12, padding: '16px', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>⚠️</div>
            <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 12 }}>
              {error === 'Profil belum lengkap'
                ? 'Lengkapi profilmu dulu lewat Discovery ya, biar rekomendasinya akurat!'
                : `Gagal memuat: ${error}`}
            </div>
            <button
              onClick={() => fetchJobs(true)}
              style={{ background: '#fff', border: '1px solid #e0e0e0', color: '#444', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
            >
              Coba lagi
            </button>
          </div>
        )}

        {/* Job cards */}
        {!dataLoading && !error && jobs.length > 0 && (
          <>
            <div style={{ color: '#999', fontSize: '0.75rem', marginBottom: 12 }}>
              {jobs.length} aktivitas cocok dengan pola kamu
            </div>

            {jobs.map((job, i) => (
              <div key={i} style={{
                background: '#fff',
                padding: '14px 16px',
                borderRadius: '12px',
                marginBottom: '10px',
                border: '1px solid #e8e8e8',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                  <div style={{ fontWeight: 700, color: '#111', fontSize: '0.95rem', flex: 1, marginRight: 8 }}>
                    {job.role}
                  </div>
                  <div style={{
                    background: 'linear-gradient(135deg,#25D366,#128C7E)',
                    color: '#fff', padding: '3px 10px',
                    borderRadius: '10px', fontSize: '0.7rem',
                    fontWeight: 700, flexShrink: 0,
                  }}>
                    {job.match}% Match
                  </div>
                </div>

                <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: 6 }}>
                  {job.company} • {job.salary}
                </div>

                {job.reason && (
                  <div style={{ fontSize: '0.78rem', color: '#888', marginBottom: 10, lineHeight: 1.5 }}>
                    {job.reason}
                  </div>
                )}

                <button
                  onClick={() => navigate('/chat')}
                  style={{ background: 'none', border: 'none', color: '#25D366', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  Tanya Diah Anna →
                </button>
              </div>
            ))}

            {/* Refresh manual */}
            <button
              onClick={() => fetchJobs(true)}
              style={{ width: '100%', marginTop: 8, background: '#f5f5f5', border: '1px solid #e0e0e0', color: '#777', padding: '11px', borderRadius: 10, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}
            >
              🔄 Refresh rekomendasi
            </button>
            <div style={{ textAlign: 'center', color: '#ccc', fontSize: '0.7rem', marginTop: 8 }}>
              Diperbarui otomatis setiap 6 jam
            </div>
          </>
        )}
      </div>

      <BottomNav isPremium={isPremium} />
    </div>
  )
}
