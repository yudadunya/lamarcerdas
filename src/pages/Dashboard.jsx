import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const GENOME_MAP = [
  { key: 'analytical',    label: 'Self-Awareness',   emoji: '🧠', color: '#34B7F1' },
  { key: 'leadership',    label: 'Resilience',       emoji: '🌱', color: '#F48FB1' },
  { key: 'builder',       label: 'Coping Kreatif',   emoji: '⚙️', color: '#25D366' },
  { key: 'creator',       label: 'Keterbukaan',      emoji: '🌤️', color: '#FFB74D' },
  { key: 'communication', label: 'Komunikasi Emosi', emoji: '💬', color: '#CE93D8' },
  { key: 'risk_taking',   label: 'Empati',           emoji: '💗', color: '#EF9A9A' },
]

// Peta fokus utama → rekomendasi aktivitas self-care berdasarkan kata kunci
const CAREER_RELATIVES = {
  'overthinking':      [['Journaling Malam', 88], ['Teknik Grounding', 82], ['Meditasi 10 Menit', 76]],
  'kesehatan mental':  [['Konseling/Terapi', 90], ['Rutinitas Tidur', 84], ['Olahraga Ringan', 78]],
  'hubungan':          [['Komunikasi Asertif', 89], ['Support Group', 83], ['Quality Time', 75]],
  'self-care':         [['Rutinitas Pagi', 87], ['Digital Detox', 81], ['Hobi Kreatif', 74]],
  'default':           [['Journaling', 87], ['Cerita ke Teman Dekat', 81], ['Me-Time Rutin', 74]],
}

function getOpportunities(targetPosisi, readiness) {
  if (!targetPosisi) return []
  const key = targetPosisi.toLowerCase()
  let found = CAREER_RELATIVES.default
  for (const [k, v] of Object.entries(CAREER_RELATIVES)) {
    if (k === 'default') continue
    if (key.includes(k) || k.split(' ').some(w => key.includes(w))) {
      found = v
      break
    }
  }
  // Sesuaikan match % dengan readiness
  const delta = Math.round((readiness - 50) / 10)
  return found.map(([title, base]) => [
    title,
    Math.min(97, Math.max(55, base + delta))
  ])
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fade(delay = 0, visible = true) {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(14px)',
    transition: `opacity 0.4s ease ${delay}s, transform 0.4s ease ${delay}s`,
  }
}

const S = {
  card: (extra = {}) => ({
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 18, padding: '18px 18px',
    marginBottom: 12, ...extra,
  }),
  label: { color: 'rgba(255,255,255,0.35)', fontSize: '0.65rem', letterSpacing: '1px', marginBottom: 4 },
  sectionTitle: { color: '#fff', fontWeight: 700, fontSize: '0.88rem', marginBottom: 12 },
  greenBar: (pct) => ({
    background: 'linear-gradient(90deg,#25D366,#34B7F1)', height: '100%',
    width: `${pct}%`, borderRadius: 99, transition: 'width 1.2s ease',
  }),
}

