/**
 * src/pages/Library/index.jsx
 * 
 * Panduan Self-Care — List Page
 * Shows semua guide dengan search & filter
 * CATATAN PIVOT: chrome halaman ini sudah self-care, tapi ISI 20 guide di
 * tabel Supabase `career_library` masih konten lama (career). Perlu ditulis
 * ulang terpisah — lihat catatan di ringkasan akhir.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/Library.css'

const Logo = () => (
  <img src="/verneks_icon_1.png" alt="Verneks" width="28" height="28" style={{ objectFit: 'contain', flexShrink: 0 }} />
)

export default function LibraryList({ user }) {
  const navigate = useNavigate()
  const [guides, setGuides] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)

  // Set page meta tags
  useEffect(() => {
    document.title = 'Panduan Self-Care - Verneks'
    const metaDesc = document.querySelector('meta[name="description"]')
    if (metaDesc) {
      metaDesc.content = 'Jelajahi koleksi panduan self-care lengkap dari Diah Anna. Panduan praktis buat overthinking, kesehatan mental, hubungan, dan self-care.'
    }
  }, [])

  // Fetch guides
  useEffect(() => {
    const fetchGuides = async () => {
      try {
        setLoading(true)
        let query = supabase
          .from('career_library')
          .select('id, slug, title, meta_description, published_at')
          .order('published_at', { ascending: false })

        if (searchTerm.trim()) {
          query = query.or(
            `slug.ilike.%${searchTerm}%,title.ilike.%${searchTerm}%`
          )
        }

        const { data, error } = await query

        if (error) {
          console.error('Error fetching guides:', error)
          setGuides([])
        } else {
          setGuides(data || [])
        }
      } catch (err) {
        console.error('Fetch error:', err)
        setGuides([])
      } finally {
        setLoading(false)
      }
    }

    // Debounce search
    const timer = setTimeout(fetchGuides, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #075E54 0%, #0a1628 55%, #0d1f1a 100%)',
      fontFamily: 'var(--font-body)',
    }}>
      {/* ── NAVBAR (konsisten sama Blog.jsx & Home.jsx — sebelumnya halaman ini
           sama sekali nggak punya navbar, kerasa lepas dari brand Verneks) ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(7,94,84,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <Logo />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.3px' }}>Verneks</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate('/blog')} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.65)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Blog
          </button>
          <button onClick={() => navigate(user ? '/chat' : '/login')} style={{
            background: '#25D366', color: '#fff', border: 'none',
            borderRadius: 10, padding: '8px 16px',
            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
          }}>
            {user ? 'Buka Aplikasi' : 'Coba Gratis →'}
          </button>
        </div>
      </nav>

      <div className="library-container">
      {/* Header */}
      <div className="library-header">
        <h1>Panduan Self-Care</h1>
        <p>Jelajahi panduan lengkap buat ngerawat diri & pikiran kamu</p>
      </div>

      {/* Search */}
      <div className="library-search">
        <input
          type="text"
          placeholder="Cari guide by title atau keyword..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        {searchTerm && (
          <button 
            className="search-clear"
            onClick={() => setSearchTerm('')}
          >
            ✕
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="library-stats">
        <p>{guides.length} guides tersedia</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="loading">
          <p>Loading guides...</p>
        </div>
      )}

      {/* Empty */}
      {!loading && guides.length === 0 && (
        <div className="empty-state">
          <p>❌ Tidak ada guide yang cocok</p>
          <p className="small">Coba cari dengan kata kunci lain</p>
        </div>
      )}

      {/* Guides Grid */}
      {!loading && guides.length > 0 && (
        <div className="guides-grid">
          {guides.map((guide) => (
            <Link
              key={guide.id}
              to={`/library/${guide.slug}`}
              className="guide-card"
            >
              <div className="guide-card-header">
                <h3>{guide.title}</h3>
              </div>
              <p className="guide-description">{guide.meta_description}</p>
              <div className="guide-footer">
                <span className="guide-link">Baca Selengkapnya →</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="library-footer">
        <p>
          Ingin cerita lebih dalam soal ini?{' '}
          <Link to="/chat">Chat dengan Diah Anna 💬</Link>
        </p>
      </div>
      </div>
    </div>
  )
}
