import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BLOG_POSTS as STATIC_POSTS } from '../data/blogPosts'
import { supabase } from '../lib/supabase'

const Logo = () => (
  <img src="/verneks_icon_1.png" alt="Verneks" width="28" height="28" style={{ objectFit: 'contain', flexShrink: 0 }} />
)

const CATEGORIES = ['Semua', 'Tips CV', 'Interview', 'Karir', 'LinkedIn']

const CATEGORY_COLORS = {
  'Tips CV': { color: '#34B7F1', bg: 'rgba(52,183,241,0.12)' },
  'Interview': { color: '#FFB74D', bg: 'rgba(255,183,77,0.12)' },
  'Karir': { color: '#25D366', bg: 'rgba(37,211,102,0.12)' },
  'LinkedIn': { color: '#F48FB1', bg: 'rgba(244,143,177,0.12)' },
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function Blog({ user }) {
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState('Semua')
  const [visible, setVisible] = useState(false)
  const [search, setSearch] = useState('')
  const [dbPosts, setDbPosts] = useState([])

  useEffect(() => {
    // Artikel dari cron generate-daily-article — digabung dengan 6 artikel
    // statis lama (STATIC_POSTS) supaya keduanya tampil bareng tanpa perlu
    // migrasi manual. Gagal fetch (misal Supabase down) tidak menghalangi
    // halaman tampil — tetap fallback ke STATIC_POSTS saja.
    supabase
      .from('blog_articles')
      .select('slug, title, excerpt, category, emoji, keywords, faq, content, read_time, published_at')
      .order('published_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.warn('[Blog] fetch db articles gagal:', error.message); return }
        setDbPosts((data || []).map(a => ({
          slug: a.slug, title: a.title, excerpt: a.excerpt, category: a.category,
          emoji: a.emoji, date: a.published_at, readTime: a.read_time,
          keywords: a.keywords || [], faq: a.faq || [], content: a.content,
        })))
      })
  }, [])

  const BLOG_POSTS = [...dbPosts, ...STATIC_POSTS].sort((a, b) => new Date(b.date) - new Date(a.date))

  useEffect(() => {
    // SEO meta tags
    document.title = 'Blog Karir — Tips CV, Interview & Pengembangan Karir | Verneks'
    const metaDesc = document.querySelector('meta[name="description"]')
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Tips dan panduan praktis seputar CV, interview kerja, negosiasi gaji, dan pengembangan karir untuk profesional Indonesia.')
    } else {
      const meta = document.createElement('meta')
      meta.name = 'description'
      meta.content = 'Tips dan panduan praktis seputar CV, interview kerja, negosiasi gaji, dan pengembangan karir untuk profesional Indonesia.'
      document.head.appendChild(meta)
    }

    // Open Graph
    const setOg = (property, content) => {
      let el = document.querySelector(`meta[property="${property}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el) }
      el.setAttribute('content', content)
    }
    setOg('og:title', 'Blog Karir Verneks — Tips CV, Interview & Pengembangan Karir')
    setOg('og:description', 'Tips dan panduan praktis seputar CV, interview kerja, negosiasi gaji, dan pengembangan karir untuk profesional Indonesia.')
    setOg('og:type', 'website')
    setOg('og:url', window.location.href)

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]')
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical) }
    canonical.href = window.location.origin + '/blog'

    setTimeout(() => setVisible(true), 80)
  }, [])

  const filtered = BLOG_POSTS.filter(p => {
    const matchCat = activeCategory === 'Semua' || p.category === activeCategory
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.excerpt.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #075E54 0%, #0a1628 55%, #0d1f1a 100%)',
      fontFamily: 'var(--font-body)',
      overflowX: 'hidden',
    }}>
      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(7,94,84,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <Logo />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.3px' }}>Verneks</span>
        </div>
        <button
          onClick={() => navigate(user ? '/chat' : '/login')}
          style={{
            background: '#25D366', color: '#fff', border: 'none',
            borderRadius: 10, padding: '8px 16px',
            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
          }}
        >
          {user ? 'Buka Aplikasi' : 'Coba Gratis →'}
        </button>
      </nav>

      {/* ── HERO ── */}
      <div style={{
        padding: '48px 20px 32px',
        textAlign: 'center',
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(16px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>
        <div style={{
          display: 'inline-block',
          background: 'rgba(37,211,102,0.1)',
          border: '1px solid rgba(37,211,102,0.2)',
          borderRadius: 20, padding: '6px 14px',
          color: '#25D366', fontSize: '0.75rem', fontWeight: 600,
          letterSpacing: '0.5px', marginBottom: 16,
        }}>
          📚 Blog Karir
        </div>
        <h1 style={{
          color: '#fff', fontWeight: 900,
          fontSize: 'clamp(1.6rem, 6vw, 2.4rem)',
          letterSpacing: '-0.5px', lineHeight: 1.2,
          marginBottom: 12,
        }}>
          Tips Karir untuk<br/>
          <span style={{ color: '#25D366' }}>Profesional Indonesia</span>
        </h1>
        <p style={{
          color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem',
          lineHeight: 1.6, maxWidth: 380, margin: '0 auto',
        }}>
          Panduan praktis CV, interview, negosiasi gaji, dan pengembangan karir — ditulis berdasarkan data nyata dari ribuan job seeker.
        </p>
      </div>

      {/* ── SEARCH ── */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ position: 'relative', maxWidth: 480, margin: '0 auto' }}>
          <span style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: 'rgba(255,255,255,0.35)', fontSize: '1rem',
          }}>🔍</span>
          <input
            type="text"
            placeholder="Cari artikel..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
              padding: '11px 14px 11px 40px',
              color: '#fff', fontSize: '0.88rem', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* ── CATEGORY FILTER ── */}
      <div style={{
        padding: '0 16px 20px',
        display: 'flex', gap: 8, overflowX: 'auto',
        scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
      }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              background: activeCategory === cat ? '#25D366' : 'rgba(255,255,255,0.06)',
              border: activeCategory === cat ? 'none' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20, padding: '7px 16px',
              color: activeCategory === cat ? '#fff' : 'rgba(255,255,255,0.55)',
              fontWeight: activeCategory === cat ? 700 : 500,
              fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.2s ease', flexShrink: 0,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ── ARTIKEL LIST ── */}
      <div style={{ padding: '0 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: '40px 0', fontSize: '0.9rem' }}>
            Tidak ada artikel yang cocok 🔍
          </div>
        )}
        {filtered.map((post, i) => {
          const cat = CATEGORY_COLORS[post.category] || { color: '#25D366', bg: 'rgba(37,211,102,0.1)' }
          return (
            <article
              key={post.slug}
              onClick={() => navigate(`/blog/${post.slug}`)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 18, padding: '20px',
                cursor: 'pointer',
                opacity: visible ? 1 : 0,
                transform: visible ? 'none' : 'translateY(12px)',
                transition: `opacity 0.5s ease ${0.05 * i}s, transform 0.5s ease ${0.05 * i}s, border-color 0.2s`,
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(37,211,102,0.3)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: cat.bg, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0,
                }}>
                  {post.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      background: cat.bg, color: cat.color,
                      fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.5px',
                      padding: '2px 8px', borderRadius: 20,
                    }}>
                      {post.category}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem' }}>
                      {formatDate(post.date)} · {post.readTime} baca
                    </span>
                  </div>
                  <h2 style={{
                    color: '#fff', fontWeight: 700,
                    fontSize: '0.95rem', lineHeight: 1.4,
                    marginBottom: 8, letterSpacing: '-0.2px',
                  }}>
                    {post.title}
                  </h2>
                  <p style={{
                    color: 'rgba(255,255,255,0.45)',
                    fontSize: '0.8rem', lineHeight: 1.55,
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {post.excerpt}
                  </p>
                  <div style={{
                    color: '#25D366', fontSize: '0.78rem',
                    fontWeight: 600, marginTop: 10,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    Baca selengkapnya →
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {/* ── CTA BOTTOM ── */}
      <div style={{ padding: '8px 16px 60px' }}>
        <div style={{
          background: 'rgba(37,211,102,0.06)',
          border: '1px solid rgba(37,211,102,0.15)',
          borderRadius: 20, padding: '24px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.6rem', marginBottom: 8 }}>💙</div>
          <h2 style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', marginBottom: 8, letterSpacing: '-0.3px' }}>
            Sudah tahu tipsnya?<br/>Sekarang giliran praktik!
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', marginBottom: 18, lineHeight: 1.5 }}>
            Diskusikan situasi karir kamu langsung dengan Diah Anna — gratis, tanpa kartu kredit.
          </p>
          <button
            onClick={() => navigate(user ? '/chat' : '/login')}
            style={{
              width: '100%', background: '#25D366', color: '#fff',
              border: 'none', borderRadius: 14, padding: '14px',
              fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
              letterSpacing: '-0.2px',
            }}
          >
            {user ? 'Buka Verneks →' : 'Coba Gratis Sekarang →'}
          </button>
        </div>
      </div>
    </div>
  )
}
