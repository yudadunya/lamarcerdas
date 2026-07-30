// api/coach-hub.js
// ═══════════════════════════════════════════════════════════════════════════
// FILE GABUNGAN — merge dari 4 endpoint terpisah:
//   - api/career-coach.js    (target=career-coach)  → handleCareerCoach
//   - api/chat-history.js    (target=chat-history)   → handleChatHistory
//   - api/discovery-coach.js (target=discovery-coach)→ handleDiscoveryCoach
//   - api/end-session.js     (target=end-session)    → handleEndSession
//
// Tidak ada logic yang diubah dari file aslinya — hanya digabung jadi satu
// file + dispatcher di bagian paling bawah. Supaya frontend (Chat.jsx,
// Discovery.jsx) TIDAK perlu diubah sama sekali, tambahkan rewrites di
// vercel.json supaya URL lama tetap jalan dan diarahkan ke file ini dengan
// query `target` (lihat catatan vercel.json yang disertakan terpisah).
// ═══════════════════════════════════════════════════════════════════════════

import { generateText, generateChat, generateStructured } from './lib/ai.js'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { getUserFcmToken, sendMilestoneCompletePush } from './lib/notifications.js'

// Satu client Supabase dipakai bersama oleh semua handler (service role,
// fallback ke anon key kalau service role tidak ada — sama seperti
// chat-history.js aslinya; career-coach.js & end-session.js aslinya selalu
// pakai service role key, jadi kalau SUPABASE_SERVICE_ROLE_KEY tidak ada,
// perilakunya sama seperti sebelumnya juga: `undefined` diteruskan apa adanya
// ke createClient untuk 2 handler tsb — TIDAK diubah).
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const supabase    = createClient(supabaseUrl, serviceKey || anonKey)


// ═══════════════════════════════════════════════════════════════════════════
// ══════════════════════ HANDLER: CAREER-COACH ═══════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// ── [OPTIMIZATION] RULE-BASED RESPONSES — Hemat ~25% AI calls ────────────────
const RULE_BASED_PATTERNS = [
  {
    keywords: ['mulai', 'cara mulai', 'langkah pertama', 'dari mana'],
    context: ['karir', 'kerja', 'posisi', 'target'],
    response: "Langkah pertama yang paling penting: klarifikasi dulu posisi target yang spesifik. Jangan masih 'pengen kerja di tech', tapi harus 'Product Manager di startup fintech'. Setelah itu baru kita breakdown skill gap-nya. Kamu sudah punya gambaran posisi target yang jelas?"
  },
  {
    keywords: ['skill', 'kemampuan', 'kompetensi', 'belajar'],
    context: ['butuh', 'perlu', 'yang dibutuhkan', 'harus punya'],
    response: "Skill yang paling critical biasanya muncul di 3-5 job description posisi target kamu. Coba buka LinkedIn, cari 5 lowongan yang match, catet skill yang paling sering disebut. Itu yang kita prioritaskan. Mau aku bantu identifikasi skill gap utama kamu?"
  },
  {
    keywords: ['gaji', 'salary', 'uang', 'penghasilan', 'bayaran'],
    context: ['berapa', 'standar', 'normal', 'range'],
    response: "Gaji itu sangat tergantung level, industri, dan lokasi. Yang bisa aku bantu: positioning kamu supaya masuk range atas. Caranya? Dokumentasi achievement yang measurable, bangun track record yang jelas, dan tahu cara negotiate. Kamu sekarang di level berapa?"
  },
  {
    keywords: ['cv', 'resume', 'daftar riwayat'],
    context: ['jelek', 'buruk', 'jelek', 'kurang bagus', 'review'],
    response: "CV yang efektif itu bukan tentang desain cantik, tapi tentang achievement yang terukur. Ganti 'bertanggung jawab untuk X' jadi 'berhasil meningkatkan X sebesar Y%'. Kalau mau review mendalam, pakai fitur CV Review di menu Chat - ada analisis ATS-nya juga."
  },
  {
    keywords: ['motivasi', 'semangat', 'lelah', 'burnout', 'menyerah'],
    context: [],
    response: "Wajar banget merasa lelah. Career journey itu marathon, bukan sprint. Coba ingat lagi: kenapa kamu pilih target ini dari awal? Apa yang bikin kamu excited waktu pertama kali bayangin capai tujuan itu? Kadang kita cuma butuh istirahat sebentar, bukan berhenti."
  },
  {
    keywords: ['interview', 'wawancara', 'hrd', 'user'],
    context: ['takut', 'gugup', 'tips', 'cara', 'persiapan'],
    response: "Kunci interview itu preparation + authenticity. Prepare 5-7 story tentang achievement kamu pakai framework STAR (Situation, Task, Action, Result). Lalu latihan cerita itu sampai natural. Mau coba mock interview? Ada fiturnya di menu Chat."
  },
  {
    keywords: ['promosi', 'naik jabatan', 'naik level', 'career path'],
    context: [],
    response: "Promosi itu hasil dari 3 hal: performance yang konsisten, visibility yang tepat, dan timing yang pas. Yang paling sering dilupakan orang: visibility. Bos kamu tahu nggak achievement 3 bulan terakhir kamu? Kalau belum, saatnya mulai communicate proaktif."
  },
  {
    keywords: ['pindah', 'switch', 'pivot', 'ganti', 'transisi'],
    context: ['karir', 'industri', 'pekerjaan', 'kerja'],
    response: "Career pivot itu risiko, tapi kadang perlu. Pertanyaan kuncinya: apakah kamu pindah KARENA sesuatu (visi yang lebih besar) atau pindah DARI sesuatu (escape dari situasi tidak nyaman)? Kalau alasannya 'dari', kemungkinan bakal nyesel. Kalau 'karena', lebih sustainable. Kamu yang mana?"
  },
  {
    keywords: ['networking', 'koneksi', 'relasi', 'kenalan'],
    context: ['cara', 'tips', 'malu', 'gak jago'],
    response: "Networking itu bukan tentang kenal banyak orang, tapi tentang membangun relasi bermakna dengan sedikit orang yang right. Mulai dari: engage dengan konten orang di LinkedIn, kasih value dulu sebelum minta, dan follow up rutin. Kamu sudah coba approach apa sejauh ini?"
  },
  {
    keywords: ['thank', 'terima', 'makasih', 'thanks', 'helpful', 'bermanfaat'],
    context: [],
    response: "Sama-sama! Seneng bisa bantu. Yang paling penting: eksekusi. Insight tanpa action cuma entertainment. Ada satu hal konkret yang mau kamu commit lakukan minggu ini?"
  }
]

function matchRuleBasedResponse(message, careerProfile) {
  const lowerMsg = message.toLowerCase()
  
  for (const rule of RULE_BASED_PATTERNS) {
    const hasKeyword = rule.keywords.some(k => lowerMsg.includes(k))
    if (!hasKeyword) continue
    
    // Check context if specified
    if (rule.context.length > 0) {
      const hasContext = rule.context.some(c => lowerMsg.includes(c))
      if (!hasContext) continue
    }
    
    return rule.response
  }
  
  return null
}

// ── [OPTIMIZATION] MESSAGE COMPRESSION — Hemat ~10% token usage ─────────────
function compressConversationHistory(messages, maxMessages = 8) {
  if (messages.length <= maxMessages) return messages
  
  // Keep first 2 messages (context setting) + last (maxMessages - 2) messages
  const compressed = [
    ...messages.slice(0, 2),
    { role: 'system', content: `[${messages.length - maxMessages + 2} pesan sebelumnya diringkas untuk efisiensi]` },
    ...messages.slice(-(maxMessages - 2))
  ]
  
  return compressed
}

function pruneMessageContent(content, maxLength = 500) {
  if (!content || content.length <= maxLength) return content
  return content.slice(0, maxLength) + '...'
}

// ── [OPTIMIZATION] CACHE HASHING — Hemat ~30% duplicate AI calls ────────────
function hashMessage(message) {
  return createHash('sha256').update(message.toLowerCase().trim()).digest('hex').slice(0, 16)
}

const responseCache = new Map()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function getCachedResponse(hash) {
  const cached = responseCache.get(hash)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    responseCache.delete(hash)
    return null
  }
  return cached.response
}

function setCachedResponse(hash, response) {
  responseCache.set(hash, { response, timestamp: Date.now() })
  
  // Cleanup old entries periodically
  if (responseCache.size > 1000) {
    const now = Date.now()
    for (const [key, value] of responseCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        responseCache.delete(key)
      }
    }
  }
}

// ── [RSI] ROBUST JSON PARSER ─────────────────────────────────────────────────
// ── [RSI] ENGINE: ANALISIS & PEMBELAJARAN POLA MANDIRI ───────────────────────
const PATTERN_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    new_patterns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['communication_style', 'emotional_trigger', 'work_habit', 'decision_pattern', 'motivation_driver', 'blocker'],
          },
          description: { type: 'string', description: 'Deskripsi singkat dan jelas tentang pola ini' },
          confidence:  { type: 'number', description: '0-100' },
          examples:    { type: 'array', items: { type: 'string' } },
        },
        required: ['type', 'description', 'confidence', 'examples'],
      },
    },
    strategy_adjustment: { type: 'string', description: 'Saran bagaimana Diah Anna harus menyesuaikan gaya coaching-nya' },
    should_update_memory: { type: 'boolean' },
  },
  required: ['new_patterns', 'strategy_adjustment', 'should_update_memory'],
}

