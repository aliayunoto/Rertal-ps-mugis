# 🎮 PS3 Rental Manager

Aplikasi web responsif (PWA) untuk manajemen rental PS3 dengan sinkronisasi real-time multi-admin menggunakan Firebase Realtime Database.

---

## ✨ Fitur Utama

- ✅ **Real-time Multi-Admin** — Buka di banyak HP sekaligus, data selalu sinkron
- ✅ **8 Unit TV/PS3** — Grid card dengan indikator warna status
- ✅ **Mode Paket Jam** — Countdown timer + alarm saat waktu habis
- ✅ **Mode Open Time** — Timer hitung maju, biaya otomatis saat Stop
- ✅ **Tarif Rp 4.000/jam** — Kalkulasi otomatis & proporsional
- ✅ **Status Bayar** — Lunas / Bayar Nanti
- ✅ **Laporan Keuangan** — Harian, mingguan, bulanan, semua transaksi
- ✅ **Notifikasi Alarm** — Suara saat waktu paket habis
- ✅ **PWA** — Bisa diinstall sebagai app di Android

---

## 🚀 Cara Setup Firebase (Wajib — Gratis!)

### Langkah 1: Buat Firebase Project

1. Buka [https://console.firebase.google.com](https://console.firebase.google.com)
2. Klik **"Add project"** → isi nama project (misal: `rental-ps3-saya`)
3. Nonaktifkan Google Analytics (opsional) → klik **"Create project"**

### Langkah 2: Tambahkan Web App

1. Di dashboard Firebase, klik ikon **`</>`** (Web App)
2. Isi nama app (misal: `PS3 Rental Web`)
3. **Jangan** centang Firebase Hosting (opsional nanti)
4. Klik **"Register app"**
5. **Salin seluruh konfigurasi** yang muncul (berupa object `firebaseConfig`)

### Langkah 3: Aktifkan Realtime Database

1. Di menu kiri: **Build → Realtime Database**
2. Klik **"Create Database"**
3. Pilih lokasi: **Singapore (asia-southeast1)** ← paling dekat dengan Indonesia
4. Pilih mode **"Start in test mode"** (untuk development)
5. Klik **"Enable"**

### Langkah 4: Isi Konfigurasi di Aplikasi

Buka file **`firebase-config.js`** dan ganti nilai-nilainya:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",           // ← dari Firebase Console
  authDomain: "rental-ps3-saya.firebaseapp.com",
  databaseURL: "https://rental-ps3-saya-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rental-ps3-saya",
  storageBucket: "rental-ps3-saya.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### Langkah 5: Jalankan Aplikasi

Karena aplikasi menggunakan ES Modules (`import`), harus dijalankan melalui HTTP server (bukan buka file langsung).

**Cara termudah — gunakan VS Code Live Server:**
1. Install extension **Live Server** di VS Code
2. Klik kanan `index.html` → **"Open with Live Server"**
3. Browser akan otomatis terbuka di `http://127.0.0.1:5500`

**Cara alternatif — Python:**
```bash
# Di folder ps3-rental-app
python -m http.server 8080
# Buka http://localhost:8080
```

**Cara alternatif — Node.js:**
```bash
npx serve .
```

---

## 📱 Install sebagai App Android (PWA)

1. Buka aplikasi di browser Chrome Android
2. Tap menu ⋮ → **"Add to Home screen"**
3. Aplikasi akan muncul sebagai icon di layar utama HP

---

## 📂 Struktur File

```
ps3-rental-app/
├── index.html          ← Dashboard utama (unit grid + modal sewa)
├── reports.html        ← Halaman laporan keuangan
├── style.css           ← Design system lengkap (dark premium theme)
├── app.js              ← Logika utama + Firebase + Timer + Audio
├── reports.js          ← Logika halaman laporan
├── firebase-config.js  ← ⚠️ ISI DULU sebelum dijalankan!
└── manifest.json       ← PWA manifest
```

---

## ⚙️ Kustomisasi

Edit file `firebase-config.js`:

```javascript
const TOTAL_UNITS = 8;          // Jumlah unit TV (ubah sesuai kebutuhan)
const RATE_PER_HOUR = 4000;     // Tarif per jam dalam Rupiah
const STORE_NAME = "Rental PS3 — Game Zone";  // Nama toko di header
```

---

## 🔐 Keamanan Firebase (Produksi)

Setelah testing, ubah Rules di Firebase Console agar lebih aman:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

> **Catatan**: Untuk produksi penuh, tambahkan autentikasi Firebase Auth agar hanya admin yang bisa menulis data.

---

## 📞 Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Loading tidak selesai | Periksa konfigurasi di `firebase-config.js` |
| Alarm tidak bunyi | Tap/klik dulu di halaman (browser block autoplay audio) |
| Data tidak sync | Pastikan `databaseURL` sudah benar dan Realtime DB sudah aktif |
| Error CORS | Pastikan dibuka via HTTP server, bukan `file://` |
