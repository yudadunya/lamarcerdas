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
 * FALLBACK: OpenRouter punya fitur bawaan `models: [primary, fallback1, ...]`
 * di satu request — kalau model pertama down/rate-limited/kena moderasi,
 * OpenRouter otomatis coba model berikutnya di server mereka. Makanya kode
 * di file ini jauh lebih sederhana dari sebelumnya (nggak perlu try/catch
 * manual berlapis-lapis buat tiap provider).
 *
 * GANTI MODEL: semua slug di bawah bisa di-override lewat env var tanpa ubah
 * kode (lihat MODELS). Kalau ada model yang 404/deprecated, cek slug terbaru
 * di https://openrouter.ai/models dan update env var terkait di Vercel.
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
// free.fast dipakai buat mayoritas chat gratis (model :free = tanpa biaya di
// OpenRouter, tapi ada rate limit ~20 req/menit & ~200 req/hari per OpenRouter
// — makanya tetap ada fallback ke model murah berbayar kalau limit itu kena).
const MODELS = {
  free: {
    fast: {
      model:     process.env.OPENROUTER_MODEL_FREE_FAST  || 'openai/gpt-oss-20b:free',
      fallbacks: ['google/gemini-3.5-flash-lite', 'deepseek/deepseek-chat'],
    },
    smart: {
      model:     process.env.OPENROUTER_MODEL_FREE_SMART || 'deepseek/deepseek-chat',
      fallbacks: ['google/gemini-3.5-flash-lite', 'openai/gpt-oss-20b:free'],
    },
  },
  premium: {
    fast: {
      model:     process.env.OPENROUTER_MODEL_PREMIUM_FAST  || 'anthropic/claude-haiku-4.5',
      fallbacks: ['google/gemini-3.7-flash', 'deepseek/deepseek-chat'],
    },
    smart: {
      model:     process.env.OPENROUTER_MODEL_PREMIUM_SMART || 'anthropic/claude-sonnet-5',
      fallbacks: ['google/gemini-3.7-flash', 'anthropic/claude-haiku-4.5'],
    },
  },
}

function pickModelConfig(plan, tier) {
  const planKey = plan === 'premium' ? 'premium' : 'free'
  const tierKey = tier === 'smart' ? 'smart' : 'fast'
  return MODELS[planKey][tierKey]
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
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, ...normalized],
  }
  // Fallback bawaan OpenRouter: satu request, dicoba berurutan di sisi mereka.
  if (fallbacks.length > 0) body.models = [model, ...fallbacks]

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`[OpenRouter] ${res.status}: ${errText.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error(`[OpenRouter] Respons kosong (model: ${data.model || model})`)
  return text
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

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system + schemaInstruction },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
  }
  if (fallbacks.length > 0) body.models = [model, ...fallbacks]

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`[OpenRouter] ${res.status}: ${errText.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error(`[OpenRouter] Respons kosong (model: ${data.model || model})`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`[OpenRouter] Gagal parse JSON dari model: ${text.slice(0, 200)}`)
  }
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
