import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// Estimasi timeline berdasarkan progress & career stage
function getTimeline(stage, progress) {
  const base = {
    'Baru Mulai Sadar':      12,
    'Belajar Mengelola':     9,
    'Lebih Tenang':          6,
    'Cukup Stabil':          4,
    'Sudah Jadi Kebiasaan':  2,
  }
  const months = base[stage] || 10
  const remaining = Math.max(1, Math.round(months * (1 - (progress || 0) / 100)))
  return remaining === 1 ? '~1 Bulan Lagi' : `~${remaining} Bulan Lagi`
}

// Bagi gps_steps (max 6 item) ke dalam 3 fase, tambah Fase 4 implied
function buildPhases(steps = [], targetPosisi = '') {
  // Pastikan selalu ada minimal 6 slot
  const padded = [...steps]
  while (padded.length < 6) padded.push({ title: '—', done: false })

  const phases = [
    {
      id: 1, label: 'Phase 1', name: 'Fondasi',
      emoji: '🌱', color: '#34B7F1',
      steps: padded.slice(0, 2),
    },
    {
      id: 2, label: 'Phase 2', name: 'Pengembangan',
      emoji: '📚', color: '#FFB74D',
      steps: padded.slice(2, 4),
    },
    {
      id: 3, label: 'Phase 3', name: 'Eksekusi',
      emoji: '🚀', color: '#25D366',
      steps: padded.slice(4, 6),
    },
    {
      id: 4, label: 'Phase 4', name: 'Konsistensi',
      emoji: '🏆', color: '#F48FB1',
      steps: [
        { title: 'Jadi Kebiasaan', done: false, locked: true },
        { title: targetPosisi ? `Lebih Tenang Soal: ${targetPosisi}` : 'Lebih Tenang', done: false, locked: true },
      ],
    },
  ]
  return phases
}

// Cari indeks step aktif (pertama yang belum done)
function findCurrentStepIdx(phases) {
  let globalIdx = 0
  for (const phase of phases) {
    for (const step of phase.steps) {
      if (!step.done) return globalIdx
      globalIdx++
    }
  }
  return -1 // semua done
}

// Total steps
function totalSteps(phases) {
  return phases.reduce((sum, p) => sum + p.steps.length, 0)
}

// Done steps
function doneSteps(phases) {
  return phases.reduce((sum, p) => sum + p.steps.filter(s => s.done).length, 0)
}

