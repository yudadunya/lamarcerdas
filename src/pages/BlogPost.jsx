import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BLOG_POSTS as STATIC_POSTS } from '../data/blogPosts'
import { supabase } from '../lib/supabase'

const Logo = () => (
  <svg width="26" height="26" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <defs>
      <linearGradient id="lgPost" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#25D366"/><stop offset="100%" stopColor="#128C7E"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="22" fill="url(#lgPost)"/>
    <rect x="27" y="18" width="36" height="50" rx="4" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="3"/>
    <line x1="34" y1="32" x2="56" y2="32" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="34" y1="41" x2="56" y2="41" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round"/>
    <line x1="34" y1="50" x2="50" y2="50" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="68" cy="72" r="12" fill="#25D366"/>
    <path d="M62 72 L66 76 L75 65" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M72,22 L73.4,25.6 L77,27 L73.4,28.4 L72,32 L70.6,28.4 L67,27 L70.6,25.6 Z" fill="rgba(255,255,255,0.85)"/>
  </svg>
)

const CATEGORY_COLORS = {
  'Overthinking':      { color: '#34B7F1', bg: 'rgba(52,183,241,0.12)' },
  'Kesehatan Mental':  { color: '#FFB74D', bg: 'rgba(255,183,77,0.12)' },
  'Hubungan':          { color: '#F48FB1', bg: 'rgba(244,143,177,0.12)' },
  'Self-Care':         { color: '#25D366', bg: 'rgba(37,211,102,0.12)' },
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

function parseMarkdown(text) {
  if (!text) return ''
  return text.trim().split('\n').map(line => {
    if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`
    if (line.startsWith('## '))  return `<h2>${line.slice(3)}</h2>`
    if (line.startsWith('# '))   return `<h1>${line.slice(2)}</h1>`
    if (line.startsWith('- ')) {
      const c = line.slice(2)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/❌ /g, '<span style="color:#EA0038">❌ </span>')
        .replace(/✅ /g, '<span style="color:#25D366">✅ </span>')
      return `<li>${c}</li>`
    }
    if (line.startsWith('> ')) return `<blockquote>${line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</blockquote>`
    if (line === '') return '<br/>'
    const c = line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/❌ /g, '<span style="color:#EA0038">❌ </span>')
      .replace(/✅ /g, '<span style="color:#25D366">✅ </span>')
    return `<p>${c}</p>`
  }).join('\n').replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
}

function FAQItem({ item, index }) {
  const [open, setOpen] = useState(index === 0)
  return (
    <div style={{
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none',
          padding: '16px 0', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 12, textAlign: 'left',
        }}
      >
        <span style={{
          color: '#fff', fontWeight: 600,
          fontSize: '0.88rem', lineHeight: 1.4, flex: 1,
        }}>
          {item.q}
        </span>
        <span style={{
          color: '#25D366', fontSize: '1rem', flexShrink: 0,
          transform: open ? 'rotate(45deg)' : 'none',
          transition: 'transform 0.2s ease',
          marginTop: 2,
        }}>+</span>
      </button>
      {open && (
        <p style={{
          color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem',
          lineHeight: 1.7, paddingBottom: 16, marginTop: -4,
        }}>
          {item.a}
        </p>
      )}
    </div>
  )
}

export default function BlogPost({ user }) {
  const navigate = useNavigate()
  const { slug } = useParams()
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dbPost, setDbPost] = useState(null)
  const [dbChecked, setDbChecked] = useState(false)
  const articleRef = useRef(null)

  const staticPost = STATIC_POSTS.find(p => p.slug === slug)

  // FIX: sebelumnya cuma cari di STATIC_POSTS — artikel hasil generate
  // harian (tersimpan di tabel blog_articles, cron generate-daily-article)
  // MUNCUL di list /blog, tapi begitu diklik ke halaman detail ini, SELALU
  // "Artikel tidak ditemukan" karena tidak pernah di-query ke Supabase sama
  // sekali. Ini serius buat SEO — search engine/AI crawler yang ikutin link
  // dari halaman list bakal ketemu link mati tiap hari. Sekarang: cek
  // STATIC_POSTS dulu (instant, tidak perlu network), kalau tidak ketemu
  // baru fetch dari blog_articles by slug.
  useEffect(() => {
    setDbPost(null)
    setDbChecked(false)
    if (staticPost) { setDbChecked(true); return }

    supabase
      .from('blog_articles')
      .select('slug, title, excerpt, category, emoji, keywords, faq, content, read_time, published_at')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('[BlogPost] fetch db article gagal:', error.message)
        if (data) {
          setDbPost({
            slug: data.slug, title: data.title, excerpt: data.excerpt, category: data.category,
            emoji: data.emoji, date: data.published_at, readTime: data.read_time,
            keywords: data.keywords || [], faq: data.faq || [], content: data.content,
          })
        }
        setDbChecked(true)
      })
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  const post = staticPost || dbPost
  // FIX: sebelumnya BLOG_POSTS (bukan STATIC_POSTS) — identifier itu tidak
  // pernah didefinisikan di file ini sama sekali, jadi ini ReferenceError
  // yang bikin SELURUH halaman detail artikel crash total saat render,
  // buat artikel manapun (statis maupun dari DB).
  const related = STATIC_POSTS.filter(p => p.slug !== slug && p.category === post?.category).slice(0, 2)

  useEffect(() => {
    if (!post) return

    // ── Basic meta ──
    document.title = `${post.title} | Verneks Blog`

    const setMeta = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`)
      if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el) }
      el.content = content
    }
    const setOg = (prop, content) => {
      let el = document.querySelector(`meta[property="${prop}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el) }
      el.content = content
    }

    setMeta('description', post.excerpt)
    setMeta('keywords', post.keywords.join(', '))
    setMeta('author', 'Verneks')
    setMeta('robots', 'index, follow')
    setOg('og:title', post.title)
    setOg('og:description', post.excerpt)
    setOg('og:type', 'article')
    setOg('og:url', window.location.href)
    setOg('og:site_name', 'Verneks')

    // ── Canonical ──
    let canonical = document.querySelector('link[rel="canonical"]')
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical) }
    canonical.href = `${window.location.origin}/blog/${slug}`

    // ── Article JSON-LD ──
    const articleSchema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.date,
      author: { '@type': 'Organization', name: 'Verneks', url: window.location.origin },
      publisher: { '@type': 'Organization', name: 'Verneks', url: window.location.origin },
      mainEntityOfPage: { '@type': 'WebPage', '@id': window.location.href },
      keywords: post.keywords.join(', '),
      inLanguage: 'id-ID',
      isAccessibleForFree: true,
    }

    // ── FAQ JSON-LD (disukai Google & AI search) ──
    const faqSchema = post.faq && post.faq.length > 0 ? {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: post.faq.map(item => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    } : null

    // ── BreadcrumbList JSON-LD ──
    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: window.location.origin },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${window.location.origin}/blog` },
        { '@type': 'ListItem', position: 3, name: post.title, item: window.location.href },
      ],
    }

    const injectSchema = (id, data) => {
      let el = document.querySelector(`#${id}`)
      if (!el) { el = document.createElement('script'); el.id = id; el.type = 'application/ld+json'; document.head.appendChild(el) }
      el.text = JSON.stringify(data)
    }

    injectSchema('schema-article', articleSchema)
    injectSchema('schema-breadcrumb', breadcrumbSchema)
    if (faqSchema) injectSchema('schema-faq', faqSchema)

    setTimeout(() => setVisible(true), 60)

    // ── Reading progress ──
    const handleScroll = () => {
      const el = articleRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const scrolled = Math.max(0, -rect.top)
      setProgress(Math.min(100, (scrolled / (el.offsetHeight - window.innerHeight)) * 100))
    }
    window.addEventListener('scroll', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      // Cleanup schemas on unmount
      ;['schema-article','schema-breadcrumb','schema-faq'].forEach(id => {
        const el = document.querySelector(`#${id}`)
        if (el) el.remove()
      })
    }
  }, [post, slug])

  if (!post && !dbChecked) return (
    <div style={{ minHeight: '100vh', background: '#0a1628', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>Memuat artikel...</div>
    </div>
  )

  if (!post) return (
    <div style={{ minHeight: '100vh', background: '#0a1628', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 }}>
      <div style={{ fontSize: '2.5rem' }}>🔍</div>
      <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '1.3rem', textAlign: 'center' }}>Artikel tidak ditemukan</h1>
      <button onClick={() => navigate('/blog')} style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontWeight: 700, cursor: 'pointer' }}>Kembali ke Blog</button>
    </div>
  )

  const cat = CATEGORY_COLORS[post.category] || { color: '#25D366', bg: 'rgba(37,211,102,0.1)' }
  const htmlContent = parseMarkdown(post.content)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #075E54 0%, #0a1628 40%, #0d1f1a 100%)', fontFamily: 'var(--font-body)' }}>

      {/* Reading Progress */}
      <div style={{ position: 'fixed', top: 0, left: 0, zIndex: 200, height: 3, background: '#25D366', width: `${progress}%`, transition: 'width 0.1s linear' }} />

      {/* Navbar */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(7,94,84,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/blog')} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, padding: '7px 12px', color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem', cursor: 'pointer' }}>
            ← Blog
          </button>
          <div onClick={() => navigate('/')} style={{ cursor: 'pointer' }}><Logo /></div>
        </div>
        <button onClick={() => navigate(user ? '/chat' : '/login')} style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
          {user ? 'Buka Aplikasi' : 'Coba Gratis →'}
        </button>
      </nav>

      {/* Article */}
      <article ref={articleRef} style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px 60px' }}>

        {/* Breadcrumb — juga untuk SEO */}
        <nav aria-label="breadcrumb" style={{ marginBottom: 20 }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
            <span style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>Home</span>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ cursor: 'pointer' }} onClick={() => navigate('/blog')}>Blog</span>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{post.category}</span>
          </span>
        </nav>

        {/* Header */}
        <header style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(14px)', transition: 'opacity 0.6s ease, transform 0.6s ease', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ background: cat.bg, color: cat.color, fontSize: '0.72rem', fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
              {post.category}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
              {formatDate(post.date)} · {post.readTime} baca
            </span>
          </div>
          <h1 style={{ color: '#fff', fontWeight: 900, fontSize: 'clamp(1.5rem, 5vw, 2.2rem)', lineHeight: 1.25, letterSpacing: '-0.5px', marginBottom: 16 }}>
            {post.title}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '1rem', lineHeight: 1.65, borderLeft: `3px solid ${cat.color}`, paddingLeft: 16 }}>
            {post.excerpt}
          </p>
        </header>

        {/* Content */}
        <div style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease 0.15s' }} dangerouslySetInnerHTML={{ __html: htmlContent }} />

        {/* FAQ Section */}
        {post.faq && post.faq.length > 0 && (
          <section style={{ marginTop: 48 }} aria-label="Pertanyaan yang Sering Ditanyakan">
            <h2 style={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem', marginBottom: 4, letterSpacing: '-0.2px' }}>
              Pertanyaan yang Sering Ditanyakan
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', marginBottom: 20 }}>
              FAQ seputar {post.title.toLowerCase()}
            </p>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '4px 20px' }}>
              {post.faq.map((item, i) => (
                <FAQItem key={i} item={item} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* Share */}
        <div style={{ marginTop: 40, padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem' }}>Artikel ini bermanfaat? Bagikan ke teman!</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                if (navigator.share) navigator.share({ title: post.title, url: window.location.href })
                else { navigator.clipboard.writeText(window.location.href); alert('Link disalin!') }
              }}
              style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 10, padding: '8px 16px', color: '#25D366', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              📤 Bagikan
            </button>
            <button
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(post.title + ' — ' + window.location.href)}`, '_blank')}
              style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 10, padding: '8px 16px', color: '#25D366', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              WhatsApp
            </button>
          </div>
        </div>

        {/* CTA */}
        <div style={{ marginTop: 24, background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.15)', borderRadius: 20, padding: '24px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>💙</div>
          <h2 style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', marginBottom: 8, letterSpacing: '-0.3px' }}>Masih kepikiran soal ini?</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', marginBottom: 18, lineHeight: 1.5 }}>
            Kamu nggak harus mikirin ini sendirian. Cerita ke Diah Anna, dengerin dulu baru dikasih sudut pandang lain.
          </p>
          <button onClick={() => navigate(user ? '/chat' : '/login')} style={{ width: '100%', background: '#25D366', color: '#fff', border: 'none', borderRadius: 14, padding: 14, fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', letterSpacing: '-0.2px' }}>
            {user ? 'Ngobrol dengan Diah Anna →' : 'Coba Gratis Sekarang →'}
          </button>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.72rem', marginTop: 8 }}>Tidak perlu kartu kredit · Langsung aktif</p>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <h2 style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 16 }}>Artikel Terkait</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {related.map(rel => {
                const rc = CATEGORY_COLORS[rel.category] || { color: '#25D366', bg: 'rgba(37,211,102,0.1)' }
                return (
                  <div key={rel.slug} onClick={() => { navigate(`/blog/${rel.slug}`); window.scrollTo(0,0) }}
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor='rgba(37,211,102,0.3)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>{rel.emoji}</div>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.35, marginBottom: 4 }}>{rel.title}</div>
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem' }}>{rel.readTime} baca</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </article>

      <style>{`
        article h1 { color:#fff; font-weight:900; font-size:1.6rem; margin:32px 0 12px; line-height:1.25; letter-spacing:-0.3px; }
        article h2 { color:#fff; font-weight:800; font-size:1.2rem; margin:32px 0 12px; line-height:1.3; letter-spacing:-0.2px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06); }
        article h3 { color:rgba(255,255,255,0.9); font-weight:700; font-size:1rem; margin:24px 0 8px; line-height:1.4; }
        article p  { color:rgba(255,255,255,0.65); font-size:0.92rem; line-height:1.75; margin-bottom:14px; }
        article ul { color:rgba(255,255,255,0.65); font-size:0.92rem; line-height:1.75; margin:14px 0 14px 20px; }
        article li { margin-bottom:8px; }
        article li strong { color:rgba(255,255,255,0.9); }
        article blockquote { background:rgba(37,211,102,0.06); border-left:3px solid #25D366; border-radius:0 10px 10px 0; padding:12px 16px; margin:20px 0; color:rgba(255,255,255,0.75); font-size:0.9rem; font-style:italic; line-height:1.65; }
        article strong { color:rgba(255,255,255,0.9); font-weight:700; }
      `}</style>
    </div>
  )
}
