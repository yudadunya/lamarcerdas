// public/firebase-messaging-sw.js
// Service Worker untuk handle Firebase push notifications
// File ini harus di /public folder
//
// CATATAN VERSI: sengaja TIDAK pakai versi persis sama dengan npm package
// (12.16.0) — versi serilis itu kadang belum lengkap ter-mirror di CDN
// gstatic (ada laporan resmi ke tim Firebase soal bundle messaging-compat
// yang 404 untuk versi yang baru rilis). Dipakai 10.13.2 karena ini versi
// yang dipakai berulang di CONTOH RESMI dokumentasi Firebase sendiri untuk
// firebase-messaging-sw.js — dipastikan selalu tersedia di CDN. Compat layer
// untuk operasi dasar FCM (initializeApp, messaging(), onBackgroundMessage)
// stabil lintas versi 10.x-12.x, jadi aman dipasangkan dengan app utama yang
// pakai npm package firebase v12.16.0.

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js')

const firebaseConfig = {
  apiKey: 'AIzaSyAVP1_bVJN5bmZFGpKo3dXth-b7aj1CX94',
  authDomain: 'verneks-notif.firebaseapp.com',
  projectId: 'verneks-notif',
  storageBucket: 'verneks-notif.firebasestorage.app',
  messagingSenderId: '327640011095',
  appId: '1:327640011095:web:7d3c08ad62d3ad425c2e12',
  measurementId: 'G-1HWTF155KZ'
}

firebase.initializeApp(firebaseConfig)
const messaging = firebase.messaging()

// Handle push notification saat app tutup
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Received background message:', payload)

  const { notification, data } = payload
  const notificationTitle = notification?.title || 'Diah Anna'
  const notificationOptions = {
    body: notification?.body || 'Ada pesan untukmu',
    icon: 'https://verneks.my.id/icons/icon-192x192.png', // FIX: sebelumnya path ke /icon-192x192.png (root) — 404, file aslinya di /icons/
    // FIX: badge dihapus — 'badge-72x72.png' tidak pernah ada di project ini sama sekali (cek public/icons/, isinya cuma icon-*.png), jadi selalu 404
    tag: data?.type || 'default',
    data: data || {},
    click_action: 'https://verneks.my.id/dashboard'
  }

  self.registration.showNotification(notificationTitle, notificationOptions)
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw] Notification clicked:', event.notification)
  event.notification.close()

  // FIX: sebelumnya SELALU buka '/dashboard' apapun action-nya — data.action
  // yang dikirim dari backend (open-chat, open-journey, dst) tidak pernah
  // dibaca sama sekali. Sekarang di-route sesuai action-nya.
  const action = event.notification.data?.action
  const targetPath = {
    'open-chat':    '/chat',
    'open-journey': '/journey',
    // open-upgrade: bukan route halaman biasa — /profile?upgrade=1 dibaca
    // oleh App.jsx untuk men-trigger UpgradeModal begitu app kebuka
    // (lihat useEffect 'upgrade' query param di App.jsx), karena service
    // worker tidak bisa langsung memanggil fungsi React di halaman yang
    // belum ter-load.
    'open-upgrade': '/profile?upgrade=1',
  }[action] || '/dashboard'
  const targetUrl = `https://verneks.my.id${targetPath}`

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let client of clientList) {
        if (client.url === 'https://verneks.my.id/' && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})

// ═══════════════════════════════════════════════════════════════════════
// ── CACHING / FETCH HANDLER ───────────────────────────────────────────────
// Digabung ke sini dari public/sw.js (yang sebelumnya tidak pernah
// benar-benar didaftarkan browser — dead code). Chrome mensyaratkan service
// worker dengan fetch handler supaya situs dianggap "installable" sebagai
// PWA (ikon install muncul) — sebelumnya SW yang aktif (file ini) tidak
// punya fetch handler sama sekali, jadi ikon install tidak pernah muncul.
// Digabung jadi SATU file (bukan didaftarkan terpisah) supaya tidak ada 2
// service worker rebutan scope yang sama.
const CACHE = 'lamarcerdas-v4'

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // KRITIS: JANGAN pernah intercept request ke domain lain (Supabase auth,
  // Firebase, CDN, dll) — cuma tangani request ke origin sendiri. Kalau
  // tidak, ini bisa bikin sesi login gagal aneh karena kena logic
  // cache/offline SW yang tidak seharusnya menyentuh request auth.
  if (url.origin !== self.location.origin) return

  // API sendiri — selalu network
  if (url.pathname.startsWith('/api/')) return

  // Navigasi SPA — network dulu, fallback ke index.html kalau offline
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Aset statis situs sendiri — cache first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      }).catch(() => new Response('', { status: 408, statusText: 'Offline' }))
    })
  )
})

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
