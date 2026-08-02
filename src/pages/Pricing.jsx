import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSEO, generateBreadcrumb } from '../seo'

const LYNK_URL = 'http://lynk.id/yudadunya/r3o5ldq5qkex/checkout'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    priceDisplay: 'Gratis',
    period: 'selamanya',
    color: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.10)',
    cta: 'Lanjutkan Gratis',
    ctaStyle: 'ghost',
    features: [
      '15 chat per hari dengan Diah Anna',
      'CV Review (1x/bulan)',
      'ATS Checker (1x/bulan)',
      'Mock Interview (1x/bulan)',
      'CV Maker AI (1x/bulan)',
    ],
    locked: [
      'Chat reset tiap tengah malam, fitur reset tiap awal bulan',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    priceDisplay: 'Rp 99rb',
    priceOri: 'Rp 599rb',
    period: 'akses 1 bulan',
    color: 'rgba(37,211,102,0.07)',
    border: 'rgba(37,211,102,0.4)',
    cta: '🚀 Mulai Premium — Hemat 67%',
    ctaStyle: 'green',
    badge: '⭐ PALING WORTH IT',
    features: [
      'Chat unlimited dengan Diah Anna',
      'CV Review unlimited',
      'ATS Checker unlimited',
      'Mock Interview unlimited',
      'CV Maker AI unlimited',
      'Career GPS personal (roadmap 6 bulan)',
      'Progress tracking harian',
      'Weekly coaching report',
    ],
  },
]

const FAQ = [
  { q: 'Bisa cancel kapan saja?', a: 'Bisa. Tidak ada komitmen jangka panjang. Batalkan sebelum tanggal perpanjangan dan kamu tidak ditagih lagi.' },
  { q: 'Cara bayar gimana?', a: 'Pembayaran lewat Lynk.id — bisa GoPay, OVO, Dana, QRIS, transfer bank, atau kartu kredit/debit.' },
  { q: 'Apakah data CV saya aman?', a: 'Ya. CV dan percakapan kamu tidak disimpan untuk keperluan apapun selain memproses permintaanmu.' },
  { q: 'Bedanya Free dan Premium apa?', a: 'Free cukup untuk coba semua fitur dengan batasan 15 chat per hari. Premium untuk yang serius cari kerja — semua fitur unlimited, plus Career GPS dan progress tracking.' },
  { q: 'Kuota Free reset kapan?', a: 'Chat 15x/hari reset setiap tengah malam (00:00 WIB). Kuota fitur (CV Review, ATS, Interview, CV Maker) masing-masing 1x reset setiap awal bulan.' },
]

export default function Pricing({ user }) {
  const navigate = useNavigate()
  const [openFaq, setOpenFaq] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => { setTimeout(() => setVisible(true), 60) }, [])

  useSEO({
    title: 'Harga & Paket Verneks Premium',
    description: 'Verneks Premium Rp99.000 sekali bayar — akses penuh 30 hari: coaching unlimited, CV Review, ATS Check, Mock Interview, dan roadmap karir personal bersama Diah Anna.',
    path: '/pricing',
    breadcrumb: generateBreadcrumb([{ name: 'Harga', path: '/pricing' }]),
    faq: FAQ.map(item => ({ question: item.q, answer: item.a })),
  })

  const handleCta = (plan) => {
    if (plan.id === 'free') return navigate('/chat')
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
            <span style={{ color: '#25D366', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.3px' }}>Harga spesial launch</span>
          </div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.5px', lineHeight: 1.2, marginBottom: 8 }}>
            Pilih paket yang<br/>
            <span style={{ background: 'linear-gradient(90deg, #25D366, #34B7F1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tepat buatmu</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', lineHeight: 1.6 }}>
            Coba dulu gratis. Upgrade kalau sudah siap<br/>ngegas karir tanpa batas.
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
          <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.82rem', marginBottom: 10 }}>💡 Bandingin sama career coach konvensional:</div>
          {[
            { label: 'Sesi career coach 1 jam', price: 'Rp 500rb–1jt' },
            { label: 'Review CV profesional', price: 'Rp 150rb–300rb' },
            { label: 'Kursus mock interview', price: 'Rp 300rb–500rb' },
            { label: 'Verneks Premium/bulan', price: 'Rp 99rb', highlight: true },
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
