/* ============================================================
   app.js — Rental PS Mugis (Refactored & Fixed)
   Firebase v8 Compat API + Timer + Time Bank (Simpan Waktu)
   ============================================================ */

"use strict";

let activeSessions = {};

// master data tarif ps3 & ps4
const CONSOLE_PRICING = {
  PS3: {
    rateperhour: 4000,
    package: {
      1: 4000,
      2: 8000,
      3: 12000,
      4: 16000,
      5: 20000,
      6: 24000,
    },
  },
  PS4: {
    rateperhour: 8000,
    package: {
      1: 8000,
      2: 15000,
      3: 23000,
      4: 30000,
      5: 38000,
      6: 45000,
    },
  },
};

//fungsi pembantu hitung harga paket
function getpackagePrice(consoleType, duration) {
  const type = (consoleType || "PS3").toUpperCase();
  const config = CONSOLE_PRICING[type] || CONSOLE_PRICING.PS3;

  if (config.package && config.package[duration]) {
    return config.package[duration];
  }
  return Math.round(duration * config.rateperhour);
}

// ── Game Themes ───────────────────────────────────────────────
const GAME_THEMES = [
  {
    game: "EA Sports FC",
    emoji: "⚽",
    bg: "linear-gradient(160deg,#0a2e1a 0%,#1a5c32 60%,#0d3d22 100%)",
    accent: "#4ade80",
  },
  {
    game: "GTA V",
    emoji: "🏙️",
    bg: "linear-gradient(160deg,#1a0d00 0%,#7c3800 60%,#2d1500 100%)",
    accent: "#f59e0b",
  },
  {
    game: "God of War",
    emoji: "⚔️",
    bg: "linear-gradient(160deg,#2d0000 0%,#7f1d1d 60%,#1a0000 100%)",
    accent: "#ef4444",
  },
  {
    game: "PES",
    emoji: "🏆",
    bg: "linear-gradient(160deg,#00103d 0%,#1e3a8a 60%,#000d2e 100%)",
    accent: "#60a5fa",
  },
  {
    game: "Gran Turismo",
    emoji: "🏎️",
    bg: "linear-gradient(160deg,#0f0820 0%,#3b0764 60%,#150a30 100%)",
    accent: "#a78bfa",
  },
  {
    game: "Tekken",
    emoji: "🥊",
    bg: "linear-gradient(160deg,#1a0800 0%,#9a3412 60%,#3d1500 100%)",
    accent: "#fb923c",
  },
  {
    game: "Call of Duty",
    emoji: "🎯",
    bg: "linear-gradient(160deg,#050505 0%,#2d3748 60%,#101010 100%)",
    accent: "#d1d5db",
  },
  {
    game: "Need for Speed",
    emoji: "💨",
    bg: "linear-gradient(160deg,#001a00 0%,#15803d 60%,#003300 100%)",
    accent: "#86efac",
  },
];

function getThemeIndex(unitId) {
  const num = parseInt(unitId.replace("tv", ""), 10) - 1;
  return Math.max(0, Math.min(num, GAME_THEMES.length - 1));
}

// ── State ─────────────────────────────────────────────────────
let db = null;
let unitsRef = null;
let txnsRef = null;
let timeBankRef = null;

const timerIntervals = {};
const alarmPlayed = {};
let audioCtx = null;
let activeModalUnit = null;
let stopUnitData = null;
let stopRemainingSec = 0; // sisa detik saat Stop modal dibuka

let selectedMode = "package";
let selectedDuration = 1;
let selectedPay = "paid";
let stopPayStatus = "paid";

// Time Bank state
let timeBankData = {};
let selectedTimeBankEntry = null; // { id, data }

// ── Firebase Init ─────────────────────────────────────────────
function initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    unitsRef = db.ref("units");
    txnsRef = db.ref("transactions");
    timeBankRef = db.ref("timeBank");

    initializeUnits()
      .then(() => {
        startRealtimeListeners();
        const overlay = document.getElementById("loadingOverlay");
        if (overlay) overlay.classList.add("hidden");
        showToast("🔥", "Terhubung ke Firebase", "Real-time sync aktif", 3000);
      })
      .catch((err) => {
        showFbError(err.message);
      });
  } catch (err) {
    showFbError(err.message);
  }
}

function showFbError(msg) {
  const el = document.getElementById("loadingText");
  if (el)
    el.textContent = `⚠️ Gagal terhubung. Periksa konfigurasi Firebase. (${msg})`;
}

