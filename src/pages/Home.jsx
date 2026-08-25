import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSEO, generateBreadcrumb } from '../seo'

// ─── BRAND TOKENS — mengikuti mark biru-ungu Verneks ──────────────────────────
const C = {
  primary:   '#6745E8',
  secondary: '#22A8F2',
  purple:    '#8D76F4',
  blue:      '#22A8F2',
  grad:      'linear-gradient(135deg, #6745E8 0%, #22A8F2 100%)',
  bg:        '#08111F',
  surface:   'rgba(103,69,232,0.10)',
  border:    'rgba(91,126,239,0.28)',
  text:      '#fff',
  muted:     'rgba(255,255,255,0.5)',
  faint:     'rgba(255,255,255,0.06)',
  lightBg:   '#F5F8FE',
  lightText: '#111E34',
  lightMuted:'rgba(17,30,52,0.58)',
  lightBdr:  'rgba(17,30,52,0.10)',
}

// ─── SEO DATA ─────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'Apakah Verneks gratis?', a: 'Ya. Kamu bisa mulai ngobrol dengan Diah Anna secara gratis.' },
  { q: 'Apakah Diah Anna akan selalu membenarkan ceritaku?', a: 'Tidak. Dia akan mengakui perasaanmu terlebih dahulu, lalu membantu melihat situasi dari sudut pandang lain jika itu berguna.' },
  { q: 'Apa yang terjadi pada data percakapanku?', a: 'Riwayat chat dan memori percakapan disimpan di perangkatmu. Saat kamu mengirim pesan, teksnya diproses sementara oleh layanan AI agar Diah Anna bisa menjawab, dan tidak disimpan permanen di database server.' },
  { q: 'Apakah Diah Anna pengganti psikolog atau terapis?', a: 'Bukan. Diah Anna adalah teman cerita AI, bukan pengganti psikolog, terapis, dokter, keluarga, atau teman manusia. Untuk masalah yang terasa berat, cari bantuan profesional.' },
  { q: 'Kapan Verneks cocok buatku?', a: 'Saat kamu membutuhkan ruang untuk bercerita, menata pikiran, atau melihat masalah dari sudut pandang lain.' },
  { q: 'Bagaimana jika aku sedang dalam bahaya atau krisis?', a: 'Diah Anna bukan layanan darurat. Jika kamu atau orang lain berada dalam bahaya, hubungi layanan darurat setempat atau orang yang kamu percaya sekarang juga.' },
]

