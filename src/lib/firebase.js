// src/lib/firebase.js
// Firebase client-side setup untuk push notifications
import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: 'AIzaSyAVP1_bVJN5bmZFGpKo3dXth-b7aj1CX94',
  authDomain: 'verneks-notif.firebaseapp.com',
  projectId: 'verneks-notif',
  storageBucket: 'verneks-notif.firebasestorage.app',
  messagingSenderId: '327640011095',
  appId: '1:327640011095:web:7d3c08ad62d3ad425c2e12',
  measurementId: 'G-1HWTF155KZ'
}

// FIX: VAPID key sebelumnya sudah tidak sinkron dengan key pair yang aktif
// di Firebase Console (Project Settings → Cloud Messaging → Web Push
// certificates) — kemungkinan key pair di project sempat di-rotate/generate
// ulang, tapi kode di sini tidak ikut di-update. Akibatnya: getToken() tetap
// berhasil membuat token secara lokal (karena cuma butuh format key yang
// valid, bukan yang harus sinkron ke server), tapi pesan yang dikirim lewat
// Firebase Console/Admin SDK — yang pakai key pair TERKINI di project —
// tidak pernah nyampe ke token yang ternyata dibuat pakai key LAMA.
//
// Dipindah ke env var (VITE_FIREBASE_VAPID_KEY) supaya kalau key pair
// di-rotate lagi di masa depan, tinggal ganti value di Vercel dashboard
// (Settings → Environment Variables) + redeploy — tidak perlu edit file ini.
// PENTING: Vite nge-bake env var ke bundle SAAT BUILD, bukan runtime — jadi
// ganti value di Vercel tetap butuh trigger redeploy baru supaya kepakai,
// nggak otomatis kebaca kalau cuma restart/reload.
// Fallback ke value hardcoded ini kalau env var belum di-set (misal lupa
// nambahin di Vercel), supaya tidak diam-diam break jadi undefined.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY
  || 'BM1tJxYCQLK1zgHpabUjHY-JvyBHPOYlQzaQ7N_Gvfs7TzL60Pd48shzDwYQj_vnbMrOmgWapS3CgMJfXAARYZ0'

const app = initializeApp(firebaseConfig)
export const messaging = getMessaging(app)

/**
 * Request permission & get FCM token dari user browser
 * Simpan token ke Supabase untuk kirim push nanti
 */
/**
 * Ambil FCM token dari browser (asumsi izin SUDAH granted) dan simpan ke
 * Supabase. Tidak memanggil Notification.requestPermission() sama sekali —
 * jadi aman dipanggil otomatis tanpa gesture user, karena getToken() TIDAK
 * memunculkan prompt apa pun kalau izinnya sudah granted (prompt cuma
 * muncul saat status masih 'default', dan itu satu-satunya bagian yang
 * butuh gesture asli).
 */
async function fetchAndSaveFcmToken(userId) {
  // FIX: sebelumnya getToken() dipanggil tanpa serviceWorkerRegistration —
  // itu bikin Firebase SDK mencoba REGISTRASI SENDIRI service worker secara
  // implisit (kelihatan dari scope anehnya: firebase-cloud-messaging-
  // push-scope, bukan scope biasa "/"), alih-alih pakai worker yang sudah
  // kita daftarkan manual & sudah pasti aktif lewat registerServiceWorker().
  // Sekarang eksplisit nunggu registrasi kita SENDIRI yang sudah siap, lalu
  // itu yang dioper ke getToken() — Firebase tidak perlu coba daftar ulang.
  const registration = await navigator.serviceWorker.ready
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
  if (!token) {
    console.warn('Gagal mendapat FCM token')
    return null
  }
  console.log('FCM Token:', token)
  if (userId) {
    await fetch('/api/utils?action=save-fcm-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, token })
    })
  }
  return token
}

/**
 * Dipanggil dari TOMBOL (gesture user asli) — ini yang boleh memicu prompt
 * izin browser kalau statusnya masih 'default'.
 */
export async function requestNotificationPermission(userId) {
  try {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker tidak didukung')
      return { permission: 'unsupported', token: null }
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.log('User denied notification permission')
      return { permission, token: null }
    }

    // FIX: sebelumnya caller (Profile.jsx) baca ulang `Notification.permission`
    // secara terpisah SETELAH fungsi ini selesai, buat update UI tombolnya.
    // Di beberapa TWA/WebView, nilai itu belum tentu langsung ke-sync balik
    // ke JS meski izinnya udah beneran granted di level Android — jadi
    // tombolnya kelihatan "balik lagi kayak belum diklik" walau izinnya
    // sebenarnya berhasil. Sekarang `permission` yang otoritatif (hasil
    // langsung dari requestPermission() di atas) dikembalikan eksplisit,
    // caller tinggal pakai ini, tidak perlu baca ulang state yang bisa basi.
    const token = await fetchAndSaveFcmToken(userId)
    return { permission, token }
  } catch (error) {
    console.error('Error requesting notification permission:', error)
    return { permission: 'error', token: null }
  }
}

/**
 * Dipanggil OTOMATIS tiap login (aman, tanpa gesture) — HANYA jalan kalau
 * izin browser sudah 'granted' dari sebelumnya (user lama). Tujuannya:
 * refresh/pastikan token FCM tersimpan terbaru di Supabase tiap login,
 * tanpa perlu user klik tombol lagi kalau memang sudah pernah izinkan.
 * Kalau status masih 'default' atau 'denied', ini sengaja tidak melakukan
 * apa-apa — biar tetap konsisten, permintaan izin baru cuma lewat tombol.
 */
export async function refreshFcmTokenIfGranted(userId) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null
    if (!('serviceWorker' in navigator)) return null
    return await fetchAndSaveFcmToken(userId)
  } catch (error) {
    console.error('Error refreshing FCM token:', error)
    return null
  }
}

/**
 * Listen for incoming messages
 * Dipanggil saat app aktif
 */
export function listenForMessages(onMessageCallback) {
  onMessage(messaging, (payload) => {
    console.log('Message received:', payload)
    
    const { notification, data } = payload
    
    if (onMessageCallback) {
      onMessageCallback({
        title: notification?.title,
        body: notification?.body,
        data: data
      })
    }

    // Tampilkan notification UI custom kalau perlu
    if (notification) {
      // Bisa show toast, modal, atau custom notification
      console.log(`Notifikasi: ${notification.title} - ${notification.body}`)
    }
  })
}

/**
 * Register service worker untuk handle push saat app tutup
 */
export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/firebase-messaging-sw.js')
      console.log('Service Worker registered for push notifications')
    } catch (error) {
      console.error('Service Worker registration failed:', error)
    }
  }
}
