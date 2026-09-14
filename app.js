/* ============================================================
   app.js — Rental PS Mugis
   Firebase v8 Compat API + Timer + Time Bank (Simpan Waktu)
   ============================================================ */

'use strict';

// ── Game Themes ───────────────────────────────────────────────
const GAME_THEMES = [
  { game: 'EA Sports FC',   emoji: '⚽', bg: 'linear-gradient(160deg,#0a2e1a 0%,#1a5c32 60%,#0d3d22 100%)', accent: '#4ade80' },
  { game: 'GTA V',          emoji: '🏙️', bg: 'linear-gradient(160deg,#1a0d00 0%,#7c3800 60%,#2d1500 100%)', accent: '#f59e0b' },
  { game: 'God of War',     emoji: '⚔️', bg: 'linear-gradient(160deg,#2d0000 0%,#7f1d1d 60%,#1a0000 100%)', accent: '#ef4444' },
  { game: 'PES',            emoji: '🏆', bg: 'linear-gradient(160deg,#00103d 0%,#1e3a8a 60%,#000d2e 100%)', accent: '#60a5fa' },
  { game: 'Gran Turismo',   emoji: '🏎️', bg: 'linear-gradient(160deg,#0f0820 0%,#3b0764 60%,#150a30 100%)', accent: '#a78bfa' },
  { game: 'Tekken',         emoji: '🥊', bg: 'linear-gradient(160deg,#1a0800 0%,#9a3412 60%,#3d1500 100%)', accent: '#fb923c' },
  { game: 'Call of Duty',   emoji: '🎯', bg: 'linear-gradient(160deg,#050505 0%,#2d3748 60%,#101010 100%)', accent: '#d1d5db' },
  { game: 'Need for Speed', emoji: '💨', bg: 'linear-gradient(160deg,#001a00 0%,#15803d 60%,#003300 100%)', accent: '#86efac' },
];

function getThemeIndex(unitId) {
  var num = parseInt(unitId.replace('tv', ''), 10) - 1;
  return Math.max(0, Math.min(num, GAME_THEMES.length - 1));
}

// ── State ─────────────────────────────────────────────────────
var db           = null;
var unitsRef     = null;
var txnsRef      = null;
var timeBankRef  = null;

var timerIntervals   = {};
var alarmPlayed      = {};
var audioCtx         = null;
var activeModalUnit  = null;
var stopUnitData     = null;
var stopRemainingSec = 0;   // sisa detik saat Stop modal dibuka

var selectedMode     = 'package';
var selectedDuration = 1;
var selectedPay      = 'paid';
var stopPayStatus    = 'paid';

// Time Bank state
var timeBankData          = {};
var selectedTimeBankEntry = null; // { id, data }

// ── Firebase Init ─────────────────────────────────────────────
function initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db          = firebase.database();
    unitsRef    = db.ref('units');
    txnsRef     = db.ref('transactions');
    timeBankRef = db.ref('timeBank');

    initializeUnits()
      .then(function() {
        startRealtimeListeners();
        var overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.add('hidden');
        showToast('🔥', 'Terhubung ke Firebase', 'Real-time sync aktif', 3000);
      })
      .catch(function(err) { showFbError(err.message); });

  } catch (err) {
    showFbError(err.message);
  }
}

function showFbError(msg) {
  var el = document.getElementById('loadingText');
  if (el) el.textContent = '⚠️ Gagal terhubung. Periksa konfigurasi Firebase. (' + msg + ')';
}

// ── Initialize Units ──────────────────────────────────────────
async function initializeUnits() {
  var snapshot = await unitsRef.once('value');
  if (!snapshot.exists()) {
    var updates = {};
    for (var i = 1; i <= TOTAL_UNITS; i++) {
      updates['tv' + i] = { id: 'tv' + i, name: 'TV ' + i, status: 'ready', session: null };
    }
    await unitsRef.set(updates);
  }
}

// ── Real-time Listeners ───────────────────────────────────────
function startRealtimeListeners() {
  // Units listener
  unitsRef.on('value', function(snapshot) {
    var data = snapshot.val();
    if (!data) return;
    Object.values(data).forEach(function(unit) { renderUnitCard(unit); });
    updateSummaryBar(data);
  });

  // Time Bank listener — update badge & list secara real-time
  timeBankRef.on('value', function(snapshot) {
    timeBankData = snapshot.val() || {};
    updateTimeBankBadge();
    // Kalau modal Time Bank sedang terbuka, update list-nya
    var tbOverlay = document.getElementById('timeBankModalOverlay');
    if (tbOverlay && tbOverlay.classList.contains('open')) {
      renderTimeBankList();
    }
  });
}

