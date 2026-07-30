import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { supabase } from './lib/supabase'
import { useSubscription } from './hooks/useSubscription'
import { listenForMessages, registerServiceWorker, refreshFcmTokenIfGranted } from './lib/firebase'

// Lazy load semua halaman ok
const Home         = lazy(() => import('./pages/Home'))
const Login        = lazy(() => import('./pages/Login'))
const Register     = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword  = lazy(() => import('./pages/ResetPassword'))
const Chat         = lazy(() => import('./pages/Chat'))
const Pricing      = lazy(() => import('./pages/Pricing'))
const Blog         = lazy(() => import('./pages/Blog'))
const BlogPost     = lazy(() => import('./pages/BlogPost'))
const Journey      = lazy(() => import('./pages/Journey'))
const Discovery    = lazy(() => import('./pages/Discovery'))
const Paywall      = lazy(() => import('./pages/Paywall'))
const GenomeResult = lazy(() => import('./pages/GenomeResult'))
const Dashboard    = lazy(() => import('./pages/Dashboard'))
const DNA          = lazy(() => import('./pages/DNA'))
const Opportunities = lazy(() => import('./pages/Opportunities'))
const Profile      = lazy(() => import('./pages/Profile'))
const AdminPanel   = lazy(() => import('./pages/AdminPanel'))
const LibraryList  = lazy(() => import('./pages/Library/index'))
const GuideDetail  = lazy(() => import('./pages/Library/GuideDetail'))

import UpgradeModal from './components/UpgradeModal'
import InstallPrompt from './components/InstallPrompt'
import NotificationPrompt from './components/NotificationPrompt'

