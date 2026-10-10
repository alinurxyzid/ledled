// ===================== SETUP.JS =====================
// Halaman setup lanjutan. Semua field dikirim sekaligus lewat 1 tombol
// Simpan -> database.ref('/config').update(...). Bagian bersama di shared.js.

const TUNABLE_DEFAULTS = {
    adzSubuh: 3301, adzDzuhur: 3302, adzAshar: 3301, adzMaghrib: 3302, adzIsya: 3301,
    durAdzanMs: 270000, durTarhimMs: 300000, durSahurMs: 300000,
    tempAlertC: 28.8, tarhimOffsetSec: 310, sahurOffsetMin: 70,
    adzanBeforeSec: 600, adzanAfterSec: 300, tarhimAfterSec: 360,
    fbIntervalMs: 10000, syncIntervalMs: 86400000
};

let dirty = false;

function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v;
}

function setStatus(msg, color) {
    const el = document.getElementById('save-status');
    if (el) { el.innerText = msg; el.style.color = color || '#636e72'; }
}

// Konversi nilai dari Firebase (ms/detik) ke satuan tampilan (menit/jam)
function populate(cfg) {
    const src = Object.assign({}, TUNABLE_DEFAULTS, cfg || {});
    setVal('adzSubuh', src.adzSubuh);
    setVal('adzDzuhur', src.adzDzuhur);
    setVal('adzAshar', src.adzAshar);
    setVal('adzMaghrib', src.adzMaghrib);
    setVal('adzIsya', src.adzIsya);
    setVal('durAdzanMin', Number((src.durAdzanMs / 60000).toFixed(2)));
    setVal('durTarhimMin', Number((src.durTarhimMs / 60000).toFixed(2)));
    setVal('durSahurMin', Number((src.durSahurMs / 60000).toFixed(2)));
    setVal('tempAlertC', src.tempAlertC);
    setVal('tarhimOffsetSec', src.tarhimOffsetSec);
    setVal('sahurOffsetMin', src.sahurOffsetMin);
    setVal('adzanBeforeMin', Number((src.adzanBeforeSec / 60).toFixed(2)));
    setVal('adzanAfterMin', Number((src.adzanAfterSec / 60).toFixed(2)));
    setVal('tarhimAfterMin', Number((src.tarhimAfterSec / 60).toFixed(2)));
    setVal('fbIntervalSec', Number((src.fbIntervalMs / 1000).toFixed(0)));
    setVal('syncIntervalHrs', Number((src.syncIntervalMs / 3600000).toFixed(2)));
}

database.ref('/config').on('value', (snap) => {
    if (dirty) return; // jangan timpa draft yang sedang diedit
    populate(snap.val());
    setStatus('');
});

function collect() {
    const v = (id) => parseFloat(document.getElementById(id).value);
    const checks = [
        ['adzSubuh', 1, 9999], ['adzDzuhur', 1, 9999], ['adzAshar', 1, 9999],
        ['adzMaghrib', 1, 9999], ['adzIsya', 1, 9999],
        ['durAdzanMin', 1, 15], ['durTarhimMin', 1, 15], ['durSahurMin', 1, 15],
        ['tempAlertC', 10, 60], ['tarhimOffsetSec', 60, 3600], ['sahurOffsetMin', 10, 180],
        ['adzanBeforeMin', 1, 60], ['adzanAfterMin', 0.5, 30], ['tarhimAfterMin', 1, 30],
        ['fbIntervalSec', 5, 300], ['syncIntervalHrs', 1, 48]
    ];
    for (const [id, lo, hi] of checks) {
        const x = v(id);
        if (isNaN(x) || x < lo || x > hi) {
            Swal.fire({ icon: 'error', title: 'Nilai tidak valid', text: `Kolom "${id}" harus antara ${lo} dan ${hi}.` });
            return null;
        }
    }
    return {
        adzSubuh: Math.round(v('adzSubuh')),
        adzDzuhur: Math.round(v('adzDzuhur')),
        adzAshar: Math.round(v('adzAshar')),
        adzMaghrib: Math.round(v('adzMaghrib')),
        adzIsya: Math.round(v('adzIsya')),
        durAdzanMs: Math.round(v('durAdzanMin') * 60000),
        durTarhimMs: Math.round(v('durTarhimMin') * 60000),
        durSahurMs: Math.round(v('durSahurMin') * 60000),
        tempAlertC: v('tempAlertC'),
        tarhimOffsetSec: Math.round(v('tarhimOffsetSec')),
        sahurOffsetMin: Math.round(v('sahurOffsetMin')),
        adzanBeforeSec: Math.round(v('adzanBeforeMin') * 60),
        adzanAfterSec: Math.round(v('adzanAfterMin') * 60),
        tarhimAfterSec: Math.round(v('tarhimAfterMin') * 60),
        fbIntervalMs: Math.round(v('fbIntervalSec') * 1000),
        syncIntervalMs: Math.round(v('syncIntervalHrs') * 3600000)
    };
}

function saveSetup() {
    const upd = collect();
    if (!upd) return;
    upd.ver = bumpConfigVersion();

    const btn = document.getElementById('btn-save');
    if (btn) btn.disabled = true;
    setStatus('Menyimpan...', '#feca57');

    database.ref('/config').update(upd).then(() => {
        dirty = false;
        if (btn) btn.disabled = false;
        setStatus('Tersimpan. Menunggu perangkat menerapkan...', '#06d6a0');
        Swal.fire({
            icon: 'success', title: 'Setelan Terkirim',
            text: 'Perangkat akan menerapkan saat sinkronisasi berikutnya (\u2264 10 detik).',
            timer: 2500, showConfirmButton: false
        });
    }).catch(() => {
        if (btn) btn.disabled = false;
        setStatus('Gagal menyimpan.', '#ff4d6d');
        Swal.fire({ icon: 'error', title: 'Gagal menyimpan' });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#page-setup input').forEach((el) => {
        el.addEventListener('input', () => {
            dirty = true;
            setStatus('Ada perubahan belum disimpan.', '#feca57');
        });
    });
});
