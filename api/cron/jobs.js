/**
 * api/cron/jobs.js — Router untuk semua cron jobs
 * Routing via query param: ?job=weekly-review | compress-memory | cleanup | send-chat-reminders
 *
 * Menggabungkan: weekly-review.js + compress-memory.js + cleanup-chat-history.js + email-reminders.js
 * vercel.json cron paths diupdate ke /api/cron/jobs?job=...
 */
import { generateText, generateStructured } from '../lib/ai.js'
import { createClient } from '@supabase/supabase-js'
// FIX: sebelumnya import dari '../lib/email.js' yang TIDAK ADA di project ini
// — bikin seluruh file ini gagal di-load (jadi SEMUA cron job di sini mati,
// bukan cuma notifikasi). Fungsi email sebenarnya ada di notifications.js,
// digabung dengan push (FCM) lewat notifyChatReminder/notifyWeeklyReview.
import { notifyChatReminder, notifyWeeklyReview, notifyOnboardingNudge, notifyMorningNudge, notifyPremiumExpiry, notifyUpgradeNudge, getUserFcmToken } from '../lib/notifications.js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Helper bersama: ambil "konteks personal" user (misi aktif atau topik
// obrolan terakhir) buat bahan kalimat AI yang natural — dipakai baik oleh
// send-chat-reminders (reminder inactivity) maupun morning-nudge (ajakan
// pagi harian), supaya keduanya konsisten personal, bukan cuma salah satunya.
async function getPersonalContext(userId, pendingStepTitle) {
  try {
    const { data: activeMission } = await supabase
      .from('dashboard_missions')
      .select('daily_mission')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let contextText = activeMission?.daily_mission
      ? `Misi yang Diah Anna kasih ke user: "${activeMission.daily_mission}"`
      : null

    if (!contextText) {
      const { data: lastCapsule } = await supabase
        .from('memory_capsule_log')
        .select('capsule_text')
        .eq('user_id', userId)
        .order('capsule_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastCapsule?.capsule_text) contextText = `Topik obrolan terakhir user: "${lastCapsule.capsule_text}"`
    }

    return contextText
      ? `${contextText}${pendingStepTitle ? `\nLangkah roadmap yang masih tertunda: "${pendingStepTitle}"` : ''}`
      : null
  } catch (e) {
    console.error(`[getPersonalContext failed for ${userId}]`, e.message)
    return null
  }
}

export default async function handler(req, res) {
  const authHeader  = req.headers['authorization']
  const isVercelCron = req.headers['x-vercel-cron'] === '1'
  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const job = req.query.job
  if (!job) return res.status(400).json({ error: 'Missing job param' })

  // ── CLEANUP CHAT HISTORY ─────────────────────────────────────────────────
  if (job === 'cleanup') {
    const cutoff = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
    const { error, count } = await supabase
      .from('user_chat_history').delete({ count: 'exact' }).lt('session_date', cutoff)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true, deleted: count, cutoff })
  }

  // ── COMPRESS MEMORY ──────────────────────────────────────────────────────
  if (job === 'compress-memory') {
    const now     = new Date()
    const d30ago  = new Date(now - 30  * 86400000).toISOString().slice(0, 10)
    const d90ago  = new Date(now - 90  * 86400000).toISOString().slice(0, 10)
    const d365ago = new Date(now - 365 * 86400000).toISOString().slice(0, 10)
    let total = 0

    total += await compressTier({ olderThan: d30ago,  from: 'daily',   to: 'weekly',  days: 7,   words: 50 })
    total += await compressTier({ olderThan: d90ago,  from: 'weekly',  to: 'monthly', days: 30,  words: 25 })
    total += await compressTier({ olderThan: d365ago, from: 'monthly', to: 'yearly',  days: 365, words: 10 })

    return res.status(200).json({ success: true, totalCompressed: total })
  }

  // ── WEEKLY REVIEW ────────────────────────────────────────────────────────
  if (job === 'weekly-review') {
    // ═══════════════════════════════════════════════════════════════════════════
    // DINONAKTIFKAN (PIVOT — LOCAL-FIRST).
    // Job ini seluruhnya dibangun di atas career_events, memory_capsule_log,
    // dan user_session_notes — TIGA tabel yang sudah permanen kosong sejak
    // fitur-fitur penulisnya dimatikan (alasan privasi, beberapa sesi lalu).
    // Akibatnya baris `if (events.length === 0 && capsules.length === 0)
    // continue` di bawah selalu true untuk SEMUA user — job ini sebenarnya
    // sudah diam-diam tidak melakukan apa pun sejak saat itu, tanpa error,
    // tanpa ada yang sadar.
    //
    // Daripada dipaksa "diperbaiki" jadi generik (yang risikonya jadi spam
    // mingguan tanpa isi nyata), job ini dimatikan bersih sampai ada
    // keputusan produk: apakah "refleksi mingguan" mau dihidupkan lagi
    // dengan cara yang cocok arsitektur local-first (misal: dihitung di
    // CLIENT dari IndexedDB, server cuma trigger notifikasinya tanpa pernah
    // lihat isinya) — itu keputusan desain terpisah, bukan sekadar bug fix.
    // ═══════════════════════════════════════════════════════════════════════════
    return res.status(200).json({ success: true, skipped: true, reason: 'weekly_review_disabled_pending_local_first_redesign' })
  }

  // ── SEND CHAT REMINDERS ──────────────────────────────────────────────────
  if (job === 'send-chat-reminders') {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString()

    // PIVOT — LOCAL-FIRST: sebelumnya query dari `user_career_profiles`
    // (cuma keisi kalau user pernah selesai /discovery — sekarang bukan
    // gerbang wajib lagi, jadi hampir semua user baru KEFILTER KELUAR dan
    // nggak pernah dapat reminder ini sama sekali). Sekarang sumbernya
    // langsung dari auth.users — SEMUA user terdaftar, tanpa syarat apa pun.
    const { data: { users: authUsers }, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 100 })
    if (usersErr) return res.status(500).json({ error: usersErr.message })
    if (!authUsers?.length) return res.status(200).json({ success: true, sent: 0 })

    // "Kapan terakhir aktif" sekarang dari tabel user_last_active (cuma
    // timestamp, diupdate tiap kali chat — lihat api/coach-hub.js). Tabel
    // lama yang dipakai buat ini (user_session_notes) sudah permanen kosong
    // sejak fitur yang nulisnya dimatikan (alasan privasi).
    const { data: activityRows } = await supabase
      .from('user_last_active')
      .select('user_id, last_active_at')
    const lastActiveMap = new Map((activityRows || []).map(r => [r.user_id, r.last_active_at]))

    const results = []
    const WARM_FALLBACKS = [
      'Udah beberapa hari nih kita nggak ngobrol. Aku di sini kalau kamu mau cerita apa aja.',
      'Cuma mau bilang, aku masih di sini kok kalau kamu butuh tempat cerita.',
      'Nggak ada topik khusus — cuma pengen bilang aku selalu ada kalau kamu mau ngobrol.',
    ]

    for (const authUser of authUsers) {
      try {
        const lastActive = lastActiveMap.get(authUser.id)
        if (lastActive && new Date(lastActive) >= new Date(twoDaysAgo)) {
          results.push({ userId: authUser.id, status: 'skipped', reason: 'recently_active' })
          continue
        }

        const fcmToken = await getUserFcmToken(authUser.id)
        const userName = authUser.user_metadata?.full_name?.trim() || authUser.email?.split('@')[0] || 'Teman'
        const personalLine = WARM_FALLBACKS[Math.floor(Math.random() * WARM_FALLBACKS.length)]

        if (authUser.email || fcmToken) {
          const notifyResult = await notifyChatReminder(authUser.email, fcmToken, userName, personalLine)
          const ok = notifyResult.email?.success || notifyResult.push?.success
          if (ok) {
            results.push({ userId: authUser.id, status: 'sent', detail: notifyResult })
          } else {
            results.push({ userId: authUser.id, status: 'failed', detail: notifyResult })
          }
        } else {
          results.push({ userId: authUser.id, status: 'skipped', reason: 'no_email_or_fcm' })
        }
      } catch (e) {
        results.push({ userId: authUser.id, status: 'failed', error: e.message })
      }
    }

    const sent = results.filter(r => r.status === 'sent').length
    return res.status(200).json({
      success: true,
      processed: results.length,
      sent,
    })
  }

  // ── ONBOARDING NUDGE (Discovery selesai, belum chat pertama) ─────────────
  if (job === 'onboarding-nudge') {
    const h24 = new Date(Date.now() - 24 * 3600 * 1000)
    const h48 = new Date(Date.now() - 48 * 3600 * 1000)

    // PIVOT — LOCAL-FIRST: sebelumnya sumbernya user_career_profiles (cuma
    // keisi kalau selesai /discovery — sekarang opsional, jadi nge-skip
    // hampir semua user baru). Sekarang langsung dari auth.users, pakai
    // waktu SIGNUP (created_at) sebagai penanda "user baru" — bukan lagi
    // "kapan profil Discovery-nya dibuat".
    const { data: { users: authUsers }, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 100 })
    if (usersErr) return res.status(500).json({ error: usersErr.message })

    const candidates = (authUsers || []).filter(u => {
      const created = new Date(u.created_at)
      return created >= h48 && created <= h24
    })
    if (!candidates.length) return res.status(200).json({ success: true, sent: 0 })

    // "Udah pernah chat belum" sekarang dari user_last_active (timestamp
    // saja) — pengecekan lama baca user_session_notes yang sudah permanen
    // kosong (selalu `false`, jadi dulu diam-diam SELALU ngirim nudge ini
    // ke semua orang di window waktu itu, termasuk yang sudah aktif chat).
    const { data: activityRows } = await supabase
      .from('user_last_active')
      .select('user_id')
      .in('user_id', candidates.map(u => u.id))
    const alreadyActiveSet = new Set((activityRows || []).map(r => r.user_id))

    const results = []
    for (const authUser of candidates) {
      try {
        if (alreadyActiveSet.has(authUser.id)) {
          results.push({ userId: authUser.id, status: 'skipped', reason: 'already_chatted' })
          continue
        }

        const fcmToken = await getUserFcmToken(authUser.id)
        const userName = authUser.user_metadata?.full_name?.trim() || authUser.email?.split('@')[0] || 'Teman'
        if (authUser.email || fcmToken) {
          const notifyResult = await notifyOnboardingNudge(authUser.email, fcmToken, userName)
          const ok = notifyResult.email?.success || notifyResult.push?.success
          results.push({ userId: authUser.id, status: ok ? 'sent' : 'failed', detail: notifyResult })
        }
      } catch (e) {
        results.push({ userId: authUser.id, status: 'failed', error: e.message })
      }
    }

    return res.status(200).json({
      success: true,
      processed: results.length,
      sent: results.filter(r => r.status === 'sent').length,
    })
  }

  // ── MORNING NUDGE (ajakan pagi harian, nadanya BEDA dari inactivity reminder)
  // Beda dari 'send-chat-reminders' (yang cuma nyala kalau sudah 2 hari absen),
  // ini jalan tiap pagi ke semua user — TAPI di-skip kalau user itu sudah chat
  // HARI INI, supaya tidak terasa spam ke user yang sebenarnya sudah aktif.
  if (job === 'morning-nudge') {
    // Bypass khusus testing manual: ?force=1 skip pengecekan "sudah aktif
    // hari ini" — supaya kamu bisa re-test job ini berkali-kali di hari
    // yang sama tanpa nunggu besok. Aman dipakai publik-tanpa-abuse karena
    // endpoint ini sudah di-gate CRON_SECRET di atas (baris ~24) — orang
    // luar tidak bisa panggil ini sama sekali tanpa secret itu.
    const forceTest = req.query.force === '1'
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)

    // PIVOT — LOCAL-FIRST: sumber user langsung dari auth.users (SEMUA user
    // terdaftar), bukan lagi dari user_career_profiles yang mensyaratkan
    // career_readiness (peninggalan gerbang /discovery yang sekarang
    // opsional) — filter lama itu bikin semua user baru sejak pivot nggak
    // pernah dapat notifikasi pagi sama sekali.
    const { data: { users: authUsers }, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 100 })
    if (usersErr) return res.status(500).json({ error: usersErr.message })
    if (!authUsers?.length) return res.status(200).json({ success: true, sent: 0 })

    // "Udah aktif hari ini belum" sekarang dari user_last_active (timestamp
    // saja) — pengecekan lama baca dari user_chat_history yang sudah
    // permanen kosong sejak fitur penulisnya dimatikan (alasan privasi),
    // yang tanpa disadari bikin morning-nudge ngirim ke SEMUA orang SETIAP
    // HARI tanpa peduli mereka udah chat apa belum.
    const { data: activityRows } = await supabase
      .from('user_last_active')
      .select('user_id, last_active_at')
    const lastActiveMap = new Map((activityRows || []).map(r => [r.user_id, r.last_active_at]))

    const results = []
    const WARM_FALLBACKS = [
      'Ada waktu buat ngobrol bentar hari ini? Aku di sini kalau kamu mau cerita.',
      'Pagi! Nggak perlu topik khusus, cerita apa aja boleh kalau lagi pengen.',
      'Semoga hari ini baik-baik aja. Aku di sini kalau kamu mau mampir cerita.',
    ]

    for (const authUser of authUsers) {
      try {
        if (!forceTest) {
          const lastActive = lastActiveMap.get(authUser.id)
          if (lastActive && new Date(lastActive) >= todayStart) {
            results.push({ userId: authUser.id, status: 'skipped', reason: 'already_active_today' })
            continue
          }
        }

        const fcmToken = await getUserFcmToken(authUser.id)
        if (!fcmToken) {
          results.push({ userId: authUser.id, status: 'skipped', reason: 'no_active_fcm_token' })
          continue
        }

        const userName = authUser.user_metadata?.full_name?.trim() || authUser.email?.split('@')[0] || 'Teman'
        // Konten sekarang dari pool pesan hangat yang sudah ditulis manual
        // (bukan generate AI per-user lagi) — lebih murah, dan menghindari
        // risiko AI ngarang keluar dari karakter Diah Anna (pernah kejadian:
        // notifikasi/balasan nyasar jadi nada "business/career coach").
        const personalLine = WARM_FALLBACKS[Math.floor(Math.random() * WARM_FALLBACKS.length)]

        const notifyResult = await notifyMorningNudge(fcmToken, userName, personalLine)
        const ok = notifyResult.push?.success
        results.push({
          userId: authUser.id,
          status: ok ? 'sent' : 'failed',
          reason: ok ? undefined : (notifyResult.push?.error || 'unknown_push_error'),
        })
      } catch (e) {
        results.push({ userId: authUser.id, status: 'failed', reason: e.message })
      }
    }

    return res.status(200).json({
      success: true,
      processed: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
      details: results, // breakdown per user — hapus/kecilkan ini kalau user-base sudah besar, buat sekarang berguna buat debug
    })
  }

  // ── PREMIUM EXPIRY REMINDER — persuasif tapi halus, loss-aversion framing.
  // Kirim pada titik spesifik (3 hari sebelum, 1 hari sebelum, 2 hari setelah
  // expired) — BUKAN tiap hari selama user belum perpanjang, supaya nggak
  // berubah jadi spam yang justru bikin user makin males balik.
  if (job === 'premium-expiry-reminder') {
    const forceTest = req.query.force === '1'

    const { data: subs, error: subsErr } = await supabase
      .from('subscriptions')
      .select('user_id, expires_at, status')
      .eq('plan', 'premium')
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .limit(200)

    if (subsErr) return res.status(500).json({ error: subsErr.message })
    if (!subs?.length) return res.status(200).json({ success: true, processed: 0 })

    const now = Date.now()
    const results = []

    for (const sub of subs) {
      try {
        const daysUntilExpiry = Math.ceil((new Date(sub.expires_at).getTime() - now) / 86400000)

        // Titik kirim: H-3, H-1, atau H+2 (win-back setelah expired).
        // Testing (?force=1) bypass ini, kirim ke siapapun premium yang lolos query di atas.
        const isTargetDay = [3, 1, -2].includes(daysUntilExpiry)
        if (!forceTest && !isTargetDay) {
          results.push({ userId: sub.user_id, status: 'skipped', reason: `not_target_day(${daysUntilExpiry})` })
          continue
        }

        const fcmToken = await getUserFcmToken(sub.user_id)
        if (!fcmToken) {
          results.push({ userId: sub.user_id, status: 'skipped', reason: 'no_active_fcm_token' })
          continue
        }

        const { data: profile } = await supabase
          .from('user_career_profiles')
          .select('nama')
          .eq('user_id', sub.user_id)
          .maybeSingle()

        // FIX: `authUser` dipakai di sini sebelumnya tapi TIDAK PERNAH
        // didefinisikan di scope job ini — ReferenceError tiap kali
        // `profile?.nama` kosong (yang sekarang jadi kasus umum untuk user
        // local-first yang belum pernah isi Discovery). Ambil langsung dari
        // Supabase Auth buat fallback nama yang benar.
        let userName = profile?.nama?.trim()
        if (!userName) {
          const { data: authData } = await supabase.auth.admin.getUserById(sub.user_id)
          userName = authData?.user?.user_metadata?.full_name?.trim() || authData?.user?.email?.split('@')[0] || 'Teman'
        }

        // PIVOT: framing loss-aversion sekarang soal kuota chat harian &
        // kualitas balasan (fitur premium yang beneran ada), bukan lagi
        // "progress GPS Karier" / akses "Journey & Peluang" yang sudah tidak
        // jadi selling point utama produk ini.
        let personalLine = null
        try {
          personalLine = await generateText({
            system: `Kamu Diah Anna, teman curhat AI di Verneks. Tulis SATU kalimat pendek (maks 20 kata) untuk notifikasi push soal Premium yang ${daysUntilExpiry < 0 ? 'baru saja habis masa aktifnya' : 'akan segera habis masa aktifnya'}.

ATURAN PENTING — PERSUASIF TAPI HALUS:
- Fokus ke apa yang akan/sudah HILANG (loss aversion) — kuota chat harian yang lebih luas, kualitas balasan yang lebih baik — BUKAN daftar fitur teknis atau harga.
- JANGAN pakai bahasa hard-sell ("promo terbatas!", "jangan lewatkan!", tanda seru berlebihan, huruf kapital semua).
- JANGAN pakai kata "harus" atau menekan — framingnya "sayang kalau", bukan "wajib".
- Satu emoji opsional, tidak wajib.
- WAJIB: balas HANYA kalimatnya, tanpa penjelasan/meta-commentary apa pun.`,
            prompt: `Tulis 1 kalimat yang halus soal kuota chat harian yang lebih luas yang akan/sudah tidak bisa diakses lagi.`,
            maxTokens: 60, tier: 'fast',
          })
          personalLine = personalLine?.trim().replace(/^"|"$/g, '') || null
        } catch (aiErr) {
          console.error(`[premium-expiry-reminder personalLine failed for ${sub.user_id}]`, aiErr)
        }

        const notifyResult = await notifyPremiumExpiry(fcmToken, userName, personalLine, daysUntilExpiry)
        const ok = notifyResult.push?.success
        results.push({
          userId: sub.user_id, daysUntilExpiry,
          status: ok ? 'sent' : 'failed',
          reason: ok ? undefined : (notifyResult.push?.error || 'unknown_push_error'),
        })
      } catch (e) {
        results.push({ userId: sub.user_id, status: 'failed', reason: e.message })
      }
    }

    return res.status(200).json({
      success: true,
      processed: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
      details: results,
    })
  }

  // ── FREE UPGRADE NUDGE — value/progress framing (beda dari loss-aversion
  // di atas, karena user ini belum pernah punya akses Premium sama sekali).
  // Jadwal MINGGUAN (bukan harian) — sengaja jarang, supaya halus dan tidak
  // berubah jadi tekanan terus-menerus yang bisa bikin user malah defensif.
  if (job === 'free-upgrade-nudge') {
    // PIVOT — LOCAL-FIRST: sebelumnya sumbernya user_career_profiles
    // (mensyaratkan career_readiness, peninggalan gerbang /discovery yang
    // sekarang opsional — nge-skip hampir semua user baru) DAN "engagement"
    // diukur dari depth_score, yang juga sudah permanen berhenti terisi
    // sejak fitur penulisnya (handleEndSession) dimatikan. Sekarang sumber
    // user dari auth.users langsung, dan "engaged" diukur dari ADA-TIDAKNYA
    // baris di user_last_active (= pernah chat minimal sekali).
    const { data: { users: authUsers }, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 150 })
    if (usersErr) return res.status(500).json({ error: usersErr.message })
    if (!authUsers?.length) return res.status(200).json({ success: true, processed: 0 })

    const { data: activityRows } = await supabase
      .from('user_last_active')
      .select('user_id')
      .in('user_id', authUsers.map(u => u.id))
    const everChattedSet = new Set((activityRows || []).map(r => r.user_id))

    const { data: subsAll } = await supabase
      .from('subscriptions')
      .select('user_id, plan, status, expires_at')
      .in('user_id', authUsers.map(u => u.id))
    const subMap = new Map()
    for (const s of subsAll || []) {
      // Kalau ada beberapa baris per user, simpan yang paling baru dibuat —
      // asumsikan hasil query sudah cukup, tidak perlu sort ketat di sini
      // untuk job non-kritikal seperti ini.
      if (!subMap.has(s.user_id)) subMap.set(s.user_id, s)
    }

    const results = []

    for (const authUser of authUsers) {
      try {
        // Skip user yang sedang/pernah premium — job ini KHUSUS free murni.
        const sub = subMap.get(authUser.id)
        const isPremiumNow = sub?.plan === 'premium' && sub?.status === 'active'
          && (!sub.expires_at || new Date(sub.expires_at) > new Date())
        if (isPremiumNow) {
          results.push({ userId: authUser.id, status: 'skipped', reason: 'currently_premium' })
          continue
        }

        // Cuma target user yang pernah chat minimal sekali — nudge ke user
        // yang baru daftar & belum aktif sama sekali biasanya konversinya
        // rendah dan terasa lebih kayak spam ke user yang belum kenal produknya.
        if (!everChattedSet.has(authUser.id)) {
          results.push({ userId: authUser.id, status: 'skipped', reason: 'not_engaged_enough' })
          continue
        }

        const fcmToken = await getUserFcmToken(authUser.id)
        if (!fcmToken) {
          results.push({ userId: authUser.id, status: 'skipped', reason: 'no_active_fcm_token' })
          continue
        }

        const userName = authUser.user_metadata?.full_name?.trim() || authUser.email?.split('@')[0] || 'Teman'

        // PIVOT: value framing sekarang soal ngobrol lebih leluasa tanpa
        // batas kuota harian, bukan lagi "progress GPS Karier" / "Journey".
        let personalLine = null
        try {
          personalLine = await generateText({
            system: `Kamu Diah Anna, teman curhat AI di Verneks. Tulis SATU kalimat pendek (maks 20 kata) untuk notifikasi push mengajak user FREE upgrade ke Premium.

ATURAN PENTING — PERSUASIF TAPI HALUS:
- Framing-nya VALUE — bisa ngobrol lebih leluasa tanpa batas kuota harian, bukan daftar fitur teknis atau harga.
- JANGAN hard-sell, JANGAN tanda seru berlebihan, JANGAN kata "harus"/"wajib".
- Satu emoji opsional.
- WAJIB: balas HANYA kalimatnya, tanpa penjelasan/meta-commentary apa pun.`,
            prompt: `Tulis 1 kalimat ajakan upgrade yang halus, framing-nya bisa ngobrol lebih leluasa tanpa batas kuota harian.`,
            maxTokens: 60, tier: 'fast',
          })
          personalLine = personalLine?.trim().replace(/^"|"$/g, '') || null
        } catch (aiErr) {
          console.error(`[free-upgrade-nudge personalLine failed for ${authUser.id}]`, aiErr)
        }

        const notifyResult = await notifyUpgradeNudge(fcmToken, userName, personalLine)
        const ok = notifyResult.push?.success
        results.push({
          userId: authUser.id,
          status: ok ? 'sent' : 'failed',
          reason: ok ? undefined : (notifyResult.push?.error || 'unknown_push_error'),
        })
      } catch (e) {
        results.push({ userId: authUser.id, status: 'failed', reason: e.message })
      }
    }

    return res.status(200).json({
      success: true,
      processed: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
      details: results,
    })
  }

  // ── GENERATE DAILY ARTICLE — auto-publish satu artikel SEO baru per hari.
  if (job === 'generate-daily-article') {
    // PIVOT (Agustus 2026): Verneks bukan lagi career coach — sekarang teman
    // curhat AI (Diah Anna). Pool topik & kategori diganti total supaya
    // selaras dengan brand baru, dikelompokkan ke 4 kategori yang sekarang
    // dipakai Blog.jsx (Overthinking, Kesehatan Mental, Hubungan, Self-Care).
    // Topik dipilih yang evergreen (nggak terikat tahun/tren) dan genuinely
    // membantu — bukan clickbait soal kesehatan mental.
    const TOPIC_POOL = [
      // Overthinking
      'Cara Berhenti Mikirin Ucapan yang Salah Berjam-Jam Setelahnya',
      'Kenapa Kita Sering Membayangkan Skenario Terburuk yang Belum Tentu Terjadi',
      'Cara Berhenti Overthinking Sebelum Kirim Pesan Penting',
      'Overthinking Setelah Ngobrol: Kenapa Kita Suka Replay Percakapan',
      'Cara Mengenali Kapan Mikir Jadi Overthinking, Bukan Lagi Berpikir Jernih',
      'Kenapa Keputusan Kecil Kadang Terasa Lebih Berat dari Keputusan Besar',
      'Cara Menenangkan Pikiran Saat Semua Terasa Nggak Terkendali',
      'Overthinking soal Masa Depan: Cara Fokus ke yang Bisa Dikontrol Hari Ini',
      'Kenapa Kita Suka Mikirin Apa Kata Orang Padahal Belum Tentu Mereka Mikirin Itu',
      'Cara Keluar dari Pikiran yang Muter-Muter Tanpa Ujung',
      // Kesehatan Mental
      'Beda Capek Biasa dan Tanda-Tanda Burnout yang Sering Diabaikan',
      'Kenapa Kadang Kita Nangis Tanpa Tahu Alasan Pastinya',
      'Cara Mengenali Kalau Kamu Butuh Istirahat, Bukan Cuma Butuh Liburan',
      'Perbedaan Sedih Biasa dan Saatnya Bicara ke Profesional',
      'Kenapa "Positive Thinking Aja" Kadang Nggak Membantu',
      'Cara Menghadapi Hari yang Berat Tanpa Memaksa Diri Baik-Baik Saja',
      'Kenapa Perasaan Bersalah Sering Muncul Padahal Nggak Melakukan Kesalahan',
      'Cara Mengenali Pola Pikir yang Terlalu Keras ke Diri Sendiri',
      'Kenapa Istirahat Kadang Terasa Bersalah, Padahal Dibutuhkan',
      'Cara Menjaga Kesehatan Mental Saat Lagi di Fase Transisi Hidup',
      // Hubungan
      'Cara Ngomong Perasaan ke Orang Terdekat Tanpa Takut Merusak Hubungan',
      'Tanda Kamu Terlalu Banyak Mengalah dalam Hubungan Pertemanan',
      'Cara Menghadapi Teman yang Cuma Muncul Saat Butuh',
      'Kenapa Susah Percaya Lagi Setelah Dikecewakan Berkali-Kali',
      'Cara Menjaga Hubungan Jarak Jauh dengan Keluarga yang Sehat',
      'Tanda Kamu Butuh Ruang Sendiri dalam Hubungan, Bukan Berarti Nggak Sayang',
      'Cara Menghadapi Konflik dengan Orang Tua yang Beda Generasi',
      'Kenapa Kadang Lebih Gampang Curhat ke Orang Asing Daripada Orang Dekat',
      'Cara Mengakhiri Pertemanan yang Sudah Nggak Sehat Tanpa Drama',
      'Tanda Hubungan yang Sehat, yang Sering Dianggap Biasa Aja',
      // Self-Care
      'Self-Care Murah yang Beneran Efektif, Bukan Cuma Belanja',
      'Cara Membangun Rutinitas Pagi yang Nggak Bikin Stres Duluan',
      'Kenapa Journaling Membantu, dan Cara Mulai Tanpa Ribet',
      'Cara Istirahat yang Beneran Mengisi Ulang Energi, Bukan Cuma Rebahan',
      'Pentingnya Me Time yang Sebenarnya, Bukan Cuma Scroll HP',
      'Cara Membangun Kebiasaan Kecil yang Bikin Hari Terasa Lebih Ringan',
      'Kenapa Merayakan Progres Kecil Itu Penting, Bukan Cuma Hasil Akhir',
      'Cara Mengatur Waktu Layar Tanpa Merasa Serba Salah',
      'Self-Compassion: Cara Bersikap Baik ke Diri Sendiri Saat Gagal',
      'Cara Membangun Batasan yang Sehat Tanpa Merasa Egois',
    ]

    // Cek slug/title yang udah pernah dipakai — hindari topik double persis.
    const { data: existingArticles } = await supabase
      .from('blog_articles')
      .select('title')
      .order('created_at', { ascending: false })
      .limit(500)
    const usedTitles = new Set((existingArticles || []).map(a => a.title))
    const availableTopics = TOPIC_POOL.filter(t => !usedTitles.has(t))

    if (availableTopics.length === 0) {
      return res.status(200).json({ success: true, skipped: true, reason: 'topic_pool_exhausted — tambahkan topik baru ke TOPIC_POOL' })
    }

    const topic = availableTopics[Math.floor(Math.random() * availableTopics.length)]
    const topicIdx = TOPIC_POOL.indexOf(topic)
    const category = topicIdx < 10 ? 'Overthinking'
      : topicIdx < 20 ? 'Kesehatan Mental'
      : topicIdx < 30 ? 'Hubungan' : 'Self-Care'

    const ARTICLE_SCHEMA = {
      type: 'object',
      properties: {
        title:    { type: 'string', description: 'Judul final artikel, boleh sedikit dipoles dari topik asal biar lebih menarik/SEO-friendly, tapi jangan ganti makna' },
        slug:     { type: 'string', description: 'URL slug: huruf kecil, dash sebagai spasi, tanpa karakter spesial, tanpa tahun kalau tidak perlu, contoh: cara-bikin-cv-ats-friendly' },
        excerpt:  { type: 'string', description: 'Ringkasan 1-2 kalimat, maksimal 160 karakter, buat meta description' },
        emoji:    { type: 'string', description: 'Satu emoji yang merepresentasikan topik' },
        readTime: { type: 'string', description: 'Estimasi waktu baca, format: "X menit"' },
        keywords: { type: 'array', items: { type: 'string' }, description: '4-6 keyword SEO relevan dalam Bahasa Indonesia' },
        faq: {
          type: 'array',
          items: {
            type: 'object',
            properties: { q: { type: 'string' }, a: { type: 'string' } },
            required: ['q', 'a'],
          },
          description: '4-5 pertanyaan FAQ yang benar-benar sering dicari orang soal topik ini, jawaban 1-3 kalimat padat dan faktual (buat FAQPage schema — disukai Google & AI search engine kayak ChatGPT/Perplexity)',
        },
        content: {
          type: 'string',
          description: `Isi artikel lengkap 700-1000 kata dalam format markdown sederhana: ## buat heading, ### buat subheading, - buat bullet list, > buat blockquote/tips penting, **teks** buat bold. JANGAN pakai heading H1 (judul sudah terpisah). Tulis dengan gaya natural, contoh konkret, dan classic pattern yang mudah dikutip AI search engine: kalimat-kalimat yang bisa berdiri sendiri sebagai jawaban faktual. Angka/kisaran (gaji, persentase, dst) BOLEH dipakai sebagai ILUSTRASI/skenario contoh ("misalnya kalau gajimu Rp7 juta..."), TAPI JANGAN diatasnamakan ke "penelitian", "studi", atau lembaga resmi (BPS, kementerian, dst) kecuali benar-benar yakin itu data nyata — mengarang sumber/statistik itu pelanggaran serius, bukan sekadar gaya.`,
        },
      },
      required: ['title', 'slug', 'excerpt', 'emoji', 'readTime', 'keywords', 'faq', 'content'],
    }

    try {
      const article = await generateStructured({
        system: `Kamu adalah content writer untuk Verneks — platform teman curhat AI (Diah Anna) untuk audiens muda Indonesia. Tulis artikel yang genuinely membantu soal overthinking, kesehatan mental sehari-hari, hubungan, dan self-care — bukan artikel tipis isi ulang generik. Gaya bahasa: hangat, santai, seperti Diah Anna ngobrol sama teman dekat — bukan kaku seperti textbook psikologi atau artikel kesehatan formal. Tulis SEMUA dalam Bahasa Indonesia.

ATURAN KHUSUS KONTEN KESEHATAN MENTAL (WAJIB DIPATUHI — lebih penting dari gaya bahasa):
- JANGAN pernah memberi diagnosis atau menyebut pembaca "kemungkinan mengidap [kondisi tertentu]". Kamu bukan tenaga profesional dan artikel ini bukan alat diagnosis.
- JANGAN berikan saran dosis, nama obat, atau instruksi teknis penanganan krisis (self-harm, bunuh diri) dalam bentuk apa pun — kalau topik menyentuh area itu, arahkan pembaca untuk bicara ke profesional atau layanan krisis, jangan beri instruksi self-help sebagai gantinya.
- SETIAP artikel yang membahas kondisi yang bisa serius (burnout berat, rasa kosong berkepanjangan, dst) WAJIB menyertakan satu paragraf yang mengingatkan pembaca untuk bicara ke psikolog/profesional kalau kondisinya menetap lama atau mengganggu fungsi harian — jangan lewati bagian ini.
- Jangan membuat pembaca merasa masalahnya "kecil" atau "lebay" — tapi juga jangan mendramatisir hal yang wajar jadi terdengar seperti gangguan klinis.
- Tulisan boleh terasa related dan personal, tapi jangan berpura-pura penulisnya (Diah Anna) pernah "mengalami sendiri" pengalaman hidup manusia nyata — dia AI, bukan orang yang benar-benar mengalami hal yang diceritakan.

HINDARI TANDA-TANDA TULISAN AI (PENTING — Google punya sistem yang aktif menurunkan ranking konten yang "kebaca AI generik", dan pembaca juga makin gampang mengenali & tidak percaya konten kayak gitu):
- JANGAN buka paragraf atau artikel dengan basa-basi generik ("Di era digital saat ini...", "Dalam dunia kerja yang semakin kompetitif...", "Seiring berkembangnya zaman..."). Langsung masuk ke poin, cerita konkret, atau fakta spesifik.
- JANGAN pakai pola kontras "bukan hanya X, tapi juga Y" atau "bukan X, melainkan Y" lebih dari sekali dalam satu artikel — ini pola paling gampang dikenali sebagai tulisan AI.
- JANGAN tutup artikel dengan frasa klise ("Kesimpulannya...", "Pada akhirnya...", "Intinya adalah..."). Tutup dengan poin aksi konkret atau ajakan spesifik, bukan rangkuman generik dari apa yang barusan ditulis.
- JANGAN pakai hedging kosong ("penting untuk diingat bahwa", "perlu dicatat bahwa", "tidak dapat dipungkiri bahwa") — langsung nyatakan faktanya.
- HINDARI daftar tiga kata sifat yang dipaksakan ("cepat, mudah, dan efisien") kalau nggak ada dasarnya di kalimat itu — sebutkan detail spesifik (angka, contoh, skenario nyata), bukan kata sifat generik berderet.
- VARIASIKAN panjang kalimat — jangan semua kalimat berirama sama. Selingi kalimat pendek di antara kalimat yang lebih panjang dan detail, seperti orang beneran menjelaskan, bukan pola rapi yang berulang.
- Pakai tanda pisah (—) secukupnya, jangan jadi tongkat penopang di hampir tiap kalimat.

JANGAN MENGARANG DATA (PALING PENTING — pelanggaran ini lebih serius daripada gaya bahasa kaku): JANGAN sebut angka statistik spesifik yang diatasnamakan ke lembaga/penelitian/studi tertentu ("Data BPS 2023 menunjukkan...", "Penelitian psikologi kerja 2022 mencatat...", "Studi X menunjukkan Y%") KECUALI kamu benar-benar yakin itu fakta nyata yang umum diketahui. Kalau tidak yakin datanya nyata:
- Jangan atasnamakan ke lembaga resmi (BPS, kementerian, universitas, dst) sama sekali kecuali benar-benar pasti.
- Kalau mau kasih gambaran angka, pakai bahasa qualitative/perkiraan yang jujur ("umumnya", "banyak kasus menunjukkan", "sebagai gambaran kasar") — BUKAN angka presisi palsu yang diklaim dari "penelitian" yang tidak nyata.
- Lebih baik kasih contoh skenario konkret ("misalnya kalau gaji kamu Rp7 juta tapi kebutuhan pokok sudah Rp8 juta...") daripada statistik yang diakui-akui dari sumber tidak jelas.
- Fabrikasi data yang diatasnamakan lembaga nyata (kayak BPS) bisa jadi masalah reputasi/hukum serius kalau ketauan — ini bukan pelanggaran gaya, ini pelanggaran integritas konten.`,
        prompt: `Tulis artikel lengkap dengan topik: "${topic}"\n\nKategori: ${category}\n\nPastikan konten benar-benar actionable dengan langkah konkret, bukan cuma teori umum.`,
        schema: ARTICLE_SCHEMA,
        maxTokens: 3000,
        tier: 'fast',
        plan: 'free', // Cerebras dulu (murah, cepat) — fallback Gemini → Claude Haiku kalau Cerebras gagal
      })

      const { error: insertErr } = await supabase.from('blog_articles').insert({
        slug:        article.slug,
        title:       article.title,
        excerpt:     article.excerpt,
        category,
        emoji:       article.emoji || '📄',
        keywords:    article.keywords || [],
        faq:         article.faq || [],
        content:     article.content,
        read_time:   article.readTime || '5 menit',
        published_at: new Date().toISOString(),
      })

      if (insertErr) {
        // Kemungkinan besar slug bentrok (unique constraint) — tambahkan suffix & retry sekali
        if (insertErr.message.includes('duplicate') || insertErr.code === '23505') {
          const retrySlug = `${article.slug}-${Date.now().toString(36)}`
          const { error: retryErr } = await supabase.from('blog_articles').insert({
            slug: retrySlug, title: article.title, excerpt: article.excerpt, category,
            emoji: article.emoji || '📄', keywords: article.keywords || [], faq: article.faq || [],
            content: article.content, read_time: article.readTime || '5 menit',
            published_at: new Date().toISOString(),
          })
          if (retryErr) return res.status(500).json({ error: retryErr.message })
          return res.status(200).json({ success: true, slug: retrySlug, title: article.title, topic })
        }
        return res.status(500).json({ error: insertErr.message })
      }

      return res.status(200).json({ success: true, slug: article.slug, title: article.title, topic })
    } catch (e) {
      console.error('[generate-daily-article]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  // ── FILL MISSING NAMES — isi nama user lama yang kosong dari auth metadata
  // Retroaktif: cek user_career_profiles yang nama-nya NULL/kosong, lalu isi
  // dari Google Auth metadata (full_name) atau fallback ke bagian sebelum @
  // di email. Aman dijalankan berulang — nggak nge-overwrite nama yang udah ada.
  if (job === 'fill-missing-names') {
    try {
      const { data: profiles, error: profilesErr } = await supabase
        .from('user_career_profiles')
        .select('user_id, nama')
        .or('nama.is.null,nama.eq.')
        .limit(100)

      if (profilesErr) return res.status(500).json({ error: profilesErr.message })
      if (!profiles?.length) return res.status(200).json({ success: true, filled: 0, message: 'Semua user sudah punya nama' })

      const { data: { users: authUsers }, error: authErr } = await supabase.auth.admin.listUsers()
      if (authErr) return res.status(500).json({ error: authErr.message })

      const authMap = Object.fromEntries((authUsers || []).map(u => [u.id, u]))

      let filled = 0
      const results = []

      for (const profile of profiles) {
        const authUser = authMap[profile.user_id]
        const fullName = authUser?.user_metadata?.full_name?.trim()
          || authUser?.user_metadata?.name?.trim()
          || authUser?.email?.split('@')[0]
          || null

        if (!fullName) {
          results.push({ userId: profile.user_id, status: 'skipped', reason: 'no_name_source' })
          continue
        }

        const { error: updateErr } = await supabase
          .from('user_career_profiles')
          .update({ nama: fullName, last_updated: new Date().toISOString() })
          .eq('user_id', profile.user_id)

        if (updateErr) {
          results.push({ userId: profile.user_id, status: 'failed', reason: updateErr.message })
        } else {
          filled++
          console.log(`[fill-missing-names] Filled ${profile.user_id}: ${fullName}`)
          results.push({ userId: profile.user_id, status: 'filled', name: fullName })
        }
      }

      return res.status(200).json({ success: true, filled, processed: results.length, details: results })
    } catch (e) {
      console.error('[fill-missing-names]', e)
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(400).json({ error: `Unknown job: ${job}` })
}

// ── Compress helper ──────────────────────────────────────────────────────────
async function compressTier({ olderThan, from, to, days, words }) {
  const { data: capsules } = await supabase
    .from('memory_capsule_log')
    .select('id, user_id, capsule_date, capsule_text')
    .lt('capsule_date', olderThan).eq('granularity', from)
    .neq('capsule_text', '[no new insight]')
    .order('user_id').order('capsule_date').limit(200)

  if (!capsules?.length) return 0

  const byUser = {}
  for (const c of capsules) {
    if (!byUser[c.user_id]) byUser[c.user_id] = []
    byUser[c.user_id].push(c)
  }

  let compressed = 0
  for (const [, userCapsules] of Object.entries(byUser)) {
    const sorted = [...userCapsules].sort((a,b) => a.capsule_date.localeCompare(b.capsule_date))
    const periods = []; let cur = { startDate: sorted[0].capsule_date, capsules: [] }
    for (const c of sorted) {
      const diff = (new Date(c.capsule_date) - new Date(cur.startDate)) / 86400000
      if (diff < days) cur.capsules.push(c)
      else { periods.push(cur); cur = { startDate: c.capsule_date, capsules: [c] } }
    }
    periods.push(cur)

    for (const period of periods) {
      if (!period.capsules.length) continue
      const combined = period.capsules.map(c => c.capsule_text).join('\n---\n')
      let summary = ''
      try {
        summary = await generateText({
          system: `Buat ringkasan ${words} kata atau kurang. Hanya fakta terpenting. Bahasa Indonesia.`,
          prompt: combined.slice(0, 2000),
          maxTokens: Math.ceil(words * 2), tier: 'fast', plan: 'free',
        })
      } catch { continue }

      const repDate = period.capsules[0].capsule_date
      await supabase.from('memory_capsule_log').upsert({
        user_id: period.capsules[0].user_id, capsule_date: repDate,
        capsule_text: summary.trim(), granularity: to,
      }, { onConflict: 'user_id,capsule_date' })

      const toDelete = period.capsules.filter(c => c.capsule_date !== repDate).map(c => c.id)
      if (toDelete.length > 0) {
        await supabase.from('memory_capsule_log').delete().in('id', toDelete)
      } else {
        await supabase.from('memory_capsule_log')
          .update({ granularity: to, capsule_text: summary.trim() })
          .eq('id', period.capsules[0].id)
      }
      compressed++
    }
  }
  return compressed
}
