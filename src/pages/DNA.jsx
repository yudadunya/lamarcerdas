import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
// Subscription/plan sekarang datang dari prop (di-lift ke App.jsx) — lihat komentar di App.jsx.
import BottomNav from '../components/BottomNav'

// ─── DATA MAPS ────────────────────────────────────────────────────────────────
// PIVOT: dulu "Career Genome" (6 trait karier). Sekarang "Trait Diri Kamu" —
// 6 trait self-awareness & emosional. Key JSON/kolom Supabase SENGAJA dibiarkan
// sama seperti sebelumnya (analytical/leadership/builder/creator/communication/
// risk_taking) supaya tidak perlu migrasi skema database — cuma label & makna
// tampilannya yang berubah. Lihat api/compute-genome.js untuk sisi AI-nya.
const GENOME_MAP = [
  { key: 'analytical',    label: 'Self-Awareness',   emoji: '🧠', color: '#34B7F1', desc: 'Paham pola pikir & emosi diri sendiri' },
  { key: 'leadership',    label: 'Resilience',       emoji: '🌱', color: '#F48FB1', desc: 'Mampu bangkit lagi meski lagi berat' },
  { key: 'builder',       label: 'Coping Kreatif',   emoji: '⚙️', color: '#25D366', desc: 'Mengelola emosi lewat aktivitas & tindakan' },
  { key: 'creator',       label: 'Keterbukaan',      emoji: '🌤️', color: '#FFB74D', desc: 'Terbuka mencoba cara pandang baru' },
  { key: 'communication', label: 'Komunikasi Emosi', emoji: '💬', color: '#CE93D8', desc: 'Bisa ungkapin perasaan dengan kata-kata' },
  { key: 'risk_taking',   label: 'Empati',           emoji: '💗', color: '#EF9A9A', desc: 'Peka sama perasaan diri sendiri & orang lain' },
]

const INSIGHT_MAP = {
  analytical:    'Self-awareness kamu udah cukup tajam. Kamu tipe yang bisa ngenalin pola pikirmu sendiri kalau dikasih ruang buat mikir — coba biasain journaling atau nulis apa yang kamu rasain, itu bakal makin najemin insight yang udah kamu punya.',
  leadership:    'Resilience kamu menonjol. Meski lagi berat, kamu tetap punya cara buat bangkit lagi. Yang perlu dijaga: jangan cuma "tahan aja" tanpa benar-benar memproses perasaan yang ada.',
  builder:       'Kamu tipe yang lega kalau perasaannya disalurkan lewat aktivitas nyata — olahraga, beberes, bikin sesuatu pakai tangan. Coping lewat aksi ini bagus, asal jangan jadi cara buat lari dari perasaan yang sebenarnya perlu diakui dulu.',
  creator:       'Kamu terbuka lihat masalah dari sudut pandang baru, dan itu modal besar buat berubah. Coba eksplorasi cara ekspresi yang kreatif — nulis, gambar, atau apapun yang bikin perasaanmu punya bentuk.',
  communication: 'Kamu punya kemampuan buat ngomongin perasaan dengan kata-kata, dan itu nggak semua orang bisa. Manfaatin ini buat cerita ke orang yang kamu percaya, bukan cuma dipendam sendiri.',
  risk_taking:   'Empatimu tinggi — kamu peka sama perasaan diri sendiri maupun orang lain. Yang perlu diinget: kepekaan ke orang lain jangan sampai bikin kamu lupa kasih perhatian yang sama ke diri sendiri.',
}

// Nilai yang Kamu Jaga — berdasarkan top trait
const VALUES_MAP = {
  analytical:    [{ emoji: '🔍', label: 'Memahami Diri' }, { emoji: '📓', label: 'Refleksi' }, { emoji: '💡', label: 'Kejelasan' }, { emoji: '🧩', label: 'Memahami Pola' }],
  leadership:    [{ emoji: '🌱', label: 'Bangkit Lagi' }, { emoji: '💪', label: 'Ketahanan' }, { emoji: '🎯', label: 'Konsistensi' }, { emoji: '🕊️', label: 'Ketenangan' }],
  builder:       [{ emoji: '⚡', label: 'Aksi Nyata' }, { emoji: '🛠️', label: 'Rutinitas' }, { emoji: '📈', label: 'Progres' }, { emoji: '🧘', label: 'Grounding' }],
  creator:       [{ emoji: '✨', label: 'Ekspresi Diri' }, { emoji: '🎨', label: 'Kreativitas' }, { emoji: '🌈', label: 'Perspektif Baru' }, { emoji: '🌱', label: 'Bertumbuh' }],
  communication: [{ emoji: '🤝', label: 'Keterhubungan' }, { emoji: '💬', label: 'Keterbukaan' }, { emoji: '❤️', label: 'Kejujuran Emosi' }, { emoji: '👂', label: 'Didengarkan' }],
  risk_taking:   [{ emoji: '💗', label: 'Empati' }, { emoji: '🤲', label: 'Kepedulian' }, { emoji: '🌍', label: 'Kepekaan' }, { emoji: '🫂', label: 'Kehangatan' }],
}

