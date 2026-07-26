import { useEffect, useState } from 'react'
import { requestNotificationPermission } from '../lib/firebase'

const DISMISSED_KEY = 'lc_notif_prompt_dismissed'

/**
 * Overlay ajakan izin notifikasi — muncul otomatis sesaat setelah login,
 * BUKAN disembunyikan di balik tombol di halaman Profile.
 *
 * Kenapa tetap butuh satu klik ("Izinkan Notifikasi") sebelum native prompt
 * browser/OS muncul, bukan langsung manggil Notification.requestPermission()
 * begitu komponen ini mount: Chrome (dan browser modern lain) SENGAJA
 * meredam permission request yang dipicu tanpa user gesture asli — hasilnya
 * cuma ikon senyap di address bar, bukan popup yang kelihatan, atau bahkan
 * langsung dianggap "denied" tanpa pernah benar-benar nanya. Klik tombol di
 * overlay ini itu sendiri SUDAH gesture asli, jadi begitu diklik, native
 * prompt (popup browser di web / balon sistem di app HP terinstall) muncul
 * seketika — bukan disimulasikan, itu benar-benar dialog bawaan
 * browser/OS, di luar kendali kode kita untuk didesain ulang.
 *
 * Cuma tampil SEKALI (ditandai localStorage) supaya tidak nge-nag user yang
 * sudah pilih "Nanti" — tombol "Aktifkan Notifikasi" di halaman Profile
 * tetap ada sebagai jalan balik kalau user berubah pikiran nanti.
 */
export default function NotificationPrompt({ user }) {
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    if (typeof Notification === 'undefined') return // browser tidak dukung Notification API sama sekali
    if (Notification.permission !== 'default') return // sudah pernah diputuskan (granted/denied) — jangan tanya lagi
    if (localStorage.getItem(DISMISSED_KEY) === '1') return // user sudah pernah pilih "Nanti"

    // Delay singkat supaya tidak langsung nimpa layar pas app baru kebuka —
    // biarkan user lihat chat dulu sebentar sebelum diajak.
    const t = setTimeout(() => setShow(true), 2500)
    return () => clearTimeout(t)
  }, [user?.id])

  const handleAllow = async () => {
    setLoading(true)
    try {
      await requestNotificationPermission(user.id)
    } finally {
      setLoading(false)
      localStorage.setItem(DISMISSED_KEY, '1')
      setShow(false)
    }
  }

  const handleLater = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'calc(100% - 40px)', maxWidth: 380,
        background: '#0d1710', border: '1px solid rgba(37,211,102,0.25)',
        borderRadius: 20, zIndex: 1001, padding: '24px 22px',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <div style={{ fontSize: '2.2rem', textAlign: 'center', marginBottom: 10 }}>🔔</div>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', textAlign: 'center', marginBottom: 8 }}>
          Aktifkan Notifikasi
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.83rem', lineHeight: 1.6, textAlign: 'center', marginBottom: 18 }}>
          Diah Anna bisa ingetin kamu soal progress karier &amp; langkah yang masih tertunda — tanpa spam, cuma pas benar-benar relevan.
        </div>

        <button
          onClick={handleAllow}
          disabled={loading}
          style={{
            width: '100%', padding: '13px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg,#25D366,#128C7E)', color: '#fff',
            fontWeight: 700, fontSize: '0.9rem', cursor: loading ? 'default' : 'pointer',
            marginBottom: 10, opacity: loading ? 0.7 : 1,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {loading ? 'Menunggu...' : 'Izinkan Notifikasi'}
        </button>
        <button
          onClick={handleLater}
          disabled={loading}
          style={{ width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', cursor: 'pointer', padding: '8px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Nanti saja
        </button>
      </div>
    </>
  )
}
