/**
 * _lib/ai.js — Universal AI wrapper untuk Verneks (Updated)
 *
 * Routing:
 * - plan='premium' → Claude (Sonnet) utama, fallback ke DeepSeek → Cerebras
 * - plan='free'    → Cerebras utama, fallback ke DeepSeek → Gemini
 *
 * Models (Juni 2026):
 * - Cerebras  : gpt-oss-120b         (free, cepat, 1M token/hari)
 * - DeepSeek  : deepseek-v4-flash     (murah $0.14/1M, setara Claude Haiku)
 * - Gemini    : gemini-2.5-flash      (gemini-1.5-flash & 2.0-flash sudah retired per Juni 2026)
 * - Claude    : claude-sonnet-4-6     (premium, paling pintar)
 */
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

const MODELS = {
  cerebras: { fast: 'gpt-oss-120b',          smart: 'gpt-oss-120b' },
  deepseek: { fast: 'deepseek-v4-flash',       smart: 'deepseek-v4-flash' },
  claude:   { fast: 'claude-haiku-4-5-20251001', smart: 'claude-sonnet-4-6' },
  gemini:   { fast: 'gemini-2.5-flash-lite',   smart: 'gemini-2.5-flash' },
}

// ── Normalize messages untuk semua provider ──────────────────────────────────
function normalizeMessages(messages) {
  return messages
    .map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: (m.content || m.text || '').trim(),
    }))
    .filter(m => m.content.length > 0)
}

// ── Claude ───────────────────────────────────────────────────────────────────
async function callClaude({ system, messages, maxTokens, model }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const normalized = normalizeMessages(messages)
  const useCache = system.length > 4000
  const systemContent = useCache
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system
  const msg = await client.messages.create({
    model: model || MODELS.claude.smart,
    max_tokens: maxTokens,
    system: systemContent,
    messages: normalized,
  })
  return msg.content[0].text
}

// ── OpenAI-compatible (Cerebras & DeepSeek) ──────────────────────────────────
async function callOpenAICompat({ system, messages, maxTokens, model, baseUrl, apiKey }) {
  const normalized = normalizeMessages(messages)
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      ...normalized,
    ],
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[${baseUrl}] ${res.status}: ${err.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error(`Empty response from ${baseUrl} (model: ${model})`)
  return text
}

function callCerebras({ system, messages, maxTokens, model }) {
  return callOpenAICompat({
    system, messages, maxTokens,
    model:   model || MODELS.cerebras.fast,
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKey:  process.env.CEREBRAS_API_KEY,
  })
}

function callDeepSeek({ system, messages, maxTokens, model }) {
  return callOpenAICompat({
    system, messages, maxTokens,
    model:   model || MODELS.deepseek.fast,
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey:  process.env.DEEPSEEK_API_KEY,
  })
}

// ── Gemini (Didesain ulang menggunakan generateContent agar lebih stabil) ─────
async function callGemini({ system, messages, maxTokens, model }) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const m = genAI.getGenerativeModel({
    model: model || MODELS.gemini.fast,
    systemInstruction: system,
  })
  
  const normalized = normalizeMessages(messages)
  const contents = normalized.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }))

  const result = await m.generateContent({
    contents,
    generationConfig: { maxOutputTokens: maxTokens }
  })
  return result.response.text() || ''
}

async function callGeminiText({ system, prompt, maxTokens, model }) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const m = genAI.getGenerativeModel({
    model: model || MODELS.gemini.fast,
    systemInstruction: system,
  })
  const result = await m.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens }
  })
  return result.response.text()
}

// ── Structured output per provider ───────────────────────────────────────────
// Beda dengan callX biasa: ini MEMAKSA hasil sesuai schema di level API,
// bukan cuma minta baik-baik lewat prompt lalu parse teks manual.

async function callClaudeStructured({ system, prompt, schema, maxTokens, model }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await client.messages.create({
    model: model || MODELS.claude.fast,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
    tools: [{ name: 'extract', description: 'Return the extracted structured data', input_schema: schema }],
    tool_choice: { type: 'tool', name: 'extract' }, // model wajib panggil tool ini, tidak bisa cuma ngomong teks
  })
  const toolCall = msg.content.find(b => b.type === 'tool_use')
  if (!toolCall) throw new Error('Claude tidak mengembalikan tool_use')
  return toolCall.input
}