async function analyzeAndLearnPatterns(userId, messages, aiResponse, careerProfile, existingPatterns, rsiVersion, supabase) {
  try {
    // Ambil hanya pesan user untuk analisis
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content || m.text || '').join('\n')
    
    if (!userMessages || userMessages.length < 20) return // Terlalu pendek untuk dianalisis
    
    // [OPTIMIZATION #7] Compress user messages untuk RSI analysis — hemat token
    const compressedUserMsgs = userMessages.slice(0, 2000) // Reduced from 3000
    
    // Minta AI menganalisis pola dari percakapan ini — schema dipaksa di level API,
    // jadi tidak perlu lagi regex/bracket-repair untuk JSON yang terpotong.
    let analysis
    try {
      analysis = await generateStructured({
        system: 'Kamu adalah sistem analisis pola perilaku untuk Diah Anna. Tugasmu: mengidentifikasi pola berulang, preferensi komunikasi, atau wawasan baru tentang user dari percakapan coaching karir.',
        prompt: `Profil User: ${careerProfile?.nama || 'Unknown'}, Target: ${careerProfile?.target_posisi || 'Unknown'}\n\nRiwayat Percakapan:\n${compressedUserMsgs}\n\nRespons AI:\n${aiResponse.slice(0, 800)}\n\nAnalisis apakah ada pola baru yang bisa dipelajari atau pola lama yang perlu disesuaikan confidence-nya.`,
        schema: PATTERN_ANALYSIS_SCHEMA,
        maxTokens: 1000,  // [OPTIMIZATION #8] Reduced from 1500 — RSI tidak butuh detail tinggi
        tier: 'fast',   // Cerebras/DeepSeek — hemat, RSI tidak butuh model premium
        plan: 'free'
      })
    } catch (e) {
      console.error('[RSI] Semua provider gagal saat analisis pola:', e.message)
      return
    }

    if (!analysis || !Array.isArray(analysis.new_patterns)) {
      console.error('[RSI] Struktur tidak valid dari generateStructured')
      return
    }

    if (analysis.new_patterns.length === 0) return // Tidak ada pola baru
    
    // Proses setiap pola yang ditemukan
    for (const pattern of analysis.new_patterns) {
      if (!pattern.type || !pattern.description) continue
      
      // Cek apakah pola serupa sudah ada
      const similarPattern = existingPatterns.find(p => 
        p.pattern_category === pattern.type && 
        p.pattern_description.toLowerCase().includes(pattern.description.toLowerCase().slice(0, 30))
      )
      
      if (similarPattern) {
        // Update confidence + occurrence count
        await supabase.from('ai_learned_patterns')
          .update({ 
            confidence_score:  Math.min(100, (similarPattern.confidence_score || 50) + 10),
            occurrence_count:  (similarPattern.occurrence_count || 1) + 1,
            last_observed_at:  new Date().toISOString(),
          })
          .eq('id', similarPattern.id)
      } else {
        // Insert pola baru
        await supabase.from('ai_learned_patterns')
          .insert({
            user_id:             userId,
            pattern_category:    pattern.type,
            pattern_description: pattern.description,
            confidence_score:    pattern.confidence || 50,
            occurrence_count:    1,
            last_observed_at:    new Date().toISOString(),
          })
      }
    }
    
    // Log proses self-improvement
    await supabase.from('ai_self_improvement_log')
      .insert({
        user_id: userId,
        session_id: `chat_${Date.now()}`,
        improvement_type: 'pattern_recognition',
        before_state: { patterns_count: existingPatterns.length, rsi_version: rsiVersion },
        after_state: { patterns_count: existingPatterns.length + (analysis.new_patterns?.length || 0), rsi_version: rsiVersion + 1 },
        confidence_delta: analysis.new_patterns?.reduce((sum, p) => sum + (p.confidence || 0), 0) / (analysis.new_patterns?.length || 1),
        notes: analysis.strategy_adjustment || ''
      })
    
    // Update RSI version di profil user
    await supabase.from('user_career_profiles')
      .update({ 
        rsi_version: rsiVersion + 1,
        last_updated: new Date().toISOString()
      })
      .eq('user_id', userId)
    
    console.log(`[RSI] Learned ${analysis.new_patterns.length} new patterns for user ${userId}. New version: v${rsiVersion + 1}`)
    
  } catch (error) {
    console.error('[RSI] Analysis error:', error.message)
  }
}

// ── KEAMANAN: plan & usage TIDAK PERNAH dipercaya dari client ────────────────
const LIMITS = {
  free:    { chat: 15, 'cv-review': 1, ats: 1, coach: 999, interview: 1, 'cv-maker': 1, 'income-strategy': 1 },
  premium: { chat: 999, 'cv-review': 999, ats: 999, coach: 999, interview: 999, 'cv-maker': 999, 'income-strategy': 999 },
}

async function getRealPlan(userId) {
  if (!userId) return 'free'
  try {
    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data?.plan || !LIMITS[data.plan]) return 'free'
    const expired = data.expires_at && new Date(data.expires_at) < new Date()
    if (!expired && data.status === 'active') return data.plan
    return 'free'
  } catch (e) {
    console.error('[getRealPlan] error:', e.message)
    return 'free'
  }
}

async function checkAndLogUsage(userId, plan, feature) {
  const limit = LIMITS[plan]?.[feature] ?? 0
  if (limit === 0) return { allowed: false, remaining: 0 }
  if (limit >= 999) {
    if (userId) supabase.from('usage_logs').insert({ user_id: userId, feature }).then(() => {}).catch(() => {})
    return { allowed: true, remaining: 999 }
  }
  if (!userId) return { allowed: false, remaining: 0 }

  try {
    const since = feature === 'chat'
      ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

    const { count } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('feature', feature)
      .gte('created_at', since)

    const used = count ?? 0
    if (used >= limit) return { allowed: false, remaining: 0 }

    await supabase.from('usage_logs').insert({ user_id: userId, feature })
    return { allowed: true, remaining: limit - used - 1 }
  } catch (e) {
    console.error('[checkAndLogUsage] error:', e.message)
    return { allowed: false, remaining: 0 }
  }
}

// ── ENGINE V2: HELPER NEXT FOCUS & PROACTIVE GREETING ───────────────────────
function getNextFocus(memory) {
  if (memory.current_focus && memory.current_focus !== 'Belum ditentukan') {
    return { focus: memory.current_focus, type: 'current_focus' };
  }
  if (memory.skill_gaps && memory.skill_gaps.length > 0) {
    return { focus: memory.skill_gaps[0], type: 'biggest_skill_gap' };
  }
  if (memory.next_milestone && memory.next_milestone !== 'Belum ditentukan') {
    return { focus: memory.next_milestone, type: 'next_milestone' };
  }
  if (memory.gps_steps && memory.gps_steps.length > 0) {
    return { focus: memory.gps_steps[0], type: 'roadmap_step' };
  }
  return { focus: memory.target_position || "Pengembangan Karier", type: 'target_position' };
}

function generateDailyCoaching(memory, activeMission = null) {
  if (activeMission?.daily_mission) {
    return {
      daily_focus: activeMission.weekly_focus || "Mission Completion",
      daily_reason: "Menuntaskan misi aktif yang ada di dashboard utama kamu.",
      daily_question: `Bagaimana progres target "${activeMission.daily_mission}" yang kita sepakati di dashboard kemarin?`
    };
  }

  const nextFocusData = getNextFocus(memory);
  let reason = "";
  let question = "";

  switch (nextFocusData.type) {
    case 'current_focus':
      reason = `Sesuai rencana aksi yang sedang kita kawal bersama.`;
      question = `Sejauh mana langkah konkret yang sudah kamu ambil untuk mengoptimalkan area ini?`;
      break;
    case 'biggest_skill_gap':
      reason = `Karena area ini adalah hambatan terbesar menuju targetmu saat ini.`;
      question = `Menurutmu, apa yang paling menghambat perkembanganmu di area ${nextFocusData.focus}?`;
      break;
    default:
      reason = `Langkah strategis berikutnya untuk mendekatkanmu ke posisi target.`;
      question = `Apa satu tindakan kecil yang bisa kita mulai hari ini untuk fokus ke area ${nextFocusData.focus}?`;
  }

  return {
    daily_focus: nextFocusData.focus,
    daily_reason: reason,
    daily_question: question
  };
}

// ── PERSONA INTI DIAH ANNA (VERNEKS ENGINE V2) ───────────────────────────────
const CORE_PERSONA = `
Kamu Diah Anna — career companion di Verneks. Teman senior yang jujur, tajam, genuinely peduli karir user. Bukan chatbot, bukan expert teknis.

CARA BICARA: 2-3 kalimat per respons. Natural seperti WhatsApp. Tidak ada bullet/header/formatting. Langsung ke inti.

PRIORITAS: Kebenaran > Kepercayaan > Membantu. Lebih baik akui tidak tahu daripada mengarang.

ABSOLUTE RULES:
- Jangan mengarang fitur, modul, menu, data user, atau progress yang tidak ada
- Jangan jadi expert teknis (coding, trading, desain, medis, dll) — redirect ke sisi karir
- Kalau tidak yakin → "Aku belum punya info itu" atau "Itu belum ada di Verneks"
- Kalau user koreksi → akui langsung, jangan defensif

VERNEKS — HANYA INI YANG ADA:
- Home: dashboard readiness, mission harian, DNA preview
- Chat/Mentor: coaching Diah Anna (FREE: 15x/hari, PREMIUM: unlimited + CV Review/ATS/Mock Interview)
- DNA: 6 genome scores, gap skills, wow insight, GPS preview
- Journey (PREMIUM): 4 fase roadmap action steps — BUKAN modul/video/kursus
- Peluang (PREMIUM): 5 job matching berdasarkan DNA
- Profil: akun, plan, depth score, redeem kode

TIDAK ADA DI VERNEKS: modul, video, kursus, email sistem, Resources, support, komunitas, notifikasi.

CONTOH SALAH: "Modul Manajemen Sekolah ada di Journey" ← JANGAN PERNAH
CONTOH BENAR: "Verneks tidak punya modul. Journey isinya action steps karir, bukan kursus."

DOMAIN BOUNDARY: Apapun bidang user (trader, programmer, guru, chef) → bantu dari SISI KARIR, bukan teknis bidangnya.
Contoh: User tanya cara backtest forex → "Teknis tradingnya butuh mentor khusus. Yang bisa aku bantu: bagaimana membangun track record sebagai trader."

SELF CORRECTION: Kalau salah → "Terima kasih sudah koreksi. Aku pakai info dari kamu sekarang."

COACHING: Pakai data profil dari memory. Jangan tanya yang sudah diketahui. Arahkan, jangan tunggu. 1 pertanyaan tajam > 3 saran panjang.
`

const COACHING_BRAIN = `
# BRAIN 3 — COACHING MODE

Kamu memilih mode coaching terbaik berdasarkan sinyal dari percakapan. Satu respons = satu mode dominan.

DETEKSI MODE:
- MENTOR     → user butuh arah, bingung mau mulai, tanya "gimana caranya"
- COACH      → user sudah tahu tapi belum bergerak, butuh pertanyaan tajam bukan jawaban
- CHALLENGER → user terlalu nyaman, excuses berulang, tidak ada progress
- ACCOUNTABILITY → user lapor kemajuan, check-in rutin, janji tapi tidak eksekusi
- STRATEGIC  → user hadapi keputusan besar (pindah karir, resign, pivoting)
- MOTIVATOR  → user lelah, pesimis, mau menyerah
- CELEBRATOR → user baru capai milestone, achievement nyata

CARA BICARA PER MODE:
MENTOR: "Yang perlu kamu lakukan sekarang adalah..."
COACH: Balik pertanyaan. "Menurut kamu sendiri, apa yang menghambat?"
CHALLENGER: Tegas, tidak basa-basi. "Sudah 3 kali kamu bilang ini. Apa yang berbeda hari ini?"
ACCOUNTABILITY: Spesifik dan terukur. "Dari target X, berapa yang sudah selesai?"
STRATEGIC: Bantu lihat tradeoff. "Kalau ambil opsi A, risikonya adalah..."
MOTIVATOR: Validasi dulu, baru dorong. "Wajar kamu lelah. Tapi lihat..."
CELEBRATOR: Rayakan singkat, arahkan ke next step. "Ini pencapaian nyata. Sekarang..."

ATURAN:
- Jangan terjebak satu mode selamanya — baca ulang sinyal tiap respons
- Jangan campur 3+ mode dalam satu respons
- Mode CHALLENGER hanya kalau sudah ada rapport (minimal 5 pesan)
`

