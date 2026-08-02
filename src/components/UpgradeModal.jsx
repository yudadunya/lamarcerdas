// src/components/UpgradeModal.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PAYMENT_URL = 'http://lynk.id/yudadunya/r3o5ldq5qkex/checkout'
const PROMO_DURATION_MS = 24 * 60 * 60 * 1000 // 24 jam dalam millisecond

// Generate GPS steps dari data user — fallback ke generic kalau data kosong
function buildGpsSteps(gpsFromDb, gapSkills, targetPosisi) {
  // Prioritas 1: pakai gps_steps dari DB (hasil compute-genome)
  if (gpsFromDb?.length >= 3) {
    return gpsFromDb.map((s, i) => ({
      label: s.title || s.label || `Langkah ${i+1}`,
      done:  s.done  || false,
      free:  i < 2,
    }))
  }
  // Prioritas 2: generate dari gap_skills user
  if (gapSkills?.length > 0) {
    const steps = [
      { label: 'Career Assessment',      done: true,  free: true  },
      { label: gapSkills[0],             done: false, free: true  },
      { label: gapSkills[1] || 'Latihan Praktik',  done: false, free: false },
      { label: gapSkills[2] || 'Portfolio Project', done: false, free: false },
      { label: gapSkills[3] || 'Personal Branding', done: false, free: false },
      { label: 'Interview Preparation',  done: false, free: false },
    ]
    return steps
  }
  // Fallback generic
  return [
    { label: 'Career Assessment',     done: true,  free: true  },
    { label: 'Skill Foundation',      done: false, free: true  },
    { label: 'Core Skill Building',   done: false, free: false },
    { label: 'Practice & Portfolio',  done: false, free: false },
    { label: 'Personal Branding',     done: false, free: false },
    { label: 'Interview Preparation', done: false, free: false },
  ]
}

