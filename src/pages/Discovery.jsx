import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const OPENING = {
  role: 'bot',
  text: 'Halo! 👋\n\nSaya Diah Anna.\n\nSebelum kita mulai, aku pengen dengar dulu — apa yang bikin kamu akhirnya coba Verneks hari ini?',
  id: 'open'
}

const GENOME_MAP = [
  { key: 'analytical',    label: 'Self-Awareness',   emoji: '🧠', color: '#34B7F1', insight: 'Kamu cenderung bisa ngenalin pola pikir & emosimu sendiri kalau dikasih ruang buat mikir. Journaling atau meditasi reflektif bakal makin najemin ini.' },
  { key: 'leadership',    label: 'Resilience',       emoji: '🌱', color: '#F48FB1', insight: 'Kamu punya dorongan alami buat bangkit lagi meski lagi berat. Orang di sekitarmu mungkin sering nyari kekuatan itu darimu juga.' },
  { key: 'builder',       label: 'Coping Kreatif',   emoji: '⚙️', color: '#25D366', insight: 'Kamu lega kalau perasaan disalurkan lewat aktivitas nyata — olahraga, beberes, bikin sesuatu. Kamu paling ringan kalau bisa "ngelakuin sesuatu" soal apa yang dirasain.' },
  { key: 'creator',       label: 'Keterbukaan',      emoji: '🌤️', color: '#FFB74D', insight: 'Kamu punya kemampuan lihat masalah dari sudut pandang baru. Kamu berkembang lewat eksplorasi cara ekspresi — nulis, gambar, atau apapun yang bikin perasaan punya bentuk.' },
  { key: 'communication', label: 'Komunikasi Emosi', emoji: '💬', color: '#CE93D8', insight: 'Kamu pandai menyampaikan perasaan dengan kata-kata dan membangun hubungan yang jujur. Cerita ke orang yang kamu percaya adalah kekuatanmu.' },
  { key: 'risk_taking',   label: 'Empati',           emoji: '💗', color: '#EF9A9A', insight: 'Kamu peka sama perasaan diri sendiri maupun orang lain. Kepekaan ini besar — asal jangan lupa arahkan ke diri sendiri juga.' },
]

// Mapping fokus utama → aktivitas self-care yang cocok
const CAREER_RELATIVES = {
  'overthinking':      [['Journaling Malam', 88], ['Teknik Grounding', 82], ['Meditasi 10 Menit', 76]],
  'kesehatan mental':  [['Konseling/Terapi', 90], ['Rutinitas Tidur', 84], ['Olahraga Ringan', 78]],
  'hubungan':          [['Komunikasi Asertif', 89], ['Support Group', 83], ['Quality Time', 75]],
  'self-care':         [['Rutinitas Pagi', 87], ['Digital Detox', 81], ['Hobi Kreatif', 74]],
  'default':           [['Journaling', 87], ['Cerita ke Teman Dekat', 81], ['Me-Time Rutin', 74]],
}

function getOpportunities(targetPosisi) {
  if (!targetPosisi) return CAREER_RELATIVES.default
  const key = targetPosisi.toLowerCase()
  for (const [k, v] of Object.entries(CAREER_RELATIVES)) {
    if (k === 'default') continue
    if (key.includes(k) || k.split(' ').some(w => key.includes(w))) return v
  }
  return CAREER_RELATIVES.default
}