// ── Render Unit Card ──────────────────────────────────────────
function renderUnitCard(unit) {
  var card = document.getElementById('card-' + unit.id);
  if (!card) return;

  var isPlaying = unit.status === 'playing' && unit.session;
  var theme     = GAME_THEMES[getThemeIndex(unit.id)];

  if (timerIntervals[unit.id]) {
    clearInterval(timerIntervals[unit.id]);
    delete timerIntervals[unit.id];
  }

  card.style.background = theme.bg;
  card.className = 'unit-card ' + (isPlaying ? 'playing' : 'ready');

  if (!isPlaying) {
    // ── READY STATE ──────────────────────────────────────────
    card.innerHTML =
      '<span class="unit-status-badge"></span>' +
      '<div class="card-game-emoji" style="color:' + theme.accent + '">' + theme.emoji + '</div>' +
      '<div class="card-game-name" style="color:' + theme.accent + '">' + theme.game + '</div>' +
      '<div class="unit-name">' + unit.name + '</div>' +
      '<div class="unit-status-text">Kosong</div>' +
      '<div class="card-tap-hint">Tap untuk sewa</div>';
    card.onclick = function() { openRentModal(unit); };

  } else {
    // ── PLAYING STATE ─────────────────────────────────────────
    var s          = unit.session;
    var mode       = s.mode;
    var isResumed  = (s.resumedFromSec != null);

    var modeLabel  = isResumed ? '🕰️ Lanjut Sisa' : (mode === 'package' ? '📦 Paket' : '⏱️ Open Time');
    var timerClass = (mode === 'package' || isResumed) ? 'countdown' : 'counting';
    var payLabel   = isResumed ? '✅ Sudah Dibayar' : (s.payStatus === 'paid' ? '✅ Lunas' : '⏳ Bayar Nanti');
    var payClass   = isResumed ? 'paid' : (s.payStatus || 'paid');

    card.innerHTML =
      '<span class="unit-status-badge"></span>' +
      '<div class="card-game-emoji playing-emoji">' + theme.emoji + '</div>' +
      '<div class="unit-name">' + unit.name + '</div>' +
      '<div class="unit-status-text">Sedang Main</div>' +
      '<div class="unit-mode">' + modeLabel + '</div>' +
      '<div class="unit-timer ' + timerClass + '" id="timer-' + unit.id + '">--:--:--</div>' +
      '<div class="unit-cost" id="cost-' + unit.id + '" style="color:' + theme.accent + '">Rp 0</div>' +
      '<div class="unit-pay-status ' + payClass + '">' + payLabel + '</div>' +
      (s.customerName ? '<div class="unit-customer">👤 ' + s.customerName + '</div>' : '') +
      '<button class="btn-stop-card" id="stop-btn-' + unit.id + '">⏹ Stop</button>';

    card.onclick = null;

    var stopBtn = document.getElementById('stop-btn-' + unit.id);
    if (stopBtn) {
      stopBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        openStopModal(unit.id);
      });
    }

    startCardTimer(unit);
  }
}

