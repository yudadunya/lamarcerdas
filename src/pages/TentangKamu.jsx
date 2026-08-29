import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSummary, getTopRsiPatterns, getGenome } from '../lib/localMemory'

// ── Label & warna trait — sama seperti yang dipakai Discovery.jsx, biar
// konsisten kalau user pernah selesai Discovery dan datanya somehow ada.
const GENOME_MAP = {
  analytical:    { label: 'Self-Awareness',   color: '#8B5CF6' },
  leadership:    { label: 'Resilience',       color: '#F48FB1' },
  builder:       { label: 'Coping Kreatif',   color: '#8B5CF6' },
  creator:       { label: 'Keterbukaan',      color: '#FFB74D' },
  communication: { label: 'Komunikasi Emosi', color: '#CE93D8' },
  risk_taking:   { label: 'Empati',           color: '#EF9A9A' },
}

const RSI_TYPE_LABELS = {
  emotional_pattern:   'Pola Emosi',
  communication_style: 'Gaya Komunikasi',
  recurring_topic:     'Tema Berulang',
  umum:                'Pola Umum',
}

export default function TentangKamu({ user, loading = false }) {
  const navigate = useNavigate()
  const [summary, setSummary]   = useState(null)
  const [patterns, setPatterns] = useState([])
  const [genome, setGenome]     = useState(null)
  const [ready, setReady]       = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) { navigate('/'); return }

    Promise.all([getSummary(), getTopRsiPatterns(8), getGenome()])
      .then(([s, p, g]) => {
        setSummary(s || null)
        setPatterns(p || [])
        setGenome(g)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [user?.id, loading])

  if (!user || !ready) return null

  const isEmpty = !summary && patterns.length === 0 && !genome

  return (
    <div style={{ minHeight: '100vh', background: '#14101B', paddingBottom: '60px' }}>
      <div style={{
        padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(20,16,27,0.92)', backdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => navigate('/chat')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1.2rem', cursor: 'pointer', padding: 0 }}
        >
          ←
        </button>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>💭 Tentang Kamu</div>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

        {isEmpty ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '2rem', marginBottom: 14 }}>🌱</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', marginBottom: 8 }}>
              Belum ada yang bisa ditunjukkan
            </div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: 20 }}>
              Halaman ini keisi otomatis makin sering kamu cerita ke Diah Anna. Yuk ngobrol dulu.
            </div>
            <button
              onClick={() => navigate('/chat')}
              style={{ padding: '11px 26px', background: 'linear-gradient(135deg,#8B5CF6,#FB7185)', color: '#fff', fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Cerita ke Diah Anna →
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', lineHeight: 1.6, marginBottom: 24 }}>
              Semua ini disimpan lokal di HP/laptopmu — bukan di server kami.
            </p>

            {/* Ringkasan */}
            {summary && (
              <div style={{
                background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                borderRadius: 16, padding: '18px', marginBottom: 20,
              }}>
                <div style={{ color: '#C4B5FD', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 10 }}>
                  Apa yang Diah Anna Tau Soal Kamu
                </div>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
                  {summary}
                </p>
              </div>
            )}

            {/* Trait / genome — cuma tampil kalau user pernah selesai Discovery */}
            {genome && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 10 }}>
                  Pola Diri
                </div>
                {Object.entries(GENOME_MAP).map(([key, meta]) => {
                  const val = genome[key] || 0
                  if (!val) return null
                  return (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                        <span style={{ color: 'rgba(255,255,255,0.75)' }}>{meta.label}</span>
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>{val}</span>
                      </div>
                      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${val}%`, background: meta.color, borderRadius: 999 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* RSI patterns */}
            {patterns.length > 0 && (
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 10 }}>
                  Pola yang Mulai Kelihatan
                </div>
                {patterns.map((p, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12, padding: '13px 15px', marginBottom: 8,
                  }}>
                    <div style={{ color: '#C4B5FD', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 4 }}>
                      {RSI_TYPE_LABELS[p.type] || p.type}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                      {p.description}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 28, textAlign: 'center' }}>
              <button
                onClick={() => navigate('/refleksi')}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', padding: '11px 24px', borderRadius: 10, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
              >
                📔 Buka Jurnal Refleksi
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
