import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function VerifyPhone({ user }) {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('phone') // phone | otp
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSendOTP = async () => {
    if (!phone || phone.length < 9) return setError('Masukkan nomor WA yang valid.')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, userId: user.id }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStep('otp')
    } catch (e) {
      setError(e.message || 'Gagal kirim OTP. Coba lagi.')
    }
    setLoading(false)
  }

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) return setError('Masukkan 6 digit kode OTP.')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, userId: user.id, phone }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      navigate('/chat')
    } catch (e) {
      setError(e.message || 'Kode salah atau expired.')
    }
    setLoading(false)
  }

  const handleSkip = () => navigate('/chat')

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>📱</div>

        {step === 'phone' ? (
          <>
            <h1 style={styles.title}>Verifikasi WhatsApp</h1>
            <p style={styles.sub}>
              Satu langkah lagi! Verifikasi nomor WA kamu untuk:
            </p>

            <div style={styles.perks}>
              <div style={styles.perk}>🔒 Keamanan akun</div>
              <div style={styles.perk}>💡 Tips karir dari Diah Anna langsung ke WA</div>
              <div style={styles.perk}>🔔 Notifikasi fitur & promo terbaru</div>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.field}>
              <label style={styles.label}>Nomor WhatsApp</label>
              <div style={styles.phoneInput}>
                <span style={styles.prefix}>🇮🇩 +62</span>
                <input
                  style={styles.input}
                  type="tel"
                  placeholder="812xxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendOTP()}
                />
              </div>
            </div>

            <button onClick={handleSendOTP} disabled={loading} style={styles.btn}>
              {loading ? 'Mengirim OTP...' : 'Kirim Kode OTP via WA'}
            </button>

            
          </>
        ) : (
          <>
            <h1 style={styles.title}>Masukkan Kode OTP</h1>
            <p style={styles.sub}>
              Kode 6 digit sudah dikirim ke WA <strong>+62{phone}</strong>
            </p>

            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.field}>
              <label style={styles.label}>Kode OTP</label>
              <input
                style={{ ...styles.input, textAlign: 'center', fontSize: '1.5rem', letterSpacing: '8px', padding: '16px' }}
                type="number"
                placeholder="000000"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyOTP()}
              />
            </div>

            <button onClick={handleVerifyOTP} disabled={loading} style={styles.btn}>
              {loading ? 'Memverifikasi...' : 'Verifikasi'}
            </button>

            <button onClick={() => { setStep('phone'); setOtp(''); setError(null) }} style={styles.btnSkip}>
              Ganti nomor WA
            </button>

            
          </>
        )}
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
    maxWidth: '440px',
    textAlign: 'center',
  },
  icon: { fontSize: '3rem', marginBottom: '16px' },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.6rem',
    fontWeight: 700,
    marginBottom: '8px',
  },
  sub: {
    color: 'var(--gray)',
    fontSize: '0.9rem',
    lineHeight: 1.6,
    marginBottom: '20px',
  },
  perks: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    textAlign: 'left',
  },
  perk: { fontSize: '0.875rem', color: 'var(--dark)' },
  error: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    borderRadius: '10px',
    padding: '12px 16px',
    fontSize: '0.875rem',
    marginBottom: '16px',
  },
  field: { marginBottom: '16px', textAlign: 'left' },
  label: { display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' },
  phoneInput: {
    display: 'flex',
    alignItems: 'center',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    overflow: 'hidden',
    background: 'var(--cream)',
  },
  prefix: {
    padding: '12px 14px',
    background: '#f3f4f0',
    fontSize: '0.9rem',
    borderRight: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    border: 'none',
    outline: 'none',
    fontSize: '0.95rem',
    background: 'transparent',
    fontFamily: 'var(--font-body)',
    width: '100%',
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
    marginBottom: '10px',
  },
  btnSkip: {
    width: '100%',
    background: 'none',
    color: 'var(--gray)',
    fontSize: '0.85rem',
    padding: '8px',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
}
