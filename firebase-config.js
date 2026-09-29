// ============================================================
//  FIREBASE CONFIGURATION — Rental PS Mugis
//  Isi dengan kredensial Firebase project Anda sendiri.
//  Cara mendapatkannya:
//  1. Buka https://console.firebase.google.com
//  2. Buat project baru (atau pilih yang sudah ada)
//  3. Klik ikon </> (Web) untuk menambahkan web app
//  4. Copy konfigurasi di bawah ini dari Firebase Console
//  5. Aktifkan Realtime Database di menu Build > Realtime Database
//  6. Set Rules ke "test mode" (untuk development):
//     { "rules": { ".read": true, ".write": true } }
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAHXJDLASNzAC3sgHbPcvvx1tpAxLYkK--",
  authDomain: "rental-ps-mugis.firebaseapp.com",
  databaseURL: "https://rental-ps-mugis-default-rtdb.firebaseio.com",
  projectId: "rental-ps-mugis",
  storageBucket: "rental-ps-mugis.firebasestorage.app",
  messagingSenderId: "760570478547",
  appId: "1:760570478547:web:d3139d5275496f788e3f42"
};

// ── Pengaturan Aplikasi ───────────────────────────────────────
// Jumlah unit TV/PS3
const TOTAL_UNITS = 8;

// Tarif sewa per jam (Rupiah)
const RATE_PER_HOUR = 4000;

// Nama toko — tampil di header aplikasi
const STORE_NAME = "Rental PS Mugis";
