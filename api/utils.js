/**
 * /api/utils.js
 * 
 * Router untuk semua endpoint kecil:
 * - generate-guide, optimize-seo, batch-generate (AI Content)
 * 
 * Limit: 2 serverless functions (utils.js + cron/jobs.js)
 */

import { createClient } from '@supabase/supabase-js'
import { generateText } from './lib/ai.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ════════════════════════════════════════════════════════════════════════════
// DIAH ANNA SYSTEM PROMPT
// ════════════════════════════════════════════════════════════════════════════

const DIAH_ANNA_SYSTEM = `You are Diah Anna, AI Career Coach at Verneks. Your role is to create 
high-quality, actionable career guides for professionals.

WRITING PRINCIPLES:
1. Conversational but expert (like talking to a smart friend)
2. Specific over generic (80% failure rate, not "many struggle")
3. Honest about reality (acknowledge difficulty, then provide solution)
4. Action-oriented (end sections with specific steps)
5. Local context (Indonesia-relevant examples, salary in Rp)

TONE:
- Direct and clear (avoid corporate speak)
- Practical advice with real examples
- Include data/research citations
- Show expertise through specifics, not credentials

OUTPUT FORMAT:
- Markdown
- 1200-1500 words
- Clear H2 headers for sections
- FAQ section (3-5 questions)
- CTA to chat at end

STRUCTURE:
1. Hook (50-100 words)
2. Intro (200-300 words)
3. Main content (600-800 words)
4. FAQ section (200-300 words)
5. CTA (50 words)

Include:
- 2-3 real examples
- At least 1-2 data points
- At least 1 framework/template
- No filler - every sentence adds value`

// ════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

function createGuidePrompt(outline) {
  return `Create a comprehensive career guide based on this outline:

TITLE: ${outline.title}
TOPIC: ${outline.slug}
KEYWORDS: ${outline.keywords.join(', ')}

GUIDE STRUCTURE:
${outline.structure.sections
  .map((s, i) => `${i + 1}. ${s.h2}\n   Subsections: ${s.subsections.join(', ')}`)
  .join('\n')}

Include FAQ section. Primary CTA: "${outline.structure.cta.primary}"

Now write the complete guide in Markdown format.`
}