// ── Initialize Units ──────────────────────────────────────────
async function initializeUnits() {
  const snapshot = await unitsRef.once("value");
  if (!snapshot.exists()) {
    const updates = {};
    for (let i = 1; i <= TOTAL_UNITS; i++) {
      updates[`tv${i}`] = {
        id: `tv${i}`,
        name: `TV ${i}`,
        status: "ready",
        session: null,
      };
    }
    await unitsRef.set(updates);
  }
}

// ── Real-time Listeners ───────────────────────────────────────
function startRealtimeListeners() {
  // Units listener
  unitsRef.on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    Object.values(data).forEach((unit) => {
      renderUnitCard(unit);
    });
    updateSummaryBar(data);
  });

  // Time Bank listener
  timeBankRef.on("value", (snapshot) => {
    timeBankData = snapshot.val() || {};
    updateTimeBankBadge();
    const tbOverlay = document.getElementById("timeBankModalOverlay");
    if (tbOverlay && tbOverlay.classList.contains("open")) {
      renderTimeBankList();
    }
  });
}

// ── Render Unit Card ──────────────────────────────────────────
function renderUnitCard(unit) {
  const card = document.getElementById(`card-${unit.id}`);
  if (!card) return;

  const isPlaying = unit.status === "playing" && unit.session;
  const theme = GAME_THEMES[getThemeIndex(unit.id)];

  // Hentikan timer berjalan sebelum merender ulang card
  if (timerIntervals[unit.id]) {
    clearInterval(timerIntervals[unit.id]);
    delete timerIntervals[unit.id];
  }

  card.style.background = theme.bg;
  card.className = `unit-card ${isPlaying ? "playing" : "ready"}`;

  if (!isPlaying) {
    // ── READY STATE ──────────────────────────────────────────
    card.innerHTML = `
      <span class="unit-status-badge"></span>
      <div class="card-game-emoji" style="color:${theme.accent}">${theme.emoji}</div>
      <div class="card-game-name" style="color:${theme.accent}">${theme.game}</div>
      <div class="unit-name">${unit.name}</div>
      <div class="unit-status-text">Kosong</div>
      <div class="card-tap-hint">Tap untuk sewa</div>
    `;
    card.onclick = () => {
      openRentModal(unit);
    };
  } else {
    // ── PLAYING STATE ─────────────────────────────────────────
    const s = unit.session;
    const mode = s.mode;
    const isResumed = s.resumedFromSec != null;

    const modeLabel = isResumed
      ? "🕰️ Lanjut Sisa"
      : mode === "package"
        ? "📦 Paket"
        : "⏱️ Open Time";
    const timerClass =
      mode === "package" || isResumed ? "countdown" : "counting";
    const payLabel = isResumed
      ? "✅ Sudah Dibayar"
      : s.payStatus === "paid"
        ? "✅ Lunas"
        : "⏳ Bayar Nanti";
    const payClass = isResumed ? "paid" : s.payStatus || "paid";

    card.innerHTML = `
      <span class="unit-status-badge"></span>
      <div class="card-game-emoji playing-emoji">${theme.emoji}</div>
      <div class="unit-name">${unit.name}</div>
      <div class="unit-status-text">Sedang Main</div>
      <div class="unit-mode">${modeLabel}</div>
      <div class="unit-timer ${timerClass}" id="timer-${unit.id}">--:--:--</div>
      <div class="unit-cost" id="cost-${unit.id}" style="color:${theme.accent}">Rp 0</div>
      <div class="unit-pay-status ${payClass}">${payLabel}</div>
      ${s.customerName ? `<div class="unit-customer">👤 ${s.customerName}</div>` : ""}
      <button class="btn-stop-card" id="stop-btn-${unit.id}">⏹ Stop</button>
    `;

    card.onclick = null;

    const stopBtn = document.getElementById(`stop-btn-${unit.id}`);
    if (stopBtn) {
      stopBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openStopModal(unit.id);
      });
    }

    startCardTimer(unit);
  }
}

