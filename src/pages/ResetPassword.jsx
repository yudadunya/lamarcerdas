import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleReset = async () => {
    if (!password) return setError('Isi password baru kamu.')
    if (password.length < 6) return setError('Password minimal 6 karakter.')
    if (password !== confirm) return setError('Password tidak cocok.')

    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError('Gagal update password. Coba request reset ulang.')
    } else {
      navigate('/login?reset=success')
    }
    setLoading(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
         <Link to="/" style={{ ...styles.logo, display: 'flex', alignItems: 'center', gap: '8px' }}>
           <img src="/verneks_icon_1.png" alt="Verneks" width="28" height="28" style={{ objectFit: 'contain' }} />
           <span>Verneks</span>
         </Link>
        <h1 style={styles.title}>Buat Password Baru</h1>
        <p style={styles.sub}>Minimal 6 karakter ya.</p>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.field}>
          <label style={styles.label}>Password Baru</label>
          <input
            style={styles.input}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Konfirmasi Password</label>
          <input
            style={styles.input}
            type="password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleReset()}
          />
        </div>

        <button onClick={handleReset} disabled={loading} style={styles.btn}>
          {loading ? 'Menyimpan...' : 'Simpan Password Baru'}
        </button>
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
  title: { fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, marginBottom: '6px' },
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
    cursor: 'pointer',
  },
}
