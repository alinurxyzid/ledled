// ===================== LOG.JS =====================
// Halaman riwayat akses. Mengambil data dari Google Spreadsheet (gviz).
// Bagian bersama di shared.js.

const SHEET_ID = '1sY__Jbcj_fwcG3enQwQ9KNNvRpjzBLXE475j2MM6BMg';
const SHEET_GID = '0';
const QUERY_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;

function loadNativeTable() {
    const btn = document.getElementById('btn-load');
    const loadMsg = document.getElementById('loading-msg');
    const tableArea = document.querySelector('.table-scroll-area');
    const cover = document.getElementById('sheet-cover');

    if (btn) btn.style.display = 'none';
    if (loadMsg) loadMsg.style.display = 'block';

    if (cover) {
        cover.style.display = 'flex';
        cover.style.opacity = '1';
    }

    fetch(QUERY_URL)
    .then(response => response.text())
    .then(text => {
        const jsonText = text.substr(47).slice(0, -2);
        const json = JSON.parse(jsonText);

        const cols = json.table.cols;
        const rows = json.table.rows;

        let headerHtml = '';
        cols.forEach(col => {
            headerHtml += `<th>${col ? col.label : ''}</th>`;
        });
        document.getElementById('table-head').innerHTML = headerHtml;

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
                                if (thn === 1899 && nums.length >= 6) {
                                    displayValue = `${nums[3].padStart(2,'0')}:${nums[4].padStart(2,'0')}:${nums[5].padStart(2,'0')}`;
                                } else if (thn > 1900 && nums.length >= 3) {
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

        setTimeout(() => {
            if (tableArea) {
                tableArea.scrollTo({ top: tableArea.scrollHeight, behavior: 'smooth' });
            }
        }, 300);

        if (loadMsg) loadMsg.style.display = 'none';
        if (cover) {
            cover.style.opacity = '0';
            setTimeout(() => { cover.style.display = 'none'; }, 500);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        if (loadMsg) loadMsg.innerHTML = '<span style="color:red"><i class="fas fa-exclamation-triangle"></i> Gagal memuat data.</span>';
        if (btn) btn.style.display = 'inline-block';
    });
}

// Muat otomatis saat halaman dibuka
document.addEventListener('DOMContentLoaded', () => {
    loadNativeTable();
});
