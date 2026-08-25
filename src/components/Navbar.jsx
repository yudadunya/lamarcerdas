import { Link, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from '../lib/supabase'
import { useState } from 'react'

export default function Navbar({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    // Tandai ini logout SENGAJA (diklik user) — App.jsx pakai sinyal ini
    // untuk membedakan logout manual vs sesi hilang tak terduga.
    window.dispatchEvent(new CustomEvent('verneks:manual-logout'))
    await signOut()
    navigate('/')
  }

  const isActive = (path) => location.pathname === path

  return (
    <nav style={styles.nav}>
      <div style={styles.container}>
        <Link to="/" style={{ ...styles.logo, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/verneks_icon_1.png" alt="Verneks" width="28" height="28" style={{ objectFit: 'contain' }} />
          <span>Verneks</span>
        </Link>

        {user && (
          <div style={styles.links}>
            <Link to="/cv-review" style={{ ...styles.link, ...(isActive('/cv-review') ? styles.linkActive : {}) }}>
              CV Review
            </Link>
            <Link to="/ats-checker" style={{ ...styles.link, ...(isActive('/ats-checker') ? styles.linkActive : {}) }}>
              ATS Checker
            </Link>
            <Link to="/mock-interview" style={{ ...styles.link, ...(isActive('/mock-interview') ? styles.linkActive : {}) }}>
              Mock Interview
            </Link>
            <Link to="/career-coach" style={{ ...styles.link, ...(isActive('/career-coach') ? styles.linkActive : {}) }}>
              Diah Anna - Career Coach
            </Link>
          </div>
        )}

        <div style={styles.actions}>
          {user ? (
            <>
              <Link to="/dashboard" style={styles.btnDashboard}>Dashboard</Link>
              <button onClick={handleSignOut} style={styles.btnSignOut}>Keluar</button>
            </>
          ) : (
            <>
              <Link to="/login" style={styles.btnLogin}>Masuk</Link>
              <Link to="/register" style={styles.btnRegister}>Mulai Gratis</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

const styles = {
  nav: {
    background: 'rgba(250, 250, 247, 0.92)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 24px',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '32px',
  },
  logo: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.4rem',
    fontWeight: 700,
    color: 'var(--dark)',
    flexShrink: 0,
  },
  logoAccent: {
    color: 'var(--green)',
  },
  links: {
    display: 'flex',
    gap: '4px',
    flex: 1,
  },
  link: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--gray)',
    padding: '6px 12px',
    borderRadius: '8px',
    transition: 'all 0.15s',
  },
  linkActive: {
    color: 'var(--green)',
    background: '#f0fdf4',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexShrink: 0,
  },
  btnLogin: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--gray)',
    padding: '8px 16px',
    borderRadius: '8px',
  },
  btnRegister: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#fff',
    background: 'var(--green)',
    padding: '8px 16px',
    borderRadius: '8px',
  },
  btnDashboard: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--gray)',
    padding: '8px 16px',
    borderRadius: '8px',
  },
  btnSignOut: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--gray)',
    background: 'none',
    border: '1px solid var(--border)',
    padding: '8px 16px',
    borderRadius: '8px',
  },
}
