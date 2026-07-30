import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSEO, generateBreadcrumb } from '../seo'

// ─── BRAND TOKENS ─────────────────────────────────────────────────────────────
const C = {
  primary:   '#4F46E5',
  secondary: '#06B6D4',
  purple:    '#7C3AED',
  grad:      'linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)',
  bg:        '#06060F',
  surface:   'rgba(79,70,229,0.07)',
  border:    'rgba(79,70,229,0.2)',
  text:      '#fff',
  muted:     'rgba(255,255,255,0.5)',
  faint:     'rgba(255,255,255,0.06)',
  // Light section tokens — manifesto & testimonials
  lightBg:   '#F5F5F7',
  lightText: '#0D0D1A',
  lightMuted:'rgba(13,13,26,0.55)',
  lightBdr:  'rgba(13,13,26,0.08)',
}

// ─── SEO DATA ─────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'Apakah Verneks gratis?',             a: 'Ya. Kamu bisa mulai berbicara dengan Diah Anna secara gratis.' },
  { q: 'Apakah Diah Anna akan memilihkan karier saya?', a: 'Tidak. Keputusan tetap milikmu. Diah Anna membantu kamu memahami dirimu dan berbagai pilihan yang ada agar keputusanmu menjadi lebih sadar.' },
  { q: 'Siapa yang cocok menggunakan Verneks?', a: 'Mahasiswa, fresh graduate, profesional, career switcher — siapa pun yang sedang mencari arah atau menghadapi keputusan penting dalam perjalanan kariernya.' },
  { q: 'Apakah percakapan saya aman?',        a: 'Ya. Privasi dan kepercayaan adalah fondasi utama Verneks.' },
]

// ─── CHAT DEMO ────────────────────────────────────────────────────────────────
// Menampilkan value Diah Anna: empati, pertanyaan reflektif, bukan judgment
const CHAT_DEMO = [
  { role: 'user', text: 'Aku udah 3 tahun kerja di bidang marketing, tapi rasanya kosong...' },
  { role: 'diah', text: 'Aku dengar kamu merasa ada yang kurang. Bisa cerita lebih lanjut — kapan terakhir kali kamu merasa benar-benar termotivasi dengan pekerjaanmu?' },
  { role: 'user', text: 'Jujur... aku nggak bisa ingat. Setiap hari cuma ngejar target.' },
  { role: 'diah', text: 'Terima kasih sudah berbagi. Target memang penting, tapi mari kita eksplorasi: apa yang membuatmu merasa bermakna di luar pekerjaan? Hobi? Aktivitas yang bikin lupa waktu?' },
]

// ─── TESTIMONIALS ─────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: 'Dulu aku merasa terjebak di pekerjaan yang nggak bikin happy. Setelah ngobrol sama Diah Anna, aku sadar bahwa masalahnya bukan pekerjaannya — tapi aku belum kenal diri sendiri. Sekarang aku lebih percaya diri mengambil keputusan.',
    name: 'Andi', city: 'Surabaya', context: 'UX Designer, sebelumnya Marketing Executive',
  },
  {
    quote: 'Yang paling berharga dari Verneks adalah cara Diah Anna mendengarkan tanpa menghakimi. Dia nggak langsung kasih solusi, tapi membimbingku untuk menemukan jawabanku sendiri. Sekarang aku tahu apa yang benar-benar aku inginkan.',
    name: 'Rina', city: 'Jakarta', context: 'Product Manager, 4 tahun pengalaman',
  },
  {
    quote: 'Sebagai fresh graduate, aku bingung mau mulai dari mana. Diah Anna membantuku mengenali kekuatan dan minatku. Hasilnya? Aku dapat clarity yang selama ini nggak aku temukan dari career counselor manapun.',
    name: 'Reza', city: 'Bandung', context: 'Software Engineer, Fresh Graduate 2024',
  },
]

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#fff" fillOpacity="0.9" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#fff" fillOpacity="0.7" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#fff" fillOpacity="0.8" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#fff" fillOpacity="0.9" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
)
const VerneksLogo = ({ size = 30 }) => (
  <img src="/verneks_icon_1.png" alt="Verneks" width={size} height={size} style={{ objectFit: 'contain', display: 'block' }} />
)