// Format waktu sisa menjadi string yang readable
function formatTimeRemaining(ms) {
  if (ms <= 0) return null
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}j ${minutes}m ${seconds}d`
}

export default function UpgradeModal({ user, onClose, initialData = null }) {
  const [profile,  setProfile]  = useState(initialData?.profile  || null)
  const [growth,   setGrowth]   = useState(initialData?.growth   || null)
  const [genome,   setGenome]   = useState(initialData?.genome   || null)
  const [loading,  setLoading]  = useState(!initialData)

  // Redeem code state
  const [showRedeem,   setShowRedeem]   = useState(false)
  const [redeemCode,   setRedeemCode]   = useState('')
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemMsg,    setRedeemMsg]    = useState(null)  // { type: 'ok'|'err', text }
  const [redeemDone,   setRedeemDone]   = useState(false)

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState(24 * 60 * 60 * 1000)
  const [isPromoActive, setIsPromoActive] = useState(true)

  useEffect(() => {
    // Kalau data sudah dikirim dari Dashboard — langsung pakai, tidak perlu fetch
    if (initialData?.profile) { setLoading(false); return }
    if (!user?.id) { setLoading(false); return }
    Promise.all([
      supabase.from('user_career_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_growth_state').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_genome_scores').select('*').eq('user_id', user.id).maybeSingle(),
    ]).then(([{ data: p }, { data: g }, { data: gs }]) => {
      setProfile(p); setGrowth(g); setGenome(gs); setLoading(false)
    })
  }, [user?.id])

  // Handle promo timer
  // FIX: sebelumnya deadline-nya disimpan di localStorage dan REGENERATE
  // diri sendiri kalau sudah lewat/dihapus — jadi "harga spesial berakhir
  // dalam 24 jam" itu nggak pernah beneran berakhir buat hampir semua user
  // (fake urgency, disadari sendiri sebagai pola yang problematik). Sekarang
  // deadline-nya dihitung dari user.created_at (tanggal akun BENERAN
  // dibuat, dari Supabase Auth — nggak bisa direset/dimanipulasi user atau
  // ke-generate ulang tiap buka modal). Begitu 24 jam sejak akun dibuat
  // lewat, promo beneran berakhir permanen buat user itu, titik.
  useEffect(() => {
    if (!user?.created_at) {
      // Data akun tidak tersedia — jangan asumsikan promo aktif (itu yang
      // bikin bug lama), anggap sudah tidak aktif, tampilkan harga normal.
      setIsPromoActive(false)
      return
    }
    const startTime = new Date(user.created_at).getTime()

    const updateTimer = () => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, PROMO_DURATION_MS - elapsed)

      setTimeRemaining(remaining)
      setIsPromoActive(remaining > 0)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [user?.created_at])

  const target    = profile?.target_posisi || 'Target Karier Kamu'
  const readiness = growth?.progress_percent || profile?.career_readiness || 0
  const gapPct    = Math.max(0, 100 - readiness)
  const gaps      = (profile?.skill_gaps || profile?.gap_skills || []).slice(0, 4)
  const gpsSteps  = buildGpsSteps(profile?.gps_steps, gaps, target)
  const mentorMsg = profile?.mentor_message
    || `Berdasarkan percakapan kita, aku sudah melihat pola yang jelas di situasi karir kamu — dan ada jalur spesifik yang bisa mempercepat perjalananmu ke ${target}. Aku pengen bantu kamu eksekusi step by step, bukan cuma kasih insight sekali lalu hilang. Ini yang bisa kita lakukan bareng kalau kamu mau lanjut lebih serius.`

  const discountPercentage = Math.round(((599000 - 99000) / 599000) * 100)
  const timeFormatted = timeRemaining ? formatTimeRemaining(timeRemaining) : null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 1000, backdropFilter: 'blur(3px)' }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480,
        background: '#0d1710',
        border: '1px solid rgba(37,211,102,0.18)',
        borderRadius: '22px 22px 0 0',
        zIndex: 1001,
        maxHeight: '92vh', overflowY: 'auto',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>

        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Close */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 16,
          background: 'rgba(255,255,255,0.07)', border: 'none', color: 'rgba(255,255,255,0.45)',
          width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>

        <div style={{ padding: '12px 20px 40px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>🚀</div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.3px', marginBottom: 4 }}>
              Lanjutkan Perjalanan Ini Bersama Diah Anna
            </div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', lineHeight: 1.5 }}>
              Kamu sudah tahu DNA Karier dan posisimu sekarang.<br/>
              Sekarang saatnya mendapatkan panduan yang jelas.
            </div>
          </div>

          {/* ── Ringkasan Profil ── */}
          {!loading && (
            <div style={{ background: 'rgba(37,211,102,0.07)', border: '1px solid rgba(37,211,102,0.18)', borderRadius: 14, padding: '14px', marginBottom: 14 }}>
              <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.78rem', marginBottom: 10 }}>🎯 Ringkasan Profil Kamu</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 6px' }}>
                  <div style={{ color: '#25D366', fontWeight: 800, fontSize: '0.72rem' }}>{target}</div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem', marginTop: 2 }}>Target Karier</div>
                </div>
                <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 6px' }}>
                  <div style={{ color: '#34B7F1', fontWeight: 800, fontSize: '0.88rem' }}>{readiness}%</div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem', marginTop: 2 }}>Career Readiness</div>
                </div>
                <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 6px' }}>
                  <div style={{ color: '#FFB74D', fontWeight: 800, fontSize: '0.88rem' }}>{gapPct}%</div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem', marginTop: 2 }}>Gap yang Ditutup</div>
                </div>
              </div>
              {gaps.length > 0 && (
                <>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.68rem', marginBottom: 6, letterSpacing: '0.5px' }}>HAMBATAN TERBESAR:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {gaps.map((g, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)' }}>
                        <span style={{ color: '#FFB74D', fontWeight: 900 }}>#{i+1}</span>
                        <span>{g}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── GPS Roadmap ── */}
          <div style={{ background: 'rgba(52,183,241,0.07)', border: '1px solid rgba(52,183,241,0.15)', borderRadius: 12, padding: '14px', marginBottom: 18 }}>
            <div style={{ color: '#34B7F1', fontWeight: 700, fontSize: '0.78rem', marginBottom: 12 }}>🗺️ Jalan Menuju {target}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {gpsSteps.map(({ label, done, free }, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ 
                      fontSize: '1.2rem',
                      opacity: done ? 1 : free ? 0.6 : 0.3
                    }}>
                      {done ? '✅' : '⭕'}
                    </span>
                    <span style={{ 
                      fontSize: '0.8rem', 
                      color: done ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)',
                      fontWeight: done ? 600 : 400
                    }}>{label}</span>
                    {free && <span style={{ fontSize: '0.6rem', color: '#25D366', fontWeight: 700, background: 'rgba(37,211,102,0.15)', padding: '2px 6px', borderRadius: 4 }}>GRATIS</span>}
                  </div>
                  {i < gpsSteps.length - 1 && (
                    <div style={{ marginLeft: 7, height: 20, width: 2, background: 'rgba(52,183,241,0.3)' }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── GPS Steps Desktop View (Full)  ── */}
          <div style={{ marginBottom: 18, display: 'none' }}>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '1px' }}>📍 Alur Lengkap Bersama Mentormu</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {gpsSteps.map(({ label, done, free }, i) => {
                const isFree = free
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < gpsSteps.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                    <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
                      {done ? '✅' : isFree ? '✨' : '🔒'}
                    </span>
                    <span style={{
                      fontSize: '0.82rem',
                      color: 'rgba(255,255,255,0.7)',
                      flex: 1,
                      filter: !isFree ? 'blur(3.5px)' : 'none',
                      userSelect: !isFree ? 'none' : 'auto',
                    }}>{label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Pesan Diah Anna ── */}
          <div style={{ background: 'rgba(37,211,102,0.07)', border: '1px solid rgba(37,211,102,0.18)', borderRadius: 12, padding: '13px', marginBottom: 20, display: 'flex', gap: 10 }}>
            <img src="/diah-anna.png" alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <div>
              <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.72rem', marginBottom: 5 }}>Pesan dari Diah Anna</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', lineHeight: 1.65 }}>{mentorMsg}</div>
            </div>
          </div>

          {/* ── Pricing ── */}
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            {/* Timer Banner */}
            {isPromoActive && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(255,183,77,0.2), rgba(239,83,80,0.15))',
                border: '1px solid rgba(255,183,77,0.4)',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}>
                <span style={{ fontSize: '0.95rem' }}>⏰</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#FFB74D' }}>
                  HARGA SPESIAL BERAKHIR DALAM {timeFormatted}
                </span>
              </div>
            )}

            {/* Original price / Discount badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 3 }}>
              <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.82rem', textDecoration: 'line-through' }}>Rp599.000</span>
              {isPromoActive ? (
                <span style={{ background: '#EF5350', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 99 }}>HEMAT {discountPercentage}%</span>
              ) : (
                <span style={{ background: 'rgba(239,83,80,0.2)', color: '#EF5350', fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 99, border: '1px solid rgba(239,83,80,0.3)' }}>PROMO BERAKHIR</span>
              )}
            </div>

            {/* Current price */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
              <span style={{ color: isPromoActive ? '#FFB74D' : '#EF5350', fontWeight: 900, fontSize: '1.6rem' }}>
                Rp{isPromoActive ? '99.000' : '599.000'}
              </span>
              <span style={{ 
                background: isPromoActive ? 'rgba(255,183,77,0.15)' : 'rgba(239,83,80,0.15)',
                color: isPromoActive ? '#FFB74D' : '#EF5350',
                fontSize: '0.68rem', 
                fontWeight: 800, 
                padding: '3px 10px', 
                borderRadius: 99, 
                border: isPromoActive ? '1px solid rgba(255,183,77,0.3)' : '1px solid rgba(239,83,80,0.3)'
              }}>
                SEKALI BAYAR
              </span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.7rem', marginTop: 4 }}>
              {isPromoActive ? 'Akses penuh 30 hari · Tidak ada biaya tersembunyi · Bukan langganan' : 'Harga normal berlaku'}
            </div>
          </div>

          {/* ── CTAs ── */}
          <a
            href={PAYMENT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', width: '100%', padding: '15px', marginBottom: 10,
              background: 'linear-gradient(135deg,#25D366,#128C7E)',
              color: '#fff', fontWeight: 800, fontSize: '1rem',
              borderRadius: 14, textDecoration: 'none', textAlign: 'center',
              boxShadow: '0 4px 20px rgba(37,211,102,0.42)',
            }}>
            🚀 Ya, Lanjutkan Bersama Diah Anna
          </a>

          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '12px',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.4)', fontWeight: 600, fontSize: '0.85rem',
              borderRadius: 12, cursor: 'pointer',
            }}>
            Lanjutkan Versi Gratis
          </button>

          {/* ── Redeem Code ── */}
          {!redeemDone ? (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              {!showRedeem ? (
                <button
                  onClick={() => setShowRedeem(true)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
                >
                  Sudah punya kode redeem?
                </button>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', textAlign: 'left' }}>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: 8 }}>Masukkan kode redeem (12 karakter)</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={redeemCode}
                      onChange={e => { setRedeemCode(e.target.value.toUpperCase()); setRedeemMsg(null) }}
                      placeholder="XXXX-XXXX-XXXX"
                      maxLength={12}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 9,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.05)', color: '#fff',
                        fontSize: '0.95rem', fontFamily: 'monospace', letterSpacing: 2,
                        outline: 'none',
                      }}
                    />
                    <button
                      disabled={redeemCode.length < 12 || redeemLoading}
                      onClick={async () => {
                        if (!user?.id) return
                        setRedeemLoading(true); setRedeemMsg(null)
                        try {
                          const res  = await fetch('/api/utils?action=redeem', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code: redeemCode, userId: user.id }),
                          })
                          const data = await res.json()
                          if (data.success) {
                            setRedeemDone(true)
                            setRedeemMsg({ type: 'ok', text: '🎉 Premium aktif 30 hari! Halaman akan refresh otomatis...' })
                            setTimeout(() => window.location.reload(), 1500)
                          } else {
                            setRedeemMsg({ type: 'err', text: data.error || 'Kode tidak valid' })
                          }
                        } catch {
                          setRedeemMsg({ type: 'err', text: 'Koneksi bermasalah, coba lagi.' })
                        }
                        setRedeemLoading(false)
                      }}
                      style={{
                        padding: '10px 16px', borderRadius: 9,
                        background: redeemCode.length < 12 ? 'rgba(37,211,102,0.2)' : 'linear-gradient(135deg,#25D366,#128C7E)',
                        color: '#fff', fontWeight: 700, fontSize: '0.82rem',
                        border: 'none', cursor: redeemCode.length < 12 ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {redeemLoading ? '⏳' : 'Aktifkan'}
                    </button>
                  </div>
                  {redeemMsg && (
                    <div style={{ marginTop: 8, fontSize: '0.78rem', color: redeemMsg.type === 'ok' ? '#25D366' : '#EF5350', fontWeight: 600 }}>
                      {redeemMsg.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 16, padding: '14px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>🎉</div>
              <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.9rem' }}>Premium berhasil diaktifkan!</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginTop: 4 }}>Berlaku 30 hari. Refresh halaman untuk mulai.</div>
              <button onClick={() => window.location.reload()} style={{ marginTop: 10, padding: '9px 20px', borderRadius: 9, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: '0.82rem', border: 'none', cursor: 'pointer' }}>
                Refresh Sekarang
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
