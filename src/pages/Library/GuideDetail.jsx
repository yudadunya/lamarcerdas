/**
 * src/pages/Library/GuideDetail.jsx
 * 
 * Single Career Guide Page
 * Shows full content, meta tags, schema, related guides, CTA
 */

import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import ReactMarkdown from 'react-markdown'
import '../../styles/Library.css'

const Logo = () => (
  <img src="/verneks_icon_1.png" alt="Verneks" width="28" height="28" style={{ objectFit: 'contain', flexShrink: 0 }} />
)

export default function GuideDetail({ user }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [guide, setGuide] = useState(null)
  const [relatedGuides, setRelatedGuides] = useState([])
  const [loading, setLoading] = useState(true)
  const [toc, setToc] = useState([]) // Table of contents

  // Fetch guide & related guides
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch main guide
        const { data: guideData, error: guideError } = await supabase
          .from('career_library')
          .select('*')
          .eq('slug', slug)
          .maybeSingle()

        if (guideError || !guideData) {
          console.error('Guide not found:', guideError)
          navigate('/library')
          return
        }

        setGuide(guideData)

        // Set page title & meta
        document.title = `${guideData.title} - Verneks Career Library`
        const metaDesc = document.querySelector('meta[name="description"]')
        if (metaDesc) {
          metaDesc.content = guideData.meta_description
        }

        // Add JSON-LD schema
        const schema = {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: guideData.title,
          description: guideData.meta_description,
          author: {
            '@type': 'Person',
            name: 'Diah Anna',
            description: 'AI Career Coach at Verneks'
          },
          datePublished: guideData.published_at,
          dateModified: guideData.published_at,
          inLanguage: 'id-ID'
        }

        let oldScript = document.querySelector('script[data-guide-schema]')
        if (oldScript) oldScript.remove()

        const script = document.createElement('script')
        script.type = 'application/ld+json'
        script.setAttribute('data-guide-schema', 'true')
        script.innerHTML = JSON.stringify(schema)
        document.head.appendChild(script)

        // Extract table of contents from markdown
        if (guideData.content) {
          const headings = guideData.content.match(/^## .+$/gm) || []
          const tocItems = headings.map(h => ({
            text: h.replace(/^## /, '').trim(),
            id: h.replace(/^## /, '').trim().toLowerCase().replace(/\s+/g, '-')
          }))
          setToc(tocItems)
        }

        // Fetch related guides (3 random guides except current)
        const { data: relatedData } = await supabase
          .from('career_library')
          .select('id, slug, title, meta_description')
          .neq('slug', slug)
          .limit(3)

        setRelatedGuides(relatedData || [])
      } catch (err) {
        console.error('Error fetching guide:', err)
        navigate('/library')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [slug, navigate])

  if (loading) {
    return <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #075E54 0%, #0a1628 55%, #0d1f1a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-body)' }}>Loading guide...</div>
  }

  if (!guide) {
    return <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #075E54 0%, #0a1628 55%, #0d1f1a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-body)' }}>Guide not found</div>
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #075E54 0%, #0a1628 55%, #0d1f1a 100%)',
      fontFamily: 'var(--font-body)',
    }}>
      {/* ── NAVBAR (konsisten sama Blog.jsx & Library list — sebelumnya
           halaman ini sama sekali nggak punya navbar) ── */}
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

      <div className="guide-detail-container">
      {/* Back button */}
      <Link to="/library" className="guide-back">
        ← Kembali ke Library
      </Link>

      {/* Header */}
      <div className="guide-header">
        <h1>{guide.title}</h1>
        <p className="guide-meta">{guide.meta_description}</p>
        {guide.published_at && (
          <p className="guide-date">
            Dipublikasi: {new Date(guide.published_at).toLocaleDateString('id-ID')}
          </p>
        )}
      </div>

      <div className="guide-layout">
        {/* Main content */}
        <div className="guide-content-main">
          {toc.length > 0 && (
            <div className="guide-toc">
              <h4>Daftar Isi</h4>
              <ul>
                {toc.map((item, idx) => (
                  <li key={idx}>
                    <a href={`#${item.id}`}>{item.text}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Markdown content */}
          <div className="guide-markdown">
            <ReactMarkdown
              components={{
                h1: ({ node, ...props }) => <h1 {...props} />,
                h2: ({ node, children, ...props }) => {
                  const id = children
                    .toString()
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                  return <h2 id={id} {...props}>{children}</h2>
                },
                h3: ({ node, ...props }) => <h3 {...props} />,
                p: ({ node, ...props }) => <p {...props} />,
                ul: ({ node, ...props }) => <ul {...props} />,
                ol: ({ node, ...props }) => <ol {...props} />,
                li: ({ node, ...props }) => <li {...props} />,
                strong: ({ node, ...props }) => <strong {...props} />,
                em: ({ node, ...props }) => <em {...props} />,
                blockquote: ({ node, ...props }) => <blockquote {...props} />,
                code: ({ node, inline, ...props }) => 
                  inline ? <code {...props} /> : <pre><code {...props} /></pre>,
                a: ({ node, href, ...props }) => <a href={href} target="_blank" rel="noopener noreferrer" {...props} />,
              }}
            >
              {guide.content}
            </ReactMarkdown>
          </div>

          {/* CTA */}
          <div className="guide-cta">
            <h3>Butuh bimbingan lebih detail?</h3>
            <p>Chat dengan Diah Anna untuk diskusi personal tentang karier kamu</p>
            <Link to="/chat" className="cta-button">
              Chat dengan Diah Anna 🎯
            </Link>
          </div>
        </div>

        {/* Sidebar - Related guides */}
        {relatedGuides.length > 0 && (
          <aside className="guide-sidebar">
            <div className="related-guides-widget">
              <h4>Bacaan Terkait</h4>
              <div className="related-list">
                {relatedGuides.map((related) => (
                  <Link
                    key={related.id}
                    to={`/library/${related.slug}`}
                    className="related-item"
                  >
                    <h5>{related.title}</h5>
                    <p>{related.meta_description}</p>
                  </Link>
                ))}
              </div>
            </div>

            {/* Quick CTA */}
            <div className="sidebar-cta">
              <h5>Pengen hasil lebih cepat?</h5>
              <Link to="/chat" className="sidebar-button">
                Chat dengan Diah Anna
              </Link>
            </div>
          </aside>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="guide-bottom-nav">
        <Link to="/library" className="nav-link">
          ← Lihat semua guides
        </Link>
        <Link to="/chat" className="nav-link primary">
          Chat Sekarang 🎯
        </Link>
      </div>
      </div>
    </div>
  )
}
