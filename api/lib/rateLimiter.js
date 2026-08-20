/**
 * rateLimiter.js — Soft limit & antrian untuk Cerebras free tier
 * =============================================================================
 * Cerebras free tier: ~1 juta token/hari (agregat, bukan per-user), dan rate
 * limit per-request relatif rendah. Kalau semua user dilempar langsung ke
 * Cerebras tanpa kontrol, kita bisa kena 429 masal saat traffic naik.
 *
 * Strategi (MVP, cukup untuk launch cepat, gampang di-upgrade nanti):
 *  1. Simpan token usage harian di Supabase (tabel `ai_usage_daily`, cuma
 *     angka agregat — bukan data sensitif) supaya jalan di Vercel serverless
 *     (tanpa state di memory yang hilang tiap cold start).
 *  2. Soft cap per user per hari (default: 60 pesan/hari di plan free) —
 *     bukan buat "menghukum", tapi biar 1 user berat tidak menghabiskan
 *     kuota harian yang dipakai bersama semua user.
 *  3. Kalau limit tercapai: balikin pesan ramah (bukan error teknis) yang
 *     Diah Anna sendiri yang "ngomong", supaya tetap terasa in-character.
 *  4. Struktur di bawah ini sengaja dipisah per-provider supaya gampang
 *     nambah fallback provider baru (lihat FALLBACK_CHAIN di ai.js).
 *
 * NOTE: Ini soft limiter aplikasi kita sendiri (defense-in-depth), BUKAN
 * pengganti retry/fallback provider yang sudah ada di ai.js — keduanya
 * saling melengkapi: rateLimiter mencegah kita ngebom Cerebras duluan,
 * fallback chain di ai.js menangani kalau Cerebras tetap gagal/limit.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Soft cap per user per hari untuk plan free. Angka awal, gampang di-tuning
// dari dashboard/env var setelah lihat data pemakaian real.
const FREE_DAILY_MESSAGE_CAP = Number(process.env.FREE_DAILY_MESSAGE_CAP || 60)

function todayKey() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

/**
 * Cek & increment counter pesan harian user. Return { allowed, remaining }.
 * Dipanggil SEBELUM memanggil generateChat di handler chat utama.
 */
export async function checkAndConsumeDailyQuota(userId) {
  const day = todayKey()
  const { data: existing, error: readErr } = await supabaseAdmin
    .from('ai_usage_daily')
    .select('message_count')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle()

  if (readErr) {
    // Kalau tabel usage bermasalah, jangan block user — fail open, cuma log.
    console.warn('[rateLimiter] gagal baca usage, fail-open:', readErr.message)
    return { allowed: true, remaining: FREE_DAILY_MESSAGE_CAP }
  }

  const current = existing?.message_count || 0
  if (current >= FREE_DAILY_MESSAGE_CAP) {
    return { allowed: false, remaining: 0 }
  }

  const { error: upsertErr } = await supabaseAdmin
    .from('ai_usage_daily')
    .upsert(
      { user_id: userId, day, message_count: current + 1, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,day' }
    )

  if (upsertErr) {
    console.warn('[rateLimiter] gagal update usage:', upsertErr.message)
  }

  return { allowed: true, remaining: FREE_DAILY_MESSAGE_CAP - (current + 1) }
}

/**
 * Pesan ramah dari Diah Anna sendiri kalau limit harian kena — supaya tidak
 * terasa seperti error teknis. Dirotasi biar tidak monoton.
 */
const SOFT_LIMIT_MESSAGES = [
  'Duh, kita udah banyak banget ngobrol hari ini sampai kuota gratisku hari ini abis 😅 Yuk lanjut besok ya, aku tetap di sini kok.',
  'Aku butuh istirahat sebentar nih, kuota chat gratis hari ini udah kepakai habis. Besok kita lanjut lagi ya!',
  'Kayaknya kita udah ngobrol panjang banget hari ini (yang bagus!) — tapi kuota gratisku buat hari ini abis. Sampai besok ya 💛',
]

export function getSoftLimitMessage() {
  return SOFT_LIMIT_MESSAGES[Math.floor(Math.random() * SOFT_LIMIT_MESSAGES.length)]
}

/**
 * SQL migration yang dibutuhkan (tambahkan ke supabase_migration_*.sql):
 *
 * create table if not exists ai_usage_daily (
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   day date not null,
 *   message_count int not null default 0,
 *   updated_at timestamptz not null default now(),
 *   primary key (user_id, day)
 * );
 */