// FadeIn: scroll-triggered opacity + translateY
function useInView(threshold = 0.08) {
  const ref = useRef()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, visible]
}
function FadeIn({ children, delay = 0, style = {} }) {
  const [ref, visible] = useInView()
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'none' : 'translateY(24px)',
      transition: `opacity 0.85s ease ${delay}s, transform 0.85s ease ${delay}s`,
      ...style,
    }}>
      {children}
    </div>
  )
}

// Horizontal divider — subtle, 1px
const Divider = ({ color = 'rgba(255,255,255,0.06)' }) => (
  <div style={{ height: 1, background: color, margin: '0 24px' }} />
)

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function Home({ user }) {
  const navigate = useNavigate()
  const [authLoading, setAuthLoading] = useState(false)
  const [visible, setVisible]         = useState(false)
  const [chatIdx, setChatIdx]         = useState(0)
  const [openFaq, setOpenFaq]         = useState(null)
  const diahRef = useRef(null)

  useSEO({
    title: 'Verneks — Karier Jangan Asal.',
    description: 'Verneks membantu kamu mengenal dirimu, menentukan arahmu, dan membangun masa depanmu bersama Diah Anna — AI Career Companion pertama di Indonesia.',
    path: '/',
    breadcrumb: generateBreadcrumb([]),
    faq: FAQS.map(item => ({ question: item.q, answer: item.a })),
    includeOrganization: true,
    includeWebSite: true,
    includeSoftwareApplication: true,
  })

  // ── Auth guard (tidak diubah) ─────────────────────────────────────────────
  useEffect(() => {
    if (user) {
      supabase.from('user_career_profiles')
        .select('career_readiness')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          window.location.href = data?.career_readiness != null ? '/chat' : '/discovery'
        })
      return
    }
    setTimeout(() => setVisible(true), 80)
  }, [user])

  // Chat animation
  useEffect(() => {
    if (chatIdx >= CHAT_DEMO.length) return
    const t = setTimeout(() => setChatIdx(i => i + 1), chatIdx === 0 ? 700 : 1400)
    return () => clearTimeout(t)
  }, [chatIdx])

  if (user) return null

  // ── Auth handlers ────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setAuthLoading(true)
    // FIX: sebelumnya hardcode ke '/chat' — user yang klik "Masuk" tapi
    // ternyata belum pernah Discovery (career_readiness kosong) jadi
    // mendarat di /chat duluan, baru App.jsx mengoreksi belakangan — bisa
    // race dengan Onboarding fallback di Chat.jsx. Redirect ke root '/'
    // supaya App.jsx yang nentuin tujuan akhir sebelum Chat.jsx sempat mount.
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } })
    setAuthLoading(false)
  }
  const handleCTA = async () => {
    setAuthLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data: cp } = await supabase.from('user_career_profiles').select('career_readiness').eq('user_id', session.user.id).maybeSingle()
      window.location.href = cp?.career_readiness != null ? '/chat' : '/discovery'
      return
    }
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/discovery` } })
    setAuthLoading(false)
  }
  const CTAButton = ({ label = 'Mulai Ngobrol dengan Diah Anna — Gratis', full = true, style: s = {} }) => (
    <button onClick={handleCTA} disabled={authLoading} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      background: authLoading ? 'rgba(79,70,229,0.25)' : C.grad,
      color: '#fff', fontWeight: 800, fontSize: '0.95rem',
      padding: '15px 24px', borderRadius: 14, border: 'none',
      cursor: authLoading ? 'not-allowed' : 'pointer',
      boxShadow: authLoading ? 'none' : '0 4px 28px rgba(79,70,229,0.4)',
      width: full ? '100%' : 'auto', maxWidth: 420,
      transition: 'all 0.2s', fontFamily: 'inherit', letterSpacing: '-0.2px', ...s,
    }}>
      {!authLoading && <GoogleIcon />}
      {authLoading ? 'Mengarahkan...' : label}
    </button>
  )

  // Hero reveal helper
  const r = (delay) => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'none' : 'translateY(18px)',
    transition: `opacity 0.85s ease ${delay}s, transform 0.85s ease ${delay}s`,
  })

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", overflowX: 'hidden', color: C.text }}>

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'relative', zIndex: 100, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.faint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <VerneksLogo size={28} />
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.93rem', lineHeight: 1.1 }}>Verneks</div>
            <div style={{ background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Karier Jangan Asal.</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate('/blog')} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.65)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Blog
          </button>
          <button onClick={handleGoogle} style={{ background: 'transparent', border: `1px solid rgba(255,255,255,0.1)`, color: 'rgba(255,255,255,0.65)', borderRadius: 20, padding: '7px 18px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Masuk
          </button>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ padding: '60px 24px 64px', maxWidth: 480, margin: '0 auto', position: 'relative', zIndex: 5 }}>

        {/* Badge */}
        <div style={r(0.05)}>
          <span style={{
            display: 'inline-block', background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 20, padding: '5px 14px', fontSize: '0.75rem', fontWeight: 700,
            color: C.secondary, letterSpacing: '0.3px', marginBottom: 28,
          }}>
            Karier Jangan Asal.
          </span>
        </div>

        {/* H1 — signature typography: satu baris per frasa, intentional line break */}
        <div style={{ ...r(0.15), marginBottom: 28 }}>
          <h1 style={{ fontSize: '2.6rem', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.04em', margin: 0 }}>
            <span style={{ display: 'block' }}>Kenali Dirimu.</span>
            <span style={{ display: 'block', background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Tentukan Arahmu.</span>
            <span style={{ display: 'block' }}>Bangun Masa Depanmu.</span>
          </h1>
        </div>

        {/* Subheadline */}
        <div style={{ ...r(0.3), marginBottom: 36 }}>
          <p style={{ color: C.muted, fontSize: '0.92rem', lineHeight: 1.75, margin: 0 }}>
            Karier bukan sekadar mencari pekerjaan.<br />
            Karier adalah keputusan tentang hidup yang ingin kamu jalani.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.92rem', lineHeight: 1.75, margin: '12px 0 0' }}>
            Bersama <strong>Diah Anna</strong>, kenali dirimu lebih dalam, temukan arah yang benar-benar sesuai, lalu bangun masa depan dengan keyakinan.
          </p>
        </div>

        {/* Primary CTA */}
        <div style={{ ...r(0.45), display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <CTAButton />
        </div>

        {/* Secondary CTA */}
        <div style={r(0.55)}>
          <button
            onClick={() => diahRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '0.84rem', fontWeight: 600, padding: 0, fontFamily: 'inherit', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.2)', textUnderlineOffset: 4 }}
          >
            Kenali Diah Anna ↓
          </button>
        </div>

        {/* Trust signals */}
        <div style={{ ...r(0.65), display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginTop: 28 }}>
          {['Gratis memulai', 'Privasi terjaga', 'Dibuat untuk Indonesia 🇮🇩'].map((t, i) => (
            <span key={i} style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', fontWeight: 500 }}>✓ {t}</span>
          ))}
        </div>
      </section>

      <Divider />

      {/* ════════════════════════════════════════════════════════════════════
          MANIFESTO — LIGHT BACKGROUND
          Typography besar. Whitespace. Tidak ada kartu. Tidak ada gradient.
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.lightBg, padding: '72px 24px', position: 'relative' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <FadeIn>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: C.lightMuted, marginBottom: 40 }}>
              Kenapa Verneks Ada?
            </p>
          </FadeIn>

          <FadeIn delay={0.05}>
            <p style={{ fontSize: '1.1rem', fontWeight: 500, lineHeight: 1.9, color: C.lightText, marginBottom: 32 }}>
              Karena terlalu banyak orang<br />
              memilih jurusan...<br />
              memilih pekerjaan...<br />
              bahkan memilih jalan hidup...<br />
              <span style={{ color: C.lightMuted }}>tanpa benar-benar mengenal dirinya.</span>
            </p>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p style={{ fontSize: '1rem', lineHeight: 1.9, color: `rgba(13,13,26,0.6)`, marginBottom: 32 }}>
              Mereka mengikuti teman.<br />
              Mengikuti tren.<br />
              Mengikuti tuntutan.<br />
              Mengikuti rasa takut.
            </p>
          </FadeIn>

          <FadeIn delay={0.15}>
            <p style={{ fontSize: '1rem', lineHeight: 1.8, color: C.lightMuted, marginBottom: 24 }}>
              Lalu bertanya...
            </p>
            <div style={{ borderLeft: `3px solid ${C.primary}`, paddingLeft: 20, marginBottom: 36 }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, fontStyle: 'italic', lineHeight: 1.7, color: C.lightText, margin: 0 }}>
                "Kenapa aku tidak benar-benar menikmati hidup yang kupilih?"
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p style={{ fontSize: '1rem', lineHeight: 1.85, color: C.lightMuted, marginBottom: 28 }}>
              Kami percaya...<br />
              Banyak masalah karier bukan dimulai dari kurangnya kemampuan.
            </p>
            <p style={{ fontSize: '1rem', lineHeight: 1.85, color: C.lightText, fontWeight: 600 }}>
              Tetapi dari keputusan yang dibuat tanpa benar-benar mengenal diri.
            </p>
          </FadeIn>

          <FadeIn delay={0.25}>
            <div style={{ borderTop: `1px solid ${C.lightBdr}`, marginTop: 48, paddingTop: 40 }}>
              <p style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', color: C.lightText, lineHeight: 1.1, margin: 0 }}>
                Karier<br />Jangan Asal.
              </p>
            </div>
          </FadeIn>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          DIAH ANNA — Teman Berpikir, Bukan Pemberi Jawaban
      ════════════════════════════════════════════════════════════════════ */}
      <section ref={diahRef} style={{ background: C.bg, padding: '72px 24px', maxWidth: 480, margin: '0 auto' }}>

        <FadeIn>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
            <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: `2px solid rgba(79,70,229,0.45)`, boxShadow: '0 0 24px rgba(79,70,229,0.2)' }} />
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>Diah Anna</div>
              <div style={{ color: C.secondary, fontSize: '0.72rem', fontWeight: 600 }}>AI Career Companion · Verneks</div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.05}>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.04em', marginBottom: 32, color: '#fff' }}>
            Teman Berpikir.<br />
            <span style={{ color: C.muted, fontWeight: 500 }}>Bukan Pemberi Jawaban.</span>
          </h2>
        </FadeIn>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {[
            'Diah Anna tidak hidup untuk menentukan masa depanmu.',
            'Ia hadir untuk membantumu menemukan jalanmu sendiri.',
            'Ia akan mendengarkan. Memahami. Menghubungkan cerita-ceritamu.',
            'Melihat pola yang mungkin belum pernah kamu sadari.',
          ].map((text, i) => (
            <FadeIn key={i} delay={i * 0.07}>
              <p style={{ color: i < 2 ? 'rgba(255,255,255,0.8)' : C.muted, fontSize: '0.95rem', lineHeight: 1.75, margin: 0 }}>{text}</p>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.35}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px 20px', marginTop: 36 }}>
            <p style={{ color: C.muted, fontSize: '0.88rem', lineHeight: 1.7, margin: '0 0 12px' }}>
              Sampai akhirnya... bukan Diah Anna yang berkata.<br />Tetapi kamu.
            </p>
            <p style={{ color: '#fff', fontWeight: 700, fontStyle: 'italic', fontSize: '1rem', lineHeight: 1.65, margin: 0 }}>
              "Sekarang aku tahu harus melangkah ke mana."
            </p>
          </div>
        </FadeIn>

      </section>

      <Divider />

      {/* ════════════════════════════════════════════════════════════════════
          HUMAN JOURNEY — 3 langkah, panah ke bawah, bukan progress bar
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.lightBg, padding: '72px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <FadeIn>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: C.lightMuted, marginBottom: 8 }}>Perjalananmu</p>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.04em', color: C.lightText, lineHeight: 1.15, marginBottom: 48 }}>
              Dimulai dari Sini.
            </h2>
          </FadeIn>

          {[
            {
              step: '01', title: 'Kenali Dirimu.',
              body: ['Setiap keputusan yang baik dimulai dari pemahaman yang benar.', 'Kenali minatmu. Kekuatanmu. Nilai hidupmu.', 'Semakin kamu mengenal dirimu — semakin kecil kemungkinan kamu menjalani hidup milik orang lain.'],
            },
            {
              step: '02', title: 'Tentukan Arahmu.',
              body: ['Tidak ada satu jalan yang benar untuk semua orang.', 'Diah Anna membantumu memahami berbagai kemungkinan, membuka perspektif baru, menimbang pilihan dengan lebih jernih.', 'Agar keputusan yang kamu ambil — benar-benar menjadi keputusanmu.'],
            },
            {
              step: '03', title: 'Bangun Masa Depanmu.',
              body: ['Karier tidak selesai ketika kamu memilih.', 'Justru di situlah perjalanan dimulai.', 'Diah Anna akan terus menemanimu berkembang. Satu langkah. Satu keputusan. Satu perubahan dalam satu waktu.'],
            },
          ].map((s, i) => (
            <div key={i}>
              <FadeIn delay={i * 0.08}>
                <div style={{ display: 'flex', gap: 20, paddingBottom: 8 }}>
                  <div style={{ paddingTop: 4 }}>
                    <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: C.primary, letterSpacing: '1px', marginBottom: 6 }}>{s.step}</span>
                    {i < 2 && <div style={{ width: 1, height: '100%', minHeight: 60, background: C.lightBdr, margin: '4px auto' }} />}
                  </div>
                  <div style={{ paddingBottom: 40 }}>
                    <h3 style={{ fontSize: '1.35rem', fontWeight: 900, letterSpacing: '-0.03em', color: C.lightText, marginBottom: 16, lineHeight: 1.2 }}>{s.title}</h3>
                    {s.body.map((line, j) => (
                      <p key={j} style={{ fontSize: '0.9rem', lineHeight: 1.8, color: j === 0 ? `rgba(13,13,26,0.75)` : C.lightMuted, margin: j === 0 ? '0 0 8px' : '0 0 6px' }}>{line}</p>
                    ))}
                  </div>
                </div>
              </FadeIn>
              {i < 2 && (
                <FadeIn delay={i * 0.08 + 0.04}>
                  <p style={{ color: `rgba(79,70,229,0.4)`, fontSize: '1.1rem', textAlign: 'left', marginLeft: 28, marginBottom: 0, lineHeight: 1 }}>↓</p>
                </FadeIn>
              )}
            </div>
          ))}

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PRODUCT EXPERIENCE — chat sederhana, ditempatkan SETELAH belief
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.bg, padding: '72px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <FadeIn>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>
              Beginilah Diah Anna menemanimu.
            </p>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1.2, marginBottom: 32 }}>
              Sesederhana ini.
            </h2>
          </FadeIn>

          {/* Chat bubbles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
            {CHAT_DEMO.slice(0, chatIdx).map((msg, i) => (
              <FadeIn key={i} delay={0}>
                <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 10, alignItems: 'flex-end' }}>
                  {msg.role === 'diah' && (
                    <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: '1.5px solid rgba(79,70,229,0.4)' }} />
                  )}
                  <div style={{
                    maxWidth: '78%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: msg.role === 'user' ? C.grad : 'rgba(255,255,255,0.06)',
                    border: msg.role === 'user' ? 'none' : `1px solid rgba(255,255,255,0.08)`,
                    color: '#fff', fontSize: '0.88rem', lineHeight: 1.55,
                  }}>
                    {msg.text}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* CTA setelah demo */}
          <FadeIn delay={0.1}>
            <p style={{ color: C.muted, fontSize: '0.85rem', lineHeight: 1.75, marginBottom: 20 }}>
              Belum perlu CV.<br />
              Belum perlu tes.<br />
              Cukup mulai bercerita.
            </p>
            <CTAButton />
          </FadeIn>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          WHY VERNEKS — 4 alasan, teks saja, no cards, LIGHT BG
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.lightBg, padding: '72px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <FadeIn>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.04em', color: C.lightText, lineHeight: 1.15, marginBottom: 48 }}>
              Mengapa Orang Bertahan<br />Bersama Verneks?
            </h2>
          </FadeIn>

          {[
            { emoji: '❤️', head: 'Mereka merasa didengar.', sub: 'Bukan dihakimi.' },
            { emoji: '💡', head: 'Mereka mulai mengenal dirinya.', sub: 'Sedikit demi sedikit. Percakapan demi percakapan.' },
            { emoji: '🧭', head: 'Mereka menemukan arah yang lebih jelas.', sub: 'Bukan karena diberi jawaban. Tetapi karena menemukan jawabannya sendiri.' },
            { emoji: '🌱', head: 'Mereka terus berkembang.', sub: 'Diah Anna mengingat perjalanan mereka. Bukan hanya percakapan hari ini.' },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.07}>
              <div style={{ paddingBottom: 36, marginBottom: 4 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.4rem', flexShrink: 0, lineHeight: 1.2 }}>{item.emoji}</span>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '0.98rem', color: C.lightText, marginBottom: 4, lineHeight: 1.4 }}>{item.head}</p>
                    <p style={{ color: C.lightMuted, fontSize: '0.88rem', lineHeight: 1.7, margin: 0 }}>{item.sub}</p>
                  </div>
                </div>
              </div>
              {i < 3 && <div style={{ height: 1, background: C.lightBdr, marginBottom: 32 }} />}
            </FadeIn>
          ))}

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          TESTIMONIALS — 3, editorial style, dark bg
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.bg, padding: '72px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <FadeIn>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>Cerita Mereka</p>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1.2, marginBottom: 48 }}>
              Dalam kata-kata<br />mereka sendiri.
            </h2>
          </FadeIn>

          {TESTIMONIALS.map((t, i) => (
            <FadeIn key={i} delay={i * 0.08}>
              <div style={{ marginBottom: i < TESTIMONIALS.length - 1 ? 48 : 0 }}>
                <p style={{ fontSize: '1.5rem', color: C.primary, fontWeight: 900, lineHeight: 1, marginBottom: 16, opacity: 0.5 }}>"</p>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.95rem', lineHeight: 1.8, fontStyle: 'italic', marginBottom: 16 }}>
                  {t.quote}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 1, background: C.primary, opacity: 0.5 }} />
                  <div>
                    <span style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 700 }}>{t.name}</span>
                    <span style={{ color: C.muted, fontSize: '0.78rem' }}> · {t.city}</span>
                    <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.72rem', margin: '2px 0 0', fontStyle: 'italic' }}>{t.context}</p>
                  </div>
                </div>
              </div>
              {i < TESTIMONIALS.length - 1 && <div style={{ height: 1, background: C.faint, margin: '0 0 48px' }} />}
            </FadeIn>
          ))}

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PHILOSOPHY — "Kami Tidak Membangun AI. Kami Membangun Manusia."
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.lightBg, padding: '72px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <FadeIn>
            <h2 style={{ fontSize: '1.9rem', fontWeight: 900, letterSpacing: '-0.04em', color: C.lightText, lineHeight: 1.15, marginBottom: 36 }}>
              Kami Tidak Membangun AI.<br /><br />
              Kami Membangun Manusia.
            </h2>
          </FadeIn>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              'Teknologi akan terus berubah. Model AI akan terus berkembang.',
              'Tetapi manusia akan selalu membutuhkan kemampuan untuk mengenal dirinya, mengambil keputusan, dan membangun masa depannya.',
              'Kami percaya — AI terbaik bukan AI yang membuatmu bergantung. Tetapi AI yang membuatmu semakin mampu mengambil keputusan sendiri.',
            ].map((text, i) => (
              <FadeIn key={i} delay={i * 0.07}>
                <p style={{ color: i === 0 ? C.lightMuted : i === 2 ? C.lightText : `rgba(13,13,26,0.7)`, fontSize: '0.95rem', lineHeight: 1.8, margin: 0, fontWeight: i === 2 ? 600 : 400 }}>
                  {text}
                </p>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.25}>
            <div style={{ borderTop: `1px solid ${C.lightBdr}`, marginTop: 40, paddingTop: 32 }}>
              <p style={{ color: C.lightMuted, fontSize: '0.92rem', lineHeight: 1.8, marginBottom: 8 }}>
                Jika suatu hari nanti kamu tidak lagi membutuhkan Diah Anna...
              </p>
              <p style={{ color: C.lightText, fontSize: '0.92rem', lineHeight: 1.8, fontWeight: 600, margin: 0 }}>
                maka kami percaya — ia telah berhasil menjalankan tugasnya.
              </p>
            </div>
          </FadeIn>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          CLOSING CTA
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.bg, padding: '80px 24px 88px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>

          <FadeIn>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: C.muted, marginBottom: 24 }}>
              Karier Jangan Asal.
            </p>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1.15, marginBottom: 12 }}>
              Kenali Dirimu.
            </h2>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.04em', background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.15, marginBottom: 12 }}>
              Tentukan Arahmu.
            </h2>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1.15, marginBottom: 36 }}>
              Bangun Masa Depanmu.
            </h2>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p style={{ color: C.muted, fontSize: '0.88rem', lineHeight: 1.8, marginBottom: 28 }}>
              Satu keputusan bisa mengubah bertahun-tahun hidupmu.<br />
              Mulailah dari mengenal dirimu.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <CTAButton />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', marginTop: 16 }}>
              Sudah punya akun?{' '}
              <span onClick={handleGoogle} style={{ color: C.secondary, fontWeight: 700, cursor: 'pointer' }}>Masuk di sini</span>
            </p>
          </FadeIn>

        </div>
      </section>

      {/* ── FAQ TERSEMBUNYI (untuk SEO schema — tidak ditampilkan visual) ── */}
      <section style={{ padding: '0 24px 48px', maxWidth: 480, margin: '0 auto' }}>
        {FAQS.map((faq, i) => (
          <div key={i} style={{ borderTop: `1px solid ${C.faint}`, padding: '16px 0' }}>
            <button
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
            >
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem', lineHeight: 1.6, fontWeight: 500 }}>{faq.q}</span>
              <span style={{ color: C.muted, fontSize: '0.85rem', flexShrink: 0 }}>{openFaq === i ? '−' : '+'}</span>
            </button>
            {openFaq === i && (
              <p style={{ color: C.muted, fontSize: '0.83rem', lineHeight: 1.7, margin: '10px 0 0', paddingRight: 24 }}>{faq.a}</p>
            )}
          </div>
        ))}
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${C.faint}`, padding: '28px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
          <VerneksLogo size={24} />
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.85rem', lineHeight: 1.1 }}>Verneks</div>
            <div style={{ background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '1px' }}>KARIER JANGAN ASAL.</div>
          </div>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.72rem', margin: '0 0 10px' }}>
          Membantu manusia mengenal dirinya, menentukan arahnya, dan membangun masa depannya.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 12 }}>
          <button onClick={() => navigate('/blog')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>Blog Karier</button>
          <button onClick={() => navigate('/library')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>Career Library</button>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.12)', fontSize: '0.7rem', margin: 0 }}>
          © Verneks · Dibangun untuk membantu lebih banyak orang mengambil keputusan karier dengan lebih sadar.
        </p>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #06060F; }
        ::-webkit-scrollbar { display: none; }
        button { font-family: inherit; }
        h1, h2, h3, h4 { margin: 0; }
        @media (prefers-reduced-motion: reduce) {
          * { transition: none !important; animation: none !important; }
        }
      `}</style>

    </div>
  )
}
