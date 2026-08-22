import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FREE_FEATURES = ['Profil Diri Kamu','Trait Diri Kamu','Analisis Pola','Skor Kesiapan Diri','3 Langkah Pertama Self-Care']

const PREMIUM_FEATURES = [
  { icon:'🗺️', text:'Langkah Self-Care Lengkap — panduan personal step by step, tidak ada yang ketinggalan' },
  { icon:'💬', text:'Diah Anna unlimited — cerita apapun, kapanpun, tanpa batas pesan' },
  { icon:'📈', text:'Progress Tracking harian — pantau seberapa jauh kamu udah berkembang' },
  { icon:'📋', text:'Ringkasan Mingguan — insight mood & pola dirimu minggu ini' },
  { icon:'🌿', text:'Rekomendasi Aktivitas — saran self-care yang benar-benar cocok sama kondisimu' },
  { icon:'✅', text:'Personal Action Plan — langkah kecil spesifik yang bisa langsung dicoba hari ini' },
]

// Scarcity: kuota tersisa (bisa dibuat dinamis dari backend nanti)
const SLOTS_LEFT = 7

export default function Paywall() {
  const navigate = useNavigate()
  const [result, setResult]             = useState(null)
  const [revealed, setRevealed]         = useState(false)
  const [ctaVisible, setCtaVisible]     = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [plan, setPlan]                 = useState('premium')
  const [priceRevealed, setPriceRevealed] = useState(false)
  const ctaTriggerRef = useRef(null)
  const timerRef      = useRef(null)

  // Countdown 10 menit scarcity timer
  const [timeLeft, setTimeLeft] = useState(10 * 60)
  useEffect(() => {
    timerRef.current = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000)
    return () => clearInterval(timerRef.current)
  }, [])
  const mins = String(Math.floor(timeLeft / 60)).padStart(2,'0')
  const secs = String(timeLeft % 60).padStart(2,'0')

  useEffect(() => {
    // Coba dari localStorage dulu
    const saved = localStorage.getItem('lc_discovery_result')
    if (saved) {
      try { setResult(JSON.parse(saved)); setTimeout(() => setRevealed(true), 80); return }
      catch {}
    }

    // Fallback: baca dari Supabase kalau localStorage sudah dihapus (setelah login)
    const loadFromSupabase = async () => {
      try {
        const { data: { session } } = await import('../lib/supabase').then(m => m.supabase.auth.getSession())
        const userId = session?.user?.id
        if (!userId) { navigate('/discovery'); return }

        const { supabase } = await import('../lib/supabase')
        const [{ data: p }, { data: g }, { data: gw }] = await Promise.all([
          supabase.from('user_career_profiles').select('*').eq('user_id', userId).maybeSingle(),
          supabase.from('user_genome_scores').select('*').eq('user_id', userId).maybeSingle(),
          supabase.from('user_growth_state').select('*').eq('user_id', userId).maybeSingle(),
        ])

        if (!p && !g) { navigate('/discovery'); return }

        const reconstructed = {
          profile_preview:  { nama: p?.nama, target_posisi: p?.target_posisi, posisi_saat_ini: p?.posisi_saat_ini },
          genome_scores:    { analytical: g?.analytical||0, leadership: g?.leadership||0, builder: g?.builder||0, creator: g?.creator||0, communication: g?.communication||0, risk_taking: g?.risk_taking||0 },
          career_readiness: gw?.progress_percent || p?.career_readiness || 0,
          gap_skills:       p?.skill_gaps || [],
          gps_steps:        gw?.gps_steps || p?.gps_steps || [],
          mentor_message:   p?.mentor_message,
          gap_summary:      p?.hambatan || '',
          growth_state:     { career_stage: gw?.career_stage, current_focus: gw?.current_focus },
          top_strength:     g?.top_strength,
        }
        setResult(reconstructed)
        setTimeout(() => setRevealed(true), 80)
      } catch { navigate('/discovery') }
    }
    loadFromSupabase()
  }, [])

  // Reveal pricing hanya setelah feature list terlihat penuh
  useEffect(() => {
    if (!ctaTriggerRef.current) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setCtaVisible(true)
          // Pricing muncul dengan dramatic delay setelah CTA area masuk viewport
          setTimeout(() => setPriceRevealed(true), 600)
        }
      },
      { threshold: 1.0, rootMargin: '0px 0px -20px 0px' }
    )
    obs.observe(ctaTriggerRef.current)
    return () => obs.disconnect()
  }, [result])

  const handleLogin = async (selectedPlan) => {
    setPlan(selectedPlan)
    setLoginLoading(true)
    localStorage.setItem('lc_plan_intent', selectedPlan)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    })
  }

  if (!result) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0f0d' }}>
      <div style={{ fontSize:'2rem' }}>⏳</div>
    </div>
  )

  const p           = result.profile_preview || {}
  const readiness   = result.career_readiness || 0
  const gpsSteps    = result.gps_steps || []
  const lockedSteps = gpsSteps.filter((_,i) => i >= 3)
  const mentorMsg   = result.mentor_message
  const gs          = result.genome_scores || {}
  const GMAP        = [
    {key:'analytical',label:'Self-Awareness',emoji:'🧠',color:'#34B7F1'},
    {key:'leadership',label:'Resilience',emoji:'🌱',color:'#F48FB1'},
    {key:'builder',   label:'Coping Kreatif',   emoji:'⚙️',color:'#25D366'},
    {key:'creator',   label:'Keterbukaan',   emoji:'🌤️',color:'#FFB74D'},
    {key:'communication',label:'Komunikasi Emosi',emoji:'💬',color:'#CE93D8'},
    {key:'risk_taking',  label:'Empati',  emoji:'💗',color:'#EF9A9A'},
  ]
  const topGenome = GMAP.reduce((b,g) => (gs[g.key]||0) > (gs[b.key]||0) ? g : b, GMAP[0])

  const fade = (delay=0) => ({
    opacity: revealed ? 1 : 0,
    transform: revealed ? 'none' : 'translateY(14px)',
    transition: `all 0.5s ease ${delay}s`,
  })

  return (
    <div style={{ minHeight:'100vh', background:'#0a0f0d', fontFamily:"'Plus Jakarta Sans', sans-serif", overflowX:'hidden' }}>

      {/* Header */}
      <div style={{ background:'rgba(255,255,255,0.03)', borderBottom:'1px solid rgba(255,255,255,0.07)', padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => navigate('/genome-result')} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.4)', cursor:'pointer', fontSize:'0.82rem' }}>← Kembali</button>
        <span style={{ color:'#fff', fontWeight:700, fontSize:'0.9rem' }}>Langkah Self-Care</span>
        <div style={{ width:60 }} />
      </div>

      <div style={{ padding:'22px 18px', maxWidth:480, margin:'0 auto', paddingBottom: '160px', minHeight:'110vh' }}>

        {/* ── RESULT BADGES ── */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20, ...fade(0.05) }}>
          {p.target_posisi && (
            <div style={{ background:'rgba(37,211,102,0.1)', border:'1px solid rgba(37,211,102,0.2)', borderRadius:99, padding:'4px 12px', fontSize:'0.78rem', color:'#25D366', fontWeight:600 }}>🎯 {p.target_posisi}</div>
          )}
          <div style={{ background:'rgba(52,183,241,0.1)', border:'1px solid rgba(52,183,241,0.2)', borderRadius:99, padding:'4px 12px', fontSize:'0.78rem', color:'#34B7F1', fontWeight:600 }}>
            {topGenome.emoji} {topGenome.label} {gs[topGenome.key]}
          </div>
          <div style={{ background:'rgba(255,183,77,0.1)', border:'1px solid rgba(255,183,77,0.2)', borderRadius:99, padding:'4px 12px', fontSize:'0.78rem', color:'#FFB74D', fontWeight:600 }}>📊 Kesiapan {readiness}%</div>
        </div>

        {/* ── DIAH ANNA PESAN PERSONAL ── */}
        <div style={{ background:'rgba(37,211,102,0.08)', border:'1px solid rgba(37,211,102,0.22)', borderRadius:16, padding:'18px', marginBottom:18, ...fade(0.08) }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <img src="/diah-anna.png" alt="Diah Anna" style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(37,211,102,0.35)', flexShrink:0 }} />
            <div>
              <div style={{ color:'#25D366', fontWeight:700, fontSize:'0.85rem' }}>Diah Anna</div>
              <div style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.68rem' }}>Teman Curhat AI · Verneks</div>
            </div>
          </div>

          <div style={{ color:'rgba(255,255,255,0.82)', fontSize:'0.9rem', lineHeight:1.75, marginBottom:16 }}>
            {mentorMsg || `${p.nama ? `${p.nama}, ` : ''}aku udah dengerin cerita kita dengan seksama.${p.target_posisi ? ` Soal ${p.target_posisi} yang lagi kamu hadapi, itu wajar dan bisa dilewatin pelan-pelan.` : ''} ${p.hambatan_utama ? `Yang bikin susah lega selama ini bukan salahmu — melainkan ${p.hambatan_utama}.` : 'Kamu punya kekuatan buat ngerasa lebih baik, cuma belum sepenuhnya kepakai.'}`}
          </div>

          {/* Langkah setengah terbuka */}
          <div style={{ borderTop:'1px solid rgba(37,211,102,0.15)', paddingTop:14 }}>
            <div style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.7rem', letterSpacing:'1px', marginBottom:10 }}>LANGKAH YANG SUDAH AKU SIAPKAN:</div>
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {gpsSteps.slice(0,3).map((step,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.85rem' }}>
                  <span style={{ color: step.done ? '#25D366' : '#34B7F1', fontWeight:700, fontSize:'0.8rem', flexShrink:0 }}>
                    {step.done ? '✓' : `${i+1}.`}
                  </span>
                  <span style={{ color: step.done ? '#25D366' : 'rgba(255,255,255,0.75)' }}>{step.title}</span>
                </div>
              ))}
              {lockedSteps.map((step,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.85rem' }}>
                  <span style={{ color:'rgba(255,255,255,0.15)', flexShrink:0 }}>🔒</span>
                  <span style={{ color:'rgba(255,255,255,0.12)', filter:'blur(4.5px)', userSelect:'none', flex:1 }}>{step.title}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:12, fontSize:'0.78rem', color:'rgba(255,255,255,0.38)', lineHeight:1.55 }}>
              Aku tahu persis langkah mana yang cocok buat kamu coba sekarang. Tapi untuk membukanya, kamu perlu satu keputusan kecil.
            </div>
          </div>
        </div>

        {/* ── APA YANG KAMU DAPATKAN ── */}
        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:'18px', marginBottom:14, ...fade(0.14) }}>
          <div style={{ color:'#fff', fontWeight:800, fontSize:'1rem', marginBottom:4 }}>🎯 Langkah Self-Care Kamu Sudah Siap</div>
          <div style={{ color:'rgba(255,255,255,0.38)', fontSize:'0.8rem', marginBottom:16, lineHeight:1.5 }}>
            Satu paket lengkap buat nemenin kamu ngerasa lebih tenang, selangkah demi selangkah.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
            {PREMIUM_FEATURES.map((f,i) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                <span style={{ fontSize:'1.05rem', flexShrink:0, marginTop:1 }}>{f.icon}</span>
                <span style={{ color:'rgba(255,255,255,0.72)', fontSize:'0.84rem', lineHeight:1.5 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── FREE TIER ── */}
        <div style={{ background:'rgba(37,211,102,0.04)', border:'1px solid rgba(37,211,102,0.1)', borderRadius:12, padding:'14px', marginBottom:8, ...fade(0.18) }}>
          <div style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.68rem', letterSpacing:'1px', marginBottom:8 }}>SELALU GRATIS:</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'5px 12px' }}>
            {FREE_FEATURES.map(f => (
              <span key={f} style={{ color:'rgba(37,211,102,0.7)', fontSize:'0.75rem' }}>✓ {f}</span>
            ))}
          </div>
        </div>

        {/* ── TRIGGER REF untuk IntersectionObserver ── */}
        <div ref={ctaTriggerRef} style={{ height:2, marginTop: 8 }} />
      </div>

      {/* ── FIXED BOTTOM: muncul bertahap setelah scroll habis ── */}
      <div style={{
        position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)',
        width:'100%', maxWidth:480, padding:'16px 18px 34px',
        background:'linear-gradient(to top, #0a0f0d 82%, transparent)',
        opacity: ctaVisible ? 1 : 0,
        transition:'opacity 0.5s ease',
        pointerEvents: ctaVisible ? 'auto' : 'none',
      }}>

        {/* Pricing — muncul 600ms setelah CTA area */}
        <div style={{
          opacity: priceRevealed ? 1 : 0,
          transform: priceRevealed ? 'none' : 'translateY(8px)',
          transition:'all 0.4s ease',
          textAlign:'center', marginBottom:10,
        }}>
          {/* Harga coret */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:2 }}>
            <span style={{ color:'rgba(255,255,255,0.25)', fontSize:'0.85rem', textDecoration:'line-through' }}>Rp599.000/bln</span>
            <span style={{ background:'#EF5350', color:'#fff', fontSize:'0.65rem', fontWeight:800, padding:'2px 7px', borderRadius:99 }}>HEMAT 67%</span>
          </div>
          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'center', gap:4 }}>
            <span style={{ color:'#FFB74D', fontWeight:900, fontSize:'1.5rem' }}>Rp99.000</span>
            <span style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.8rem' }}>akses 1 bulan </span>
          </div>
          <div style={{ color:'rgba(255,255,255,0.25)', fontSize:'0.7rem', marginTop:1 }}>
            Semua fitur premium · Unlimited · Sekali Bayar
          </div>
        </div>

        {/* Scarcity — lebih tegas di dekat harga */}
        {priceRevealed && (
          <div style={{ background:'rgba(239,83,80,0.1)', border:'1px solid rgba(239,83,80,0.25)', borderRadius:10, padding:'9px 14px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:'#EF5350', display:'inline-block', animation:'pulse 1.5s infinite', flexShrink:0 }} />
              <div>
                <div style={{ color:'#EF5350', fontWeight:700, fontSize:'0.78rem' }}>🔥 Penawaran Terbatas</div>
                <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.68rem' }}>Hanya {SLOTS_LEFT} slot tersisa hari ini</div>
              </div>
            </div>
            <div style={{ textAlign:'right', flexShrink:0, marginLeft:10 }}>
              <div style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.62rem' }}>Harga naik dalam</div>
              <div style={{ color:'#EF5350', fontWeight:800, fontSize:'1rem', fontVariantNumeric:'tabular-nums' }}>{mins}:{secs}</div>
            </div>
          </div>
        )}

        {/* Premium CTA */}
        <button
          onClick={() => handleLogin('premium')}
          disabled={loginLoading}
          style={{
            width:'100%', padding:'15px', marginBottom:9,
            background: loginLoading ? '#333' : 'linear-gradient(135deg,#25D366,#128C7E)',
            color:'#fff', fontWeight:800, fontSize:'1rem',
            borderRadius:14, border:'none', cursor: loginLoading ? 'not-allowed' : 'pointer',
            boxShadow: loginLoading ? 'none' : '0 4px 22px rgba(37,211,102,0.45)',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
          {loginLoading && plan==='premium' ? '⏳ Mengarahkan...' : '🚀 Upgrade Premium — Buka Langkah Self-Care'}
        </button>

        {/* Free CTA */}
        <button
          onClick={() => handleLogin('free')}
          disabled={loginLoading}
          style={{
            width:'100%', padding:'11px',
            background:'transparent', border:'1px solid rgba(255,255,255,0.12)',
            color:'rgba(255,255,255,0.45)', fontWeight:600, fontSize:'0.83rem',
            borderRadius:11, cursor: loginLoading ? 'not-allowed' : 'pointer',
          }}>
          {loginLoading && plan==='free' ? '⏳ Mengarahkan...' : 'Simpan Hasil Gratis — Akses Terbatas'}
        </button>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  )
}
