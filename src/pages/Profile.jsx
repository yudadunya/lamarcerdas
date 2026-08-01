import { useEffect, useState } from 'react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { requestNotificationPermission } from '../lib/firebase'
// Subscription/plan sekarang datang dari prop (di-lift ke App.jsx) — lihat komentar di App.jsx.
import BottomNav from '../components/BottomNav'

// ── MemoryCard: tampilkan apa yang Diah Anna ingat tentang user ──────────────
function MemoryCard({ memory, updatedAt }) {
  const [open, setOpen] = React.useState(false)
  const dateStr = updatedAt
    ? new Date(updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', background: 'rgba(165,148,255,0.08)',
          border: '1px solid rgba(165,148,255,0.2)',
          borderRadius: 10, padding: '8px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: '0.72rem',
        }}
      >
        <span>🧠 Apa yang Diah Anna ingat tentang kamu</span>
        <span style={{ fontSize: '0.65rem', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>

      {open && (
        <div style={{
          marginTop: 8, padding: '14px', borderRadius: 12,
          background: 'rgba(13,10,30,0.6)',
          border: '1px solid rgba(165,148,255,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <img src="/diah-anna.png" alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
            <div>
              <div style={{ color: '#a594ff', fontSize: '0.72rem', fontWeight: 700 }}>Catatan Diah Anna</div>
              {dateStr && <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.62rem' }}>Diperbarui {dateStr}</div>}
            </div>
          </div>
          <div style={{
            color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem',
            lineHeight: 1.75, fontStyle: 'italic',
            borderLeft: '2px solid rgba(165,148,255,0.3)',
            paddingLeft: 10,
          }}>
            "{memory}"
          </div>
          <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.2)', fontSize: '0.62rem', textAlign: 'center' }}>
            Memori ini diperbarui otomatis setiap sesi ngobrol yang bermakna
          </div>
        </div>
      )}
    </div>
  )
}

// Default aman kalau prop subscription literal undefined (mismatch deploy,
// race Suspense, atau sebab lain) — JANGAN biarkan ini crash hard.
// loading:true sengaja, supaya UI tahu status sebenarnya belum jelas,
// bukan asumsi pasti 'free' yang bisa salah kalau user aslinya premium.
const DEFAULT_SUBSCRIPTION = {
  plan: 'free',
  loading: true,
  checkUsage: async () => false,
  logUsage: () => {},
  fetchPlan: () => {},
  getRemainingChat: async () => 0,
  isExpired: false,
}

export default function Profile({ user, loading = false, subscription = DEFAULT_SUBSCRIPTION }) {
  const { plan } = subscription
  const navigate = useNavigate()
  const [profile, setProfile]       = useState(null)
  const [growth, setGrowth]         = useState(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [visible, setVisible]       = useState(false)
  // Status izin notifikasi browser — dicek dari Notification.permission
  // langsung (bukan dari server), karena ini murni state browser lokal.
  // 'unsupported' kalau browser tidak dukung Notification API sama sekali.
  const [notifStatus, setNotifStatus] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [notifLoading, setNotifLoading] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) { navigate('/'); return }
    Promise.all([
      supabase.from('user_career_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_growth_state').select('*').eq('user_id', user.id).maybeSingle(),
    ]).then(([{ data: p }, { data: g }]) => {
      setProfile(p)
      setGrowth(g)
      setDataLoading(false)
      setTimeout(() => setVisible(true), 80)
    })
  }, [user?.id])

  // Dipicu HANYA dari klik tombol — sengaja tidak otomatis saat halaman
  // dibuka. Browser modern (Chrome makin ke sini makin ketat) idealnya cuma
  // menampilkan prompt izin notifikasi kalau dipicu gesture user asli;
  // dipanggil otomatis sering berakhir jadi UI "senyap" (ikon kecil di
  // address bar yang gampang tidak kesadar) atau langsung ke-anggap ditolak.
  const handleEnableNotifications = async () => {
    if (!user?.id) return
    setNotifLoading(true)
    try {
      const { permission, token } = await requestNotificationPermission(user.id)
      setNotifStatus(permission)
      if (!token && permission === 'granted') {
        console.warn('[Profile] Izin sudah granted tapi gagal ambil FCM token — cek console untuk detail error dari firebase.js')
      }
    } finally {
      setNotifLoading(false)
    }
  }

  const handleLogout = async () => {
    setLogoutLoading(true)
    // Tandai ini logout SENGAJA (diklik user) — App.jsx pakai sinyal ini
    // untuk membedakan logout manual vs sesi hilang tak terduga.
    window.dispatchEvent(new CustomEvent('verneks:manual-logout'))
    // Bersihkan semua localStorage milik user ini
    if (user?.id) {
      localStorage.removeItem(`lc_chat_${user.id}`)
      localStorage.removeItem(`lc_coach_${user.id}`)
      localStorage.removeItem(`lc_discovery_greeted_${user.id}`)
      localStorage.removeItem(`onboarded_${user.id}`)
      // Clear sessionStorage greeting flags
      sessionStorage.removeItem(`lc_greeted_${user.id}`)
      sessionStorage.removeItem(`vk_greeted_${user.id}`)
    }
    localStorage.removeItem('lc_discovery_messages')
    localStorage.removeItem('lc_discovery_result')

    // Trigger memory update sebelum logout — Chat.jsx yang handle pengiriman
    window.dispatchEvent(new CustomEvent('diah-anna-logout-memory'))
    // Beri waktu 800ms supaya fetch sempat terkirim sebelum session di-clear
    await new Promise(r => setTimeout(r, 800))

    await supabase.auth.signOut()

    // Clear SW cache supaya tidak stuck loading setelah logout
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister()))
    }

    window.location.replace('/')
  }

  const displayName = profile?.nama
    || user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || 'Kamu'

  const firstName   = displayName.split(' ')[0]
  const avatarUrl   = user?.user_metadata?.avatar_url
  const email       = user?.email || '—'
  const readiness   = profile?.career_readiness || growth?.progress_percent || 0
  const target      = profile?.target_posisi || null
  const posisi      = profile?.posisi_saat_ini || null
  const isPremium   = plan === 'premium'
  const depthScore  = profile?.depth_score || 0

  // Tanggal discovery: ambil dari last_updated profil
  const discoveryDate = profile?.last_updated
    ? new Date(profile.last_updated).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const fade = (delay = 0) => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(14px)',
    transition: `opacity 0.4s ease ${delay}s, transform 0.4s ease ${delay}s`,
  })

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f0d', paddingBottom: 90, fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '14px 18px',
      }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>👤 Profil</div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', marginTop: 2 }}>Informasi akun kamu</div>
      </div>

      <div style={{ padding: '16px', maxWidth: 480, margin: '0 auto' }}>

        {/* ── Avatar + Nama ── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(37,211,102,0.08), rgba(52,183,241,0.05))',
          border: '1px solid rgba(37,211,102,0.15)',
          borderRadius: 20, padding: '24px 20px', marginBottom: 14,
          textAlign: 'center',
          ...fade(0.04),
        }}>
          {/* Avatar */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 14px',
            background: 'rgba(37,211,102,0.15)', border: '2px solid rgba(37,211,102,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', position: 'relative',
          }}>
            {avatarUrl
              ? <img src={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar" />
              : <span style={{ fontSize: '2rem' }}>👤</span>
            }
          </div>

          {/* Nama */}
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem', marginBottom: 4 }}>
            {loading ? '—' : displayName}
          </div>

          {/* Plan badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 14px', borderRadius: 99, marginBottom: 4,
            background: isPremium ? 'rgba(255,183,77,0.12)' : 'rgba(255,255,255,0.06)',
            border: isPremium ? '1px solid rgba(255,183,77,0.3)' : '1px solid rgba(255,255,255,0.1)',
          }}>
            <span style={{ fontSize: '0.75rem' }}>{isPremium ? '⭐' : '🆓'}</span>
            <span style={{ color: isPremium ? '#FFB74D' : 'rgba(255,255,255,0.45)', fontSize: '0.75rem', fontWeight: 700 }}>
              {isPremium ? 'Premium' : 'Free'}
            </span>
          </div>

          {/* Depth Score Badge — Diah Anna mengenalmu */}
          {depthScore > 0 && (
            <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 14, background: 'rgba(123,107,255,0.08)', border: '1px solid rgba(123,107,255,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 600 }}>Diah Anna mengenalmu</span>
                </div>
                <span style={{ color: '#a594ff', fontSize: '0.85rem', fontWeight: 800 }}>{depthScore}%</span>
              </div>
              {/* Progress bar */}
              <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${depthScore}%`,
                  background: 'linear-gradient(90deg, #7B6BFF, #a594ff)',
                  transition: 'width 0.8s ease',
                }} />
              </div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', marginTop: 6 }}>
                {depthScore < 30
                  ? 'Diah Anna baru mengenalmu — terus ngobrol!'
                  : depthScore < 60
                  ? 'Diah Anna mulai memahami pola karirmu'
                  : depthScore < 85
                  ? 'Diah Anna sudah sangat mengenalmu 🧠'
                  : 'Diah Anna mengenalmu lebih dalam dari siapapun ✨'}
              </div>

              {/* Tombol lihat memori — hanya kalau ada memory */}
              {profile?.diah_anna_memory && (
                <MemoryCard memory={profile.diah_anna_memory} updatedAt={profile.memory_updated_at} />
              )}
            </div>
          )}
        </div>

        {/* ── Info Akun ── */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, marginBottom: 12, overflow: 'hidden',
          ...fade(0.10),
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.62rem', letterSpacing: '1px', marginBottom: 2 }}>AKUN</div>
          </div>
          <InfoRow label="Nama" value={loading ? '—' : displayName} icon="👤" />
          <InfoRow label="Email" value={email} icon="📧" last />
        </div>

        {/* ── Info Karier ── */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, marginBottom: 12, overflow: 'hidden',
          ...fade(0.16),
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.62rem', letterSpacing: '1px', marginBottom: 2 }}>KARIER</div>
          </div>

          <InfoRow label="Target Karier" value={loading ? '—' : (target || 'Belum diisi')} icon="🎯" />
          <InfoRow label="Posisi Saat Ini" value={loading ? '—' : (posisi || 'Belum diisi')} icon="💼" />

          {/* Readiness */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.9rem' }}>📊</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Career Readiness</span>
              </div>
              <span style={{ color: '#25D366', fontWeight: 800, fontSize: '0.95rem' }}>{loading ? '—' : `${readiness}%`}</span>
            </div>
            {!loading && (
              <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                <div style={{
                  background: 'linear-gradient(90deg,#25D366,#34B7F1)',
                  width: `${readiness}%`, height: '100%', borderRadius: 99,
                  transition: 'width 1s ease 0.3s',
                }} />
              </div>
            )}
          </div>

          <InfoRow
            label="Tanggal Discovery"
            value={loading ? '—' : (discoveryDate || 'Belum Discovery')}
            icon="📅"
            last
          />
        </div>

        {/* ── Notifikasi ── */}
        {notifStatus !== 'unsupported' && (
          <button
            onClick={notifStatus === 'default' ? handleEnableNotifications : undefined}
            disabled={notifLoading || notifStatus !== 'default'}
            style={{
              width: '100%', padding: '14px', marginBottom: 12,
              background: 'transparent',
              border: `1px solid ${notifStatus === 'granted' ? 'rgba(37,211,102,0.3)' : 'rgba(255,255,255,0.15)'}`,
              color: notifStatus === 'granted' ? 'rgba(37,211,102,0.9)' : 'rgba(255,255,255,0.7)',
              borderRadius: 14, fontWeight: 600, fontSize: '0.9rem',
              cursor: notifStatus === 'default' && !notifLoading ? 'pointer' : 'default',
              fontFamily: 'inherit',
              opacity: notifLoading ? 0.5 : 1,
              transition: 'opacity 0.2s ease',
              ...fade(0.24),
            }}
          >
            {notifLoading && '⏳ Mengaktifkan...'}
            {!notifLoading && notifStatus === 'granted' && '🔔 Notifikasi Aktif'}
            {!notifLoading && notifStatus === 'denied' && '🔕 Notifikasi Diblokir (ubah di setting browser)'}
            {!notifLoading && notifStatus === 'default' && '🔔 Aktifkan Notifikasi dari Diah Anna'}
          </button>
        )}

        {/* ── Logout ── */}
        <button
          onClick={handleLogout}
          disabled={logoutLoading}
          style={{
            width: '100%', padding: '14px',
            background: 'transparent',
            border: '1px solid rgba(239,83,80,0.3)',
            color: 'rgba(239,83,80,0.8)',
            borderRadius: 14, fontWeight: 600, fontSize: '0.9rem',
            cursor: logoutLoading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: logoutLoading ? 0.5 : 1,
            transition: 'opacity 0.2s ease',
            ...fade(0.28),
          }}
        >
          {logoutLoading ? 'Keluar...' : '🚪 Logout'}
        </button>

      </div>
      <BottomNav isPremium={isPremium} />
    </div>
  )
}

function InfoRow({ label, icon, value, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ fontSize: '0.9rem', width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', marginBottom: 2 }}>{label}</div>
        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.83rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </div>
      </div>
    </div>
  )
}