// ── Card Timer Engine ─────────────────────────────────────────
function startCardTimer(unit) {
  var uid  = unit.id;
  var s    = unit.session;
  var mode = s.mode;
  var isResumed = (s.resumedFromSec != null);

  function tick() {
    var elapsed = Math.floor((Date.now() - s.startTime) / 1000);
    var timerEl = document.getElementById('timer-' + uid);
    var costEl  = document.getElementById('cost-' + uid);
    if (!timerEl) { clearInterval(timerIntervals[uid]); return; }

    if (mode === 'package' || isResumed) {
      // Dukung sesi dilanjutkan (resumedFromSec) maupun paket biasa
      var baseSec   = isResumed ? s.resumedFromSec : Math.round(s.duration * 3600);
      var remaining = baseSec - elapsed;

      if (remaining <= 0) {
        timerEl.textContent = '00:00:00';
        timerEl.classList.add('warning');
        if (costEl) costEl.textContent = isResumed ? 'Rp 0 (Sisa)' : 'Rp ' + formatRupiah(s.totalCost);
        if (!alarmPlayed[uid]) {
          alarmPlayed[uid] = true;
          playAlarm();
          showToast('🚨', 'Waktu Habis! — ' + unit.name, 'Segera lakukan pembayaran!', 8000, true);
        }
        return;
      }

      timerEl.textContent = secondsToHMS(remaining);
      if (costEl) costEl.textContent = isResumed ? 'Rp 0 (Sisa)' : 'Rp ' + formatRupiah(s.totalCost);

      if (remaining <= 300) {
        timerEl.classList.add('warning');
        if (!alarmPlayed[uid + '_warn']) {
          alarmPlayed[uid + '_warn'] = true;
          showToast('⚠️', unit.name + ' — Sisa 5 Menit!', 'Segera siapkan pembayaran.', 5000);
        }
      } else {
        timerEl.classList.remove('warning');
        alarmPlayed[uid + '_warn'] = false;
        alarmPlayed[uid] = false;
      }

    } else {
      // Open Time: hitung maju
      timerEl.textContent = secondsToHMS(elapsed);
      var cost = Math.ceil((elapsed / 3600) * RATE_PER_HOUR);
      if (costEl) costEl.textContent = 'Rp ' + formatRupiah(cost);
    }
  }

  tick();
  timerIntervals[uid] = setInterval(tick, 1000);
}

// ── Summary Bar ───────────────────────────────────────────────
function updateSummaryBar(data) {
  var units   = Object.values(data);
  var playing = units.filter(function(u) { return u.status === 'playing'; }).length;
  document.getElementById('summaryTotal').textContent   = units.length;
  document.getElementById('summaryPlaying').textContent = playing;
  document.getElementById('summaryReady').textContent   = units.length - playing;
}

