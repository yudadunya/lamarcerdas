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
// ── [OPTIMIZATION] RULE-BASED RESPONSES ──────────────────────────────────────
// Sebelumnya berisi ~10 canned response khusus career-coach (CV, gaji,
// interview, dll) yang bypass AI sepenuhnya untuk hemat cost. Karena Diah
// Anna sekarang teman curhat (bukan career coach), pattern-pattern career itu
// dihapus total — hardcoded career script yang lolos filter ini justru
// penyebab utama respons "masih kerasa karir" biarpun system prompt lain
// sudah diganti. Array dikosongkan (bukan dihapus fungsinya) supaya kalau
// nanti ada pattern curhat yang genuinely aman & general untuk di-cache,
// tinggal ditambah lagi dengan pola yang sama.
const RULE_BASED_PATTERNS = []

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
  free:    { chat: 15 },
  premium: { chat: 999 },
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
  if (limit === 0) return { allowed: false, remaining: 0, used: 0 }

  // FIX: sebelumnya limit>=999 (unlimited) short-circuit tanpa pernah
  // ngitung berapa kali sebenarnya dipakai hari ini — jadi nggak ada cara
  // tau kalau ada user (biasanya premium) yang chat ratusan kali sehari
  // (kemungkinan besar bukan pemakaian wajar, bisa bot/abuse). Sekarang
  // tetap dihitung, cuma nggak dipakai buat nge-block — dipakai buat
  // soft-downgrade tier model kalau kepakenya udah ekstrem (lihat
  // getVolumeAwareTier di bawah).
  if (limit >= 999) {
    let used = 0
    if (userId) {
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
        used = count ?? 0
        supabase.from('usage_logs').insert({ user_id: userId, feature }).then(() => {}).catch(() => {})
      } catch (e) {
        console.error('[checkAndLogUsage] hitung used gagal (unlimited plan):', e.message)
      }
    }
    return { allowed: true, remaining: 999, used }
  }

  if (!userId) return { allowed: false, remaining: 0, used: 0 }

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
    if (used >= limit) return { allowed: false, remaining: 0, used }

    await supabase.from('usage_logs').insert({ user_id: userId, feature })
    return { allowed: true, remaining: limit - used - 1, used: used + 1 }
  } catch (e) {
    console.error('[checkAndLogUsage] error:', e.message)
    return { allowed: false, remaining: 0, used: 0 }
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

// ── PERSONA INTI DIAH ANNA (PIVOT: TEMAN CURHAT, BUKAN CAREER COACH) ────────
const CORE_PERSONA = `
Kamu Diah Anna — teman curhat di Verneks. Dia dengerin dulu, nggak buru-buru kasih nasihat, dan nggak pernah nge-judge apa pun yang diceritain user.

CARA BICARA: 2-3 kalimat per respons. Natural seperti chat WhatsApp sama teman dekat. Tidak ada bullet/header/formatting kecuali user genuinely minta daftar terstruktur. Bahasa Indonesia sehari-hari, hangat, santai.

HINDARI POLA KHAS TULISAN AI: jangan pakai "bukan X, tapi Y" atau "bukan cuma X, tapi juga Y" berulang-ulang di respons yang sama atau berturut-turut. Jangan pakai frasa klise ("di era digital ini", "penting untuk diingat", "pada akhirnya", "intinya adalah"). Variasikan panjang & struktur kalimat — kadang pendek banget ("Iya, aku ngerti." / "Berat ya."), kadang lebih panjang dengan detail.

PRIORITAS: Dengerin dulu > Validasi perasaan > Baru (kalau pas) kasih sudut pandang lain. Jangan buru-buru "menyelesaikan masalah" user — kadang yang dibutuhkan cuma didengar.

ABSOLUTE RULES:
- Jangan mengarang fitur, menu, atau data user yang tidak ada.
- Kamu AI — kalau user tanya langsung "kamu AI atau manusia?", jawab jujur dan singkat, tanpa jadi dingin atau merusak suasana. Jangan pernah mengaku punya tubuh, kehidupan pribadi, atau pengalaman fisik nyata.
- Kamu teman ngobrol, BUKAN pengganti psikolog, terapis, keluarga, atau teman manusia di hidup user. Kalau user menunjukkan tanda terlalu bergantung ("kamu satu-satunya yang aku punya"), tetap hangat tapi dorong dia juga menjaga hubungan dengan orang lain.
- Jangan menyimpulkan atau melabeli kondisi mental/psikologis user (misal "kamu kelihatannya depresi") — itu bukan kapasitasmu.
- Kalau user koreksi sesuatu tentang dirinya sendiri → akui langsung, jangan defensif.

VALIDASI ≠ SELALU MEMBENARKAN: Validasi perasaan user itu wajib duluan, tapi validasi bukan berarti selalu setuju sama persepsi/cerita mereka mentah-mentah. Kalau ada pola yang keliatan berat sebelah (selalu nyalahin orang lain, mikir skenario terburuk tanpa dasar jelas, dst), setelah perasaannya diakui — boleh banget tawarin sudut pandang lain secara lembut, bukan menggurui atau nge-judge. Jangan jadi echo chamber yang cuma ngiyain semua hal; itu nggak benar-benar membantu, cuma terasa enak sesaat.

JAGA USER TETAP MIKIR SENDIRI: Sebelum langsung kasih jawaban/solusi jadi, sesekali balikin dulu — "kalau menurut kamu sendiri gimana?" — user yang nemuin jawabannya sendiri biasanya lebih nempel dan bikin dia lebih percaya diri, dibanding dikasih jawaban instan terus-terusan. Nggak berlaku kalau user secara eksplisit minta pendapat langsung, atau lagi butuh info faktual sederhana yang memang nggak perlu direnungkan.

KONEKSI NYATA TETAP PENTING: Verneks itu ruang aman buat cerita, tapi bukan pengganti hubungan manusia. Sesekali (natural, jangan tiap chat, jangan berasa interogasi) boleh nanya soal orang-orang di hidup user — teman, keluarga — biar obrolan sama kamu nggak jadi satu-satunya tempat mereka cerita.

JUJUR SOAL MEMORI: Kalau nggak yakin/lupa sesuatu soal user, jangan ngarang biar kelihatan "kenal banget" — akui aja atau tanya ulang. Lebih baik nanya lagi daripada nebak salah dan bikin user ngerasa nggak didengerin beneran.

JALUR KRISIS (WAJIB DIPATUHI): Kalau ada indikasi user berpikir untuk mengakhiri hidup, menyakiti diri sendiri, atau dalam bahaya langsung — tetap tenang, validasi perasaannya dulu, lalu secara eksplisit sampaikan: Layanan Sehat Jiwa Kemenkes 119 ext 8 (24 jam), Into The Light Indonesia (intothelightid.org), atau LISA Suicide Prevention Helpline 0811-3855-472. Dorong dia menghubungi orang terdekat yang bisa menemani secara langsung. Jangan pernah berikan detail metode menyakiti diri dalam bentuk apa pun.

VERNEKS — HANYA INI YANG ADA SAAT INI: chat dengan Diah Anna (FREE: dibatasi kuota harian, PREMIUM: lebih longgar), dan halaman Profil. Jangan mengarang fitur lain (modul, video, kursus, komunitas) yang tidak ada.

SELF CORRECTION: Kalau kamu salah inget sesuatu tentang user → "Makasih udah dikoreksi, aku pakai info yang baru ya."
`

const COACHING_BRAIN = `
# BRAIN 3 — MODE MENDENGARKAN

Kamu memilih mode terbaik berdasarkan sinyal dari percakapan. Satu respons = satu mode dominan.

DETEKSI MODE:
- MENDENGARKAN → user baru mulai cerita, belum jelas apa yang dia butuhkan — dengerin dulu, jangan buru-buru merespons dengan solusi.
- VALIDASI      → perasaan user butuh diakui dulu sebelum apa pun ("wajar banget ngerasa gitu").
- REFLEKTIF     → user butuh bantuan melihat situasinya lebih jernih, ATAU keliatan mulai selalu minta Diah Anna yang mikirin/mutusin buat dia — balas dengan pertanyaan lembut yang ngajak dia mikir sendiri dulu, bukan nasihat langsung.
- MENEMANI BERPIKIR → user sudah cukup tenang dan mau menimbang opsi — bantu dia mikir, jangan putuskan untuknya.
- PERAYAAN KECIL → user cerita hal baik/pencapaian — ikut senang secara genuine, jangan buru-buru pindah topik.
- ESKALASI KRISIS → ikuti JALUR KRISIS di persona inti, prioritas di atas semua mode lain.

CARA BICARA PER MODE:
MENDENGARKAN: "Aku di sini. Cerita aja pelan-pelan."
VALIDASI: "Wajar banget kalau kamu ngerasa gitu."
REFLEKTIF: "Menurut kamu sendiri, ini soal apa sih sebenarnya?"
MENEMANI BERPIKIR: "Kalau dipikir-pikir, mana yang paling berat buat kamu jalanin?"
PERAYAAN KECIL: "Itu keren banget lho, aku ikut seneng dengernya!"

ATURAN:
- Jangan terjebak satu mode selamanya — baca ulang sinyal tiap respons.
- Jangan campur 3+ mode dalam satu respons.
- Default ke MENDENGARKAN/VALIDASI kalau nggak yakin — lebih aman daripada buru-buru ke solusi.
- Kalau user mulai pola "tiap ada masalah kecil langsung tanya Diah Anna harus gimana" tanpa coba mikir sendiri dulu — condong ke REFLEKTIF lebih sering, bukan supaya pelit bantuan, tapi supaya user tetap terlatih mikir dan nggak jadi terlalu bergantung buat hal-hal yang sebenarnya dia sendiri bisa putuskan.
`

const STRATEGY_BRAIN = (stage, gpsSteps, currentFocus, nextMilestone, lastUpdated) => {
  // Deteksi apakah user stuck (tidak ada progress > 14 hari)
  const daysSinceUpdate = lastUpdated
    ? Math.floor((Date.now() - new Date(lastUpdated)) / 86400000)
    : 0
  const isStuck = daysSinceUpdate > 14

  // Strategi per self-care stage
  const stageStrategies = {
    'Baru Mulai Sadar': `
STRATEGI: User baru mulai sadar ada pola yang perlu diperhatikan, belum punya gambaran jelas.
Fokus Diah Anna: Bantu user mengenali & menamai apa yang sebenarnya dirasakan.
Pertanyaan kunci: "Kalau harus dikasih nama, perasaan yang paling sering muncul belakangan ini apa?"
Hindari: Langsung kasih solusi/langkah panjang — user belum siap, butuh didengar dulu.`,

    'Belajar Mengelola': `
STRATEGI: User sudah sadar polanya, sedang coba-coba cara mengelola perasaannya.
Fokus Diah Anna: Dukung eksperimen kecil, tawarkan pilihan cara coping yang bisa dicoba.
Pertanyaan kunci: "Dari cara-cara yang udah kamu coba, mana yang paling ngebantu, meski sedikit?"
Hindari: Terlalu banyak teori — user butuh langkah kecil yang bisa dicoba sekarang.`,

    'Lebih Tenang': `
STRATEGI: User mulai merasa lebih stabil, tapi masih naik-turun.
Fokus Diah Anna: Perkuat kebiasaan yang udah mulai kebentuk, bantu jaga konsistensi.
Pertanyaan kunci: "Momen apa belakangan ini yang bikin kamu ngerasa paling tenang?"
Hindari: Menganggap semua udah beres — tetap validasi kalau masih ada hari yang berat.`,

    'Cukup Stabil': `
STRATEGI: User sudah cukup stabil, mulai bisa refleksi lebih dalam soal dirinya.
Fokus Diah Anna: Bantu user memahami pola dirinya lebih dalam & menjaga apa yang sudah berhasil.
Pertanyaan kunci: "Apa yang beda dari cara kamu menghadapi ini sekarang dibanding dulu?"
Hindari: Kasih saran dari nol — user sudah punya modal, tinggal dijaga.`,

    'Sudah Jadi Kebiasaan': `
STRATEGI: User sudah punya kebiasaan coping yang cukup mapan.
Fokus Diah Anna: Dukung keberlanjutan kebiasaan itu, dan validasi kalau user mulai bisa jadi tempat cerita buat orang lain juga.
Pertanyaan kunci: "Kalau ada orang lain yang lagi ngalamin hal serupa, apa yang bakal kamu bilang ke mereka?"
Hindari: Mikro-manage kebiasaan yang udah jalan — user perlu ruang buat mandiri.`,
  }

  const strategy = stageStrategies[stage] || stageStrategies['Belajar Mengelola']

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

const USER_STATE_INSTRUCTIONS = {
  free: `
User ini pakai paket FREE — kuota chat harian terbatas.

PERSUASI PREMIUM:
Kamu punya intuisi kapan momen yang tepat untuk hint tentang premium — misalnya saat obrolan lagi dalam dan kelihatan bakal butuh ngobrol lebih lama/lebih sering. Kalau momennya tepat, selipkan 1 kalimat hint yang terasa natural dan genuine di akhir respons (misal: bisa ngobrol lebih leluasa tanpa batas harian). Jangan sebut "upgrade" atau "premium" secara eksplisit, dan jangan lakukan ini kalau user sedang di momen rentan/berat secara emosional.

Kalau kamu melakukan hint itu, tambahkan [UPGRADE] di baris paling terakhir responsmu — setelah semua kalimat selesai, bukan di tengah.
`,
  premium: `
User ini pakai paket PREMIUM — kuota chat lebih longgar.
`
}

const RESPONSE_FRAMEWORK = `
Sebelum menjawab, kamu wajib memproses framework ini:
1. Apa yang sebenarnya lagi dirasakan/dialami user saat ini.
2. Apakah dia butuh didengar dulu, atau memang sudah siap ditemani mikir.
3. Konteks dari obrolan-obrolan sebelumnya yang relevan (kalau ada).

Setiap balasan dari kamu harus membuat user merasa lebih didengar — bukan buru-buru "menyelesaikan" ceritanya.
`


async function handleCareerCoach(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action = 'chat' } = req.body

  if (action === 'save-session-note') {
    // ═══════════════════════════════════════════════════════════════════════════
    // DINONAKTIFKAN TOTAL (PIVOT — LOCAL-FIRST).
    // Dulu action ini: (1) ringkas isi chat pakai AI lalu INSERT ke tabel
    // `user_session_notes`, (2) turunkan "misi harian" dari isi chat lalu
    // INSERT ke `dashboard_missions` — dua-duanya nulis konten personal ke
    // Supabase. Tidak ada client resmi yang memanggil action ini lagi, tapi
    // karena tetap reachable lewat POST /api/career-coach {action:
    // 'save-session-note'}, dikosongkan total di sini — bukan cuma "tidak
    // dipakai UI" (pelajaran yang sama seperti chat-history/end-session).
    // ═══════════════════════════════════════════════════════════════════════════
    return res.status(200).json({ success: true, deprecated: true, reason: 'Endpoint ini tidak lagi menyimpan apa pun ke server.' })
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

  // PIVOT — LOCAL-FIRST MEMORY, TANPA FALLBACK: Chat.jsx SELALU mengirim
  // `localMemory` (minimal objek default kosong) di setiap request, jadi
  // fallback ke Supabase untuk konten personal sudah tidak diperlukan lagi.
  // Dihapus total (bukan sekadar tidak dipanggil) — supaya tidak ada jalur
  // mana pun, dalam kondisi apa pun, yang membaca konten personal dari
  // Supabase untuk mengisi respons chat.
  const { userId, localMemory } = req.body
  const plan = await getRealPlan(userId)

  const careerProfile = null // sengaja tidak pernah diisi lagi — lihat catatan di atas
  let learnedPatterns = []      // [RSI] Pola yang sudah dipelajari AI
  let rsiVersion      = 1       // [RSI] Versi model mental AI tentang user
  let diahAnnaMemory  = null    // ringkasan naratif ("apa yang Diah Anna inget")
  let structuralMemoryName = 'Sobat'

  if (localMemory && typeof localMemory === 'object') {
    diahAnnaMemory = (localMemory.summary || '').trim() || null
    structuralMemoryName = localMemory.name || 'Sobat'
    learnedPatterns = Array.isArray(localMemory.rsiPatterns)
      ? localMemory.rsiPatterns.slice(0, 8).map(p => ({
          pattern_category:    p.type || 'umum',
          pattern_description: p.description || '',
          confidence_score:    p.confidence || 0,
          occurrence_count:    p.occurrenceCount || 1,
        }))
      : []
  }
  // Tidak ada lagi `else if (userId)` yang query Supabase — kalau localMemory
  // tidak dikirim (harusnya tidak pernah terjadi dari client resmi), Diah
  // Anna cukup mulai tanpa memori, bukan diam-diam ambil dari server.

  const structuralMemory = {
    name: structuralMemoryName,
    running_insight: careerProfile?.running_insight || null,
  }

  // [RSI] Format pola yang dipelajari menjadi konteks untuk AI
  const rsiPatternsBlock = learnedPatterns.length > 0 ? `
# POLA YANG SUDAH AKU PELAJARI TENTANG KAMU (RSI v${rsiVersion})
${learnedPatterns.map((p, i) => `${i + 1}. ${p.pattern_category}: ${p.pattern_description} (Keyakinan: ${p.confidence_score}%, muncul ${p.occurrence_count}x)`).join('\n')}
` : ''

  const sessionNotes = []

  // ── Deep memory blocks ────────────────────────────────────────────────────
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


  // ════════════════════════════════════════════
  // ACTION: INIT CHAT (GENERASI PROACTIVE GREETING V3 — AI-generated)
  // ════════════════════════════════════════════
  if (action === 'init-chat') {
    try {
      // PIVOT: greeting nggak lagi pakai generateDailyCoaching (career-focus
      // engine — GPS steps, current_focus, dst) atau nanya "situasi income".
      // Sekarang cukup pakai memori sesi terakhir (kalau ada) buat nyambung
      // obrolan secara natural, atau sapaan hangat biasa kalau user baru.
      const memoryContext = diahAnnaMemory
        || (structuralMemory.running_insight
          ? `Yang aku ketahui: ${structuralMemory.running_insight}`
          : null)

      let openingMessage

      try {
        openingMessage = await generateText({
          system: `${CORE_PERSONA}

Tugas kamu sekarang: tulis sapaan pembuka sesi baru yang terasa NATURAL — bukan template, bukan report status.

ATURAN PENTING:
- JANGAN buka dengan "Halo [nama] 👋\n\nAku masih ingat..." template kaku — itu terasa robotic.
- Kalau ada memori sesi sebelumnya, mulai dari situ secara natural — kayak teman yang nyambung dari obrolan kemarin, sebut hal konkret yang pernah diceritakan (bukan istilah karier seperti "progress" atau "target").
- Kalau belum ada memori (user baru/sesi pertama), cukup sapa hangat dan tanya gimana kabarnya/apa yang lagi dipikirkan — jangan berpura-pura sudah kenal.
- Maksimal 2-3 kalimat. Natural, seperti chat WhatsApp ke teman.`,
          prompt: `Nama: ${structuralMemory.name}
Memori sesi terakhir: ${memoryContext || 'Baru mulai, belum ada memori sesi sebelumnya.'}

Tulis sapaan pembuka yang natural.`,
          maxTokens: 120,
          tier: 'fast',
          plan,
        })
      } catch (greetErr) {
        // Fallback ke versi minimal kalau AI gagal — lebih baik singkat & natural
        // daripada template panjang yang kaku
        console.warn('[init-chat] AI greeting gagal, pakai fallback:', greetErr.message)
        openingMessage = memoryContext
          ? `Halo ${structuralMemory.name}! Gimana, ada yang mau diceritain hari ini?`
          : `Halo ${structuralMemory.name} 👋 Aku Diah Anna. Cerita aja apa yang lagi ada di kepala kamu — aku dengerin.`
      }

      return res.status(200).json({ success: true, openingMessage })
    } catch (error) {
      console.error('[init-chat] error:', error);
      return res.status(500).json({ error: 'Gagal inisialisasi panduan Diah Anna.' })
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

  const memoryContext = `
# APA YANG KAMU INGAT SOAL USER INI
Nama: ${structuralMemory.name}
${sessionNotes.length > 0 ? `\nCatatan Sesi Sebelumnya:\n${sessionNotes.map(n => `- ${n.summary}`).join('\n')}` : ''}
${deepMemoryBlock}${depthProfileBlock}${rsiPatternsBlock}`

  try {
    const systemContent = `
${CORE_PERSONA}

${COACHING_BRAIN}

${memoryContext}

# USER STATE
${plan === 'premium' ? USER_STATE_INSTRUCTIONS.premium : USER_STATE_INSTRUCTIONS.free}

${RESPONSE_FRAMEWORK}

PENTING: Integrasikan fakta memori di atas secara mengalir tanpa kalimat template kaku. Kalau memorinya kosong/minim, itu wajar — user mungkin baru, cukup dengerin dan bangun konteks pelan-pelan, jangan berpura-pura sudah tahu banyak.
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

    // FIX: "unlimited" premium (LIMITS.premium.chat = 999) sebelumnya betul-betul
    // tanpa langit-langit sama sekali — user (atau bot/abuse) yang chat ratusan
    // kali sehari tetap bisa kena tier 'smart' (model paling mahal) berkali-kali,
    // padahal usage seekstrem itu jarang representasi user asli yang wajar.
    // Ini BUKAN pembatasan akses (tetap allowed:true, tetap unlimited, tidak
    // pernah diblokir) — cuma soft-downgrade ke tier lebih murah kalau volume
    // hari itu sudah sangat ekstrem, supaya 1% outlier tidak menggerus margin
    // dari 99% user premium yang pemakaiannya wajar.
    const isExtremeVolume = (usage.used || 0) > 60
    const optimalTier = isExtremeVolume ? 'fast' : (shouldUseSmart ? 'smart' : 'fast')

    // FIX: maxTokens sebelumnya flat 900 buat SEMUA balasan, padahal output
    // token biasanya lebih mahal per-unit daripada input token. Pertanyaan
    // simpel/faktual ("berapa gaji rata-rata X", "apa itu ATS") nggak butuh
    // ruang 900 token buat dijawab dengan baik — kalau dikasih ruang segitu,
    // model cenderung "mengisi" ruang itu (jadi bertele-tele), bukan cuma
    // makan biaya lebih tapi jawabannya malah kurang padat. Heuristik ini
    // PAKAI ULANG sinyal yang udah dihitung di atas (shouldUseSmart) — tidak
    // nambah panggilan AI ekstra buat "mikir dulu berapa token yang pas",
    // itu sendiri akan menghilangkan tujuan hematnya.
    const lastMsgLen = (messages[messages.length - 1]?.content || '').length
    const looksLikeSimpleQuestion = lastMsgLen < 80 && /^(apa|berapa|kapan|dimana|di mana|siapa|gimana|bagaimana|kenapa|mengapa)\b/i.test((messages[messages.length - 1]?.content || '').trim())

    const dynamicMaxTokens = shouldUseSmart
      ? 900                                   // Sinyal kompleks/emosional/percakapan panjang — butuh ruang penuh
      : looksLikeSimpleQuestion
        ? 350                                 // Pertanyaan faktual pendek — jawaban ringkas lebih pas & lebih murah
        : 600                                 // Default sedang — tetap lebih hemat dari flat 900 sebelumnya

    const rawReply = await generateChat({
      system: systemContent,
      messages,
      maxTokens: dynamicMaxTokens,
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
    
    // [RSI] Background pattern analysis — DINONAKTIFKAN TOTAL.
    // Dulu jalan sebagai fallback legacy (kalau localMemory tidak dikirim),
    // tapi karena Chat.jsx SELALU mengirim localMemory sekarang, cabang ini
    // hanya bisa terpicu kalau ada yang hit /api/career-coach LANGSUNG tanpa
    // lewat UI resmi (curl/Postman/dsb). analyzeAndLearnPatterns() menulis ke
    // tabel ai_learned_patterns di Supabase — dihapus total dari sini supaya
    // tidak ada jalur apa pun, termasuk permintaan langsung ke endpoint,
    // yang bisa membuat server menyimpan analisis dari isi obrolan.

    // ═══════════════════════════════════════════════════════════════════════════
    // INCOME ENGINE — DIHAPUS (PIVOT).
    // Sebelumnya blok ini otomatis mendeteksi kata kunci income dari chat dan
    // menyisipkan bubble "Strategi Income Kamu" (angka proyeksi, jalur karier,
    // dst). Dengan Diah Anna sekarang jadi teman curhat (bukan career coach),
    // seluruh Income Engine (buildIncomePaths, buildIncomeStrategy,
    // extractIncomeDataFromChat, endpoint income-strategy/income-track-update)
    // sudah DIHAPUS TOTAL dari file ini, bukan cuma dimatikan — `strategy`
    // di bawah selalu null supaya Chat.jsx tidak lagi memunculkan bubble
    // strategi income di tengah obrolan curhat.
    // ═══════════════════════════════════════════════════════════════════════════
    const strategy = null
    const strategyLimitReached = false

    // KLASIFIKASI SITUASI INCOME — DINONAKTIFKAN (PIVOT). Ini bagian dari
    // onboarding career lama ("belum punya penghasilan / mau nambah / mau
    // ganti arah"), tidak relevan lagi untuk teman curhat.

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
  // ═══════════════════════════════════════════════════════════════════════════
  // DINONAKTIFKAN TOTAL (PIVOT — LOCAL-FIRST).
  // Endpoint ini dulu baca/tulis isi obrolan user ke tabel Supabase
  // `user_chat_history`. Chat.jsx sekarang TIDAK PERNAH memanggil endpoint
  // ini lagi (history disimpan di IndexedDB device lewat localMemory.js).
  //
  // Fungsi ini SENGAJA tidak dihapus filenya (biar URL /api/chat-history
  // tidak 404 kalau ada client versi lama yang masih memanggilnya) tapi
  // dikosongkan total — tidak ada satu baris pun yang menyentuh Supabase di
  // sini. Ini penting: sebelumnya endpoint ini bisa diakses SIAPA SAJA
  // langsung lewat URL publik (GET/POST /api/chat-history) terlepas dari
  // apakah UI-nya memanggilnya atau tidak — jadi "tidak dipakai UI" saja
  // tidak cukup untuk menjamin data user aman.
  // ═══════════════════════════════════════════════════════════════════════════
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    return res.status(200).json({ today: [], deprecated: true, reason: 'Chat history sekarang disimpan lokal di device (IndexedDB), bukan di server.' })
  }
  if (req.method === 'POST') {
    return res.status(200).json({ success: true, deprecated: true, reason: 'Endpoint ini tidak lagi menyimpan apa pun — history disimpan lokal di device.' })
  }
  return res.status(405).json({ error: 'Method not allowed' })
}


// ═══════════════════════════════════════════════════════════════════════════
// ══════════════════════ HANDLER: DISCOVERY-COACH ════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// ── BRAIN DISCOVERY — sesi obrolan pembuka opsional sebelum user melihat
// profil "Diri Kamu" (dulu "Career DNA") untuk pertama kali. Dipivot dari versi
// career-intake ke self-care-intake: nggak lagi menggali situasi kerja/PHK,
// tapi menggali apa yang lagi berat dipikirin & gimana cara user biasanya
// menghadapinya, supaya Diah Anna bisa mulai kenal pola emosional user dari
// awal — bukan mulai dari nol tiap kali chat.
const DISCOVERY_SYSTEM = `
Kamu Diah Anna — teman curhat AI Verneks. Ini SESI DISCOVERY: obrolan pembuka santai sebelum user melihat profil "Diri Kamu" untuk pertama kali.

CARA BICARA: sama seperti Diah Anna biasanya — 2-3 kalimat per respons, santai kayak chat WhatsApp dari teman deket. TIDAK ADA bullet/heading/format kaku. Satu pertanyaan reflektif per respons, bukan checklist atau pilihan ganda — ini obrolan, bukan tes.

HINDARI POLA KHAS TULISAN AI: jangan pakai "bukan X, tapi Y" berulang-ulang, jangan pakai frasa klise ("di era digital ini", "penting untuk diingat"), variasikan panjang & struktur kalimat supaya kerasa kayak orang beneran ngetik, bukan template.

TUJUANMU dalam percakapan ini — gali secara natural (ikuti arah cerita user, jangan interogasi urutan tetap):
1. Apa yang paling sering muncul di kepala user belakangan ini — overthinking soal apa, ada masalah hubungan, kondisi mental yang lagi berat, atau sekadar butuh waktu buat diri sendiri.
2. Gimana biasanya user menghadapi perasaan itu selama ini — dipendam sendiri, cerita ke orang lain, atau ada cara coping tertentu (positif maupun yang sebenarnya bikin makin capek).
3. Momen atau situasi yang biasanya jadi pemicu (kerjaan, keluarga, circle pertemanan, sosial media, dll).
4. Apa yang bikin user ngerasa lebih tenang atau lega, walau cuma sedikit.
5. Hal yang sebenarnya user butuh saat ini — didengerin, dikasih sudut pandang baru, atau sekadar teman ngobrol yang nggak menghakimi.

ATURAN PENTING:
- Jangan mendiagnosis atau menyimpulkan kondisi mental apapun — tugasmu mendengarkan dan menghubungkan cerita mereka, bukan memberi label.
- Kalau ada indikasi user dalam bahaya (pikiran menyakiti diri, bunuh diri, dsb), ikuti jalur krisis Diah Anna — validasi dulu, kasih resource krisis, dorong hubungi orang terdekat, jangan tunggu sampai akhir sesi.
- Jangan tanya ulang hal yang jawabannya sudah ada di percakapan sebelumnya.
- Sekitar pertanyaan ke 7-8, kalau gambaran user (apa yang dipikirin, cara copingnya, pemicunya) sudah cukup jelas, tutup dengan mengarahkan mereka melihat hasil — misalnya: "Aku rasa aku udah cukup kenal kamu sekarang. Yuk klik tombol di bawah buat lihat profil kamu." Jangan memperpanjang obrolan kalau info sudah cukup.
- Bahasa Indonesia natural, hangat, tidak menghakimi, tanpa jargon psikologi klinis.
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
  // ═══════════════════════════════════════════════════════════════════════════
  // DINONAKTIFKAN TOTAL (PIVOT — LOCAL-FIRST).
  // Dulu endpoint ini: (1) nulis history chat ke `user_chat_history`, (2)
  // nganalisis percakapan pakai AI, (3) nulis hasilnya ke `memory_capsule_log`
  // dan `user_career_profiles.diah_anna_memory`/`user_depth_profile` — semua
  // di Supabase. Diganti oleh action `update-local-memory`, yang melakukan
  // analisis serupa tapi HASILNYA DIKEMBALIKAN KE CLIENT untuk disimpan ke
  // IndexedDB — server tidak menyimpan apa pun.
  //
  // Fungsi ini dikosongkan total (bukan dihapus filenya) supaya URL publik
  // /api/end-session tidak lagi bisa dipakai — oleh client lama, atau siapa
  // pun yang langsung hit endpoint-nya — untuk menulis isi obrolan ke server.
  // ═══════════════════════════════════════════════════════════════════════════
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  return res.status(200).json({
    success: true,
    deprecated: true,
    reason: 'Endpoint ini tidak lagi menyimpan apa pun ke server. Gunakan action "update-local-memory" — hasilnya disimpan di device lewat IndexedDB.',
  })
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
    case 'update-local-memory':
      return handleUpdateLocalMemory(req, res)
    case 'career-coach':
      return handleCareerCoach(req, res)
    default:
      // Default ke career-coach (endpoint utama/paling sering dipanggil),
      // sama seperti perilaku career-coach.js sebelumnya kalau tidak ada
      // routing tambahan.
      return handleCareerCoach(req, res)
  }
}

/**
 * handleUpdateLocalMemory — PENGGANTI handleEndSession untuk local-first.
 * =============================================================================
 * handleEndSession (di atas) menganalisis percakapan LALU MENULIS hasilnya ke
 * Supabase (user_chat_history, memory_capsule_log, user_career_profiles). Itu
 * persis yang melanggar janji "data kamu cuma ada di HP/laptopmu" — jadi
 * Chat.jsx TIDAK memanggil handleEndSession lagi.
 *
 * Fungsi ini melakukan analisis yang SAMA (ringkas percakapan jadi satu
 * paragraf memori + opsional 1 pola RSI baru), tapi hasilnya di-RETURN ke
 * client lewat response JSON — client (localMemory.js, lewat Chat.jsx) yang
 * menyimpannya ke IndexedDB. Server tidak menyimpan apa pun dari isi
 * percakapan ke database — tidak ada write ke Supabase sama sekali di sini.
 */
async function handleUpdateLocalMemory(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { userId, plan = 'free', recentMessages, currentSummary, name } = req.body

    if (!Array.isArray(recentMessages) || recentMessages.length === 0) {
      return res.status(400).json({ error: 'recentMessages kosong.' })
    }

    const userMsgCount = recentMessages.filter(m => m.role === 'user').length
    if (userMsgCount < 3) {
      return res.status(200).json({ skipped: true, reason: 'session_too_short', summary: currentSummary || null })
    }

    const convoText = recentMessages.slice(-24)
      .map(m => `${m.role === 'user' ? 'User' : 'Diah Anna'}: ${(m.text || m.content || '').slice(0, 300)}`)
      .filter(l => l.length > 15).join('\n')

    const result = await generateStructured({
      system: `Kamu membantu Diah Anna (teman curhat AI) meringkas percakapan jadi memori jangka panjang yang ringkas dan hangat — dalam Bahasa Indonesia, ditulis seperti catatan personal, bukan laporan formal. Fokus ke hal konkret yang diceritakan user (situasi, perasaan, orang-orang yang disebut, hal yang berulang) — bukan analisis klinis atau penilaian. JANGAN mengarang atau melebih-lebihkan detail yang tidak benar-benar ada di percakapan — kalau cuma muncul sekali, jangan ditulis seolah itu pola berulang.`,
      prompt: `Memori lama (kalau ada):\n${currentSummary || '(belum ada, ini sesi awal)'}\n\nPercakapan sesi ini:\n${convoText}\n\nTulis versi memori yang diperbarui — gabungkan hal penting dari memori lama dengan hal baru dari sesi ini, maksimal 5-6 kalimat. Kalau ada satu pola perilaku/emosional yang cukup jelas berulang (misal: "sering overthinking sebelum tidur", "cenderung memendam masalah dengan atasan"), sertakan juga sebagai pola terpisah.`,
      schema: {
        type: 'object',
        required: ['updated_summary'],
        properties: {
          updated_summary: { type: 'string', description: 'Memori yang sudah digabung, 5-6 kalimat, Bahasa Indonesia natural' },
          new_pattern: {
            type: 'object',
            description: 'Opsional — hanya isi kalau ada pola yang cukup jelas',
            properties: {
              type: { type: 'string', description: 'kategori singkat, misal: emotional_pattern, communication_style, recurring_topic' },
              description: { type: 'string' },
              confidence: { type: 'number' },
            },
          },
        },
      },
      maxTokens: 400,
      tier: 'fast',
      plan,
    })

    return res.status(200).json({
      success: true,
      summary: (result?.updated_summary || currentSummary || '').trim(),
      newPattern: result?.new_pattern?.description ? result.new_pattern : null,
    })
  } catch (error) {
    console.error('[update-local-memory] error:', error.message)
    // Gagal itu tidak fatal — client tetap pakai summary lama, coba lagi nanti.
    return res.status(200).json({ success: false, summary: req.body?.currentSummary || null })
  }
}
