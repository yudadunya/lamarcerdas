// api/extract-profile.js — Self-Care Memory Engine V3
// PIVOT: dulu "Career Memory Engine" (ekstrak data karier tiap sesi chat).
// Sekarang ekstrak pola emosional & self-care. Nama tabel/kolom Supabase
// SENGAJA dibiarkan sama (user_career_profiles, target_posisi, career_dna,
// dst) supaya tidak perlu migrasi skema — cuma arti & instruksi promptnya
// yang berubah. Lihat komentar serupa di api/compute-genome.js.
import { generateText } from './lib/ai.js'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId, messages } = req.body
  if (!userId || !messages?.length) return res.status(400).json({ error: 'Missing data' })

  const userMsgCount = messages.filter(m => m.role === 'user').length
  if (userMsgCount < 3) return res.status(200).json({ skipped: true, reason: 'too_short' })

  try {
    // ── Load existing profile ──
    const { data: existingProfile } = await supabase
      .from('user_career_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    const existingContext = existingProfile?.summary
      ? `\nPROFIL SEBELUMNYA:\n${JSON.stringify({
          nama: existingProfile.nama,
          posisi_saat_ini: existingProfile.posisi_saat_ini,
          target_posisi: existingProfile.target_posisi,
          industri: existingProfile.industri,
          lama_pengalaman: existingProfile.lama_pengalaman,
          skill_utama: existingProfile.skill_utama,
          motivasi: existingProfile.motivasi,
          hambatan: existingProfile.hambatan,
          summary: existingProfile.summary,
          career_dna: existingProfile.career_dna,
        }, null, 2)}`
      : ''

    const convoText = messages
      .slice(-30)
      .map(m => `${m.role === 'user' ? 'User' : 'Diah Anna'}: ${m.content}`)
      .join('\n')

    // ── Self-Care Memory Engine V3 prompt ──
    const systemPrompt = `Kamu adalah Self-Care Memory Engine V3 milik Verneks.

Baca percakapan antara user dan Diah Anna (teman curhat AI), lalu ekstrak dan analisis pola emosional & self-care user — bukan data karier.

Kembalikan HANYA JSON VALID, tidak ada teks pengantar/penutup, tidak ada backtick markdown (\`\`\`json), tidak ada preamble.

{
  "profile": {
    "nama": "nama user jika ada, null jika tidak",
    "usia": "usia jika ada, null jika tidak",
    "domisili": "kota tempat tinggal jika ada, null jika tidak",
    "pendidikan": "jenjang pendidikan terakhir jika ada, null jika tidak",
    "jurusan": "jurusan jika ada, null jika tidak",
    "posisi_saat_ini": "gambaran singkat kondisi/perasaan user belakangan ini, null jika tidak ada",
    "perusahaan": "tempat kerja/aktivitas utama user jika disebutkan (konteks saja), null jika tidak",
    "industri": "sumber tekanan utama yang terungkap — misalnya pekerjaan, keluarga, pertemanan, percintaan, atau diri sendiri, null jika tidak jelas",
    "lama_pengalaman": "sudah berapa lama user menghadapi kondisi/pola ini jika disebutkan, null jika tidak",
    "skill_utama": ["kekuatan atau cara coping yang teridentifikasi"] atau null,
    "gaji_sekarang": null,
    "target_posisi": "fokus utama user SEKARANG — salah satu: Overthinking / Kesehatan Mental / Hubungan / Self-Care, null jika belum jelas",
    "target_industri": null,
    "target_gaji": null,
    "perusahaan_impian": null,
    "timeline_karir": null,
    "tantangan_karir": "pola pikir/kebiasaan yang bikin user susah lega, null jika tidak",
    "motivasi": "apa yang bikin user pengen ngerasa lebih baik/lebih tenang, null jika ada",
    "progress_lamaran": null,
    "hambatan": "pola atau kebiasaan NYATA yang bikin user susah lega — bukan surface level, tapi akar polanya, null jika tidak",
    "gaya_kerja": "gaya coping yang terdeteksi (memendam sendiri/cerita ke orang lain/mengalihkan ke aktivitas/dll), null jika tidak",
    "emotional_state": "kondisi emosional saat ini dalam 1-2 kata (tenang/cemas/sedih/bingung/lega/overwhelmed/optimis/lelah), null jika tidak jelas",
    "summary": "2-3 paragraf narasi briefing untuk Diah Anna: siapa user ini, apa yang lagi dia hadapi, cara dia biasanya coping, pola yang berulang, dan aspek penting lain supaya sesi curhat berikutnya terasa nyambung. Pakai bahasa Indonesia natural.",
    "topik_dibahas": ["topik1", "topik2"]
  },
  "career_dna": {
    "ambisi": "1 kalimat tentang apa yang sebenarnya user pengen rasakan/capai secara emosional, berdasarkan percakapan",
    "gaya_komunikasi": "direct/reflective/ekspresif/analitis berdasarkan cara user bicara",
    "kekhawatiran_utama": "kekhawatiran terbesar yang tersirat dari percakapan",
    "preferensi_industri": ["topik yang paling sering user angkat — overthinking/kesehatan mental/hubungan/self-care"],
    "nilai_kerja": "hal yang paling penting bagi user dalam merawat dirinya (ketenangan/keterhubungan/kejujuran emosi/kemandirian/dll)"
  },
  "genome_scores": {
    "analytical": 0,
    "leadership": 0,
    "builder": 0,
    "creator": 0,
    "communication": 0,
    "risk_taking": 0
  },
  "growth_state": {
    "career_stage": "Baru Mulai Sadar",
    "progress_percent": 0,
    "current_focus": "apa yang sedang jadi fokus user sekarang",
    "next_milestone": "milestone self-care berikutnya yang realistis",
    "streak_estimate": 0
  },
  "next_action": {
    "title": "1 aksi kecil paling penting buat user coba sekarang",
    "description": "penjelasan singkat kenapa aksi ini penting dan bagaimana melakukannya",
    "estimated_days": 7
  }
}

ATURAN STRICT FORMATTING & ANALISIS:
1. JANGAN PERNAH membuat karakter raw newline (pindah baris dengan tombol Enter) di dalam isi value string teks JSON, khususnya pada bagian 'summary'. Gunakan literal \\n jika ingin memisahkan paragraf.
2. genome_scores (nilai 0-100, berdasarkan sinyal percakapan) — 6 trait self-awareness & emosional:
   - analytical → Self-Awareness: paham & bisa mendeskripsikan pola pikir/emosinya sendiri
   - leadership → Resilience: mampu bangkit dan tetap jalan meski lagi berat
   - builder → Coping Kreatif: mengelola emosi lewat tindakan/aktivitas konstruktif
   - creator → Keterbukaan: terbuka mencoba cara pandang atau pengalaman baru soal dirinya
   - communication → Komunikasi Emosi: bisa mengungkapkan perasaan dengan kata-kata
   - risk_taking → Empati: peka terhadap perasaan diri sendiri maupun orang lain
3. career_stage (pilih SATU): Baru Mulai Sadar / Belajar Mengelola / Lebih Tenang / Cukup Stabil / Sudah Jadi Kebiasaan
4. progress_percent: estimasi seberapa jauh user sudah membangun kesadaran & kebiasaan coping yang sehat (0-100).
${existingContext}`

    const raw = await generateText({
      system: 'Kamu adalah mesin database JSON murni. Output-mu HANYA berisi string JSON valid tanpa embel-embel markdown block, teks pendahuluan, atau teks penutup apa pun.',
      prompt: `Percakapan:\n${convoText}`,
      maxTokens: 1800, // Dinaikkan untuk memberi ruang aman pada text summary multi-paragraf
      tier: 'smart',
      plan: 'premium',
    })

    let memory
    try {
      const clean = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
      memory = JSON.parse(clean)
    } catch (e) {
      console.error('[memory-engine-v3] parse failed:', raw?.slice(0, 300))
      return res.status(200).json({ skipped: true, reason: 'parse_failed' })
    }

    const p = memory.profile || {}

    // ── Merge dengan data lama — jangan overwrite dengan null ──
    const mergeVal = (newVal, oldVal) => (newVal !== null && newVal !== undefined && newVal !== '') ? newVal : (oldVal ?? null)

    // ── 1. Upsert user_career_profiles ──
    await supabase.from('user_career_profiles').upsert({
      user_id:              userId,
      nama:                 mergeVal(p.nama, existingProfile?.nama),
      usia:                 mergeVal(p.usia, existingProfile?.usia),
      domisili:             mergeVal(p.domisili, existingProfile?.domisili),
      pendidikan:           mergeVal(p.pendidikan, existingProfile?.pendidikan),
      jurusan:              mergeVal(p.jurusan, existingProfile?.jurusan),
      posisi_saat_ini:      mergeVal(p.posisi_saat_ini, existingProfile?.posisi_saat_ini),
      perusahaan:           mergeVal(p.perusahaan, existingProfile?.perusahaan),
      industri:             mergeVal(p.industri, existingProfile?.industri),
      lama_pengalaman:      mergeVal(p.lama_pengalaman, existingProfile?.lama_pengalaman),
      skill_utama:          [...new Set([...(existingProfile?.skill_utama || []), ...(p.skill_utama || [])])].slice(0, 15),
      gaji_sekarang:        mergeVal(p.gaji_sekarang, existingProfile?.gaji_sekarang),
      target_posisi:        mergeVal(p.target_posisi, existingProfile?.target_posisi),
      target_industri:      mergeVal(p.target_industri, existingProfile?.target_industri),
      target_gaji:          mergeVal(p.target_gaji, existingProfile?.target_gaji),
      perusahaan_impian:    mergeVal(p.perusahaan_impian, existingProfile?.perusahaan_impian),
      timeline_karir:       mergeVal(p.timeline_karir, existingProfile?.timeline_karir),
      hambatan:             mergeVal(p.hambatan || p.tantangan_karir, existingProfile?.hambatan),
      motivasi:             mergeVal(p.motivasi, existingProfile?.motivasi),
      progress_lamaran:     mergeVal(p.progress_lamaran, existingProfile?.progress_lamaran),
      gaya_kerja:           mergeVal(p.gaya_kerja, existingProfile?.gaya_kerja),
      emotional_state:      mergeVal(p.emotional_state, existingProfile?.emotional_state),
      summary:              p.summary || existingProfile?.summary,
      career_dna:           memory.career_dna || existingProfile?.career_dna,
      topik_dibahas:        [...new Set([...(existingProfile?.topik_dibahas || []), ...(p.topik_dibahas || [])])].slice(0, 30),
      sesi_count:           (existingProfile?.sesi_count || 0) + 1,
      profile_completeness: (() => {
        const fields = [p.nama, p.posisi_saat_ini, p.target_posisi, p.industri,
          p.lama_pengalaman, p.target_gaji, p.motivasi, p.tantangan_karir,
          p.hambatan, p.skill_utama?.length > 0]
        const filled = fields.filter(Boolean).length
        return Math.round((filled / fields.length) * 100)
      })(),
      genome_updated_at:    new Date().toISOString(),
      last_updated:         new Date().toISOString(),
    }, { onConflict: 'user_id' })

    // ── 2. Upsert user_genome_scores ──
    const gs = memory.genome_scores || {}
    const { data: existingGenome } = await supabase
      .from('user_genome_scores').select('*').eq('user_id', userId).maybeSingle()

    const mergeScore = (newVal, oldVal) => {
      const n = newVal || 0
      const o = oldVal || 0
      if (n === 0) return o
      if (o === 0) return n
      return Math.round(n * 0.7 + o * 0.3)
    }

    await supabase.from('user_genome_scores').upsert({
      user_id:       userId,
      analytical:    mergeScore(gs.analytical,    existingGenome?.analytical),
      leadership:    mergeScore(gs.leadership,    existingGenome?.leadership),
      builder:       mergeScore(gs.builder,       existingGenome?.builder),
      creator:       mergeScore(gs.creator,       existingGenome?.creator),
      communication: mergeScore(gs.communication, existingGenome?.communication),
      risk_taking:   mergeScore(gs.risk_taking,   existingGenome?.risk_taking),
      // PERBAIKAN BUG: Akses ke root memory.career_dna, bukan memory.profile.career_dna
      top_strength:  memory.career_dna ? Object.entries(gs).sort((a,b) => b[1]-a[1])[0]?.[0] || existingGenome?.top_strength : existingGenome?.top_strength,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'user_id' })

    // ── 3. Upsert user_growth_state ──
    const gw = memory.growth_state || {}
    const { data: existingGrowth } = await supabase
      .from('user_growth_state').select('*').eq('user_id', userId).maybeSingle()

    await supabase.from('user_growth_state').upsert({
      user_id:         userId,
      career_stage:    gw.career_stage    || existingGrowth?.career_stage    || 'Baru Mulai Sadar',
      progress_percent:gw.progress_percent || existingGrowth?.progress_percent || 0,
      current_focus:   gw.current_focus   || existingGrowth?.current_focus,
      next_milestone:  gw.next_milestone  || existingGrowth?.next_milestone,
      streak_days:     (existingGrowth?.streak_days || 0) + 1,
      gps_steps:       existingGrowth?.gps_steps || existingProfile?.gps_steps || [],
      last_activity:   new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'user_id' })

    // ── 4. Upsert Next Action (Mencegah duplikasi data menumpuk) ──
    if (memory.next_action?.title) {
      await supabase.from('user_next_actions').upsert({
        user_id:        userId,
        title:          memory.next_action.title,
        description:    memory.next_action.description,
        estimated_days: memory.next_action.estimated_days || 7,
        is_done:        false,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'user_id, is_done' }) 
      // Catatan: Pastikan Anda memiliki constraint unik gabungan (user_id, is_done) di Supabase Anda, 
      // atau gunakan tabel penampung aksi aktif tunggal.
    }

    // ── 5. Log career event ──
    await supabase.from('career_events').insert({
      user_id:       userId,
      event_type:    'genome_updated',
      event_payload: {
        stage:    gw.career_stage,
        progress: gw.progress_percent,
      },
      created_at: new Date().toISOString(),
    })

    return res.status(200).json({ success: true, version: 'v3' })

  } catch (error) {
    console.error('[career-memory-engine-v3]', error)
    return res.status(500).json({ error: error.message })
  }
}
