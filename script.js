// ===================== SCRIPT.JS (DASHBOARD) =====================
// Logika khusus halaman dashboard (index.html). Bagian bersama
// (Firebase, status, ACK, sendCommand, config helper) ada di shared.js.

// --- 1. JAM DIGITAL ---
let prayerTimes = {};
let lastDoorStatus = null;

function updateClock() {
    const now = new Date();
    const timeEl = document.getElementById('live-clock');
    const dateEl = document.getElementById('live-date');

    if (timeEl) timeEl.innerText = now.toLocaleTimeString('en-GB', { hour12: false });
    if (dateEl) dateEl.innerText = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    if (now.getSeconds() === 0) highlightNextPrayer();
}
setInterval(updateClock, 1000);

// --- 2. JADWAL SHOLAT ---
database.ref('/jadwal').on('value', (snap) => {
    const jadwal = snap.val();
    if (jadwal) {
        const map = { 'subuh': 'Fajr', 'dzuhur': 'Dhuhr', 'ashar': 'Asr', 'maghrib': 'Maghrib', 'isya': 'Isha' };
        prayerTimes = {};

        // --- FITUR RAMADHAN: Hitung & Tampilkan Imsak ---
        if (jadwal['subuh']) {
            let [h, m] = jadwal['subuh'].split(':').map(Number);
            let imsakMins = (h * 60 + m) - 10;
            if (imsakMins < 0) imsakMins += 1440;
            let imsakH = Math.floor(imsakMins / 60).toString().padStart(2, '0');
            let imsakM = (imsakMins % 60).toString().padStart(2, '0');
            let imsakTime = `${imsakH}:${imsakM}`;

            injectImsakDisplay(imsakTime);
            prayerTimes['Imsak'] = imsakTime;
        }

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

function injectImsakDisplay(time) {
    const grid = document.querySelector('.prayer-grid');
    if (grid && !document.getElementById('p-Imsak')) {
        const div = document.createElement('div');
        div.className = 'prayer-item';
        div.id = 'p-Imsak';
        div.innerHTML = `<span>Imsak</span><b id="t-Imsak">${time}</b>`;
        grid.insertBefore(div, grid.firstChild);
        grid.style.gridTemplateColumns = "repeat(3, 1fr)";
    } else {
        const el = document.getElementById('t-Imsak');
        if (el) el.innerText = time;
    }
}

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
    if (elNext) elNext.classList.add('active');
}

// --- 3. DATA SENSOR (SAFE MODE) ---
database.ref('/sensor').on('value', (snap) => {
    try {
        lastMcuUpdate = Date.now();
        checkMcuStatus();

        const data = snap.val() || {};
        currentSensorData = data;

        const elTemp = document.getElementById('val-temp');
        const elHum = document.getElementById('val-hum');
        if (elTemp) elTemp.innerText = (data.temperature || 0).toFixed(1) + "°C";
        if (elHum) elHum.innerText = Math.round(data.humidity || 0) + "%";

        // --- AUTO-LOG: Catat perubahan status pintu ke History ---
        if (data.status && data.status !== lastDoorStatus) {
            if (lastDoorStatus !== null) {
                const raw = parseFloat(data.temperature || 0);
                const cleanTemp = Number(Math.round(raw + "e1") + "e-1") || raw;
                pushLog(data.status, cleanTemp);
            }
            lastDoorStatus = data.status;
        }

        // Visualisasi Pintu
        const doorText = document.getElementById('door-text');
        const doorIcon = document.getElementById('door-icon');
        const doorCard = document.getElementById('door-card');

        if (doorText && doorIcon && doorCard) {
            if (data.status === "OPENED") {
                doorText.innerText = "DOOR OPENED";
                doorIcon.className = "fas fa-door-open";
                doorCard.style.color = "#ff4d6d";
                doorCard.style.background = "rgba(255, 77, 109, 0.1)";
            } else {
                doorText.innerText = "DOOR CLOSED";
                doorIcon.className = "fas fa-door-closed";
                doorCard.style.color = "#06d6a0";
                doorCard.style.background = "rgba(6, 214, 160, 0.1)";
            }
        }
    } catch (err) {
        console.log("Sensor Update Error (Ignored):", err);
    }
});

// --- 4. LISTENER CONFIG (SAFE MODE) ---
database.ref('/config').on('value', (snap) => {
    const config = snap.val() || {};

    const swAlert = document.getElementById('switch-alert');
    const swAdzan = document.getElementById('switch-adzan');
    const swSec = document.getElementById('switch-security');
    const swAccess = document.getElementById('switch-access');
    const swVoice = document.getElementById('switch-voice');

    // --- FITUR RAMADHAN: Switch Alarm Sahur ---
    injectSahurSwitch();
    const swSahur = document.getElementById('switch-sahur');
    if (swSahur) swSahur.checked = config.sahurAlarmMode || false;

    const statusText = document.getElementById('access-status-text');

    if (swAlert) swAlert.checked = config.alertMode || false;
    if (swAdzan) swAdzan.checked = config.adzanAuto || false;
    if (swSec) swSec.checked = config.securityMode || false;

    if (swVoice) {
        swVoice.checked = config.voiceJamEnabled || false;
        updateVoiceUiState(swVoice.checked);
    }

    if (swAccess) {
        swAccess.checked = config.accessCardDisabled || false;
        if (statusText) {
            statusText.innerText = swAccess.checked ? "Sensor kartu sedang DIMATIKAN" : "Sensor kartu sedang AKTIF";
            statusText.style.color = swAccess.checked ? "#ff4d6d" : "#666";
        }
    }
});

function injectSahurSwitch() {
    const container = document.querySelector('.main-panel');
    if (container && !document.getElementById('switch-sahur')) {
        const div = document.createElement('div');
        div.className = 'switch-group';
        div.innerHTML = `
            <div>
                <i class="fas fa-moon" style="color:var(--secondary); margin-right:8px;"></i>
                <b>Alarm Sahur</b>
                <div style="font-size:0.7rem; color:#aaa;">Bunyi 1 jam sebelum Imsak</div>
            </div>
            <label class="switch">
                <input type="checkbox" id="switch-sahur" onchange="updateConfig('sahurAlarmMode', this.checked)">
                <span class="slider"></span>
            </label>
        `;
        const ref = container.querySelector('.switch-group');
        if (ref) container.insertBefore(div, ref);
    }
}

function toggleAccess(isDisableMode) {
    const cmdID = isDisableMode ? 6 : 7;
    const statusText = document.getElementById('access-status-text');

    armCommandAck(cmdID);
    Swal.fire({ title: 'Mohon Tunggu...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    database.ref('/control/command').set(cmdID).catch(() => {
        if (pendingCommandTimer) clearTimeout(pendingCommandTimer);
        pendingCommand = null;
        Swal.fire({ title: 'Gagal mengirim perintah', icon: 'error' });
    });

    const upd = { accessCardDisabled: isDisableMode, ver: bumpConfigVersion() };
    database.ref('/config').update(upd);

    if (statusText) {
        statusText.innerText = isDisableMode ? "Sensor kartu sedang DIMATIKAN" : "Sensor kartu sedang AKTIF";
        statusText.style.color = isDisableMode ? "#ff4d6d" : "#666";
    }
}

// --- 5. FITUR VOICE JAM TESTER (via Firebase) ---
function updateVoiceUiState(enabled) {
    const txt = document.getElementById('voice-enable-txt');
    const jamSel = document.getElementById('voice-jam');
    const waktuSel = document.getElementById('voice-waktu');
    const playBtn = document.getElementById('btn-voice-play');
    if (txt) {
        txt.innerText = enabled ? '✅ Fitur voice jam AKTIF - siap dipakai' : '⛔ Fitur voice jam NONAKTIF';
        txt.style.color = enabled ? '#06d6a0' : '#ff4d6d';
    }
    if (jamSel) jamSel.disabled = !enabled;
    if (waktuSel) waktuSel.disabled = !enabled;
    if (playBtn) playBtn.disabled = !enabled;
}

function playVoiceJam() {
    const swVoice = document.getElementById('switch-voice');
    if (swVoice && !swVoice.checked) {
        Swal.fire({ icon: 'warning', title: 'Voice Jam NONAKTIF', text: 'Aktifkan toggle Voice Jam Tester dulu.' });
        return;
    }
    const jam = parseInt(document.getElementById('voice-jam').value);
    const waktuId = parseInt(document.getElementById('voice-waktu').value);
    const btn = document.getElementById('btn-voice-play');
    const st = document.getElementById('voice-status');
    if (isNaN(jam) || jam < 1 || jam > 12) {
        if (st) { st.innerText = 'Jam harus 1-12'; st.style.color = '#ff4d6d'; }
        return;
    }
    if (btn) { btn.disabled = true; btn.innerText = '⏳ Memutar...'; }
    if (st) { st.style.color = '#636e72'; st.innerText = 'Mengirim voice jam ' + jam + ' ' + document.getElementById('voice-waktu').selectedOptions[0].innerText + '...'; }

    database.ref('/control/voice_test_result').set('')
        .then(() => database.ref('/control/voice_test').set(jam * 10 + waktuId))
        .catch(() => {
            if (btn) { btn.disabled = false; btn.innerText = 'PLAY VOICE'; }
            if (st) { st.innerText = 'Gagal mengirim perintah'; st.style.color = '#ff4d6d'; }
        });
}

database.ref('/control/voice_test_result').on('value', (snap) => {
    const r = snap.val();
    if (typeof r === 'string' && r.length > 0) {
        const btn = document.getElementById('btn-voice-play');
        const st = document.getElementById('voice-status');
        const isError = r.indexOf('error:') === 0;
        if (st) {
            st.innerText = (isError ? '⛔ ' : '✅ ') + r.replace(/^(error|success):\s*/, '');
            st.style.color = isError ? '#ff4d6d' : '#06d6a0';
        }
        if (btn) { btn.disabled = false; btn.innerText = 'PLAY VOICE'; }
        setTimeout(() => { database.ref('/control/voice_test_result').set(''); }, 4000);
    }
});

function stopVoiceJam() {
    const st = document.getElementById('voice-status');
    if (st) { st.style.color = '#636e72'; st.innerText = 'Mengirim perintah stop audio...'; }
    database.ref('/control/command').set(4)
        .then(() => { if (st) { st.innerText = 'Stop audio terkirim.'; st.style.color = '#06d6a0'; } })
        .catch(() => { if (st) { st.innerText = 'Gagal mengirim stop.'; st.style.color = '#ff4d6d'; } });
}

// inisialisasi state UI voice jam saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
    const swVoice = document.getElementById('switch-voice');
    if (swVoice) updateVoiceUiState(swVoice.checked);
});
