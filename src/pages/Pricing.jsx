import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSEO, generateBreadcrumb } from '../seo'

const LYNK_URL = 'http://lynk.id/yudadunya/r3o5ldq5qkex/checkout'

const PLANS = [
  {
    id: 'trial',
    name: '30 Hari Pertama',
    priceDisplay: 'Gratis',
    period: 'otomatis aktif saat daftar',
    color: 'rgba(37,211,102,0.07)',
    border: 'rgba(37,211,102,0.4)',
    cta: 'Daftar & Mulai Gratis',
    ctaStyle: 'green',
    badge: '⭐ OTOMATIS AKTIF',
    features: [
      'Semua fitur Premium, full akses — bukan versi terbatas',
      'Chat unlimited dengan Diah Anna, kapan saja',
      'Personalisasi lebih dalam — Diah Anna makin "kenal" pola & kebiasaanmu',
      'Ringkasan & insight mingguan dari obrolanmu',
      'Akses penuh semua panduan self-care premium',
    ],
    locked: [
      'Nggak perlu kartu kredit buat mulai',
    ],
  },
  {
    id: 'premium',
    name: 'Setelah 30 Hari',
    priceDisplay: 'Rp 99rb',
    period: 'per 30 hari, kalau mau lanjut',
    color: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.10)',
    cta: '🚀 Lanjutkan Premium',
    ctaStyle: 'ghost',
    features: [
      'Semua fitur Premium tetap lanjut tanpa putus',
      'Kalau nggak lanjut bayar, otomatis turun ke Free — 15 chat/hari, tetap bisa curhat',
      'Bisa batal kapan saja, nggak ada komitmen jangka panjang',
    ],
  },
]

const FAQ = [
  { q: 'Trial 30 hari-nya beneran gratis?', a: 'Ya. Begitu kamu daftar, akun kamu otomatis dapat semua fitur Premium selama 30 hari — nggak perlu kartu kredit atau bayar di muka.' },
  { q: 'Setelah 30 hari, apa yang terjadi?', a: 'Kalau kamu nggak lanjut bayar Rp99rb/30 hari, akun kamu otomatis turun ke Free (15 chat/hari) — bukan diblokir. Curhat tetap bisa jalan.' },
  { q: 'Bisa cancel kapan saja?', a: 'Bisa. Tidak ada komitmen jangka panjang. Batalkan sebelum tanggal perpanjangan dan kamu tidak ditagih lagi.' },
  { q: 'Cara bayar gimana?', a: 'Pembayaran lewat Lynk.id — bisa GoPay, OVO, Dana, QRIS, transfer bank, atau kartu kredit/debit.' },
  { q: 'Apakah data curhatanku aman?', a: 'Ya. Chat dan cerita kamu tersimpan di device kamu sendiri, bukan di server kami, dan tidak dipakai untuk keperluan lain selain menjawab kamu.' },
]