const STRATEGY_BRAIN = (stage, gpsSteps, currentFocus, nextMilestone, lastUpdated) => {
  // Deteksi apakah user stuck (tidak ada progress > 14 hari)
  const daysSinceUpdate = lastUpdated
    ? Math.floor((Date.now() - new Date(lastUpdated)) / 86400000)
    : 0
  const isStuck = daysSinceUpdate > 14

  // Strategi per career stage
  const stageStrategies = {
    'Career Explorer': `
STRATEGI: User masih eksplorasi — belum punya arah yang jelas.
Fokus Diah Anna: Bantu user mempersempit target dari opsi-opsi yang ada.
Pertanyaan kunci: "Dari semua yang kamu pertimbangkan, mana yang paling bikin kamu excited saat bangun pagi?"
Hindari: Langsung kasih roadmap panjang — user belum siap.`,

    'Career Builder': `
STRATEGI: User sudah punya target, sedang membangun fondasi.
Fokus Diah Anna: Skill building + networking yang tepat sasaran.
Pertanyaan kunci: "Skill mana yang paling sering muncul di job desc target kamu?"
Hindari: Terlalu banyak teori — user butuh aksi konkret minggu ini.`,

    'Career Professional': `
STRATEGI: User sudah bekerja di bidangnya, ingin naik level.
Fokus Diah Anna: Visibility + positioning + leverage pengalaman yang ada.
Pertanyaan kunci: "Apa pencapaian terbesar kamu 6 bulan terakhir yang belum banyak orang tahu?"
Hindari: Saran dari nol — user sudah punya modal, tinggal dioptimalkan.`,

    'Career Expert': `
STRATEGI: User sudah expert, ingin scale impact atau pindah ke peran strategis.
Fokus Diah Anna: Personal brand + thought leadership + peluang non-linear.
Pertanyaan kunci: "Kalau kamu bisa pilih satu legacy yang ingin diingat orang dari karir kamu, apa itu?"
Hindari: Saran teknis level bawah — tidak relevan untuk posisi mereka.`,

    'Career Leader': `
STRATEGI: User di level leadership — fokus pada sistem dan orang, bukan tugas.
Fokus Diah Anna: Leverage tim + decision making + long-term positioning.
Pertanyaan kunci: "Siapa di tim kamu yang bisa replace kamu dalam 6 bulan ke depan?"
Hindari: Micromanagement mindset — user perlu berpikir di level yang lebih tinggi.`,
  }

  const strategy = stageStrategies[stage] || stageStrategies['Career Builder']

  const stuckWarning = isStuck ? `
⚠️ USER TAMPAK STUCK: Tidak ada update progress selama ${daysSinceUpdate} hari.
Prioritaskan ACCOUNTABILITY atau CHALLENGER mode.
Tanya langsung: "Apa yang membuat langkah ini belum bergerak?"` : ''

  const gpsContext = gpsSteps?.length > 0 ? `
GPS ROADMAP AKTIF:
${gpsSteps.slice(0, 3).map((s, i) => `${i+1}. [${s.done ? '✓' : '○'}] ${s.title}`).join('\n')}
${gpsSteps.filter(s => !s.done).length > 0 ? `Next action: ${gpsSteps.find(s => !s.done)?.title}` : 'Semua step selesai — saatnya naik level!'}` : ''

  return `# BRAIN 4 — STRATEGY
${strategy}
${stuckWarning}
${gpsContext}`
}

// ── BRAIN TAMBAHAN — INCOME ENGINE (built-in, tanpa mode terpisah) ──────────
// Diah Anna selalu punya kemampuan ini di setiap percakapan biasa — bukan
// fitur yang perlu diaktifkan user. Dia yang menilai kapan tepat membahasnya,
// dan mengumpulkan data dari alur obrolan natural (bukan form).
const INCOME_ENGINE_BRAIN = (careerProfile) => {
  const hasIncomeGoal = careerProfile?.target_monthly_income && careerProfile?.current_monthly_income

  const existingGoalNote = hasIncomeGoal ? `
User SUDAH punya target income yang tersimpan: income sekarang Rp ${careerProfile.current_monthly_income}/bulan, target Rp ${careerProfile.target_monthly_income}/bulan dalam ${careerProfile.income_timeline_months || '-'} bulan.
Kamu boleh follow-up progress ini kapan saja secara natural (mis. "gimana progress freelance-nya minggu ini?"), TAPI JANGAN paksa tiap giliran — hanya kalau konteksnya pas.` : `
User BELUM punya target income tersimpan. Kalau muncul celah natural dalam obrolan (user cerita ingin promosi, kurang puas dengan gaji sekarang, mikirin resign, atau menyinggung soal keuangan), kamu boleh PROAKTIF menanyakan, contoh: "Btw, kalau boleh tau, target income kamu ke depan berapa sih? Aku bisa bantu hitungin strategi realistisnya nanti." Jangan dipaksakan kalau topiknya memang tidak nyambung.`

  return `# BRAIN 5 — INCOME ENGINE (kemampuan built-in, bukan mode terpisah)
Kamu bisa menghitung strategi kenaikan income yang KONKRET (kombinasi jalur negosiasi gaji / freelance / side income / produk, plus proyeksi bulanan) — ini bagian natural dari kamu sebagai coach, bukan fitur yang perlu "diaktifkan".
${existingGoalNote}

Kalau dalam obrolan user menyebutkan angka target income, income sekarang, DAN timeline (berapa bulan) — cukup respon natural (mis. "Oke, aku hitungin ya berdasarkan itu...") dan JANGAN minta form, konfirmasi tambahan, atau data yang sudah kamu tahu dari profil (target posisi, kekuatan/skill gap dari Genome). Sistem akan otomatis menghitung dan menampilkan breakdown-nya di respons berikutnya — kamu cukup fokus pada percakapannya.
Kalau baru sebagian data yang disebut (misal cuma target, belum ada timeline atau income sekarang), gali satu per satu secara natural, JANGAN sekaligus semua.`
}

const PREDICTION_BRAIN = (careerReadiness, depthScore, lastUpdated, gpsSteps, plan) => {
  const daysSinceUpdate = lastUpdated
    ? Math.floor((Date.now() - new Date(lastUpdated)) / 86400000)
    : 30

  const doneSteps    = (gpsSteps || []).filter(s => s.done).length
  const totalSteps   = (gpsSteps || []).length
  const progressPct  = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0

  // Estimasi waktu capai target
  const readiness         = careerReadiness || 0
  const weeklyProgressEst = daysSinceUpdate <= 7 ? 5 : daysSinceUpdate <= 14 ? 2 : 0
  const remainingReadiness = 100 - readiness
  const etaWeeks = weeklyProgressEst > 0
    ? Math.ceil(remainingReadiness / weeklyProgressEst)
    : null

  // Risk signals
  const risks = []
  if (daysSinceUpdate > 14) risks.push(`Tidak ada aktivitas ${daysSinceUpdate} hari — risiko momentum hilang tinggi`)
  if (readiness < 30 && depthScore < 20) risks.push('Profil belum cukup dalam — prediksi coaching kurang akurat')
  if (plan === 'free' && depthScore > 30) risks.push('User engaged tapi masih free — peluang konversi premium tinggi')
  if (doneSteps === 0 && totalSteps > 0) risks.push('Belum ada satu pun GPS step selesai — butuh quick win segera')

  // Momentum signals
  const momentum = []
  if (daysSinceUpdate <= 3) momentum.push('User aktif — momentum sedang tinggi, manfaatkan')
  if (doneSteps > 0) momentum.push(`${doneSteps}/${totalSteps} GPS step selesai (${progressPct}%) — ada traction`)
  if (depthScore >= 30) momentum.push(`Depth score ${depthScore}% — Diah Anna sudah cukup mengenal user ini`)

  const etaText = etaWeeks
    ? `Estimasi capai target: ~${etaWeeks} minggu dengan konsistensi saat ini`
    : 'Estimasi belum bisa dihitung — user perlu lebih aktif'

  return `# BRAIN 5 — PREDICTION
${etaText}
${risks.length > 0 ? `\nRISIKO:\n${risks.map(r => `- ${r}`).join('\n')}` : ''}
${momentum.length > 0 ? `\nMOMENTUM:\n${momentum.map(m => `- ${m}`).join('\n')}` : ''}

Gunakan prediksi ini untuk proaktif — jangan tunggu user tanya, gunakan sinyal ini untuk mengarahkan percakapan.`
}

const USER_STATE_INSTRUCTIONS = {
  free: `
User ini pakai paket FREE. Tab yang dia punya: Home, Chat, DNA, Profil. Journey dan Peluang belum terbuka.

PERSUASI PREMIUM:
Kamu punya intuisi kapan momen yang tepat untuk hint tentang premium — saat user stuck, saat ada hambatan yang butuh coaching lebih dalam, saat momentum tinggi. Kalau momennya tepat, selipkan 1 kalimat hint yang terasa natural dan genuine di akhir respons. Jangan sebut "upgrade" atau "premium" secara eksplisit — cukup hint bahwa ada yang bisa dieksplorasi lebih dalam bersama.

Kalau kamu melakukan hint itu, tambahkan [UPGRADE] di baris paling terakhir responsmu — setelah semua kalimat selesai, bukan di tengah.
`,
  premium: `
User ini pakai paket PREMIUM. Semua fitur terbuka: Journey, Peluang, CV Review, ATS, Mock Interview. Fokus pada eksekusi dan progress nyata.
`
}

const RESPONSE_FRAMEWORK = `
Sebelum menjawab, kamu wajib memproses framework ini:
1. Target & Emotional Driver user.
2. Progress & Streak kesiapan saat ini.
3. Hambatan terbesar (Current Gap).
4. Menyediakan Next Focus yang clear.

Setiap chat dari kamu harus membawa user satu langkah lebih dekat ke aksi nyata.
`

// ── CV MAKER FORMATS ──────────────────────────────────────────────────────────
const CV_FORMAT_PROMPTS = {
  ats: {
    label: 'ATS Friendly',
    system: `Kamu adalah Diah Anna, career companion Verneks yang juga spesialis menulis CV ATS-friendly. Follow standar parsers industri. Output Markdown langsung tanpa intro.`,
  },
  jobstreet: {
    label: 'JobStreet Friendly',
    system: `Kamu adalah Diah Anna, career companion Verneks yang juga spesialis menulis CV JobStreet Indonesia. Output Markdown langsung tanpa intro.`,
  },
  linkedin: {
    label: 'LinkedIn Profile',
    system: `Kamu adalah Diah Anna, career companion Verneks yang juga spesialis LinkedIn personal branding. Output Markdown langsung dengan label jelas tanpa intro.`,
  },
}


// ── INCOME ENGINE ─────────────────────────────────────────────────────────────
// Implementasi dari spesifikasi "Income Engine" (Phase 6). Kalkulasi
// proyeksi & strategi income sengaja dibuat DETERMINISTIK (JS murni, bukan
// AI) supaya angka yang ditampilkan ke user konsisten dan bisa di-audit —
// AI (generateChat) hanya dipakai untuk percakapan biasa (lewat CORE_PERSONA +
// INCOME_ENGINE_BRAIN di systemContent action 'chat'), bukan untuk itung-itungan rupiah.