function loadMessages(userId) {
  if (!userId) return []
  try {
    const saved = localStorage.getItem(`lc_chat_${userId}`)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return []
}

// ── Sinkronisasi data Discovery → Supabase setelah SIGNED_IN ────────────────
// PENTING: fungsi ini dipanggil DI LUAR callback onAuthStateChange (lewat
// setTimeout 0), supaya auth-lock Supabase sudah dilepas. Memanggil
// supabase.* di dalam callback auth menyebabkan deadlock navigator.locks
// → seluruh app freeze (terutama saat buka app dengan sesi masih aktif).
async function syncDiscoveryData(u, setChatMessages) {
  setChatMessages(loadMessages(u.id))

  const discoveryResult = localStorage.getItem('lc_discovery_result')
  const discoveryMessages = localStorage.getItem('lc_discovery_messages')
  let hasCareerData = false

  if (discoveryResult) {
    try {
      const result = JSON.parse(discoveryResult)

      const { data: existing } = await supabase
        .from('user_career_profiles')
        .select('career_readiness')
        .eq('user_id', u.id)
        .maybeSingle()

      if (existing?.career_readiness == null) {
        const p  = result.profile_preview || {}
        const gs = result.genome_scores   || {}
        const gw = result.growth_state    || {}

        const { error: profileErr } = await supabase.from('user_career_profiles').upsert({
          user_id:          u.id,
          nama:             p.nama             || null,
          income_situation: p.income_situation || null,
          target_posisi:    p.target_posisi    || null,
          posisi_saat_ini:  p.posisi_saat_ini  || null,
          industri:         p.industri         || null,
          hambatan:         p.hambatan_utama   || p.hambatan || null,
          motivasi:         p.motivasi         || null,
          gaya_kerja:       p.gaya_kerja       || null,
          career_readiness: result.career_readiness || 0,
          skill_gaps:       result.gap_skills  || [],
          gps_steps:        result.gps_steps   || [],
          mentor_message:   result.mentor_message || null,
          summary:          result.wow_insight  || result.mentor_message || null,
          last_updated:     new Date().toISOString(),
        }, { onConflict: 'user_id' })
        if (profileErr) console.warn('[discovery-save] profile error:', profileErr.message)

        if (Object.values(gs).some(v => v > 0)) {
          supabase.from('user_genome_scores').upsert({
            user_id:      u.id,
            ...gs,
            top_strength: result.top_strength || null,
            updated_at:   new Date().toISOString(),
          }, { onConflict: 'user_id' }).catch(e => console.warn('[genome-save]', e.message))
        }

        if (gw.career_stage) {
          supabase.from('user_growth_state').upsert({
            user_id:          u.id,
            career_stage:     gw.career_stage,
            progress_percent: gw.progress_percent || result.career_readiness || 0,
            current_focus:    gw.current_focus || null,
            updated_at:       new Date().toISOString(),
          }, { onConflict: 'user_id' }).catch(e => console.warn('[growth-save]', e.message))
        }

        if (discoveryMessages) {
          try {
            const msgs = JSON.parse(discoveryMessages)
            const apiMsgs = msgs
              .filter(m => m.role === 'user' || m.role === 'bot')
              .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text || '' }))
              .filter(m => m.content)
            fetch('/api/extract-profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: u.id, messages: apiMsgs })
            }).catch(e => console.warn('[extract-profile]', e))
          } catch {}
        }
      }

      if (result.gps_steps?.length > 0) {
        const { data: existingMs } = await supabase
          .from('user_milestones').select('id').eq('user_id', u.id).limit(1)
        if (!existingMs?.length) {
          const rows = result.gps_steps.map((step, i) => ({
            user_id:      u.id,
            title:        step.title || step,
            description:  step.description || null,
            step_index:   i,
            is_completed: step.done || false,
          }))
          await supabase.from('user_milestones').insert(rows)
        }
      }

      hasCareerData = true
    } catch (e) {
      console.warn('[discovery-save] error:', e.message)
    }
    localStorage.removeItem('lc_discovery_result')
    localStorage.removeItem('lc_discovery_messages')
    sessionStorage.removeItem(`lc_job_matches_${u.id}`)
  }

  if (!hasCareerData) {
    try {
      const { data: cp } = await supabase
        .from('user_career_profiles')
        .select('career_readiness')
        .eq('user_id', u.id)
        .maybeSingle()
      hasCareerData = cp?.career_readiness != null
    } catch (err) {
      console.warn('[App redirect] cek career_readiness gagal:', err.message)
    }
  }

  const target = hasCareerData ? '/chat' : '/discovery'
  if (window.location.pathname !== target) {
    window.location.replace(target)
  }
}

// Minta browser melindungi storage situs ini dari auto-clear saat low
// storage/idle (terutama efektif di Chrome; Safari mengabaikan API ini,
// tapi tidak berbahaya untuk tetap dipanggil). Ini bagian dari usaha
// memaksimalkan durasi sesi tetap login tanpa logout otomatis.
async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      const already = await navigator.storage.persisted?.()
      if (!already) await navigator.storage.persist()
    }
  } catch (e) {
    console.warn('[App] requestPersistentStorage error:', e)
  }
}

