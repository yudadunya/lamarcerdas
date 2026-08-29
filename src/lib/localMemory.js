/**
 * localMemory.js — Local-first memory layer untuk Diah Anna
 * =============================================================================
 * Semua data sensitif (chat history, Genome, RSI patterns, ringkasan hidup
 * user) disimpan 100% di device lewat IndexedDB. Tidak pernah dikirim ke
 * Supabase dalam bentuk mentah. Yang boleh dikirim ke backend hanya:
 *   - teks pesan user saat itu (dikirim ke Cerebras via server proxy, TIDAK
 *     disimpan permanen di server — lihat api/lib/chat.js)
 *   - system prompt yang sudah dirakit di client (berisi ringkasan lokal)
 *
 * Struktur DB:
 *   - genome        : { id: 'main', ...profil dasar }
 *   - rsiPatterns    : { id, type, description, confidence, examples[], updatedAt }
 *   - chatMessages   : { id, role, content, createdAt, sessionId }
 *   - summaries      : { id: 'rolling', text, updatedAt, coveredUntil }
 *   - settings       : { id: 'main', notifFrequency, notifEnabled, ... }
 *   - journalEntries : { id, text, mood, createdAt } — Jurnal Refleksi, murni
 *     tulisan pribadi user, TIDAK PERNAH dikirim ke server dalam bentuk
 *     apa pun (beda dari chatMessages/summaries yang ikut jadi konteks
 *     prompt ke AI) — ini ruang privat 100% di device.
 *
 * Kenapa summaries penting: Cerebras free tier context window kecil (~8k).
 * Kita TIDAK bisa kirim seluruh chat history. Solusinya: setiap N pesan,
 * ringkas percakapan lama jadi 1 paragraf padat (summary bergulir), lalu
 * hanya kirim: genome ringkas + rsi patterns teratas + summary + 6-8 pesan
 * terakhir. Ini yang bikin Diah Anna tetap "inget banyak" walau context kecil.
 */