// ─── CHAT DEMO ────────────────────────────────────────────────────────────────
const CHAT_DEMO = [
  { role: 'user', text: 'Anna, hari ini capek banget. Rasanya semua yang aku kerjain salah.' },
  { role: 'diah', text: 'Kedengarannya hari ini benar-benar menguras kamu. Ngerasa usaha kita nggak ada hasilnya memang bikin berat. Kamu mau cerita soal kejadian yang paling kepikiran, atau mau aku temani dulu tanpa buru-buru cari solusi?' },
  { role: 'user', text: 'Bos aku marah di depan tim gara-gara hal kecil. Aku sudah berusaha maksimal.' },
  { role: 'diah', text: 'Wajar kalau itu bikin kamu malu dan kecewa, apalagi kamu sudah berusaha. Kejadian itu tidak otomatis berarti kemampuanmu kurang. Kamu ingin membahas apa yang bisa dilakukan setelah ini, atau masih ingin mengeluarkan unek-uneknya dulu?' },
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
    title: 'Verneks | Kepalamu Lagi Penuh? Cerita Saja.',
    description: 'Kepalamu lagi penuh? Cerita saja ke Diah Anna. Teman cerita AI yang mendengarkan tanpa menghakimi dan membantu kamu menata pikiran. Mulai ngobrol gratis.',
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
  const CTAButton = ({ label = 'Mulai ngobrol gratis', full = true, style: s = {} }) => (
    <button onClick={handleCTA} disabled={authLoading} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      background: authLoading ? 'rgba(103,69,232,0.25)' : C.grad,
      color: '#fff', fontWeight: 800, fontSize: '0.95rem',
      padding: '15px 24px', borderRadius: 14, border: 'none',
      cursor: authLoading ? 'not-allowed' : 'pointer',
      boxShadow: authLoading ? 'none' : '0 4px 28px rgba(63,116,236,0.38)',
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
            TEMAN CERITA AI YANG MAU MENDENGAR
          </span>
        </div>

        <div style={{ ...r(0.15), marginBottom: 28 }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.04em', margin: 0 }}>
            <span style={{ display: 'block' }}>Kepalamu lagi penuh?</span>
            <span style={{ display: 'block', background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Cerita saja ke Diah Anna.</span>
          </h1>
        </div>

        <div style={{ ...r(0.3), marginBottom: 36 }}>
          <p style={{ color: C.muted, fontSize: '0.92rem', lineHeight: 1.75, margin: 0 }}>
            Tidak semua hal harus langsung diselesaikan. Kadang, kamu hanya perlu tempat
            untuk mengeluarkan isi kepala dan didengar dengan tenang.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.92rem', lineHeight: 1.75, margin: '12px 0 0' }}>
            Diah Anna mendengarkan, membantu menata pikiran, lalu memberi sudut pandang
            yang jujur saat kamu menginginkannya.
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
            Kenalan dengan Diah Anna ↓
          </button>
        </div>

        <div style={{ ...r(0.65), display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginTop: 28 }}>
          {['Gratis untuk mulai', 'Tidak menghakimi', 'Riwayat chat di perangkatmu*'].map((t, i) => (
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
              UNTUK HARI-HARI YANG TERASA BERAT
            </p>
          </FadeIn>

          <FadeIn delay={0.05}>
            <p style={{ fontSize: '1.1rem', fontWeight: 500, lineHeight: 1.9, color: C.lightText, marginBottom: 32 }}>
              Ada hari ketika kamu terlihat baik-baik saja,
              padahal kepalamu tidak berhenti bekerja.<br />
              Kamu ingin cerita, tetapi tidak tahu harus mulai dari mana.
            </p>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p style={{ fontSize: '1rem', lineHeight: 1.9, color: `rgba(26,20,32,0.6)`, marginBottom: 32 }}>
              Mungkin kamu takut merepotkan teman.
              Mungkin kamu lelah menjelaskan hal yang sama.
              Atau mungkin kamu hanya ingin didengarkan tanpa langsung diberi ceramah.
            </p>
          </FadeIn>

          <FadeIn delay={0.15}>
            <p style={{ fontSize: '1rem', lineHeight: 1.8, color: C.lightMuted, marginBottom: 24 }}>
              Kadang, yang kamu butuhkan hanya satu hal:
            </p>
            <div style={{ borderLeft: `3px solid ${C.primary}`, paddingLeft: 20, marginBottom: 36 }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, fontStyle: 'italic', lineHeight: 1.7, color: C.lightText, margin: 0 }}>
                "Aku tidak selalu butuh jawaban. Aku butuh tempat untuk mulai bicara."
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p style={{ fontSize: '1rem', lineHeight: 1.85, color: C.lightMuted, marginBottom: 28 }}>
              Di Verneks, kamu boleh datang apa adanya.
              Diah Anna membantu mengurai isi kepalamu, kemudian memberi perspektif jujur saat kamu menginginkannya.
            </p>
            <p style={{ fontSize: '1rem', lineHeight: 1.85, color: C.lightText, fontWeight: 600 }}>
              Pelan-pelan juga tetap berarti.
            </p>
          </FadeIn>

          <FadeIn delay={0.25}>
            <div style={{ borderTop: `1px solid ${C.lightBdr}`, marginTop: 48, paddingTop: 40 }}>
              <p style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', color: C.lightText, lineHeight: 1.1, margin: 0 }}>
                Cerita dulu.<br />Pikirkan sisanya pelan-pelan.
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
            <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: `2px solid rgba(91,126,239,0.48)`, boxShadow: '0 0 24px rgba(52,133,240,0.22)' }} />
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>Diah Anna</div>
              <div style={{ color: C.secondary, fontSize: '0.72rem', fontWeight: 600 }}>Teman cerita AI · Verneks</div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.05}>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.04em', marginBottom: 32, color: '#fff' }}>
            Dengar dulu.<br />
            <span style={{ color: C.muted, fontWeight: 500 }}>Pahami dulu. Baru cari langkah.</span>
          </h2>
        </FadeIn>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {[
            'Diah Anna adalah AI, dan dia terbuka soal itu. Dia tidak berpura-pura menjadi manusia.',
            'Kamu boleh menyelesaikan ceritamu dulu. Dia akan mendengarkan dan bertanya seperlunya agar kamu merasa dipahami.',
            'Kalau kamu ingin, dia membantu memisahkan apa yang kamu rasakan, apa yang terjadi, dan langkah apa yang mungkin kamu ambil.',
            'Keputusan tetap milikmu. Diah Anna membantu kamu berpikir lebih jernih, bukan mengambil alih hidupmu.',
          ].map((text, i) => (
            <FadeIn key={i} delay={i * 0.07}>
              <p style={{ color: i < 2 ? 'rgba(255,255,255,0.8)' : C.muted, fontSize: '0.95rem', lineHeight: 1.75, margin: 0 }}>{text}</p>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.35}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px 20px', marginTop: 36 }}>
            <p style={{ color: C.muted, fontSize: '0.88rem', lineHeight: 1.7, margin: '0 0 12px' }}>
              Diah Anna adalah teman cerita, bukan pengganti psikolog, terapis, keluarga, atau teman manusia di hidupmu.
            </p>
            <p style={{ color: '#fff', fontWeight: 700, fontStyle: 'italic', fontSize: '1rem', lineHeight: 1.65, margin: 0 }}>
              Kalau kamu merasa tidak aman atau membutuhkan pertolongan segera, hubungi orang tepercaya atau layanan darurat setempat.
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
            <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: C.lightMuted, marginBottom: 8 }}>Cara kerja</p>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.04em', color: C.lightText, lineHeight: 1.15, marginBottom: 48 }}>
              Tidak perlu tahu harus mulai dari mana.
            </h2>
          </FadeIn>

          {[
            {
              step: '01', title: 'Buka chat dan datang apa adanya.',
              body: ['Tidak perlu mengisi form panjang atau menyiapkan cerita yang sempurna.', 'Masuk, lalu tulis apa pun yang sedang memenuhi pikiranmu.', 'Satu kalimat sudah cukup untuk memulai.'],
            },
            {
              step: '02', title: 'Diah Anna memberi ruang.',
              body: ['Dia mendengarkan dan mengakui perasaanmu sebelum membahas solusi.', 'Kalau kamu ingin, dia membantu melihat situasi dengan lebih jernih dan mempertimbangkan pilihanmu.', 'Semuanya dengan bahasa yang santai dan mudah dipahami.'],
            },
            {
              step: '03', title: 'Lanjutkan saat kamu siap.',
              body: ['Konteks obrolan dapat disimpan di perangkatmu agar percakapan terasa lebih nyambung.', 'Pesan diproses sementara lewat layanan AI agar Diah Anna bisa menjawab.', 'Kamu dapat menghapus data lokal kapan saja.'],
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
                  <p style={{ color: `rgba(91,126,239,0.52)`, fontSize: '1.1rem', textAlign: 'left', marginLeft: 28, marginBottom: 0, lineHeight: 1 }}>↓</p>
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
              CONTOH OBROLAN
            </p>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1.2, marginBottom: 32 }}>
              Kalimat kecil bisa membuka ruang yang besar.
            </h2>
          </FadeIn>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
            {CHAT_DEMO.slice(0, chatIdx).map((msg, i) => (
              <FadeIn key={i} delay={0}>
                <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 10, alignItems: 'flex-end' }}>
                  {msg.role === 'diah' && (
                    <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: '1.5px solid rgba(91,126,239,0.48)' }} />
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
              Tidak perlu menunggu tahu solusinya.<br />
              Tulis saja apa yang paling terasa sekarang.<br />
              Diah Anna akan menanggapi dari sana.
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
              Yang membuat obrolan terasa berbeda.
            </h2>
          </FadeIn>

            {[
             { emoji: '👂', head: 'Kamu tidak perlu pura-pura kuat.', sub: 'Datang apa adanya. Tidak perlu menyiapkan cerita yang rapi atau terlihat baik-baik saja.' },
             { emoji: '🎯', head: 'Empati tanpa kehilangan kejujuran.', sub: 'Diah Anna mengakui perasaanmu, lalu membantu melihat sisi lain saat kamu membutuhkannya.' },
             { emoji: '🌙', head: 'Ada saat kamu butuh ruang.', sub: 'Pagi, malam, atau di tengah hari yang terasa berat. Kamu bisa mulai kapan saja.' },
             { emoji: '🔒', head: 'Riwayat chat tersimpan lokal.', sub: 'Percakapanmu disimpan di perangkatmu. Pesan diproses sementara agar AI bisa menjawab.' },
             { emoji: '💭', head: 'Tidak mulai dari nol.', sub: 'Konteks yang tersimpan membantu kamu melanjutkan obrolan tanpa mengulang semuanya.' },
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
              Ceritamu personal.<br /><br />Kendalinya tetap di tanganmu.
            </h2>
          </FadeIn>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              'Riwayat chat, ringkasan, dan hal-hal yang Diah Anna ingat tentangmu disimpan di perangkatmu menggunakan penyimpanan lokal.',
              'Agar bisa membalas, pesanmu diproses sementara oleh layanan AI. Isi chat tidak disimpan permanen di database server.',
              'Mau menghapusnya? Kamu bisa menghapus data lokal kapan saja dari perangkatmu.',
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
                Satu hal penting yang perlu kami sampaikan dengan jujur —
              </p>
              <p style={{ color: C.lightText, fontSize: '0.92rem', lineHeight: 1.8, fontWeight: 600, margin: 0 }}>
                Diah Anna adalah teman ngobrol AI, bukan pengganti psikolog, terapis, dokter, keluarga, atau teman manusia. Kalau situasimu terasa terlalu berat atau mendesak, hubungi orang tepercaya atau cari bantuan profesional.
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
              KALAU SUDAH SIAP, MULAI PELAN-PELAN
            </p>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1.15, marginBottom: 12 }}>
              Tidak perlu menunggu lebih kuat.
            </h2>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.04em', background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.15, marginBottom: 36 }}>
              Kamu boleh cerita sekarang.
            </h2>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p style={{ color: C.muted, fontSize: '0.88rem', lineHeight: 1.8, marginBottom: 28 }}>
              Satu kalimat saja sudah cukup untuk memulai.<br />
              Sisanya bisa menyusul pelan-pelan.
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

      {/* ── FAQ (juga menjadi sumber FAQ schema SEO) ── */}
      <section style={{ padding: '0 24px 48px', maxWidth: 480, margin: '0 auto' }}>
        <p style={{ color: C.muted, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 18px' }}>
          Pertanyaan umum
        </p>
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
            <div style={{ background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '1px' }}>CERITA YUK, PELAN-PELAN SAJA.</div>
          </div>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.72rem', margin: '0 0 10px' }}>
          Teman cerita AI untuk hari-hari ketika kepalamu terasa penuh.
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
         body { background: #08111F; }
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