async function callOpenAICompatStructured({ system, prompt, schema, maxTokens, model, baseUrl, apiKey }) {
  // FIX: sebelumnya `schema` diterima sebagai parameter tapi TIDAK PERNAH
  // benar-benar dipakai — response_format: json_object cuma menjamin output
  // JSON VALID secara sintaks, bukan menjamin field/struktur yang diminta
  // ada semua (beda dari Claude tool_use yang struktural, atau Gemini
  // responseSchema asli). Tanpa ini, model bisa saja balikin JSON valid
  // tapi field wajib (misal "slug") hilang begitu saja — persis bug yang
  // bikin generate-daily-article gagal terus dengan error "null value in
  // column slug". Sekarang schema-nya di-embed eksplisit ke system prompt
  // sebagai instruksi tambahan, supaya modelnya benar-benar tahu struktur
  // JSON yang diharapkan, bukan cuma "asal valid JSON".
  const schemaInstruction = schema
    ? `\n\nWAJIB balas HANYA dengan JSON valid yang PERSIS mengikuti struktur berikut (semua field di "required" WAJIB ada, jangan ada yang terlewat):\n${JSON.stringify(schema, null, 2)}`
    : ''

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system + schemaInstruction },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' }, // Cerebras & DeepSeek: API menjamin valid JSON (bukan menjamin struktur — itu tugas schemaInstruction di atas)
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[${baseUrl}] ${res.status}: ${err.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error(`Empty response from ${baseUrl} (model: ${model})`)
  return JSON.parse(text) // aman: response_format json_object menjamin valid JSON (strukturnya dijamin oleh schemaInstruction di prompt, bukan oleh API)
}

function callCerebrasStructured({ system, prompt, schema, maxTokens, model }) {
  return callOpenAICompatStructured({
    system, prompt, schema, maxTokens,
    model:   model || MODELS.cerebras.fast,
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKey:  process.env.CEREBRAS_API_KEY,
  })
}

function callDeepSeekStructured({ system, prompt, schema, maxTokens, model }) {
  return callOpenAICompatStructured({
    system, prompt, schema, maxTokens,
    model:   model || MODELS.deepseek.fast,
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey:  process.env.DEEPSEEK_API_KEY,
  })
}

async function callGeminiStructured({ system, prompt, schema, maxTokens, model }) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const m = genAI.getGenerativeModel({
    model: model || MODELS.gemini.fast,
    systemInstruction: system,
    generationConfig: {
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
      responseSchema: schema, // Gemini: enforce shape, bukan cuma "valid JSON apa saja"
    },
  })
  const result = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
  return JSON.parse(result.response.text())
}

// Fallback chain sama persis dengan generateText/generateChat, cuma versi structured.
// plan='free' → Cerebras → Gemini → Claude Haiku (jarang sampai sini)
// plan='premium' → Claude → DeepSeek → Gemini
export async function generateStructured({ system, prompt, schema, maxTokens = 300, tier = 'fast', plan = 'free' }) {
  const chain = plan === 'premium'
    ? [
        () => callClaudeStructured({ system, prompt, schema, maxTokens, model: MODELS.claude[tier] }),
        () => callDeepSeekStructured({ system, prompt, schema, maxTokens, model: MODELS.deepseek[tier] }),
        () => callGeminiStructured({ system, prompt, schema, maxTokens, model: MODELS.gemini[tier] }),
      ]
    : [
        () => callCerebrasStructured({ system, prompt, schema, maxTokens, model: MODELS.cerebras[tier] }),
        () => callGeminiStructured({ system, prompt, schema, maxTokens, model: MODELS.gemini[tier] }),
        () => callClaudeStructured({ system, prompt, schema, maxTokens, model: MODELS.claude.fast }),
      ]

  let lastErr
  for (const attempt of chain) {
    try {
      return await attempt()
    } catch (e) {
      lastErr = e
      console.warn('[ai:structured] provider gagal, lanjut fallback:', e.message)
    }
  }
  throw new Error(`[ai:structured] Semua provider gagal: ${lastErr.message}`)
}

// ── Retry helper ─────────────────────────────────────────────────────────────
async function withRetry(fn, maxRetries = 1) {
  let lastErr
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn() } catch (e) { lastErr = e }
  }
  throw lastErr
}

// ── Free tier: Cerebras → DeepSeek → Gemini ──────────────────────────────────
async function callFreeChat({ system, messages, maxTokens, tier }) {
  try {
    return await callCerebras({ system, messages, maxTokens, model: MODELS.cerebras[tier] })
  } catch (e1) {
    console.warn('[ai] Cerebras gagal, fallback ke DeepSeek:', e1.message)
    try {
      return await callDeepSeek({ system, messages, maxTokens, model: MODELS.deepseek[tier] })
    } catch (e2) {
      console.warn('[ai] DeepSeek gagal, fallback ke Gemini:', e2.message)
      try {
        return await callGemini({ system, messages, maxTokens, model: MODELS.gemini[tier] })
      } catch (e3) {
        throw new Error(`Semua provider gagal. Cerebras: ${e1.message} | DeepSeek: ${e2.message} | Gemini: ${e3.message}`)
      }
    }
  }
}