const DB_NAME = 'diahanna_local_v1'
const DB_VERSION = 2
const STORES = ['genome', 'rsiPatterns', 'chatMessages', 'summaries', 'settings', 'journalEntries']

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('genome')) {
        db.createObjectStore('genome', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('rsiPatterns')) {
        const store = db.createObjectStore('rsiPatterns', { keyPath: 'id' })
        store.createIndex('type', 'type', { unique: false })
      }
      if (!db.objectStoreNames.contains('chatMessages')) {
        const store = db.createObjectStore('chatMessages', { keyPath: 'id' })
        store.createIndex('sessionId', 'sessionId', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains('summaries')) {
        db.createObjectStore('summaries', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('journalEntries')) {
        const store = db.createObjectStore('journalEntries', { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx(storeName, mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode)
    const store = t.objectStore(storeName)
    const result = fn(store)
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── Genome ────────────────────────────────────────────────────────────────
export async function getGenome() {
  return tx('genome', 'readonly', (store) => reqToPromise(store.get('main'))).then((v) => v || null)
}

export async function saveGenome(genome) {
  return tx('genome', 'readwrite', (store) => store.put({ id: 'main', ...genome, updatedAt: Date.now() }))
}

// ── RSI Patterns ──────────────────────────────────────────────────────────
export async function getRsiPatterns() {
  return tx('rsiPatterns', 'readonly', (store) => reqToPromise(store.getAll())).then((v) => v || [])
}

export async function upsertRsiPattern(pattern) {
  const id = pattern.id || `${pattern.type}:${pattern.description}`.slice(0, 200)
  return tx('rsiPatterns', 'readwrite', (store) =>
    store.put({ ...pattern, id, updatedAt: Date.now() })
  )
}

// Ambil pola paling relevan buat di-inject ke prompt (hemat token):
// urutkan by confidence, ambil top N.
export async function getTopRsiPatterns(limit = 8) {
  const all = await getRsiPatterns()
  return all
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, limit)
}

// ── Chat messages ─────────────────────────────────────────────────────────
export async function addChatMessage({ role, content, sessionId = 'default' }) {
  const msg = { id: crypto.randomUUID(), role, content, sessionId, createdAt: Date.now() }
  await tx('chatMessages', 'readwrite', (store) => store.put(msg))
  return msg
}

export async function getRecentMessages(sessionId = 'default', limit = 8) {
  const all = await tx('chatMessages', 'readonly', (store) => reqToPromise(store.getAll()))
  return all
    .filter((m) => m.sessionId === sessionId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-limit)
}

export async function countMessagesSince(sessionId, sinceTimestamp) {
  const all = await tx('chatMessages', 'readonly', (store) => reqToPromise(store.getAll()))
  return all.filter((m) => m.sessionId === sessionId && m.createdAt > sinceTimestamp).length
}

// ── Rolling summary ───────────────────────────────────────────────────────
// Dipanggil tiap ~12 pesan: minta model (via api/summarize) meringkas pesan
// lama jadi 1 paragraf, gabung dengan summary sebelumnya. Summary inilah
// yang dikirim ke prompt, BUKAN seluruh riwayat mentah.
export async function getSummary() {
  return tx('summaries', 'readonly', (store) => reqToPromise(store.get('rolling'))).then((v) => v?.text || '')
}

export async function saveSummary(text) {
  return tx('summaries', 'readwrite', (store) =>
    store.put({ id: 'rolling', text, updatedAt: Date.now() })
  )
}

// ── Settings (notifikasi, dsb) ────────────────────────────────────────────
const DEFAULT_SETTINGS = { id: 'main', notifEnabled: true, notifFrequency: 'daily', notifTimeHour: 19 }

export async function getSettings() {
  const s = await tx('settings', 'readonly', (store) => reqToPromise(store.get('main')))
  return s || DEFAULT_SETTINGS
}

export async function saveSettings(patch) {
  const current = await getSettings()
  const next = { ...current, ...patch, id: 'main' }
  await tx('settings', 'readwrite', (store) => store.put(next))
  return next
}

// ── Privasi: hapus semua & export/import backup ──────────────────────────
export async function wipeAllLocalData() {
  const db = await openDB()
  await Promise.all(
    STORES.map(
      (name) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(name, 'readwrite')
          t.objectStore(name).clear()
          t.oncomplete = resolve
          t.onerror = () => reject(t.error)
        })
    )
  )
}

export async function exportBackup() {
  const db = await openDB()
  const dump = {}
  for (const name of STORES) {
    dump[name] = await new Promise((resolve, reject) => {
      const t = db.transaction(name, 'readonly')
      const req = t.objectStore(name).getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return { version: DB_VERSION, exportedAt: Date.now(), data: dump }
}

export async function importBackup(backup) {
  if (!backup?.data) throw new Error('Format backup tidak valid')
  const db = await openDB()
  for (const name of STORES) {
    const rows = backup.data[name] || []
    await new Promise((resolve, reject) => {
      const t = db.transaction(name, 'readwrite')
      const store = t.objectStore(name)
      store.clear()
      for (const row of rows) store.put(row)
      t.oncomplete = resolve
      t.onerror = () => reject(t.error)
    })
  }
}

// ── Jurnal Refleksi ────────────────────────────────────────────────────────
// Tulisan pribadi user — beda dari chatMessages/summaries, ini TIDAK PERNAH
// dikirim ke server dalam bentuk apa pun (tidak ikut jadi konteks prompt AI,
// tidak dianalisis, tidak diringkas). Murni ruang privat di device.
export async function addJournalEntry({ text, mood = null }) {
  const entry = { id: crypto.randomUUID(), text, mood, createdAt: Date.now() }
  await tx('journalEntries', 'readwrite', (store) => store.put(entry))
  return entry
}

export async function updateJournalEntry(id, { text, mood }) {
  const existing = await tx('journalEntries', 'readonly', (store) => reqToPromise(store.get(id)))
  if (!existing) throw new Error('Entri jurnal tidak ditemukan')
  const updated = { ...existing, text, mood, updatedAt: Date.now() }
  await tx('journalEntries', 'readwrite', (store) => store.put(updated))
  return updated
}

export async function deleteJournalEntry(id) {
  return tx('journalEntries', 'readwrite', (store) => store.delete(id))
}

export async function getJournalEntries(limit = 100) {
  const all = await tx('journalEntries', 'readonly', (store) => reqToPromise(store.getAll()))
  return (all || []).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}
