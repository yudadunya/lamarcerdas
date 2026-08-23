import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSEO, generateBreadcrumb } from '../seo'

// ─── BRAND TOKENS — reposisi dari "corporate career" ke "hangat, aman, dekat" ──
const C = {
  primary:   '#8B5CF6', // violet hangat, bukan indigo korporat
  secondary: '#FB7185', // coral lembut — hangat, bukan cyan "tech"
  purple:    '#A78BFA',
  grad:      'linear-gradient(135deg, #8B5CF6 0%, #FB7185 100%)',
  bg:        '#0B0710',
  surface:   'rgba(139,92,246,0.08)',
  border:    'rgba(139,92,246,0.22)',
  text:      '#fff',
  muted:     'rgba(255,255,255,0.5)',
  faint:     'rgba(255,255,255,0.06)',
  lightBg:   '#FBF7F9',
  lightText: '#1A1420',
  lightMuted:'rgba(26,20,32,0.55)',
  lightBdr:  'rgba(26,20,32,0.08)',
}

// ─── SEO DATA ─────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'Apakah Verneks gratis?', a: 'Ya. Kamu bisa curhat ke Diah Anna kapan saja secara gratis.' },
  { q: 'Apakah Diah Anna cuma bakal ngiyain semua ceritaku?', a: 'Nggak. Diah Anna validasi perasaanmu dulu, tapi kalau ada sisi lain dari situasimu yang perlu dilihat, dia akan jujur menyampaikannya — bukan sekadar bilang "kamu benar" ke semua hal.' },
  { q: 'Apakah data curhatanku aman?', a: 'Ya. Chat, ceritamu, dan semua yang Diah Anna pelajari tentang kamu disimpan hanya di HP/laptopmu sendiri — bukan di server kami. Kamu bisa hapus semuanya kapan saja.' },
  { q: 'Apakah Diah Anna pengganti psikolog atau terapis?', a: 'Bukan. Diah Anna teman ngobrol yang bisa diajak cerita kapan saja, tapi bukan pengganti bantuan profesional. Kalau kamu sedang menghadapi masalah berat, Diah Anna akan mengarahkanmu ke bantuan yang tepat.' },
  { q: 'Siapa yang cocok pakai Verneks?', a: 'Siapa saja yang kadang butuh tempat cerita — soal kerjaan, kuliah, hubungan, atau sekadar hari yang berat — tanpa takut dihakimi.' },
]

// ─── CHAT DEMO ────────────────────────────────────────────────────────────────
const CHAT_DEMO = [
  { role: 'user', text: 'Anna, hari ini capek banget. Rasanya semua yang aku kerjain nggak ada yang bener.' },
  { role: 'diah', text: 'Aku di sini. Hari kayak gitu emang berat ya — capeknya bukan cuma fisik, tapi juga karena ngerasa usaha kamu nggak cukup dihargai. Mau cerita apa yang kejadian?' },
  { role: 'user', text: 'Bos aku marah di depan tim gara-gara hal kecil. Padahal aku udah usaha maksimal.' },
  { role: 'diah', text: 'Wajar banget kalau itu bikin kamu down, apalagi di depan orang lain. Itu bukan berarti usahamu nggak berarti — kadang orang lain lagi bawa masalahnya sendiri. Gimana perasaanmu sekarang, udah agak reda apa masih kepikiran?' },
]

