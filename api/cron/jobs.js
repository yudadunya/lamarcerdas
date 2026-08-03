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
    function getWeekStart() {
      const d = new Date(); const day = d.getDay()
      const diff = day === 0 ? -6 : 1 - day
      d.setDate(d.getDate() + diff); d.setHours(0,0,0,0)
      return d.toISOString().split('T')[0]
    }

    const weekStart   = getWeekStart()
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)

    const { data: users, error } = await supabase
      .from('user_career_profiles')
      .select('user_id, nama, target_posisi, career_readiness, gps_steps, running_insight, running_insight_updated_at')
      .not('career_readiness', 'is', null).limit(50)

    if (error) return res.status(500).json({ error: error.message })
    if (!users?.length) return res.status(200).json({ success: true, processed: 0 })

    // Fetch semua auth users untuk kirim email
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()

    const results = []
    for (const user of users) {
      try {
        const [eventsRes, capsulesRes, sessionsRes] = await Promise.all([
          supabase.from('career_events')
            .select('event_type, event_payload').eq('user_id', user.user_id)
            .gte('created_at', sevenDaysAgo.toISOString()),
          supabase.from('memory_capsule_log')
            .select('capsule_text').eq('user_id', user.user_id)
            .gte('capsule_date', sevenDaysAgo.toISOString().slice(0,10))
            .order('capsule_date', { ascending: false }),
          supabase.from('user_session_notes')
            .select('id', { count: 'exact', head: true }).eq('user_id', user.user_id)
            .gte('session_date', sevenDaysAgo.toISOString().slice(0,10)),
        ])

        const events   = eventsRes.data || []
        const capsules = capsulesRes.data || []
        const sessionsCount = sessionsRes.count || 0
        if (events.length === 0 && capsules.length === 0) continue

        const milestonesDone = events.filter(e => e.event_type === 'milestone_completed')
        const doneCount  = (user.gps_steps || []).filter(s => s.done).length
        const totalCount = (user.gps_steps || []).length

        const summary = await generateText({
          system: 'Kamu adalah Diah Anna, AI career coach. Tulis catatan refleksi mingguan 2-4 kalimat, hangat dan personal. Bahasa Indonesia natural.',
          prompt: `Nama: ${user.nama || 'User'}\nTarget: ${user.target_posisi || '-'}\nProgress: ${doneCount}/${totalCount} step\nMilestone: ${milestonesDone.map(m => m.event_payload?.title).join(', ') || 'tidak ada'}\nRingkasan sesi:\n${capsules.map(c => `- ${c.capsule_text}`).join('\n') || '(tidak ada)'}`,
          maxTokens: 150, tier: 'fast',
        })

        // FIX: milestones_done & sessions_count sudah lama dihitung di atas
        // (dipakai buat prompt AI) tapi tidak pernah ditulis ke kolomnya
        // sendiri — jadi selalu diam di default 0 walau datanya sudah ada.
        // readiness_delta SENGAJA belum diisi (tetap default 0): tidak ada
        // histori career_readiness minggu lalu yang tersimpan di mana pun
        // buat dibandingkan — perlu snapshot tracking terpisah kalau mau
        // angka ini akurat, bukan sekadar dikira-kira.
        await supabase.from('user_weekly_reviews').upsert({
          user_id: user.user_id, week_start: weekStart, review_text: summary.trim(),
          milestones_done: milestonesDone.length, sessions_count: sessionsCount,
        }, { onConflict: 'user_id,week_start' })

        // Kirim email + push notification setelah review di-generate
        try {
          const authUser = authUsers?.find(u => u.id === user.user_id)
          const fcmToken = await getUserFcmToken(user.user_id)
          if (authUser?.email || fcmToken) {
            await notifyWeeklyReview(authUser?.email, fcmToken, user.nama || 'User', summary.trim())
          }
        } catch (notifErr) {
          console.error(`[weekly-review notify failed for ${user.user_id}]`, notifErr)
        }

        // Update running_insight kalau belum diupdate minggu ini
        const alreadyUpdated = user.running_insight_updated_at
          && new Date(user.running_insight_updated_at) >= sevenDaysAgo
        if (!alreadyUpdated) {
          try {
            const newInsight = await generateText({
              system: 'Susun running insight 4 kalimat max tentang user ini untuk AI coach. Bahasa Indonesia, padat.',
              prompt: `Insight lama:\n${user.running_insight || '(belum ada)'}\n\nObservasi baru:\n${capsules.map(c => `- ${c.capsule_text}`).join('\n') || '(tidak ada)'}`,
              maxTokens: 200, tier: 'fast',
            })
            await supabase.from('user_career_profiles').update({
              running_insight: newInsight.trim(),
              running_insight_updated_at: new Date().toISOString(),
            }).eq('user_id', user.user_id)
          } catch {}
        }

        results.push({ userId: user.user_id, status: 'generated' })
      } catch (e) {
        results.push({ userId: user.user_id, status: 'failed', error: e.message })
      }
    }

    return res.status(200).json({
      success: true, weekStart,
      processed: results.length,
      generated: results.filter(r => r.status === 'generated').length,
    })
  }

  // ── SEND CHAT REMINDERS ──────────────────────────────────────────────────
  if (job === 'send-chat-reminders') {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString()

    // Ambil semua users yang tidak chat 2 hari terakhir
    const { data: users, error: usersErr } = await supabase
      .from('user_career_profiles')
      .select('user_id, nama, gps_steps')
      .not('user_id', 'is', null)
      .limit(100)

    if (usersErr) return res.status(500).json({ error: usersErr.message })
    if (!users?.length) return res.status(200).json({ success: true, sent: 0 })

    const results = []
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()

    for (const profile of users) {
      try {
        // Cek last chat
        const { data: lastChat } = await supabase
          .from('user_session_notes')
          .select('created_at')
          .eq('user_id', profile.user_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        // Kalau tidak ada chat atau chat > 2 hari, kirim email + push
        if (!lastChat || new Date(lastChat.created_at) < new Date(twoDaysAgo)) {
          const authUser = authUsers.find(u => u.id === profile.user_id)
          const fcmToken = await getUserFcmToken(profile.user_id)
          // Cari langkah GPS pertama yang belum dicentang — bikin reminder-nya
          // konkret ("langkah X belum selesai") bukan cuma ajakan generik.
          const pendingStep = (profile.gps_steps || []).find(s => !s.done && s.title && s.title !== '—')

          // Ambil topik obrolan terakhir / misi aktif — biar reminder-nya terasa
          // Diah Anna beneran inget percakapan sebelumnya, bukan notifikasi
          // generik "yuk chat lagi". (Logic-nya sekarang di getPersonalContext,
          // dipakai bareng dengan job morning-nudge di bawah.)
          let personalLine = null
          const contextText = await getPersonalContext(profile.user_id, pendingStep?.title)
          if (contextText) {
            try {
              personalLine = await generateText({
                system: 'Kamu Diah Anna, AI career coach. Tulis SATU kalimat pendek (maks 20 kata) gaya chat WhatsApp buat notifikasi reminder — hangat, personal, jangan kaku/formal. Jangan pakai salam pembuka, langsung ke isi.',
                prompt: `${contextText}\n\nTulis 1 kalimat reminder yang merujuk itu, ajak lanjut ngobrol/cerita progressnya.`,
                maxTokens: 60, tier: 'fast',
              })
              personalLine = personalLine?.trim().replace(/^"|"$/g, '') || null
            } catch (aiErr) {
              console.error(`[send-chat-reminders personalLine failed for ${profile.user_id}]`, aiErr)
            }
          }

          if (authUser?.email || fcmToken) {
            const notifyResult = await notifyChatReminder(authUser?.email, fcmToken, profile.nama || 'User', pendingStep?.title, personalLine)
            const ok = notifyResult.email?.success || notifyResult.push?.success
            if (ok) {
              results.push({ userId: profile.user_id, status: 'sent', detail: notifyResult })
            } else {
              results.push({ userId: profile.user_id, status: 'failed', detail: notifyResult })
            }
          }
        }
      } catch (e) {
        results.push({ userId: profile.user_id, status: 'failed', error: e.message })
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

    // User yang profil-nya (= selesai Discovery) dibuat/diupdate 24-48 jam
    // lalu. Window 24 jam (bukan cutoff sesaat) supaya cron harian ini pasti
    // "menangkap" tiap user tepat sekali, walau jadwal cron sedikit meleset.
    const { data: users, error: usersErr } = await supabase
      .from('user_career_profiles')
      .select('user_id, nama, last_updated')
      .not('career_readiness', 'is', null)
      .gte('last_updated', h48.toISOString())
      .lte('last_updated', h24.toISOString())
      .limit(100)

    if (usersErr) return res.status(500).json({ error: usersErr.message })
    if (!users?.length) return res.status(200).json({ success: true, sent: 0 })

    const results = []
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()

    for (const profile of users) {
      try {
        // Skip kalau sudah pernah chat coaching sungguhan (>=1 session note)
        const { data: existingNote } = await supabase
          .from('user_session_notes')
          .select('id').eq('user_id', profile.user_id).limit(1).maybeSingle()
        if (existingNote) continue

        const authUser = authUsers.find(u => u.id === profile.user_id)
        const fcmToken = await getUserFcmToken(profile.user_id)
        if (authUser?.email || fcmToken) {
          const notifyResult = await notifyOnboardingNudge(authUser?.email, fcmToken, profile.nama || 'User')
          const ok = notifyResult.email?.success || notifyResult.push?.success
          results.push({ userId: profile.user_id, status: ok ? 'sent' : 'failed', detail: notifyResult })
        }
      } catch (e) {
        results.push({ userId: profile.user_id, status: 'failed', error: e.message })
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
    const today = new Date().toISOString().slice(0, 10)
    // Bypass khusus testing manual: ?force=1 skip pengecekan "sudah chat
    // hari ini" — supaya kamu bisa re-test job ini berkali-kali di hari
    // yang sama tanpa nunggu besok. Aman dipakai publik-tanpa-abuse karena
    // endpoint ini sudah di-gate CRON_SECRET di atas (baris ~24) — orang
    // luar tidak bisa panggil ini sama sekali tanpa secret itu.
    const forceTest = req.query.force === '1'

    const { data: users, error: usersErr } = await supabase
      .from('user_career_profiles')
      .select('user_id, nama, gps_steps')
      .not('career_readiness', 'is', null) // cuma user yang sudah selesai Discovery
      .limit(100)

    if (usersErr) return res.status(500).json({ error: usersErr.message })
    if (!users?.length) return res.status(200).json({ success: true, sent: 0 })

    const results = []

    for (const profile of users) {
      try {
        // Skip kalau sudah ada sesi chat hari ini — jangan ganggu user yang
        // memang sudah balik sendiri tanpa diingatkan. (Di-skip kalau
        // forceTest aktif, khusus buat testing manual.)
        if (!forceTest) {
          const { data: chatToday, error: chatTodayErr } = await supabase
            .from('user_chat_history')
            .select('user_id')
            .eq('user_id', profile.user_id)
            .eq('session_date', today)
            .maybeSingle()
          if (chatTodayErr) console.error(`[morning-nudge chatToday check failed for ${profile.user_id}]`, chatTodayErr.message)
          if (chatToday) {
            results.push({ userId: profile.user_id, status: 'skipped', reason: 'already_chatted_today' })
            continue
          }
        }

        const fcmToken = await getUserFcmToken(profile.user_id)
        if (!fcmToken) {
          results.push({ userId: profile.user_id, status: 'skipped', reason: 'no_active_fcm_token' })
          continue
        }

        const pendingStep = (profile.gps_steps || []).find(s => !s.done && s.title && s.title !== '—')
        const contextText = await getPersonalContext(profile.user_id, pendingStep?.title)

        let personalLine = null
        try {
          personalLine = await generateText({
            system: `Kamu Diah Anna, AI career coach yang hangat dan suportif. Tulis SATU kalimat pendek (maks 18 kata) untuk notifikasi ajakan ngobrol pagi hari, gaya chat WhatsApp.

ATURAN PENTING:
- Nadanya ajakan santai dari teman, BUKAN reminder tugas atau tagihan.
- JANGAN pakai kata "harus", "wajib", "jangan lupa", "yuk segera", atau kata perintah/menuntut lainnya.
- JANGAN bikin user merasa bersalah karena belum chat.
- Boleh singgung progress/topik terakhir kalau relevan, tapi framing-nya rasa ingin tahu/dukungan, bukan menagih kelanjutan.
- Satu emoji opsional, tidak wajib.`,
            prompt: contextText
              ? `${contextText}\n\nTulis 1 kalimat ajakan pagi yang hangat, boleh merujuk konteks di atas kalau natural.`
              : `User belum ada konteks obrolan spesifik. Tulis 1 kalimat ajakan pagi yang hangat dan umum, seperti menyapa teman di pagi hari.`,
            maxTokens: 50, tier: 'fast',
          })
          personalLine = personalLine?.trim().replace(/^"|"$/g, '') || null
        } catch (aiErr) {
          console.error(`[morning-nudge personalLine failed for ${profile.user_id}]`, aiErr)
        }

        const notifyResult = await notifyMorningNudge(fcmToken, profile.nama || 'Teman', personalLine)
        const ok = notifyResult.push?.success
        results.push({
          userId: profile.user_id,
          status: ok ? 'sent' : 'failed',
          reason: ok ? undefined : (notifyResult.push?.error || 'unknown_push_error'),
        })
      } catch (e) {
        results.push({ userId: profile.user_id, status: 'failed', reason: e.message })
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
          .select('nama, gps_steps, career_readiness')
          .eq('user_id', sub.user_id)
          .maybeSingle()

        const doneSteps  = (profile?.gps_steps || []).filter(s => s.done).length
        const totalSteps = (profile?.gps_steps || []).length

        let personalLine = null
        try {
          personalLine = await generateText({
            system: `Kamu Diah Anna, AI career coach. Tulis SATU kalimat pendek (maks 20 kata) untuk notifikasi push soal Premium yang ${daysUntilExpiry < 0 ? 'baru saja habis masa aktifnya' : 'akan segera habis masa aktifnya'}.

ATURAN PENTING — PERSUASIF TAPI HALUS:
- Fokus ke apa yang akan/sudah HILANG (loss aversion) — progress, akses Journey/Peluang, momentum — BUKAN daftar fitur atau harga.
- JANGAN pakai bahasa hard-sell ("promo terbatas!", "jangan lewatkan!", tanda seru berlebihan, huruf kapital semua).
- JANGAN pakai kata "harus" atau menekan — framingnya "sayang kalau", bukan "wajib".
- Kalau ada data progress spesifik, sebut itu (contoh: "udah selesai 4 dari 6 langkah") — konkret jauh lebih persuasif dari generik.
- Satu emoji opsional, tidak wajib.`,
            prompt: totalSteps > 0
              ? `User sudah menyelesaikan ${doneSteps}/${totalSteps} langkah GPS Karier (career readiness ${profile?.career_readiness || 0}%). Tulis 1 kalimat yang merujuk progress ini.`
              : `Belum ada data progress spesifik. Tulis 1 kalimat umum yang tetap halus soal Journey & Peluang yang akan/sudah tidak bisa diakses.`,
            maxTokens: 60, tier: 'fast',
          })
          personalLine = personalLine?.trim().replace(/^"|"$/g, '') || null
        } catch (aiErr) {
          console.error(`[premium-expiry-reminder personalLine failed for ${sub.user_id}]`, aiErr)
        }

        const notifyResult = await notifyPremiumExpiry(fcmToken, profile?.nama || 'Teman', personalLine, daysUntilExpiry)
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
    const { data: users, error: usersErr } = await supabase
      .from('user_career_profiles')
      .select('user_id, nama, gps_steps, career_readiness, depth_score')
      .not('career_readiness', 'is', null) // sudah selesai Discovery
      .limit(150)

    if (usersErr) return res.status(500).json({ error: usersErr.message })
    if (!users?.length) return res.status(200).json({ success: true, processed: 0 })

    const results = []

    for (const profile of users) {
      try {
        // Skip user yang sedang/pernah premium — job ini KHUSUS free murni.
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan, status, expires_at')
          .eq('user_id', profile.user_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const isPremiumNow = sub?.plan === 'premium' && sub?.status === 'active'
          && (!sub.expires_at || new Date(sub.expires_at) > new Date())
        if (isPremiumNow) {
          results.push({ userId: profile.user_id, status: 'skipped', reason: 'currently_premium' })
          continue
        }

        // Cuma target user yang cukup engaged (depth_score >= 20) — nudge ke
        // user yang baru daftar & belum aktif sama sekali biasanya konversinya
        // rendah dan terasa lebih kayak spam ke user yang belum kenal produknya.
        if ((profile.depth_score || 0) < 20) {
          results.push({ userId: profile.user_id, status: 'skipped', reason: 'not_engaged_enough' })
          continue
        }

        const fcmToken = await getUserFcmToken(profile.user_id)
        if (!fcmToken) {
          results.push({ userId: profile.user_id, status: 'skipped', reason: 'no_active_fcm_token' })
          continue
        }

        const doneSteps  = (profile.gps_steps || []).filter(s => s.done).length
        const totalSteps = (profile.gps_steps || []).length

        let personalLine = null
        try {
          personalLine = await generateText({
            system: `Kamu Diah Anna, AI career coach. Tulis SATU kalimat pendek (maks 20 kata) untuk notifikasi push mengajak user FREE upgrade ke Premium.

ATURAN PENTING — PERSUASIF TAPI HALUS:
- Framing-nya VALUE/PROGRESS — apa yang bisa mereka DAPAT dan bagaimana itu mempercepat progress mereka SEKARANG, bukan daftar fitur generik atau harga.
- JANGAN hard-sell, JANGAN tanda seru berlebihan, JANGAN kata "harus"/"wajib".
- Kalau ada data progress, jadikan itu jembatan (contoh: "udah 60% menuju target — Journey bisa bantu percepat sisanya").
- Satu emoji opsional.`,
            prompt: totalSteps > 0
              ? `User career readiness ${profile.career_readiness || 0}%, sudah selesai ${doneSteps}/${totalSteps} langkah GPS Karier. Tulis 1 kalimat ajakan upgrade yang merujuk progress ini.`
              : `Belum ada progress spesifik. Tulis 1 kalimat ajakan upgrade yang halus dan umum.`,
            maxTokens: 60, tier: 'fast',
          })
          personalLine = personalLine?.trim().replace(/^"|"$/g, '') || null
        } catch (aiErr) {
          console.error(`[free-upgrade-nudge personalLine failed for ${profile.user_id}]`, aiErr)
        }

        const notifyResult = await notifyUpgradeNudge(fcmToken, profile.nama || 'Teman', personalLine)
        const ok = notifyResult.push?.success
        results.push({
          userId: profile.user_id,
          status: ok ? 'sent' : 'failed',
          reason: ok ? undefined : (notifyResult.push?.error || 'unknown_push_error'),
        })
      } catch (e) {
        results.push({ userId: profile.user_id, status: 'failed', reason: e.message })
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
    // Pool topik — sengaja jauh lebih banyak dari 365 (jalan setahun tanpa
    // pernah exact-duplicate), dikelompokkan ke 4 kategori yang sudah ada di
    // Blog.jsx (Tips CV, Interview, Karir, LinkedIn) supaya konsisten sama
    // desain filter yang sudah ada. Semua topik ditulis condong ke "hasilnya
    // duit riil" — selaras dengan reposisi produk yang sudah kita bahas
    // (bukan cuma "pengembangan diri" generik).
    const TOPIC_POOL = [
      // Tips CV
      'Cara Bikin CV yang Bikin HRD Langsung Telepon Balik',
      'Kata-Kata yang Bikin CV Kamu Otomatis Ditolak Recruiter',
      'Cara Hitung dan Tampilkan Achievement dengan Angka di CV',
      'CV buat Fresh Graduate Tanpa Pengalaman Kerja: Panduan Lengkap',
      'Cara Bikin CV Bahasa Inggris yang Standar Internasional',
      'Portofolio Online vs CV PDF: Mana yang Lebih Efektif 2026',
      'Cara Menjelaskan Gap Tahun Kosong di CV Tanpa Terlihat Mencurigakan',
      'CV Career Switcher: Cara Highlight Skill yang Transferable',
      'Panjang CV Ideal: 1 Halaman atau 2 Halaman?',
      'Cara Bikin Ringkasan Profesional (Summary) yang Menjual',
      // Interview
      'Jawaban Ideal untuk "Ceritakan Tentang Diri Kamu" Saat Interview',
      'Cara Jawab "Kenapa Kamu Resign dari Kantor Lama" Tanpa Menjelekkan',
      'Pertanyaan yang WAJIB Kamu Tanya Balik ke Interviewer',
      'Cara Negosiasi Gaji Saat Interview Tanpa Terlihat Serakah',
      'STAR Method: Cara Jawab Pertanyaan Interview Perilaku',
      'Cara Interview Online yang Bikin Kamu Kelihatan Profesional',
      'Red Flag Perusahaan yang Wajib Dikenali Saat Interview',
      'Cara Follow Up Setelah Interview Tanpa Terkesan Desperate',
      'Kesalahan Fatal yang Bikin Kandidat Gagal di 5 Menit Pertama',
      'Cara Jawab Pertanyaan Soal Gaji yang Diminta Saat Interview',
      // Karir
      'Tanda-Tanda Kamu Harus Resign dari Pekerjaan Sekarang',
      'Cara Naik Jabatan Tanpa Harus Pindah Perusahaan',
      'Skill yang Paling Dicari Perusahaan Indonesia di 2026',
      'Cara Switch Karir di Usia 30-an Tanpa Mulai dari Nol',
      'Side Hustle yang Cocok Buat Karyawan Kantoran',
      'Cara Tau Gaji Kamu di Bawah Standar Market atau Tidak',
      'Personal Branding buat Karyawan yang Introvert',
      'Cara Membangun Portofolio Tanpa Proyek Klien Nyata',
      'Freelance vs Karyawan Tetap: Mana yang Lebih Untung 2026',
      'Cara Menabung dari Gaji UMR Sambil Upgrade Skill',
      'Remote Job Indonesia: Cara Cari dan Dapat Kerja dari Rumah',
      'Cara Bikin Rencana Karir 5 Tahun yang Realistis',
      // LinkedIn
      'Cara Optimasi Profil LinkedIn Biar Dilirik Recruiter',
      'Konten LinkedIn yang Bikin Kamu Kelihatan Expert di Bidangmu',
      'Cara Networking di LinkedIn Tanpa Terlihat Sok Kenal',
      'Headline LinkedIn yang Menarik Perhatian Recruiter dalam 3 Detik',
      'Cara Minta Rekomendasi LinkedIn yang Efektif',
      'Open to Work di LinkedIn: Aman atau Berisiko?',
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
    const category = TOPIC_POOL.indexOf(topic) < 10 ? 'Tips CV'
      : TOPIC_POOL.indexOf(topic) < 20 ? 'Interview'
      : TOPIC_POOL.indexOf(topic) < 32 ? 'Karir' : 'LinkedIn'

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
          description: `Isi artikel lengkap 700-1000 kata dalam format markdown sederhana: ## buat heading, ### buat subheading, - buat bullet list, > buat blockquote/tips penting, **teks** buat bold. JANGAN pakai heading H1 (judul sudah terpisah). Tulis dengan gaya natural, contoh konkret, angka spesifik kalau relevan (persentase, kisaran gaji Rupiah, dst), dan classic pattern yang mudah dikutip AI search engine: kalimat-kalimat yang bisa berdiri sendiri sebagai jawaban faktual.`,
        },
      },
      required: ['title', 'slug', 'excerpt', 'emoji', 'readTime', 'keywords', 'faq', 'content'],
    }

    try {
      const article = await generateStructured({
        system: `Kamu adalah content writer expert career coaching untuk audiens Indonesia (Verneks — platform AI career coach). Tulis artikel SEO yang genuinely membantu, bukan artikel tipis isi ulang generik. Gaya bahasa: profesional tapi hangat, seperti Diah Anna (AI career coach Verneks) menjelaskan ke teman — bukan kaku seperti textbook. SELALU hubungkan topik ke dampak nyata: penghasilan, peluang kerja, atau kemajuan karir konkret — bukan cuma "pengembangan diri" abstrak. Tulis SEMUA dalam Bahasa Indonesia.`,
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