// ─── FREE DASHBOARD ───────────────────────────────────────────────────────────
function FreeDashboard({ user, profile, genome, growth, onUpgrade, weeklyReview }) {
  const navigate  = useNavigate()
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 80) }, [])

  const firstName    = user?.user_metadata?.full_name?.split(' ')[0]
                    || user?.user_metadata?.name?.split(' ')[0] || 'Kamu'
  const targetPosisi = profile?.target_posisi || null
  const readiness    = growth?.progress_percent || profile?.career_readiness || 0
  const gaps         = profile?.skill_gaps || profile?.gap_skills || []
  const gpsSteps     = profile?.gps_steps || growth?.gps_steps || []
  const mentorMsg    = profile?.mentor_message || growth?.mentor_message || null
  const currentFocus = growth?.current_focus || gaps[0] || null
  const opportunities = getOpportunities(targetPosisi, readiness)

  // ── Greeting yang kontekstual ──────────────────────────────────────────────
  const hour = new Date().getHours()
  const timeGreet = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam'

  // ── Diah Anna daily message berdasarkan sinyal ────────────────────────────
  const daysSince = profile?.last_updated
    ? Math.floor((Date.now() - new Date(profile.last_updated)) / 86400000) : 99
  const doneSteps  = gpsSteps.filter(s => s.done).length
  const totalSteps = gpsSteps.length
  const weeklyRate = daysSince <= 7 ? 5 : daysSince <= 14 ? 2 : 0
  const etaWeeks   = weeklyRate > 0 ? Math.ceil((100 - readiness) / weeklyRate) : null

  const getDiahMessage = () => {
    if (daysSince > 21) return { msg: `Aku sudah lama menunggu, ${firstName}. Momentum bisa hilang kalau terlalu lama berhenti — hari ini, satu langkah kecil saja.`, tone: '#ff6b6b' }
    if (daysSince > 7)  return { msg: `${firstName}, sudah beberapa hari kita tidak ngobrol. Jangan biarkan ritmemu hilang — aku di sini kalau kamu mau lanjut.`, tone: '#FFB74D' }
    if (readiness >= 80) return { msg: `${firstName}, tinggal sedikit lagi. Kamu hampir sampai — jangan berhenti sekarang.`, tone: '#25D366' }
    if (doneSteps > 0)  return { msg: `${firstName}, aku melihat progresmu. Terus pertahankan ritme ini — satu langkah hari ini lebih berarti dari sepuluh rencana.`, tone: '#25D366' }
    if (doneSteps === 0 && totalSteps > 0) return { msg: `${firstName}, roadmapmu sudah siap. Yang kubutuhkan darimu hari ini cukup satu langkah pertama saja.`, tone: '#FFB74D' }
    return { msg: `${timeGreet}, ${firstName}. Aku sudah menyiapkan fokus terbaikmu hari ini — mari kita mulai.`, tone: '#34B7F1' }
  }
  const diahMsg = getDiahMessage()

  // Hitung hari bergabung
  const joinedAt  = profile?.created_at || user?.created_at
  const daysTogether = joinedAt
    ? Math.floor((Date.now() - new Date(joinedAt)) / 86400000) : 0

  const dispatchUpgrade = () =>
    window.dispatchEvent(new CustomEvent('show-upgrade', { detail: { profile, genome, growth } }))

  return (
    <div style={{ padding: '16px 16px 0', maxWidth: 480, margin: '0 auto' }}>

      {/* ═══ 1. PERSONAL GREETING ════════════════════════════════════════════ */}
      <div style={{ ...fade(0.02, visible), padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(37,211,102,0.3)', flexShrink: 0 }}>
              {user?.user_metadata?.avatar_url
                ? <img src={user.user_metadata.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', background: '#1a3a20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>👤</div>}
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>{timeGreet}, {firstName} 👋</div>
              {daysTogether > 0 && (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', marginTop: 2 }}>
                  Hari ke-{daysTogether} perjalanan kita bersama
                </div>
              )}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 99, padding: '4px 12px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => window.dispatchEvent(new CustomEvent('show-upgrade', { detail: {} }))}>
            FREE → Upgrade
          </div>
        </div>
      </div>

      {/* ═══ 2. DIAH ANNA DAILY MESSAGE ══════════════════════════════════════ */}
      <div style={{
        ...S.card({ background: 'linear-gradient(135deg,rgba(13,10,30,0.9),rgba(20,15,45,0.9))', border: `1px solid ${diahMsg.tone}30` }),
        ...fade(0.04, visible),
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${diahMsg.tone}60`, flexShrink: 0 }} />
          <div>
            <div style={{ color: diahMsg.tone, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', marginBottom: 6 }}>💬 DIAH ANNA</div>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem', lineHeight: 1.7 }}>{diahMsg.msg}</div>
          </div>
        </div>
        <button onClick={() => navigate('/chat')}
          style={{ width: '100%', marginTop: 14, padding: '10px', background: 'linear-gradient(135deg,#25D366,#128C7E)', color: '#fff', fontWeight: 700, fontSize: '0.83rem', borderRadius: 10, border: 'none', cursor: 'pointer' }}>
          💬 Balas Diah Anna
        </button>
      </div>

      {/* ═══ 3. TARGET + FOKUS HARI INI ══════════════════════════════════════ */}
      {targetPosisi && (
        <div style={{
          ...S.card({ background: 'linear-gradient(135deg,#0d2b1a,#0f3324)', border: '1px solid rgba(37,211,102,0.25)' }),
          ...fade(0.06, visible),
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', letterSpacing: '1px', marginBottom: 4 }}>🎯 TARGET KARIER</div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>{targetPosisi}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#25D366', fontWeight: 900, fontSize: '1.5rem', lineHeight: 1 }}>{readiness}%</div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem' }}>Readiness</div>
            </div>
          </div>

          {currentFocus && (
            <div style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', letterSpacing: '0.5px', marginBottom: 4 }}>🎯 FOKUS HARI INI</div>
              <div style={{ color: '#fff', fontSize: '0.83rem', fontWeight: 600, lineHeight: 1.5 }}>{currentFocus}</div>
              <div style={{ color: 'rgba(37,211,102,0.7)', fontSize: '0.72rem', marginTop: 5 }}>
                Satu langkah kecil hari ini lebih baik dari sepuluh rencana.
              </div>
            </div>
          )}

          {etaWeeks && (
            <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center' }}>
              📅 Dengan ritme ini, target bisa tercapai dalam ~{etaWeeks} minggu
            </div>
          )}
        </div>
      )}

      {/* ═══ CATATAN DIAH ANNA MINGGU INI ═══════════════════════════════════ */}
      {weeklyReview?.review_text && (
        <div style={{
          ...S.card({ background: 'linear-gradient(135deg, rgba(79,70,229,0.08), rgba(6,182,212,0.05))', border: '1px solid rgba(79,70,229,0.2)' }),
          ...fade(0.05, visible),
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <img src="/diah-anna.png" alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: '1.5px solid rgba(79,70,229,0.4)' }} />
            <div>
              <div style={{ color: '#A5A0FF', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.3px', marginBottom: 4 }}>
                📝 CATATAN DIAH ANNA MINGGU INI
              </div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.83rem', lineHeight: 1.6 }}>
                {weeklyReview.review_text}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SECTION 2 — CAREER SNAPSHOT ════════════════════════════════════ */}
      {(targetPosisi || gaps.length > 0) && (
        <div style={{ ...S.card(), ...fade(0.1, visible) }}>
          <div style={S.sectionTitle}>📊 Snapshot Karier</div>

          {targetPosisi && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>Target</span>
              <span style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 600 }}>{targetPosisi}</span>
            </div>
          )}

          {readiness > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 5 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Readiness</span>
                <span style={{ color: '#25D366', fontWeight: 700 }}>{readiness}%</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 7, overflow: 'hidden' }}>
                <div style={S.greenBar(readiness)} />
              </div>
            </div>
          )}

          {gaps.length > 0 && (
            <div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.68rem', marginBottom: 7 }}>Gap Utama</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {gaps.slice(0, 4).map((g, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#EF5350', fontSize: '0.75rem', flexShrink: 0 }}>❌</span>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>{g}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ SECTION 3 — INSIGHT DIAH ANNA ══════════════════════════════════ */}
      <div style={{ ...S.card({ background: 'rgba(37,211,102,0.04)', border: '1px solid rgba(37,211,102,0.13)' }), ...fade(0.15, visible) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(37,211,102,0.35)', flexShrink: 0 }} />
          <div>
            <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.83rem' }}>Diah Anna</div>
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.62rem' }}>Teman Curhat AI</div>
          </div>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', lineHeight: 1.75 }}>
          {mentorMsg || (targetPosisi
            ? `${firstName}, aku lihat kamu udah cukup jalan soal ${targetPosisi}. Kamu udah ${readiness}% siap. ${gaps.length > 0 ? `Yang masih perlu dilatih sekarang: ${gaps.slice(0, 2).join(' dan ')}.` : ''}`
            : `Halo ${firstName}! Aku siap nemenin kamu cerita apapun yang lagi dipikirin. Mulai ngobrol yuk, biar aku bisa mulai kenal pola diri kamu.`
          )}
        </div>
      </div>

      {/* ═══ SECTION 4 — CAREER GPS PREVIEW ═════════════════════════════════ */}
      {gpsSteps.length > 0 && (
        <div style={{ ...S.card({ position: 'relative', overflow: 'hidden' }), ...fade(0.2, visible) }}>
          <div style={S.sectionTitle}>🚀 Langkah Self-Care Preview</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {gpsSteps.map((step, i) => {
              const unlocked = i < 2
              const done = step.done
              return (
                <div
                  key={i}
                  onClick={() => { if (!unlocked) dispatchUpgrade() }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: unlocked ? 'default' : 'pointer' }}
                >
                  <span style={{ fontSize: '0.85rem', flexShrink: 0, color: done ? '#25D366' : unlocked ? '#34B7F1' : 'rgba(255,255,255,0.18)' }}>
                    {done ? '✓' : unlocked ? '📍' : '🔒'}
                  </span>
                  <span style={{
                    fontSize: '0.84rem', flex: 1,
                    color: done ? '#25D366' : unlocked ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)',
                    filter: !unlocked ? 'blur(4px)' : 'none',
                    userSelect: !unlocked ? 'none' : 'auto',
                  }}>
                    {step.title}
                  </span>
                </div>
              )
            })}
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 55, background: 'linear-gradient(to top,#0a0f0d,transparent)', pointerEvents: 'none' }} />
          <button
            onClick={dispatchUpgrade}
            style={{ marginTop: 14, width: '100%', padding: '10px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)', color: '#25D366', fontWeight: 700, fontSize: '0.82rem', borderRadius: 10, cursor: 'pointer' }}
          >
            🔓 Buka Langkah Lengkap
          </button>
        </div>
      )}

      {/* ═══ SECTION 5 — OPPORTUNITY PREVIEW ════════════════════════════════ */}
      {opportunities.length > 0 && (
        <div style={{ ...S.card(), ...fade(0.25, visible) }}>
          <div style={S.sectionTitle}>🌿 Cocok Untuk Kamu</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {opportunities.map(([title, match], i) => (
              <div
                key={i}
                onClick={() => i > 0 && dispatchUpgrade()}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: i === 0 ? 'rgba(37,211,102,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${i === 0 ? 'rgba(37,211,102,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 12, cursor: i > 0 ? 'pointer' : 'default' }}
              >
                <div>
                  <div style={{ color: '#fff', fontSize: '0.84rem', fontWeight: 600, marginBottom: 2 }}>{title}</div>
                  {i === 0 && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>Paling cocok dengan pola dirimu</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ color: i === 0 ? '#25D366' : 'rgba(255,255,255,0.35)', fontWeight: 800, fontSize: '0.95rem' }}>
                    {i === 0 ? `${match}%` : '🔒'}
                  </div>
                  {i === 0 && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem' }}>Match</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ NO DATA STATE ═══════════════════════════════════════════════════ */}
      {!targetPosisi && gaps.length === 0 && (
        <div style={{ textAlign: 'center', padding: '36px 16px', ...fade(0.1, visible) }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>🧬</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>Profil diri belum terbentuk</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.83rem', lineHeight: 1.65, marginBottom: 22 }}>
            Cerita dulu ke Diah Anna, biar dia bisa mulai memetakan pola diri kamu secara personal.
          </div>
          <button
            onClick={() => window.location.href = '/discovery'}
            style={{ padding: '13px 32px', background: 'linear-gradient(135deg,#25D366,#128C7E)', color: '#fff', fontWeight: 700, borderRadius: 13, border: 'none', cursor: 'pointer', boxShadow: '0 4px 18px rgba(37,211,102,0.35)' }}
          >
            🚀 Mulai Cerita ke Diah Anna
          </button>
        </div>
      )}

    </div>
  )
}

// ─── PREMIUM DASHBOARD ────────────────────────────────────────────────────────
function PremiumDashboard({ user, profile, genome, growth, actions, events, weeklyReview }) {
  const navigate  = useNavigate()
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 80) }, [])

  const firstName    = user?.user_metadata?.full_name?.split(' ')[0]
                    || user?.user_metadata?.name?.split(' ')[0] || 'Kamu'
  const targetPosisi = profile?.target_posisi || null
  const readiness    = growth?.progress_percent || profile?.career_readiness || 0
  const gaps         = profile?.skill_gaps || profile?.gap_skills || []
  const gpsSteps     = profile?.gps_steps || growth?.gps_steps || []
  const mentorMsg    = profile?.mentor_message || null
  const currentFocus = growth?.current_focus || gaps[0] || null
  const opportunities = getOpportunities(targetPosisi, readiness)

  // Hitung +progress minggu ini dari career_events (jika ada)
  const weekProgress = events?.length > 0
    ? Math.min(12, Math.max(1, events.filter(e => {
        const d = new Date(e.created_at)
        return (Date.now() - d.getTime()) < 7 * 24 * 3600 * 1000
      }).length * 2))
    : 4

  // Today's Mission: dari next_actions atau derive dari current focus
  const todayMission = actions?.length > 0
    ? actions[0]
    : currentFocus
      ? { title: `Coba: ${currentFocus}`, duration_estimate: '15–30 menit', impact: 'Tinggi', reward_points: 2 }
      : null

  // Activity history
  const recentEvents = events?.slice(0, 5) || []

  // ── Greeting & Diah Anna message (sama seperti free, tapi lebih kaya) ──────
  const hour2 = new Date().getHours()
  const timeGreet2 = hour2 < 11 ? 'Selamat pagi' : hour2 < 15 ? 'Selamat siang' : hour2 < 18 ? 'Selamat sore' : 'Selamat malam'
  const daysSince2 = profile?.last_updated
    ? Math.floor((Date.now() - new Date(profile.last_updated)) / 86400000) : 0
  const doneSteps2  = gpsSteps.filter(s => s.done).length
  const totalSteps2 = gpsSteps.length
  const weeklyRate2 = daysSince2 <= 7 ? 5 : daysSince2 <= 14 ? 2 : 0
  const etaWeeks2   = weeklyRate2 > 0 ? Math.ceil((100 - readiness) / weeklyRate2) : null
  const joinedAt2   = profile?.created_at || user?.created_at
  const daysTogether2 = joinedAt2 ? Math.floor((Date.now() - new Date(joinedAt2)) / 86400000) : 0

  const getPremiumDiahMsg = () => {
    if (weeklyReview?.summary) return { msg: weeklyReview.summary, tone: '#A5A0FF' }
    if (daysSince2 > 14) return { msg: `${firstName}, sudah ${daysSince2} hari. Aku tahu kamu sibuk — tapi jangan biarkan momentum yang sudah kamu bangun hilang begitu saja.`, tone: '#ff6b6b' }
    if (readiness >= 80) return { msg: `${firstName}, kamu hampir sampai. ${100 - readiness}% lagi — ini bukan saat untuk mengendurkan tempo.`, tone: '#25D366' }
    if (doneSteps2 > 0) return { msg: `${firstName}, ${doneSteps2} dari ${totalSteps2} langkah sudah selesai. Aku melihat traction yang nyata — pertahankan.`, tone: '#25D366' }
    return { msg: `${timeGreet2}, ${firstName}. Aku sudah menyiapkan fokus terbaik untukmu hari ini. Mari kita lanjutkan perjalanan ini.`, tone: '#34B7F1' }
  }
  const premiumDiahMsg = getPremiumDiahMsg()

  return (
    <div style={{ padding: '0', maxWidth: 480, margin: '0 auto' }}>

      {/* ═══ 1. PERSONAL GREETING — PREMIUM ══════════════════════════════════ */}
      <div style={{ ...fade(0.02, visible), padding: '14px 16px 0', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,183,77,0.5)', flexShrink: 0 }}>
              {user?.user_metadata?.avatar_url
                ? <img src={user.user_metadata.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', background: '#2a1a05', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>👤</div>}
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>{timeGreet2}, {firstName} 👋</div>
              {daysTogether2 > 0 && (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', marginTop: 2 }}>
                  Hari ke-{daysTogether2} perjalanan kita bersama
                </div>
              )}
            </div>
          </div>
          <div style={{ background: 'rgba(255,183,77,0.1)', border: '1px solid rgba(255,183,77,0.3)', borderRadius: 99, padding: '4px 12px', fontSize: '0.68rem', color: '#FFB74D', fontWeight: 700 }}>
            ⭐ PREMIUM
          </div>
        </div>
      </div>

      {/* ═══ 2. DIAH ANNA MESSAGE — PREMIUM ══════════════════════════════════ */}
      <div style={{
        ...S.card({ background: 'linear-gradient(135deg,rgba(13,10,30,0.95),rgba(20,15,50,0.95))', border: `1px solid ${premiumDiahMsg.tone}40` }),
        ...fade(0.04, visible),
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${premiumDiahMsg.tone}70`, flexShrink: 0 }} />
          <div>
            <div style={{ color: premiumDiahMsg.tone, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', marginBottom: 6 }}>💬 DIAH ANNA</div>
            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.88rem', lineHeight: 1.75 }}>{premiumDiahMsg.msg}</div>
          </div>
        </div>
        <button onClick={() => navigate('/chat')}
          style={{ width: '100%', marginTop: 14, padding: '11px', background: 'linear-gradient(135deg,#7B6BFF,#a594ff)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', borderRadius: 11, border: 'none', cursor: 'pointer' }}>
          💬 Lanjutkan Obrolan
        </button>
      </div>

      {/* ═══ 3. HERO CARD — TARGET + MOMENTUM ════════════════════════════════ */}
      <div style={{
        background: 'linear-gradient(135deg,#0a2218,#0f3324,#0d1f2a)',
        border: '1px solid rgba(37,211,102,0.3)',
        borderRadius: 18, padding: '20px 18px', marginBottom: 12,
        ...fade(0.06, visible),
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', letterSpacing: '1px', marginBottom: 4 }}>🎯 TARGET KARIER</div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem' }}>{targetPosisi || '—'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#25D366', fontWeight: 900, fontSize: '1.5rem', lineHeight: 1 }}>{readiness}%</div>
            <div style={{ color: '#34B7F1', fontSize: '0.72rem', fontWeight: 600 }}>🔥 +{weekProgress}% minggu ini</div>
          </div>
        </div>

        {currentFocus && (
          <div style={{ background: 'rgba(52,183,241,0.1)', border: '1px solid rgba(52,183,241,0.2)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', letterSpacing: '0.5px', marginBottom: 4 }}>🎯 FOKUS HARI INI</div>
            <div style={{ color: '#fff', fontSize: '0.83rem', fontWeight: 600, lineHeight: 1.5 }}>{currentFocus}</div>
            <div style={{ color: 'rgba(52,183,241,0.7)', fontSize: '0.72rem', marginTop: 5 }}>
              Satu langkah hari ini lebih berharga dari sepuluh rencana.
            </div>
          </div>
        )}

        {etaWeeks2 && (
          <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center' }}>
            📅 Dengan ritme ini, target tercapai dalam ~{etaWeeks2} minggu
          </div>
        )}
      </div>

      {/* ═══ SECTION 2 — TODAY'S MISSION ═════════════════════════════════════ */}
      {todayMission && (
        <div style={{
          background: 'linear-gradient(135deg,rgba(255,183,77,0.08),rgba(255,183,77,0.04))',
          border: '1px solid rgba(255,183,77,0.2)',
          borderRadius: 18, padding: '18px', marginBottom: 12,
          ...fade(0.1, visible),
        }}>
          <div style={{ color: '#FFB74D', fontWeight: 700, fontSize: '0.85rem', marginBottom: 12 }}>🎯 Misi Hari Ini</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', marginBottom: 12 }}>
            {todayMission.title}
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '6px 10px', flex: 1, textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem' }}>Estimasi</div>
              <div style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 600 }}>{todayMission.duration_estimate || '60 menit'}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '6px 10px', flex: 1, textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem' }}>Dampak</div>
              <div style={{ color: '#FFB74D', fontSize: '0.75rem', fontWeight: 600 }}>{todayMission.impact || 'Tinggi'}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '6px 10px', flex: 1, textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem' }}>Reward</div>
              <div style={{ color: '#25D366', fontSize: '0.75rem', fontWeight: 600 }}>+{todayMission.reward_points || 2} poin</div>
            </div>
          </div>
          <button
            onClick={() => navigate('/chat')}
            style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg,#FFB74D,#f57c00)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', borderRadius: 11, border: 'none', cursor: 'pointer', boxShadow: '0 3px 14px rgba(255,183,77,0.35)' }}
          >
            Mulai Bersama Diah Anna →
          </button>
        </div>
      )}

      {/* ═══ SECTION 3 — PROGRESS OVERVIEW ══════════════════════════════════ */}
      <div style={{ ...S.card(), ...fade(0.15, visible) }}>
        <div style={S.sectionTitle}>🔥 Momentum Diri</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: '#25D366', fontWeight: 900, fontSize: '2rem', lineHeight: 1 }}>{readiness}%</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem' }}>Target</div>
            <div style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 600 }}>80%</div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 10, overflow: 'hidden', marginBottom: 8 }}>
          <div style={S.greenBar(readiness)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>Progress Minggu Ini</span>
          <span style={{ color: '#25D366', fontWeight: 700 }}>+{weekProgress}%</span>
        </div>
      </div>

      {/* ═══ SECTION 4 — JOURNEY PROGRESS ═══════════════════════════════════ */}
      {gpsSteps.length > 0 && (
        <div style={{ ...S.card(), ...fade(0.2, visible) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={S.sectionTitle}>🗺️ Langkah Self-Care</div>
            <button onClick={() => navigate('/journey')} style={{ background: 'none', border: 'none', color: '#25D366', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>Lihat Semua →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {gpsSteps.slice(0, 5).map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => navigate('/journey')}>
                <span style={{ fontSize: '0.85rem', flexShrink: 0, color: step.done ? '#25D366' : i === gpsSteps.findIndex(s => !s.done) ? '#34B7F1' : 'rgba(255,255,255,0.2)' }}>
                  {step.done ? '✅' : i === gpsSteps.findIndex(s => !s.done) ? '📍' : '🔒'}
                </span>
                <span style={{
                  fontSize: '0.83rem', color: step.done ? '#25D366' : i === gpsSteps.findIndex(s => !s.done) ? '#fff' : 'rgba(255,255,255,0.3)',
                  fontWeight: i === gpsSteps.findIndex(s => !s.done) ? 600 : 400,
                  cursor: 'pointer',
                }}>
                  {step.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SECTION 5 — INSIGHT MINGGU INI ═════════════════════════════════ */}
      <div style={{
        ...S.card({ background: 'rgba(37,211,102,0.04)', border: '1px solid rgba(37,211,102,0.13)' }),
        ...fade(0.25, visible),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(37,211,102,0.35)', flexShrink: 0 }} />
          <div>
            <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.83rem' }}>Insight Minggu Ini</div>
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.62rem' }}>Diah Anna</div>
          </div>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', lineHeight: 1.75 }}>
          {firstName}, {mentorMsg
            ? mentorMsg
            : `aku lihat progres kamu naik ${weekProgress}% dalam 7 hari terakhir. ${targetPosisi ? `Kalau ritme ini dipertahankan, kamu bakal ngerasa lebih baik soal ${targetPosisi} lebih cepat dari perkiraan.` : 'Tetap konsisten ya!'}`
          }
        </div>
        <button
          onClick={() => navigate('/chat')}
          style={{ marginTop: 14, width: '100%', padding: '11px', background: 'linear-gradient(135deg,#25D366,#128C7E)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', borderRadius: 11, border: 'none', cursor: 'pointer', boxShadow: '0 3px 14px rgba(37,211,102,0.3)' }}
        >
          💬 Tanya Diah Anna
        </button>
      </div>

      {/* ═══ SECTION 6 — OPPORTUNITIES ═══════════════════════════════════════ */}
      {opportunities.length > 0 && (
        <div style={{ ...S.card(), ...fade(0.3, visible) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={S.sectionTitle}>🌿 Rekomendasi Terbaik</div>
            <button onClick={() => navigate('/opportunities')} style={{ background: 'none', border: 'none', color: '#25D366', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>Lihat Semua →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {opportunities.map(([title, match], i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px',
                background: i === 0 ? 'rgba(37,211,102,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${i === 0 ? 'rgba(37,211,102,0.2)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 12,
              }}>
                <div style={{ color: '#fff', fontSize: '0.84rem', fontWeight: i === 0 ? 600 : 400 }}>{title}</div>
                <div style={{ color: i === 0 ? '#25D366' : 'rgba(255,255,255,0.45)', fontWeight: 700, fontSize: '0.88rem' }}>{match}% <span style={{ fontSize: '0.6rem', fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>Match</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SECTION 7 — ACTIVITY HISTORY ════════════════════════════════════ */}
      {recentEvents.length > 0 && (
        <div style={{ ...S.card(), ...fade(0.35, visible) }}>
          <div style={S.sectionTitle}>📅 Aktivitas Terakhir</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentEvents.map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#25D366', fontSize: '0.75rem' }}>✓</span>
                <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.8rem' }}>{ev.title || ev.description || 'Aktivitas self-care'}</span>
                {ev.points && <span style={{ marginLeft: 'auto', color: '#25D366', fontSize: '0.7rem', fontWeight: 600 }}>+{ev.points}%</span>}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
// Default aman kalau prop subscription literal undefined (mismatch deploy,
// race Suspense, atau sebab lain) — JANGAN biarkan ini crash hard.
// loading:true sengaja, supaya UI tahu status sebenarnya belum jelas,
// bukan asumsi pasti 'free' yang bisa salah kalau user aslinya premium.
const DEFAULT_SUBSCRIPTION = {
  plan: 'free',
  loading: true,
  checkUsage: async () => false,
  logUsage: () => {},
  fetchPlan: () => {},
  getRemainingChat: async () => 0,
  isExpired: false,
}

export default function Dashboard({ user, loading = false, subscription = DEFAULT_SUBSCRIPTION }) {
  const navigate  = useNavigate()
  const [profile, setProfile]   = useState(null)
  const [genome, setGenome]     = useState(null)
  const [growth, setGrowth]     = useState(null)
  const [actions, setActions]   = useState([])
  const [events, setEvents]     = useState([])
  const [weeklyReview, setWeeklyReview] = useState(null)
  // isPremium sekarang DIDERIVE dari subscription yang di-lift ke App.jsx —
  // bukan query terpisah di Promise.all bawah ini lagi.
  const isPremium = !subscription.loading && subscription.plan === 'premium'
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (loading) return // tunggu App.jsx selesai getSession
    if (!user) { navigate('/'); return }
    
    // Fetch data utama dari Supabase
    Promise.all([
      supabase.from('user_career_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_genome_scores').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_growth_state').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_next_actions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(3),
      supabase.from('career_events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    ]).then(([{ data: p }, { data: g }, { data: gw }, { data: acts }, { data: evs }]) => {
      setProfile(p)
      setGenome(g)
      setGrowth(gw)
      setActions(acts || [])
      setEvents(evs || [])
      setDataLoading(false)

      // Backfill user lama: kalau summary kosong tapi ada career data → refresh otomatis
      if (p?.target_posisi && !p?.summary) {
        fetch('/api/utils?action=refresh-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id })
        }).then(r => r.json()).then(res => {
          if (res.success) {
            setProfile(prev => ({
              ...prev,
              summary:        res.updated.summary        || prev?.summary,
              mentor_message: res.updated.mentor_message || prev?.mentor_message,
              motivasi:       res.updated.motivasi       || prev?.motivasi,
              greeted_at:     null,
            }))
          }
        }).catch(() => {})
      }
    })

    // Fetch weekly review via API (bukan langsung Supabase)
    fetch('/api/utils?action=weekly-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    })
    .then(r => r.json())
    .then(res => {
      if (res.success && res.review) {
        setWeeklyReview(res.review)
      }
    })
    .catch(() => setWeeklyReview(null))
  }, [user?.id])

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
                 || user?.user_metadata?.name?.split(' ')[0] || 'Kamu'

  if (dataLoading) return (
    <div style={{ minHeight: '100vh', background: '#0a0f0d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>Memuat...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f0d', paddingBottom: 90, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Content berdasarkan status plan */}
      {isPremium ? (
        <PremiumDashboard
          user={user} profile={profile} genome={genome} growth={growth}
          actions={actions} events={events} weeklyReview={weeklyReview}
        />
      ) : (
        <FreeDashboard
          user={user} profile={profile} genome={genome} growth={growth}
          weeklyReview={weeklyReview}
          onUpgrade={() => window.dispatchEvent(new CustomEvent('show-upgrade', { detail: { profile, genome, growth } }))}
        />
      )}

      <BottomNav isPremium={isPremium} />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');`}</style>
    </div>
  )
}