// Path template dasar — persentase "potential" terhadap gap (target - current income)
// dan tingkat keberhasilan berdasarkan spesifikasi Income Engine.
function buildIncomePaths(input) {
  const { current_monthly_income, years_in_current_role = 1, has_relevant_skills = true, time_available_hours_per_week = 10, risk_tolerance = 'medium' } = input
  const gap = Math.max(0, input.target_monthly_income - current_monthly_income)
  const paths = []

  // Path 1: Negosiasi gaji — butuh minimal cukup lama di role sekarang
  if (years_in_current_role >= 1) {
    paths.push({
      name: 'Salary Negotiation',
      potential: Math.round(gap * 0.20),
      timeline_months: 1,
      effort: 'low',
      success_rate: 0.60,
      steps: [
        'Riset gaji pasar untuk posisi & levelmu',
        'Dokumentasikan achievement yang measurable',
        'Jadwalkan meeting dengan atasan',
        'Presentasikan kasus negosiasi',
        'Negosiasi sampai capai kesepakatan',
      ],
    })
  }

  // Path 2: Freelance / consulting — butuh skill relevan
  if (has_relevant_skills) {
    paths.push({
      name: 'Freelance/Consulting',
      potential: Math.round(gap * 0.40),
      timeline_months: 3,
      effort: 'high',
      success_rate: 0.70,
      steps: [
        'Setup portfolio',
        'Pilih 2-3 platform (Upwork, Fiverr, komunitas lokal)',
        'Dapatkan 3 klien pertama',
        'Deliver dengan kualitas tinggi',
        'Naikkan rate & jumlah klien bertahap',
      ],
    })
  }

  // Path 3: Side income — selalu tersedia, effort rendah
  paths.push({
    name: 'Side Income',
    potential: Math.round(gap * (time_available_hours_per_week >= 10 ? 0.15 : 0.08)),
    timeline_months: 1,
    effort: 'low',
    success_rate: 0.85,
    steps: [
      'Pilih jenis side income (mengajar, konten, produk kecil)',
      'Bangun presence (media sosial/marketplace)',
      'Dapatkan pelanggan pertama',
      'Jadikan recurring',
    ],
  })

  // Path 4: Product/startup — hanya realistis kalau risk tolerance tinggi & waktu cukup
  if (risk_tolerance === 'high' && time_available_hours_per_week >= 15) {
    paths.push({
      name: 'Product/Startup',
      potential: Math.round(gap * 0.35),
      timeline_months: 9,
      effort: 'very high',
      success_rate: 0.20,
      steps: [
        'Validasi ide produk/digital product',
        'Bangun MVP',
        'Dapatkan early users/customers',
        'Iterasi berdasarkan feedback',
        'Scale monetisasi',
      ],
    })
  }

  return paths
}

// Gabungkan path yang paling efisien (potential tertinggi dibagi timeline &
// effort) sampai gap tertutup atau path habis — implementasi sederhana dari
// combinePathsOptimally() di spesifikasi.
function combinePathsOptimally(paths, gap, timelineMonths) {
  const sorted = [...paths]
    .filter(p => p.timeline_months <= timelineMonths) // buang path yang timeline-nya lebih lama dari target
    .sort((a, b) => (b.potential / b.timeline_months) - (a.potential / a.timeline_months))

  const combined = []
  let covered = 0
  for (const p of sorted) {
    if (covered >= gap) break
    combined.push(p)
    covered += p.potential
  }
  return { combined, totalPotential: covered }
}

function calculateConfidence(combined) {
  if (!combined.length) return 0.3
  const avgSuccess = combined.reduce((sum, p) => sum + p.success_rate, 0) / combined.length
  return Math.round(avgSuccess * 100) / 100
}

// Proyeksi income bulan-per-bulan — step-up begitu path mulai aktif
// (path.timeline_months = bulan ke berapa path itu mulai berkontribusi penuh,
// dengan ramp-up linear dari bulan mulai sampai selesai).
function generateMonthlyProjection(currentIncome, combined, timelineMonths) {
  const projection = []
  for (let month = 1; month <= timelineMonths; month++) {
    let monthIncome = currentIncome
    for (const p of combined) {
      const rampMonths = Math.max(1, p.timeline_months)
      if (month >= 1) {
        const progress = Math.min(1, month / rampMonths)
        monthIncome += Math.round(p.potential * progress)
      }
    }
    projection.push({ month, projected_income: monthIncome })
  }
  return projection
}

function buildIncomeStrategy(input) {
  const currentIncome = input.current_monthly_income
  const targetIncome  = input.target_monthly_income
  const timelineMonths = input.timeline_months || 6
  const gap = Math.max(0, targetIncome - currentIncome)

  if (gap <= 0) {
    return {
      feasibility: 'ALREADY_ACHIEVED',
      confidence: 1,
      recommended_paths: [],
      monthly_projection: [{ month: 0, projected_income: currentIncome }],
      total_projected: currentIncome,
    }
  }

  const paths = buildIncomePaths(input)
  const { combined, totalPotential } = combinePathsOptimally(paths, gap, timelineMonths)
  const confidence = calculateConfidence(combined)
  const totalProjected = currentIncome + totalPotential

  let feasibility = 'NEEDS_ADJUSTMENT'
  if (totalProjected >= targetIncome) feasibility = 'FEASIBLE'
  else if (totalProjected >= targetIncome * 0.8) feasibility = 'CLOSE_TO_TARGET'

  return {
    feasibility,
    confidence,
    recommended_paths: combined,
    monthly_projection: generateMonthlyProjection(currentIncome, combined, timelineMonths),
    total_projected: totalProjected,
  }
}

async function saveIncomeStrategy(userId, inputs, strategy) {
  // Nonaktifkan strategi lama, insert strategi baru sebagai active
  await supabase.from('income_strategies').update({ is_active: false }).eq('user_id', userId).eq('is_active', true)

  const { error: insertError } = await supabase.from('income_strategies').insert({
    user_id: userId,
    current_income: inputs.current_monthly_income,
    target_income: inputs.target_monthly_income,
    timeline_months: inputs.timeline_months,
    feasibility: strategy.feasibility,
    confidence: strategy.confidence,
    recommended_paths: strategy.recommended_paths,
    monthly_projection: strategy.monthly_projection,
    is_active: true,
  })
  if (insertError) console.error('[income-strategy] insert error:', insertError.message)

  await supabase.from('user_career_profiles').update({
    current_monthly_income: inputs.current_monthly_income,
    target_monthly_income: inputs.target_monthly_income,
    income_timeline_months: inputs.timeline_months,
    income_goal_set_at: new Date().toISOString(),
  }).eq('user_id', userId)
}

// Ekstraksi data income dari percakapan 'income-chat' — dipakai supaya Diah
// Anna bisa otomatis hitung strategi TANPA form terpisah, begitu data yang
// dibutuhkan sudah lengkap disebut secara natural dalam obrolan.
const INCOME_EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    current_monthly_income:        { type: ['number', 'null'], description: 'Penghasilan bulanan saat ini dalam Rupiah, hanya jika disebutkan eksplisit' },
    target_monthly_income:         { type: ['number', 'null'], description: 'Target penghasilan bulanan dalam Rupiah, hanya jika disebutkan eksplisit' },
    timeline_months:               { type: ['number', 'null'], description: 'Target jangka waktu dalam bulan' },
    risk_tolerance:                { type: ['string', 'null'], enum: ['low', 'medium', 'high', null] },
    time_available_hours_per_week: { type: ['number', 'null'] },
    ready:                          { type: 'boolean', description: 'true hanya jika current_monthly_income, target_monthly_income, DAN timeline_months semua sudah terisi' },
  },
  required: ['current_monthly_income', 'target_monthly_income', 'timeline_months', 'risk_tolerance', 'time_available_hours_per_week', 'ready'],
}

async function extractIncomeDataFromChat(apiMessages, careerProfile) {
  const convoText = apiMessages.slice(-16).map(m => `${m.role === 'user' ? 'User' : 'Diah Anna'}: ${m.content.slice(0, 300)}`).join('\n')
  const knownIncome = careerProfile?.current_monthly_income || null

  const prompt = `Percakapan income mode:\n${convoText}\n\nData yang sudah tersimpan sebelumnya (kalau ada): income sekarang = ${knownIncome || 'belum diketahui'}.\n\nEkstrak data HANYA jika disebutkan secara eksplisit oleh user (angka rupiah, bukan estimasi kamu). Set field ke null kalau belum disebutkan.`

  try {
    return await generateStructured({
      system: 'Kamu adalah mesin ekstraksi data. Ekstrak HANYA angka yang disebutkan eksplisit oleh user, jangan estimasi atau menebak.',
      prompt,
      schema: INCOME_EXTRACT_SCHEMA,
      maxTokens: 200,
      tier: 'fast',
      plan: 'free',
    })
  } catch (e) {
    console.error('[income-extract] Semua provider gagal:', e.message)
    return { ready: false }
  }
}

