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

  // Tambah context dari profile kalau ada (untuk re-compute dari DNA page)
  const profileContext = profile ? `
Data profil yang sudah tersimpan:
- Nama: ${profile.nama || '-'}
- Target: ${profile.target_posisi || '-'}
- Posisi saat ini: ${profile.posisi_saat_ini || '-'}
- Industri: ${profile.industri || '-'}
- Hambatan: ${profile.hambatan || '-'}
` : ''

  const prompt = `Kamu adalah Career Genome Analyzer milik Verneks — sistem analisis karier paling personal di Indonesia.

Tugasmu: analisis percakapan Career Discovery ini dan hasilkan profil karier yang AKURAT, PERSONAL, dan MENGEJUTKAN — bukan template generik.

${profileContext}

Percakapan Discovery:
${convoText}

---

KEMBALIKAN JSON VALID BERIKUT (tanpa backtick markdown, tanpa teks pengantar/penutup, tanpa teks lain apa pun):

{
  "profile_preview": {
    "nama": "nama user jika disebutkan, null jika tidak",
    "target_posisi": "target posisi spesifik",
    "posisi_saat_ini": "posisi saat ini",
    "industri": "industri yang diminati",
    "hambatan_utama": "hambatan NYATA dalam 1 kalimat — bukan surface level, tapi root cause",
    "motivasi": "motivasi terdalam yang tersirat dari percakapan — apa yang sebenarnya mereka kejar",
    "kekuatan_tersembunyi": "1 kekuatan yang mungkin belum mereka sadari sepenuhnya berdasarkan percakapan",
    "gaya_kerja": "gaya kerja yang terdeteksi dari percakapan",
    "urgensi_finansial": "true jika dari percakapan ada tanda user baru di-PHK / menganggur / butuh penghasilan cepat / cemas soal biaya hidup, false jika tidak ada tanda seperti itu",
    "income_situation": "klasifikasikan ke SALAH SATU dari tiga nilai ini persis (tanpa variasi): belum_penghasilan (belum punya penghasilan tetap, butuh kerja/income) | nambah_penghasilan (sudah kerja, mau nambah penghasilan) | ganti_arah (sudah punya karier tapi kurang menjamin/mau ganti arah). Kalau dari percakapan tidak cukup jelas, tebak yang paling mendekati berdasarkan konteks — JANGAN null."
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
  "gap_skills": ["skill1", "skill2", "skill3"],
  "gap_analysis": {
    "summary": "2-3 kalimat diagnosis gap — bukan daftar kekurangan, tapi penjelasan APA yang memisahkan mereka dari target dan KENAPA",
    "root_cause": "1 kalimat root cause terdalam — seringkali bukan soal skill teknis",
    "breakthrough_key": "1 hal yang kalau diselesaikan, akan membuka jalan paling cepat ke target mereka"
  },
  "wow_insight": "1 observasi tajam dan mengejutkan tentang user berdasarkan percakapan — sesuatu yang mereka mungkin belum sadari sendiri. Spesifik, personal, bukan klise.",
  "mentor_message": "Pesan personal dari Diah Anna — 3-4 kalimat. HARUS: 1) Sebut nama jika ada, 2) Akui 1 kekuatan spesifik yang terdeteksi, 3) Sebutkan hambatan utama dengan cara yang empati bukan menghakimi, 4) Beri hint tentang roadmap yang sudah disiapkan. Bahasa Indonesia natural seperti teman senior, BUKAN seperti laporan sistem.",
  "gps_steps": [
    { "title": "Career Assessment", "done": true, "description": "Kamu sudah tahu siapa dirimu dan mau ke mana" },
    { "title": "langkah konkret pertama yang spesifik untuk target user", "done": false, "description": "penjelasan singkat kenapa langkah ini penting" },
    { "title": "langkah kedua yang logis", "done": false, "description": "penjelasan singkat" },
    { "title": "langkah ketiga — ini terkunci", "done": false, "description": "preview singkat" },
    { "title": "langkah keempat — ini terkunci", "done": false, "description": "preview singkat" },
    { "title": "langkah kelima — ini terkunci", "done": false, "description": "preview singkat" }
  ],
  "growth_state": {
    "career_stage": "Career Explorer",
    "progress_percent": 0,
    "current_focus": "fokus utama dalam 5 kata",
    "next_milestone": "milestone pertama yang harus dicapai"
  },
  "eta_months": 0
}

---

ATURAN ANALISIS WAJIB:
1. JANGAN PERNAH menyertakan karakter newline asli (pindah baris dengan menekan tombol Enter) di dalam nilai teks JSON. Jika ingin membuat baris baru pada 'wow_insight' atau 'mentor_message', gunakan string literal \\n secara eksplisit.
2. genome_scores (0-100, berdasarkan PERCAKAPAN bukan asumsi):
   - analytical: suka data, logika, riset, problem solving sistematis
   - leadership: pernah memimpin, inisiatif tinggi, suka pengaruhi orang
   - builder: eksekutor, suka bikin sesuatu, teknis, hands-on
   - creator: kreatif, inovatif, ekspresif, suka ide baru
   - communication: artikulatif, presentasi, networking, persuasif
   - risk_taking: berani ambil risiko, entrepreneurial, nyaman dengan uncertainty

3. career_readiness (0-100): Kesiapan TOTAL (skill + mindset + clarity + resources). Baru mulai: 15-35%, Ada pengalaman: 35-60%, Hampir siap: 60-85%. Realistis, bukan optimistis.
4. career_stage: Career Explorer / Career Builder / Career Professional / Career Expert / Career Leader
5. wow_insight: Harus membuat user berpikir 'bagaimana dia bisa tahu ini?' Berdasarkan pola laten yang muncul dari percakapan.
6. mentor_message: Tulis seperti Diah Anna yang genuinely care, gaya bahasa santai/hangat layaknya pesan WhatsApp dari senior.
7. Kalau "urgensi_finansial" true (ada tanda PHK/menganggur/butuh uang cepat di percakapan): "breakthrough_key" dan "gps_steps" langkah kedua (step pertama setelah Career Assessment) WAJIB berupa opsi PENGHASILAN CEPAT yang realistis dilakukan dalam hitungan minggu — misalnya memonetisasi skill yang sudah ada lewat kerja lepas/jasa, bukan reskilling besar atau rencana jangka panjang. Solusi jangka panjang tetap boleh muncul di langkah-langkah berikutnya, tapi langkah pertama harus yang paling cepat menghasilkan.`

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