export default function App() {
  const [user, setUser]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [chatMessages, setChatMessages] = useState([])
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeData, setUpgradeData] = useState(null)
  // Toast untuk push notification yang masuk SAAT app sedang dibuka
  // (foreground). Firebase tidak menampilkan popup OS otomatis untuk kasus
  // ini (beda dari saat app tertutup/background — itu sudah otomatis lewat
  // service worker) — jadi butuh UI manual di sini, kalau tidak, notifikasi
  // foreground (termasuk "milestone selesai" yang baru ditambahkan) tidak
  // akan pernah kelihatan sama sekali oleh user.
  const [pushToast, setPushToast] = useState(null)

  const subscription = useSubscription(user?.id)

  // Penanda logout SENGAJA (tombol diklik) — dipakai onAuthStateChange
  // untuk membedakan logout manual vs sesi hilang tak terduga (network,
  // refresh token revoke, dll). Ref karena tidak perlu trigger re-render.
  const manualLogoutRef = useRef(false)
  useEffect(() => {
    const onManualLogout = () => { manualLogoutRef.current = true }
    window.addEventListener('verneks:manual-logout', onManualLogout)
    return () => window.removeEventListener('verneks:manual-logout', onManualLogout)
  }, [])

  // Trigger UpgradeModal kalau app dibuka dari notifikasi push
  // premium-expiry/upgrade-nudge (lihat firebase-messaging-sw.js —
  // notificationclick untuk action 'open-upgrade' buka URL ini).
  useEffect(() => {
    if (!user?.id) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('upgrade') === '1') {
      window.dispatchEvent(new CustomEvent('show-upgrade'))
      params.delete('upgrade')
      const cleanUrl = window.location.pathname + (params.toString() ? `?${params}` : '')
      window.history.replaceState({}, '', cleanUrl)
    }
  }, [user?.id])

  // Global upgrade modal trigger
  useEffect(() => {
    const handler = (e) => {
      if (e.detail) setUpgradeData(e.detail)
      setShowUpgrade(true)
    }
    window.addEventListener('show-upgrade', handler)
    return () => window.removeEventListener('show-upgrade', handler)
  }, [])

  useEffect(() => {
    // ── BERSIHKAN TOKEN AUTH BASI DI URL ──────────────────────────────────
    // Supabase (detectSessionInUrl: true) baca token dari URL (hash/query)
    // untuk flow reset-password/OAuth/magic-link SAAT client dibuat — ini
    // terjadi lebih awal dari effect ini, jadi kita tidak bisa "mendahului"
    // proses itu. Tapi kita bisa langsung bersihkan URL SETELAHNYA supaya:
    //  1. Tidak terus dipakai ulang kalau ada reload di sesi yang sama
    //  2. Kalau user install PWA ("Add to Home Screen") SETELAH ini, ikon
    //     yang tersimpan menangkap URL bersih — bukan URL dengan token basi
    //     yang akan terus gagal & bentrok dengan sesi valid di localStorage
    //     setiap kali ikon itu dibuka (ini yang kemungkinan besar jadi
    //     penyebab "install PWA tapi masih logout sendiri").
    const hasAuthParamsInUrl =
      window.location.hash.includes('access_token') ||
      window.location.hash.includes('error') ||
      new URLSearchParams(window.location.search).has('code')

    if (hasAuthParamsInUrl) {
      console.warn('[App] URL mengandung token auth — dibersihkan setelah diproses Supabase.')
      window.history.replaceState(null, '', window.location.pathname)
    }

    // PENTING: dulu ini jalan di SETIAP app dibuka (unregister SW + clear
    // cache tiap mount) — bukan cuma sekali. Efeknya service worker terus
    // dihancurkan & didaftar ulang, yang bikin browser (terutama Chrome di
    // Android) menganggap situs "tidak stabil" sebagai PWA, dan secara
    // tidak langsung meningkatkan risiko storage (termasuk sesi login di
    // localStorage) dibersihkan lebih agresif oleh browser.
    //
    // Sekarang: cuma jalan SEKALI per versi (pakai flag di localStorage),
    // bukan di setiap mount. Kalau butuh force-clear lagi di masa depan
    // (misal abis update besar), tinggal naikkan angka SW_CLEAR_VERSION.
    const SW_CLEAR_VERSION = 'v1'
    const clearSWAndCache = async () => {
      const alreadyCleared = localStorage.getItem('lc_sw_cleared_version')
      if (alreadyCleared === SW_CLEAR_VERSION) return

      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(r => r.unregister()))
        }
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
        localStorage.setItem('lc_sw_cleared_version', SW_CLEAR_VERSION)
      } catch (e) { console.warn('[App] clearSW error:', e) }
    }
    clearSWAndCache()

    let timeoutFired = false
    let retriedOnce  = false

    // PENTING: timeout ini dulu 5 detik — terlalu agresif untuk koneksi
    // lambat/cold start. Kalau getSession() belum selesai dalam waktu ini
    // TAPI ada token sesi tersimpan di localStorage (berarti user memang
    // pernah login & sesinya masih ada), kita JANGAN langsung anggap
    // logged-out — itu yang bikin user "auto ke-logout" padahal sesinya
    // masih valid, cuma checking-nya yang lambat. Kasih 1x retry dengan
    // window lebih panjang dulu sebelum benar-benar menyerah.
    const attemptGetSession = (isRetry = false) => {
      const timeoutId = setTimeout(() => {
        timeoutFired = true
        console.warn(`[App] getSession timeout (${isRetry ? 'retry' : 'initial'})`)
        const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'))

        if (sbKeys.length === 0) {
          // Memang tidak ada sesi tersimpan — aman untuk anggap logged-out.
          window.location.replace('/')
          return
        }

        if (!isRetry) {
          // Ada sesi tersimpan tapi network lambat — coba sekali lagi
          // dengan window lebih panjang, jangan langsung nendang user.
          timeoutFired = false
          retriedOnce = true
          attemptGetSession(true)
        } else {
          // Sudah dicoba 2x (total ~20 detik) dan tetap gagal — baru
          // berhenti nunggu. Tetap TIDAK memaksa redirect atau set
          // user=null secara eksplisit; biarkan onAuthStateChange yang
          // jalan di background yang akhirnya update user begitu resolve.
          setLoading(false)
        }
      }, isRetry ? 15000 : 8000)

      supabase.auth.getSession()
        .then(({ data: { session } }) => {
          if (timeoutFired && isRetry) return // retry ini sudah terlalu telat, biarkan onAuthStateChange yang urus
          clearTimeout(timeoutId)
          const u = session?.user ?? null
          setUser(u)
          if (u) {
            setChatMessages(loadMessages(u.id))
            requestPersistentStorage()
          }
          setLoading(false)
        })
        .catch(() => {
          clearTimeout(timeoutId)
          if (!timeoutFired) {
            setUser(null)
            setLoading(false)
          }
        })
    }

    attemptGetSession(false)

    // ── onAuthStateChange — callback TIDAK async ──────────────────────────
    // Semua kerja Supabase di-defer keluar callback via setTimeout(0) agar
    // auth-lock dilepas → tidak ada deadlock/freeze saat sesi aktif.
    const { data: { subscription: authListenerSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        window.location.href = '/reset-password'
        return
      }
      const u = session?.user ?? null

      if (!u) {
        // Diagnostik tambahan: bedakan 2 skenario yang gejalanya sama-sama
        // "sesi hilang" tapi akar masalahnya beda jauh —
        //   (a) key sb-* SUDAH TIDAK ADA di localStorage → storage-nya yang
        //       kehapus (browser/ITP iOS/PWA clear data), atau
        //   (b) key sb-* MASIH ADA tapi tetap dianggap tidak valid → berarti
        //       server Supabase yang menolak/mencabut sesi itu (kemungkinan
        //       besar setting "Time-box user sessions" / "Inactivity
        //       timeout" di dashboard Supabase, atau refresh token collision
        //       dari banyak tab/device).
        // Kedua skenario butuh fix yang beda total, jadi ini dicatat dulu
        // supaya lain kali kejadian, tinggal baca console-nya.
        const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'))
        let storedSessionInfo = 'tidak ada key sb-* sama sekali (storage kosong)'
        if (sbKeys.length > 0) {
          try {
            const raw = JSON.parse(localStorage.getItem(sbKeys[0]))
            const expiresAt = raw?.expires_at
            const nowSec = Math.floor(Date.now() / 1000)
            storedSessionInfo = expiresAt
              ? `key sb-* MASIH ADA, expires_at=${expiresAt} (${expiresAt < nowSec ? 'sudah expired ' + (nowSec - expiresAt) + 's lalu' : 'belum expired'})`
              : 'key sb-* ada tapi tidak berisi expires_at yang valid'
          } catch (e) {
            storedSessionInfo = 'key sb-* ada tapi gagal di-parse: ' + e.message
          }
        }
        console.warn(`[App] Session hilang. Event: ${_event}, manual logout: ${manualLogoutRef.current}. Storage check: ${storedSessionInfo}`, session)

        if (manualLogoutRef.current) {
          // Logout SENGAJA (tombol diklik) — proses seperti biasa.
          manualLogoutRef.current = false
          setUser(null)
          setChatMessages([])
          Object.keys(sessionStorage)
            .filter(k => k.startsWith('lc_greeted_'))
            .forEach(k => sessionStorage.removeItem(k))
          return
        }

        // BUKAN logout manual — sesuai permintaan: jangan paksa logout user.
        // Coba re-check sesi sekali lagi (siapa tau cuma gangguan sesaat),
        // tapi APAPUN hasilnya, jangan clear `user` di sini. Supabase JS
        // tidak boleh dipanggil sinkron di dalam callback ini (bisa
        // deadlock), makanya di-defer via setTimeout(0).
        setTimeout(async () => {
          try {
            const { data: { session: recheck } } = await supabase.auth.getSession()
            if (recheck?.user) {
              console.log('[App] Sesi pulih setelah re-check, tetap login.')
              setUser(recheck.user)
            } else {
              const sbKeysAfter = Object.keys(localStorage).filter(k => k.startsWith('sb-'))
              console.warn(`[App] Sesi tetap tidak ada setelah re-check — TIDAK memaksa logout (sesuai konfigurasi). Fitur yang butuh Supabase client langsung mungkin gagal diam-diam sampai user login ulang manual. (key sb-* saat re-check: ${sbKeysAfter.length > 0 ? 'masih ada tapi ditolak/invalid' : 'tidak ada'})`)
            }
          } catch (e) {
            console.warn('[App] Error saat re-check sesi:', e)
          }
        }, 0)
        return
      }

      setUser(u)

      setChatMessages(loadMessages(u.id))
      requestPersistentStorage()

      // FIX: registerServiceWorker() + refreshFcmTokenIfGranted() dulu cuma
      // jalan di dalam blok `_event === 'SIGNED_IN'` (login baru). Tapi
      // main.jsx (sebelum diperbaiki) unregister SEMUA service worker di
      // SETIAP app load — jadi begitu user reload app dengan sesi yang
      // sudah ada (event-nya 'INITIAL_SESSION'/'TOKEN_REFRESHED', BUKAN
      // 'SIGNED_IN'), SW push yang tadi ke-unregister TIDAK PERNAH
      // ke-register ulang. Efeknya: push notification + install-eligibility
      // mati diam-diam setelah reload pertama pasca-login, sampai user
      // logout lalu login lagi. Dipindah ke luar blok SIGNED_IN supaya
      // jalan di SETIAP sesi (termasuk reload) — aman dipanggil berulang:
      // registerServiceWorker() idempotent (browser cukup pakai registrasi
      // yang sudah ada kalau URL sama), dan refreshFcmTokenIfGranted() sudah
      // sendiri mengecek Notification.permission === 'granted' sebelum
      // melakukan apapun, jadi tidak memicu prompt izin untuk user yang
      // belum pernah kasih izin.
      try {
        ;(async () => {
          await registerServiceWorker()
          await refreshFcmTokenIfGranted(u.id)
        })()
        listenForMessages((msg) => {
          console.log('Push notification received:', msg)
          setPushToast(msg)
          setTimeout(() => setPushToast(null), 6000)
        })
      } catch (firebaseErr) {
        console.warn('[Firebase setup]', firebaseErr)
      }

      if (_event === 'SIGNED_IN') {
        setTimeout(() => {
          syncDiscoveryData(u, setChatMessages)
        }, 0)
      }
    })
    return () => authListenerSub.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: '16px',
      background: 'var(--wa-header)'
    }}>
      <img src="/verneks_icon_1.png" alt="Verneks" style={{ width: 56, height: 56, objectFit: 'contain' }} />
      <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.4rem' }}>Verneks</div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>Memuat...</div>
    </div>
  )

  const PageLoader = (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: '16px',
      background: 'var(--wa-header)'
    }}>
      <img src="/verneks_icon_1.png" alt="Verneks" style={{ width: 56, height: 56, objectFit: 'contain' }} />
      <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.4rem' }}>Verneks</div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>Memuat...</div>
    </div>
  )

  return (
    <>
    <BrowserRouter>
      <Suspense fallback={PageLoader}>
      <Routes>
        <Route path="/"              element={<Home user={user} />} />
        <Route path="/login"         element={<Login />} />
        <Route path="/register"      element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/pricing"       element={<Pricing user={user} />} />
        <Route path="/chat"          element={<Chat user={user} chatMessages={chatMessages} setChatMessages={setChatMessages} subscription={subscription} />} />
        <Route path="/discovery"      element={<Discovery />} />
        <Route path="/genome-result"   element={<GenomeResult />} />
        <Route path="/paywall"          element={<Paywall />} />
        <Route path="/dashboard"       element={<Dashboard user={user} loading={loading} subscription={subscription} />} />
        <Route path="/journey"         element={<Journey user={user} loading={loading} subscription={subscription} />} />
        <Route path="/dna"            element={<DNA user={user} loading={loading} subscription={subscription} />} />
        <Route path="/opportunities"  element={<Opportunities user={user} loading={loading} />} />
        <Route path="/profile"        element={<Profile user={user} loading={loading} subscription={subscription} />} />
        <Route path="/blog"          element={<Blog user={user} />} />
        <Route path="/blog/:slug"    element={<BlogPost user={user} />} />
        
        {/* NEW: Career Library Routes */}
        <Route path="/library"           element={<LibraryList user={user} />} />
        <Route path="/library/:slug"     element={<GuideDetail user={user} />} />
        
        <Route path="/adm-lc"        element={<AdminPanel />} />

        {/* Backward Compatibility */}
        <Route path="/cv-review"      element={<Chat user={user} chatMessages={chatMessages} setChatMessages={setChatMessages} subscription={subscription} />} />
        <Route path="/ats-checker"    element={<Chat user={user} chatMessages={chatMessages} setChatMessages={setChatMessages} subscription={subscription} />} />
        <Route path="/mock-interview" element={<Chat user={user} chatMessages={chatMessages} setChatMessages={setChatMessages} subscription={subscription} />} />
        <Route path="/career-coach"   element={<Chat user={user} chatMessages={chatMessages} setChatMessages={setChatMessages} subscription={subscription} />} />
        <Route path="/cv-maker"       element={<Chat user={user} chatMessages={chatMessages} setChatMessages={setChatMessages} subscription={subscription} />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
    {showUpgrade && user && (
      <UpgradeModal
        user={user}
        initialData={upgradeData}
        onClose={() => { setShowUpgrade(false); setUpgradeData(null) }}
      />
    )}
    <InstallPrompt user={user} />
    <NotificationPrompt user={user} />
    {pushToast && (
      <div
        onClick={() => {
          const action = pushToast.data?.action
          if (action === 'open-chat') window.location.href = '/chat'
          else if (action === 'open-journey') window.location.href = '/journey'
          else if (action === 'open-upgrade') window.dispatchEvent(new CustomEvent('show-upgrade'))
          setPushToast(null)
        }}
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          left: '16px',
          maxWidth: '380px',
          marginLeft: 'auto',
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderLeft: '4px solid var(--green)',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          padding: '14px 16px',
          zIndex: 9999,
          cursor: 'pointer',
          fontFamily: 'var(--font-display)',
          animation: 'verneks-toast-in 0.25s ease-out',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--dark)', marginBottom: '2px' }}>
          {pushToast.title || 'Diah Anna'}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--gray)', lineHeight: 1.4 }}>
          {pushToast.body}
        </div>
      </div>
    )}
    </>
  )
}
