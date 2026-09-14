/* ============================================================
   reports.js — Rental PS Mugis
   Firebase v8 Compat API — Laporan Keuangan
   ============================================================ */

'use strict';

var db          = null;
var allTxns     = [];
var currentFilter = 'today';

// ── Firebase Init ─────────────────────────────────────────────
function initFirebaseReports() {
  try {
    // firebase sudah diinit via firebase-config.js (firebase.apps.length check)
    // gunakan instance yang sudah ada, atau init baru
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.database();

    // Real-time listener untuk transaksi
    db.ref('transactions').on('value', function(snapshot) {
      var data = snapshot.val();
      if (data) {
        allTxns = Object.values(data).sort(function(a, b) {
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
      } else {
        allTxns = [];
      }
      renderAll();
    });

    // Set nama toko dari config
    var storeEl = document.getElementById('storeName');
    if (storeEl && typeof STORE_NAME !== 'undefined') {
      storeEl.textContent = STORE_NAME;
    }

    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');

  } catch (err) {
    console.error('Firebase Reports error:', err);
    var loadingText = document.getElementById('loadingText');
    if (loadingText) loadingText.textContent = '⚠️ Gagal terhubung: ' + err.message;
  }
}

// ── Filter Transactions ────────────────────────────────────────
function getFilteredTxns(filter) {
  var now = new Date();
  return allTxns.filter(function(txn) {
    var txDate = new Date(txn.createdAt || 0);
    if (filter === 'today') {
      return txn.date === toDateStr(now);
    }
    if (filter === 'week') {
      var startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return txDate >= startOfWeek;
    }
    if (filter === 'month') {
      return txDate.getMonth() === now.getMonth() &&
             txDate.getFullYear() === now.getFullYear();
    }
    return true; // 'all'
  });
}

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

// ── Render All ────────────────────────────────────────────────
function renderAll() {
  renderStats();
  renderTable(currentFilter);
}

// ── Render Stats ──────────────────────────────────────────────
function renderStats() {
  var today  = getFilteredTxns('today');
  var week   = getFilteredTxns('week');
  var month  = getFilteredTxns('month');
  var all    = allTxns;

  function sumCost(arr) {
    return arr.filter(function(t) { return t.payStatus === 'paid'; })
              .reduce(function(acc, t) { return acc + (t.totalCost || 0); }, 0);
  }

  setText('statToday',      'Rp ' + formatRupiah(sumCost(today)));
  setText('statWeek',       'Rp ' + formatRupiah(sumCost(week)));
  setText('statMonth',      'Rp ' + formatRupiah(sumCost(month)));
  setText('statTotal',      'Rp ' + formatRupiah(sumCost(all)));
  setText('statTodayCount',  today.length  + ' transaksi');
  setText('statWeekCount',   week.length   + ' transaksi');
  setText('statMonthCount',  month.length  + ' transaksi');
  setText('statTotalCount',  all.length    + ' transaksi');
}

// ── Render Table ──────────────────────────────────────────────
function renderTable(filter) {
  currentFilter = filter;

  document.querySelectorAll('.filter-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.filter === filter);
  });

  var txns  = getFilteredTxns(filter);
  var tbody = document.getElementById('txnTbody');
  if (!tbody) return;

  if (txns.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7">' +
      '<div class="empty-state">' +
      '<div class="empty-icon">📋</div>' +
      '<div class="empty-text">Belum ada transaksi untuk periode ini</div>' +
      '</div></td></tr>';
    return;
  }

  tbody.innerHTML = txns.map(function(txn) {
    var startDate = new Date(txn.startTime || 0);
    var endDate   = new Date(txn.endTime   || 0);
    var durStr    = secondsToHMS(txn.durationSec || 0);
    return '<tr>' +
      '<td><span class="txn-unit">' + (txn.unitName || '—') + '</span></td>' +
      '<td><span class="badge ' + (txn.mode === 'package' ? 'package' : 'open') + '">' +
          (txn.mode === 'package' ? 'Paket' : 'Open') + '</span></td>' +
      '<td><span class="mono">' + durStr + '</span></td>' +
      '<td><span class="txn-cost">Rp ' + formatRupiah(txn.totalCost) + '</span></td>' +
      '<td><span class="badge ' + txn.payStatus + '">' +
          (txn.payStatus === 'paid' ? '✅ Lunas' : '⏳ Belum') + '</span></td>' +
      '<td class="txn-time">' + formatDateTime(startDate) + '</td>' +
      '<td class="txn-time">' + formatDateTime(endDate) + '</td>' +
      '</tr>';
  }).join('');
}

// ── Helpers ────────────────────────────────────────────────────
function secondsToHMS(totalSec) {
  var s   = Math.max(0, Math.floor(totalSec));
  var h   = Math.floor(s / 3600);
  var m   = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  return pad(h) + ':' + pad(m) + ':' + pad(sec);
}
function pad(n) { return String(n).padStart(2, '0'); }
function formatRupiah(num) { return Math.round(num || 0).toLocaleString('id-ID'); }
function formatDateTime(d) {
  if (!(d instanceof Date) || isNaN(d)) return '—';
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
}
function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── DOM Wiring ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.filter-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { renderTable(btn.dataset.filter); });
  });
  initFirebaseReports();
});
