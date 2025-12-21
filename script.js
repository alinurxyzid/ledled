// --- KONFIGURASI FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyDcmkklfPbwnf_xI2Ie4bBffv_1A6Z9Nh0",
    authDomain: "pintuiot.firebaseapp.com",
    databaseURL: "https://pintuiot-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "pintuiot",
    storageBucket: "pintuiot.firebasestorage.app",
    messagingSenderId: "555761531390",
    appId: "1:555761531390:web:d5093cf6c4dac86ba768af"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let prayerTimes = {};
let lastMcuUpdate = 0;
const offlineThreshold = 15000; // 15 Detik toleransi offline

// --- 1. JAM DIGITAL ---
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('live-clock').innerText = timeStr;
    document.getElementById('live-date').innerText = dateStr;
    
    if (now.getSeconds() === 0) highlightNextPrayer();
}
setInterval(updateClock, 1000);

// --- 2. JADWAL SHOLAT (DARI FIREBASE) ---
database.ref('/jadwal').on('value', (snap) => {
    const jadwal = snap.val();
    if (jadwal) {
        const map = { 'subuh': 'Fajr', 'dzuhur': 'Dhuhr', 'ashar': 'Asr', 'maghrib': 'Maghrib', 'isya': 'Isha' };
        prayerTimes = {};

        for (const [indoKey, htmlKey] of Object.entries(map)) {
            if (jadwal[indoKey]) {
                document.getElementById(`t-${htmlKey}`).innerText = jadwal[indoKey];
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
        const prayerMin = parseInt(h) * 60 + parseInt(m);
        const diff = prayerMin - currentMin;
        
        document.getElementById(`p-${p}`).classList.remove('active');
        if (diff > 0 && diff < minDiff) { minDiff = diff; nextPrayer = p; }
    });
    const el = document.getElementById(`p-${nextPrayer}`);
    if(el) el.classList.add('active');
}

// --- 3. STATUS ONLINE / OFFLINE ---
function checkMcuStatus() {
    const now = Date.now();
    const statusBadge = document.getElementById('mcu-status');
    const statusText = statusBadge.querySelector('span');

    if (lastMcuUpdate !== 0 && (now - lastMcuUpdate < offlineThreshold)) {
        if (!statusBadge.classList.contains('online')) {
            statusBadge.className = 'status-badge online';
            statusText.innerText = 'Online';
        }
    } else {
        if (!statusBadge.classList.contains('offline')) {
            statusBadge.className = 'status-badge offline';
            statusText.innerText = 'Offline';
        }
    }
}
setInterval(checkMcuStatus, 5000);

// --- 4. DATA REALTIME & PINTU ---
database.ref('/sensor').on('value', (snap) => {
    // Catat waktu masuk data (Heartbeat)
    lastMcuUpdate = Date.now(); 
    checkMcuStatus();

    const data = snap.val() || {};
    document.getElementById('val-temp').innerText = (data.temperature || 0).toFixed(1) + "°C";
    document.getElementById('val-hum').innerText = (data.humidity || 0) + "%";
    
    const doorText = document.getElementById('door-text');
    const doorIcon = document.getElementById('door-icon');
    const doorCard = document.getElementById('door-card');

    if(data.status === "OPENED") {
        doorText.innerText = "DOOR OPEN";
        doorIcon.className = "fas fa-door-open";
        doorCard.style.color = "#ff4d6d";
        doorCard.style.background = "rgba(255, 77, 109, 0.1)";
    } else {
        doorText.innerText = "DOOR LOCKED";
        doorIcon.className = "fas fa-lock";
        doorCard.style.color = "#06d6a0";
        doorCard.style.background = "rgba(6, 214, 160, 0.1)";
    }
});

// --- 5. CONTROL & CONFIG ---
function sendCommand(cmd, title, text) {
    Swal.fire({ 
        title: title, text: text, icon: 'question', 
        showCancelButton: true, confirmButtonColor: '#4361ee',
        background: '#1a1c2c', color: '#fff'
    }).then((r) => {
        if (r.isConfirmed) {
            database.ref('/control/command').set(cmd);
            Swal.fire({ title: 'Terkirim!', icon: 'success', timer: 1000, showConfirmButton: false, background: '#1a1c2c', color: '#fff' });
        }
    });
}

function updateConfig(path, val) { 
    database.ref('/config/' + path).set(val); 
}

database.ref('/config').on('value', (snap) => {
    const config = snap.val() || {};
    document.getElementById('switch-alert').checked = config.alertMode || false;
    document.getElementById('switch-adzan').checked = config.adzanAuto || false;
});