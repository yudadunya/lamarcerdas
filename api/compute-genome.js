// api/compute-genome.js
import { generateText } from './lib/ai.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, profile } = req.body
  if (!messages?.length && !profile) return res.status(400).json({ error: 'Missing data' })

  const userCount = (messages || []).filter(m => m.role === 'user').length
  if (userCount < 2 && !profile) return res.status(400).json({ error: 'Too few messages' })

  // Buat context dari messages
  const convoText = (messages || [])
    .slice(-16)
    .map(m => `${m.role === 'user' ? 'User' : 'Diah Anna'}: ${(m.text || m.content || '').slice(0, 400)}`)
    .join('\n')

  // Tambah context dari profile kalau ada (untuk re-compute dari halaman Diri Kamu)
  const profileContext = profile ? `
Data profil yang sudah tersimpan:
- Nama: ${profile.nama || '-'}
- Fokus utama: ${profile.target_posisi || '-'}
- Kondisi saat ini: ${profile.posisi_saat_ini || '-'}
- Konteks/sumber tekanan: ${profile.industri || '-'}
- Pola yang bikin susah: ${profile.hambatan || '-'}
` : ''

  const prompt = `Kamu adalah Self-Care Pattern Analyzer milik Verneks — sistem yang membaca pola emosional dan cara coping seseorang dari obrolan curhatnya, untuk membantu Diah Anna semakin mengenal user.

Tugasmu: analisis percakapan Discovery ini dan hasilkan profil diri yang AKURAT, PERSONAL, dan terasa "kok bisa tau" — bukan template generik atau nebak-nebak kosong.

${profileContext}

Percakapan Discovery:
${convoText}

---

KEMBALIKAN JSON VALID BERIKUT (tanpa backtick markdown, tanpa teks pengantar/penutup, tanpa teks lain apa pun):

{
  "profile_preview": {
    "nama": "nama user jika disebutkan, null jika tidak",
    "target_posisi": "fokus utama user SEKARANG — pilih salah satu paling dominan: Overthinking / Kesehatan Mental / Hubungan / Self-Care",
    "posisi_saat_ini": "gambaran singkat kondisi/perasaan user belakangan ini, 1 frasa",
    "industri": "sumber tekanan utama — misalnya pekerjaan, keluarga, pertemanan, percintaan, atau diri sendiri",
    "hambatan_utama": "pola pikir atau kebiasaan NYATA yang bikin user susah lega — bukan surface level, tapi akar polanya",
    "motivasi": "apa yang sebenarnya bikin user pengen ngerasa lebih baik/lebih tenang, tersirat dari percakapan",
    "kekuatan_tersembunyi": "1 kekuatan emosional yang mungkin belum mereka sadari sepenuhnya berdasarkan percakapan",
    "gaya_kerja": "gaya coping yang terdeteksi dari percakapan (misalnya: memendam sendiri, cerita ke orang lain, mengalihkan ke aktivitas, dll)",
    "urgensi_finansial": "true jika dari percakapan ada tanda user sedang dalam kondisi emosional berat/overwhelmed saat ini, false jika kondisinya relatif stabil",
    "income_situation": "klasifikasikan ke SALAH SATU dari empat nilai ini persis (tanpa variasi): overthinking | kesehatan_mental | hubungan | self_care. Kalau dari percakapan tidak cukup jelas, pilih yang paling mendekati berdasarkan konteks — JANGAN null."
  },
  "genome_scores": {
    "analytical": 0,
    "leadership": 0,
    "builder": 0,
    "creator": 0,
    "communication": 0,
    "risk_taking": 0
  },
  "career_readiness": 0,
  "top_strength": "salah satu dari: analytical/leadership/builder/creator/communication/risk_taking",
  "gap_skills": ["hal1", "hal2", "hal3"],
  "gap_analysis": {
    "summary": "2-3 kalimat diagnosis pola — bukan daftar kekurangan, tapi penjelasan APA yang bikin user susah ngerasa lega dan KENAPA",
    "root_cause": "1 kalimat akar pola paling dalam — seringkali bukan soal situasi luarnya, tapi cara user memaknainya",
    "breakthrough_key": "1 hal yang kalau mulai dilatih, akan membuka jalan paling cepat buat user ngerasa lebih tenang"
  },
  "wow_insight": "1 observasi tajam dan mengejutkan tentang user berdasarkan percakapan — sesuatu yang mereka mungkin belum sadari sendiri. Spesifik, personal, bukan klise.",
  "mentor_message": "Pesan personal dari Diah Anna — 3-4 kalimat. HARUS: 1) Sebut nama jika ada, 2) Akui 1 kekuatan spesifik yang terdeteksi, 3) Sebutkan pola/hambatan utama dengan cara yang empati bukan menghakimi, 4) Beri hint tentang langkah-langkah self-care yang sudah disiapkan. Bahasa Indonesia natural seperti teman deket, BUKAN seperti laporan sistem.",
  "gps_steps": [
    { "title": "Kenal Diri Sendiri", "done": true, "description": "Kamu sudah mulai cerita dan Diah Anna mulai kenal pola kamu" },
    { "title": "langkah self-care konkret pertama yang spesifik untuk kondisi user", "done": false, "description": "penjelasan singkat kenapa langkah ini penting" },
    { "title": "langkah kedua yang logis", "done": false, "description": "penjelasan singkat" },
    { "title": "langkah ketiga — ini terkunci", "done": false, "description": "preview singkat" },
    { "title": "langkah keempat — ini terkunci", "done": false, "description": "preview singkat" },
    { "title": "langkah kelima — ini terkunci", "done": false, "description": "preview singkat" }
  ],
  "growth_state": {
    "career_stage": "Baru Mulai Sadar",
    "progress_percent": 0,
    "current_focus": "fokus utama dalam 5 kata",
    "next_milestone": "milestone self-care pertama yang bisa dicoba"
  },
  "eta_months": 0
}

---

ATURAN ANALISIS WAJIB:
1. JANGAN PERNAH menyertakan karakter newline asli (pindah baris dengan menekan tombol Enter) di dalam nilai teks JSON. Jika ingin membuat baris baru pada 'wow_insight' atau 'mentor_message', gunakan string literal \\n secara eksplisit.
2. genome_scores (0-100, berdasarkan PERCAKAPAN bukan asumsi) — ini 6 trait self-awareness & emosional, key JSON tetap nama lama tapi ARTINYA sudah beda:
   - analytical → Self-Awareness: paham & bisa mendeskripsikan pola pikir/emosinya sendiri
   - leadership → Resilience: mampu bangkit dan tetap jalan meski lagi berat
   - builder → Coping Kreatif: mengelola emosi lewat tindakan/aktivitas konstruktif (bukan cuma dipendam)
   - creator → Keterbukaan: terbuka mencoba cara pandang atau pengalaman baru soal dirinya
   - communication → Komunikasi Emosi: bisa mengungkapkan perasaan dengan kata-kata, ke Diah Anna maupun orang lain
   - risk_taking → Empati: peka terhadap perasaan diri sendiri maupun orang lain di sekitarnya

3. career_readiness (0-100): skor kesiapan diri secara keseluruhan (kesadaran + kebiasaan coping + kejelasan tentang apa yang dihadapi). Baru mulai sadar: 15-35%, Sudah ada usaha: 35-60%, Sudah cukup stabil: 60-85%. Realistis, bukan optimistis.
4. career_stage (growth_state.career_stage): Baru Mulai Sadar / Belajar Mengelola / Lebih Tenang / Cukup Stabil / Sudah Jadi Kebiasaan
5. wow_insight: Harus membuat user berpikir 'bagaimana dia bisa tahu ini?' Berdasarkan pola laten yang muncul dari percakapan.
6. mentor_message: Tulis seperti Diah Anna yang genuinely care, gaya bahasa santai/hangat layaknya pesan WhatsApp dari teman deket.
7. Kalau "urgensi_finansial" true (ada tanda user sedang overwhelmed/berat banget secara emosional saat ini): "breakthrough_key" dan "gps_steps" langkah kedua (step pertama setelah Kenal Diri Sendiri) WAJIB berupa langkah PALING RINGAN dan cepat dilakukan untuk meredakan tekanan saat ini — misalnya teknik menenangkan diri sederhana, bukan perubahan kebiasaan besar. Langkah yang lebih jangka panjang tetap boleh muncul di langkah-langkah berikutnya, tapi langkah pertama harus yang paling cepat bikin lega.`

  try {
    const raw = await generateText({
      // Diperketat dengan aturan larangan keras markdown block agar aman bagi DeepSeek / Claude
      system: 'Kamu adalah mesin JSON murni. Kamu HANYA boleh mengeluarkan output berupa string JSON valid yang diawali dengan { dan diakhiri dengan }. Dilarang keras menyertakan backtick markdown (```json), teks penjelasan, atau karakter raw newline di luar format string JSON.',
      prompt,
      maxTokens: 2200, // Dinaikkan sedikit untuk mencegah truncation pada pesan mentor yang panjang
      tier: 'smart',
      plan: 'premium', 
    })

    let clean = raw.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
      .replace(/\s*```$/, '').trim()

    const firstBrace = clean.indexOf('{')
    const lastBrace  = clean.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1) {
      clean = clean.slice(firstBrace, lastBrace + 1)
    }

    let result
    try {
      result = JSON.parse(clean)
    } catch (parseErr) {
      console.warn('[compute-genome] JSON truncated atau rusak, menjalankan algoritma perbaikan...')
      let repaired = clean
      let depth = 0, inStr = false, escape = false
      for (const ch of repaired) {
        if (escape)           { escape = false; continue }
        if (ch === '\\')      { escape = true;  continue }
        if (ch === '"' && !inStr) inStr = true
        else if (ch === '"' && inStr) inStr = false
        else if (!inStr && ch === '{') depth++
        else if (!inStr && ch === '}') depth--
      }
      if (inStr) repaired += '"'
      let opens = 0, arrOpens = 0, tmpIn = false
      for (const ch of repaired) {
        if (ch === '"' && !tmpIn) tmpIn = true
        else if (ch === '"' && tmpIn) tmpIn = false
        else if (!tmpIn && ch === '{') opens++
        else if (!tmpIn && ch === '}') opens--
        else if (!tmpIn && ch === '[') arrOpens++
        else if (!tmpIn && ch === ']') arrOpens--
      }
      for (let i = 0; i < arrOpens; i++) repaired += ']'
      for (let i = 0; i < opens;    i++) repaired += '}'
      try {
        result = JSON.parse(repaired)
        console.log('[compute-genome] JSON repair berhasil dieksekusi')
      } catch {
        throw new Error('Struktur JSON rusak parah dan tidak bisa direpair otomatis: ' + parseErr.message)
      }
    }

    return res.status(200).json({ success: true, result })
  } catch (e) {
    console.error('[compute-genome]', e)
    return res.status(500).json({ error: e.message })
  }
}