// ─── STEP ROW ─────────────────────────────────────────────────────────────────
function StepRow({ step, globalIdx, currentIdx, isPremium, onExpand, expanded, onChat, onToggle, toggling }) {
  const isDone    = step.done
  const isCurrent = globalIdx === currentIdx
  const isLocked  = step.locked || (!isDone && !isCurrent && globalIdx > currentIdx && !isPremium)
  const isBlurred = isLocked && globalIdx >= 6 // Phase 4 always blurred

  const iconColor = isDone ? '#25D366' : isCurrent ? '#34B7F1' : 'rgba(255,255,255,0.18)'
  const textColor = isDone ? '#25D366' : isCurrent ? '#fff' : isBlurred ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.35)'
  const icon      = isDone ? '✅' : isCurrent ? '📍' : isLocked ? '🔒' : '○'

  return (
    <div>
      <div
        onClick={() => !isBlurred && onExpand(globalIdx)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '11px 14px',
          background: isCurrent ? 'rgba(52,183,241,0.08)' : isDone ? 'rgba(37,211,102,0.05)' : 'transparent',
          border: `1px solid ${isCurrent ? 'rgba(52,183,241,0.2)' : 'rgba(255,255,255,0.04)'}`,
          borderRadius: 12, marginBottom: 6,
          cursor: isBlurred ? 'default' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{icon}</span>
        <span style={{
          flex: 1, fontSize: '0.84rem', fontWeight: isCurrent ? 700 : isDone ? 500 : 400,
          color: textColor,
          filter: isBlurred ? 'blur(5px)' : 'none',
          userSelect: isBlurred ? 'none' : 'auto',
        }}>
          {step.title}
        </span>
        {isCurrent && (
          <span style={{ background: 'rgba(52,183,241,0.15)', color: '#34B7F1', fontSize: '0.6rem', padding: '2px 8px', borderRadius: 99, fontWeight: 700, flexShrink: 0 }}>
            SEKARANG
          </span>
        )}
        {!isBlurred && !isDone && !isCurrent && (
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem' }}>›</span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded === globalIdx && !isBlurred && (
        <div style={{
          margin: '-2px 0 8px 38px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '0 0 12px 12px',
          padding: '12px 14px',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', lineHeight: 1.65, marginBottom: 10 }}>
            {isDone
              ? `✓ Kamu sudah menyelesaikan langkah ini. Bagus!`
              : isCurrent
              ? `Ini langkah aktif kamu sekarang. Fokus di sini dulu sebelum lanjut.`
              : `Langkah ini menunggu setelah kamu menyelesaikan langkah sebelumnya.`
            }
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!step.locked && (
              <button
                onClick={() => onToggle(globalIdx, isDone)}
                disabled={toggling === globalIdx}
                style={{
                  padding: '8px 14px',
                  background: isDone ? 'rgba(255,255,255,0.05)' : 'rgba(37,211,102,0.12)',
                  border: `1px solid ${isDone ? 'rgba(255,255,255,0.12)' : 'rgba(37,211,102,0.3)'}`,
                  color: isDone ? 'rgba(255,255,255,0.45)' : '#25D366',
                  fontWeight: 600, fontSize: '0.78rem',
                  borderRadius: 9, cursor: toggling === globalIdx ? 'wait' : 'pointer',
                  opacity: toggling === globalIdx ? 0.5 : 1,
                }}
              >
                {toggling === globalIdx ? '...' : isDone ? '↺ Batalkan selesai' : '✓ Tandai Selesai'}
              </button>
            )}
            <button
              onClick={onChat}
              style={{
                padding: '8px 14px',
                background: 'rgba(52,183,241,0.1)',
                border: '1px solid rgba(52,183,241,0.25)',
                color: '#34B7F1', fontWeight: 600, fontSize: '0.78rem',
                borderRadius: 9, cursor: 'pointer',
              }}
            >
              💬 Tanya Diah Anna →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PHASE BLOCK ──────────────────────────────────────────────────────────────
function PhaseBlock({ phase, globalStartIdx, currentIdx, isPremium, expanded, onExpand, onChat, onToggle, toggling, visible, delay }) {
  const allDone   = phase.steps.every(s => s.done)
  const hasActive = phase.steps.some((_, i) => globalStartIdx + i === currentIdx)
  const isLocked  = phase.id === 4 && !isPremium

  const phaseColor = allDone ? '#25D366' : hasActive ? phase.color : 'rgba(255,255,255,0.15)'

  return (
    <div style={{
      marginBottom: 14,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(14px)',
      transition: `opacity 0.45s ease ${delay}s, transform 0.45s ease ${delay}s`,
    }}>
      {/* Phase Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingLeft: 2 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: allDone ? 'rgba(37,211,102,0.15)' : hasActive ? `${phase.color}22` : 'rgba(255,255,255,0.05)',
          border: `1.5px solid ${phaseColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.8rem', flexShrink: 0,
        }}>
          {allDone ? '✓' : phase.emoji}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: phaseColor, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.5px' }}>
              {phase.label.toUpperCase()}
            </span>
            {isLocked && (
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem' }}>🔒 Premium</span>
            )}
          </div>
          <div style={{ color: allDone ? '#25D366' : hasActive ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: hasActive ? 700 : 400, fontSize: '0.83rem' }}>
            {phase.name}
          </div>
        </div>
        {allDone && (
          <span style={{ marginLeft: 'auto', background: 'rgba(37,211,102,0.1)', color: '#25D366', fontSize: '0.62rem', padding: '2px 9px', borderRadius: 99, fontWeight: 700 }}>
            SELESAI ✓
          </span>
        )}
      </div>

      {/* Steps */}
      <div style={{ paddingLeft: 8 }}>
        {phase.steps.map((step, i) => (
          <StepRow
            key={i}
            step={step}
            globalIdx={globalStartIdx + i}
            currentIdx={currentIdx}
            isPremium={isPremium}
            expanded={expanded}
            onExpand={onExpand}
            onChat={onChat}
            onToggle={onToggle}
            toggling={toggling}
          />
        ))}
      </div>

      {/* Phase 4 upgrade nudge */}
      {isLocked && (
        <div
          onClick={() => window.dispatchEvent(new CustomEvent('show-upgrade'))}
          style={{
            margin: '8px 0 0 8px',
            padding: '10px 14px',
            background: 'rgba(37,211,102,0.06)',
            border: '1px dashed rgba(37,211,102,0.25)',
            borderRadius: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ fontSize: '0.85rem' }}>🔓</span>
          <span style={{ color: '#25D366', fontSize: '0.8rem', fontWeight: 600 }}>
            Buka Phase 4 dengan Premium
          </span>
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
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

export default function Journey({ user, loading = false, subscription = DEFAULT_SUBSCRIPTION }) {
  const navigate = useNavigate()

  const [profile,   setProfile]   = useState(null)
  const [growth,    setGrowth]    = useState(null)
  const [actions,   setActions]   = useState([])
  const [events,    setEvents]    = useState([])
  // isPremium sekarang DIDERIVE dari subscription yang di-lift ke App.jsx —
  // bukan fetch sendiri lagi. null = masih loading, sama seperti sebelumnya.
  const isPremium = subscription.loading ? null : subscription.plan === 'premium'
  const [dataLoading, setDataLoading] = useState(true)
  const [visible,   setVisible]   = useState(false)
  const [expanded,  setExpanded]  = useState(null) // globalIdx of expanded step

  useEffect(() => {
    if (loading) return
    if (!user) { navigate('/'); return }

    Promise.all([
      supabase.from('user_career_profiles')
        .select('target_posisi,posisi_saat_ini,career_readiness,skill_gaps,gps_steps,mentor_message')
        .eq('user_id', user.id).maybeSingle(),
      supabase.from('user_growth_state')
        .select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_next_actions')
        .select('*').eq('user_id', user.id)
        .eq('is_done', false)
        .order('created_at', { ascending: false }).limit(4),
      supabase.from('career_events')
        .select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(5),
    ]).then(([{ data: p }, { data: g }, { data: a }, { data: e }]) => {
      setProfile(p)
      setGrowth(g)
      setActions(a || [])
      setEvents(e || [])
      setDataLoading(false)
      setTimeout(() => setVisible(true), 80)
    })
  }, [user?.id])

  const handleToggleAction = async (id, isDone) => {
    await supabase.from('user_next_actions').update({ is_done: !isDone }).eq('id', id)
    setActions(prev => prev.map(a => a.id === id ? { ...a, is_done: !isDone } : a))
  }

  const [togglingStep, setTogglingStep] = useState(null)
  const handleToggleMilestone = async (globalIdx, currentlyDone) => {
    if (!user?.id) return
    setTogglingStep(globalIdx)
    try {
      const res = await fetch('/api/career-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-milestone', userId: user.id, stepIndex: globalIdx, done: !currentlyDone }),
      })
      const data = await res.json()
      if (data.success) {
        setProfile(prev => ({ ...prev, gps_steps: data.steps }))
      }
    } catch (e) {
      console.warn('[milestone] toggle gagal:', e)
    }
    setTogglingStep(null)
  }

  const handleChatAboutStep = (stepTitle) => {
    localStorage.setItem('lc_chat_topic', `Jelaskan langkah "${stepTitle}" di langkah self-care saya dan apa yang bisa aku coba sekarang.`)
    navigate('/chat')
  }

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (dataLoading || isPremium === null) return (
    <div style={{ minHeight: '100vh', background: '#0a0f0d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>🗺️</div>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>Memuat Journey Diri Kamu...</div>
      </div>
    </div>
  )

  if (isPremium === false) return (
    <div style={{ minHeight: '100vh', background: '#0a0f0d', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px', textAlign: 'center', paddingBottom: 90, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ fontSize: '3rem', marginBottom: 16 }}>🗺️</div>
      <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', marginBottom: 10 }}>Journey Diri Kamu</div>
      <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.85rem', lineHeight: 1.75, marginBottom: 28 }}>
        Lacak perjalanan self-care kamu hari demi hari.<br />
        Fitur ini tersedia untuk pengguna Premium.
      </div>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('show-upgrade'))}
        style={{ padding: '14px 32px', background: 'linear-gradient(135deg,#25D366,#128C7E)', color: '#fff', fontWeight: 700, borderRadius: 13, border: 'none', cursor: 'pointer', fontSize: '0.9rem', boxShadow: '0 4px 18px rgba(37,211,102,0.3)' }}
      >
        🚀 Upgrade Premium
      </button>
      <BottomNav isPremium={false} />
    </div>
  )

  // ── Data preparation ────────────────────────────────────────────────────────
  const targetPosisi = profile?.target_posisi || null
  const readiness    = growth?.progress_percent || profile?.career_readiness || 0
  const stage        = growth?.career_stage || null
  const currentFocus = growth?.current_focus || null
  const gpsSteps     = profile?.gps_steps || growth?.gps_steps || []
  const hasData      = gpsSteps.length > 0 || stage

  const phases       = buildPhases(gpsSteps, targetPosisi)
  const currentIdx   = findCurrentStepIdx(phases)
  const total        = totalSteps(phases)
  const done         = doneSteps(phases)
  const timeline     = stage ? getTimeline(stage, readiness) : null

  // Global step index per phase
  const phaseStartIdxs = phases.reduce((acc, phase, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + phases[i - 1].steps.length)
    return acc
  }, [])

  // ── No data ─────────────────────────────────────────────────────────────────
  if (!hasData) return (
    <div style={{ minHeight: '100vh', background: '#0a0f0d', paddingBottom: 90, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ background: 'rgba(255,255,255,0.025)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '14px 18px' }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>🗺️ Journey Diri Kamu</div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', marginTop: 2 }}>Peta perjalanan self-care kamu</div>
      </div>
      <div style={{ textAlign: 'center', padding: '52px 24px' }}>
        <div style={{ fontSize: '3rem', marginBottom: 14 }}>🗺️</div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>Journey belum terbentuk</div>
        <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.83rem', lineHeight: 1.7, marginBottom: 24 }}>
          Cerita dulu ke Diah Anna, biar dia bisa memetakan langkah self-care personal kamu.
        </div>
        <button onClick={() => navigate('/discovery')} style={{ padding: '12px 28px', background: 'linear-gradient(135deg,#25D366,#128C7E)', color: '#fff', fontWeight: 700, borderRadius: 12, border: 'none', cursor: 'pointer' }}>
          🚀 Mulai Cerita ke Diah Anna
        </button>
      </div>
      <BottomNav isPremium={isPremium} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f0d', paddingBottom: 90, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');`}</style>

      {/* ── Header ── */}
      <div style={{ background: 'rgba(255,255,255,0.025)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '14px 18px' }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>🗺️ Journey Diri Kamu</div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', marginTop: 2 }}>Peta perjalanan self-care kamu</div>
      </div>

      <div style={{ padding: '16px 16px 0', maxWidth: 480, margin: '0 auto' }}>

        {/* ── HERO: Target + Progress ─────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg,#0a2218,#0f3324)',
          border: '1px solid rgba(37,211,102,0.25)',
          borderRadius: 18, padding: '20px 18px', marginBottom: 12,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.4s ease 0.05s',
        }}>
          {/* Target + Timeline */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.63rem', letterSpacing: '0.8px', marginBottom: 5 }}>🎯 FOKUS UTAMA</div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem' }}>{targetPosisi || '—'}</div>
              {stage && (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', marginTop: 3 }}>{stage}</div>
              )}
            </div>
            {timeline && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#25D366', fontWeight: 900, fontSize: '1rem' }}>{timeline}</div>
                <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.62rem' }}>estimasi</div>
              </div>
            )}
          </div>

          {/* Readiness bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>Kesiapan Diri</span>
              <span style={{ color: '#25D366', fontWeight: 700 }}>{readiness}%</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(90deg,#25D366,#34B7F1)', width: `${readiness}%`, height: '100%', borderRadius: 99, transition: 'width 1.2s ease' }} />
            </div>
          </div>

          {/* Step counter + current focus */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem' }}>
              {done} dari {total} langkah selesai
            </div>
            {currentFocus && (
              <div style={{ background: 'rgba(52,183,241,0.1)', border: '1px solid rgba(52,183,241,0.2)', borderRadius: 8, padding: '4px 10px', fontSize: '0.68rem', color: '#34B7F1', fontWeight: 600 }}>
                📍 {currentFocus}
              </div>
            )}
          </div>
        </div>

        {/* ── PHASES ─────────────────────────────────────────────────────────── */}
        <div style={{
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 18, padding: '18px', marginBottom: 12,
          opacity: visible ? 1 : 0,
          transform: visible ? 'none' : 'translateY(14px)',
          transition: 'opacity 0.45s ease 0.1s, transform 0.45s ease 0.1s',
        }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem', marginBottom: 16 }}>🗺️ Langkah Self-Care</div>

          {phases.map((phase, pi) => (
            <PhaseBlock
              key={phase.id}
              phase={phase}
              globalStartIdx={phaseStartIdxs[pi]}
              currentIdx={currentIdx}
              isPremium={isPremium}
              expanded={expanded}
              onExpand={(idx) => setExpanded(prev => prev === idx ? null : idx)}
              onChat={() => handleChatAboutStep(
                phases[pi].steps.find((_, si) => phaseStartIdxs[pi] + si === expanded)?.title || ''
              )}
              onToggle={handleToggleMilestone}
              toggling={togglingStep}
              visible={visible}
              delay={0.1 + pi * 0.05}
            />
          ))}
        </div>

        {/* ── ACTION ITEMS ────────────────────────────────────────────────────── */}
        {actions.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 18, padding: '18px', marginBottom: 12,
            opacity: visible ? 1 : 0,
            transform: visible ? 'none' : 'translateY(14px)',
            transition: 'opacity 0.45s ease 0.25s, transform 0.45s ease 0.25s',
          }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem', marginBottom: 14 }}>
              ✅ Aksi yang Disarankan Diah Anna
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {actions.map(action => (
                <div
                  key={action.id}
                  onClick={() => handleToggleAction(action.id, action.is_done)}
                  style={{
                    display: 'flex', gap: 11, alignItems: 'flex-start',
                    padding: '11px 13px', borderRadius: 12, cursor: 'pointer',
                    background: action.is_done ? 'rgba(37,211,102,0.06)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${action.is_done ? 'rgba(37,211,102,0.15)' : 'rgba(255,255,255,0.06)'}`,
                    opacity: action.is_done ? 0.6 : 1,
                  }}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                    background: action.is_done ? '#25D366' : 'transparent',
                    border: `2px solid ${action.is_done ? '#25D366' : 'rgba(255,255,255,0.2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '0.6rem', transition: 'all 0.2s',
                  }}>
                    {action.is_done && '✓'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      color: 'rgba(255,255,255,0.82)', fontWeight: 500, fontSize: '0.83rem',
                      textDecoration: action.is_done ? 'line-through' : 'none',
                      marginBottom: action.description ? 3 : 0,
                    }}>
                      {action.title}
                    </div>
                    {action.description && (
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', lineHeight: 1.5 }}>
                        {action.description}
                      </div>
                    )}
                    {action.estimated_days && !action.is_done && (
                      <div style={{ color: '#25D366', fontSize: '0.68rem', marginTop: 4 }}>
                        ⏱ ~{action.estimated_days} hari
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ACTIVITY LOG ────────────────────────────────────────────────────── */}
        {events.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 18, padding: '18px', marginBottom: 12,
            opacity: visible ? 1 : 0,
            transform: visible ? 'none' : 'translateY(14px)',
            transition: 'opacity 0.45s ease 0.3s, transform 0.45s ease 0.3s',
          }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem', marginBottom: 14 }}>
              📅 Aktivitas Terakhir
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.map((ev, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#25D366', fontSize: '0.78rem', flexShrink: 0 }}>✓</span>
                  <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', flex: 1 }}>
                    {ev.title || ev.description || 'Aktivitas self-care'}
                  </span>
                  {ev.points && (
                    <span style={{ color: '#25D366', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                      +{ev.points}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DIAH ANNA CTA ─────────────────────────────────────────────────── */}
        <button
          onClick={() => navigate('/chat')}
          style={{
            width: '100%', marginBottom: 12,
            padding: '14px',
            background: 'linear-gradient(135deg,#25D366,#128C7E)',
            color: '#fff', fontWeight: 700, fontSize: '0.9rem',
            borderRadius: 14, border: 'none', cursor: 'pointer',
            boxShadow: '0 3px 16px rgba(37,211,102,0.3)',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.45s ease 0.35s',
          }}
        >
          💬 Diskusikan Journey ini dengan Diah Anna
        </button>

      </div>

      <BottomNav isPremium={isPremium} />
    </div>
  )
}
