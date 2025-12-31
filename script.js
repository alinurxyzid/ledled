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
                doorText.innerText = "DOOR OPENED";
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

            // A. Ambil teks suhu asli (Misal: "27.5 °C")
            let rawTemp = document.getElementById('val-temp') ? document.getElementById('val-temp').innerText : "0";

            let cleanTemp = rawTemp.replace(/[^\d.]/g, '');

            const logData = {
                waktu: now.toLocaleTimeString('en-GB', { hour12: false }),
                status: aksiStr,
                suhu: cleanTemp
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

function loadSheet() {
    const iframe = document.getElementById('sheet-frame');
    const cover = document.getElementById('sheet-cover');
    
    // 1. Ambil URL asli
    const url = iframe.getAttribute('data-src'); 
    
    // 2. Masukkan ke SRC agar mulai loading
    iframe.src = url;

    // 3. Efek Loading Sederhana
    cover.innerHTML = '<div style="color:#107c41"><i class="fas fa-spinner fa-spin fa-2x"></i><br>Mengambil Data...</div>';
    
    // 4. Hilangkan cover setelah 2 detik (estimasi loading selesai)
    setTimeout(() => {
        cover.style.opacity = '0'; // Efek fade out
        setTimeout(() => {
            cover.style.display = 'none'; // Hilang total
        }, 500);
    }, 2000);
}

// Konfigurasi Sheet
const SHEET_ID = '1sY__Jbcj_fwcG3enQwQ9KNNvRpjzBLXE475j2MM6BMg';
const SHEET_GID = '0'; 
const QUERY_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;

function loadNativeTable() {
    // 1. Ubah Tampilan UI (Loading Mode)
    const btn = document.getElementById('btn-load');
    const loadMsg = document.getElementById('loading-msg');
    
    btn.style.display = 'none'; // Sembunyikan tombol
    loadMsg.style.display = 'block'; // Munculkan teks loading

    // 2. Ambil Data
    fetch(QUERY_URL)
    .then(response => response.text())
    .then(text => {
        const jsonText = text.substr(47).slice(0, -2);
        const json = JSON.parse(jsonText);
        
        const cols = json.table.cols;
        const rows = json.table.rows;

        // Render Header
        let headerHtml = '';
        cols.forEach(col => {
            headerHtml += `<th>${col ? col.label : ''}</th>`;
        });
        document.getElementById('table-head').innerHTML = headerHtml;

        // Render Body (Dengan Logika Regex V3)
        let bodyHtml = '';
        rows.forEach(row => {
            bodyHtml += '<tr>';
            for (let i = 0; i < cols.length; i++) {
                const cell = row.c[i];
                let displayValue = '';

                if (cell) {
                    if (cell.v !== null) {
                        let raw = String(cell.v); 
                        if (raw.includes("Date(")) {
                            let nums = raw.match(/\d+/g); 
                            if (nums) {
                                let thn = parseInt(nums[0]);
                                if (thn === 1899 && nums.length >= 6) { // Jam
                                    displayValue = `${nums[3].padStart(2,'0')}:${nums[4].padStart(2,'0')}:${nums[5].padStart(2,'0')}`; 
                                } else if (thn > 1900 && nums.length >= 3) { // Tanggal
                                    // Format DD/MM/YYYY
                                    displayValue = `${nums[2].padStart(2,'0')}/${(parseInt(nums[1])+1).toString().padStart(2,'0')}/${nums[0]}`;
                                }
                            }
                        } else {
                            displayValue = cell.f || cell.v;
                        }
                    }
                }
                bodyHtml += `<td>${displayValue}</td>`;
            }
            bodyHtml += '</tr>';
        });
        document.getElementById('table-body').innerHTML = bodyHtml;

        // 3. Sukses! Hilangkan Cover dengan animasi
        const cover = document.getElementById('sheet-cover');
        cover.style.opacity = '0';
        setTimeout(() => {
            cover.style.display = 'none';
        }, 500);

    })
    .catch(error => {
        console.error('Error:', error);
        loadMsg.innerHTML = '<span style="color:red"><i class="fas fa-exclamation-triangle"></i> Gagal memuat data. Periksa koneksi.</span>';
        btn.style.display = 'inline-block'; // Munculkan tombol lagi biar bisa retry
    });
}
