/*
 * idle-logout.js
 * Fitur auto-logout ketika aplikasi diam (idle) selama 10 menit.
 * - Melacak aktivitas user (mouse, keyboard, touch, scroll, click).
 * - Menampilkan modal peringatan countdown 60 detik sebelum logout.
 * - Saat waktu habis: signOut Supabase + bersihkan localStorage + redirect ke index.html.
 *
 * Cara pakai: cukup include <script src="idle-logout.js"></script> pada halaman yang
 * membutuhkan proteksi idle (dashboard, ams, database, download, parking).
 * Script akan otomatis mencari global `sbClient` (Supabase client) bila tersedia.
 */
(function () {
    'use strict';

    // ===== KONFIGURASI =====
    var IDLE_TIMEOUT_MS = 10 * 60 * 1000;   // 10 menit total idle
    var WARNING_BEFORE_MS = 60 * 1000;      // peringatan muncul 1 menit sebelum logout
    var LOGIN_PAGE = 'index.html';

    var warningTimer = null;
    var logoutTimer = null;
    var countdownInterval = null;

    // ===== UTIL: Buat modal peringatan (hanya sekali) =====
    function ensureWarningModal() {
        if (document.getElementById('idleLogoutModal')) return;

        var style = document.createElement('style');
        style.textContent = [
            '#idleLogoutModal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(3px);font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;}',
            '#idleLogoutModal.show{display:flex;}',
            '#idleLogoutBox{background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.3);width:90%;max-width:380px;padding:28px 24px 22px;text-align:center;animation:idlePop .25s ease;}',
            '@keyframes idlePop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}',
            '#idleLogoutBox .ico{width:64px;height:64px;border-radius:50%;background:#fff3cd;color:#856404;display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto 14px;}',
            '#idleLogoutBox h5{font-weight:800;margin:0 0 6px;color:#2c3e50;font-size:1.15rem;}',
            '#idleLogoutBox p{font-size:.85rem;color:#6c757d;margin:0 0 16px;line-height:1.45;}',
            '#idleLogoutBox .count{font-size:2.4rem;font-weight:800;color:#dc3545;font-variant-numeric:tabular-nums;line-height:1;margin-bottom:16px;}',
            '#idleLogoutBox .btn-stay{background:#0d6efd;color:#fff;border:none;border-radius:10px;padding:10px 22px;font-weight:700;font-size:.9rem;cursor:pointer;box-shadow:0 4px 12px rgba(13,110,253,.3);transition:.2s;}',
            '#idleLogoutBox .btn-stay:hover{background:#0b5ed7;transform:translateY(-1px);}'
        ].join('\n');
        document.head.appendChild(style);

        var modal = document.createElement('div');
        modal.id = 'idleLogoutModal';
        modal.innerHTML =
            '<div id="idleLogoutBox">' +
                '<div class="ico"><span>&#9203;</span></div>' +
                '<h5>Sesi akan berakhir</h5>' +
                '<p>Aplikasi tidak digunakan selama 10 menit. Anda akan keluar otomatis ke halaman login.</p>' +
                '<div class="count" id="idleCountdown">60</div>' +
                '<button class="btn-stay" id="idleStayBtn">Lanjut Gunakan Aplikasi</button>' +
            '</div>';
        document.body.appendChild(modal);

        document.getElementById('idleStayBtn').addEventListener('click', function () {
            hideWarning();
            resetIdleTimer();
        });
    }

    function showWarning() {
        ensureWarningModal();
        var modal = document.getElementById('idleLogoutModal');
        var countEl = document.getElementById('idleCountdown');
        if (!modal || !countEl) return;

        var remaining = Math.round(WARNING_BEFORE_MS / 1000);
        countEl.textContent = remaining;
        modal.classList.add('show');

        clearInterval(countdownInterval);
        countdownInterval = setInterval(function () {
            remaining--;
            if (remaining <= 0) {
                clearInterval(countdownInterval);
                return;
            }
            countEl.textContent = remaining;
        }, 1000);
    }

    function hideWarning() {
        var modal = document.getElementById('idleLogoutModal');
        if (modal) modal.classList.remove('show');
        clearInterval(countdownInterval);
    }

    // ===== LOGOUT =====
    function performLogout() {
        hideWarning();
        // Coba signOut via global Supabase client bila ada (sbClient / supabaseClient)
        try {
            var client = (typeof sbClient !== 'undefined' && sbClient) ||
                         (typeof supabaseClient !== 'undefined' && supabaseClient) ||
                         null;
            if (client && client.auth && typeof client.auth.signOut === 'function') {
                // signOut tanpa menunggu agar redirect tetap jalan walau jaringan lambat
                try { client.auth.signOut(); } catch (_) {}
            }
        } catch (_) {}

        // Bersihkan state lokal
        try {
            localStorage.removeItem('ams_user_name');
            localStorage.removeItem('ams_user_email');
            localStorage.removeItem('ams_user_id');
        } catch (_) {}

        // Redirect ke halaman login
        window.location.replace(LOGIN_PAGE);
    }

    // ===== TIMER MANAGEMENT =====
    function clearTimers() {
        clearTimeout(warningTimer);
        clearTimeout(logoutTimer);
        warningTimer = null;
        logoutTimer = null;
    }

    function resetIdleTimer() {
        // Bila modal peringatan sedang tampil, biarkan countdown jalan (jangan reset otomatis
        // dari event biasa). Reset hanya lewat tombol "Lanjut".
        var modal = document.getElementById('idleLogoutModal');
        if (modal && modal.classList.contains('show')) return;

        clearTimers();
        hideWarning();

        warningTimer = setTimeout(showWarning, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);
        logoutTimer = setTimeout(performLogout, IDLE_TIMEOUT_MS);
    }

    // ===== ACTIVITY LISTENERS =====
    var activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];
    var throttled = false;

    function onActivity() {
        if (throttled) return;
        throttled = true;
        // Throttle sederhana agar tidak reset terlalu sering (performa)
        setTimeout(function () { throttled = false; }, 1000);
        resetIdleTimer();
    }

    function bindActivity() {
        activityEvents.forEach(function (evt) {
            window.addEventListener(evt, onActivity, { passive: true });
        });
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) onActivity(); // reset saat tab kembali aktif
        });
    }

    // ===== INIT =====
    function initIdleLogout() {
        bindActivity();
        resetIdleTimer();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initIdleLogout);
    } else {
        initIdleLogout();
    }
})();