// ── Card Timer Engine ─────────────────────────────────────────
function startCardTimer(unit) {
  const uid = unit.id;

  // 1. Ambil data session (baik jika dibungkus 'unit.session' maupun langsung di 'unit')
  const sessData = unit.session || unit;

  const hourlyRate =
    typeof RATE_PER_HOUR !== "undefined" ? RATE_PER_HOUR : 4000;
  const packageCost = sessData.totalCost || sessData.price || 0;

  // Normalisasi timestamp
  let rawStart = sessData.startTime || Date.now();
  if (typeof rawStart === "number" && rawStart < 10000000000) {
    rawStart = rawStart * 1000;
  }

  // 2. Simpan / Perbarui memori activeSessions
  activeSessions[uid] = {
    startTime: rawStart,
    mode: sessData.mode || "package",
    duration: sessData.duration || 1,
    totalCost: packageCost,
    hourlyRate: hourlyRate,
    isResumed: sessData.isResumed || false,
    resumedFromSec: sessData.resumedFromSec || 0,
  };

  const s = activeSessions[uid];

  // Bersihkan interval lama
  if (typeof timerIntervals !== "undefined" && timerIntervals[uid]) {
    clearInterval(timerIntervals[uid]);
  }

  function formatHMS(sec) {
    if (!sec || sec < 0) sec = 0;
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const sSec = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${sSec}`;
  }

  // 3. Jalankan Hitungan Waktu
  function tick() {
    const timerEl = document.getElementById(`timer-${uid}`);
    const costEl = document.getElementById(`cost-${uid}`);

    if (!timerEl) return;

    const elapsed = Math.floor((Date.now() - s.startTime) / 1000);

    if (s.mode === "open") {
      // ================= MODE OPEN TIME =================
      timerEl.textContent = formatHMS(elapsed);
      if (timerEl.classList) timerEl.classList.remove("warning");

      if (costEl) {
        // ambil tipen unit(ps3 / ps4)
        const consoleType = unit.type || s.type || "PS3";
        const ratePerHour =
          CONSOLE_PRICING[consoleType.toUpperCase()]?.rateperhour ||
          s.hourlyRate ||
          4000;

        const currentCost = Math.ceil((elapsed / 3600) * ratePerHour);
        costEl.textContent = `Rp ${currentCost.toLocaleString("id-ID")}`;
      }
    } else {
      // ================= MODE PAKET =================
      const baseSec = s.isResumed
        ? s.resumedFromSec || 0
        : Math.round((s.duration || 1) * 3600);
      const remaining = baseSec - elapsed;

      if (remaining <= 0) {
        timerEl.textContent = "00:00:00";
        if (timerEl.classList) timerEl.classList.add("warning");

        if (costEl) {
          costEl.textContent = `Rp ${Number(s.totalCost || 0).toLocaleString("id-ID")}`;
        }

        if (typeof alarmPlayed !== "undefined" && !alarmPlayed[uid]) {
          alarmPlayed[uid] = true;
          if (typeof playAlarm === "function") playAlarm();
          if (typeof showToast === "function") {
            showToast(
              "⚠️",
              `Waktu Habis! - ${unit.name || "Unit"}`,
              "Segera lakukan pembayaran!",
              8000,
              true,
            );
          }
        }

        if (typeof timerIntervals !== "undefined") {
          clearInterval(timerIntervals[uid]);
          delete timerIntervals[uid];
        }
        return;
      }

      // Tampilkan sisa waktu hitung mundur & total biaya paket
      timerEl.textContent = formatHMS(remaining);
      if (costEl) {
        costEl.textContent = `Rp ${Number(s.totalCost || 0).toLocaleString("id-ID")}`;
      }
    }
  }

  tick();
  if (typeof timerIntervals !== "undefined") {
    timerIntervals[uid] = setInterval(tick, 1000);
  }
}
// ── Summary Bar ───────────────────────────────────────────────
function updateSummaryBar(data) {
  const units = Object.values(data);
  const playing = units.filter((u) => u.status === "playing").length;

  const elTotal = document.getElementById("summaryTotal");
  const elPlaying = document.getElementById("summaryPlaying");
  const elReady = document.getElementById("summaryReady");

  if (elTotal) elTotal.textContent = units.length;
  if (elPlaying) elPlaying.textContent = playing;
  if (elReady) elReady.textContent = units.length - playing;
}

// ── Time Bank Badge ───────────────────────────────────────────
function updateTimeBankBadge() {
  const count = Object.keys(timeBankData).length;
  const badge = document.getElementById("timeBankBadge");
  const btn = document.getElementById("btnOpenTimeBank");
  if (!badge) return;

  badge.textContent = count;
  badge.style.display = count > 0 ? "flex" : "none";
  if (btn) btn.classList.toggle("has-entries", count > 0);
}

// ── Rent Modal ────────────────────────────────────────────────
function openRentModal(unit) {
  activeModalUnit = unit;
  resetRentForm();
  document.getElementById("modalUnitName").textContent = unit.name;
  document.getElementById("rentModalOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeRentModal() {
  document.getElementById("rentModalOverlay").classList.remove("open");
  document.body.style.overflow = "";
  activeModalUnit = null;
}

function resetRentForm() {
  setMode("package");
  setDuration(1);
  setPayStatus("paid");
  updateCostPreview();
}

function setMode(mode) {
  selectedMode = mode;
  document.querySelectorAll(".seg-btn").forEach((b) => {
    b.classList.remove("active");
  });
  const btn = document.querySelector(`.seg-btn[data-mode="${mode}"]`);
  if (btn) btn.classList.add("active");

  const pkg = document.getElementById("packageSection");
  if (pkg) pkg.style.display = mode === "package" ? "flex" : "none";
  const cp = document.getElementById("costPreviewSection");
  if (cp) cp.style.display = mode === "package" ? "flex" : "none";
  const ot = document.getElementById("openTimeNotice");
  if (ot) ot.style.display = mode === "open" ? "flex" : "none";

  updateCostPreview();
}

function setDuration(hours) {
  selectedDuration = sanitizeDuration(hours);
  document.querySelectorAll(".dur-btn").forEach((b) => {
    b.classList.remove("active");
  });
  const preset = document.querySelector(`.dur-btn[data-dur="${hours}"]`);
  if (preset) preset.classList.add("active");

  const ci = document.getElementById("customDuration");
  if (ci) ci.value = preset ? "" : hours;
  updateCostPreview();
}

// Fungsi pembantu untuk mencegah input desimal atau angka negatif yang ekstrem
function sanitizeDuration(val) {
  let dur = parseFloat(val);
  if (isNaN(dur) || dur <= 0) return 1;
  return Math.round(dur * 100) / 100; // Pembulatan maksimal 2 desimal
}

function setPayStatus(status) {
  selectedPay = status;
  document.querySelectorAll(".pay-btn").forEach((b) => {
    b.classList.remove("active", "paid", "unpaid");
  });
  const btn = document.querySelector(`.pay-btn[data-pay="${status}"]`);
  if (btn) btn.classList.add("active", status);
}

function updateCostPreview() {
  if (selectedMode !== "package") return;

  // ambil jenis PS (PS3 atau PS4) dari unit yang dipilih
  const consoleType = activeModalUnit?.type || "PS3";
  const cost = getpackagePrice(consoleType, selectedDuration);

  const el = document.getElementById("costPreviewValue");
  if (el) el.textContent = `Rp ${formatRupiah(cost)}`;
  const cp = document.getElementById("costPreviewSection");
  if (cp) cp.style.display = "flex";
}

// ── Start Session ─────────────────────────────────────────────
async function startSession() {
  if (!activeModalUnit) return;
  if (
    selectedMode === "package" &&
    (isNaN(selectedDuration) || selectedDuration <= 0)
  ) {
    showToast("⚠️", "Input tidak valid", "Masukkan durasi yang benar", 3000);
    return;
  }

  const uid = activeModalUnit.id;
  const consoleType = activeModalUnit.type || "PS3";

  // Tambahkan penjadwalan alarm native Capacitor di sini
  if (selectedMode === "package" && selectedDuration > 0) {
    try {
      if (window.Capacitor && window.Capacitor.Plugins.LocalNotifications) {
        const LocalNotifications = window.Capacitor.Plugins.LocalNotifications;
        await LocalNotifications.requestPermissions();

        const durasiMilidetik = selectedDuration * 60 * 60 * 1000;
        const waktuSelesaiTarget = new Date().getTime() + durasiMilidetik;

        await LocalNotifications.schedule({
          notifications: [
            {
              title: "Waktu Habis ⏰",
              body: `Rental untuk ${activeModalUnit.name} telah selesai.`,
              id: new Date().getTime(),
              schedule: { at: new Date(waktuSelesaiTarget) },
              sound: null,
            },
          ],
        });
      }
    } catch (e) {
      console.info("Alarm lokal gagal dipasang", e);
    }
  }

  const session = {
    mode: selectedMode,
    startTime: Date.now(),
    payStatus: selectedPay,
    duration: selectedMode === "package" ? selectedDuration : 0,
    totalCost:
      selectedMode === "package"
        ? getpackagePrice(consoleType, selectedDuration)
        : 0,
  };

  db.ref(`units/${uid}`)
    .update({ status: "playing", session: session })
    .then(() => {
      alarmPlayed[uid] = false;
      const unitName = activeModalUnit ? activeModalUnit.name : uid;
      closeRentModal();
      showToast(
        "🎮",
        `${unitName} Dimulai!`,
        `Mode: ${selectedMode === "package" ? `Paket ${selectedDuration} jam` : "Open Time"}`,
        3000,
      );
    })
    .catch((err) => {
      showToast("❌", "Gagal Mulai Sesi", err.message, 4000);
    });
}

// ── Stop Modal ────────────────────────────────────────────────
function openStopModal(unitId) {
  db.ref(`units/${unitId}`)
    .once("value")
    .then((snapshot) => {
      const unit = snapshot.val();
      if (!unit || !unit.session) {
        showToast(
          "⚠️",
          "Sesi tidak ditemukan",
          "Unit mungkin sudah dihentikan",
          3000,
        );
        return;
      }

      stopUnitData = unit;
      const s = unit.session;
      const elapsed = Math.floor((Date.now() - s.startTime) / 1000);
      const isResumed = s.resumedFromSec != null;

      let finalCost, displayDuration;
      const remainSection = document.getElementById("stopRemainingSection");
      const saveSection = document.getElementById("saveTimeSection");
      const saveInput = document.getElementById("saveTimeCustomerName");

      if (s.mode === "package" || isResumed) {
        const baseSec = isResumed
          ? s.resumedFromSec
          : Math.round(s.duration * 3600);
        stopRemainingSec = Math.max(0, baseSec - elapsed);
        finalCost = isResumed ? 0 : s.totalCost;
        displayDuration = isResumed
          ? secondsToHMS(Math.min(elapsed, baseSec))
          : `${s.duration} Jam`;

        if (stopRemainingSec > 60) {
          const elTime = document.getElementById("stopRemainingTime");
          if (elTime) elTime.textContent = secondsToHMS(stopRemainingSec);
          if (remainSection) remainSection.style.display = "flex";
          if (saveSection) saveSection.style.display = "flex";
          if (saveInput) saveInput.value = s.customerName || "";
        } else {
          if (remainSection) remainSection.style.display = "none";
          if (saveSection) saveSection.style.display = "none";
        }
      } else {
        const hours = elapsed / 3600;
        finalCost = Math.ceil(hours * RATE_PER_HOUR);
        displayDuration = secondsToHMS(elapsed);
        stopRemainingSec = 0;
        if (remainSection) remainSection.style.display = "none";
        if (saveSection) saveSection.style.display = "none";
      }

      document.getElementById("stopUnitName").textContent = unit.name;
      document.getElementById("stopDuration").textContent = displayDuration;
      document.getElementById("stopCost").textContent = isResumed
        ? "Rp 0 (Sudah Dibayar)"
        : `Rp ${formatRupiah(finalCost)}`;
      document.getElementById("stopMode").textContent = isResumed
        ? "🕰️ Sisa Waktu"
        : s.mode === "package"
          ? "Paket Jam"
          : "Open Time";

      setStopPayStatus("paid");
      document.getElementById("stopModalOverlay").classList.add("open");
      document.body.style.overflow = "hidden";
    })
    .catch((err) => {
      showToast("❌", "Gagal membuka Stop Modal", err.message, 4000);
    });
}

function setStopPayStatus(status) {
  stopPayStatus = status;
  document.querySelectorAll(".stop-pay-btn").forEach((b) => {
    b.classList.remove("active", "paid", "unpaid");
  });
  const btn = document.querySelector(`.stop-pay-btn[data-pay="${status}"]`);
  if (btn) btn.classList.add("active", status);
}

function closeStopModal() {
  document.getElementById("stopModalOverlay").classList.remove("open");
  document.body.style.overflow = "";
  stopUnitData = null;
  stopRemainingSec = 0;
}

// Konfirmasi berhenti normal
function confirmStop() {
  stopAlarm();
  if (!stopUnitData) return;

  const unit = stopUnitData;
  const uid = unit.id;
  const s = unit.session;
  const now = Date.now();
  const elapsed = Math.floor((now - s.startTime) / 1000);
  const isResumed = s.resumedFromSec != null;

  let finalCost, finalDuration;
  if (isResumed) {
    finalCost = 0;
    finalDuration = Math.min(elapsed, s.resumedFromSec);
  } else if (s.mode === "package") {
    finalCost = s.totalCost;
    finalDuration = s.duration * 3600;
  } else {
    finalCost = Math.ceil((elapsed / 3600) * RATE_PER_HOUR);
    finalDuration = elapsed;
  }

  const txn = {
    unitId: uid,
    unitName: unit.name,
    mode: isResumed ? "resume" : s.mode,
    durationSec: finalDuration,
    totalCost: finalCost,
    payStatus: isResumed ? "paid" : stopPayStatus,
    customerName: s.customerName || "",
    startTime: s.startTime,
    endTime: now,
    date: new Date().toISOString().split("T")[0],
    createdAt: now,
  };

  db.ref("transactions")
    .push(txn)
    .then(() =>
      db.ref(`units/${uid}`).update({ status: "ready", session: null }),
    )
    .then(() => {
      alarmPlayed[uid] = false;
      alarmPlayed[`${uid}_warn`] = false;
      closeStopModal();
      showToast(
        "✅",
        `${unit.name} Selesai`,
        `Total: Rp ${formatRupiah(finalCost)}`,
        4000,
      );
    })
    .catch((err) => {
      showToast("❌", "Gagal Menghentikan Sesi", err.message, 4000);
    });
}

// ══════════════════════════════════════════════════════════════
//  FITUR: SIMPAN WAKTU (Time Bank)
// ══════════════════════════════════════════════════════════════

function confirmSaveTime() {
  if (!stopUnitData || stopRemainingSec <= 60) {
    showToast(
      "⚠️",
      "Sisa waktu tidak cukup",
      "Minimal harus ada sisa lebih dari 1 menit",
      3000,
    );
    return;
  }

  const nameInput = document.getElementById("saveTimeCustomerName");
  const customerName = nameInput ? nameInput.value.trim() : "";

  if (!customerName) {
    showToast(
      "⚠️",
      "Nama kosong",
      "Masukkan nama pelanggan terlebih dahulu",
      3000,
    );
    if (nameInput) nameInput.focus();
    return;
  }

  const unit = stopUnitData;
  const uid = unit.id;

  const entry = {
    customerName: customerName,
    remainingSec: stopRemainingSec,
    savedAt: Date.now(),
    fromUnit: uid,
    fromUnitName: unit.name,
  };

  db.ref("timeBank")
    .push(entry)
    .then(() =>
      db.ref(`units/${uid}`).update({ status: "ready", session: null }),
    )
    .then(() => {
      alarmPlayed[uid] = false;
      alarmPlayed[`${uid}_warn`] = false;
      closeStopModal();
      showToast(
        "🕰️",
        "Waktu Disimpan!",
        `${customerName} — Sisa ${secondsToHMS(stopRemainingSec)}`,
        4000,
      );
    })
    .catch((err) => {
      showToast("❌", "Gagal Simpan Waktu", err.message, 4000);
    });
}

// ── Time Bank Modal ───────────────────────────────────────────
function openTimeBankModal() {
  selectedTimeBankEntry = null;
  renderTimeBankList();
  const uSec = document.getElementById("unitSelectorSection");
  if (uSec) uSec.style.display = "none";
  document.getElementById("timeBankModalOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeTimeBankModal() {
  document.getElementById("timeBankModalOverlay").classList.remove("open");
  document.body.style.overflow = "";
  selectedTimeBankEntry = null;
}

function renderTimeBankList() {
  const container = document.getElementById("timeBankList");
  if (!container) return;

  const entries = Object.entries(timeBankData);

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🕰️</div>
        <div class="empty-text">Belum ada waktu yang disimpan</div>
      </div>`;
    return;
  }

  container.innerHTML = entries
    .map(([key, entry]) => {
      const savedDate = new Date(entry.savedAt);
      const dateStr = `${savedDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} ${savedDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;

      return `
      <div class="timebank-entry" id="tbe-${key}">
        <div class="timebank-avatar">👤</div>
        <div class="timebank-info">
          <div class="timebank-customer">${entry.customerName}</div>
          <div class="timebank-meta">
            <span class="timebank-time-badge">🕐 ${secondsToHMS(entry.remainingSec)}</span>
            <span class="timebank-from">dari ${entry.fromUnitName || entry.fromUnit || "—"}</span>
            <span class="timebank-date">${dateStr}</span>
          </div>
        </div>
        <div class="timebank-actions">
          <button class="btn-use-time" onclick="selectTimeBankEntry('${key}')">▶ Gunakan</button>
          <button class="btn-delete-time" onclick="deleteTimeBankEntry('${key}')" title="Hapus">🗑</button>
        </div>
      </div>
    `;
    })
    .join("");
}

function selectTimeBankEntry(entryId) {
  const entry = timeBankData[entryId];
  if (!entry) return;

  selectedTimeBankEntry = { id: entryId, data: entry };

  const nameEl = document.getElementById("unitSelectorCustomerName");
  if (nameEl)
    nameEl.textContent = `👤 ${entry.customerName} — ${secondsToHMS(entry.remainingSec)}`;

  const uSec = document.getElementById("unitSelectorSection");
  if (uSec) {
    uSec.style.display = "flex";
    renderUnitSelectorGrid();
    setTimeout(() => {
      uSec.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }
}

function renderUnitSelectorGrid() {
  const grid = document.getElementById("unitSelectorGrid");
  if (!grid) return;

  grid.innerHTML =
    '<div style="color:var(--text-muted);font-size:0.78rem;padding:0.5rem;">Memuat unit...</div>';

  db.ref("units")
    .once("value")
    .then((snapshot) => {
      const data = snapshot.val() || {};
      const readyUnits = Object.values(data).filter(
        (u) => u.status === "ready",
      );

      if (readyUnits.length === 0) {
        grid.innerHTML = `
        <div style="color:var(--red-400);font-size:0.8rem;text-align:center;padding:0.75rem;">
          ⚠️ Semua unit sedang digunakan
        </div>`;
        return;
      }

      grid.innerHTML = readyUnits
        .map((unit) => {
          const theme = GAME_THEMES[getThemeIndex(unit.id)];
          return `
        <button class="unit-selector-btn" 
          style="--btn-accent:${theme.accent};border-color:${theme.accent}40;" 
          onclick="assignTimeBankToUnit('${selectedTimeBankEntry ? selectedTimeBankEntry.id : ""}','${unit.id}')">
          <span class="usb-emoji">${theme.emoji}</span>
          <span class="usb-name">${unit.name}</span>
          <span class="usb-status">Kosong</span>
        </button>
      `;
        })
        .join("");
    });
}

function assignTimeBankToUnit(entryId, unitId) {
  const entry = timeBankData[entryId];
  if (!entry) {
    showToast("⚠️", "Data tidak ditemukan", "Coba refresh halaman", 3000);
    return;
  }

  const session = {
    mode: "package",
    startTime: Date.now(),
    payStatus: "paid",
    resumedFromSec: entry.remainingSec,
    duration: entry.remainingSec / 3600,
    totalCost: 0,
    customerName: entry.customerName,
  };

  db.ref(`units/${unitId}`)
    .update({ status: "playing", session: session })
    .then(() => db.ref(`timeBank/${entryId}`).remove())
    .then(() => {
      alarmPlayed[unitId] = false;
      closeTimeBankModal();
      showToast(
        "▶",
        `${entry.customerName} — Lanjut Main!`,
        `Sisa waktu: ${secondsToHMS(entry.remainingSec)} di ${unitId.toUpperCase()}`,
        4000,
      );
    })
    .catch((err) => {
      showToast("❌", "Gagal Gunakan Waktu", err.message, 4000);
    });
}

function deleteTimeBankEntry(entryId) {
  const entry = timeBankData[entryId];
  if (!entry) return;
  if (
    !confirm(
      `Hapus waktu simpanan milik "${entry.customerName}"?\n\nSisa: ${secondsToHMS(entry.remainingSec)}`,
    )
  )
    return;

  db.ref(`timeBank/${entryId}`)
    .remove()
    .then(() => {
      showToast(
        "🗑️",
        "Data Dihapus",
        `${entry.customerName} dihapus dari simpan waktu`,
        3000,
      );
      if (selectedTimeBankEntry && selectedTimeBankEntry.id === entryId) {
        selectedTimeBankEntry = null;
        const uSec = document.getElementById("unitSelectorSection");
        if (uSec) uSec.style.display = "none";
      }
    })
    .catch((err) => {
      showToast("❌", "Gagal Hapus", err.message, 3000);
    });
}

// ── Audio Alarm ───────────────────────────────────────────────
function getAudioCtx() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

//1. simpan variabel audio di luar fungsi agar bisa diakses saat ingin mematikannya
let alarmAudio = null;

function playAlarm() {
  try {
    //Hentikan alarm sebelumnya jika masih berjalan
    if (alarmAudio) {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
    }
    alarmAudio = new Audio("XiaomiRingtone.mp3");
    alarmAudio.loop = true;

    alarmAudio.play().catch((e) => console.warn("Audio error:", e));
  } catch (e) {
    console.warn("Audio error:", e);
  }
}

//2. fungsi tambahan untuk mematikan alarm saat modal Stop/Selesai ditekan
function stopAlarm() {
  if (alarmAudio) {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    alarmAudio = null;
  }
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(icon, title, subtitle, duration, isAlarm) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${isAlarm ? "alarm" : ""}`;
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-text">
      <div class="toast-title">${title}</div>
      <div class="toast-subtitle">${subtitle}</div>
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toast-out 0.3s ease forwards";
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration || 3500);
}

// ── Helpers ───────────────────────────────────────────────────
function secondsToHMS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}
function formatRupiah(num) {
  return Math.round(num).toLocaleString("id-ID");
}

