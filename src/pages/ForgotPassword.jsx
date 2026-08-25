import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  const handleReset = async () => {
    if (!email) return setError('Isi email kamu dulu ya.')
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
  if (error.message.includes('rate') || error.status === 429) {
    setError('Batas pengiriman email tercapai. Tunggu 1 jam lalu coba lagi ya.')
  } else {
    setError('Email tidak ditemukan. Pastikan email yang kamu daftarkan benar.')
  }
} else {
  setSuccess(true)
}
    setLoading(false)
  }

  if (success) return (
    <div style={styles.page}>
      <div style={{ ...styles.card, textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📧</div>
        <h2 style={styles.title}>Cek email kamu!</h2>
        <p style={{ color: 'var(--gray)', fontSize: '0.9rem', marginTop: '8px', lineHeight: 1.6 }}>
          Kami kirim link reset password ke <strong>{email}</strong>.
          Klik link-nya untuk buat password baru.
          Kalau tidak ada email masuk dalam 5 menit, pastikan email kamu sudah terdaftar di Verneks.
        </p>
        <Link to="/login" style={{ ...styles.btn, display: 'block', textAlign: 'center', marginTop: '24px' }}>
          Kembali ke Login
        </Link>
      </div>
    </div>
  )

  return (
    <div style={styles.page}>
      <div style={styles.card}>
         <Link to="/" style={{ ...styles.logo, display: 'flex', alignItems: 'center', gap: '8px' }}>
           <img src="/verneks_icon_1.png" alt="Verneks" width="28" height="28" style={{ objectFit: 'contain' }} />
           <span>Verneks</span>
         </Link>
        <h1 style={styles.title}>Lupa Password?</h1>
        <p style={styles.sub}>Tenang, kita kirim link reset ke email kamu.</p>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.field}>
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            type="email"
            placeholder="kamu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleReset()}
          />
        </div>

        <button onClick={handleReset} disabled={loading} style={styles.btn}>
          {loading ? 'Mengirim...' : 'Kirim Link Reset'}
        </button>

        <p style={styles.footer}>
          Ingat password? <Link to="/login" style={styles.link}>Masuk</Link>
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: 'calc(100vh - 64px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
  },
  card: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    padding: '40px',
    width: '100%',
    maxWidth: '420px',
  },
  logo: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.3rem',
    fontWeight: 700,
    display: 'block',
    marginBottom: '28px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.6rem',
    fontWeight: 700,
    marginBottom: '6px',
  },
  sub: { color: 'var(--gray)', fontSize: '0.9rem', marginBottom: '28px' },
  error: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    borderRadius: '10px',
    padding: '12px 16px',
    fontSize: '0.875rem',
    marginBottom: '20px',
  },
  field: { marginBottom: '16px' },
  label: { display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' },
  input: {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    fontSize: '0.95rem',
    outline: 'none',
    background: 'var(--cream)',
    color: 'var(--dark)',
  },
  btn: {
    width: '100%',
    background: 'var(--green)',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.95rem',
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    marginBottom: '20px',
    cursor: 'pointer',
  },
  footer: { textAlign: 'center', fontSize: '0.875rem', color: 'var(--gray)' },
  link: { color: 'var(--green)', fontWeight: 600 },
}
