# Verneks

> **Kepalamu Lagi Penuh? Cerita Saja.**
>
> Teman curhat AI yang mendengarkan tanpa menghakimi dan membantumu menata pikiran.

---

## Apa Itu Verneks?

**Verneks** adalah ruang aman untuk curhat dan mengelola perasaan. Di dalamnya ada **Diah Anna**—teman ngobrol AI yang hangat, tidak menghakimi, dan selalu ada kapan pun kamu butuh.

Kami percaya bahwa kadang yang paling kamu butuhkan bukanlah solusi instan, melainkan tempat untuk mengeluarkan isi kepala dan didengar dengan tenang.

Verneks hadir untuk hari-hari ketika:

- pikiran terasa penuh dan tidak ada yang bisa diajak bicara,
- kamu ingin curhat tapi takut merepotkan teman,
- atau kamu hanya butuh ruang untuk merenung tanpa dihakimi.

---

## Filosofi

> AI terbaik bukanlah AI yang membuatmu bergantung, melainkan AI yang membantumu semakin mampu mengambil keputusan sendiri.

Kami membangun Verneks dengan prinsip bahwa teknologi harus memberdayakan, bukan menggantikan, hubungan manusia. Diah Anna adalah teman ngobrol, bukan pengganti psikolog, terapis, atau orang-orang terdekatmu.

Jika suatu hari kamu tidak lagi membutuhkan Diah Anna untuk menata pikiran, maka kami merasa telah berhasil menjalankan tugas.

---

## Inti Produk: Diah Anna

Diah Anna bukan sekadar chatbot.

- Dia **mendengarkan dulu**—tidak terburu-buru memberi solusi.
- Dia **memvalidasi perasaanmu**—mengakui apa yang kamu rasakan sebelum membahas apa pun.
- Dia **membantu kamu berpikir jernih**—bukan mengambil alih keputusan, tapi menemanimu menemukan sudut pandang baru.

> Diah Anna adalah AI, dan dia terbuka soal itu. Dia tidak berpura-pura menjadi manusia.

---

## Fitur Utama

### 💬 Chat dengan Diah Anna
- Obrolan santai seperti WhatsApp dengan teman dekat.
- Diah Anna ingat cerita-ceritamu sebelumnya (disimpan di perangkatmu, bukan di server).
- **Gratis** (15 pesan/hari) atau **Premium** (tanpa batas).

### 🧠 Diri Kamu (DNA)
- Analisis pola emosional dari obrolanmu.
- 6 Trait Diri: Kesadaran Diri, Ketahanan, Coping Kreatif, Keterbukaan, Komunikasi Emosi, dan Empati.
- Insight personal tentang kekuatan dan area yang bisa dikembangkan.

### 🗺️ Journey (Perjalanan Self-Care)
- Peta langkah-langkah kecil menuju keseimbangan emosional.
- Milestone yang bisa kamu tandai selesai.
- Disesuaikan dengan kondisi dan kebutuhanmu.

### 🌿 Rekomendasi Aktivitas
- Saran aktivitas nyata yang cocok dengan mood dan polamu.
- Contoh: journaling, olahraga ringan, quality time, dll.
- Tersedia untuk pengguna Premium.

### 📚 Blog
- Bacaan santai seputar overthinking, kesehatan mental, hubungan, dan self-care.
- Ditulis dengan gaya teman, bukan jurnal ilmiah.
- Dilengkapi FAQ yang informatif.

---

## Privasi: Data Kamu, Di Perangkatmu

**Ini adalah janji utama Verneks.**

- Semua riwayat chat, ringkasan, dan pola perilaku yang Diah Anna pelajari tentangmu **disimpan secara lokal di perangkatmu** (IndexedDB).
- Kami tidak pernah menyimpan isi curhatmu di server.
- Saat kamu mengirim pesan, teks diproses sementara oleh AI untuk menghasilkan balasan, lalu dilupakan.
- Kamu bisa menghapus semua data lokal kapan saja.

> Kami tidak pernah membaca, menyimpan, atau menjual ceritamu. Privasi adalah fondasi kami.

---

## Model Bisnis (Freemium)

| Paket | Harga | Fitur |
|-------|-------|-------|
| **Gratis** | Rp0 | 15 chat/hari, DNA, Blog, panduan dasar |
| **Premium** | Rp99.000 / 30 hari | Chat tanpa batas, Journey lengkap, Rekomendasi aktivitas, insight mingguan |

---

## Teknologi

### Frontend
- React 19 + Vite
- React Router
- CSS Modules / Tailwind (tergantung implementasi)

### Backend
- Vercel Serverless Functions (Node.js)

### AI Engine
- OpenRouter (gateway ke berbagai model AI: Claude, Gemini, dll.)
- Fallback otomatis untuk menjaga ketersediaan

### Database & Authentication
- Supabase (hanya untuk autentikasi Google dan manajemen subscription)

### Penyimpanan Lokal
- IndexedDB (untuk chat history dan memori lokal)

### Deployment
- Vercel

---

## Struktur Repository
