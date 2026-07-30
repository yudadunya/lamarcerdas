// api/sitemap.js
// Sitemap DINAMIS — generate on-the-fly, bukan file statis.
//
// KENAPA INI PERLU: public/sitemap.xml yang lama itu file statis, di-build
// sekali waktu deploy. Artikel dari cron generate-daily-article (tabel
// blog_articles) muncul TIAP HARI, tapi sitemap statis nggak pernah tahu
// artikel baru itu ada — jadi Google/AI crawler cuma nemuin artikel baru
// lewat link internal di halaman /blog (lambat & tidak reliable), bukan
// lewat sitemap (cara tercepat & paling diandalkan search engine buat
// nemuin konten baru). Endpoint ini generate XML lengkap tiap kali
// dipanggil — selalu up-to-date, termasuk artikel yang baru terbit hari ini.

import { createClient } from '@supabase/supabase-js'
import { BLOG_POSTS as STATIC_POSTS } from '../src/data/blogPosts.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SITE = 'https://verneks.my.id'

const LIBRARY_SLUGS = [
  'career-pivot-framework', 'skill-gap-analysis', 'salary-benchmarks-indonesia',
  'job-search-strategies', 'linkedin-optimization', 'career-assessment',
  'finding-target-role', 'networking-career-change', 'cover-letter-resume',
  'interview-preparation', 'negotiation-tactics', 'freelance-vs-corporate',
  'career-goals', 'mentorship-guide', 'using-ai-career-planning',
  'ai-skills-needed', 'future-proof-career', 'career-trends-2024',
  'remote-work-career', 'career-pivot-stories',
]

function urlEntry(loc, { priority = '0.7', changefreq = 'weekly', lastmod = null } = {}) {
  return `  <url>
    <loc>${loc}</loc>
    <priority>${priority}</priority>
    <changefreq>${changefreq}</changefreq>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
  </url>`
}

export default async function handler(req, res) {
  const entries = []

  // Halaman utama
  entries.push(urlEntry(`${SITE}/`, { priority: '1.0', changefreq: 'weekly' }))
  entries.push(urlEntry(`${SITE}/chat`, { priority: '0.9', changefreq: 'weekly' }))
  entries.push(urlEntry(`${SITE}/blog`, { priority: '0.85', changefreq: 'daily' })) // daily karena artikel baru tiap hari

  // Career Library (20 guides statis)
  for (const slug of LIBRARY_SLUGS) {
    entries.push(urlEntry(`${SITE}/library/${slug}`, { priority: '0.8', changefreq: 'monthly' }))
  }

  // Blog posts statis (6 artikel lama)
  for (const post of STATIC_POSTS) {
    entries.push(urlEntry(`${SITE}/blog/${post.slug}`, {
      priority: '0.75', changefreq: 'monthly',
      lastmod: post.date ? new Date(post.date).toISOString().slice(0, 10) : null,
    }))
  }

  // Blog posts dari generate-daily-article — ini bagian yang tadinya hilang
  // total dari sitemap manapun.
  try {
    const { data: dbArticles, error } = await supabase
      .from('blog_articles')
      .select('slug, published_at')
      .order('published_at', { ascending: false })
      .limit(1000)

    if (error) {
      console.error('[sitemap] gagal fetch blog_articles:', error.message)
    } else {
      for (const a of dbArticles || []) {
        entries.push(urlEntry(`${SITE}/blog/${a.slug}`, {
          priority: '0.75', changefreq: 'monthly',
          lastmod: a.published_at ? new Date(a.published_at).toISOString().slice(0, 10) : null,
        }))
      }
    }
  } catch (e) {
    console.error('[sitemap]', e)
    // Gagal fetch DB tidak boleh bikin seluruh sitemap gagal total — tetap
    // kirim yang statis, lebih baik sitemap parsial daripada 500 error.
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`

  res.setHeader('Content-Type', 'application/xml')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate') // cache 1 jam di edge — cukup fresh tanpa query DB tiap request
  return res.status(200).send(xml)
}
