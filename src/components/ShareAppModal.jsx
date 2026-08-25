import { useState } from "react"
const APP_URL = 'https://verneks.my.id'
const SHARE_TEXT = `Hei! Aku lagi pakai Verneks — teman curhat AI yang selalu ada buat dengerin, kapan aja 💙

Coba gratis → ${APP_URL}`

export default function ShareAppModal({ onClose }) {
  const [copied, setCopied] = useState(false)

  const handleNative = () => {
    if (navigator?.share) {
      navigator.share({ title: 'Verneks — Teman Curhat AI', text: SHARE_TEXT, url: APP_URL }).catch(() => {})
    }
  }

  const handleWA = () => window.open(`https://wa.me/?text=${encodeURIComponent(SHARE_TEXT)}`, '_blank')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_TEXT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
       <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', background: '#08111F', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', border: '1px solid rgba(91,126,239,0.28)' }}>

        {/* Handle */}
        <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(91,126,239,0.48)' }}/>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>Ajak teman pakai Verneks</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>Gratis — biar mereka juga punya tempat cerita</div>
          </div>
        </div>

        {/* Preview teks */}
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '13px', marginBottom: 18 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', lineHeight: 1.65, whiteSpace: 'pre-line' }}>{SHARE_TEXT}</div>
        </div>

        {/* Tombol share */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {typeof navigator !== 'undefined' && navigator.share && (
            <button onClick={handleNative} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: 'linear-gradient(135deg, #6745E8, #22A8F2)', color: '#fff',
              fontWeight: 700, fontSize: '0.9rem', padding: '13px', borderRadius: 12, border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(63,116,236,0.35)',
            }}>
              ↗️ Bagikan via...
            </button>
          )}

          <button onClick={handleWA} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: navigator?.share ? 'rgba(103,69,232,0.12)' : '#6745E8',
            border: navigator?.share ? '1px solid rgba(91,126,239,0.38)' : 'none',
            color: navigator?.share ? '#B8C5FF' : '#fff',
            fontWeight: 700, fontSize: '0.9rem', padding: '13px', borderRadius: 12, cursor: 'pointer',
          }}>
            💬 Kirim ke WhatsApp
          </button>

          <button onClick={handleCopy} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'rgba(255,255,255,0.07)', color: copied ? '#34D399' : 'rgba(255,255,255,0.7)',
            fontWeight: 600, fontSize: '0.85rem', padding: '12px', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'color 0.2s',
          }}>
            {copied ? '✓ Tersalin!' : '📋 Copy teks'}
          </button>
        </div>

        <button onClick={onClose} style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', cursor: 'pointer', padding: '8px' }}>
          Tutup
        </button>
      </div>
    </div>
  )
}