async function callFreeText({ system, prompt, maxTokens, tier }) {
  const messages = [{ role: 'user', content: prompt }]
  try {
    return await callCerebras({ system, messages, maxTokens, model: MODELS.cerebras[tier] })
  } catch (e1) {
    console.warn('[ai] Cerebras gagal, fallback ke DeepSeek:', e1.message)
    try {
      return await callDeepSeek({ system, messages, maxTokens, model: MODELS.deepseek[tier] })
    } catch (e2) {
      console.warn('[ai] DeepSeek gagal, fallback ke Gemini:', e2.message)
      try {
        return await callGeminiText({ system, prompt, maxTokens, model: MODELS.gemini[tier] })
      } catch (e3) {
        throw new Error(`Semua provider gagal. Cerebras: ${e1.message} | DeepSeek: ${e2.message} | Gemini: ${e3.message}`)
      }
    }
  }
}

// ── Premium tier: Claude (smart only) → Cerebras (fast优先) → DeepSeek ───────
async function callPremiumChat({ system, messages, maxTokens, tier }) {
  // Untuk fast tier: prioritaskan Cerebras (hemat cost)
  if (tier === 'fast') {
    try {
      return await callCerebras({ system, messages, maxTokens, model: MODELS.cerebras.fast })
    } catch (e1) {
      console.warn('[ai] Premium fast: Cerebras gagal, fallback ke DeepSeek:', e1.message)
      try {
        return await callDeepSeek({ system, messages, maxTokens, model: MODELS.deepseek.fast })
      } catch (e2) {
        console.warn('[ai] Premium fast: DeepSeek gagal, fallback ke Claude Haiku:', e2.message)
        return await callClaude({ system, messages, maxTokens, model: MODELS.claude.fast })
      }
    }
  }
  // Untuk smart tier: Claude Sonnet utama
  try {
    return await callClaude({ system, messages, maxTokens, model: MODELS.claude.smart })
  } catch (e1) {
    console.warn('[ai] Claude gagal, fallback ke DeepSeek:', e1.message)
    try {
      return await callDeepSeek({ system, messages, maxTokens, model: MODELS.deepseek.smart })
    } catch (e2) {
      console.warn('[ai] DeepSeek gagal, fallback ke Cerebras:', e2.message)
      return await callCerebras({ system, messages, maxTokens, model: MODELS.cerebras.smart })
    }
  }
}

async function callPremiumText({ system, prompt, maxTokens, tier }) {
  const messages = [{ role: 'user', content: prompt }]
  // Untuk fast tier: prioritaskan Cerebras (hemat cost)
  if (tier === 'fast') {
    try {
      return await callCerebras({ system, messages, maxTokens, model: MODELS.cerebras.fast })
    } catch (e1) {
      console.warn('[ai] Premium fast: Cerebras gagal, fallback ke DeepSeek:', e1.message)
      try {
        return await callDeepSeek({ system, messages, maxTokens, model: MODELS.deepseek.fast })
      } catch (e2) {
        console.warn('[ai] Premium fast: DeepSeek gagal, fallback ke Claude Haiku:', e2.message)
        return await callClaude({ system, messages, maxTokens, model: MODELS.claude.fast })
      }
    }
  }
  // Untuk smart tier: Claude Sonnet/Haiku utama
  try {
    return await callClaude({ system, messages, maxTokens, model: MODELS.claude.fast })
  } catch (e1) {
    console.warn('[ai] Claude gagal, fallback ke DeepSeek:', e1.message)
    try {
      return await callDeepSeek({ system, messages, maxTokens, model: MODELS.deepseek.fast })
    } catch (e2) {
      console.warn('[ai] DeepSeek gagal, fallback ke Cerebras:', e2.message)
      return await callCerebras({ system, messages, maxTokens, model: MODELS.cerebras[tier] })
    }
  }
}

// ── Public exports ────────────────────────────────────────────────────────────
export async function generateText({ system, prompt, maxTokens = 1000, tier = 'fast', plan = 'free' }) {
  return withRetry(async () => {
    if (plan === 'premium') return callPremiumText({ system, prompt, maxTokens, tier })
    return callFreeText({ system, prompt, maxTokens, tier })
  }, 1)
}

export async function generateChat({ system, messages, maxTokens = 500, tier = 'fast', plan = 'free' }) {
  return withRetry(async () => {
    if (plan === 'premium') return callPremiumChat({ system, messages, maxTokens, tier })
    return callFreeChat({ system, messages, maxTokens, tier })
  }, 1)
}