// ── Komponen Hasil Analisis (ditampilkan inline) ──────────────────────────────
function AnalysisResult({ result, onSave, saving }) {
  const [revealed, setRevealed] = useState(false)
  const [expandedGenome, setExpandedGenome] = useState(null)
  const [wowRevealed, setWowRevealed] = useState(false)
  const [readinessAnim, setReadinessAnim] = useState(0)

  useEffect(() => {
    setTimeout(() => setRevealed(true), 80)
    // Wow insight reveal dengan delay
    setTimeout(() => setWowRevealed(true), 600)
    // Readiness counter animation
    const target = result?.career_readiness || 0
    let current = 0
    const step = target / 40
    const timer = setInterval(() => {
      current = Math.min(current + step, target)
      setReadinessAnim(Math.round(current))
      if (current >= target) clearInterval(timer)
    }, 40)
    return () => clearInterval(timer)
  }, [])

  if (!result) return null

  const gs          = result.genome_scores || {}
  const p           = result.profile_preview || {}
  const growth      = result.growth_state || {}
  const gapAnalysis = result.gap_analysis || {}
  const gapSkills   = result.gap_skills || []
  const gpsSteps    = result.gps_steps || []
  const readiness   = result.career_readiness || 0
  const wowInsight  = result.wow_insight || null
  const etaMonths   = result.eta_months || null
  const opportunities = getOpportunities(p.target_posisi)

  const sortedGenome = [...GENOME_MAP]
    .map(g => ({ ...g, val: gs[g.key] || 0 }))
    .filter(g => g.val > 0)
    .sort((a, b) => b.val - a.val)

  const topGenome = sortedGenome[0]
  const firstName = p.nama?.split(' ')[0] || null

  const fade = (delay = 0) => ({
    opacity: revealed ? 1 : 0,
    transform: revealed ? 'translateY(0)' : 'translateY(18px)',
    transition: `opacity 0.55s ease ${delay}s, transform 0.55s ease ${delay}s`,
  })
  return (
    <div style={{ background: '#0a0f0d', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", paddingBottom: 200 }}>

      {/* ── Header ── */}
      <div style={{ background: 'rgba(37,211,102,0.07)', borderBottom: '1px solid rgba(37,211,102,0.15)', padding: '14px 18px', position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(10px)' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/diah-anna.png" alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
          <div>
            <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.82rem' }}>Diah Anna selesai menganalisis kamu</div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem' }}>Hasil Discovery · Verneks</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 18px 0', maxWidth: 480, margin: '0 auto' }}>

        {/* ── WOW INSIGHT — muncul pertama, sebelum angka ── */}
        {wowInsight && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(103,58,183,0.15), rgba(37,211,102,0.08))',
            border: '1px solid rgba(103,58,183,0.3)',
            borderRadius: 18, padding: '18px 16px', marginBottom: 16,
            opacity: wowRevealed ? 1 : 0,
            transform: wowRevealed ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
            transition: 'all 0.7s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: '1.1rem' }}>✨</span>
              <div style={{ color: '#CE93D8', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '1px' }}>INSIGHT DIAH ANNA</div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: '0.88rem', lineHeight: 1.7, fontStyle: 'italic' }}>
              "{wowInsight}"
            </div>
          </div>
        )}

        {/* ── Hero: Target + Readiness dengan counter animation ── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(37,211,102,0.1), rgba(52,183,241,0.06))',
          border: '1px solid rgba(37,211,102,0.2)',
          borderRadius: 18, padding: '20px', marginBottom: 14,
          ...fade(0.1)
        }}>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.62rem', letterSpacing: '1.5px', marginBottom: 6 }}>
            🎯 CAREER TARGET
          </div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.2rem', lineHeight: 1.2, marginBottom: 4 }}>
            {p.target_posisi || 'Karier Impianmu'}
          </div>
          {p.posisi_saat_ini && (
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', marginBottom: 14 }}>
              dari posisi {p.posisi_saat_ini}
            </div>
          )}

          {/* Readiness dengan counter */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>Kesiapan Diri</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ color: '#25D366', fontWeight: 900, fontSize: '2rem', lineHeight: 1 }}>{readinessAnim}</span>
              <span style={{ color: '#25D366', fontWeight: 700, fontSize: '1rem' }}>%</span>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
            <div style={{
              background: 'linear-gradient(90deg,#25D366,#34B7F1)',
              height: '100%', borderRadius: 99,
              width: revealed ? `${readiness}%` : '0%',
              transition: 'width 1.6s cubic-bezier(0.4,0,0.2,1) 0.2s',
            }} />
          </div>

          {/* ETA kalau ada */}
          {etaMonths && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.75rem' }}>⏱</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem' }}>
                Estimasi tercapai dalam <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{etaMonths} bulan</strong> dengan konsistensi
              </span>
            </div>
          )}
        </div>

        {/* ── Kekuatan Tersembunyi (kalau ada) ── */}
        {p.kekuatan_tersembunyi && (
          <div style={{
            background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.15)',
            borderRadius: 14, padding: '14px 16px', marginBottom: 14,
            ...fade(0.18)
          }}>
            <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.5px', marginBottom: 6 }}>
              💎 KEKUATAN TERSEMBUNYI
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', lineHeight: 1.6 }}>
              {p.kekuatan_tersembunyi}
            </div>
          </div>
        )}

        {/* ── Gap Analysis (bukan sekedar list) ── */}
        {(gapAnalysis.summary || gapSkills.length > 0) && (
          <div style={{
            background: 'rgba(255,183,77,0.06)', border: '1px solid rgba(255,183,77,0.18)',
            borderRadius: 16, padding: '16px', marginBottom: 14,
            ...fade(0.24)
          }}>
            <div style={{ color: '#FFB74D', fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>
              🎯 Yang Memisahkan Kamu dari Target
            </div>

            {/* Root cause kalau ada */}
            {gapAnalysis.root_cause && (
              <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(255,183,77,0.08)', borderRadius: 10, borderLeft: '3px solid rgba(255,183,77,0.4)' }}>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem', lineHeight: 1.6 }}>
                  {gapAnalysis.root_cause}
                </div>
              </div>
            )}

            {/* Gap skills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: gapAnalysis.breakthrough_key ? 10 : 0 }}>
              {gapSkills.slice(0, 4).map((skill, i) => (
                <div key={i} style={{
                  padding: '4px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600,
                  background: i === 0 ? 'rgba(239,83,80,0.15)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${i === 0 ? 'rgba(239,83,80,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  color: i === 0 ? '#EF9A9A' : 'rgba(255,255,255,0.6)',
                }}>
                  {skill}
                </div>
              ))}
            </div>

            {/* Breakthrough key */}
            {gapAnalysis.breakthrough_key && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>🔑</span>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', lineHeight: 1.6 }}>
                  <strong style={{ color: 'rgba(255,255,255,0.85)' }}>Kunci breakthrough: </strong>
                  {gapAnalysis.breakthrough_key}
                </div>
              </div>
            )}

            {/* Gap summary fallback */}
            {!gapAnalysis.root_cause && gapAnalysis.summary && (
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', lineHeight: 1.6, marginTop: 8 }}>
                {gapAnalysis.summary}
              </div>
            )}
          </div>
        )}

        {/* ── Career Genome ── */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, padding: '16px', marginBottom: 14,
          ...fade(0.30)
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>🧠 Trait Diri Kamu</div>
            {topGenome && (
              <div style={{ background: `${topGenome.color}22`, border: `1px solid ${topGenome.color}44`, borderRadius: 99, padding: '3px 10px' }}>
                <span style={{ color: topGenome.color, fontSize: '0.7rem', fontWeight: 700 }}>
                  {topGenome.emoji} {topGenome.label} dominant
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedGenome.map((g, i) => (
              <div key={g.key}>
                <div onClick={() => setExpandedGenome(expandedGenome === g.key ? null : g.key)} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ color: i === 0 ? '#fff' : 'rgba(255,255,255,0.7)', fontSize: '0.82rem', fontWeight: i === 0 ? 700 : 500 }}>
                      {g.emoji} {g.label}
                    </span>
                    <span style={{ color: g.color, fontWeight: 800, fontSize: '0.88rem' }}>{g.val}</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 99, height: i === 0 ? 7 : 5, overflow: 'hidden' }}>
                    <div style={{
                      background: i === 0 ? `linear-gradient(90deg, ${g.color}, ${g.color}bb)` : g.color,
                      height: '100%', borderRadius: 99,
                      width: revealed ? `${g.val}%` : '0%',
                      transition: `width 1s ease ${0.4 + i * 0.08}s`,
                    }} />
                  </div>
                </div>
                {expandedGenome === g.key && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: `${g.color}11`, border: `1px solid ${g.color}22`, borderRadius: 10, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                    {GENOME_MAP.find(m => m.key === g.key)?.insight || '—'}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.2)', fontSize: '0.68rem' }}>Tap untuk lihat insight per dimensi</div>
        </div>

        {/* ── GPS Preview ── */}
        {gpsSteps.length > 0 && (
          <div style={{
            background: 'rgba(37,211,102,0.04)', border: '1px solid rgba(37,211,102,0.15)',
            borderRadius: 16, padding: '16px', marginBottom: 14,
            ...fade(0.38)
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.85rem' }}>🗺️ Langkah Self-Care Preview</div>
              <div style={{ background: 'rgba(37,211,102,0.15)', color: '#25D366', fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                {gpsSteps.length} LANGKAH
              </div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', marginBottom: 12 }}>
              Langkah personal seputar {p.target_posisi || 'fokus utamamu'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {gpsSteps.map((step, i) => {
                const isVisible = i < 3
                const isDone = step.done
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 12px', borderRadius: 10,
                    background: isDone ? 'rgba(37,211,102,0.1)' : isVisible ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                    border: isDone ? '1px solid rgba(37,211,102,0.25)' : isVisible ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(255,255,255,0.03)',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: isDone ? '#25D366' : isVisible ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', fontWeight: 700,
                      color: isDone ? '#fff' : isVisible ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)',
                      marginTop: 1,
                    }}>
                      {isDone ? '✓' : isVisible ? i + 1 : '🔒'}
                    </div>
                    <div style={{ flex: 1, filter: !isVisible ? 'blur(4px)' : 'none', userSelect: !isVisible ? 'none' : 'auto' }}>
                      <div style={{
                        fontSize: '0.83rem', fontWeight: isDone ? 600 : 500,
                        color: isDone ? '#25D366' : isVisible ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.12)',
                        marginBottom: step.description && isVisible ? 3 : 0,
                      }}>
                        {step.title}
                      </div>
                      {step.description && isVisible && (
                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>
                          {step.description}
                        </div>
                      )}
                    </div>
                    {!isVisible && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,15,13,0.6)', backdropFilter: 'blur(1px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}>🔒 Tersimpan setelah login</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Pesan Diah Anna — diperbesar dan lebih personal ── */}
        {result.mentor_message && (
          <div style={{
            background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)',
            borderRadius: 18, padding: '18px', marginBottom: 14,
            ...fade(0.46)
          }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <img src="/diah-anna.png" alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              <div>
                <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.85rem' }}>Diah Anna</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>Teman Curhat AI · Verneks</div>
              </div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.88rem', lineHeight: 1.75, paddingLeft: 4 }}>
              {firstName && (
                <span style={{ color: '#fff', fontWeight: 700 }}>{firstName}, </span>
              )}
              {firstName ? result.mentor_message.replace(new RegExp(`^${firstName}[,.]?\\s*`, 'i'), '') : result.mentor_message}
            </div>
          </div>
        )}

      </div>

      {/* ── CTA Fixed Bottom ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480,
        padding: '16px 18px 32px',
        background: 'linear-gradient(to top, #0a0f0d 70%, transparent)',
      }}>
        <div style={{ marginBottom: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['🗺️ Langkah Self-Care Lengkap', '🎯 Panduan Personal', '📊 Progress Tracking', '💬 Chat Unlimited'].map(f => (
              <span key={f} style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ color: '#25D366', fontSize: '0.6rem' }}>🔒</span> {f}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            width: '100%', padding: '15px', borderRadius: 14, border: 'none',
            background: saving ? '#aaa' : 'linear-gradient(135deg, #25D366, #128C7E)',
            color: '#fff', fontWeight: 800, fontSize: '1rem',
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 20px rgba(37,211,102,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}
        >
          {saving
            ? <><span>⏳</span> Menyimpan...</>
            : <><GoogleIcon /> Simpan dengan Google — Gratis</>
          }
        </button>
        <div style={{ textAlign: 'center', marginTop: 8, color: 'rgba(255,255,255,0.2)', fontSize: '0.68rem' }}>
          Gratis · Tidak perlu kartu kredit · Data kamu aman
        </div>
      </div>
    </div>
  )
}


// Google Icon kecil
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#fff" fillOpacity="0.9" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#fff" fillOpacity="0.7" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#fff" fillOpacity="0.8" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#fff" fillOpacity="0.9" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
}

// ── Main Discovery Component ──────────────────────────────────────────────────
export default function Discovery() {
  const navigate = useNavigate()
  const [messages, setMessages]     = useState([OPENING])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [showResultBtn, setShowResultBtn] = useState(false)
  const [computing, setComputing]   = useState(false)

  // Fase: 'chat' | 'result'
  const [phase, setPhase]           = useState('chat')
  const [result, setResult]         = useState(null)
  const [saving, setSaving]         = useState(false)

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Kalau sudah login DAN sudah punya data Discovery → ke /chat
  // Kalau sudah login tapi belum punya data → tetap di /discovery
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: cp } = await supabase
          .from('user_career_profiles')
          .select('career_readiness, target_posisi')
          .eq('user_id', session.user.id)
          .maybeSingle()
        // Sudah punya data LENGKAP → ke /chat
        // Belum ada data / data setengah jadi (career_readiness ada tapi
        // target_posisi kosong — bisa kejadian kalau onboarding lama sempat
        // gagal di tengah jalan) → tetap di /discovery, biar bisa dituntaskan
        // Tapi kalau premium dan tidak sengaja masuk sini → langsung balik
        if (cp?.career_readiness != null && cp?.target_posisi) {
          // Sudah punya data Discovery lengkap → ke /chat
          navigate('/chat')
        }
        // Belum lengkap → tetap di /discovery
      }
    })
  }, [])

  // Restore chat dari localStorage
  // FIX: sebelumnya restore APAPUN yang ada di localStorage tanpa cek basi
  // atau nggak — kalau ada sisa sesi Discovery lama (misal dari bulan lalu,
  // sempat ditinggal belum selesai) di browser user, itu dibangkitkan lagi
  // dan DILANJUTKAN dengan system prompt yang SEKARANG (yang sudah beda,
  // sekarang nanya soal situasi income di awal) — bikin alur kerasa
  // "acak-acakan" karena AI tiba-tiba nanya hal yang nggak nyambung sama
  // histori lama yang lagi ditampilin. Sekarang: data lebih dari 24 jam
  // dianggap basi/ditinggal, dihapus, mulai bersih dari nol.
  useEffect(() => {
    const savedAt = localStorage.getItem('lc_discovery_saved_at')
    const isStale = savedAt && (Date.now() - Number(savedAt)) > 24 * 60 * 60 * 1000

    if (isStale) {
      localStorage.removeItem('lc_discovery_messages')
      localStorage.removeItem('lc_discovery_result')
      localStorage.removeItem('lc_discovery_saved_at')
      return
    }

    const savedMsgs = localStorage.getItem('lc_discovery_messages')
    const savedResult = localStorage.getItem('lc_discovery_result')
    if (savedResult) {
      try {
        const parsed = JSON.parse(savedResult)
        setResult(parsed)
        setPhase('result')
        return
      } catch {}
    }
    if (savedMsgs) {
      try {
        const parsed = JSON.parse(savedMsgs)
        if (parsed?.length > 1) {
          setMessages(parsed)
          const userCount = parsed.filter(m => m.role === 'user').length
          if (userCount >= 6) setShowResultBtn(true)
        }
      } catch {}
    }
  }, [])

  useEffect(() => {
    if (phase === 'chat') bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, phase])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const newMessages = [...messages, { role: 'user', text, id: Date.now() }]
    setMessages(newMessages)
    try { localStorage.setItem('lc_discovery_messages', JSON.stringify(newMessages)); localStorage.setItem('lc_discovery_saved_at', String(Date.now())) } catch {}
    setLoading(true)

    try {
      const res = await fetch('/api/discovery-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const data = await res.json()
      if (!res.ok || !data.reply) throw new Error(data.error || 'Reply kosong')
      const withReply = [...newMessages, { role: 'bot', text: data.reply, id: Date.now() + 1 }]
      setMessages(withReply)
      try { localStorage.setItem('lc_discovery_messages', JSON.stringify(withReply)); localStorage.setItem('lc_discovery_saved_at', String(Date.now())) } catch {}
      if (data.showResultButton) setShowResultBtn(true)
    } catch (err) {
      // Sebelumnya error di sini tidak pernah di-log — jadi kalau
      // /api/discovery-coach gagal, kita tidak pernah tahu kenapa. Buka
      // DevTools > Console kalau ini muncul lagi buat lihat detail aslinya.
      console.error('[Discovery] /api/discovery-coach gagal:', err.message, err)
      setMessages(prev => [...prev, {
        role: 'bot',
        text: 'Waduh, ada gangguan koneksi. 🙏\n\nSilakan ketik ulang pesanmu atau refresh halaman.',
        id: Date.now()
      }])
    }
    setLoading(false)
  }

  // Klik "Lihat Career DNA" → compute genome → tampilkan hasil inline
  const handleComputeResult = async () => {
    setComputing(true)
    const msgs = JSON.parse(localStorage.getItem('lc_discovery_messages') || '[]')
    try {
      const res = await fetch('/api/compute-genome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs })
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('lc_discovery_result', JSON.stringify(data.result)); localStorage.setItem('lc_discovery_saved_at', String(Date.now()))
        setResult(data.result)
        setPhase('result')  // ← tampilkan hasil, BUKAN redirect
      } else {
        alert('Gagal menganalisis. Coba lagi!')
      }
    } catch {
      alert('Koneksi bermasalah. Coba lagi!')
    }
    setComputing(false)
  }

  // Klik "Simpan Hasil Saya" → Google OAuth → setelah login App.jsx handle sync
  const handleSave = async () => {
    setSaving(true)
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/discovery` }
      })
      // Setelah redirect balik, App.jsx akan sync discovery_result ke Supabase
    } catch {
      alert('Gagal login. Coba lagi!')
      setSaving(false)
    }
  }

  // ── Fase hasil: tampilkan AnalysisResult ──
  if (phase === 'result') {
    return <AnalysisResult result={result} onSave={handleSave} saving={saving} />
  }

  // ── Fase chat: Discovery conversation ──
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      width: '100%', maxWidth: 480, margin: '0 auto',
      display: 'flex', flexDirection: 'column',
      background: 'var(--wa-chat-bg)', overflow: 'hidden',
    }}>

      {/* Header */}
      <div className="wa-header" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexShrink: 0 }}>
        <img src="/diah-anna.png" alt="Diah Anna"
          style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 5 }}>
            Diah Anna
            <img src="/icons/verified.png" width="16" height="16" alt="verified" style={{ flexShrink: 0 }} />
          </div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.72rem' }}>Teman Curhat AI</div>
        </div>
        <button onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '1.2rem', cursor: 'pointer', padding: '4px 8px' }}>
          ✕
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        {messages.map((m, i) => (
          <div key={m.id || i} style={{
            display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 6,
          }}>
            {m.role === 'bot' && (
              <img src="/diah-anna.png" alt=""
                style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', marginRight: 6, alignSelf: 'flex-end', flexShrink: 0 }} />
            )}
            <div style={{
              maxWidth: '80%',
              background: m.role === 'user' ? '#d9fdd3' : '#fff',
              borderRadius: m.role === 'user' ? '12px 3px 12px 12px' : '3px 12px 12px 12px',
              padding: '8px 11px', fontSize: '0.88rem', lineHeight: 1.55,
              color: '#111', whiteSpace: 'pre-line',
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
            }}
              dangerouslySetInnerHTML={{ __html: (m.text || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }}
            />
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 6 }}>
            <img src="/diah-anna.png" alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <div style={{ background: '#fff', borderRadius: '3px 12px 12px 12px', padding: '10px 14px', display: 'flex', gap: 4 }}>
              {[0, 1, 2].map(d => (
                <div key={d} style={{ width: 7, height: 7, borderRadius: '50%', background: '#25D366', animation: `dot-bounce 1s ease ${d * 0.18}s infinite` }} />
              ))}
            </div>
          </div>
        )}

        {/* Tombol "Lihat Hasil" muncul setelah cukup data */}
        {showResultBtn && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '16px 0 8px' }}>
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '3px 12px 12px 12px', padding: '10px 14px', fontSize: '0.85rem', color: '#333', marginBottom: 10, maxWidth: '85%', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
              <img src="/diah-anna.png" alt="" style={{ width: 18, height: 18, borderRadius: '50%', verticalAlign: 'middle', marginRight: 5 }} />
              Oke! Aku sudah punya gambaran yang cukup. Klik di bawah untuk lihat hasil analisisnya 🎯
            </div>
            <button
              onClick={handleComputeResult}
              disabled={computing}
              style={{
                background: computing ? '#aaa' : 'linear-gradient(135deg, #25D366, #128C7E)',
                color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                padding: '13px 28px', borderRadius: 12, border: 'none',
                cursor: computing ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 16px rgba(37,211,102,0.35)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {computing
                ? <><span style={{ animation: 'dot-bounce 1s infinite' }}>⏳</span> Menganalisis...</>
                : <>🧬 Lihat Hasil Analisis Saya</>
              }
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        background: '#f0f2f5', padding: '8px 10px',
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
        display: 'flex', gap: 8, alignItems: 'center',
        flexShrink: 0, borderTop: '1px solid #e0e0e0',
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Ketik jawabanmu..."
          disabled={loading}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 22,
            border: '1px solid #e0e0e0', fontSize: '0.9rem',
            outline: 'none', background: '#fff',
          }}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()} className="wa-send-btn">
          ➤
        </button>
      </div>

      <style>{`
        @keyframes dot-bounce {
          0%,80%,100%{transform:scale(0.8);opacity:.5}
          40%{transform:scale(1.2);opacity:1}
        }
      `}</style>
    </div>
  )
}
