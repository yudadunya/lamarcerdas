// api/lib/notifications.js
// Unified notifications service — Email + Push notifications
// Menggabungkan: email.js + firebase-admin.js

import nodemailer from 'nodemailer'
// FIX: `import admin from 'firebase-admin'` (namespace/default import lama)
// tidak reliable di project ESM ("type": "module" di package.json) untuk
// firebase-admin v14 — hasilnya admin.credential bisa undefined tergantung
// gimana Node resolve interop CJS→ESM paket ini, bikin
// `admin.credential.cert(...)` throw "Cannot read properties of undefined
// (reading 'cert')". Firebase secara resmi merekomendasikan modular import
// (dari 'firebase-admin/app' dan 'firebase-admin/messaging') untuk ESM,
// bukan namespace import — ini yang dipakai sekarang.
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { createClient } from '@supabase/supabase-js'

// ────── NODEMAILER SETUP ──────────────────────────────────────────────────
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASSWORD,
  },
})

// ────── FIREBASE ADMIN SETUP ──────────────────────────────────────────────
// PENTING: seluruh blok ini dibungkus try/catch, termasuk pengecekan
// admin.apps.length. Kalau tidak, error apapun di sini (termasuk
// ketidakcocokan import CJS/ESM firebase-admin) akan CRASH TOTAL proses
// Node — dan karena file ini di-import di level atas oleh api/cron/jobs.js,
// itu bikin SELURUH cron job (weekly-review, send-chat-reminders, dst) ikut
// mati, bukan cuma fitur push notification-nya saja.
let firebaseAdminReady = false
let firebaseAdminInitError = null
let messaging = null
try {
  if (!getApps().length) {
    // FIX: cara lama (5 env var terpisah, private key di-paste manual
    // sebagai teks dengan \n literal) TERLALU rawan salah — gampang ke-mix
    // sama tanda kutip nyasar, newline literal yang keburu jadi Enter
    // beneran pas paste ke form Vercel, dsb ("Failed to parse private
    // key"). Cara baru: SATU env var (FIREBASE_SERVICE_ACCOUNT_BASE64)
    // isinya seluruh file JSON service account, di-encode base64 dulu.
    // Base64 cuma A-Z/a-z/0-9/+//= — tidak ada newline atau karakter
    // spesial apapun yang bisa rusak pas dipaste ke form manapun, jadi
    // kelas bug ini hilang total. 5 var lama tetap didukung sebagai
    // fallback (kalau base64-nya belum di-set), supaya tidak langsung
    // breaking change.
    let serviceAccount = null

    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8')
      )
    } else {
      serviceAccount = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID || 'verneks-notif',
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      }
    }

    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || 'verneks-notif'
    })
  }
  messaging = getMessaging()
  firebaseAdminReady = true
} catch (e) {
  firebaseAdminInitError = e.message
  console.warn('[notifications] Firebase Admin init gagal/skip:', e.message)
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ═════════════════════════════════════════════════════════════════════════
// EMAIL FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Send chat reminder email (2 hari tidak chat)
 */
export async function sendChatReminderEmail(userEmail, userName, pendingStepTitle) {
  if (!userEmail) return { error: 'Email not found' }

  const firstName = userName?.split(' ')[0] || 'Teman'
  const stepLine = pendingStepTitle
    ? `Langkah selanjutnya yang masih menunggu di roadmap kamu: <strong>${pendingStepTitle}</strong>.`
    : 'Kesuksesan karier dibangun dari konsistensi kecil setiap hari. Jangan biarkan ritmemu hilang — satu percakapan hari ini bisa mengubah arah perjalananmu.'

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Arial', sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #25D366, #128C7E); color: #fff; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px 20px; line-height: 1.6; color: #333; }
        .message { background-color: #f9f9f9; border-left: 4px solid #25D366; padding: 15px; margin: 20px 0; }
        .cta { text-align: center; margin: 30px 0; }
        .cta-button { background-color: #25D366; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; }
        .footer { background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>💬 Halo, ${firstName}!</h1>
        </div>
        <div class="content">
          <p>Aku perhatiin kalau kita sudah 2 hari tidak ngobrol.</p>
          
          <div class="message">
            <p><strong>Momentum itu penting, ${firstName}.</strong></p>
            <p>${stepLine}</p>
          </div>

          <p>Target kariermu masih di depan. Aku di sini siap membantu kamu melangkah lebih dekat.</p>

          <div class="cta">
            <a href="https://verneks.my.id/chat" class="cta-button">💬 Tanya Diah Anna Sekarang</a>
          </div>

          <p style="color: #666; font-size: 14px;">Atau buka Verneks dan mulai ngobrol dengan Diah Anna kapan saja.</p>
        </div>
        <div class="footer">
          <p>Email ini dikirim dari Diah Anna, AI Career Mentor Verneks</p>
          <p>© 2024 Verneks. Semua hak dilindungi.</p>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await emailTransporter.sendMail({
      from: `"Diah Anna - Verneks" <${process.env.GMAIL_USER}>`,
      to: userEmail,
      subject: `${firstName}, mari kita lanjutkan perjalanan karier kamu 🚀`,
      html: htmlContent,
    })
    return { success: true }
  } catch (error) {
    console.error('[sendChatReminderEmail]', error)
    return { error: error.message }
  }
}

/**
 * Send weekly review email
 */
export async function sendWeeklyReviewEmail(userEmail, userName, reviewText) {
  if (!userEmail || !reviewText) return { error: 'Email or review text missing' }

  const firstName = userName?.split(' ')[0] || 'Teman'

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Arial', sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #4F46E5, #06B6D4); color: #fff; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .header p { margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; }
        .content { padding: 30px 20px; line-height: 1.7; color: #333; }
        .review-section { background: linear-gradient(135deg, rgba(79,70,229,0.08), rgba(6,182,212,0.05)); border-left: 4px solid #4F46E5; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .review-section h3 { margin: 0 0 12px 0; color: #4F46E5; font-size: 16px; }
        .review-text { color: #333; font-size: 15px; line-height: 1.8; }
        .cta { text-align: center; margin: 30px 0; }
        .cta-button { background-color: #25D366; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; }
        .footer { background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📝 Weekly Review Minggu Ini</h1>
          <p>Catatan personal dari Diah Anna untuk ${firstName}</p>
        </div>
        <div class="content">
          <p>Halo ${firstName},</p>
          
          <p>Minggu ini sudah berjalan dengan langkah-langkah penting menuju target kariermu. Berikut adalah refleksi mingguan dari aku:</p>

          <div class="review-section">
            <h3>💬 Catatan Diah Anna</h3>
            <div class="review-text">${reviewText.replace(/\n/g, '<br>')}</div>
          </div>

          <p>Terus pertahankan momentum ini, ${firstName}. Setiap langkah kecil hari ini adalah bagian dari kesuksesan besar di masa depan.</p>

          <div class="cta">
            <a href="https://verneks.my.id/dashboard" class="cta-button">📊 Lihat Dashboard Lengkap</a>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 20px;">Buka Verneks untuk melihat progress detail, milestones yang sudah dicapai, dan roadmap selengkapnya.</p>
        </div>
        <div class="footer">
          <p>Email ini adalah review mingguan personal dari Diah Anna, AI Career Mentor Verneks</p>
          <p>© 2024 Verneks. Semua hak dilindungi.</p>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await emailTransporter.sendMail({
      from: `"Diah Anna - Verneks" <${process.env.GMAIL_USER}>`,
      to: userEmail,
      subject: `📝 Weekly Review: Refleksi Minggu Ini dari Diah Anna`,
      html: htmlContent,
    })
    return { success: true }
  } catch (error) {
    console.error('[sendWeeklyReviewEmail]', error)
    return { error: error.message }
  }
}

// ═════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATION FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Send push notification ke single device
 */
// FIX: token FCM yang sudah invalid/uninstall-app/expired tidak pernah
// ditandai non-aktif di database — jadi cron (weekly-review, chat-reminder,
// dst) terus-menerus mencoba kirim ke token mati selamanya, gagal diam-diam
// tiap kali tanpa efek selain nge-log error. Firebase Admin SDK selalu
// kasih tahu lewat error.code kalau tokennya memang sudah tidak valid lagi
// (bukan error sementara seperti quota/network) — begitu ketemu kode itu,
// langsung nonaktifkan di `user_push_tokens` supaya getUserFcmToken()
// (yang sudah filter `is_active: true`) otomatis berhenti memakainya.
const STALE_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

async function deactivateFcmToken(fcmToken) {
  if (!fcmToken) return
  try {
    const { error } = await supabase
      .from('user_push_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('fcm_token', fcmToken)
    if (error) throw error
    console.log('[deactivateFcmToken] Token invalid dinonaktifkan:', fcmToken.slice(0, 12) + '...')
  } catch (error) {
    console.error('[deactivateFcmToken]', error)
  }
}

export async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!fcmToken) return { error: 'FCM token missing' }
  if (!firebaseAdminReady) return { error: `Firebase Admin belum siap: ${firebaseAdminInitError || 'penyebab tidak diketahui'}` }

  try {
    const message = {
      token: fcmToken, // FIX: field wajib ini tidak pernah ada sebelumnya — FCM selalu nolak kirim karena nggak tahu ini ditujukan ke device mana (error: "Exactly one of fid, topic, token or condition is required")
      notification: { title, body },
      data: { ...data, timestamp: new Date().toISOString() },
      webpush: {
        fcmOptions: { link: 'https://verneks.my.id/dashboard' },
        notification: {
          title, body,
          icon: 'https://verneks.my.id/icons/icon-192x192.png',
          click_action: 'https://verneks.my.id/dashboard'
        }
      }
    }

    const response = await messaging.send(message)
    console.log('[sendPushNotification] Success:', response)
    return { success: true, messageId: response }
  } catch (error) {
    console.error('[sendPushNotification]', error)
    if (STALE_TOKEN_ERROR_CODES.has(error.code)) {
      await deactivateFcmToken(fcmToken)
      return { error: error.message, staleToken: true }
    }
    return { error: error.message }
  }
}

/**
 * Send chat reminder push
 */
export async function sendChatReminderPush(fcmToken, userName, pendingStepTitle, personalLine = null) {
  const firstName = userName?.split(' ')[0] || 'Teman'
  return sendPushNotification(
    fcmToken,
    '💬 Halo ' + firstName,
    personalLine
      || (pendingStepTitle
        ? `Langkah "${pendingStepTitle}" masih menunggu kamu. Yuk lanjutkan!`
        : 'Kita sudah 2 hari tidak ngobrol. Mari lanjutkan perjalanan karier kamu!'),
    { type: 'chat-reminder', action: 'open-chat' }
  )
}

/**
 * Push notifikasi ajakan pagi hari — BEDA nada dari sendChatReminderPush.
 * Reminder biasa dipicu oleh inactivity (2 hari tidak chat) jadi wajar kalau
 * nadanya sedikit "menagih". Ajakan pagi ini dikirim ke SEMUA user tiap hari
 * (yang belum chat hari itu) terlepas dari seberapa aktif mereka — jadi HARUS
 * terasa seperti sapaan teman, bukan tagihan harian. title & fallback body
 * sengaja tidak pakai kata perintah ("harus", "wajib", "jangan lupa").
 */
export async function sendMorningNudgePush(fcmToken, userName, personalLine = null) {
  const firstName = userName?.split(' ')[0] || 'Teman'
  return sendPushNotification(
    fcmToken,
    `Pagi, ${firstName} ☀️`,
    personalLine || 'Ada waktu buat ngobrol bentar hari ini? Aku di sini kalau kamu mau cerita progress-mu.',
    { type: 'morning-nudge', action: 'open-chat' }
  )
}

export async function notifyMorningNudge(fcmToken, userName, personalLine) {
  if (!fcmToken) return { push: { error: 'No FCM token' } }
  return { push: await sendMorningNudgePush(fcmToken, userName, personalLine) }
}

/**
 * Push reminder buat premium yang mau/sudah expired. Nada-nya persuasif
 * tapi HALUS — bukan hard-sell "BELI SEKARANG!!1!". Loss-aversion framing
 * (fokus ke apa yang akan/sudah hilang), bukan feature-dumping.
 * daysUntilExpiry negatif = sudah lewat expired (win-back).
 */
export async function sendPremiumExpiryPush(fcmToken, userName, personalLine, daysUntilExpiry) {
  const firstName = userName?.split(' ')[0] || 'Teman'
  const title = daysUntilExpiry < 0
    ? `${firstName}, akses Premium kamu sudah nonaktif`
    : daysUntilExpiry <= 1
      ? `${firstName}, Premium kamu berakhir besok`
      : `${firstName}, Premium kamu berakhir ${daysUntilExpiry} hari lagi`
  return sendPushNotification(
    fcmToken,
    title,
    personalLine || 'Journey dan Peluang kamu masih nunggu kalau mau lanjut.',
    { type: 'premium-expiry', action: 'open-upgrade' }
  )
}

export async function notifyPremiumExpiry(fcmToken, userName, personalLine, daysUntilExpiry) {
  if (!fcmToken) return { push: { error: 'No FCM token' } }
  return { push: await sendPremiumExpiryPush(fcmToken, userName, personalLine, daysUntilExpiry) }
}

/**
 * Push nudge buat user FREE yang belum pernah upgrade. Beda dari
 * premium-expiry (loss aversion), ini framing-nya value/progress —
 * nunjukkin apa yang bisa mereka DAPAT, bukan apa yang hilang, karena
 * mereka belum pernah punya akses itu sama sekali.
 */
export async function sendUpgradeNudgePush(fcmToken, userName, personalLine) {
  const firstName = userName?.split(' ')[0] || 'Teman'
  return sendPushNotification(
    fcmToken,
    `${firstName}, ada langkah lebih cepat 🚀`,
    personalLine || 'Premium buka Journey & Peluang kerja yang cocok sama progress kamu sekarang.',
    { type: 'upgrade-nudge', action: 'open-upgrade' }
  )
}

export async function notifyUpgradeNudge(fcmToken, userName, personalLine) {
  if (!fcmToken) return { push: { error: 'No FCM token' } }
  return { push: await sendUpgradeNudgePush(fcmToken, userName, personalLine) }
}


export async function sendOnboardingNudgeEmail(userEmail, userName) {
  if (!userEmail) return { error: 'Email not found' }
  const firstName = userName?.split(' ')[0] || 'Teman'

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Arial', sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #25D366, #128C7E); color: #fff; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; }
        .content { padding: 30px 20px; line-height: 1.6; color: #333; }
        .cta { text-align: center; margin: 30px 0; }
        .cta-button { background-color: #25D366; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; }
        .footer { background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>🧬 Career DNA kamu udah siap, ${firstName}!</h1></div>
        <div class="content">
          <p>Kemarin kamu sudah cerita ke Diah Anna dan Career DNA kamu sudah jadi — tapi kelihatannya belum sempat lanjut ngobrol lagi.</p>
          <p>Roadmap dan langkah-langkah konkret buat kariermu udah nunggu di sana. Yuk lanjutkan sekarang, mumpung momentumnya masih ada.</p>
          <div class="cta">
            <a href="https://verneks.my.id/chat" class="cta-button">💬 Lanjut Ngobrol dengan Diah Anna</a>
          </div>
        </div>
        <div class="footer">
          <p>Email ini dikirim dari Diah Anna, AI Career Mentor Verneks</p>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await emailTransporter.sendMail({
      from: `"Diah Anna - Verneks" <${process.env.GMAIL_USER}>`,
      to: userEmail,
      subject: `${firstName}, Career DNA kamu udah siap 🧬`,
      html: htmlContent,
    })
    return { success: true }
  } catch (error) {
    console.error('[sendOnboardingNudgeEmail]', error)
    return { error: error.message }
  }
}

export async function sendOnboardingNudgePush(fcmToken, userName) {
  const firstName = userName?.split(' ')[0] || 'Teman'
  return sendPushNotification(
    fcmToken,
    '🧬 Career DNA kamu udah siap!',
    `${firstName}, yuk lanjut ngobrol sama Diah Anna buat mulai langkah pertama roadmap kamu.`,
    { type: 'onboarding-nudge', action: 'open-chat' }
  )
}

export async function notifyOnboardingNudge(userEmail, fcmToken, userName) {
  const results = {}
  if (userEmail) results.email = await sendOnboardingNudgeEmail(userEmail, userName)
  if (fcmToken) results.push = await sendOnboardingNudgePush(fcmToken, userName)
  return results
}

/**
 * Send instant push saat user checklist 1 langkah GPS roadmap selesai
 */
export async function sendMilestoneCompletePush(fcmToken, userName, stepTitle) {
  const firstName = userName?.split(' ')[0] || 'Teman'
  return sendPushNotification(
    fcmToken,
    `🎉 Mantap, ${firstName}!`,
    stepTitle ? `Langkah "${stepTitle}" udah kamu selesaikan. Yuk lanjut ke langkah berikutnya!` : 'Satu langkah lagi selesai. Yuk lanjut ke langkah berikutnya!',
    { type: 'milestone-complete', action: 'open-journey' }
  )
}

/**
 * Send weekly review push
 */
export async function sendWeeklyReviewPush(fcmToken, userName) {
  const firstName = userName?.split(' ')[0] || 'Teman'
  return sendPushNotification(
    fcmToken,
    '📝 Weekly Review Minggu Ini',
    `${firstName}, ada catatan refleksi mingguan dari Diah Anna untukmu!`,
    { type: 'weekly-review', action: 'open-dashboard' }
  )
}

/**
 * Send push ke multiple devices
 */
export async function sendPushToMultiple(fcmTokens, title, body, data = {}) {
  if (!fcmTokens || fcmTokens.length === 0) {
    return { error: 'No FCM tokens provided' }
  }
  if (!firebaseAdminReady) return { error: `Firebase Admin belum siap: ${firebaseAdminInitError || 'penyebab tidak diketahui'}` }

  try {
    const message = {
      notification: { title, body },
      data: { ...data, timestamp: new Date().toISOString() },
      webpush: {
        fcmOptions: { link: 'https://verneks.my.id/dashboard' },
        notification: {
          title, body,
          icon: 'https://verneks.my.id/icons/icon-192x192.png',
          click_action: 'https://verneks.my.id/dashboard'
        }
      }
    }

    // FIX: sendMulticast() sudah DIHAPUS di firebase-admin v12+ (project ini
    // pakai v14) — diganti sendEachForMulticast(), signature & response
    // shape-nya sama persis (successCount/failureCount/responses[]).
    const response = await messaging.sendEachForMulticast({
      ...message,
      tokens: fcmTokens
    })

    console.log(`[sendPushToMultiple] Sent: ${response.successCount}, Failed: ${response.failureCount}`)

    // Nonaktifkan token yang memang sudah tidak valid lagi (bukan gagal
    // sementara karena network/quota) — supaya batch berikutnya tidak
    // buang-buang panggilan API ke token yang sama.
    if (response.failureCount > 0) {
      await Promise.all(
        response.responses.map((r, i) =>
          !r.success && STALE_TOKEN_ERROR_CODES.has(r.error?.code)
            ? deactivateFcmToken(fcmTokens[i])
            : null
        )
      )
    }

    return { 
      success: true, 
      successCount: response.successCount,
      failureCount: response.failureCount,
    }
  } catch (error) {
    console.error('[sendPushToMultiple]', error)
    return { error: error.message }
  }
}

// ═════════════════════════════════════════════════════════════════════════
// COMBINED FUNCTIONS (Email + Push)
// ═════════════════════════════════════════════════════════════════════════

/**
 * Send chat reminder via both email & push
 * FIX: parameter `personalLine` sebelumnya tidak ada di signature ini, padahal
 * caller (api/cron/jobs.js) sudah repot-repot generate kalimat personal via AI
 * dan mengirimkannya sebagai argumen ke-5 — di JS, extra argument yang tidak
 * ada di signature cuma dibuang diam-diam (bukan error), jadi personalLine
 * itu SELALU hilang dan notifikasi yang terkirim selalu pakai template
 * generik, bukan kalimat personal yang sudah capek-capek di-generate.
 */
export async function notifyChatReminder(userEmail, fcmToken, userName, pendingStepTitle, personalLine = null) {
  const results = {}

  // Send email
  if (userEmail) {
    results.email = await sendChatReminderEmail(userEmail, userName, pendingStepTitle)
  }

  // Send push
  if (fcmToken) {
    results.push = await sendChatReminderPush(fcmToken, userName, pendingStepTitle, personalLine)
  }

  return results
}

/**
 * Send weekly review via both email & push
 */
export async function notifyWeeklyReview(userEmail, fcmToken, userName, reviewText) {
  const results = {}

  // Send email
  if (userEmail) {
    results.email = await sendWeeklyReviewEmail(userEmail, userName, reviewText)
  }

  // Send push
  if (fcmToken) {
    results.push = await sendWeeklyReviewPush(fcmToken, userName)
  }

  return results
}

/**
 * Get user FCM token dari database
 */
export async function getUserFcmToken(userId) {
  try {
    const { data, error } = await supabase
      .from('user_push_tokens')
      .select('fcm_token')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data?.fcm_token || null
  } catch (error) {
    console.error('[getUserFcmToken]', error)
    return null
  }
}

/**
 * Save FCM token ke database
 */
export async function saveFcmToken(userId, fcmToken) {
  try {
    const { error } = await supabase
      .from('user_push_tokens')
      .upsert({
        user_id: userId,
        fcm_token: fcmToken,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('[saveFcmToken]', error)
    return { error: error.message }
  }
}