// ─── TESTIMONIALS ─────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: 'Jam 2 pagi lagi overthinking parah, nggak enak juga bangunin temen. Cerita ke Diah Anna, dan dia beneran dengerin — nggak langsung nyuruh aku "positive thinking aja".',
    name: 'Nadia', city: 'Bandung', context: 'Mahasiswa semester akhir',
  },
  {
    quote: 'Awalnya iseng doang coba-coba. Eh ternyata kepakai buat cerita hal-hal yang susah aku omongin ke orang deket, karena nggak takut dinilai.',
    name: 'Fajar', city: 'Surabaya', context: 'Karyawan swasta',
  },
  {
    quote: 'Yang aku suka, Diah Anna inget cerita-ceritaku sebelumnya. Jadi ngobrolnya nggak kayak mulai dari nol tiap kali, kayak beneran ngobrol sama yang udah kenal aku.',
    name: 'Sari', city: 'Yogyakarta', context: 'Fresh graduate',
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
    title: 'Verneks — Didengerin Beneran, Bukan Cuma Diiyain.',
    description: 'Diah Anna, teman curhat AI yang jujur — dengerin ceritamu tanpa menghakimi, tapi juga nggak asal bilang "kamu benar" ke semua hal. Inget obrolan lamamu, dan datanya 100% tersimpan di HP-mu sendiri, bukan di server.',
    path: '/',
    breadcrumb: generateBreadcrumb([]),
    faq: FAQS.map(item => ({ question: item.q, answer: item.a })),
    includeOrganization: true,
    includeWebSite: true,
    includeSoftwareApplication: true,
  })

  // ── Auth guard ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (user) {
      // PIVOT selesai: nggak ada lagi onboarding wajib — user yang sudah
      // login langsung ke /chat, apapun status career profile-nya.
      window.location.href = '/chat'
      return
    }
    setTimeout(() => setVisible(true), 80)
  }, [user])

  useEffect(() => {
    if (chatIdx >= CHAT_DEMO.length) return
    const t = setTimeout(() => setChatIdx(i => i + 1), chatIdx === 0 ? 700 : 1400)
    return () => clearTimeout(t)
  }, [chatIdx])

  if (user) return null

  // ── Auth handlers ────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setAuthLoading(true)
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } })
    setAuthLoading(false)
  }
  const handleCTA = async () => {
    setAuthLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      window.location.href = '/chat'
      return
    }
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/chat` } })
    setAuthLoading(false)
  }
  const CTAButton = ({ label = 'Mulai Cerita ke Diah Anna — Gratis', full = true, style: s = {} }) => (
    <button onClick={handleCTA} disabled={authLoading} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      background: authLoading ? 'rgba(139,92,246,0.25)' : C.grad,
      color: '#fff', fontWeight: 800, fontSize: '0.95rem',
      padding: '15px 24px', borderRadius: 14, border: 'none',
      cursor: authLoading ? 'not-allowed' : 'pointer',
      boxShadow: authLoading ? 'none' : '0 4px 28px rgba(139,92,246,0.4)',
      width: full ? '100%' : 'auto', maxWidth: 420,
      transition: 'all 0.2s', fontFamily: 'inherit', letterSpacing: '-0.2px', ...s,
    }}>
      {!authLoading && <GoogleIcon />}
      {authLoading ? 'Mengarahkan...' : label}
    </button>
  )

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
            <div style={{ background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Cerita Yuk.</div>
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

        <div style={r(0.05)}>
          <span style={{
            display: 'inline-block', background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 20, padding: '5px 14px', fontSize: '0.75rem', fontWeight: 700,
            color: C.secondary, letterSpacing: '0.3px', marginBottom: 28,
          }}>
            Jujur, bukan cuma manis.
          </span>
        </div>

        <div style={{ ...r(0.15), marginBottom: 28 }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.04em', margin: 0 }}>
            <span style={{ display: 'block' }}>Didengerin Beneran.</span>
            <span style={{ display: 'block', background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Bukan Cuma Diiyain.</span>
          </h1>
        </div>

        <div style={{ ...r(0.3), marginBottom: 36 }}>
          <p style={{ color: C.muted, fontSize: '0.92rem', lineHeight: 1.75, margin: 0 }}>
            Banyak AI curhat cuma bilang "kamu benar kok" ke apa pun yang kamu ceritain.
            Diah Anna beda — dia dengerin dulu, validasi perasaanmu,
            tapi juga jujur kalau ada sisi lain yang perlu kamu lihat.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.92rem', lineHeight: 1.75, margin: '12px 0 0' }}>
            Nggak dihakimi. <strong>Beneran didengerin.</strong> Jam berapa pun, soal apa pun.
          </p>
        </div>

        <div style={{ ...r(0.45), display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <CTAButton />
        </div>

        <div style={r(0.55)}>
          <button
            onClick={() => diahRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '0.84rem', fontWeight: 600, padding: 0, fontFamily: 'inherit', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.2)', textUnderlineOffset: 4 }}
          >
            Kenalan sama Diah Anna ↓
          </button>
        </div>

        <div style={{ ...r(0.65), display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginTop: 28 }}>
          {['Gratis', 'Inget obrolan lamamu', 'Data cuma ada di HP-mu'].map((t, i) => (
            <span key={i} style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', fontWeight: 500 }}>✓ {t}</span>
          ))}
        </div>
      </section>

      <Divider />

      {/* ════════════════════════════════════════════════════════════════════
          MANIFESTO — LIGHT BACKGROUND
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
              Banyak orang nyimpen sendiri...<br />
              hal yang bikin capek pikiran...<br />
              hal yang bikin susah tidur...<br />
              <span style={{ color: C.lightMuted }}>karena bingung mau cerita ke siapa.</span>
            </p>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p style={{ fontSize: '1rem', lineHeight: 1.9, color: `rgba(26,20,32,0.6)`, marginBottom: 32 }}>
              Takut ngerepotin teman.<br />
              Takut dinilai keluarga.<br />
              Nggak enak curhat jam 2 pagi ke siapa pun.
            </p>
          </FadeIn>

          <FadeIn delay={0.15}>
            <p style={{ fontSize: '1rem', lineHeight: 1.8, color: C.lightMuted, marginBottom: 24 }}>
              Padahal yang dibutuhkan sering kali sederhana...
            </p>
            <div style={{ borderLeft: `3px solid ${C.primary}`, paddingLeft: 20, marginBottom: 36 }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, fontStyle: 'italic', lineHeight: 1.7, color: C.lightText, margin: 0 }}>
                "Aku cuma butuh didengerin dulu."
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p style={{ fontSize: '1rem', lineHeight: 1.85, color: C.lightMuted, marginBottom: 28 }}>
              Kami percaya...<br />
              Setiap orang berhak punya ruang aman untuk cerita —
              tapi juga berhak dapat teman yang jujur, bukan yang cuma nurut.
            </p>
            <p style={{ fontSize: '1rem', lineHeight: 1.85, color: C.lightText, fontWeight: 600 }}>
              Kapan pun. Tanpa dihakimi. Tanpa cuma diiyain.
            </p>
          </FadeIn>

          <FadeIn delay={0.25}>
            <div style={{ borderTop: `1px solid ${C.lightBdr}`, marginTop: 48, paddingTop: 40 }}>
              <p style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', color: C.lightText, lineHeight: 1.1, margin: 0 }}>
                Didengerin Beneran.<br />Bukan Cuma Diiyain.
              </p>
            </div>
          </FadeIn>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          DIAH ANNA — Teman Cerita, Bukan Robot Layanan Pelanggan
      ════════════════════════════════════════════════════════════════════ */}
      <section ref={diahRef} style={{ background: C.bg, padding: '72px 24px', maxWidth: 480, margin: '0 auto' }}>

        <FadeIn>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
            <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: `2px solid rgba(139,92,246,0.45)`, boxShadow: '0 0 24px rgba(139,92,246,0.2)' }} />
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>Diah Anna</div>
              <div style={{ color: C.secondary, fontSize: '0.72rem', fontWeight: 600 }}>Teman Curhat AI · Verneks</div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.05}>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.04em', marginBottom: 32, color: '#fff' }}>
            Dengerin Dulu.<br />
            <span style={{ color: C.muted, fontWeight: 500 }}>Baru Nanya, Bukan Nge-judge.</span>
          </h2>
        </FadeIn>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {[
            'Diah Anna itu AI — dia jujur soal itu kalau kamu tanya.',
            'Tapi cara dia dengerin, kamu bakal ngerasa beneran didengar.',
            'Dia nggak buru-buru kasih nasihat. Dia dengerin dulu, baru nanya pelan-pelan.',
            'Dan dia inget cerita-ceritamu — jadi tiap ngobrol nggak mulai dari nol.',
          ].map((text, i) => (
            <FadeIn key={i} delay={i * 0.07}>
              <p style={{ color: i < 2 ? 'rgba(255,255,255,0.8)' : C.muted, fontSize: '0.95rem', lineHeight: 1.75, margin: 0 }}>{text}</p>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.35}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px 20px', marginTop: 36 }}>
            <p style={{ color: C.muted, fontSize: '0.88rem', lineHeight: 1.7, margin: '0 0 12px' }}>
              Diah Anna teman ngobrol yang selalu ada.<br />Bukan pengganti psikolog atau orang-orang di hidupmu.
            </p>
            <p style={{ color: '#fff', fontWeight: 700, fontStyle: 'italic', fontSize: '1rem', lineHeight: 1.65, margin: 0 }}>
              Kalau kamu lagi butuh bantuan yang lebih serius, dia bakal bantu arahin ke tempat yang tepat.
            </p>
          </div>
        </FadeIn>

      </section>

      <Divider />

      {/* ════════════════════════════════════════════════════════════════════
          CARA KERJANYA — 3 langkah
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.lightBg, padding: '72px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <FadeIn>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: C.lightMuted, marginBottom: 8 }}>Cara Kerjanya</p>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.04em', color: C.lightText, lineHeight: 1.15, marginBottom: 48 }}>
              Sesederhana Ngobrol.
            </h2>
          </FadeIn>

          {[
            {
              step: '01', title: 'Buka Chat, Mulai Cerita.',
              body: ['Nggak perlu isi form panjang atau tes kepribadian.', 'Login, langsung ngobrol — soal apa aja yang lagi ada di kepala kamu.', 'Diah Anna siap 24 jam, nggak pernah "lagi sibuk".'],
            },
            {
              step: '02', title: 'Diah Anna Dengerin & Nemenin Mikir.',
              body: ['Dia validasi perasaanmu dulu, bukan langsung ceramah.', 'Kalau kamu butuh sudut pandang lain, dia bantu kamu mikir lebih jernih — bukan mendikte apa yang harus kamu lakukan.', 'Semua dengan bahasa yang santai, kayak ngobrol sama teman.'],
            },
            {
              step: '03', title: 'Dia Makin Kenal Kamu, Datanya Tetap di HP-mu.',
              body: ['Tiap ngobrol, Diah Anna makin ngerti pola dan cerita hidupmu.', 'Tapi semua itu tersimpan lokal di device kamu, bukan di server kami.', 'Mau hapus semua? Satu tombol, langsung bersih.'],
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
                      <p key={j} style={{ fontSize: '0.9rem', lineHeight: 1.8, color: j === 0 ? `rgba(26,20,32,0.75)` : C.lightMuted, margin: j === 0 ? '0 0 8px' : '0 0 6px' }}>{line}</p>
                    ))}
                  </div>
                </div>
              </FadeIn>
              {i < 2 && (
                <FadeIn delay={i * 0.08 + 0.04}>
                  <p style={{ color: `rgba(139,92,246,0.4)`, fontSize: '1.1rem', textAlign: 'left', marginLeft: 28, marginBottom: 0, lineHeight: 1 }}>↓</p>
                </FadeIn>
              )}
            </div>
          ))}

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PRODUCT EXPERIENCE — chat demo
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.bg, padding: '72px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <FadeIn>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>
              Beginilah rasanya ngobrol sama Diah Anna.
            </p>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1.2, marginBottom: 32 }}>
              Kayak chat sama teman.
            </h2>
          </FadeIn>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
            {CHAT_DEMO.slice(0, chatIdx).map((msg, i) => (
              <FadeIn key={i} delay={0}>
                <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 10, alignItems: 'flex-end' }}>
                  {msg.role === 'diah' && (
                    <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: '1.5px solid rgba(139,92,246,0.4)' }} />
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

          <FadeIn delay={0.1}>
            <p style={{ color: C.muted, fontSize: '0.85rem', lineHeight: 1.75, marginBottom: 20 }}>
              Nggak perlu daftar ribet.<br />
              Nggak perlu tau harus mulai dari mana.<br />
              Ketik aja apa yang lagi kamu rasain.
            </p>
            <CTAButton />
          </FadeIn>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          WHY VERNEKS — 4 alasan, LIGHT BG
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.lightBg, padding: '72px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <FadeIn>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.04em', color: C.lightText, lineHeight: 1.15, marginBottom: 48 }}>
              Kenapa Orang Balik Lagi<br />Cerita ke Diah Anna?
            </h2>
          </FadeIn>

          {[
            { emoji: '👂', head: 'Mereka ngerasa didengar.', sub: 'Bukan diceramahin atau disuruh "positive thinking aja".' },
            { emoji: '🎯', head: 'Jujur, bukan sekadar manis.', sub: 'Diah Anna nggak asal ngiyain — kalau perlu, dia kasih sudut pandang lain.' },
            { emoji: '🌙', head: 'Selalu ada, jam berapa pun.', sub: 'Jam 2 pagi overthinking? Diah Anna nggak pernah tidur.' },
            { emoji: '🔒', head: 'Ceritanya aman.', sub: 'Data curhat cuma ada di HP mereka sendiri, nggak ke server siapa pun.' },
            { emoji: '💭', head: 'Diah Anna beneran inget.', sub: 'Cerita minggu lalu, dia masih ingat — nggak mulai dari nol tiap kali.' },
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
              {i < 4 && <div style={{ height: 1, background: C.lightBdr, marginBottom: 32 }} />}
            </FadeIn>
          ))}

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          TESTIMONIALS
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
          PHILOSOPHY — privasi & batasan sehat
      ════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.lightBg, padding: '72px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <FadeIn>
            <h2 style={{ fontSize: '1.9rem', fontWeight: 900, letterSpacing: '-0.04em', color: C.lightText, lineHeight: 1.15, marginBottom: 36 }}>
              Data Kamu<br /><br />Cuma Ada di HP-mu.
            </h2>
          </FadeIn>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              'Cerita yang kamu bagi ke Diah Anna itu personal. Kami percaya itu tetap milikmu — bukan milik server kami.',
              'Makanya chat, hal-hal yang Diah Anna pelajari tentang kamu, semuanya tersimpan langsung di device kamu, bukan di database kami.',
              'Dan kalau suatu saat kamu ngerasa udah cukup dan nggak butuh lagi — hapus semua datamu satu tombol, selesai.',
            ].map((text, i) => (
              <FadeIn key={i} delay={i * 0.07}>
                <p style={{ color: i === 0 ? C.lightMuted : i === 2 ? C.lightText : `rgba(26,20,32,0.7)`, fontSize: '0.95rem', lineHeight: 1.8, margin: 0, fontWeight: i === 2 ? 600 : 400 }}>
                  {text}
                </p>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.25}>
            <div style={{ borderTop: `1px solid ${C.lightBdr}`, marginTop: 40, paddingTop: 32 }}>
              <p style={{ color: C.lightMuted, fontSize: '0.92rem', lineHeight: 1.8, marginBottom: 8 }}>
                Satu hal lagi yang penting buat kami sampaikan jujur —
              </p>
              <p style={{ color: C.lightText, fontSize: '0.92rem', lineHeight: 1.8, fontWeight: 600, margin: 0 }}>
                Diah Anna teman ngobrol yang baik, tapi dia bukan pengganti psikolog, keluarga, atau teman manusia di hidupmu. Kalau kamu sedang menghadapi masa berat, jangan ragu cari bantuan profesional juga.
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
              Bukan Cuma Diiyain.
            </p>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1.15, marginBottom: 12 }}>
              Diah Anna Dengerin Beneran.
            </h2>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.04em', background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.15, marginBottom: 36 }}>
              Cerita Yuk.
            </h2>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p style={{ color: C.muted, fontSize: '0.88rem', lineHeight: 1.8, marginBottom: 28 }}>
              Kamu nggak harus nanggung semuanya sendirian.<br />
              Mulai cerita, kapan pun kamu siap.
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

      {/* ── FAQ TERSEMBUNYI (untuk SEO schema) ── */}
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
            <div style={{ background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '1px' }}>CERITA YUK, NGGAK AKAN DIHAKIMI.</div>
          </div>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.72rem', margin: '0 0 10px' }}>
          Teman curhat AI yang selalu ada — data kamu tetap milikmu.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 12 }}>
          <button onClick={() => navigate('/blog')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>Blog</button>
          <button onClick={() => navigate('/library')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>Panduan</button>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.12)', fontSize: '0.7rem', margin: 0 }}>
          © Verneks · Diah Anna adalah teman ngobrol AI, bukan pengganti bantuan profesional.
        </p>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0B0710; }
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