// ── DOM Wiring ────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const storeName = document.getElementById("storeName");
  if (storeName && typeof STORE_NAME !== "undefined")
    storeName.textContent = STORE_NAME;

  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setMode(btn.dataset.mode);
    });
  });

  document.querySelectorAll(".dur-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setDuration(btn.dataset.dur);
    });
  });

  const ci = document.getElementById("customDuration");
  if (ci) {
    ci.addEventListener("input", () => {
      document.querySelectorAll(".dur-btn").forEach((b) => {
        b.classList.remove("active");
      });
      const nominalRupiah = parseFloat(ci.value) || 0;

      //cek tipe unit (ps3 atau ps4) & ambil tarif per jamnya
      const consoleType = activeModalUnit?.type || "PS3";
      const rate =
        CONSOLE_PRICING[consoleType.toUpperCase()]?.rateperhour || 4000;
      //hitung durasi jam berdasarkan nominal uang
      selectedDuration = nominalRupiah / rate;
      updateCostPreview();
    });
  }

  document.querySelectorAll(".pay-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setPayStatus(btn.dataset.pay);
    });
  });

  document.querySelectorAll(".stop-pay-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setStopPayStatus(btn.dataset.pay);
    });
  });

  // Overlay klik untuk tutup modal
  ["rentModalOverlay", "stopModalOverlay", "timeBankModalOverlay"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("click", (e) => {
        if (e.target === el) {
          if (id === "rentModalOverlay") closeRentModal();
          if (id === "stopModalOverlay") closeStopModal();
          if (id === "timeBankModalOverlay") closeTimeBankModal();
        }
      });
    },
  );

  // Unlock audio
  document.addEventListener(
    "click",
    () => {
      try {
        if (!audioCtx)
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
      } catch (e) {}
    },
    { once: true },
  );

  initFirebase();
});

