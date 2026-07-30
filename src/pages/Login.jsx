import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleGoogle = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // FIX: sebelumnya hardcode ke '/chat' — user BARU (belum punya
        // career_readiness) jadi selalu mendarat di /chat duluan, baru
        // ke-redirect ke /discovery belakangan (race condition dengan
        // trigger Onboarding.jsx fallback di Chat.jsx — kadang popup
        // Onboarding sempat kepicu duluan sebelum redirect ke /discovery
        // selesai). Redirect ke root '/' supaya App.jsx yang nentuin
        // tujuan akhir (hasCareerData ? '/chat' : '/discovery') SEBELUM
        // Chat.jsx sempat mount sama sekali — bukan lagi race.
        redirectTo: `${window.location.origin}/`
      }
    })
    if (error) {
      setError('Gagal masuk dengan Google. Coba lagi.')
      setLoading(false)
    }
  }

  return (
    <div className="wa-screen" style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        background: 'var(--wa-header)',
        padding: '60px 24px 80px',
        textAlign: 'center'
      }}>
        <img src="/verneks_icon_1.png" alt="Verneks" style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: '12px' }} />
        <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.3px' }}>
          Verneks
        </div>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginTop: '6px' }}>
          Your AI Career Coach
        </div>
      </div>

      {/* Card */}
      <div style={{
        background: '#fff',
        borderRadius: '24px 24px 0 0',
        marginTop: '-24px',
        flex: 1,
        padding: '40px 24px 48px',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: '8px', fontWeight: 700, fontSize: '1.2rem', color: 'var(--wa-dark)' }}>
          Masuk ke Akun
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--wa-gray)', marginBottom: '32px', lineHeight: 1.6 }}>
          Gunakan akun Google kamu untuk<br />masuk atau daftar secara otomatis
        </div>

        {error && (
          <div className="wa-alert red" style={{ marginBottom: '16px', textAlign: 'left' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            background: loading ? '#f5f5f5' : '#fff',
            color: '#3c4043',
            fontWeight: 600,
            fontSize: '0.95rem',
            padding: '14px 20px',
            borderRadius: '12px',
            border: '1.5px solid #e0e0e0',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            transition: 'all 0.15s ease',
          }}
        >
          {!loading && (
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          )}
          {loading ? 'Mengarahkan...' : 'Masuk dengan Google'}
        </button>

        <div style={{
          marginTop: '24px',
          padding: '16px',
          background: 'var(--wa-gray-light)',
          borderRadius: '12px',
          fontSize: '0.8rem',
          color: 'var(--wa-gray)',
          lineHeight: 1.6,
          textAlign: 'left'
        }}>
          <strong style={{ color: 'var(--wa-dark)' }}>ℹ️ Belum punya akun?</strong><br />
          Akun baru akan dibuat otomatis saat kamu masuk pertama kali dengan Google.
        </div>

        <div style={{ marginTop: '24px', fontSize: '0.75rem', color: 'var(--wa-gray)', lineHeight: 1.7 }}>
          Dengan masuk, kamu setuju dengan<br />
          <span style={{ color: 'var(--wa-green-dark)', fontWeight: 600 }}>Syarat & Ketentuan</span>
          {' '}dan{' '}
          <span style={{ color: 'var(--wa-green-dark)', fontWeight: 600 }}>Kebijakan Privasi</span>
        </div>
      </div>
    </div>
  )
}