function parseGeneratedContent(markdown) {
  const titleMatch = markdown.match(/^# (.+?)$/m)
  const title = titleMatch ? titleMatch[1] : 'Untitled'
  const sections = markdown.match(/^## .+$/gm) || []
  const faqMatch = markdown.match(/## (?:FAQ|Frequently Asked Questions)([\s\S]*?)(?=## |$)/i)
  const hasFAQ = !!faqMatch

  return {
    title: title.trim(),
    sectionCount: sections.length,
    hasFAQ,
    wordCount: markdown.split(/\s+/).length,
    content: markdown
  }
}

function createSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50)
}

// Charset tanpa karakter ambigu (0/O, 1/I) supaya kode gampang dibaca/diketik manual.
function generateRedeemCode() {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 12; i++) {
    code += charset[Math.floor(Math.random() * charset.length)]
  }
  return code
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'Missing action param' })

  // Hanya action generate-content yang jalan lewat cron/admin yang perlu
  // proteksi CRON_SECRET. job-match & save-fcm-token dipanggil langsung dari
  // browser user, jadi tidak punya (dan tidak seharusnya punya) CRON_SECRET.
  const CRON_PROTECTED_ACTIONS = ['generate-guide', 'optimize-seo', 'batch-generate']
  if (CRON_PROTECTED_ACTIONS.includes(action)) {
    const authHeader = req.headers['authorization']
    const isVercelCron = req.headers['x-vercel-cron'] === '1'
    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  // ── GENERATE SINGLE GUIDE ────────────────────────────────────────────────
  if (action === 'generate-guide') {
    if (req.method !== 'POST') return res.status(405).end()

    const { guideOutline, guideId } = req.body
    if (!guideOutline) {
      return res.status(400).json({ error: 'Missing guideOutline' })
    }

    try {
      console.log(`[ai-content] Generating guide: ${guideOutline.slug}`)

      const content = await generateText({
        system: DIAH_ANNA_SYSTEM,
        prompt: createGuidePrompt(guideOutline),
        maxTokens: 2000,
        tier: 'fast'
      })

      const parsed = parseGeneratedContent(content)

      const { data, error } = await supabase
        .from('career_library_drafts')
        .insert({
          guide_id: guideId || guideOutline.id,
          slug: guideOutline.slug,
          content: parsed.content,
          metadata: {
            wordCount: parsed.wordCount,
            sectionCount: parsed.sectionCount,
            hasFAQ: parsed.hasFAQ
          },
          status: 'generated',
          generated_at: new Date().toISOString()
        }, { onConflict: 'guide_id' })

      if (error) {
        console.error('[ai-content] Save error:', error)
        return res.status(500).json({ error: error.message })
      }

      return res.status(200).json({
        success: true,
        slug: guideOutline.slug,
        wordCount: parsed.wordCount,
        hasFAQ: parsed.hasFAQ
      })
    } catch (e) {
      console.error('[ai-content] Generate error:', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── OPTIMIZE FOR SEO ─────────────────────────────────────────────────────
  if (action === 'optimize-seo') {
    if (req.method !== 'POST') return res.status(405).end()

    const { content, targetKeyword, guideId, slug } = req.body
    if (!content || !targetKeyword) {
      return res.status(400).json({ error: 'Missing content or targetKeyword' })
    }

    try {
      console.log(`[ai-content] Optimizing SEO for: ${slug}`)

      const seoPrompt = `Optimize for SEO. Target keyword: "${targetKeyword}"
      
Output JSON:
{
  "title": "...",
  "metaDescription": "...",
  "slug": "${createSlug(slug)}"
}`

      const seoResponse = await generateText({
        system: 'Output ONLY valid JSON, no other text.',
        prompt: seoPrompt,
        maxTokens: 300,
        tier: 'fast'
      })

      const cleanedJSON = seoResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

      let seoData
      try {
        seoData = JSON.parse(cleanedJSON)
      } catch (e) {
        throw new Error('Invalid SEO JSON response')
      }

      const { error } = await supabase
        .from('career_library_drafts')
        .update({
          slug: seoData.slug || slug,
          seo: seoData,
          status: 'seo_optimized',
          optimized_at: new Date().toISOString()
        })
        .eq('guide_id', guideId)

      if (error) {
        return res.status(500).json({ error: error.message })
      }

      return res.status(200).json({
        success: true,
        slug: seoData.slug,
        title: seoData.title
      })
    } catch (e) {
      console.error('[ai-content] SEO error:', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── BATCH GENERATE ALL GUIDES ────────────────────────────────────────────
  if (action === 'batch-generate') {
    if (req.method !== 'POST') return res.status(405).end()

    const { guideOutlines } = req.body
    if (!guideOutlines || !Array.isArray(guideOutlines)) {
      return res.status(400).json({ error: 'Missing or invalid guideOutlines array' })
    }

    console.log(`[ai-content] Starting batch generation for ${guideOutlines.length} guides`)

    const results = []
    let successCount = 0
    let failureCount = 0

    for (const outline of guideOutlines) {
      try {
        const content = await generateText({
          system: DIAH_ANNA_SYSTEM,
          prompt: createGuidePrompt(outline),
          maxTokens: 2000,
          tier: 'fast'
        })

        const parsed = parseGeneratedContent(content)

        const seoResponse = await generateText({
          system: 'Output ONLY valid JSON.',
          prompt: `Quick SEO for "${outline.keywords[0]}". Slug: ${createSlug(outline.title)}. JSON: {"title":"...","metaDescription":"...","slug":"${createSlug(outline.title)}"}`,
          maxTokens: 300,
          tier: 'fast'
        })

        const seoData = JSON.parse(
          seoResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        )

        const { error } = await supabase
          .from('career_library_drafts')
          .upsert({
            guide_id: outline.id,
            slug: seoData.slug,
            content: parsed.content,
            seo: seoData,
            metadata: {
              wordCount: parsed.wordCount,
              sectionCount: parsed.sectionCount,
              hasFAQ: parsed.hasFAQ
            },
            status: 'generated_and_optimized',
            generated_at: new Date().toISOString()
          }, { onConflict: 'guide_id' })

        if (error) throw error

        results.push({
          id: outline.id,
          slug: seoData.slug,
          status: 'success',
          wordCount: parsed.wordCount
        })
        successCount++

        console.log(`✅ Generated: ${outline.slug} (${parsed.wordCount} words)`)
      } catch (e) {
        results.push({
          id: outline.id,
          slug: outline.slug,
          status: 'failed',
          error: e.message
        })
        failureCount++

        console.error(`❌ Failed: ${outline.slug}`)
      }

      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    console.log(`[ai-content] Batch complete: ${successCount} success, ${failureCount} failed`)

    return res.status(200).json({
      success: successCount > 0,
      total: guideOutlines.length,
      processed: results.length,
      successCount,
      failureCount,
      results
    })
  }

  // ── SAVE FCM TOKEN (push notification opt-in dari browser) ──────────────
  // Ditulis langsung di sini (bukan import dari lib/notifications.js) supaya
  // utils.js TIDAK ikut menyeret dependency berat firebase-admin/nodemailer
  // yang diinisialisasi di level modul file itu — cukup upsert Supabase biasa.
  if (action === 'save-fcm-token') {
    if (req.method !== 'POST') return res.status(405).end()

    // Frontend (src/lib/firebase.js) kirim field "token", bukan "fcmToken".
    const { userId, token, fcmToken } = req.body
    const finalToken = token || fcmToken
    if (!userId || !finalToken) {
      return res.status(400).json({ error: 'Missing userId or token' })
    }

    try {
      const { error } = await supabase.from('user_push_tokens').upsert({
        user_id: userId,
        fcm_token: finalToken,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ success: true })
    } catch (e) {
      console.error('[save-fcm-token] error:', e.message)
      return res.status(500).json({ error: 'Gagal menyimpan token notifikasi.' })
    }
  }

  // ── AI-POWERED JOB MATCHING (dipakai Opportunities.jsx) ──────────────────
  if (action === 'job-match') {
    if (req.method !== 'POST') return res.status(405).end()

    // PIVOT — LOCAL-FIRST: sebelumnya endpoint ini WAJIB baca
    // user_career_profiles.target_posisi + user_genome_scores dari Supabase,
    // yang cuma keisi kalau user pernah nyelesain /discovery. Karena
    // /discovery sekarang opsional (bukan gerbang wajib lagi) dan
    // extract-profile.js (yang dulu ngisi data ini dari chat biasa) sudah
    // dimatikan total, hampir semua user baru selalu kena "Profil belum
    // lengkap" — fitur ini jadi nyaris nggak pernah bisa dipakai.
    //
    // Sekarang: profil diambil dari `localMemory` yang dikirim client
    // (ringkasan + RSI patterns dari IndexedDB device — sama seperti yang
    // dipakai /api/career-coach), BUKAN dari Supabase. Server tidak query
    // tabel career/genome sama sekali di sini lagi.
    const { userId, localMemory } = req.body
    if (!userId) return res.status(400).json({ error: 'Missing userId' })

    const summary     = (localMemory?.summary || '').trim()
    const rsiPatterns = Array.isArray(localMemory?.rsiPatterns) ? localMemory.rsiPatterns : []

    // Belum cukup "kenal" user ini dari obrolan lokalnya — minta ngobrol
    // dulu ke Diah Anna, bukan lagi disuruh ke /discovery (yang bukan alur
    // utama lagi).
    if (!summary && rsiPatterns.length === 0) {
      return res.status(400).json({ error: 'Belum cukup ngobrol' })
    }

    try {
      const rsiBlock = rsiPatterns.length > 0
        ? rsiPatterns.map(p => `- ${p.type}: ${p.description} (yakin ${p.confidence || 0}%)`).join('\n')
        : '(belum ada pola spesifik yang tercatat)'

      // PIVOT: dulu job-matching karier, sekarang rekomendasi aktivitas
      // self-care — dibangun dari memori lokal (ringkasan + pola RSI),
      // bukan lagi dari data career_profile/genome di Supabase.
      const jobMatchPrompt = `Ringkasan tentang user (dari memori Diah Anna):
${summary || '(belum ada ringkasan, andalkan pola di bawah)'}

Pola yang sudah teramati:
${rsiBlock}

Berdasarkan info di atas, buat 5 rekomendasi aktivitas self-care yang PALING relevan buat kondisi user sekarang. Ini rekomendasi aktivitas nyata yang bisa dicoba sehari-hari (bukan produk berbayar atau jasa profesional spesifik), jadi field "company" HARUS berupa kategori aktivitasnya (contoh: "Rutinitas Malam", "Coping Lewat Aksi", "Ekspresi Kreatif", "Terhubung ke Orang Lain"), BUKAN nama bisnis/brand riil.

Output HANYA JSON array valid (tanpa markdown, tanpa teks lain), format:
[
  {
    "role": "nama aktivitas spesifik",
    "company": "kategori aktivitas",
    "salary": "estimasi durasi/frekuensi realistis, contoh: 10-15 menit/hari atau 1x seminggu",
    "match": angka_0_sampai_100,
    "reason": "1-2 kalimat kenapa ini cocok, kaitkan dengan yang diceritakan user"
  }
]
Urutkan dari match tertinggi. Aktivitas harus realistis dan bisa langsung dicoba, bukan saran generik seperti "kelola stres dengan baik".`

      const raw = await generateText({
        system: 'Kamu adalah Diah Anna, self-care activity matching engine Verneks. Output HANYA JSON array valid, tanpa backtick markdown, tanpa penjelasan tambahan.',
        prompt: jobMatchPrompt,
        maxTokens: 900,
        tier: 'fast',
        plan: 'premium',
      })

      const clean = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
      let jobs
      try {
        jobs = JSON.parse(clean)
      } catch (e) {
        console.error('[job-match] JSON parse failed:', raw.slice(0, 300))
        return res.status(500).json({ error: 'Gagal memproses rekomendasi, coba lagi sebentar.' })
      }

      if (!Array.isArray(jobs)) {
        return res.status(500).json({ error: 'Format rekomendasi tidak valid.' })
      }

      return res.status(200).json({ success: true, jobs })
    } catch (e) {
      console.error('[job-match] error:', e.message)
      return res.status(500).json({ error: 'Gagal memuat rekomendasi aktivitas.' })
    }
  }

  // ── REDEEM KODE PREMIUM ───────────────────────────────────────────────────
  // Dipindahkan dari api/redeem-code.js (file terpisah, standalone) supaya
  // konsisten dengan arsitektur "2 serverless functions". Logic TIDAK diubah
  // sama sekali dari versi aslinya.
  // ── GRANT TRIAL — 30 hari Premium gratis otomatis untuk user baru ────────
  // Dipanggil sekali dari App.jsx tiap kali ada event SIGNED_IN. Aman dipanggil
  // berkali-kali: begitu user PERNAH punya row di `subscriptions` (baik dari
  // trial ini, redeem code, atau bayar Lynk), request berikutnya jadi no-op —
  // jadi trial cuma bisa didapat SEKALI per akun, nggak bisa di-reset dengan
  // logout/login ulang.
  if (action === 'grant-trial') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: 'Missing userId' })

    try {
      const { data: existing, error: checkErr } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (checkErr) {
        console.error('[grant-trial] checkErr:', checkErr.message)
        return res.status(200).json({ granted: false, reason: checkErr.message })
      }
      if (existing) {
        return res.status(200).json({ granted: false, reason: 'already_has_subscription' })
      }

      const now    = new Date()
      const expiry = new Date(now)
      expiry.setDate(expiry.getDate() + 30)

      // insert (bukan upsert) sengaja — kalau ada race condition (dua request
      // barengan), yang kedua akan gagal karena primary key user_id sudah ada,
      // itu OK, dianggap trial sudah granted oleh request pertama.
      const { error: insertErr } = await supabase
        .from('subscriptions')
        .insert({
          user_id:    userId,
          plan:       'premium',
          status:     'active',
          created_at: now.toISOString(),
          expires_at: expiry.toISOString(),
        })

      if (insertErr) {
        console.warn('[grant-trial] insertErr (mungkin race condition, aman diabaikan):', insertErr.message)
        return res.status(200).json({ granted: false, reason: insertErr.message })
      }

      return res.status(200).json({ granted: true, expires_at: expiry.toISOString() })
    } catch (e) {
      console.error('[grant-trial] exception:', e.message)
      return res.status(500).json({ error: 'Gagal mengaktifkan trial' })
    }
  }

  if (action === 'redeem') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { code, userId } = req.body
    if (!code || !userId) return res.status(400).json({ error: 'Missing code or userId' })

    const cleanCode = code.trim().toUpperCase()

    // 1. Cek kode ada & belum dipakai
    const { data: row, error: fetchErr } = await supabase
      .from('redeem_codes')
      .select('code, used_by')
      .eq('code', cleanCode)
      .maybeSingle()

    if (fetchErr) {
      console.error('[redeem] fetchErr:', fetchErr)
      return res.status(500).json({ error: 'Gagal mengecek kode', detail: fetchErr.message })
    }
    if (!row) return res.status(404).json({ error: 'Kode tidak ditemukan' })
    if (row.used_by) return res.status(409).json({ error: 'Kode sudah pernah digunakan' })

    // 2. Insert subscription dulu SEBELUM mark used (supaya bisa rollback)
    const now    = new Date()
    const expiry = new Date(now)
    expiry.setDate(expiry.getDate() + 30)

    const { error: subErr } = await supabase
      .from('subscriptions')
      .upsert({
        user_id:    userId,
        plan:       'premium',
        status:     'active',
        created_at: now.toISOString(),
        expires_at: expiry.toISOString(),
      }, { onConflict: 'user_id' })

    if (subErr) {
      console.error('[redeem] subErr:', JSON.stringify(subErr))
      return res.status(500).json({ error: 'Gagal mengaktifkan premium', detail: subErr.message })
    }

    // 3. Baru mark kode sebagai used (setelah premium berhasil)
    const { error: updateErr } = await supabase
      .from('redeem_codes')
      .update({ used_by: userId, used_at: now.toISOString() })
      .eq('code', cleanCode)

    if (updateErr) {
      console.error('[redeem] updateErr:', updateErr)
      // Premium sudah aktif, tapi kode belum ke-mark — log saja, jangan fail.
      // Bisa di-handle manual via dashboard Supabase.
    }

    return res.status(200).json({ success: true, expires_at: expiry.toISOString() })
  }

  // ── WEEKLY REVIEW (dibaca Dashboard.jsx) ─────────────────────────────────
  // Data-nya sendiri di-generate oleh cron job (api/cron/jobs.js?job=weekly-review)
  // ke tabel user_weekly_reviews — action ini cuma membaca hasil terbarunya.
  if (action === 'weekly-review') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: 'Missing userId' })

    try {
      const { data, error } = await supabase
        .from('user_weekly_reviews')
        .select('week_start, review_text')
        .eq('user_id', userId)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) return res.status(500).json({ error: error.message })
      if (!data) return res.status(200).json({ success: false, review: null })

      return res.status(200).json({ success: true, review: data })
    } catch (e) {
      console.error('[weekly-review] error:', e.message)
      return res.status(500).json({ error: 'Gagal memuat weekly review.' })
    }
  }

  // ── REFRESH PROFILE (backfill user lama tanpa 'summary') ─────────────────
  // Dipakai Dashboard.jsx untuk regenerate summary/mentor_message/motivasi
  // buat user lama yang profilnya dibuat sebelum field ini ada. Konteksnya
  // diambil dari data yang SUDAH tersimpan (profil + memory capsule terakhir)
  // — bukan raw chat history — supaya tetap ringan dan konsisten dengan pola
  // memory context yang dipakai coach-hub.js.
  if (action === 'refresh-profile') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: 'Missing userId' })

    try {
      const [{ data: profile }, { data: capsules }] = await Promise.all([
        supabase.from('user_career_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('memory_capsule_log').select('capsule_text').eq('user_id', userId)
          .neq('capsule_text', '[no new insight]')
          .order('capsule_date', { ascending: false }).limit(10),
      ])

      if (!profile?.target_posisi) {
        return res.status(400).json({ error: 'Profil belum cukup lengkap untuk di-refresh' })
      }

      const capsuleContext = (capsules || []).map(c => `- ${c.capsule_text}`).join('\n') || '(belum ada catatan sesi)'

      const prompt = `Data profil user:
- Nama: ${profile.nama || '-'}
- Target posisi: ${profile.target_posisi}
- Posisi saat ini: ${profile.posisi_saat_ini || '-'}
- Industri: ${profile.industri || '-'}
- Hambatan: ${profile.hambatan || '-'}
- Motivasi (kalau sudah ada): ${profile.motivasi || 'belum diketahui'}

Catatan sesi coaching terakhir:
${capsuleContext}

Output HANYA JSON valid (tanpa markdown, tanpa teks lain):
{
  "summary": "2-3 paragraf narasi briefing untuk career coach: siapa user ini, di mana posisinya sekarang, apa yang dia mau, tantangan utama. Bahasa Indonesia natural. Gunakan \\n literal untuk ganti paragraf, JANGAN newline asli.",
  "mentor_message": "pesan personal dari Diah Anna, 3-4 kalimat, hangat, akui kekuatan & hambatan user",
  "motivasi": "1 kalimat motivasi terdalam user berdasarkan konteks di atas${profile.motivasi ? ' (boleh sama dengan yang sudah ada kalau masih relevan)' : ''}"
}`

      const raw = await generateText({
        system: 'Kamu adalah Diah Anna, AI career coach Verneks. Output HANYA JSON valid.',
        prompt,
        maxTokens: 700,
        tier: 'fast',
      })

      const clean = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
      let parsed
      try {
        parsed = JSON.parse(clean)
      } catch (e) {
        console.error('[refresh-profile] JSON parse failed:', raw.slice(0, 300))
        return res.status(500).json({ error: 'Gagal memproses hasil refresh.' })
      }

      const updated = {
        summary:        parsed.summary        || profile.summary,
        mentor_message: parsed.mentor_message  || profile.mentor_message,
        motivasi:       profile.motivasi       || parsed.motivasi, // jangan timpa motivasi yang sudah ada dari user
      }

      const { error: updateErr } = await supabase
        .from('user_career_profiles')
        .update({ ...updated, last_updated: new Date().toISOString() })
        .eq('user_id', userId)

      if (updateErr) return res.status(500).json({ error: updateErr.message })

      return res.status(200).json({ success: true, updated })
    } catch (e) {
      console.error('[refresh-profile] error:', e.message)
      return res.status(500).json({ error: 'Gagal refresh profil.' })
    }
  }

  // ── ADMIN (dipakai AdminPanel.jsx di /adm-lc) ────────────────────────────
  // Password diverifikasi di server setiap request (bukan disimpan di client
  // selain sebagai state sementara untuk dikirim ulang) — sesuai catatan
  // keamanan yang sudah ada di komentar AdminPanel.jsx.
  if (action === 'admin') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { password, action: subAction, count } = req.body
    if (!password) return res.status(400).json({ error: 'Password wajib diisi.' })
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Password salah.' })
    }

    if (subAction === 'list') {
      const { data, error } = await supabase
        .from('redeem_codes')
        .select('code, used_by, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ codes: data || [] })
    }

    if (subAction === 'generate') {
      const n = Math.min(Math.max(Number(count) || 1, 1), 20) // cap wajar per generate
      const now = new Date().toISOString()
      const newRows = Array.from({ length: n }, () => ({ code: generateRedeemCode(), created_at: now }))

      const { error: insErr } = await supabase.from('redeem_codes').insert(newRows)
      if (insErr) return res.status(500).json({ error: insErr.message })

      const { data, error } = await supabase
        .from('redeem_codes')
        .select('code, used_by, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ codes: data || [] })
    }

    return res.status(400).json({ error: `Unknown admin sub-action: ${subAction}` })
  }

  return res.status(400).json({ error: `Unknown action: ${action}` })
}