// ── Time Bank Badge ───────────────────────────────────────────
function updateTimeBankBadge() {
  var count = Object.keys(timeBankData).length;
  var badge = document.getElementById('timeBankBadge');
  var btn   = document.getElementById('btnOpenTimeBank');
  if (!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
  if (btn) {
    btn.classList.toggle('has-entries', count > 0);
  }
}

// ── Rent Modal ────────────────────────────────────────────────
function openRentModal(unit) {
  activeModalUnit = unit;
  resetRentForm();
  document.getElementById('modalUnitName').textContent = unit.name;
  document.getElementById('rentModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeRentModal() {
  document.getElementById('rentModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  activeModalUnit = null;
}

function resetRentForm() {
  setMode('package');
  setDuration(1);
  setPayStatus('paid');
  updateCostPreview();
}

function setMode(mode) {
  selectedMode = mode;
  document.querySelectorAll('.seg-btn').forEach(function(b) { b.classList.remove('active'); });
  var btn = document.querySelector('.seg-btn[data-mode="' + mode + '"]');
  if (btn) btn.classList.add('active');
  var pkg = document.getElementById('packageSection');
  if (pkg) pkg.style.display = mode === 'package' ? 'flex' : 'none';
  var cp  = document.getElementById('costPreviewSection');
  if (cp)  cp.style.display  = mode === 'package' ? 'flex' : 'none';
  var ot  = document.getElementById('openTimeNotice');
  if (ot)  ot.style.display  = mode === 'open' ? 'flex' : 'none';
  updateCostPreview();
}

function setDuration(hours) {
  selectedDuration = parseFloat(hours) || 1;
  document.querySelectorAll('.dur-btn').forEach(function(b) { b.classList.remove('active'); });
  var preset = document.querySelector('.dur-btn[data-dur="' + hours + '"]');
  if (preset) preset.classList.add('active');
  var ci = document.getElementById('customDuration');
  if (ci) ci.value = preset ? '' : hours;
  updateCostPreview();
}

function setPayStatus(status) {
  selectedPay = status;
  document.querySelectorAll('.pay-btn').forEach(function(b) { b.classList.remove('active', 'paid', 'unpaid'); });
  var btn = document.querySelector('.pay-btn[data-pay="' + status + '"]');
  if (btn) btn.classList.add('active', status);
}

function updateCostPreview() {
  if (selectedMode !== 'package') return;
  var cost = Math.round(selectedDuration * RATE_PER_HOUR);
  var el   = document.getElementById('costPreviewValue');
  if (el) el.textContent = 'Rp ' + formatRupiah(cost);
  var cp = document.getElementById('costPreviewSection');
  if (cp) cp.style.display = 'flex';
}

// ── Start Session ─────────────────────────────────────────────
function startSession() {
  if (!activeModalUnit) return;
  if (selectedMode === 'package' && (isNaN(selectedDuration) || selectedDuration <= 0)) {
    showToast('⚠️', 'Input tidak valid', 'Masukkan durasi yang benar', 3000);
    return;
  }

  var uid = activeModalUnit.id;
  var session = {
    mode:      selectedMode,
    startTime: Date.now(),
    payStatus: selectedPay,
    duration:  selectedMode === 'package' ? selectedDuration : 0,
    totalCost: selectedMode === 'package' ? Math.round(selectedDuration * RATE_PER_HOUR) : 0
  };

  db.ref('units/' + uid).update({ status: 'playing', session: session })
    .then(function() {
      alarmPlayed[uid] = false;
      var unitName = activeModalUnit ? activeModalUnit.name : uid;
      closeRentModal();
      showToast('🎮', unitName + ' Dimulai!',
        'Mode: ' + (selectedMode === 'package' ? 'Paket ' + selectedDuration + ' jam' : 'Open Time'), 3000);
    })
    .catch(function(err) { showToast('❌', 'Gagal Mulai Sesi', err.message, 4000); });
}

// ── Stop Modal ────────────────────────────────────────────────
function openStopModal(unitId) {
  db.ref('units/' + unitId).once('value').then(function(snapshot) {
    var unit = snapshot.val();
    if (!unit || !unit.session) {
      showToast('⚠️', 'Sesi tidak ditemukan', 'Unit mungkin sudah dihentikan', 3000);
      return;
    }

    stopUnitData = unit;
    var s          = unit.session;
    var elapsed    = Math.floor((Date.now() - s.startTime) / 1000);
    var isResumed  = (s.resumedFromSec != null);

    var finalCost, displayDuration;
    var remainSection  = document.getElementById('stopRemainingSection');
    var saveSection    = document.getElementById('saveTimeSection');
    var saveInput      = document.getElementById('saveTimeCustomerName');

    if (s.mode === 'package' || isResumed) {
      var baseSec     = isResumed ? s.resumedFromSec : Math.round(s.duration * 3600);
      stopRemainingSec = Math.max(0, baseSec - elapsed);
      finalCost       = isResumed ? 0 : s.totalCost;
      displayDuration = isResumed
        ? secondsToHMS(Math.min(elapsed, baseSec))
        : (s.duration + ' Jam');

      // Tampilkan sisa waktu + tombol Simpan Waktu jika lebih dari 1 menit
      if (stopRemainingSec > 60) {
        if (document.getElementById('stopRemainingTime'))
          document.getElementById('stopRemainingTime').textContent = secondsToHMS(stopRemainingSec);
        if (remainSection) remainSection.style.display = 'flex';
        if (saveSection)   saveSection.style.display   = 'flex';
        if (saveInput)     saveInput.value = s.customerName || '';
      } else {
        if (remainSection) remainSection.style.display = 'none';
        if (saveSection)   saveSection.style.display   = 'none';
      }
    } else {
      // Open Time
      var hours = elapsed / 3600;
      finalCost       = Math.ceil(hours * RATE_PER_HOUR);
      displayDuration = secondsToHMS(elapsed);
      stopRemainingSec = 0;
      if (remainSection) remainSection.style.display = 'none';
      if (saveSection)   saveSection.style.display   = 'none';
    }

    document.getElementById('stopUnitName').textContent = unit.name;
    document.getElementById('stopDuration').textContent = displayDuration;
    document.getElementById('stopCost').textContent =
      isResumed ? 'Rp 0 (Sudah Dibayar)' : ('Rp ' + formatRupiah(finalCost));
    document.getElementById('stopMode').textContent =
      isResumed ? '🕰️ Sisa Waktu' : (s.mode === 'package' ? 'Paket Jam' : 'Open Time');

    setStopPayStatus('paid');
    document.getElementById('stopModalOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';

  }).catch(function(err) { showToast('❌', 'Gagal membuka Stop Modal', err.message, 4000); });
}

function setStopPayStatus(status) {
  stopPayStatus = status;
  document.querySelectorAll('.stop-pay-btn').forEach(function(b) { b.classList.remove('active', 'paid', 'unpaid'); });
  var btn = document.querySelector('.stop-pay-btn[data-pay="' + status + '"]');
  if (btn) btn.classList.add('active', status);
}

function closeStopModal() {
  document.getElementById('stopModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  stopUnitData     = null;
  stopRemainingSec = 0;
}

// Konfirmasi berhenti normal (biaya dicatat, sesi selesai)
function confirmStop() {
  if (!stopUnitData) return;

  var unit      = stopUnitData;
  var uid       = unit.id;
  var s         = unit.session;
  var now       = Date.now();
  var elapsed   = Math.floor((now - s.startTime) / 1000);
  var isResumed = (s.resumedFromSec != null);

  var finalCost, finalDuration;
  if (isResumed) {
    finalCost     = 0;
    finalDuration = Math.min(elapsed, s.resumedFromSec);
  } else if (s.mode === 'package') {
    finalCost     = s.totalCost;
    finalDuration = s.duration * 3600;
  } else {
    finalCost     = Math.ceil((elapsed / 3600) * RATE_PER_HOUR);
    finalDuration = elapsed;
  }

  var txn = {
    unitId:       uid,
    unitName:     unit.name,
    mode:         isResumed ? 'resume' : s.mode,
    durationSec:  finalDuration,
    totalCost:    finalCost,
    payStatus:    isResumed ? 'paid' : stopPayStatus,
    customerName: s.customerName || '',
    startTime:    s.startTime,
    endTime:      now,
    date:         new Date().toISOString().split('T')[0],
    createdAt:    now
  };

  db.ref('transactions').push(txn)
    .then(function() { return db.ref('units/' + uid).update({ status: 'ready', session: null }); })
    .then(function() {
      alarmPlayed[uid] = false;
      alarmPlayed[uid + '_warn'] = false;
      closeStopModal();
      showToast('✅', unit.name + ' Selesai', 'Total: Rp ' + formatRupiah(finalCost), 4000);
    })
    .catch(function(err) { showToast('❌', 'Gagal Menghentikan Sesi', err.message, 4000); });
}

// ══════════════════════════════════════════════════════════════
//  FITUR: SIMPAN WAKTU (Time Bank)
// ══════════════════════════════════════════════════════════════

// ── Simpan Waktu dari Stop Modal ─────────────────────────────
function confirmSaveTime() {
  if (!stopUnitData || stopRemainingSec <= 60) {
    showToast('⚠️', 'Sisa waktu tidak cukup', 'Minimal harus ada sisa lebih dari 1 menit', 3000);
    return;
  }

  var nameInput    = document.getElementById('saveTimeCustomerName');
  var customerName = nameInput ? nameInput.value.trim() : '';

  if (!customerName) {
    showToast('⚠️', 'Nama kosong', 'Masukkan nama pelanggan terlebih dahulu', 3000);
    if (nameInput) nameInput.focus();
    return;
  }

  var unit  = stopUnitData;
  var uid   = unit.id;

  var entry = {
    customerName: customerName,
    remainingSec: stopRemainingSec,
    savedAt:      Date.now(),
    fromUnit:     uid,
    fromUnitName: unit.name
  };

  // Simpan ke Firebase timeBank lalu hentikan sesi
  db.ref('timeBank').push(entry)
    .then(function() { return db.ref('units/' + uid).update({ status: 'ready', session: null }); })
    .then(function() {
      alarmPlayed[uid] = false;
      alarmPlayed[uid + '_warn'] = false;
      closeStopModal();
      showToast('🕰️', 'Waktu Disimpan!',
        customerName + ' — Sisa ' + secondsToHMS(stopRemainingSec), 4000);
    })
    .catch(function(err) { showToast('❌', 'Gagal Simpan Waktu', err.message, 4000); });
}

// ── Time Bank Modal ───────────────────────────────────────────
function openTimeBankModal() {
  selectedTimeBankEntry = null;
  renderTimeBankList();
  var uSec = document.getElementById('unitSelectorSection');
  if (uSec) uSec.style.display = 'none';
  document.getElementById('timeBankModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeTimeBankModal() {
  document.getElementById('timeBankModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  selectedTimeBankEntry = null;
}

function renderTimeBankList() {
  var container = document.getElementById('timeBankList');
  if (!container) return;

  var entries = Object.entries(timeBankData);

  if (entries.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
      '<div class="empty-icon">🕰️</div>' +
      '<div class="empty-text">Belum ada waktu yang disimpan</div>' +
      '</div>';
    return;
  }

  container.innerHTML = entries.map(function(pair) {
    var key   = pair[0];
    var entry = pair[1];
    var savedDate = new Date(entry.savedAt);
    var dateStr   = savedDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) +
                    ' ' + savedDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    var mins = Math.floor(entry.remainingSec / 60);

    return (
      '<div class="timebank-entry" id="tbe-' + key + '">' +
        '<div class="timebank-avatar">👤</div>' +
        '<div class="timebank-info">' +
          '<div class="timebank-customer">' + entry.customerName + '</div>' +
          '<div class="timebank-meta">' +
            '<span class="timebank-time-badge">🕐 ' + secondsToHMS(entry.remainingSec) + '</span>' +
            '<span class="timebank-from">dari ' + (entry.fromUnitName || entry.fromUnit || '—') + '</span>' +
            '<span class="timebank-date">' + dateStr + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="timebank-actions">' +
          '<button class="btn-use-time" onclick="selectTimeBankEntry(\'' + key + '\')">▶ Gunakan</button>' +
          '<button class="btn-delete-time" onclick="deleteTimeBankEntry(\'' + key + '\')" title="Hapus">🗑</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

// Pilih entry Time Bank untuk digunakan → tampilkan selector unit
function selectTimeBankEntry(entryId) {
  var entry = timeBankData[entryId];
  if (!entry) return;

  selectedTimeBankEntry = { id: entryId, data: entry };

  // Isi info di unit selector header
  var nameEl = document.getElementById('unitSelectorCustomerName');
  if (nameEl) nameEl.textContent = '👤 ' + entry.customerName + ' — ' + secondsToHMS(entry.remainingSec);

  // Tampilkan section
  var uSec = document.getElementById('unitSelectorSection');
  if (uSec) {
    uSec.style.display = 'flex';
    renderUnitSelectorGrid();
    setTimeout(function() { uSec.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
  }
}

function renderUnitSelectorGrid() {
  var grid = document.getElementById('unitSelectorGrid');
  if (!grid) return;

  grid.innerHTML = '<div style="color:var(--text-muted);font-size:0.78rem;padding:0.5rem;">Memuat unit...</div>';

  db.ref('units').once('value').then(function(snapshot) {
    var data       = snapshot.val() || {};
    var readyUnits = Object.values(data).filter(function(u) { return u.status === 'ready'; });

    if (readyUnits.length === 0) {
      grid.innerHTML =
        '<div style="color:var(--red-400);font-size:0.8rem;text-align:center;padding:0.75rem;">' +
        '⚠️ Semua unit sedang digunakan</div>';
      return;
    }

    grid.innerHTML = readyUnits.map(function(unit) {
      var theme = GAME_THEMES[getThemeIndex(unit.id)];
      return (
        '<button class="unit-selector-btn" ' +
          'style="--btn-accent:' + theme.accent + ';border-color:' + theme.accent + '40;" ' +
          'onclick="assignTimeBankToUnit(\'' + (selectedTimeBankEntry ? selectedTimeBankEntry.id : '') + '\',\'' + unit.id + '\')">' +
          '<span class="usb-emoji">' + theme.emoji + '</span>' +
          '<span class="usb-name">' + unit.name + '</span>' +
          '<span class="usb-status">Kosong</span>' +
        '</button>'
      );
    }).join('');
  });
}

// Assign waktu tersimpan ke unit yang dipilih
function assignTimeBankToUnit(entryId, unitId) {
  var entry = timeBankData[entryId];
  if (!entry) {
    showToast('⚠️', 'Data tidak ditemukan', 'Coba refresh halaman', 3000);
    return;
  }

  var session = {
    mode:           'package',
    startTime:      Date.now(),
    payStatus:      'paid',
    resumedFromSec: entry.remainingSec,     // kunci untuk timer resumed
    duration:       entry.remainingSec / 3600,
    totalCost:      0,
    customerName:   entry.customerName
  };

  db.ref('units/' + unitId).update({ status: 'playing', session: session })
    .then(function() { return db.ref('timeBank/' + entryId).remove(); })
    .then(function() {
      alarmPlayed[unitId] = false;
      closeTimeBankModal();
      showToast('▶', entry.customerName + ' — Lanjut Main!',
        'Sisa waktu: ' + secondsToHMS(entry.remainingSec) + ' di ' + unitId.toUpperCase(), 4000);
    })
    .catch(function(err) { showToast('❌', 'Gagal Gunakan Waktu', err.message, 4000); });
}

// Hapus entry Time Bank
function deleteTimeBankEntry(entryId) {
  var entry = timeBankData[entryId];
  if (!entry) return;
  if (!confirm('Hapus waktu simpanan milik "' + entry.customerName + '"?\n\nSisa: ' + secondsToHMS(entry.remainingSec))) return;

  db.ref('timeBank/' + entryId).remove()
    .then(function() {
      showToast('🗑️', 'Data Dihapus', entry.customerName + ' dihapus dari simpan waktu', 3000);
      // Tutup unit selector jika entry yang dihapus adalah yang dipilih
      if (selectedTimeBankEntry && selectedTimeBankEntry.id === entryId) {
        selectedTimeBankEntry = null;
        var uSec = document.getElementById('unitSelectorSection');
        if (uSec) uSec.style.display = 'none';
      }
    })
    .catch(function(err) { showToast('❌', 'Gagal Hapus', err.message, 3000); });
}

// ── Audio Alarm ───────────────────────────────────────────────
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playAlarm() {
  try {
    var ctx   = getAudioCtx();
    var notes = [880, 1100, 880, 1100, 880, 1320];
    var t     = ctx.currentTime;
    notes.forEach(function(freq) {
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.35);
      t += 0.4;
    });
  } catch(e) { console.warn('Audio error:', e); }
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(icon, title, subtitle, duration, isAlarm) {
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast' + (isAlarm ? ' alarm' : '');
  toast.innerHTML =
    '<div class="toast-icon">' + icon + '</div>' +
    '<div class="toast-text">' +
      '<div class="toast-title">' + title + '</div>' +
      '<div class="toast-subtitle">' + subtitle + '</div>' +
    '</div>';
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(function() { toast.remove(); }, 300);
  }, duration || 3500);
}

// ── Helpers ───────────────────────────────────────────────────
function secondsToHMS(totalSec) {
  var s   = Math.max(0, Math.floor(totalSec));
  var h   = Math.floor(s / 3600);
  var m   = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  return pad(h) + ':' + pad(m) + ':' + pad(sec);
}
function pad(n) { return String(n).padStart(2, '0'); }
function formatRupiah(num) { return Math.round(num).toLocaleString('id-ID'); }

// ── DOM Wiring ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {

  var storeName = document.getElementById('storeName');
  if (storeName && typeof STORE_NAME !== 'undefined') storeName.textContent = STORE_NAME;

  document.querySelectorAll('.seg-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { setMode(btn.dataset.mode); });
  });

  document.querySelectorAll('.dur-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { setDuration(btn.dataset.dur); });
  });

  var ci = document.getElementById('customDuration');
  if (ci) ci.addEventListener('input', function() {
    document.querySelectorAll('.dur-btn').forEach(function(b) { b.classList.remove('active'); });
    selectedDuration = parseFloat(ci.value) || 0;
    updateCostPreview();
  });

  document.querySelectorAll('.pay-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { setPayStatus(btn.dataset.pay); });
  });

  document.querySelectorAll('.stop-pay-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { setStopPayStatus(btn.dataset.pay); });
  });

  // Overlay klik untuk tutup modal
  ['rentModalOverlay', 'stopModalOverlay', 'timeBankModalOverlay'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function(e) {
      if (e.target === el) {
        if (id === 'rentModalOverlay')     closeRentModal();
        if (id === 'stopModalOverlay')     closeStopModal();
        if (id === 'timeBankModalOverlay') closeTimeBankModal();
      }
    });
  });

  // Unlock audio
  document.addEventListener('click', function() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch(e) {}
  }, { once: true });

  initFirebase();
});

// ── Global exports ────────────────────────────────────────────
window.openRentModal          = openRentModal;
window.closeRentModal         = closeRentModal;
window.startSession           = startSession;
window.openStopModal          = openStopModal;
window.closeStopModal         = closeStopModal;
window.confirmStop            = confirmStop;
window.confirmSaveTime        = confirmSaveTime;
window.setMode                = setMode;
window.setDuration            = setDuration;
window.setPayStatus           = setPayStatus;
window.setStopPayStatus       = setStopPayStatus;
window.openTimeBankModal      = openTimeBankModal;
window.closeTimeBankModal     = closeTimeBankModal;
window.selectTimeBankEntry    = selectTimeBankEntry;
window.assignTimeBankToUnit   = assignTimeBankToUnit;
window.deleteTimeBankEntry    = deleteTimeBankEntry;