// Gaya Coping berdasarkan trait scores
function getCopingStyle(scores) {
  if (!scores) return [{ label: 'Fleksibel', emoji: '🔄', desc: 'Belum ada pola coping yang menonjol' }]
  const rules = [
    { key: 'analytical',    threshold: 55, label: 'Reflektif',           emoji: '📓', desc: 'Paling lega kalau bisa nulis/mikirin dulu sendirian' },
    { key: 'communication', threshold: 55, label: 'Cerita ke Orang',     emoji: '🗣️', desc: 'Lega kalau udah diomongin ke orang yang dipercaya' },
    { key: 'builder',       threshold: 55, label: 'Coping via Aksi',     emoji: '⚙️', desc: 'Lega kalau nyalurin perasaan lewat aktivitas/gerak' },
    { key: 'leadership',    threshold: 55, label: 'Bangkit Cepat',       emoji: '🌱', desc: 'Cenderung cepat menata diri lagi setelah goyah' },
    { key: 'creator',       threshold: 55, label: 'Ekspresif',           emoji: '🎨', desc: 'Butuh ruang buat mengekspresikan perasaan secara kreatif' },
    { key: 'risk_taking',   threshold: 55, label: 'Sensitif ke Sekitar', emoji: '💗', desc: 'Gampang kepengaruh suasana hati orang di sekitarnya' },
  ]
  const result = rules.filter(r => (scores[r.key] || 0) >= r.threshold).slice(0, 3)
  return result.length ? result : [{ label: 'Fleksibel', emoji: '🔄', desc: 'Belum ada pola coping yang menonjol' }]
}

// Strengths — 3 trait teratas
function getStrengths(scores) {
  return [...GENOME_MAP]
    .filter(g => (scores?.[g.key] || 0) > 0)
    .sort((a, b) => (scores[b.key] || 0) - (scores[a.key] || 0))
    .slice(0, 3)
}

// Area Berkembang — 2 trait terendah yang masih ada nilainya
function getWeaknesses(scores) {
  return [...GENOME_MAP]
    .filter(g => (scores?.[g.key] || 0) > 0)
    .sort((a, b) => (scores[a.key] || 0) - (scores[b.key] || 0))
    .slice(0, 2)
}

// Motivations berdasarkan top trait
const MOTIVATIONS_MAP = {
  analytical:    ['Ngerti kenapa dirinya ngerasa gitu', 'Nemuin pola di balik perasaannya', 'Bikin keputusan yang lebih jernih'],
  leadership:    ['Ngeliat diri sendiri makin kuat', 'Nggak gampang jatuh lagi ke pola yang sama', 'Jadi contoh buat orang terdekat'],
  builder:       ['Ngerasa progres yang nyata', 'Punya rutinitas yang bikin tenang', 'Nyalurin energi ke hal yang membangun'],
  creator:       ['Nemuin cara baru buat ngerti diri sendiri', 'Bereksperimen dengan cara coping', 'Mengekspresikan apa yang dirasain'],
  communication: ['Ngerasa didengar & dimengerti', 'Membangun hubungan yang lebih jujur', 'Berbagi cerita tanpa takut dihakimi'],
  risk_taking:   ['Lebih peka sama diri sendiri', 'Bisa hadir buat orang lain tanpa kehabisan energi', 'Membangun hubungan yang lebih hangat'],
}

// Gaya Dukungan yang Cocok
function getEnvironment(scores) {
  if (!scores) return 'Fleksibel'
  if ((scores.communication || 0) > 65) return 'Cerita ke Orang Lain'
  if ((scores.analytical || 0) > 65)    return 'Waktu Sendiri buat Merenung'
  if ((scores.builder || 0) > 65)       return 'Campuran — Fleksibel'
  return 'Terbuka ke Berbagai Cara'
}

