import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJournalEntries, addJournalEntry, updateJournalEntry, deleteJournalEntry } from '../lib/localMemory'

const MOODS = [
  { emoji: '😊', label: 'Baik' },
  { emoji: '😐', label: 'Biasa' },
  { emoji: '😔', label: 'Berat' },
  { emoji: '😰', label: 'Cemas' },
  { emoji: '😤', label: 'Kesal' },
]

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function JurnalRefleksi({ user, loading = false }) {
  const navigate = useNavigate()
  const [entries, setEntries]   = useState([])
  const [ready, setReady]       = useState(false)
  const [writing, setWriting]   = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draftText, setDraftText] = useState('')
  const [draftMood, setDraftMood] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  useEffect(() => {
    if (loading) return
    if (!user) { navigate('/'); return }
    loadEntries()
  }, [user?.id, loading])

  const loadEntries = () => {
    getJournalEntries(200).then(list => { setEntries(list); setReady(true) }).catch(() => setReady(true))
  }

  const startNew = () => {
    setEditingId(null)
    setDraftText('')
    setDraftMood(null)
    setWriting(true)
  }

  const startEdit = (entry) => {
    setEditingId(entry.id)
    setDraftText(entry.text)
    setDraftMood(entry.mood)
    setWriting(true)
  }

  const handleSave = async () => {
    const text = draftText.trim()
    if (!text) return
    if (editingId) {
      await updateJournalEntry(editingId, { text, mood: draftMood })
    } else {
      await addJournalEntry({ text, mood: draftMood })
    }
    setWriting(false)
    loadEntries()
  }

  const handleDelete = async (id) => {
    await deleteJournalEntry(id)
    setConfirmDeleteId(null)
    loadEntries()
  }

  if (!user || !ready) return null

  return (
    <div style={{ minHeight: '100vh', background: '#14101B', paddingBottom: '80px' }}>
      <div style={{
        padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(20,16,27,0.92)', backdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => writing ? setWriting(false) : navigate('/tentang-kamu')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1.2rem', cursor: 'pointer', padding: 0 }}
        >
          ←
        </button>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', flex: 1 }}>📔 Jurnal Refleksi</div>
        {!writing && (
          <button
            onClick={startNew}
            style={{ background: 'linear-gradient(135deg,#8B5CF6,#FB7185)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            +
          </button>
        )}
      </div>

      <div style={{ padding: '18px 16px', maxWidth: 480, margin: '0 auto' }}>

        {writing ? (
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', lineHeight: 1.6, marginBottom: 16 }}>
              Cuma buat kamu sendiri — nggak pernah dibaca Diah Anna atau siapa pun, tersimpan lokal di HP/laptopmu.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {MOODS.map(m => (
                <button
                  key={m.label}
                  onClick={() => setDraftMood(draftMood === m.label ? null : m.label)}
                  style={{
                    padding: '7px 12px', borderRadius: 999, fontSize: '0.8rem', cursor: 'pointer',
                    background: draftMood === m.label ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                    border: draftMood === m.label ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                  }}
                >
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>

            <textarea
              value={draftText}
              onChange={e => setDraftText(e.target.value)}
              placeholder="Tulis apa aja yang lagi kamu rasain atau pikirin..."
              autoFocus
              style={{
                width: '100%', minHeight: 220, background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14,
                padding: '14px', color: '#fff', fontSize: '0.92rem', lineHeight: 1.6,
                fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />

            <button
              onClick={handleSave}
              disabled={!draftText.trim()}
              style={{
                width: '100%', marginTop: 14, padding: '13px',
                background: draftText.trim() ? 'linear-gradient(135deg,#8B5CF6,#FB7185)' : 'rgba(255,255,255,0.08)',
                color: '#fff', fontWeight: 700, borderRadius: 12, border: 'none',
                cursor: draftText.trim() ? 'pointer' : 'not-allowed', fontSize: '0.9rem',
              }}
            >
              {editingId ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '2rem', marginBottom: 14 }}>📔</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', marginBottom: 8 }}>
              Belum ada catatan
            </div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: 20 }}>
              Tulis apa aja yang lagi kamu rasain — nggak perlu rapi, ini cuma buat kamu sendiri.
            </div>
            <button
              onClick={startNew}
              style={{ padding: '11px 26px', background: 'linear-gradient(135deg,#8B5CF6,#FB7185)', color: '#fff', fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              + Tulis Catatan Pertama
            </button>
          </div>
        ) : (
          entries.map(entry => {
            const mood = MOODS.find(m => m.label === entry.mood)
            return (
              <div key={entry.id} style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14, padding: '15px 16px', marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {mood && <span style={{ fontSize: '0.95rem' }}>{mood.emoji}</span>}
                    <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem' }}>{formatDate(entry.createdAt)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => startEdit(entry)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>Edit</button>
                    {confirmDeleteId === entry.id ? (
                      <button onClick={() => handleDelete(entry.id)} style={{ background: 'none', border: 'none', color: '#FB7185', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Yakin hapus?</button>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(entry.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>Hapus</button>
                    )}
                  </div>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.88rem', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {entry.text}
                </p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