export default function Pricing({ user }) {
  const navigate = useNavigate()
  const [openFaq, setOpenFaq] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => { setTimeout(() => setVisible(true), 60) }, [])

  useSEO({
    title: 'Harga & Paket Verneks Premium',
    description: 'Verneks — daftar gratis, langsung dapat 30 hari akses Premium penuh: chat unlimited dengan Diah Anna buat overthinking, kesehatan mental, hubungan, dan self-care. Setelah itu Rp99.000/30 hari kalau mau lanjut.',
    path: '/pricing',
    breadcrumb: generateBreadcrumb([{ name: 'Harga', path: '/pricing' }]),
    faq: FAQ.map(item => ({ question: item.q, answer: item.a })),
  })

  const handleCta = (plan) => {
    if (plan.id === 'trial') return navigate(user ? '/chat' : '/login')
    // Premium → langsung ke Lynk
    window.open(LYNK_URL, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0f0d', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", overflowX: 'hidden' }}>

      {/* Ambient */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,211,102,0.15) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '20%', left: '-40px', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,183,241,0.1) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      </div>

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => navigate('/chat')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1.5rem', cursor: 'pointer', padding: '0 12px 0 0', lineHeight: 1 }}>‹</button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Paket & Harga</span>
      </div>

      <div style={{
        position: 'relative', zIndex: 5, padding: '28px 18px 60px',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(12px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}>

        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: 20, padding: '4px 12px', marginBottom: 14 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#25D366', display: 'inline-block' }} />
            <span style={{ color: '#25D366', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.3px' }}>30 hari pertama gratis penuh</span>
          </div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.5px', lineHeight: 1.2, marginBottom: 8 }}>
            Pilih paket yang<br/>
            <span style={{ background: 'linear-gradient(90deg, #25D366, #34B7F1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tepat buatmu</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', lineHeight: 1.6 }}>
            Daftar sekarang, langsung dapat Premium penuh<br/>30 hari — nggak perlu bayar di muka.
          </p>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
          {PLANS.map((plan, i) => (
            <div key={plan.id} style={{
              background: plan.color,
              border: `1.5px solid ${plan.border}`,
              borderRadius: 18,
              overflow: 'hidden',
              opacity: visible ? 1 : 0,
              transform: visible ? 'none' : 'translateY(10px)',
              transition: `opacity 0.4s ease ${i * 0.1}s, transform 0.4s ease ${i * 0.1}s`,
            }}>
              {plan.badge && (
                <div style={{ background: 'linear-gradient(90deg, #25D366, #128C7E)', color: '#fff', textAlign: 'center', padding: '5px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px' }}>
                  {plan.badge}
                </div>
              )}

              <div style={{ padding: '18px' }}>
                {/* Name & price */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', marginBottom: 2 }}>{plan.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem' }}>{plan.period}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.5px', lineHeight: 1 }}>{plan.priceDisplay}</div>
                    {plan.priceOri && (
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', textDecoration: 'line-through', marginTop: 2 }}>{plan.priceOri}</div>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
                  {plan.features.map((f, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ color: '#25D366', fontWeight: 700, flexShrink: 0, fontSize: '0.82rem', marginTop: 1 }}>✓</span>
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', lineHeight: 1.4 }}>{f}</span>
                    </div>
                  ))}
                  {plan.locked?.map((f, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0, fontSize: '0.82rem', marginTop: 1 }}>–</span>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', lineHeight: 1.4 }}>{f}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => handleCta(plan)}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                    fontWeight: 700, fontSize: '0.9rem',
                    background: plan.ctaStyle === 'green'
                      ? 'linear-gradient(135deg, #25D366, #128C7E)'
                      : 'rgba(255,255,255,0.07)',
                    color: plan.ctaStyle === 'ghost' ? 'rgba(255,255,255,0.55)' : '#fff',
                    cursor: 'pointer',
                    boxShadow: plan.ctaStyle === 'green' ? '0 4px 16px rgba(37,211,102,0.3)' : 'none',
                  }}
                >
                  {plan.cta}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Payment info */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 16px', marginBottom: 28, textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Pembayaran aman via Lynk.id</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>GoPay · OVO · Dana · QRIS · Transfer Bank · Kartu Kredit</div>
        </div>

        {/* Value comparison */}
        <div style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.15)', borderRadius: 14, padding: '16px', marginBottom: 28 }}>
          <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.82rem', marginBottom: 10 }}>💡 Bandingin sama konseling konvensional:</div>
          {[
            { label: 'Sesi konseling/psikolog 1x', price: 'Rp 300rb–600rb' },
            { label: 'Sesi terapi lanjutan/bulan (4x)', price: 'Rp 1,2jt–2,4jt' },
            { label: 'Verneks Premium/bulan, unlimited', price: 'Rp 99rb', highlight: true },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: item.highlight ? '#fff' : 'rgba(255,255,255,0.45)', fontSize: '0.8rem', fontWeight: item.highlight ? 700 : 400 }}>{item.label}</span>
              <span style={{ color: item.highlight ? '#25D366' : 'rgba(255,255,255,0.3)', fontSize: '0.8rem', fontWeight: item.highlight ? 800 : 400 }}>{item.price}</span>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>Pertanyaan umum</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FAQ.map((item, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ width: '100%', background: 'none', border: 'none', padding: '13px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ color: '#fff', fontSize: '0.83rem', fontWeight: 600, flex: 1, paddingRight: 8 }}>{item.q}</span>
                  <span style={{ color: '#25D366', fontSize: '1rem', transition: 'transform 0.2s', transform: openFaq === i ? 'rotate(45deg)' : 'none', flexShrink: 0 }}>+</span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: '0 16px 13px', color: 'rgba(255,255,255,0.5)', fontSize: '0.81rem', lineHeight: 1.6 }}>
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