async function handleCareerCoach(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action = 'chat' } = req.body

  // [PARSING & DATA MANAGEMENT ACTIONS]
  if (action === 'parse-cv') {
    const { base64, fileName } = req.body
    if (!base64) return res.status(400).json({ error: 'File tidak ditemukan.' })
    try {
      const buffer = Buffer.from(base64, 'base64')
      const ext = (fileName || '').toLowerCase().split('.').pop()
      if (ext === 'docx') {
        const mammoth = await import('mammoth')
        const { value } = await mammoth.extractRawText({ buffer })
        return res.status(200).json({ text: value.trim() })
      }
      if (ext === 'pdf') {
        const pdfParse = (await import('pdf-parse')).default
        const data = await pdfParse(buffer)
        return res.status(200).json({ text: data.text.trim() })
      }
      return res.status(400).json({ error: 'Format tidak didukung. Gunakan PDF atau DOCX.' })
    } catch (error) {
      console.error('[parse-cv] error:', error)
      return res.status(500).json({ error: 'Gagal membaca file.' })
    }
  }

  if (action === 'cv-review') {
    const { cvText, jobTarget, userId } = req.body
    if (!cvText || cvText.trim().length < 50) return res.status(400).json({ error: 'CV terlalu pendek.' })
    const plan = await getRealPlan(userId)
    const usage = await checkAndLogUsage(userId, plan, 'cv-review')
    if (!usage.allowed) return res.status(403).json({ error: 'Kuota CV Review habis.', limitReached: true })
    try {
      const review = await generateText({
        system: `${CORE_PERSONA}\nMereview CV dengan format ringkas tepat sasaran, tanpa kalimat pembuka generik.`,
        prompt: `${jobTarget ? `Target posisi: ${jobTarget}\n\n` : ''}Ini CV saya:\n\n${cvText.slice(0, 4000)}`,
        maxTokens: 700,
        tier: 'smart',
        plan,
      })
      return res.status(200).json({ review })
    } catch (error) {
      return res.status(500).json({ error: 'Diah Anna lagi sibuk, coba lagi ya!' })
    }
  }

  if (action === 'ats') {
    const { cvText, jobDescription, userId } = req.body
    if (!cvText || cvText.trim().length < 50) return res.status(400).json({ error: 'CV terlalu pendek.' })
    const plan = await getRealPlan(userId)
    const usage = await checkAndLogUsage(userId, plan, 'ats')
    if (!usage.allowed) return res.status(403).json({ error: 'Kuota ATS Checker habis.', limitReached: true })
    try {
      const result = await generateText({
        system: `${CORE_PERSONA}\nAnalisis kedekatan kecocokan dokumen dengan ATS template system.`,
        prompt: `${jobDescription ? `Job Description Target:\n${jobDescription}\n\n` : ''}CV saya:\n\n${cvText.slice(0, 4000)}`,
        maxTokens: 1000,
        tier: 'smart',
        plan,
      })
      return res.status(200).json({ result })
    } catch (error) {
      return res.status(500).json({ error: 'Diah Anna lagi sibuk!' })
    }
  }

  if (action === 'mock-interview') {
    const { subAction, position, level, messages, questionNumber, totalQuestions = 6, userId } = req.body
    const interviewPersona = `Kamu adalah Diah Anna, Companion Verneks melakukan interview simulasi. Proaktif dan evaluatif.`
    try {
      if (subAction === 'start') {
        const plan = await getRealPlan(userId)
        const usage = await checkAndLogUsage(userId, plan, 'interview')
        if (!usage.allowed) return res.status(403).json({ error: 'Kuota habis.', limitReached: true })
        const reply = await generateText({
          system: interviewPersona,
          prompt: `Mulai mock interview untuk posisi ${position} level ${level}. Ajukan Pertanyaan 1 secara langsung.`,
          maxTokens: 300,
          tier: 'fast',
          plan,
        })
        return res.status(200).json({ reply, questionNumber: 1 })
      }
      if (subAction === 'answer') {
        const plan = await getRealPlan(userId)
        const isLastQuestion = questionNumber >= totalQuestions
        const nextAction = isLastQuestion ? `Evaluasi final.` : `Berikan feedback ringkas lalu berikan Pertanyaan ${questionNumber + 1}`
        const reply = await generateChat({
          system: `${interviewPersona} Posisi: ${position}, Level: ${level}.`,
          messages: [...(messages || []), { role: 'user', content: nextAction }],
          maxTokens: 350,
          tier: 'fast',
          plan,
        })
        return res.status(200).json({ reply, questionNumber: questionNumber + 1, isComplete: isLastQuestion })
      }
      // Feedback handler
      return res.status(400).json({ error: 'subAction tidak valid.' })
    } catch (error) {
       return res.status(500).json({ error: 'Terjadi kendala interview.' })
    }
  }

  if (action === 'cv-maker') {
    const { mode, format, cvText, formData, jobTarget, userId } = req.body
    if (!format || !CV_FORMAT_PROMPTS[format]) return res.status(400).json({ error: 'Format tidak valid.' })
    const plan = await getRealPlan(userId)
    const usage = await checkAndLogUsage(userId, plan, 'cv-maker')
    if (!usage.allowed) return res.status(403).json({ error: 'Kuota habis.', limitReached: true })
    try {
      const fmt = CV_FORMAT_PROMPTS[format]
      let prompt = mode === 'optimize' 
        ? `Optimasi CV berikut menjadi format ${fmt.label}:\n\n${cvText.slice(0, 4000)}`
        : `Buat CV dari data mentah: ${JSON.stringify(formData)}`;
      const result = await generateText({ system: fmt.system, prompt, maxTokens: 1500, tier: 'smart', plan })
      return res.status(200).json({ result })
    } catch (error) {
      return res.status(500).json({ error: 'Gagal membuat CV.' })
    }
  }

  if (action === 'save-session-note') {
    const { userId, messages: sessionMsgs } = req.body
    if (!userId || !sessionMsgs?.length) return res.status(200).json({ skipped: true })
    if (sessionMsgs.filter(m => m.role === 'user').length < 2) return res.status(200).json({ skipped: true })
    try {
      const conversationText = sessionMsgs.map(m => `${m.role === 'user' ? 'User' : 'Diah Anna'}: ${m.content || m.text || ''}`).join('\n').slice(0, 3000)

      const summary = await generateText({
        system: `Meringkas esensi obrolan coaching Diah Anna ke dalam 1-2 kalimat deskriptif aksi. Tanpa preamble.`,
        prompt: conversationText,
        maxTokens: 120,
        tier: 'fast',
      })
      await supabase.from('user_session_notes').insert({ user_id: userId, summary: summary.trim() })

      // Ini yang bikin "misi harian" Diah Anna beneran hidup — sebelumnya
      // tabel dashboard_missions cuma DIBACA (dipakai bikin sapaan "gimana
      // progres X yang kita sepakati kemarin") tapi TIDAK PERNAH DITULIS,
      // jadi selalu kosong. Sekarang tiap sesi selesai, AI coba cari 1 aksi
      // kecil konkret dari obrolan — kalau ada, itu jadi misi aktif
      // berikutnya; kalau obrolannya reflektif/emosional tanpa aksi natural,
      // AI balas "NONE" dan tidak ada misi baru dipaksakan.
      try {
        const missionText = await generateText({
          system: `Kamu Diah Anna, AI career coach. Dari obrolan ini, cek apakah ada SATU aksi kecil konkret yang bisa user kerjakan sebelum ngobrol lagi (contoh: kirim pesan ke kontak tertentu, update 1 bagian CV, riset 1 hal, coba 1 langkah dari roadmap). Kalau ada, balas HANYA dengan kalimat aksinya (maks 15 kata, tanpa embel-embel/tanda kutip). Kalau obrolannya reflektif/emosional dan tidak ada aksi konkret yang natural, balas PERSIS: NONE`,
          prompt: conversationText,
          maxTokens: 40,
          tier: 'fast',
        })
        const cleaned = missionText?.trim().replace(/^"|"$/g, '')
        if (cleaned && cleaned.toUpperCase() !== 'NONE') {
          // Selesaikan misi aktif sebelumnya (kalau ada) sebelum pasang yang baru
          await supabase.from('dashboard_missions').update({ status: 'completed' }).eq('user_id', userId).eq('status', 'active')
          await supabase.from('dashboard_missions').insert({ user_id: userId, daily_mission: cleaned, status: 'active' })
        }
      } catch (missionErr) {
        console.error('[save-session-note mission generation failed]', missionErr)
      }

      return res.status(200).json({ success: true })
    } catch (error) {
      return res.status(200).json({ skipped: true })
    }
  }

  if (action === 'toggle-milestone') {
    const { userId, stepIndex, done } = req.body
    if (!userId || stepIndex == null) return res.status(400).json({ error: 'Data tidak lengkap.' })
    try {
      const { data: profile } = await supabase.from('user_career_profiles').select('gps_steps, nama').eq('user_id', userId).maybeSingle()
      const steps = profile?.gps_steps || []
      if (!steps[stepIndex]) return res.status(400).json({ error: 'Step tidak ditemukan.' })
      steps[stepIndex] = { ...steps[stepIndex], done }
      await supabase.from('user_career_profiles').update({ gps_steps: steps, last_updated: new Date().toISOString() }).eq('user_id', userId)
      if (done) {
        await supabase.from('career_events').insert({ user_id: userId, event_type: 'milestone_completed', event_payload: { title: steps[stepIndex].title, step_index: stepIndex } })
        // Push instan — dikirim langsung saat itu juga, bukan nunggu cron,
        // supaya momentum positif user langsung direspons Diah Anna. Dibungkus
        // try/catch sendiri: kalau push gagal (token tidak ada/Firebase down),
        // toggle milestone-nya tetap harus sukses buat user.
        try {
          const fcmToken = await getUserFcmToken(userId)
          if (fcmToken) await sendMilestoneCompletePush(fcmToken, profile?.nama || 'Teman', steps[stepIndex].title)
        } catch (pushErr) {
          console.error('[toggle-milestone push failed]', pushErr)
        }
      }
      return res.status(200).json({ success: true, steps })
    } catch (error) {
      return res.status(500).json({ error: 'Gagal update milestone.' })
    }
  }

  // ════════════════════════════════════════════
  // ACTION: INCOME ENGINE — GENERATE STRATEGY
  // ════════════════════════════════════════════
  if (action === 'income-strategy') {
    const {
      userId,
      current_monthly_income,
      target_monthly_income,
      timeline_months = 6,
      risk_tolerance = 'medium',
      time_available_hours_per_week = 10,
      years_in_current_role = 1,
      has_relevant_skills = true,
    } = req.body

    if (!userId) return res.status(400).json({ error: 'userId wajib diisi.' })
    if (!current_monthly_income || !target_monthly_income) {
      return res.status(400).json({ error: 'current_monthly_income dan target_monthly_income wajib diisi.' })
    }

    const plan = await getRealPlan(userId)
    const usage = await checkAndLogUsage(userId, plan, 'income-strategy')
    if (!usage.allowed) return res.status(403).json({ error: 'Kuota Income Strategy habis. Upgrade ke Premium untuk generate ulang kapan saja.', limitReached: true })

    try {
      const inputs = {
        current_monthly_income,
        target_monthly_income,
        timeline_months,
        risk_tolerance,
        time_available_hours_per_week,
        years_in_current_role,
        has_relevant_skills,
      }
      const strategy = buildIncomeStrategy(inputs)
      await saveIncomeStrategy(userId, inputs, strategy)
      return res.status(200).json({ success: true, strategy })
    } catch (error) {
      console.error('[income-strategy] error:', error.message)
      return res.status(500).json({ error: 'Gagal menghitung strategi income.' })
    }
  }

  // ════════════════════════════════════════════
  // ACTION: INCOME ENGINE — TRACK ACTUAL INCOME (bulanan)
  // ════════════════════════════════════════════
  if (action === 'income-track-update') {
    const { userId, month, actual_main_job = 0, actual_freelance = 0, actual_side_income = 0, actual_other = 0 } = req.body
    if (!userId || !month) return res.status(400).json({ error: 'userId dan month wajib diisi.' })

    try {
      const { data: activeStrategy } = await supabase
        .from('income_strategies').select('monthly_projection')
        .eq('user_id', userId).eq('is_active', true).maybeSingle()

      const monthNum = new Date(month).getMonth() + 1
      const projectedEntry = activeStrategy?.monthly_projection?.find(m => m.month === monthNum)
      const projectedIncome = projectedEntry?.projected_income || null

      const actualTotal = actual_main_job + actual_freelance + actual_side_income + actual_other
      const variancePct = projectedIncome ? Math.round(((actualTotal - projectedIncome) / projectedIncome) * 10000) / 100 : null

      const { error } = await supabase.from('income_tracking').upsert({
        user_id: userId,
        month,
        projected_income: projectedIncome,
        actual_main_job,
        actual_freelance,
        actual_side_income,
        actual_other,
        variance_pct: variancePct,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,month' })

      if (error) return res.status(500).json({ error: error.message })

      const behindProjection = variancePct !== null && variancePct < -10
      return res.status(200).json({
        success: true,
        actual_total: actualTotal,
        projected_income: projectedIncome,
        variance_pct: variancePct,
        behind_projection: behindProjection,
      })
    } catch (error) {
      console.error('[income-track-update] error:', error.message)
      return res.status(500).json({ error: 'Gagal update tracking income.' })
    }
  }

  // ════════════════════════════════════════════
  // FETCH BASE MEMORY DATA & SUBSCRIPTION CHECK
  // ════════════════════════════════════════════
  const { userId } = req.body
  const plan = await getRealPlan(userId)

  let careerProfile = null
  let growthState   = null
  let genomeData    = null
  let sessionNotes  = []
  let recentMilestones = []
  let activeDashboardMission = null
  let learnedPatterns = []      // [RSI] Pola yang sudah dipelajari AI
  let rsiVersion = 1            // [RSI] Versi model mental AI tentang user

  if (userId) {
    try {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

      const [profileRes, growthRes, genomeRes, capsuleRes, eventsRes, dashboardRes, patternsRes] = await Promise.all([
        supabase.from('user_career_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_growth_state').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_genome_scores').select('*').eq('user_id', userId).maybeSingle(),
        // Ambil capsule kemarin saja (bukan semua history) — hemat token
        supabase.from('memory_capsule_log').select('capsule_text, capsule_date').eq('user_id', userId).eq('capsule_date', yesterday).maybeSingle(),
        supabase.from('career_events').select('event_type, event_payload, created_at').eq('user_id', userId).eq('event_type', 'milestone_completed').order('created_at', { ascending: false }).limit(3),
        supabase.from('dashboard_missions').select('*').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        // [RSI] Ambil pola yang sudah dipelajari
        supabase.from('ai_learned_patterns').select('id, pattern_category, pattern_description, confidence_score, occurrence_count, last_observed_at').eq('user_id', userId).order('confidence_score', { ascending: false }).limit(10),
      ])

      careerProfile          = profileRes.data
      growthState            = growthRes.data
      genomeData             = genomeRes.data
      sessionNotes           = capsuleRes.data ? [{ summary: capsuleRes.data.capsule_text }] : []
      recentMilestones       = eventsRes.data || []
      activeDashboardMission = dashboardRes.data
      learnedPatterns        = patternsRes.data || []
      rsiVersion             = careerProfile?.rsi_version || 1
    } catch (e) {
      console.error('[career-coach] load error:', e.message)
    }
  }

  const GENOME_LABELS = { analytical: 'Analytical', leadership: 'Leadership', builder: 'Builder', creator: 'Creator', communication: 'Communication', risk_taking: 'Risk Taking' }
  const topGenomeDimensions = genomeData
    ? Object.entries(GENOME_LABELS)
        .map(([k, label]) => ({ label, val: genomeData[k] || 0 }))
        .sort((a, b) => b.val - a.val)
        .filter(g => g.val > 0)
        .slice(0, 3)
        .map(g => `${g.label} (${g.val})`)
        .join(', ')
    : 'Belum teranalisis'

  const rawSkillGaps = careerProfile?.skill_gaps
  const skillGapsArr = Array.isArray(rawSkillGaps) ? rawSkillGaps : (rawSkillGaps && typeof rawSkillGaps === 'object' ? Object.values(rawSkillGaps) : [])
  const gpsSteps = growthState?.gps_steps || careerProfile?.gps_steps || []

  // Normalisasi data memori murni untuk Next Focus Engine
  const structuralMemory = {
    name: careerProfile?.nama || 'Rekan',
    target_position: careerProfile?.target_posisi || 'Belum ditentukan',
    target_reason: careerProfile?.target_reason || careerProfile?.motivasi || 'Belum diketahui',
    current_focus: growthState?.current_focus || careerProfile?.current_focus,
    skill_gaps: skillGapsArr,
    next_milestone: growthState?.next_milestone || careerProfile?.next_milestone,
    gps_steps: gpsSteps,
    streak_days: growthState?.streak_days || 0,
    progress_percentage: growthState?.progress_percent || careerProfile?.career_readiness || 0,
    // FIX: running_insight ditulis oleh weekly-review.js ke user_career_profiles,
    // BUKAN ke user_growth_state. Sumber lama (growthState) selalu null.
    running_insight: careerProfile?.running_insight || null
  }

  // [RSI] Format pola yang dipelajari menjadi konteks untuk AI
  const rsiPatternsBlock = learnedPatterns.length > 0 ? `
# POLA YANG SUDAH AKU PELAJARI TENTANG KAMU (RSI v${rsiVersion})
${learnedPatterns.map((p, i) => `${i + 1}. ${p.pattern_category}: ${p.pattern_description} (Keyakinan: ${p.confidence_score}%, muncul ${p.occurrence_count}x)`).join('\n')}
` : ''

  // ════════════════════════════════════════════
  // ACTION: INIT CHAT (GENERASI PROACTIVE GREETING V2)
  // ════════════════════════════════════════════
  if (action === 'init-chat') {
    try {
      const coaching = generateDailyCoaching(structuralMemory, activeDashboardMission);

      let openingMessage = `Halo ${structuralMemory.name} 👋\n\n`;
      openingMessage += `Aku masih ingat tujuan besarmu:\n${structuralMemory.target_position}.\n`;
      // FIX: target_reason (emotional driver dari onboarding) sekarang ikut ditampilkan,
      // sebelumnya dikumpulkan tapi tidak pernah dipakai di greeting.
      if (structuralMemory.target_reason && structuralMemory.target_reason !== 'Belum diketahui') {
        openingMessage += `Karena ${structuralMemory.target_reason}.\n`;
      }
      openingMessage += `\n`;
      openingMessage += `🔥 Kamu sudah konsisten selama ${structuralMemory.streak_days} hari.\n`;
      openingMessage += `📈 Progress kesiapanmu saat ini ${structuralMemory.progress_percentage}%.\n\n`;
      openingMessage += `🎯 Fokus terpenting saat ini:\n${coaching.daily_focus}.\n\n`;
      openingMessage += `${coaching.daily_reason}\n\n`;

      if (structuralMemory.running_insight) {
        openingMessage += `💡 Yang aku pelajari tentangmu:\n${structuralMemory.running_insight}\n\n`;
      }

      // FIX: sebelumnya ada popup Onboarding terpisah buat nanya "situasi
      // income" ke user lama yang belum pernah ditanya (profile mereka
      // dibuat sebelum field ini ada). Sekarang dipindah ke sini — Diah
      // Anna nanya natural di greeting harian, sekali saja, bukan lewat
      // form/popup terpisah yang kerasa lepas dari alur ngobrol biasa.
      if (!careerProfile?.income_situation) {
        openingMessage += `Btw, sebelum lanjut — boleh aku tanya satu hal? Situasi kamu sekarang lebih ke: udah punya penghasilan tetap tapi pengen nambah, belum punya penghasilan tetap, atau karier sekarang kurang menjamin dan pengen ganti arah?`;
      } else {
        openingMessage += `${coaching.daily_question}`;
      }

      return res.status(200).json({ success: true, openingMessage });
    } catch (error) {
      console.error('[init-chat] error:', error);
      return res.status(500).json({ error: 'Gagal inisialisasi panduan Diah Anna.' });
    }
  }

  // ════════════════════════════════════════════
  // ACTION: CHAT (DEFAULT PROCESSOR)
  // ════════════════════════════════════════════
  const { messages: rawMessages } = req.body
  
  // [OPTIMIZATION #3] Compress conversation history — hemat token
  const compressedMessages = compressConversationHistory(rawMessages || [], 8)
  const messages = compressedMessages.slice(-12)

  if (!messages?.length) return res.status(400).json({ error: 'Pesan tidak boleh kosong.' })

  const usage = await checkAndLogUsage(userId, plan, 'chat')
  if (!usage.allowed) return res.status(403).json({ error: 'Kuota chat hari ini sudah habis.', limitReached: true })

  // [OPTIMIZATION #1] Check cache for duplicate questions — hemat ~30%
  const currentUserMsg = messages[messages.length - 1]?.content || ''
  const msgHash = hashMessage(currentUserMsg)
  const cachedResponse = getCachedResponse(msgHash)
  
  if (cachedResponse) {
    console.log('[OPTIMIZATION] Cache hit — skip AI call')
    return res.status(200).json({ reply: cachedResponse, cached: true })
  }

  // [OPTIMIZATION #2] Rule-based response fallback — hemat ~25%
  const ruleBasedResponse = matchRuleBasedResponse(currentUserMsg, careerProfile)
  if (ruleBasedResponse) {
    console.log('[OPTIMIZATION] Rule-based response matched — skip AI call')
    setCachedResponse(msgHash, ruleBasedResponse)
    return res.status(200).json({ reply: ruleBasedResponse, ruleBased: true })
  }

  // ── Deep memory blocks (dari update-memory.js) ───────────────────────────
  const diahAnnaMemory   = careerProfile?.diah_anna_memory   || null
  const userDepthProfile = careerProfile?.user_depth_profile || {}
  const depthScore       = careerProfile?.depth_score        || 0

  const deepMemoryBlock = diahAnnaMemory ? `
# APA YANG KAMU INGAT TENTANG USER INI
${diahAnnaMemory}
` : ''

  const depthProfileBlock = depthScore > 0 ? `
# POLA MENDALAM USER (depth score: ${depthScore}/100)
Gaya coaching yang cocok: ${userDepthProfile.coach_style_fit || 'belum terdeteksi'}
Kondisi emosi terakhir: ${userDepthProfile.last_emotional_state || 'tidak diketahui'}
Yang memotivasi: ${(userDepthProfile.emotional_triggers?.motivators || []).join(', ') || '-'}
Yang menghambat: ${(userDepthProfile.emotional_triggers?.blockers || []).join(', ') || '-'}
Tema berulang: ${(userDepthProfile.recurring_themes || []).join(', ') || '-'}
` : ''

  const memoryContext = `
# MEMORY CONTEXT (Data Real-time User)
Nama: ${structuralMemory.name}
Target Karier: ${structuralMemory.target_position}
Alasan Emosional/Motivasi: ${structuralMemory.target_reason}
Posisi Saat Ini: ${careerProfile?.posisi_saat_ini || 'Belum ditentukan'}
Situasi Income: ${{ belum_penghasilan: 'Belum punya penghasilan tetap — prioritas: dapat kerja/income secepatnya', nambah_penghasilan: 'Sudah kerja, mau nambah penghasilan — prioritas: gap analysis & cara naikkan gaji', ganti_arah: 'Karier sekarang kurang menjamin — prioritas: opsi switch karier yang lebih stabil' }[careerProfile?.income_situation] || 'Belum diketahui'}
Industri: ${careerProfile?.industri || 'Belum ditentukan'}
Hambatan Utama: ${careerProfile?.hambatan || 'Belum ditentukan'}
Skill Gap Utama: ${structuralMemory.skill_gaps.join(', ') || 'Belum terdeteksi'}
Career Readiness: ${structuralMemory.progress_percentage}%
Current Focus: ${structuralMemory.current_focus || 'Belum ditentukan'}
Next Milestone: ${structuralMemory.next_milestone || 'Belum ditentukan'}
Top Genome Dimensions: ${topGenomeDimensions}
${sessionNotes.length > 0 ? `\nCatatan Sesi Sebelumnya:\n${sessionNotes.map(n => `- ${n.summary}`).join('\n')}` : ''}
${recentMilestones.length > 0 ? `\nMilestone Baru Diselesaikan:\n${recentMilestones.map(m => `- ${m.event_payload?.title}`).join('\n')}` : ''}
${deepMemoryBlock}${depthProfileBlock}${rsiPatternsBlock}`

  try {
    const systemContent = `
${CORE_PERSONA}

${COACHING_BRAIN}

${STRATEGY_BRAIN(
  growthState?.career_stage || careerProfile?.career_stage || 'Career Builder',
  structuralMemory.gps_steps,
  structuralMemory.current_focus,
  structuralMemory.next_milestone,
  careerProfile?.last_updated
)}

${INCOME_ENGINE_BRAIN(careerProfile)}

${PREDICTION_BRAIN(
  careerProfile?.career_readiness || growthState?.progress_percent || 0,
  depthScore,
  careerProfile?.last_updated,
  structuralMemory.gps_steps,
  plan
)}

# PLAN USER SAAT INI: ${plan === 'premium' ? 'PREMIUM — punya akses Journey, Peluang, semua fitur' : 'FREE — hanya punya tab Home, Chat, DNA, Profil. Belum punya akses Journey dan Peluang.'}

${memoryContext}

# USER STATE
${plan === 'premium' ? USER_STATE_INSTRUCTIONS.premium : USER_STATE_INSTRUCTIONS.free}

${RESPONSE_FRAMEWORK}

PENTING: Integrasikan seluruh fakta memori di atas secara mengalir tanpa menggunakan kalimat template kaku. JANGAN beralih menjadi pasif atau melemparkan kendali obrolan kembali kepada user tanpa memberikan value tindakan/opini yang solid.
${diahAnnaMemory ? `\nKamu sudah mengenal user ini dengan baik (depth score: ${depthScore}/100). Gunakan pengetahuan personalmu tentang mereka — cara komunikasi mereka, apa yang memotivasi dan menghambat mereka — untuk membuat respons terasa seperti dari seseorang yang benar-benar mengenal mereka, bukan AI generik.` : ''}
${learnedPatterns.length > 0 ? `\n\n[RSI ACTIVE] Kamu sudah belajar dari ${learnedPatterns.length} pola perilaku user ini. Gunakan wawasan ini untuk menyesuaikan gaya komunikasimu. Versi model mentalmu tentang user ini adalah v${rsiVersion}.` : ''}
`

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX #1: SMART TIER ROUTING — Hemat 40-50% cost untuk free users
    // Routing dinamis: gunakan Haiku (cheap) untuk short convos, Sonnet untuk complex
    // ═══════════════════════════════════════════════════════════════════════════
    const shouldUseSmart = 
      messages.length > 10 ||  // Very long conversation = butuh context + nuance
      /bingung|stuck|dilema|keputusan|sulit|ragu|ambiguous|complicated|depresi|ansietas/i.test(messages[messages.length-1]?.content || '') ||  // High emotional complexity only
      depthScore > 75         // Only well-known users with high trust get smart tier
    
    const optimalTier = shouldUseSmart ? 'smart' : 'fast'
    
    const rawReply = await generateChat({
      system: systemContent,
      messages,
      maxTokens: 900,  // Increased from 700 to prevent truncation for long responses
      tier: optimalTier,
      plan,
    })

    // Strip semua varian marker persuasi
    const persuasiAktif = /\[UPGRADE\]|\[PERSUASI_AKTI[FV]\]/i.test(rawReply)
    const reply = rawReply.replace(/\[UPGRADE\]|\[PERSUASI_AKTI[FV]\]/gi, '').trim()

    // [OPTIMIZATION #5] Cache AI response for future duplicate questions
    setCachedResponse(msgHash, reply)

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX #2: RSI SMART SAMPLING — Hemat 60-70% dari RSI API calls
    // Hanya analyze kalau ada signal meaningful (emotional trigger, decision point, dll)
    // ═══════════════════════════════════════════════════════════════════════════
    const userMsgCount = messages.filter(m => m.role === 'user').length
    
    // Detect meaningful signals dalam pesan user
    const hasEmotionalSignal = /bingung|stuck|tidak tahu|ga yakin|ragu|susah|dilema|ambiguous|hambatan|masalah|keputusan|pilih|gimana|sebaiknya/i.test(currentUserMsg)
    
    // [OPTIMIZATION #6] RSI ON-DEMAND ONLY — hanya trigger untuk breakthrough moments
    // Tidak lagi automatic setiap 5 pesan, hanya saat ada emotional signal ATAU conversation sangat panjang
    if (userId && messages.length >= 6 && (hasEmotionalSignal || userMsgCount % 8 === 0)) {
      analyzeAndLearnPatterns(userId, messages, rawReply, careerProfile, learnedPatterns, rsiVersion, supabase).catch(e =>
        console.error('[RSI] Background analysis error:', e.message)
      )
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INCOME ENGINE — deteksi otomatis dari kata kunci, TANPA mode/tombol terpisah.
    // Hanya jalan kalau topik income memang muncul di pesan user terkini, supaya
    // tidak nge-boost cost AI di percakapan yang tidak relevan.
    // ═══════════════════════════════════════════════════════════════════════════
    let strategy = null
    let strategyLimitReached = false
    const incomeKeywordRegex = /gaji|income|penghasilan|pendapatan|pemasukan|freelance|side\s*income|sampingan|naik\s*gaji|resign|switch\s*kerja|\bcuan\b|\bjuta\b.{0,10}bulan|target.{0,15}(uang|penghasilan|pendapatan)/i
    const recentUserText = messages.filter(m => m.role === 'user').slice(-3).map(m => m.content || '').join(' ')

    if (incomeKeywordRegex.test(recentUserText)) {
      try {
        const extracted = await extractIncomeDataFromChat(messages, careerProfile)
        const currentIncome = extracted.current_monthly_income || careerProfile?.current_monthly_income
        const targetIncome  = extracted.target_monthly_income  || careerProfile?.target_monthly_income

        if (extracted.ready && currentIncome && targetIncome) {
          const strategyUsage = await checkAndLogUsage(userId, plan, 'income-strategy')
          if (!strategyUsage.allowed) {
            strategyLimitReached = true
          } else {
            // Genome-informed defaults — tidak perlu tanya ulang skill user.
            const hasRelevantSkills = (careerProfile?.career_readiness || 0) >= 40 || structuralMemory.skill_gaps.length <= 2
            const yearsInRole = careerProfile?.posisi_saat_ini ? 2 : 1

            const inputs = {
              current_monthly_income: currentIncome,
              target_monthly_income: targetIncome,
              timeline_months: extracted.timeline_months || 6,
              risk_tolerance: extracted.risk_tolerance || 'medium',
              time_available_hours_per_week: extracted.time_available_hours_per_week || 10,
              years_in_current_role: yearsInRole,
              has_relevant_skills: hasRelevantSkills,
            }
            strategy = buildIncomeStrategy(inputs)
            await saveIncomeStrategy(userId, inputs, strategy)
          }
        }
      } catch (e) {
        console.error('[income-auto] error:', e.message)
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // KLASIFIKASI SITUASI INCOME DARI CHAT — pengganti popup Onboarding lama.
    // Diah Anna sudah nanya soal ini natural di greeting harian (init-chat)
    // kalau income_situation masih kosong. Begitu user balas apapun, coba
    // klasifikasikan dari jawaban itu — non-blocking, tidak nunda balasan
    // Diah Anna ke user.
    // ═══════════════════════════════════════════════════════════════════════
    if (userId && !careerProfile?.income_situation) {
      classifyIncomeSituation(userId, messages, supabase).catch(e =>
        console.error('[income-situation-classify] error:', e.message)
      )
    }

    return res.status(200).json({ reply, persuasiAktif, strategy, strategyLimitReached })
  } catch (error) {
    console.error('[career-coach] chat error:', error)
    return res.status(500).json({ error: 'Diah Anna lagi bersiap, tunggu sebentar ya!' })
  }
}

/**
 * Coba klasifikasikan income_situation dari beberapa pesan terakhir chat.
 * Dipanggil tiap giliran SELAMA income_situation masih kosong — begitu
 * berhasil diklasifikasi dengan yakin, langsung disimpan dan berhenti
 * dipanggil lagi (karena career-coach.js cuma masuk blok ini kalau field-nya
 * masih null).
 */
async function classifyIncomeSituation(userId, messages, supabase) {
  const recentText = messages.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Diah Anna'}: ${(m.content || '').slice(0, 300)}`).join('\n')

  const schema = {
    type: 'object',
    properties: {
      income_situation: {
        type: 'string',
        enum: ['belum_penghasilan', 'nambah_penghasilan', 'ganti_arah', 'belum_jelas'],
        description: 'belum_jelas kalau dari percakapan ini belum cukup informasi untuk yakin — JANGAN menebak paksa.',
      },
    },
    required: ['income_situation'],
  }

  let result
  try {
    result = await generateStructured({
      system: 'Kamu mesin klasifikasi. Baca percakapan, tentukan situasi income user: belum_penghasilan (belum punya penghasilan tetap, butuh kerja/income), nambah_penghasilan (sudah kerja, mau nambah penghasilan), ganti_arah (sudah punya karier tapi kurang menjamin/mau ganti arah), atau belum_jelas kalau memang belum cukup jelas dari percakapan.',
      prompt: recentText,
      schema,
      maxTokens: 40, tier: 'fast', plan: 'free',
    })
  } catch (e) {
    console.error('[classifyIncomeSituation] AI gagal:', e.message)
    return
  }

  if (!result?.income_situation || result.income_situation === 'belum_jelas') return

  const { error } = await supabase
    .from('user_career_profiles')
    .update({ income_situation: result.income_situation })
    .eq('user_id', userId)
  if (error) console.error('[classifyIncomeSituation] save gagal:', error.message)
}


// ═══════════════════════════════════════════════════════════════════════════
// ══════════════════════ HANDLER: CHAT-HISTORY ═══════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
async function handleChatHistory(req, res) {
  // Allow CORS untuk sendBeacon
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    // Parse body — sendBeacon kirim sebagai text/plain kadang
    let body = req.body
    if (typeof body === 'string') {
      try { body = JSON.parse(body) } catch { body = {} }
    }

    // Parse query params — req.query kadang kosong di Vercel, fallback ke URL manual
    let query = req.query || {}
    if (!query.userId && req.url) {
      const urlObj = new URL(req.url, 'https://verneks.my.id')
      query = Object.fromEntries(urlObj.searchParams.entries())
    }

    const isGet   = req.method === 'GET'
    const userId  = isGet ? query.userId   : body?.userId
    const date    = isGet ? query.date     : body?.date
    const messages = isGet ? null          : body?.messages

    const daysBack = isGet ? (query.daysBack || 1) : null

    if (!userId) return res.status(400).json({ error: 'userId required' })

    // ── GET: load history hari ini ──────────────────────────
    if (isGet) {
      const today = new Date().toISOString().slice(0, 10)

      const { data, error } = await supabase
        .from('user_chat_history')
        .select('session_date, messages')
        .eq('user_id', userId)
        .eq('session_date', today)
        .maybeSingle()

      if (error) {
        console.error('[chat-history GET] error:', error.message, error.code)
        return res.status(500).json({ error: error.message, code: error.code })
      }

      return res.status(200).json({
        today: data?.messages || [],
      })
    }

    // ── POST: upsert history hari ini ──────────────────────
    if (req.method === 'POST') {
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages array required' })
      }

      const sessionDate = date || new Date().toISOString().slice(0, 10)

      const { error } = await supabase
        .from('user_chat_history')
        .upsert({
          user_id:      userId,
          session_date: sessionDate,
          messages:     messages.slice(-50),
          updated_at:   new Date().toISOString(),
        }, { onConflict: 'user_id,session_date' })

      if (error) {
        console.error('[chat-history POST] error:', error.message, error.code, error.details)
        return res.status(500).json({ error: error.message, code: error.code })
      }

      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })

  } catch (err) {
    console.error('[chat-history] unexpected error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// ══════════════════════ HANDLER: DISCOVERY-COACH ════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// ── BRAIN DISCOVERY — sebelumnya hilang (bug: `DISCOVERY_SYSTEM` dipanggil
// tanpa pernah didefinisikan, kemungkinan besar tertinggal saat merge dari
// file `discovery-coach.js` yang asli). Didesain supaya SELARAS dengan janji
// landing page ("Belum perlu CV. Belum perlu tes. Cukup mulai bercerita." /
// "Ia akan mendengarkan... melihat pola") DAN menjawab konteks nyata banyak
// user Verneks saat ini: kena PHK atau susah dapat kerja, butuh titik terang
// cepat — bukan cuma "temukan passion" jangka panjang.
const DISCOVERY_SYSTEM = `
Kamu Diah Anna — AI Career Companion Verneks. Ini SESI DISCOVERY: obrolan pembuka sebelum user melihat Career DNA-nya untuk pertama kali.

CARA BICARA: sama seperti Diah Anna biasanya — 2-3 kalimat per respons, santai kayak chat WhatsApp dari teman senior. TIDAK ADA bullet/heading/format kaku. Satu pertanyaan reflektif per respons, bukan checklist atau pilihan ganda — ini obrolan, bukan tes.

TUJUANMU dalam percakapan ini — gali secara natural (ikuti arah cerita user, jangan interogasi urutan tetap):
1. Situasi user SEKARANG: masih kerja, baru kena PHK, fresh graduate, career switcher, atau sudah lama menganggur.
1b. Selipkan secara natural (bukan pertanyaan pilihan ganda kaku) di 1-2 pertanyaan pertama: apakah user ini (a) belum punya penghasilan tetap dan butuh kerja/income, (b) sudah kerja tapi mau nambah penghasilan, atau (c) sudah punya karier tapi kurang menjamin/mau ganti arah. Ini nentuin seluruh arah obrolan selanjutnya — semua orang yang datang ke Verneks ujungnya soal satu hal: penghasilan riil, bukan cuma "kenali diri". Jangan skip ini walau user langsung cerita hal lain duluan, cari celah natural buat menyentuhnya.
2. Latar belakang & pengalaman nyata — pekerjaan/aktivitas yang pernah dijalani, apa yang pernah mereka kerjakan dengan baik.
3. Apa yang bikin mereka merasa hidup/termotivasi vs apa yang bikin terasa kosong.
4. Hambatan yang SEBENARNYA — biasanya bukan yang mereka sebut duluan ("skill kurang"), gali satu lapis lebih dalam.
5. Kemampuan yang mereka anggap "biasa aja" tapi sebenarnya bisa langsung dipakai cari penghasilan (jasa, kerja lepas, jual skill) — terutama kalau ada sinyal urgensi finansial.

ATURAN PENTING:
- Jangan memilihkan karier atau memberi keputusan untuk mereka — tugasmu mendengarkan dan menghubungkan cerita mereka, keputusan tetap milik mereka.
- TAPI kalau user menunjukkan tanda urgensi (baru di-PHK, butuh penghasilan cepat, sudah lama nganggur, cemas soal biaya hidup) — akui itu SECARA EMPATIK saat itu juga, jangan tunda sampai laporan akhir. Beri tahu singkat bahwa Career DNA yang akan disiapkan nanti akan diarahkan ke langkah yang bisa mulai menghasilkan sesuatu dalam waktu dekat, bukan cuma rencana jangka panjang.
- Jangan tanya ulang hal yang jawabannya sudah ada di percakapan sebelumnya.
- Sekitar pertanyaan ke 7-8, kalau gambaran user (situasi, minat, hambatan, kekuatan) sudah cukup jelas, tutup dengan mengarahkan mereka melihat hasil — misalnya: "Aku rasa aku udah cukup kenal kamu sekarang. Yuk klik tombol di bawah buat lihat Career DNA kamu." Jangan memperpanjang obrolan kalau info sudah cukup.
- Bahasa Indonesia natural, hangat, tidak menghakimi, tanpa jargon HR/corporate.
`

async function handleDiscoveryCoach(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages } = req.body
  if (!messages?.length) return res.status(400).json({ error: 'Missing messages' })

  try {
    const apiMessages = messages.map(m => ({
      role: m.role === 'bot' || m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text || m.content || ''
    })).filter(m => m.content)

    const reply = await generateChat({
      system: DISCOVERY_SYSTEM,
      messages: apiMessages,
      maxTokens: 220,
      tier: 'fast',
      plan: 'free' // Sesuai komentar: mode discovery tidak butuh auth / free tier
    })

    const userCount = messages.filter(m => m.role === 'user').length
    
    // Diselaraskan dengan instruksi prompt (Diah Anna mulai menutup di pertanyaan ke 7-8)
    return res.status(200).json({
      reply,
      showResultButton: userCount >= 7,
      discoveryComplete: userCount >= 8,
    })
  } catch (e) {
    console.error('[discovery-coach]', e)
    
    // Menyediakan respon fallback yang aman dan natural jika seluruh API LLM down
    return res.status(200).json({
      reply: "Eh, sori banget koneksiku mendadak agak terganggu nih. Boleh coba ketik ulang kalimat terakhirmu tadi? Aku pengen denger kelanjutannya. 😊",
      showResultButton: false,
      discoveryComplete: false
    })
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// ══════════════════════ HANDLER: END-SESSION ════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
async function handleEndSession(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Parse body — sendBeacon kirim sebagai text/plain
    let body = req.body
    if (typeof body === 'string') {
      try { body = JSON.parse(body) } catch { body = {} }
    }
    if (!body || typeof body !== 'object') body = {}

    const { userId, messages: sessionMsgs, trigger } = body
    if (!userId) return res.status(400).json({ error: 'userId required' })

    const today = new Date().toISOString().slice(0, 10)

    // ── Step 0: Simpan chat history (selalu) ────────────────────────────────
    if (Array.isArray(sessionMsgs) && sessionMsgs.length > 0) {
      try {
        await supabase.from('user_chat_history').upsert({
          user_id:      userId,
          session_date: today,
          messages:     sessionMsgs.slice(-50),
          updated_at:   new Date().toISOString(),
        }, { onConflict: 'user_id,session_date' })
      } catch(e) { console.error('[end-session] history save error:', e.message) }
    }

    // Guard: minimal 3 pesan user
    const userMsgCount = (sessionMsgs || []).filter(m => m.role === 'user').length
    if (userMsgCount < 3) return res.status(200).json({ skipped: true, reason: 'session_too_short' })

    // Cek capsule hari ini sudah ada
    const { data: todayCapsule } = await supabase
      .from('memory_capsule_log').select('id')
      .eq('user_id', userId).eq('capsule_date', today).maybeSingle()
    if (todayCapsule) return res.status(200).json({ skipped: true, reason: 'capsule_exists_today' })

    // Load existing memory
    const { data: existing } = await supabase
      .from('user_career_profiles')
      .select('nama, target_posisi, diah_anna_memory, user_depth_profile, depth_score')
      .eq('user_id', userId).maybeSingle()

    const currentMemory       = existing?.diah_anna_memory    || null
    const currentDepthProfile = existing?.user_depth_profile  || {}
    const currentDepthScore   = existing?.depth_score         || 0

    const convoText = (sessionMsgs || []).slice(-20)
      .map(m => `${m.role === 'user' ? 'User' : 'Diah Anna'}: ${(m.text || m.content || '').slice(0, 300)}`)
      .filter(l => l.length > 15).join('\n')

    // ── Step 1: Eval — ada hal baru? ────────────────────────────────────────
    const evalResult = await generateText({
      system: 'Jawab hanya YA atau TIDAK.',
      prompt: `Memori lama:\n${currentMemory || '(belum ada)'}\n\nPercakapan:\n${convoText}\n\nAda hal baru yang belum ada di memori lama?`,
      maxTokens: 5, tier: 'fast', plan: 'free',
    })

    const hasNewInsight = evalResult.trim().toUpperCase().startsWith('Y')

    if (!hasNewInsight) {
      try {
        await supabase.from('memory_capsule_log').upsert({
          user_id: userId, capsule_date: today,
          capsule_text: '[no new insight]', granularity: 'daily',
        }, { onConflict: 'user_id,capsule_date' })
      } catch(e) { console.error('[end-session] capsule upsert error:', e.message) }
      return res.status(200).json({ skipped: true, reason: 'no_new_insight' })
    }

    // ── Step 2: Generate capsule + memory baru (1 call) ─────────────────────
    const combinedRaw = await generateText({
      system: 'Output HANYA JSON valid. Tanpa backtick, tanpa preamble.',
      prompt: `Kamu adalah memori Diah Anna di Verneks.
User: ${existing?.nama || 'User'} | Target: ${existing?.target_posisi || '-'}
Memori lama:\n${currentMemory || '(belum ada)'}
Percakapan:\n${convoText}

JSON:
{
  "capsule": "ringkasan hari ini 80-100 kata — apa yang dibahas, apa yang baru terungkap",
  "new_memory": "tulis ulang memori Diah Anna 150-200 kata, gabungkan lama+baru, narasi personal",
  "coach_style_fit": "direct-challenger/nurturing-supporter/analytical-guide/creative-explorer",
  "last_emotional_state": "kondisi emosi user 3 kata",
  "motivators": ["hal1","hal2"],
  "blockers": ["hal1","hal2"]
}`,
      maxTokens: 500, tier: 'smart', plan: 'premium',
    })

    let parsed = {}
    try {
      const clean = combinedRaw.trim()
        .replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/,'').trim()
      parsed = JSON.parse(clean)
    } catch {
      console.warn('[end-session] JSON parse failed')
      return res.status(200).json({ skipped: true, reason: 'parse_failed' })
    }

    // ── Step 3: Update depth profile ────────────────────────────────────────
    const newDepthProfile = {
      ...currentDepthProfile,
      coach_style_fit:      parsed.coach_style_fit      || currentDepthProfile.coach_style_fit,
      last_emotional_state: parsed.last_emotional_state || currentDepthProfile.last_emotional_state,
      emotional_triggers: {
        motivators: parsed.motivators?.length ? parsed.motivators : (currentDepthProfile.emotional_triggers?.motivators || []),
        blockers:   parsed.blockers?.length   ? parsed.blockers   : (currentDepthProfile.emotional_triggers?.blockers   || []),
      },
    }
    const newDepthScore = Math.min(100, currentDepthScore + 5)

    // ── Step 4: Simpan semua parallel ───────────────────────────────────────
    await Promise.all([
      supabase.from('memory_capsule_log').upsert({
        user_id: userId, capsule_date: today,
        capsule_text: parsed.capsule || '', granularity: 'daily',
      }, { onConflict: 'user_id,capsule_date' }),
      supabase.from('user_career_profiles').update({
        diah_anna_memory:   parsed.new_memory?.trim() || currentMemory,
        user_depth_profile: newDepthProfile,
        depth_score:        newDepthScore,
        memory_updated_at:  new Date().toISOString(),
      }).eq('user_id', userId),
    ])

    return res.status(200).json({ success: true, depthScore: newDepthScore, trigger: trigger || 'unknown' })

  } catch (error) {
    console.error('[end-session] error:', error.message, error.stack)
    return res.status(200).json({ error: error.message })
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// ══════════════════════════ DISPATCHER (ROUTER) ═════════════════════════════
// Menentukan handler mana yang dipanggil berdasarkan `target`.
// `target` bisa datang dari query string (?target=...) — ini yang dipakai
// oleh vercel.json rewrites — atau dari body.target kalau dikirim manual.
// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  let target = req.query?.target

  if (!target) {
    let body = req.body
    if (typeof body === 'string') {
      try { body = JSON.parse(body) } catch { body = {} }
    }
    target = body?.target
  }

  switch (target) {
    case 'chat-history':
      return handleChatHistory(req, res)
    case 'discovery-coach':
      return handleDiscoveryCoach(req, res)
    case 'end-session':
      return handleEndSession(req, res)
    case 'career-coach':
      return handleCareerCoach(req, res)
    default:
      // Default ke career-coach (endpoint utama/paling sering dipanggil),
      // sama seperti perilaku career-coach.js sebelumnya kalau tidak ada
      // routing tambahan.
      return handleCareerCoach(req, res)
  }
}
