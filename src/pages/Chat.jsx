import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate, useLocation } from 'react-router-dom'
import ShareCard from '../components/ShareCard'
import ShareAppModal from '../components/ShareAppModal'

function renderMd(text) {
  if (!text) return ''
  return text
    .replace(/^## (.+)$/gm, '<div style="font-weight:700;font-size:0.92rem;margin:10px 0 3px;color:#fff">$1</div>')
    .replace(/^### (.+)$/gm, '<div style="font-weight:600;font-size:0.87rem;margin:8px 0 2px;color:rgba(255,255,255,0.9)">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/- (.+)$/gm, '<div style="padding:2px 0 2px 14px;position:relative"><span style="position:absolute;left:4px;color:#C4B5FD">•</span>$1</div>')
    .replace(/^\d+\. (.+)$/gm, '<div style="padding:2px 0 2px 14px;position:relative">$1</div>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>')
}

function fmtRupiah(n) {
  if (n == null || isNaN(n)) return '-'
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

function formatIncomeStrategy(strategy) {
  const feasibilityLabel = {
    FEASIBLE: '✅ Realistis dicapai',
    CLOSE_TO_TARGET: '🟡 Mendekati target',
    NEEDS_ADJUSTMENT: '🟠 Perlu penyesuaian',
    ALREADY_ACHIEVED: '🎉 Target sudah tercapai',
  }[strategy.feasibility] || strategy.feasibility

  let out = `## 📊 Strategi Income Kamu\n\n`
  out += `**Status:** ${feasibilityLabel}\n`
  out += `**Tingkat keyakinan:** ${Math.round((strategy.confidence || 0) * 100)}%\n`
  out += `**Proyeksi akhir:** ${fmtRupiah(strategy.total_projected)}\n\n`

  if (strategy.recommended_paths?.length) {
    out += `### Jalur yang direkomendasikan\n`
    strategy.recommended_paths.forEach(p => {
      out += `- **${p.name}**: potensi +${fmtRupiah(p.potential)}/bulan, mulai penuh bulan ke-${p.timeline_months}, tingkat keberhasilan ${Math.round(p.success_rate * 100)}%\n`
    })
    out += `\n`
  }

  if (strategy.monthly_projection?.length) {
    out += `### Proyeksi bulanan\n`
    strategy.monthly_projection.forEach(m => {
      out += `- Bulan ${m.month}: ${fmtRupiah(m.projected_income)}\n`
    })
  }

  return out
}

async function apiFetch(url, body) {
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const text = await resp.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error(text.slice(0, 120)) }
  if (!resp.ok || data.error) {
    const err = new Error(data.error || `HTTP ${resp.status}`)
    err.limitReached = data.limitReached || false
    throw err
  }
  return data
}

const CV_FORMATS = [
  { id: 'fmt_ats',       label: '✅ ATS Friendly'    },
  { id: 'fmt_jobstreet', label: '🔍 JobStreet'        },
  { id: 'fmt_linkedin',  label: '💼 LinkedIn Profile' },
]

const DEFAULT_SUBSCRIPTION = {
  plan: 'free',
  loading: true,
  checkUsage: async () => false,
  logUsage: () => {},
  fetchPlan: () => {},
  getRemainingChat: async () => 0,
  isExpired: false,
  expiresAt: null,
  getDaysRemaining: () => null,
}

// ── Diah Anna design tokens — dipakai khusus di halaman Chat, tidak
// bergantung ke variabel --wa-* lama (yang masih dipakai halaman lain) supaya
// redesign ini nggak nyebar tak terduga ke bagian app yang belum di-pivot.
const DA = {
  chatBg:        '#14101B',
  chatBgImage:   'radial-gradient(circle at 15% 0%, rgba(139,92,246,0.10) 0%, transparent 45%), radial-gradient(circle at 85% 100%, rgba(251,113,133,0.08) 0%, transparent 45%)',
  headerBg:      'rgba(20,16,27,0.92)',
  headerBorder:  'rgba(255,255,255,0.08)',
  headerSub:     'rgba(255,255,255,0.5)',
  avatarRing:    'rgba(139,92,246,0.55)',
  avatarGlow:    'rgba(139,92,246,0.35)',
  bubbleUser:    'linear-gradient(135deg, #8B5CF6 0%, #FB7185 100%)',
  bubbleBot:     'rgba(255,255,255,0.06)',
  bubbleBotBorder: 'rgba(255,255,255,0.08)',
  bubbleBotText: 'rgba(255,255,255,0.92)',
  inputBarBg:    'rgba(20,16,27,0.96)',
  inputBg:       'rgba(255,255,255,0.07)',
  inputBorder:   'rgba(255,255,255,0.12)',
  sendGrad:      'linear-gradient(135deg, #8B5CF6 0%, #FB7185 100%)',
}


// NOTE: getNextFocus() dihapus dari sini.
// Single source of truth sekarang adalah api/career-coach.js (action: 'init-chat'),
// supaya prioritas next-focus tidak pernah drift antara client dan server.

function RedeemCodeModal({ userId, onClose }) {
  const [redeemCode, setRedeemCode]       = useState('')
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemMsg, setRedeemMsg]         = useState(null) // { type: 'ok'|'err', text }
  const [redeemDone, setRedeemDone]       = useState(false)

  const submit = async () => {
    if (!userId || redeemCode.length < 12) return
    setRedeemLoading(true); setRedeemMsg(null)
    try {
      const res  = await fetch('/api/utils?action=redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemCode, userId }),
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
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 1000, backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480,
        background: '#14101B',
        border: '1px solid rgba(139,92,246,0.22)',
        borderRadius: '22px 22px 0 0',
        zIndex: 1001,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 16,
          background: 'rgba(255,255,255,0.07)', border: 'none', color: 'rgba(255,255,255,0.45)',
          width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: '0.85rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>

        <div style={{ padding: '20px 20px 32px' }}>
          {!redeemDone ? (
            <>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: 10, fontWeight: 600 }}>
                Masukkan kode redeem (12 karakter)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  autoFocus
                  value={redeemCode}
                  onChange={e => { setRedeemCode(e.target.value.toUpperCase()); setRedeemMsg(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') submit() }}
                  placeholder="XXXX-XXXX-XXXX"
                  maxLength={12}
                  style={{
                    flex: 1, padding: '12px 14px', borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.05)', color: '#fff',
                    fontSize: '1rem', fontFamily: 'monospace', letterSpacing: 2,
                    outline: 'none',
                  }}
                />
                <button
                  disabled={redeemCode.length < 12 || redeemLoading}
                  onClick={submit}
                  style={{
                    padding: '12px 18px', borderRadius: 10,
                    background: redeemCode.length < 12 ? 'rgba(139,92,246,0.25)' : 'linear-gradient(135deg,#8B5CF6,#FB7185)',
                    color: '#fff', fontWeight: 700, fontSize: '0.85rem',
                    border: 'none', cursor: redeemCode.length < 12 ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {redeemLoading ? '⏳' : 'Aktifkan'}
                </button>
              </div>
              {redeemMsg && (
                <div style={{ marginTop: 10, fontSize: '0.8rem', color: redeemMsg.type === 'ok' ? '#34D399' : '#EF5350', fontWeight: 600 }}>
                  {redeemMsg.text}
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '4px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>🎉</div>
              <div style={{ color: '#34D399', fontWeight: 700, fontSize: '0.95rem' }}>Premium berhasil diaktifkan!</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', marginTop: 4 }}>Berlaku 30 hari. Refresh halaman untuk mulai.</div>
              <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '10px 22px', borderRadius: 9, background: 'linear-gradient(135deg,#8B5CF6,#FB7185)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer' }}>
                Refresh Sekarang
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default function Chat({ user, chatMessages = [], setChatMessages, subscription = DEFAULT_SUBSCRIPTION }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { plan, loading: subLoading, checkUsage, isExpired, getDaysRemaining } = subscription

  // Sisa hari premium — dihitung dari expires_at, dipakai untuk badge navbar & reminder perpanjangan
  const daysRemaining = useMemo(() => {
    if (plan !== 'premium') return null
    return getDaysRemaining ? getDaysRemaining() : null
  }, [plan, getDaysRemaining, subscription.expiresAt])

  const showRenewalReminder = plan === 'premium' && daysRemaining !== null && daysRemaining <= 7

  // Ref untuk selalu punya history terbaru tanpa closure stale
  const [waitingForPositive, setWaitingForPositive] = useState(false)

  const storageKey     = user?.id ? `lc_chat_${user.id}` : null
  const ONBOARDING_KEY = user?.id ? `onboarded_${user.id}` : null

  const messages    = chatMessages
  const setMessages = setChatMessages

  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [mode, setMode]                 = useState('coach')
  const [cvText, setCvText]             = useState('')
  const [interview, setInterview]       = useState({ position: '', level: '', messages: [], qNum: 0 })
  const [showRedeemModal, setShowRedeemModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  
  const coachKey         = user?.id ? `lc_coach_${user.id}` : null
  const greetingFiredRef = useRef(false)
  const saveTimerRef     = useRef(null)

  // ── coachHistory: init dari localStorage (buffer cepat) ──────────────────
  const [coachHistory, setCoachHistoryRaw] = useState(() => {
    if (!coachKey) return []
    try {
      const saved = localStorage.getItem(coachKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return []
  })

  const [historyLoaded, setHistoryLoaded] = useState(false)

  // Ref untuk selalu punya history terbaru tanpa stale closure
  const coachHistoryRef = useRef([])
  useEffect(() => { coachHistoryRef.current = coachHistory }, [coachHistory])

  // ── Save helper ───────────────────────────────────────────────────────────
  const saveHistoryToSupabase = useCallback((msgs, useBeacon = false) => {
    if (!user?.id || !msgs?.length) return
    // Update localStorage langsung supaya sinkron
    if (coachKey) {
      try { localStorage.setItem(coachKey, JSON.stringify(msgs.slice(-50))) } catch {}
    }
    const payload = JSON.stringify({ userId: user.id, messages: msgs.slice(-50) })
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/chat-history', new Blob([payload], { type: 'application/json' }))
    } else {
      fetch('/api/chat-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
    }
  }, [user?.id, coachKey])

  const setCoachHistory = useCallback((updater) => {
    setCoachHistoryRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (coachKey) {
        try { localStorage.setItem(coachKey, JSON.stringify(next.slice(-50))) } catch {}
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => saveHistoryToSupabase(next), 300)
      return next
    })
  }, [coachKey, saveHistoryToSupabase])
  
  const [shareCard, setShareCard] = useState(null)
  const [showShareApp, setShowShareApp] = useState(false)

  const bottomRef = useRef()
  const fileRef   = useRef()
  const containerRef = useRef()

  // ── Load history dari Supabase saat mount ────────────────────────────────
  useEffect(() => {
    if (!user?.id || historyLoaded) return

    fetch(`/api/chat-history?userId=${user.id}&daysBack=1`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setHistoryLoaded(true); return }

        if (Array.isArray(data.today) && data.today.length > 0) {
          // Selalu pakai data Supabase — lebih reliable dari localStorage
          setCoachHistoryRaw(data.today)
          if (coachKey) {
            try { localStorage.setItem(coachKey, JSON.stringify(data.today.slice(-50))) } catch {}
          }
          const displayMsgs = data.today
            .filter(m => m.role !== 'system')
            .map(m => ({
              id:   m.id || (Date.now() + Math.random()),
              role: m.role === 'assistant' ? 'bot' : m.role,
              text: m.text || m.content || '',
            }))
          if (displayMsgs.length > 0) {
            setMessages(displayMsgs)
            if (storageKey) {
              try { localStorage.setItem(storageKey, JSON.stringify(displayMsgs)) } catch {}
            }
          }
          greetingFiredRef.current = true
        }
        // today kosong → biarkan greeting useEffect jalan normal
        setHistoryLoaded(true)
      })
      .catch(() => {
        // Fetch gagal → tetap set loaded supaya greeting bisa jalan
        setHistoryLoaded(true)
      })
  }, [user?.id])

  // ── End-session trigger: kirim ke /api/end-session ───────────────────────
  const memoryFiredRef = useRef(false)

  // Reset flag tiap hari (bukan tiap user berubah)
  useEffect(() => { memoryFiredRef.current = false }, [user?.id])

  const sendEndSession = useCallback((triggerType = 'visibility') => {
    if (!user?.id) return
    if (memoryFiredRef.current) return
    const msgs = coachHistoryRef.current
    if (msgs.filter(m => m.role === 'user').length < 3) return
    memoryFiredRef.current = true

    const payload = JSON.stringify({
      userId:   user.id,
      messages: msgs.slice(-50),
      trigger:  triggerType,
    })

    // sendBeacon pakai Blob text/plain — lebih reliable cross-browser
    if (triggerType !== 'logout' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/end-session', new Blob([payload], { type: 'text/plain' }))
    } else {
      fetch('/api/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {})
    }
  }, [user?.id])

  // Reset flag tiap user baru
  useEffect(() => { memoryFiredRef.current = false }, [user?.id])

  useEffect(() => {
    const onHide   = () => { saveHistoryToSupabase(coachHistoryRef.current, true);  sendEndSession('visibility') }
    const onUnload = () => { saveHistoryToSupabase(coachHistoryRef.current, true);  sendEndSession('beforeunload') }
    const onLogout = () => { saveHistoryToSupabase(coachHistoryRef.current, false); sendEndSession('logout') }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide() })
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('diah-anna-logout-memory', onLogout)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('diah-anna-logout-memory', onLogout)
    }
  }, [sendEndSession, saveHistoryToSupabase])

  const pushBot = useCallback((text, quickReplies = null) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), role: 'bot', text, quickReplies }])
    window.dispatchEvent(new CustomEvent('diah-anna-replied'))
  }, [])

  const pushUser = useCallback((text) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), role: 'user', text }])
  }, [])

  // Sama seperti pushBot, tapi juga ikut disimpan ke coachHistory + Supabase —
  // dipakai untuk pesan "custom" (bukan balasan langsung dari /api/career-coach)
  // supaya tidak hilang saat reload, seperti balasan normal lainnya.
  const pushBotAndPersist = useCallback((text) => {
    pushBot(text)
    const entry = { id: Date.now() + Math.random(), role: 'assistant', content: text, text }
    const nextHistory = [...coachHistoryRef.current, entry]
    setCoachHistory(nextHistory)
    saveHistoryToSupabase(nextHistory, false)
  }, [pushBot, setCoachHistory, saveHistoryToSupabase])

  // 1. Dashboard Mission Synchronization
  useEffect(() => {
    if (location.state?.triggerMission && user?.id) {
      const mission = location.state.triggerMission;
      const missionContext = `[SYSTEM SYNC]: User baru saja mengeksekusi Misi Harian dari Dashboard: "${mission}". Mulai percakapan dengan menanyakan kesiapan atau progres mereka mengenai misi ini secara taktis dan spesifik.`;
      
      const newHistory = [...coachHistory, { role: 'user', content: missionContext }];
      setCoachHistory(newHistory);
      setLoading(true);
      
      apiFetch('/api/career-coach', { messages: newHistory, userId: user.id })
        .then(data => {
          pushBot(data.reply);
          setCoachHistory([...newHistory, { role: 'assistant', content: data.reply }]);
          setLoading(false);
        })
        .catch(() => {
          pushBot(`Agenda kita saat ini terkunci pada misi: **${mission}**. Apa yang menjadi hambatan utamamu untuk menyelesaikannya hari ini?`);
          setLoading(false);
        });
        
      window.history.replaceState({}, document.title);
      greetingFiredRef.current = true; // Skip normal greeting
    }
  }, [location.state, user?.id]);

  // 2. (Onboarding popup dihapus — situasi income sekarang ditanya natural
  // oleh Diah Anna di dalam obrolan biasa, lihat instruksi system prompt di
  // api/coach-hub.js, bukan lewat popup/form terpisah lagi.)

  // 3. Proactive greeting — 1x per hari
  // Trigger hanya kalau historyLoaded=true DAN greetingFiredRef masih false
  // greetingFiredRef di-set true oleh load useEffect kalau ada history hari ini
  useEffect(() => {
    if (!user || subLoading || !historyLoaded || greetingFiredRef.current) return

    greetingFiredRef.current = true
    const firstName = (user.user_metadata?.name || user.user_metadata?.full_name || '').split(' ')[0]

    apiFetch('/api/career-coach', { action: 'init-chat', userId: user.id })
      .then(data => {
        pushBot(data.openingMessage)
        setCoachHistory([
          { role: 'user',      content: '[SYSTEM] Sesi baru dimulai.', text: '[SYSTEM] Sesi baru dimulai.' },
          { role: 'assistant', content: data.openingMessage,           text: data.openingMessage },
        ])
      })
      .catch(() => {
        pushBot(`Halo ${firstName || 'Sobat'} 👋\n\nAku Diah Anna. Cerita aja apa yang lagi kamu pikirin — aku dengerin.`)
      })
  }, [user?.id, subLoading, historyLoaded])

  useEffect(() => {
    if (!storageKey || messages.length === 0) return
    try { localStorage.setItem(storageKey, JSON.stringify(messages)) } catch {}
  }, [messages])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      if (containerRef.current) {
        containerRef.current.style.height = (vv.height - 65) + 'px'
        containerRef.current.style.top    = vv.offsetTop + 'px'
      }
      // Scroll ke bawah setiap kali keyboard muncul/ukuran viewport berubah
      // Pakai setTimeout supaya layout sudah selesai di-recalculate dulu
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 50)
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])

  // ── Deep Memory triggers ──────────────────────────────────────────────────
  // Reset flag tiap sesi baru (user berubah)
  useEffect(() => {
    memoryFiredRef.current = false
  }, [user?.id])

  // Kata-kata positif yang trigger show-upgrade setelah Diah Anna persuasi
  const POSITIVE_TRIGGERS = ['iya','ya','mau','ok','oke','boleh','tertarik','penasaran','gimana','bagaimana','cerita','share','lanjut','lanjutkan','tentu','siap','setuju','bisa','yuk','ayuk','coba','dong','deh','wah','wah iya','keren','mantap','oke deh','oke siap']

  const isPositiveResponse = (text) => {
    const lower = text.toLowerCase().trim()
    // Cek kata trigger
    if (POSITIVE_TRIGGERS.some(t => lower.includes(t))) return true
    // Cek pertanyaan soal harga/upgrade
    if (/harga|berapa|bayar|upgrade|premium|beli|daftar|cara/.test(lower)) return true
    return false
  }

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput(''); pushUser(msg)
    const msgId = Date.now()
    const newHistory = [...coachHistoryRef.current, { id: msgId, role: 'user', content: msg, text: msg }]
    setCoachHistory(newHistory)
    saveHistoryToSupabase(newHistory, false)
    setLoading(true)

    if (plan !== 'premium' && waitingForPositive && isPositiveResponse(msg)) {
      setWaitingForPositive(false)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('show-upgrade', { detail: {} }))
      }, 800)
    }

    apiFetch('/api/career-coach', { messages: newHistory, userId: user?.id })
    .then(data => {
      const replyId = Date.now() + 1
      pushBot(data.reply)
      const fullHistory = [...newHistory, { id: replyId, role: 'assistant', content: data.reply, text: data.reply }]
      setCoachHistory(fullHistory)
      // Save langsung dengan fullHistory yang sudah pasti lengkap
      saveHistoryToSupabase(fullHistory, false)
      if (plan !== 'premium' && data.persuasiAktif) {
        setWaitingForPositive(true)
      }
      const userMsgCount = fullHistory.filter(m => m.role === 'user').length
      if (userMsgCount % 5 === 0) {
        apiFetch('/api/extract-profile', { userId: user?.id, messages: fullHistory }).catch(() => {})
      }

      // Income Engine: Diah Anna otomatis mendeteksi topik income dari
      // percakapan (tanpa mode/tombol terpisah) dan menghitung strategi di
      // backend begitu data cukup. Kalau hasilnya ada, tampilkan sebagai
      // bubble berikutnya, dipersist juga supaya tidak hilang saat reload.
      if (data.strategy) {
        setTimeout(() => {
          pushBotAndPersist(formatIncomeStrategy(data.strategy))
        }, 400)
      } else if (data.strategyLimitReached) {
        setTimeout(() => {
          pushBotAndPersist('Data income kamu sudah lengkap, tapi kuota Income Strategy gratis kamu sudah dipakai 🙏 Upgrade ke Premium untuk generate strategi kapan saja.')
          window.dispatchEvent(new CustomEvent('show-upgrade', { detail: {} }))
        }, 400)
      }
    })
    .catch((err) => {
      // Log pesan error asli ke console browser — sebelumnya user cuma lihat
      // teks generik "Terjadi kepadatan jalur komunikasi" tanpa tahu akar
      // masalahnya (limit? error server? network?). Buka DevTools > Console
      // buat lihat detail ini kalau chat gagal lagi.
      console.error('[Chat] /api/career-coach gagal:', err.message, err)
      if (err.limitReached) {
        pushBot('Chat hari ini sudah habis 🙏 Upgrade ke Premium untuk lanjut ngobrol tanpa batas.')
        setTimeout(() => window.dispatchEvent(new CustomEvent('show-upgrade', { detail: {} })), 1200)
      } else {
        pushBot('Terjadi kepadatan jalur komunikasi. Sampaikan ulang poin terakhirmu.')
      }
    })
    .finally(() => setLoading(false))
  }

  return (
    <>
    <div ref={containerRef} style={{
      position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480, height: '100vh',
      display: 'flex', flexDirection: 'column',
      background: DA.chatBg, backgroundImage: DA.chatBgImage,
      overflow: 'hidden',
    }}>
      {showRedeemModal && <RedeemCodeModal userId={user?.id} onClose={() => setShowRedeemModal(false)} />}

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div style={{
        background: DA.headerBg, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${DA.headerBorder}`,
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0, zIndex: 10,
      }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img src="/diah-anna.png" alt="Diah Anna" style={{
            width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top',
            border: `2px solid ${DA.avatarRing}`, boxShadow: `0 0 14px ${DA.avatarGlow}`,
          }}/>
          <span style={{
            position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: '50%',
            background: '#34D399', border: '2px solid #14101B',
          }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.98rem', lineHeight: 1.2, letterSpacing: '-0.2px' }}>
            Diah Anna
          </div>
          <div style={{ color: DA.headerSub, fontSize: '0.72rem', fontWeight: 500 }}>Selalu ada buat dengerin</div>
        </div>

        {plan === 'premium' && daysRemaining !== null && (
          <div
            title={daysRemaining <= 7 ? 'Paket Premium kamu akan segera berakhir' : 'Sisa masa aktif Premium'}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: '#fff',
              background: daysRemaining <= 7 ? 'rgba(251,113,133,0.22)' : 'rgba(139,92,246,0.22)',
              border: `1px solid ${daysRemaining <= 7 ? 'rgba(251,113,133,0.5)' : 'rgba(139,92,246,0.45)'}`,
              whiteSpace: 'nowrap',
            }}
          >
            ⭐ {daysRemaining === 0 ? 'Hari ini terakhir' : `${daysRemaining} hari lagi`}
          </div>
        )}

        {plan !== 'premium' && (
          <button
            onClick={() => setShowRedeemModal(true)}
            title="Sudah punya kode redeem premium? Klik untuk aktivasi"
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: '#fff',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
              whiteSpace: 'nowrap', cursor: 'pointer',
            }}
          >
            🎟️ Kode redeem?
          </button>
        )}

        <button
          onClick={() => setShowMenu(true)}
          aria-label="Menu"
          style={{
            flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: '1.1rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', lineHeight: 1,
          }}
        >
          ⋮
        </button>
      </div>

      {showMenu && (
        <>
          <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 60, right: 12, zIndex: 41,
            background: '#1C1626', border: '1px solid rgba(139,92,246,0.25)',
            borderRadius: 14, overflow: 'hidden', minWidth: 200,
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          }}>
            {[
              { label: '👤  Profil & Pengaturan', onClick: () => navigate('/profile') },
              { label: '🎟️  Kode Redeem', onClick: () => setShowRedeemModal(true) },
              { label: '📤  Ajak Teman', onClick: () => setShowShareApp(true) },
              { label: '🚪  Keluar', onClick: async () => { await supabase.auth.signOut(); navigate('/') }, danger: true },
            ].map((item, i) => (
              <button
                key={i}
                onClick={() => { setShowMenu(false); item.onClick() }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '13px 16px', background: 'none', border: 'none',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  color: item.danger ? '#FB7185' : 'rgba(255,255,255,0.88)',
                  fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {showRenewalReminder && (
        <div
          onClick={() => navigate('/pricing')}
          style={{
            background: 'linear-gradient(90deg, rgba(251,113,133,0.16), rgba(139,92,246,0.16))',
            borderBottom: `1px solid ${DA.headerBorder}`,
            padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0, cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '1.05rem' }}>⏳</span>
          <div style={{ flex: 1, fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.35 }}>
            <strong>
              {daysRemaining === 0
                ? 'Paket Premium kamu habis hari ini.'
                : `Paket Premium kamu tinggal ${daysRemaining} hari lagi.`}
            </strong>{' '}
            Perpanjang biar akses tetap lancar.
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#FB7185', flexShrink: 0 }}>Perpanjang ›</span>
        </div>
      )}

      {/* ── MESSAGES ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {messages.map(msg => {
          const isUser = msg.role === 'user'
          return (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
              {!isUser && (
                <img src="/diah-anna.png" alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, opacity: 0.9 }} />
              )}
              <div style={{
                maxWidth: '78%',
                background: isUser ? DA.bubbleUser : DA.bubbleBot,
                border: isUser ? 'none' : `1px solid ${DA.bubbleBotBorder}`,
                borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                padding: '11px 14px', fontSize: '0.9rem', lineHeight: 1.6,
                boxShadow: isUser ? '0 2px 14px rgba(139,92,246,0.25)' : '0 1px 6px rgba(0,0,0,0.18)',
                color: isUser ? '#fff' : DA.bubbleBotText,
                wordBreak: 'break-word',
              }}>
                <div dangerouslySetInnerHTML={{ __html: renderMd(msg.text) }} />
              </div>
            </div>
            {msg.quickReplies && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 6, marginLeft: 32, flexWrap: 'wrap' }}>
                {msg.quickReplies.map((qr, i) => (
                  <button
                    key={i}
                    onClick={() => { /* qr.action lain ditangani di sini kalau perlu di masa depan */ }}
                    style={{
                      background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.4)',
                      color: '#C4B5FD', borderRadius: 999, padding: '6px 14px',
                      fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {qr.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )
        })}

        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <img src="/diah-anna.png" alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, opacity: 0.9 }} />
            <div style={{
              background: DA.bubbleBot, border: `1px solid ${DA.bubbleBotBorder}`,
              borderRadius: '16px 16px 16px 4px', padding: '13px 16px',
              display: 'flex', gap: 4, alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.55)',
                  animation: `daTypingDot 1.1s ease-in-out ${i * 0.15}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} style={{ height: 4 }} />
      </div>

      {/* ── INPUT BAR ──────────────────────────────────────────────────── */}
      <div style={{
        background: DA.inputBarBg, borderTop: `1px solid ${DA.headerBorder}`,
        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !loading) { e.preventDefault(); handleSend() } }}
          placeholder="Cerita aja, aku dengerin..." disabled={loading}
          style={{
            flex: 1, background: DA.inputBg, border: `1px solid ${DA.inputBorder}`,
            borderRadius: 24, padding: '11px 16px', fontSize: '0.9rem', color: '#fff',
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button onClick={() => handleSend()} disabled={loading || !input.trim()}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: !loading && input.trim() ? DA.sendGrad : 'rgba(255,255,255,0.1)',
            color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: !loading && input.trim() ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s ease',
          }}>➤</button>
      </div>

      <style>{`
        @keyframes daTypingDot { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
      `}</style>
    </div>
    </>
  )
}
