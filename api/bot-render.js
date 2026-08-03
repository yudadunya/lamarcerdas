// api/bot-render.js
// Dynamic rendering khusus BOT — dipanggil lewat rewrite di vercel.json yang
// cuma aktif kalau User-Agent cocok pola crawler (lihat vercel.json).
//
// KENAPA INI PERLU: Blog.jsx/BlogPost.jsx inject semua title, meta
// description, Article/FAQ/Breadcrumb schema lewat useEffect() di React —
// artinya itu semua baru "ada" SETELAH JavaScript jalan. Googlebot memang
// render JS (walau lebih lambat), tapi AI crawler (GPTBot, ClaudeBot,
// PerplexityBot, dst) UMUMNYA TIDAK menjalankan JavaScript sama sekali —
// mereka cuma baca HTML mentah. Tanpa endpoint ini, HTML mentah yang mereka
// lihat itu kosong (`<div id="root"></div>`) dengan title generik halaman
// utama untuk SEMUA artikel — FAQ schema yang dibikin khusus biar "disukai
// AI search" jadi sia-sia karena nggak pernah kebaca sama sekali.
//
// Endpoint ini generate HTML LENGKAP (metadata + schema + isi artikel
// sebagai teks biasa yang bisa dibaca/dikutip) langsung di server, tanpa
// nunggu JS apapun — jadi baik Google MAUPUN AI crawler dapat versi yang
// sama-sama lengkap.

import { createClient } from '@supabase/supabase-js'
import { BLOG_POSTS as STATIC_POSTS } from '../src/data/blogPosts.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SITE = 'https://verneks.my.id'

// Markdown-to-HTML super ringan — sengaja custom, bukan library, karena
// format yang dipakai artikel (baik statis maupun hasil generate-daily-
// article) sudah dibatasi ke subset sederhana: ## / ### / - / > / **bold**.
// Menghindari nambah dependency baru cuma buat ini.
function markdownToHtml(md) {
  if (!md) return ''
  const lines = md.trim().split('\n')
  const html = []
  let inList = false

  const inline = (text) => text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      if (inList) { html.push('</ul>'); inList = false }
      continue
    }
    if (line.startsWith('### ')) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<h3>${inline(line.slice(4))}</h3>`)
    } else if (line.startsWith('## ')) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<h2>${inline(line.slice(3))}</h2>`)
    } else if (line.startsWith('> ')) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<blockquote>${inline(line.slice(2))}</blockquote>`)
    } else if (line.startsWith('- ')) {
      if (!inList) { html.push('<ul>'); inList = true }
      html.push(`<li>${inline(line.slice(2))}</li>`)
    } else {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<p>${inline(line)}</p>`)
    }
  }
  if (inList) html.push('</ul>')
  return html.join('\n')
}

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function findArticle(slug) {
  const staticPost = STATIC_POSTS.find(p => p.slug === slug)
  if (staticPost) return staticPost

  const { data, error } = await supabase
    .from('blog_articles')
    .select('slug, title, excerpt, category, emoji, keywords, faq, content, read_time, published_at')
    .eq('slug', slug)
    .maybeSingle()

  if (error) { console.error('[bot-render] fetch gagal:', error.message); return null }
  if (!data) return null

  return {
    slug: data.slug, title: data.title, excerpt: data.excerpt, category: data.category,
    emoji: data.emoji, date: data.published_at, readTime: data.read_time,
    keywords: data.keywords || [], faq: data.faq || [], content: data.content,
  }
}

export default async function handler(req, res) {
  const slug = req.query.slug

  if (!slug) {
    res.status(400).send('Missing slug')
    return
  }

  const post = await findArticle(slug)

  if (!post) {
    res.status(404).send('Article not found')
    return
  }

  const url = `${SITE}/blog/${post.slug}`
  const dateIso = post.date ? new Date(post.date).toISOString() : new Date().toISOString()

  const articleSchema = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: post.title, description: post.excerpt,
    datePublished: dateIso, dateModified: dateIso,
    author: { '@type': 'Organization', name: 'Verneks', url: SITE },
    publisher: { '@type': 'Organization', name: 'Verneks', url: SITE },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    keywords: (post.keywords || []).join(', '),
    inLanguage: 'id-ID', isAccessibleForFree: true,
  }

  const faqSchema = post.faq?.length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: post.faq.map(item => ({
      '@type': 'Question', name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  } : null

  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: url },
    ],
  }

  const faqHtml = post.faq?.length ? `
    <section>
      <h2>Pertanyaan yang Sering Diajukan</h2>
      ${post.faq.map(item => `
      <div>
        <h3>${esc(item.q)}</h3>
        <p>${esc(item.a)}</p>
      </div>`).join('')}
    </section>` : ''

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(post.title)} | Verneks Blog</title>
  <meta name="description" content="${esc(post.excerpt)}" />
  <meta name="keywords" content="${esc((post.keywords || []).join(', '))}" />
  <meta name="author" content="Verneks" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <meta property="og:title" content="${esc(post.title)}" />
  <meta property="og:description" content="${esc(post.excerpt)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="Verneks" />
  <script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
  ${faqSchema ? `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>` : ''}
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
</head>
<body>
  <nav aria-label="breadcrumb">
    <a href="${SITE}/">Home</a> &gt; <a href="${SITE}/blog">Blog</a> &gt; ${esc(post.title)}
  </nav>
  <article>
    <h1>${esc(post.title)}</h1>
    <p><em>${esc(post.category || '')} · ${esc(post.readTime || '')}</em></p>
    <p>${esc(post.excerpt)}</p>
    ${markdownToHtml(post.content)}
    ${faqHtml}
  </article>
  <p><a href="${SITE}/blog">← Kembali ke Blog Verneks</a> · <a href="${SITE}/chat">Ngobrol dengan Diah Anna</a></p>
</body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
  res.status(200).send(html)
}
