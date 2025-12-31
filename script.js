// --- KONFIGURASI FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyDcmkklfPbwnf_xI2Ie4bBffv_1A6Z9Nh0",
    authDomain: "pintuiot.firebaseapp.com",
    databaseURL: "https://pintuiot-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "pintuiot",
    messagingSenderId: "555761531390",
    appId: "1:555761531390:web:d5093cf6c4dac86ba768af"
};

// Inisialisasi Firebase (Cek agar tidak double init)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// --- VARIABEL GLOBAL ---
let prayerTimes = {};
let lastMcuUpdate = 0;
const offlineThreshold = 15000; // 15 Detik toleransi offline

// --- 1. NAVIGASI SIDEBAR & HALAMAN ---
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    if(sb) sb.classList.toggle('active');
    if(ov) ov.classList.toggle('active');
}

function showPage(pageName) {
    // Sembunyikan semua halaman
    document.querySelectorAll('.page-section').forEach(el => el.style.display = 'none');
    
    // Tampilkan halaman target
    const target = document.getElementById('page-' + pageName);
    if (target) target.style.display = 'block';

    // Update Menu Aktif
    document.querySelectorAll('.sidebar-menu li').forEach(el => el.classList.remove('active-menu'));
    const menu = document.getElementById(pageName === 'dashboard' ? 'menu-dash' : 'menu-hist');
    if (menu) menu.classList.add('active-menu');

    // Tutup sidebar jika di HP (Mobile UX)
    const sb = document.getElementById('sidebar');
    if (sb && sb.classList.contains('active')) toggleSidebar();
}

// --- 2. JAM DIGITAL ---
function updateClock() {
    const now = new Date();
    const timeEl = document.getElementById('live-clock');
    const dateEl = document.getElementById('live-date');

    if (timeEl) timeEl.innerText = now.toLocaleTimeString('en-GB', { hour12: false });
    if (dateEl) dateEl.innerText = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    if (now.getSeconds() === 0) highlightNextPrayer();
}
setInterval(updateClock, 1000);

// --- 3. JADWAL SHOLAT ---
database.ref('/jadwal').on('value', (snap) => {
    const jadwal = snap.val();
    if (jadwal) {
        const map = { 'subuh': 'Fajr', 'dzuhur': 'Dhuhr', 'ashar': 'Asr', 'maghrib': 'Maghrib', 'isya': 'Isha' };
        prayerTimes = {};

        for (const [indoKey, htmlKey] of Object.entries(map)) {
            if (jadwal[indoKey]) {
                const el = document.getElementById(`t-${htmlKey}`);
                if (el) el.innerText = jadwal[indoKey];
                prayerTimes[htmlKey] = jadwal[indoKey];
            }
        }
        highlightNextPrayer();
    }
});

function highlightNextPrayer() {
    if (Object.keys(prayerTimes).length === 0) return;
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    let nextPrayer = 'Fajr'; let minDiff = 1440;

    Object.keys(prayerTimes).forEach(p => {
        const [h, m] = prayerTimes[p].split(':');
        const diff = (parseInt(h) * 60 + parseInt(m)) - currentMin;
        
        const elItem = document.getElementById(`p-${p}`);
        if (elItem) elItem.classList.remove('active');
        
        if (diff > 0 && diff < minDiff) { minDiff = diff; nextPrayer = p; }
    });
    
    const elNext = document.getElementById(`p-${nextPrayer}`);
    if(elNext) elNext.classList.add('active');
}

// --- 4. STATUS ONLINE/OFFLINE ---
function checkMcuStatus() {
    const now = Date.now();
    const badge = document.getElementById('mcu-status');
    if (!badge) return;
    
    const txt = badge.querySelector('span');
    
    if (lastMcuUpdate !== 0 && (now - lastMcuUpdate < offlineThreshold)) {
        if (!badge.classList.contains('online')) {
            badge.className = 'status-badge online';
            if(txt) txt.innerText = 'Online';
        }
    } else {
        if (!badge.classList.contains('offline')) {
            badge.className = 'status-badge offline';
            if(txt) txt.innerText = 'Offline';
        }
    }
}
setInterval(checkMcuStatus, 5000);

// --- 5. DATA SENSOR (SAFE MODE) ---
database.ref('/sensor').on('value', (snap) => {
    try {
        lastMcuUpdate = Date.now(); 
        checkMcuStatus();
    
        const data = snap.val() || {};
        
        // Cek elemen sebelum update untuk mencegah error
        const elTemp = document.getElementById('val-temp');
        const elHum = document.getElementById('val-hum');
        
        if (elTemp) elTemp.innerText = (data.temperature || 0).toFixed(1) + "°C";
        if (elHum) elHum.innerText = (data.humidity || 0) + "%";
        
        // Visualisasi Pintu
        const doorText = document.getElementById('door-text');
        const doorIcon = document.getElementById('door-icon');
        const doorCard = document.getElementById('door-card');
    
        if (doorText && doorIcon && doorCard) {
            if(data.status === "OPENED") {
                doorText.innerText = "DOOR OPEN";
                doorIcon.className = "fas fa-door-open";
                doorCard.style.color = "#ff4d6d";
                doorCard.style.background = "rgba(255, 77, 109, 0.1)";
           } else {
                doorText.innerText = "DOOR CLOSED"; // Boleh ganti teks jadi CLOSED atau tetap LOCKED
                doorIcon.className = "fas fa-door-closed"; // <--- ICON BARU
                doorCard.style.color = "#06d6a0";
                doorCard.style.background = "rgba(6, 214, 160, 0.1)";
            }
        }
    } catch (err) {
        console.log("Sensor Update Error (Ignored):", err);
    }
});

// --- 6. CONTROL & CONFIG ---
function sendCommand(cmd, title, text) {
    Swal.fire({ 
        title: title, text: text, icon: 'question', 
        showCancelButton: true, confirmButtonColor: '#4361ee',
        background: '#1a1c2c', color: '#fff'
    }).then((r) => {
        if (r.isConfirmed) {
            database.ref('/control/command').set(cmd);
            
            // Log Manual ke History (Pending Queue)
            const now = new Date();
            let aksiStr = "Command Web";
            if(cmd==3) aksiStr="Buka Pintu (Web)";
            if(cmd==5) aksiStr="Test Adzan (Web)";
            if(cmd==7) aksiStr="Stop Audio (Web)";

            const logData = {
                waktu: now.toLocaleTimeString('id-ID'),
                status: aksiStr,
                suhu: document.getElementById('val-temp') ? document.getElementById('val-temp').innerText : "0"
            };
            database.ref('/logs_pending').push(logData);

            Swal.fire({ title: 'Terkirim!', icon: 'success', timer: 1000, showConfirmButton: false, background: '#1a1c2c', color: '#fff' });
        }
    });
}

function updateConfig(path, val) { 
    database.ref('/config/' + path).set(val); 
}

// Listener Config (Safe Mode)
database.ref('/config').on('value', (snap) => {
    const config = snap.val() || {};
    
    const swAlert = document.getElementById('switch-alert');
    const swAdzan = document.getElementById('switch-adzan');
    const swSec = document.getElementById('switch-security');
    
    if (swAlert) swAlert.checked = config.alertMode || false;
    if (swAdzan) swAdzan.checked = config.adzanAuto || false;
    if (swSec) swSec.checked = config.securityMode || false;
});