// ── Global exports ────────────────────────────────────────────
window.openRentModal = openRentModal;
window.closeRentModal = closeRentModal;
window.startSession = startSession;
window.openStopModal = openStopModal;
window.closeStopModal = closeStopModal;
window.confirmStop = confirmStop;
window.confirmSaveTime = confirmSaveTime;
window.setMode = setMode;
window.setDuration = setDuration;
window.setPayStatus = setPayStatus;
window.setStopPayStatus = setStopPayStatus;
window.openTimeBankModal = openTimeBankModal;
window.closeTimeBankModal = closeTimeBankModal;
window.selectTimeBankEntry = selectTimeBankEntry;
window.assignTimeBankToUnit = assignTimeBankToUnit;
window.deleteTimeBankEntry = deleteTimeBankEntry;

const PIN = "1919";

//buka ambil PIN saat tombol Laporan diklik
function openReportsWithPIN() {
  const modal = document.getElementById("pinModal");
  const input = document.getElementById("adminPinInput");
  if (modal) {
    input.value = "";
    modal.style.display = "flex";
    input.focus();
  }
}
//tutup modal PIN
function closePinModal() {
  const modal = document.getElementById("pinModal");
  if (modal) modal.style.display = "none";
}

//cek PIN saat tombol masuk diklik
function submitAdminPin() {
  const inputPin = document.getElementById("adminPinInput").value;
  if (inputPin === PIN) {
    closePinModal();
    window.location.href = "reports.html";
  } else {
    alert("PIN Salah! Akses ditolak");
    document.getElementById("adminPinInput").value = "";
  }
}