// Aktivitas Self-Care yang Cocok berdasarkan top trait
const ACTIVITY_MAP = {
  analytical:    ['📓 Journaling', '🧘 Meditasi Reflektif', '📚 Baca soal psikologi ringan'],
  leadership:    ['🏃 Olahraga Rutin', '🎯 Habit Tracking', '🌅 Rutinitas Pagi'],
  builder:       ['🧹 Beberes/Decluttering', '🎨 Craft/Bikin Sesuatu', '🚶 Jalan Kaki'],
  creator:       ['🎨 Melukis/Menggambar', '✍️ Menulis Kreatif', '🎵 Main/Dengerin Musik'],
  communication: ['👥 Support Group', '📞 Curhat ke Teman Dekat', '💬 Konseling/Terapi'],
  risk_taking:   ['🫂 Volunteering', '🐾 Merawat Hewan/Tanaman', '🤝 Quality Time sama Orang Terdekat'],
}

// Card wrapper
function Card({ children, delay = 0, visible, accentColor }) {
  return (
    <div style={{
      background: accentColor ? `${accentColor}08` : 'rgba(255,255,255,0.03)',
      border: `1px solid ${accentColor ? `${accentColor}20` : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 18, padding: '18px', marginBottom: 12,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(14px)',
      transition: `opacity 0.45s ease ${delay}s, transform 0.45s ease ${delay}s`,
    }}>
      {children}
    </div>
  )
}

function SectionTitle({ emoji, children, color }) {
  return (
    <div style={{ color: color || '#fff', fontWeight: 700, fontSize: '0.88rem', marginBottom: 14 }}>
      {emoji && <span style={{ marginRight: 6 }}>{emoji}</span>}{children}
    </div>
  )
}

function Tag({ label, emoji, color, bg, border }) {
  return (
    <div style={{
      background: bg || 'rgba(255,255,255,0.05)',
      border: `1px solid ${border || 'rgba(255,255,255,0.1)'}`,
      borderRadius: 10, padding: '7px 13px',
      fontSize: '0.8rem', color: color || 'rgba(255,255,255,0.7)',
      fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {emoji && <span>{emoji}</span>}{label}
    </div>
  )
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
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

export default function DNA({ user, loading = false, subscription = DEFAULT_SUBSCRIPTION }) {
  const { plan } = subscription
  const navigate  = useNavigate()
  const [scores, setScores]   = useState(null)
  const [profile, setProfile] = useState(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) { navigate('/'); return }
    Promise.all([
      supabase.from('user_genome_scores').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_career_profiles')
        .select('nama, target_posisi, posisi_saat_ini, industri, hambatan, skill_gaps, mentor_message')
        .eq('user_id', user.id).maybeSingle(),
    ]).then(async ([{ data: s }, { data: p }]) => {
      const genomeKosong = !s || !GENOME_MAP.some(g => (s[g.key] || 0) > 0)
      const adaProfil    = p && p.target_posisi

      // Auto-compute trait dari profil yang ada — tanpa user perlu apa-apa
      console.log('[DNA] genomeKosong:', genomeKosong, '| adaProfil:', adaProfil, '| p:', p, '| s:', s)
      if (genomeKosong && adaProfil) {
        try {
          const coachKey = user.id ? `lc_coach_${user.id}` : null
          const saved    = coachKey ? localStorage.getItem(coachKey) : null
          const history  = saved ? JSON.parse(saved) : []

          // Buat synthetic messages dari data profil supaya compute-genome punya context
          const syntheticMessages = [
            { role: 'user', text: `Halo, nama saya ${p.nama || 'saya'}.` },
            { role: 'assistant', text: 'Halo! Cerita dong, lagi mikirin apa belakangan ini?' },
            { role: 'user', text: `Belakangan ini aku lagi banyak mikirin soal ${p.target_posisi || 'diri sendiri'}. Kondisiku sekarang ${p.posisi_saat_ini || 'lagi campur aduk'}.` },
            { role: 'assistant', text: 'Aku ngerti. Apa yang biasanya bikin itu makin berat?' },
            { role: 'user', text: (() => {
              const rawG = p.skill_gaps
              const gArr = Array.isArray(rawG) ? rawG : (rawG && typeof rawG === 'object' ? Object.values(rawG) : [])
              return p.hambatan || `Aku pengen ngerasa lebih tenang soal ${p.target_posisi}, tapi masih sering keulang polanya. Hal yang masih perlu aku latih antara lain ${gArr.join(', ') || 'cara ngelola perasaan'}.`
            })() },
            { role: 'assistant', text: 'Baik, aku ngerti situasimu.' },
          ]

          // Gabungkan dengan chat history yang ada (kalau ada)
          const messages = history.length >= 4 ? history : [...syntheticMessages, ...history]

          console.log('[DNA] messages dikirim:', messages.length, messages)
          const res    = await fetch('/api/compute-genome', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ messages, profile: p }),
          })
          console.log('[DNA] compute-genome status:', res.status)
          const result = await res.json()
          console.log('[DNA] compute-genome result:', result)

          const parsed = result.result || result
          if (parsed.genome_scores) {
            const gs = parsed.genome_scores
            await supabase.from('user_genome_scores').upsert({
              user_id:       user.id,
              analytical:    gs.analytical    || 0,
              leadership:    gs.leadership    || 0,
              builder:       gs.builder       || 0,
              creator:       gs.creator       || 0,
              communication: gs.communication || 0,
              risk_taking:   gs.risk_taking   || 0,
              top_strength:  parsed.top_strength || null,
              updated_at:    new Date().toISOString(),
            }, { onConflict: 'user_id' })

            // Fetch ulang trait yang baru disimpan
            const { data: newScores } = await supabase
              .from('user_genome_scores').select('*')
              .eq('user_id', user.id).maybeSingle()
            setScores(newScores)
          }
        } catch(e) { console.warn('[dna-autocompute]', e) }
      } else {
        setScores(s)
      }

      setProfile(p)
      setDataLoading(false)
      setTimeout(() => setVisible(true), 80)
    })
  }, [user?.id])

  const hasData    = scores && GENOME_MAP.some(g => (scores[g.key] || 0) > 0)
  const strengths  = hasData ? getStrengths(scores) : []
  const weaknesses = hasData ? getWeaknesses(scores) : []
  const topKey     = strengths[0]?.key
  const topGene    = GENOME_MAP.find(g => g.key === topKey)
  const copingStyle = getCopingStyle(hasData ? scores : null)
  const values     = topKey ? VALUES_MAP[topKey] : []
  const motivations = topKey ? MOTIVATIONS_MAP[topKey] : []
  const activities = topKey ? ACTIVITY_MAP[topKey] : []
  const environment = getEnvironment(hasData ? scores : null)
  const gaps       = profile?.skill_gaps || profile?.gap_skills || []
  const fokusUtama = profile?.industri || null

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0f0d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.2rem', marginBottom: 10 }}>🧠</div>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>Memuat Diri Kamu...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f0d', paddingBottom: 90, fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '14px 18px',
      }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>🧠 Diri Kamu</div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', marginTop: 2 }}>Pola emosi & self-care kamu</div>
      </div>

      <div style={{ padding: '16px', maxWidth: 480, margin: '0 auto' }}>

        {/* ══ NO DATA ══ */}
        {!hasData && (
          <div style={{ textAlign: 'center', padding: '52px 20px', opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: 14 }}>🧠</div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', marginBottom: 10 }}>Profil kamu belum terbentuk</div>
            <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.83rem', lineHeight: 1.7, marginBottom: 28 }}>
              Cerita ke Diah Anna dulu, biar pola diri kamu bisa mulai kebaca.
            </div>
            <button onClick={() => navigate('/chat')} style={{
              padding: '13px 30px',
              background: 'linear-gradient(135deg,#25D366,#128C7E)',
              color: '#fff', fontWeight: 700, borderRadius: 13,
              border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 18px rgba(37,211,102,0.3)', fontSize: '0.9rem',
            }}>
              💬 Chat dengan Diah Anna
            </button>
          </div>
        )}

        {/* ══ HAS DATA ══ */}
        {hasData && (<>

          {/* 1. INSIGHT DIAH ANNA */}
          {topKey && (
            <Card delay={0.04} visible={visible} accentColor="#25D366">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <img src="/diah-anna.png" alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(37,211,102,0.4)', flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#25D366', fontWeight: 700, fontSize: '0.8rem' }}>Insight Diah Anna</div>
                  <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.63rem' }}>Berdasarkan pola diri kamu</div>
                </div>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: '0.85rem', lineHeight: 1.75 }}>
                {INSIGHT_MAP[topKey]}
              </div>
            </Card>
          )}

          {/* 2. TRAIT DIRI KAMU */}
          <Card delay={0.09} visible={visible}>
            <SectionTitle emoji="🧬">Trait Diri Kamu</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {GENOME_MAP.map(g => {
                const val = scores[g.key] || 0
                if (val === 0) return null
                const isTop = topKey === g.key
                return (
                  <div key={g.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: '0.9rem' }}>{g.emoji}</span>
                        <span style={{ color: isTop ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: isTop ? 700 : 500, fontSize: '0.82rem' }}>{g.label}</span>
                        {isTop && (
                          <span style={{ background: `${g.color}25`, color: g.color, fontSize: '0.57rem', padding: '2px 7px', borderRadius: 99, fontWeight: 700 }}>TOP</span>
                        )}
                      </span>
                      <span style={{ color: g.color, fontWeight: 800, fontSize: '0.9rem' }}>{val}</span>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 99, height: 6, overflow: 'hidden', marginBottom: 3 }}>
                      <div style={{ background: `linear-gradient(90deg,${g.color},${g.color}90)`, width: `${val}%`, height: '100%', borderRadius: 99, transition: 'width 1s ease' }} />
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.63rem' }}>{g.desc}</div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* 3. NILAI YANG KAMU JAGA */}
          {values.length > 0 && (
            <Card delay={0.14} visible={visible} accentColor="#FFB74D">
              <SectionTitle emoji="🌟" color="#FFB74D">Nilai yang Kamu Jaga</SectionTitle>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.73rem', marginBottom: 12 }}>
                Hal yang paling penting buat kamu dalam proses ngerawat diri
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {values.map((v, i) => (
                  <Tag key={i} emoji={v.emoji} label={v.label} color="#FFB74D" bg="rgba(255,183,77,0.08)" border="rgba(255,183,77,0.2)" />
                ))}
              </div>
            </Card>
          )}

          {/* 4. GAYA COPING */}
          <Card delay={0.19} visible={visible} accentColor="#34B7F1">
            <SectionTitle emoji="🔧" color="#34B7F1">Gaya Coping</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {copingStyle.map((w, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 13px',
                  background: 'rgba(52,183,241,0.06)', border: '1px solid rgba(52,183,241,0.15)',
                  borderRadius: 12,
                }}>
                  <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>{w.emoji}</span>
                  <div>
                    <div style={{ color: '#34B7F1', fontWeight: 600, fontSize: '0.83rem', marginBottom: 2 }}>{w.label}</div>
                    <div style={{ color: 'rgba(255,255,255,0.33)', fontSize: '0.69rem' }}>{w.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* 5. STRENGTHS */}
          {strengths.length > 0 && (
            <Card delay={0.24} visible={visible} accentColor="#25D366">
              <SectionTitle emoji="💪" color="#25D366">Kekuatan Kamu</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {strengths.map((g, i) => (
                  <div key={g.key} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 13px',
                    background: i === 0 ? 'rgba(37,211,102,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${i === 0 ? 'rgba(37,211,102,0.22)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 13,
                  }}>
                    <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{g.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: i === 0 ? '#25D366' : 'rgba(255,255,255,0.8)', fontWeight: i === 0 ? 700 : 500, fontSize: '0.83rem', marginBottom: 2 }}>{g.label}</div>
                      <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.67rem' }}>{g.desc}</div>
                    </div>
                    <span style={{ color: g.color, fontWeight: 800, fontSize: '0.88rem' }}>{scores[g.key]}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 6. AREA BERKEMBANG */}
          {weaknesses.length > 0 && (
            <Card delay={0.29} visible={visible} accentColor="#EF5350">
              <SectionTitle emoji="📈" color="#EF9A9A">Area Berkembang</SectionTitle>
              <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.72rem', marginBottom: 12 }}>
                Bukan kekurangan — ini peluang terbesar untuk tumbuh.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {weaknesses.map((g, i) => (
                  <div key={g.key} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 13px',
                    background: 'rgba(239,83,80,0.05)', border: '1px solid rgba(239,83,80,0.15)',
                    borderRadius: 12,
                  }}>
                    <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{g.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontSize: '0.82rem', marginBottom: 2 }}>{g.label}</div>
                      <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.67rem' }}>{g.desc}</div>
                    </div>
                    <span style={{ color: '#EF9A9A', fontWeight: 700, fontSize: '0.85rem' }}>{scores[g.key]}</span>
                  </div>
                ))}
              </div>
              {/* Hal-hal konkret yang masih perlu dilatih */}
              {gaps.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: '0.67rem', letterSpacing: '0.8px', marginBottom: 8 }}>YANG MASIH PERLU DILATIH:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {gaps.slice(0, 5).map((g, i) => (
                      <Tag key={i} label={g} emoji="📍" color="rgba(255,183,77,0.8)" bg="rgba(255,183,77,0.07)" border="rgba(255,183,77,0.18)" />
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* 7. MOTIVATIONS */}
          {motivations.length > 0 && (
            <Card delay={0.34} visible={visible} accentColor="#CE93D8">
              <SectionTitle emoji="🔥" color="#CE93D8">Yang Memotivasi Kamu</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {motivations.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#CE93D8', flexShrink: 0 }} />
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.83rem' }}>{m}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 8. AKTIVITAS SELF-CARE YANG COCOK */}
          <Card delay={0.39} visible={visible} accentColor="#FFB74D">
            <SectionTitle emoji="🌿" color="#FFB74D">Aktivitas yang Cocok Buat Kamu</SectionTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(fokusUtama
                ? [{ emoji: '🎯', label: fokusUtama }, ...activities.slice(0, 2)]
                : activities
              ).map((act, i) => (
                <Tag key={i}
                  emoji={typeof act === 'string' ? '🌿' : act.emoji}
                  label={typeof act === 'string' ? act : act.label}
                  color="#FFB74D" bg="rgba(255,183,77,0.07)" border="rgba(255,183,77,0.18)"
                />
              ))}
            </div>
          </Card>

          {/* 9. GAYA DUKUNGAN YANG COCOK */}
          <Card delay={0.44} visible={visible}>
            <SectionTitle emoji="🌍">Gaya Dukungan yang Cocok</SectionTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 46, height: 46, borderRadius: '50%',
                background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0,
              }}>
                {environment.includes('Sendiri') ? '🧘' : environment.includes('Orang Lain') ? '🗣️' : '🔄'}
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: 3 }}>{environment}</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem' }}>
                  {environment.includes('Sendiri') ? 'Paling lega kalau dikasih waktu & ruang buat diri sendiri' :
                   environment.includes('Orang Lain') ? 'Berkembang lewat cerita & didengar orang lain' :
                   'Fleksibel dan adaptif, tergantung situasinya'}
                </div>
              </div>
            </div>

            {scores?.updated_at && (
              <div style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.63rem', marginTop: 14, textAlign: 'center' }}>
                Dianalisis {new Date(scores.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            )}
          </Card>

          {/* CTA */}
          <button
            onClick={() => navigate('/chat')}
            style={{
              width: '100%', marginBottom: 12, padding: '14px',
              background: 'linear-gradient(135deg,#25D366,#128C7E)',
              color: '#fff', fontWeight: 700, fontSize: '0.9rem',
              borderRadius: 14, border: 'none', cursor: 'pointer',
              boxShadow: '0 3px 16px rgba(37,211,102,0.3)',
              opacity: visible ? 1 : 0, transition: 'opacity 0.45s ease 0.5s',
            }}
          >
            💬 Diskusikan ini dengan Diah Anna
          </button>

        </>)}
      </div>

      {/* ── CTA Upgrade (free only) — high-intent moment setelah lihat profil ── */}
      {plan !== 'premium' && (
        <div
          onClick={() => window.dispatchEvent(new CustomEvent('show-upgrade', { detail: {} }))}
          style={{
            margin: '0 16px 16px', borderRadius: 16, padding: '16px',
            background: 'linear-gradient(135deg,rgba(123,107,255,0.12),rgba(37,211,102,0.08))',
            border: '1px solid rgba(123,107,255,0.25)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <img src="/diah-anna.png" alt="Diah Anna" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem' }}>Diah Anna bisa nemenin kamu lebih dalam</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem' }}>Berdasarkan profil diri yang baru kamu lihat</div>
            </div>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', lineHeight: 1.6, marginBottom: 12 }}>
            Upgrade Premium buat chat tanpa batas, insight mingguan soal mood & pola dirimu, dan Diah Anna yang makin mengenalmu setiap sesi.
          </div>
          <div style={{
            width: '100%', padding: '11px',
            background: 'linear-gradient(135deg,#7B6BFF,#25D366)',
            color: '#fff', fontWeight: 700, fontSize: '0.85rem',
            borderRadius: 12, textAlign: 'center',
          }}>
            Mulai Premium ✨
          </div>
        </div>
      )}

      <BottomNav isPremium={plan === 'premium'} />
    </div>
  )
}
