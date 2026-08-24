/**
 * _lib/ai.js — AI wrapper untuk Verneks, sekarang lewat OpenRouter (Agustus 2026)
 * =============================================================================
 * MIGRASI: sebelumnya file ini manggil 4 provider terpisah langsung (Cerebras,
 * DeepSeek, Gemini, Claude), masing-masing butuh API key sendiri dan kode
 * integrasi sendiri. Karena tier gratis provider-provider itu sudah tidak
 * bisa diandalkan lagi, semua panggilan sekarang lewat SATU endpoint:
 * OpenRouter (https://openrouter.ai) — API-nya OpenAI-compatible dan bisa
 * akses ratusan model dari puluhan provider pakai satu API key.
 *
 * ENV VAR YANG DIBUTUHKAN SEKARANG: HANYA SATU
 *   OPENROUTER_API_KEY   → https://openrouter.ai/keys
 * (ANTHROPIC_API_KEY, CEREBRAS_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY
 *  sudah TIDAK dipakai lagi oleh file ini — boleh dihapus dari Vercel env
 *  vars kalau tidak dipakai file lain.)
 *
 * FALLBACK (update 24 Agu 2026): sempat pakai fitur bawaan OpenRouter
 * `models: [primary, fallback1, ...]` dalam satu request — TAPI ternyata
 * fallback itu tidak konsisten jalan untuk semua jenis error (kredit habis,
 * model didelist, dst — kadang jalan kadang enggak, jenis error yang beda
 * ditangani beda-beda di sisi mereka dan tidak terdokumentasi jelas).
 * Sekarang tiap model di rantai fallback dicoba lewat REQUEST TERPISAH,
 * satu per satu, di kode ini sendiri (lihat loop `chain` di callOpenRouter/
 * callOpenRouterStructured) — lebih verbose tapi predictable: apa pun jenis
 * kegagalannya, selalu lanjut ke model berikutnya sampai ada yang berhasil
 * atau rantai habis.
 *
 * GANTI MODEL: semua slug di bawah bisa di-override lewat env var tanpa ubah
 * kode (lihat MODELS). Kalau ada model yang 404/deprecated/kredit habis, cek
 * slug terbaru di https://openrouter.ai/models dan update env var terkait di
 * Vercel — tapi sistemnya sudah otomatis fallback ke FREE_ROUTER
 * (openrouter/free, auto-pilih model gratis yang lagi hidup) kalau semua
 * model di rantai gagal, jadi tidak langsung down total sambil nunggu itu.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Header opsional (attribution) — tidak wajib tapi disarankan OpenRouter
// supaya app muncul di leaderboard mereka. Tidak berpengaruh ke fungsi.
function openRouterHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'HTTP-Referer': process.env.APP_URL || 'https://verneks.my.id',
    'X-Title': 'Verneks',
  }
}

// ── Model per plan × tier — semua overridable lewat env var ─────────────────
// UPDATE (23 Agu 2026, malam): `openrouter/free` sempat dipasang jadi PRIMARY
// tapi DITURUNKAN jadi fallback-only setelah kejadian nyata: router itu acak
// milih model gratis apa saja yang lagi tersedia, dan salah satu yang kepilih
// ternyata nge-dump proses "mikir" (reasoning) mentah-mentah ke jawaban akhir
// yang dilihat user. Primary dipindah ke openai/gpt-oss-20b:free (satu model
// tetap, bukan random).
//
// UPDATE (24 Agu 2026): openai/gpt-oss-20b:free TERNYATA MASIH bisa bocor
// reasoning mentah + ngasih jawaban ngaco/nggak koheren sesekali — walau
// `reasoning: { exclude: true }` sudah dipasang (rupanya tidak semua upstream
// provider di balik slug ":free" konsisten menghormati parameter ini). Dua
// perbaikan sekaligus:
//   1. PREMIUM tidak lagi disamakan dengan FREE. User premium bayar buat
//      kualitas & keandalan — sekarang pakai model berbayar asli (Claude
//      Haiku/Sonnet lewat OpenRouter), bukan model gratis 20B yang sama.
//   2. Ditambah SAFETY NET di callOpenRouter/callOpenRouterStructured: kalau
//      output dari model manapun (termasuk fallback) kedeteksi kayak bocoran
//      reasoning mentah (lihat looksLikeLeakedReasoning di bawah), request
//      otomatis DIULANG paksa lewat fallback berikutnya — bukan langsung
//      ditampilkan ke user apa adanya.
const FREE_NAMED  = process.env.OPENROUTER_MODEL_FREE_NAMED  || 'openai/gpt-oss-20b:free'
const FREE_ROUTER = process.env.OPENROUTER_MODEL_FREE_ROUTER || 'openrouter/free'

const PREMIUM_FAST  = process.env.OPENROUTER_MODEL_PREMIUM_FAST  || 'anthropic/claude-haiku-4.5'
const PREMIUM_SMART = process.env.OPENROUTER_MODEL_PREMIUM_SMART || 'anthropic/claude-sonnet-5'

const MODELS = {
  free: {
    fast:  { model: FREE_NAMED, fallbacks: [FREE_ROUTER] },
    smart: { model: FREE_NAMED, fallbacks: [FREE_ROUTER] },
  },
  premium: {
    // Fallback ke model FREE_NAMED juga (bukan cuma sesama paid) — kalau
    // provider paid lagi down total, user premium tetap dapat balasan
    // (kualitas lebih rendah sementara) daripada error total.
    fast:  { model: PREMIUM_FAST,  fallbacks: [PREMIUM_SMART, FREE_NAMED] },
    smart: { model: PREMIUM_SMART, fallbacks: [PREMIUM_FAST, FREE_NAMED] },
  },
}

function pickModelConfig(plan, tier) {
  const planKey = plan === 'premium' ? 'premium' : 'free'
  const tierKey = tier === 'smart' ? 'smart' : 'fast'
  return MODELS[planKey][tierKey]
}

// ── Deteksi bocoran reasoning mentah / jawaban yang jelas-jelas ngaco ───────
// Heuristik pola khas chain-of-thought / echo instruksi yang "lolos" ke
// output akhir — kalimat pembuka analitis dalam Bahasa Inggris, narasi "user
// bilang X, jadi aku harus...", atau (ditemukan kasus baru 24 Agu 2026) model
// lemah yang justru NGE-ECHO BALIK isi system prompt-nya sendiri ("Rules to
// follow:", "Length: Max", dst) alih-alih benar-benar menjalankan tugasnya.
// Ini bukan filter sempurna, tapi cukup buat nangkep kasus paling jelas
// (persis kayak contoh-contoh nyata yang pernah kejadian).
const REASONING_LEAK_PATTERNS = [
  /^(okay|ok,|alright|let me think|let's think|first,? i need|i need to (think|consider|respond))/i,
  /according to the (persona|rules|system|guidelines)/i,
  /\b(he|she|the user) (said|asked|wants|is asking)\b[\s\S]{0,80}\b(let me|i should|i need|maybe he|maybe she)\b/i,
  /\bmy previous (message|response)\b/i,
  /^(possible responses?|draft:|alternative:)/i,
  // Echo instruksi (kasus baru): model narasiin ulang tugasnya alih-alih
  // mengerjakannya.
  /^the user wants\b/i,
  /rules?\s+to\s+follow\s*:/i,
  /\bnot applicable\b/i,
  /^(length|format|tone|style)\s*:/im,
  /\b(new user|new session)\b.{0,40}\b(greeting|opening|sapaan)\b/i,
]

function looksLikeLeakedReasoning(text) {
  if (!text) return false
  const sample = text.slice(0, 500)
  if (REASONING_LEAK_PATTERNS.some(p => p.test(sample))) return true

  // Heuristik struktural tambahan: obrolan/sapaan natural nggak akan punya
  // banyak baris gaya "Label: penjelasan" — itu ciri khas instruksi/aturan
  // yang di-echo balik mentah-mentah, bukan kalimat chat biasa. 2+ baris
  // kayak gitu dalam satu balasan udah cukup mencurigakan.
  const labelLines = (sample.match(/^[A-Z][A-Za-z ]{2,40}:\s/gm) || []).length
  if (labelLines >= 2) return true

  return false
}

// ── Normalize messages ───────────────────────────────────────────────────────
function normalizeMessages(messages) {
  return messages
    .map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: (m.content || m.text || '').trim(),
    }))
    .filter(m => m.content.length > 0)
}

// ── Panggilan chat biasa (teks bebas) ────────────────────────────────────────
async function callOpenRouter({ system, messages, maxTokens, model, fallbacks = [] }) {
  const normalized = normalizeMessages(messages)

  async function callWithModel(modelToUse) {
    const body = {
      model: modelToUse,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...normalized],
      // Penting: kalau model yang kepilih punya mode reasoning, JANGAN
      // pernah ikut tampil di jawaban akhir — ini yang bikin bocoran
      // "proses mikir" mentah nyampe ke chat user.
      reasoning: { exclude: true },
    }
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: openRouterHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text()
      const err = new Error(`[OpenRouter] ${res.status}: ${errText.slice(0, 300)}`)
      err.status = res.status
      throw err
    }
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error(`[OpenRouter] Respons kosong (model: ${data.model || modelToUse})`)
    return text
  }

  // Coba tiap model di rantai SATU PER SATU (request terpisah per model),
  // bukan lewat parameter `models` bawaan OpenRouter — soalnya itu terbukti
  // tidak konsisten fallback-nya untuk error tertentu (402 kredit habis,
  // 404 model didelist, dst — kadang jalan, kadang enggak). Loop manual di
  // sini menjamin SETIAP jenis kegagalan (bukan cuma satu jenis error
  // tertentu) selalu lanjut ke model berikutnya di rantai.
  //
  // FREE_ROUTER (openrouter/free) SELALU ditambahkan di paling akhir sebagai
  // jaring pengaman terakhir kalau belum ada di rantai — dia auto-pilih
  // model gratis apa pun yang LAGI TERSEDIA saat itu (roster model gratis
  // OpenRouter sering rotasi/didelist tanpa pemberitahuan, jadi nge-hardcode
  // satu nama model gratis spesifik sebagai satu-satunya andalan itu rapuh).
  const chain = [model, ...fallbacks]
  if (!chain.includes(FREE_ROUTER)) chain.push(FREE_ROUTER)

  let lastErr
  for (let i = 0; i < chain.length; i++) {
    const modelToUse = chain[i]
    const isLastInChain = i === chain.length - 1
    let text
    try {
      text = await callWithModel(modelToUse)
    } catch (e) {
      lastErr = e
      console.warn(`[ai] Model ${modelToUse} gagal (${e.status || 'error'}: ${e.message.slice(0, 120)}), coba model berikutnya...`)
      continue
    }

    // Safety net bocoran reasoning/jawaban ngaco: kalau masih ada model lain
    // di rantai, coba yang berikutnya dulu — daripada langsung ditampilkan
    // ke user apa adanya.
    if (looksLikeLeakedReasoning(text) && !isLastInChain) {
      console.warn(`[ai] Kedeteksi bocoran reasoning dari ${modelToUse}, coba model berikutnya...`)
      continue
    }
    return text
  }

  // Semua model di rantai gagal — lempar error dari percobaan TERAKHIR
  // (paling informatif buat debugging, biasanya juga yang paling relevan).
  throw lastErr
}

// ── Panggilan structured output (dipaksa balas JSON sesuai schema) ──────────
// Sama seperti versi lama: response_format json_object menjamin JSON valid,
// tapi kepatuhan ke STRUKTUR schema tetap dibantu lewat instruksi eksplisit
// di system prompt (tidak semua model di OpenRouter dukung strict schema
// enforcement di level API, jadi ini pendekatan yang paling portable lintas
// model/provider).
async function callOpenRouterStructured({ system, prompt, schema, maxTokens, model, fallbacks = [] }) {
  const schemaInstruction = schema
    ? `\n\nWAJIB balas HANYA dengan JSON valid yang PERSIS mengikuti struktur berikut (semua field di "required" WAJIB ada, jangan ada yang terlewat):\n${JSON.stringify(schema, null, 2)}`
    : ''

  async function callWithModel(modelToUse) {
    const body = {
      model: modelToUse,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system + schemaInstruction },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      // Sama seperti callOpenRouter — reasoning yang bocor ke content juga
      // akan bikin JSON.parse di bawah gagal total, bukan cuma soal tampilan.
      reasoning: { exclude: true },
    }

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: openRouterHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text()
      const err = new Error(`[OpenRouter] ${res.status}: ${errText.slice(0, 300)}`)
      err.status = res.status
      throw err
    }
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error(`[OpenRouter] Respons kosong (model: ${data.model || modelToUse})`)
    return text
  }

  // Sama seperti callOpenRouter: rantai model dicoba satu per satu lewat
  // request terpisah, apa pun jenis errornya, selalu berakhir di FREE_ROUTER
  // sebagai jaring pengaman terakhir.
  const chain = [model, ...fallbacks]
  if (!chain.includes(FREE_ROUTER)) chain.push(FREE_ROUTER)

  let lastErr
  for (let i = 0; i < chain.length; i++) {
    const modelToUse = chain[i]
    const isLastInChain = i === chain.length - 1
    let text
    try {
      text = await callWithModel(modelToUse)
    } catch (e) {
      lastErr = e
      console.warn(`[ai] Model ${modelToUse} (structured) gagal (${e.status || 'error'}: ${e.message.slice(0, 120)}), coba model berikutnya...`)
      continue
    }

    if (looksLikeLeakedReasoning(text) && !isLastInChain) {
      console.warn(`[ai] Structured output dari ${modelToUse} kedeteksi kayak bocoran reasoning, coba model berikutnya...`)
      continue
    }

    try {
      return JSON.parse(text)
    } catch {
      lastErr = new Error(`[OpenRouter] Gagal parse JSON dari model ${modelToUse}: ${text.slice(0, 200)}`)
      if (!isLastInChain) {
        console.warn(`[ai] ${modelToUse} balas JSON tidak valid, coba model berikutnya...`)
        continue
      }
    }
  }

  throw lastErr
}

// ── Retry helper — sengaja dipertahankan sebagai lapisan terakhir; fallback
// utama sekarang ditangani OpenRouter sendiri lewat parameter `models`, ini
// cuma jaring pengaman kalau request pertama gagal karena hal transient
// (network blip, timeout) sebelum sempat masuk ke logic fallback OpenRouter.
async function withRetry(fn, maxRetries = 1) {
  let lastErr
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn() } catch (e) { lastErr = e }
  }
  throw lastErr
}

// ── Public exports — signature SAMA PERSIS seperti sebelumnya, jadi tidak
// ada file lain (coach-hub.js, cron/jobs.js, dst) yang perlu diubah. ────────
export async function generateText({ system, prompt, maxTokens = 1000, tier = 'fast', plan = 'free' }) {
  const cfg = pickModelConfig(plan, tier)
  return withRetry(() => callOpenRouter({
    system,
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
    model: cfg.model,
    fallbacks: cfg.fallbacks,
  }), 1)
}

export async function generateChat({ system, messages, maxTokens = 500, tier = 'fast', plan = 'free' }) {
  const cfg = pickModelConfig(plan, tier)
  return withRetry(() => callOpenRouter({
    system,
    messages,
    maxTokens,
    model: cfg.model,
    fallbacks: cfg.fallbacks,
  }), 1)
}

export async function generateStructured({ system, prompt, schema, maxTokens = 300, tier = 'fast', plan = 'free' }) {
  const cfg = pickModelConfig(plan, tier)
  return withRetry(() => callOpenRouterStructured({
    system,
    prompt,
    schema,
    maxTokens,
    model: cfg.model,
    fallbacks: cfg.fallbacks,
  }), 1)
}
