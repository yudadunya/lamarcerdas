// api/extract-profile.js
// ═══════════════════════════════════════════════════════════════════════════
// DINONAKTIFKAN TOTAL (PIVOT — LOCAL-FIRST).
// Dulu file ini ("Self-Care Memory Engine V3", sebelumnya "Career Memory
// Engine") membaca isi percakapan user, menganalisisnya lewat AI jadi profil
// emosional mendalam (emotional_state, hambatan, summary 2-3 paragraf, dst),
// lalu MENULIS semua itu ke Supabase (user_career_profiles, user_genome_scores,
// user_growth_state, user_next_actions, career_events).
//
// Chat.jsx sudah tidak memanggil endpoint ini lagi — tapi karena file ini
// tetap live di /api/extract-profile dan bisa diakses SIAPA SAJA langsung
// lewat URL (terlepas dari apakah UI memanggilnya), endpoint ini WAJIB
// dikosongkan total, bukan cuma "tidak dipakai UI". Kalau nanti dibutuhkan
// analisis semacam ini lagi, lakukan lewat action 'update-local-memory' di
// api/coach-hub.js — pola yang SAMA tapi hasilnya dikembalikan ke client
// untuk disimpan ke IndexedDB, bukan ditulis ke server.
// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  return res.status(200).json({
    success: true,
    deprecated: true,
    reason: 'Endpoint ini tidak lagi menganalisis atau menyimpan apa pun ke server. Memori Diah Anna sekarang sepenuhnya diproses lewat action "update-local-memory" dan disimpan di device user (IndexedDB).',
  })
}
