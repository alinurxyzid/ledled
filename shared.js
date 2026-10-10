// ===================== SHARED.JS =====================
// Kode bersama untuk semua halaman online (index / setup / log).
// Berisi: init Firebase, status online, navigasi sidebar, ACK command,
// helper config (versi anti-konflik), dan fungsi kontrol umum.

// --- KONFIGURASI FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyDcmkklfPbwnf_xI2Ie4bBffv_1A6Z9Nh0",
    authDomain: "pintuiot.firebaseapp.com",
    databaseURL: "https://pintuiot-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "pintuiot",
    messagingSenderId: "555761531390",
    appId: "1:555761531390:web:d5093cf6c4dac86ba768af"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// --- VARIABEL GLOBAL BERSAMA ---
let lastMcuUpdate = 0;
let currentSensorData = {};        // diisi listener /sensor di dashboard
const offlineThreshold = 25000;    // 25 detik toleransi offline (heartbeat ~10 dtk)

// --- NAVIGASI SIDEBAR ---
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    if (sb) sb.classList.toggle('active');
    if (ov) ov.classList.toggle('active');
}

// --- STATUS ONLINE/OFFLINE ---
function checkMcuStatus() {
    const now = Date.now();
    const badge = document.getElementById('mcu-status');
    if (!badge) return;
    const txt = badge.querySelector('span');
    if (lastMcuUpdate !== 0 && (now - lastMcuUpdate < offlineThreshold)) {
        if (!badge.classList.contains('online')) {
            badge.className = 'status-badge online';
            if (txt) txt.innerText = 'Online';
        }
    } else {
        if (!badge.classList.contains('offline')) {
            badge.className = 'status-badge offline';
            if (txt) txt.innerText = 'Offline';
        }
    }
}
setInterval(checkMcuStatus, 5000);

database.ref('/sensor/heartbeat').on('value', (snap) => {
    const hb = snap.val();
    if (typeof hb === 'number' && hb > 1577836800) {
        lastMcuUpdate = hb * 1000;
        checkMcuStatus();
    }
});

// --- KONFIGURASI VERSI (anti-konflik Firebase online vs web offline) ---
let cfgVersion = 0;
function bumpConfigVersion() {
    const now = Math.floor(Date.now() / 1000);
    cfgVersion = now > cfgVersion ? now : cfgVersion + 1;
    return cfgVersion;
}

// Update satu key config (dipakai toggle dashboard).
function updateConfig(path, val) {
    const upd = {};
    upd[path] = val;
    upd.ver = bumpConfigVersion();
    database.ref('/config').update(upd);
}

// --- LOG PENDING (untuk riwayat / Google Sheets) ---
function pushLog(aksiStr, tempOverride) {
    let t = tempOverride;
    if (t === undefined) {
        const raw = currentSensorData.temperature || 0;
        t = Number(Math.round(raw + "e1") + "e-1") || raw;
    }
    const now = new Date();
    database.ref('/logs_pending').push({
        waktu: now.toLocaleTimeString('en-GB', { hour12: false }),
        status: aksiStr,
        suhu: t
    });
}

// --- CONTROL & ACK COMMAND ---
let pendingCommand = null;
let pendingCommandTimer = null;

function armCommandAck(cmd) {
    pendingCommand = { cmd: cmd };
    if (pendingCommandTimer) clearTimeout(pendingCommandTimer);
    pendingCommandTimer = setTimeout(() => {
        pendingCommand = null;
        Swal.fire({
            title: 'Perangkat tidak merespon',
            text: 'Perintah sudah terkirim, tapi belum ada balasan dari perangkat (mungkin offline).',
            icon: 'error'
        });
    }, 15000);
}

database.ref('/control/command_result').on('value', (snap) => {
    const r = snap.val();
    if (r && r.status === 'success' && pendingCommand && r.cmd === pendingCommand.cmd) {
        clearTimeout(pendingCommandTimer);
        pendingCommand = null;
        Swal.fire({ title: 'Berhasil Diterima Perangkat!', icon: 'success', timer: 1500, showConfirmButton: false });
    }
});

function sendCommand(cmd, title, text) {
    Swal.fire({
        title: title, text: text, icon: 'question',
        showCancelButton: true, confirmButtonColor: '#4361ee',
    }).then((r) => {
        if (r.isConfirmed) {
            armCommandAck(cmd);
            Swal.fire({ title: 'Menunggu perangkat...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            database.ref('/control/command').set(cmd).catch(() => {
                if (pendingCommandTimer) clearTimeout(pendingCommandTimer);
                pendingCommand = null;
                Swal.fire({ title: 'Gagal mengirim perintah', icon: 'error' });
            });

            let aksiStr = "Command Web";
            if (cmd == 1) aksiStr = "Buka Pintu (Web)";
            if (cmd == 3) aksiStr = "Test Adzan (Web)";
            if (cmd == 5) aksiStr = "Test Sahur (Web)";
            if (cmd == 4) aksiStr = "Stop Audio (Web)";
            if (cmd == 8) aksiStr = "Test Tarhim (Web)";
            pushLog(aksiStr);
        }
    });
}

// --- RESTART DEVICE ---
function restartDevice() {
    Swal.fire({
        title: 'Restart Perangkat?',
        text: 'Perangkat akan reboot dalam beberapa detik.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff4757',
        confirmButtonText: 'Ya, Restart',
        cancelButtonText: 'Batal'
    }).then((r) => {
        if (r.isConfirmed) {
            database.ref('/control/restart').set(1);
            Swal.fire({
                icon: 'info', title: 'Restarting...',
                text: 'Menunggu perangkat reboot (sekitar 10-30 detik).',
                showConfirmButton: false, timer: 10000
            });
        }
    });
}
