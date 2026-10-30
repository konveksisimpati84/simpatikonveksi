/**
 * SERVER TERPADU — ABSENSI FINGER (AT-620 ADMS) + SIMPATI KONVEKSI
 *
 * Cara menjalankan (di folder ini):
 *   npm install          (sekali saja / setelah package.json berubah)
 *   node backend_terpadu_absensi_konveksi.js
 *
 * Konfigurasi mesin AT-620:
 *   - Server Address : IP PC ini (contoh: 192.168.1.10)
 *   - Server Port    : 8081
 *   - Protocol       : HTTP
 *
 * Data log disimpan ke file "absensi_logs.json" di folder yang sama.
 *
 * Revisi 2026-10:
 *   - Kirim ke cloud satu per satu (antre), agar daftar lama tidak menimpa daftar yang lebih baru.
 *   - Setelah data scan terkirim, catatan "_timestamps" (absensiRawLogs) di cloud ikut diperbarui
 *     (paling sering 1x per 5 menit), supaya aplikasi di semua HP/PC tahu ada scan baru.
 *
 * Revisi 2026-10-30:
 *   - Isi kiriman dibaca sendiri (tanpa body-parser): jalan di Express 4 maupun 5, tanpa batas 100 KB.
 *   - Permintaan data ke mesin tiap 5 menit dengan batas tanggal (7 hari saat server baru menyala,
 *     selanjutnya kemarin & hari ini). Bila mesin menolak, otomatis memakai permintaan lama tiap 30 menit.
 *   - Kiriman ke cloud dikumpulkan (15 detik setelah scan terakhir, paling lama 1 menit), diulang
 *     otomatis bila gagal, dan dikirim dulu sebelum server ditutup (Ctrl+C).
 *   - Cek scan dobel memakai indeks (tetap cepat walau data sudah puluhan ribu).
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = 8081;
const LOG_FILE = path.join(__dirname, 'absensi_logs.json');

// ── Sinkronisasi ke Supabase (agar data terlihat dari device manapun) ───────

const SUPABASE_URL      = 'https://rnmbsjntfdamuhkejpxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubWJzam50ZmRhbXVoa2VqcHh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMzM0NjIsImV4cCI6MjA5NTYwOTQ2Mn0.v_NjP9ukuufVk9XkOfPkJ1BWmd5lItHo8K0c6ckGYQ4';

const SUPABASE_HEADERS = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
};

// Beri tahu aplikasi bahwa data scan berubah: perbarui _timestamps.absensiRawLogs di cloud.
// Aplikasi memakai catatan ini untuk memutuskan perlu mengunduh data scan terbaru atau tidak.
const TIMESTAMP_MIN_INTERVAL_MS = 5 * 60 * 1000; // paling sering 1x per 5 menit (hemat kuota HP)
let lastTimestampAt = 0;
let timestampTimer  = null;

const bumpRemoteTimestamp = async () => {
    const tryOnce = async () => {
        const getResp = await fetch(`${SUPABASE_URL}/rest/v1/app_data?id=eq._timestamps&select=data`, { headers: SUPABASE_HEADERS });
        if (!getResp.ok) throw new Error(`baca _timestamps ${getResp.status}`);
        const rows = await getResp.json();
        const existing = (rows && rows[0] && rows[0].data && typeof rows[0].data === 'object') ? rows[0].data : {};
        existing.absensiRawLogs = new Date().toISOString();
        const putResp = await fetch(`${SUPABASE_URL}/rest/v1/app_data`, {
            method: 'POST',
            headers: { ...SUPABASE_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ id: '_timestamps', data: existing })
        });
        if (!putResp.ok) throw new Error(`simpan _timestamps ${putResp.status}: ${await putResp.text()}`);
    };
    try {
        await tryOnce();
        console.log('[Supabase] Penanda data scan terbaru diperbarui');
    } catch (e) {
        try {
            await new Promise(r => setTimeout(r, 3000));
            await tryOnce();
            console.log('[Supabase] Penanda data scan terbaru diperbarui');
        } catch (e2) {
            console.error('[Supabase] Gagal memperbarui penanda data scan:', e2.message);
        }
    }
};

const scheduleTimestampBump = () => {
    if (timestampTimer) return; // sudah dijadwalkan
    const wait = Math.max(0, lastTimestampAt + TIMESTAMP_MIN_INTERVAL_MS - Date.now());
    timestampTimer = setTimeout(async () => {
        timestampTimer = null;
        lastTimestampAt = Date.now();
        await bumpRemoteTimestamp();
    }, wait);
};

// Kirim daftar log ke cloud. Dijalankan satu per satu (antre) supaya kiriman lama
// tidak sampai belakangan dan menimpa daftar yang lebih baru.
let syncRunning = false;
let syncAgain   = false;
let syncRetryTimer = null;
const SYNC_RETRY_MS = 60 * 1000; // gagal kirim (mis. internet putus) → coba lagi 1 menit kemudian

const syncLogsToSupabase = async () => {
    if (syncRunning) { syncAgain = true; return; }
    syncRunning = true;
    if (syncRetryTimer) { clearTimeout(syncRetryTimer); syncRetryTimer = null; }
    let gagal = false;
    try {
        do {
            syncAgain = false;
            gagal = false;
            try {
                const resp = await fetch(`${SUPABASE_URL}/rest/v1/app_data`, {
                    method: 'POST',
                    headers: { ...SUPABASE_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                    body: JSON.stringify({ id: 'absensiRawLogs', data: attendanceLogs })
                });
                if (!resp.ok) {
                    gagal = true;
                    console.error('[Supabase] Gagal sync log absensi:', resp.status, await resp.text());
                } else {
                    console.log(`[Supabase] Sinkron ${attendanceLogs.length} log absensi ke cloud`);
                    scheduleTimestampBump();
                }
            } catch (e) {
                gagal = true;
                console.error('[Supabase] Error sync ke cloud:', e.message);
            }
        } while (syncAgain);
    } finally {
        syncRunning = false;
    }
    if (gagal && !syncRetryTimer) {
        console.log('[Supabase] Akan dicoba kirim ulang 1 menit lagi');
        syncRetryTimer = setTimeout(() => { syncRetryTimer = null; syncLogsToSupabase(); }, SYNC_RETRY_MS);
    }
};

// Scan datang beruntun (pagi hari puluhan orang dalam beberapa menit): kiriman ke cloud dikumpulkan,
// dikirim 15 detik setelah scan terakhir, paling lama 1 menit sejak scan pertama yang belum terkirim.
const SYNC_TUNDA_MS      = 15 * 1000;
const SYNC_TUNDA_MAKS_MS = 60 * 1000;
let syncTimer = null;
let syncDimintaSejak = 0;

const jadwalkanSync = () => {
    const now = Date.now();
    if (!syncDimintaSejak) syncDimintaSejak = now;
    if (syncTimer) clearTimeout(syncTimer);
    const tunggu = Math.max(0, Math.min(SYNC_TUNDA_MS, syncDimintaSejak + SYNC_TUNDA_MAKS_MS - now));
    syncTimer = setTimeout(() => {
        syncTimer = null;
        syncDimintaSejak = 0;
        syncLogsToSupabase();
    }, tunggu);
};

// Kirim sekarang juga bila masih ada yang menunggu (dipakai saat server ditutup)
const kirimSisaSync = async () => {
    if (!syncTimer && !syncRetryTimer && !syncRunning) return;
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; syncDimintaSejak = 0; }
    await syncLogsToSupabase();
    while (syncRunning) await new Promise(r => setTimeout(r, 200));
};

// ── Persistensi ────────────────────────────────────────────────────────────

const loadLogs = () => {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const raw = fs.readFileSync(LOG_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        }
    } catch (e) {
        console.error('[Storage] Gagal baca file log:', e.message);
    }
    return [];
};

const saveLogs = (data) => {
    try {
        fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[Storage] Gagal simpan file log:', e.message);
    }
};

// Indeks scan (PIN + tanggal + jam) untuk cek dobel dengan cepat
const kunciLog = (l) => `${l.pin}|${l.tanggal}|${l.jam}`;
let indeksLog = new Set();
const bangunIndeksLog = () => {
    indeksLog = new Set(attendanceLogs.filter(l => !l.isDeleted).map(kunciLog));
};

// Simpan ke file lokal sekarang, kirim ke cloud dikumpulkan (lihat jadwalkanSync)
const persistLogs = (data) => {
    saveLogs(data);
    bangunIndeksLog();
    jadwalkanSync();
};

let attendanceLogs = loadLogs();
bangunIndeksLog();
console.log(`[Storage] ${attendanceLogs.length} log dimuat dari file.`);
syncLogsToSupabase();

// ── Middleware ──────────────────────────────────────────────────────────────

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

// Isi kiriman dibaca sendiri, tanpa express.text/json/urlencoded: body-parser di Express 4 menolak
// stream yang sudah dibaca ("stream is not readable") dan membatasi kiriman 100 KB.
const MAX_BODY_BYTES = 20 * 1024 * 1024;

const parseBody = (req) => {
    const raw  = req.rawBody;
    const type = String(req.headers['content-type'] || '').toLowerCase();
    if (!raw) return {};
    if (type.includes('application/json')) {
        try { return JSON.parse(raw); } catch (e) { return {}; }
    }
    if (type.includes('application/x-www-form-urlencoded')) {
        return Object.fromEntries(new URLSearchParams(raw));
    }
    return raw;
};

app.use((req, res, next) => {
    const chunks = [];
    let size = 0;
    let selesai = false;
    req.on('data', chunk => {
        if (selesai) return;
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            selesai = true;
            console.error(`[ERROR] Kiriman terlalu besar (${size} byte) ke ${req.url.split('?')[0]}`);
            res.status(413).type('text').send('Data terlalu besar');
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });
    req.on('end', () => {
        if (selesai) return;
        selesai = true;
        req.rawBody = Buffer.concat(chunks).toString('utf8');
        req.body    = parseBody(req);
        req._body   = true; // tandai sudah dibaca (bila kelak ada body-parser, tidak dibaca ulang)
        if (req.method === 'POST' && req.rawBody.length > 0) {
            console.log(`[RAW POST] ${req.url.split('?')[0]} | Content-Type: ${req.headers['content-type']} | Length: ${req.rawBody.length}`);
            console.log(`[RAW DATA] ${req.rawBody.substring(0, 300)}`);
        }
        next();
    });
    req.on('error', (e) => {
        if (selesai) return;
        selesai = true;
        console.error('[ERROR] Gagal membaca kiriman:', e.message);
        if (!res.headersSent) res.status(400).type('text').send('Kiriman rusak');
    });
});

// Log semua request masuk untuk diagnosa
app.use((req, res, next) => {
    res.on('finish', () => {
        const body = req.body ? (typeof req.body === 'string' ? req.body.substring(0, 100) : JSON.stringify(req.body).substring(0, 100)) : '';
        console.log(`[REQ] ${req.method} ${req.url} | body: ${body}`);
    });
    next();
});

// ── Helper ──────────────────────────────────────────────────────────────────

const genId = (prefix, pin) =>
    `${prefix}-${pin}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const toDateStr = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const toTimeStr = (dateObj) => {
    const h = String(dateObj.getHours()).padStart(2, '0');
    const m = String(dateObj.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
};

// ── [MODUL 1] ADMS AT-620 ──────────────────────────────────────────────────

// Handshake mesin
app.get('/iclock/cdata', (req, res) => {
    const sn = req.query.SN || 'Unknown';
    console.log(`[ADMS] Handshake dari mesin (SN: ${sn})`);
    const response = [
        `GET OPTION FROM:${sn}`,
        `ATTLOGStamp=None`,
        `OPERLOGStamp=None`,
        `ATTPHOTOStamp=None`,
        `ErrorDelay=30`,
        `Delay=10`,
        `TransTimes=00:00;23:59`,
        `TransInterval=1`,
        `TransFlag=TransData AttLog OpLog AttPhoto EnrollUser ChgUser EnrollFP ChgFP UserPic`,
        `TimeZone=7`,
        `Realtime=1`,
        `Encrypt=None`
    ].join('\n');
    res.type('text').send(response);
});

// Mesin polling perintah dari server.
// Scan baru sudah dikirim langsung oleh mesin (Realtime=1); permintaan ini hanya jaga-jaga bila ada
// kiriman yang terlewat. Dibatasi tanggal supaya mesin tidak mengirim seluruh riwayat setiap kali.
const QUERY_INTERVAL_MS              = 5 * 60 * 1000;  // tiap 5 menit
const QUERY_HARI_AWAL                = 7;              // saat server baru menyala: 7 hari terakhir (PC mungkin sempat mati)
const QUERY_HARI                     = 2;              // selanjutnya: kemarin & hari ini
const QUERY_TANPA_FILTER_INTERVAL_MS = 30 * 60 * 1000; // bila mesin menolak batas tanggal: permintaan lama tiap 30 menit

let cmdCounter = 1;
let lastQueryTime = 0;
let queryAwalTerkirim = false;
let queryTanpaFilter = false;
const cmdBatasTanggal = new Set(); // ID perintah yang memakai batas tanggal (untuk membaca jawaban mesin)

const fmtWaktuMesin = (d) => `${toDateStr(d)} ${toTimeStr(d)}:${String(d.getSeconds()).padStart(2, '0')}`;

app.get('/iclock/getrequest', (req, res) => {
    const now = Date.now();
    const jeda = queryTanpaFilter ? QUERY_TANPA_FILTER_INTERVAL_MS : QUERY_INTERVAL_MS;
    if (now - lastQueryTime < jeda) return res.type('text').send('OK');
    lastQueryTime = now;

    const id = cmdCounter++;
    let cmd;
    if (queryTanpaFilter) {
        cmd = `C:${id}:DATA QUERY attlog`;
    } else {
        const hari = queryAwalTerkirim ? QUERY_HARI : QUERY_HARI_AWAL;
        queryAwalTerkirim = true;
        const dari = new Date(); dari.setHours(0, 0, 0, 0); dari.setDate(dari.getDate() - (hari - 1));
        const sampai = new Date(); sampai.setHours(23, 59, 59, 0);
        cmd = `C:${id}:DATA QUERY ATTLOG StartTime=${fmtWaktuMesin(dari)}\tEndTime=${fmtWaktuMesin(sampai)}`;
        if (cmdBatasTanggal.size > 100) cmdBatasTanggal.clear();
        cmdBatasTanggal.add(String(id));
    }
    console.log(`[CMD] Minta data scan: ${cmd.replace('\t', ' ')}`);
    res.type('text').send(cmd);
});

// Mesin kirim hasil eksekusi perintah, mis. "ID=3&Return=0&CMD=DATA" (Return < 0 = gagal)
app.post('/iclock/devicecmd', (req, res) => {
    String(req.rawBody || '').split(/\r?\n/).forEach(baris => {
        if (!baris.trim()) return;
        const p   = new URLSearchParams(baris.trim());
        const id  = p.get('ID');
        const ret = Number(p.get('Return'));
        if (!id || !cmdBatasTanggal.has(id)) return;
        cmdBatasTanggal.delete(id);
        if (Number.isFinite(ret) && ret < 0 && !queryTanpaFilter) {
            queryTanpaFilter = true;
            console.log(`[CMD] Mesin menolak permintaan dengan batas tanggal (kode ${ret}). Selanjutnya memakai permintaan biasa tiap 30 menit.`);
        }
    });
    res.type('text').send('OK');
});

// Terima push data absensi dari mesin
app.post('/iclock/cdata', (req, res) => {
    const table   = req.query.table;
    let rawData   = req.rawBody || req.body;
    if (typeof rawData !== 'string') rawData = '';

    console.log(`[${table || 'UNKNOWN'}] panjang data: ${rawData.length} karakter`);
    if (rawData.length > 0) console.log(`[DATA] isi: ${rawData.substring(0, 500)}`);

    if (table === 'ATTLOG' && rawData.trim().length > 0) {
        const lines   = rawData.split('\n');
        let newCount  = 0;

        lines.forEach(line => {
            if (!line.trim()) return;
            const parts = line.split('\t');
            if (parts.length < 2) return;

            const pin     = parts[0].trim();
            const dateObj = new Date(parts[1].trim());
            if (isNaN(dateObj.getTime())) return;

            const tanggal = toDateStr(dateObj);
            const jam     = toTimeStr(dateObj);

            // Cegah duplikat (PIN + jam sama di hari yang sama)
            const kunci = kunciLog({ pin, tanggal, jam });
            if (indeksLog.has(kunci)) return;
            indeksLog.add(kunci);

            const log = {
                id        : genId('adms', pin),
                pin       : pin,
                tanggal   : tanggal,
                jam       : jam,
                waktu_iso : dateObj.toISOString(),
                source    : 'mesin',
                isDeleted : false
            };

            attendanceLogs.unshift(log);
            newCount++;
            console.log(`✅ Absen: PIN ${pin} · ${tanggal} ${jam}`);
        });

        if (newCount > 0) persistLogs(attendanceLogs);
        res.type('text').send(`OK: ${newCount}`);
    } else {
        res.type('text').send('OK: 0');
    }
});

// ── [MODUL 2] API ABSENSI ──────────────────────────────────────────────────

// GET /api/logs?date=YYYY-MM-DD
// Kembalikan semua log (opsional filter tanggal)
app.get('/api/logs', (req, res) => {
    const { date } = req.query;
    let data = attendanceLogs.filter(l => !l.isDeleted);
    if (date) data = data.filter(l => l.tanggal === date);
    res.json({ success: true, total: data.length, data });
});

// POST /api/logs/add — tambah log manual
app.post('/api/logs/add', (req, res) => {
    const { pin, tanggal, jam, note } = req.body;
    if (!pin || !tanggal || !jam) {
        return res.status(400).json({ success: false, error: 'pin, tanggal, jam wajib diisi' });
    }

    const log = {
        id        : genId('manual', pin),
        pin       : String(pin),
        tanggal   : tanggal,
        jam       : jam,
        waktu_iso : new Date(`${tanggal}T${jam}:00`).toISOString(),
        source    : 'manual',
        note      : note || '',
        isDeleted : false
    };

    attendanceLogs.unshift(log);
    persistLogs(attendanceLogs);
    console.log(`[Manual] Log ditambah: PIN ${pin} · ${tanggal} ${jam}`);
    res.json({ success: true, data: log });
});

// PUT /api/logs/:id — edit log (jam, note)
app.put('/api/logs/:id', (req, res) => {
    const { id }  = req.params;
    const idx     = attendanceLogs.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Log tidak ditemukan' });

    const allowed = ['jam', 'tanggal', 'note'];
    allowed.forEach(k => {
        if (req.body[k] !== undefined) attendanceLogs[idx][k] = req.body[k];
    });
    attendanceLogs[idx].editedAt = new Date().toISOString();
    attendanceLogs[idx].source   = attendanceLogs[idx].source === 'mesin' ? 'mesin-edit' : attendanceLogs[idx].source;

    persistLogs(attendanceLogs);
    res.json({ success: true, data: attendanceLogs[idx] });
});

// DELETE /api/logs/:id — soft delete
app.delete('/api/logs/:id', (req, res) => {
    const { id } = req.params;
    const idx    = attendanceLogs.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Log tidak ditemukan' });

    attendanceLogs[idx].isDeleted  = true;
    attendanceLogs[idx].deletedAt  = new Date().toISOString();
    persistLogs(attendanceLogs);
    res.json({ success: true });
});

// GET /api/status — cek koneksi dari aplikasi
app.get('/api/status', (req, res) => {
    res.json({
        success     : true,
        status      : 'Server Absensi Aktif',
        totalLogs   : attendanceLogs.filter(l => !l.isDeleted).length,
        serverTime  : new Date().toISOString()
    });
});

// ── [MODUL 3] PLACEHOLDER KONVEKSI ────────────────────────────────────────

app.get('/api/konveksi/status', (req, res) => {
    res.json({ status: 'Sistem Konveksi Siap' });
});

// ── Start ───────────────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
    console.error('[ERROR] Uncaught Exception:', err.message);
    console.error(err.stack);
});

process.on('exit', (code) => {
    console.log(`[INFO] Server berhenti dengan kode: ${code}`);
});

// Saat ditutup (Ctrl+C / jendela ditutup): kirim dulu scan yang belum terkirim ke cloud (maks. 10 detik).
// Bila tetap gagal, data aman di absensi_logs.json dan dikirim saat server dinyalakan lagi.
let sedangBerhenti = false;
const berhenti = async (sinyal) => {
    if (sedangBerhenti) return;
    sedangBerhenti = true;
    console.log(`[INFO] ${sinyal}: mengirim sisa data ke cloud sebelum berhenti...`);
    await Promise.race([kirimSisaSync(), new Promise(r => setTimeout(r, 10000))]);
    process.exit(0);
};
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(s => process.on(s, () => berhenti(s)));

const server = app.listen(PORT, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    const ips  = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
        }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('  🚀  SERVER TERPADU ABSENSI + KONVEKSI AKTIF  🚀  ');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Port        : ${PORT}`);
    ips.forEach(ip => {
    console.log(`  URL Lokal   : http://${ip}:${PORT}`);
    });
    console.log(`  File Log    : ${LOG_FILE}`);
    console.log('');
    console.log('  Pengaturan Mesin AT-620:');
    ips.forEach(ip => {
    console.log(`    Server IP   : ${ip}`);
    });
    console.log(`    Server Port : ${PORT}`);
    console.log('═══════════════════════════════════════════════════');
    console.log('');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[ERROR] Port ${PORT} sudah dipakai proses lain. Jalankan: taskkill /F /IM node.exe`);
    } else {
        console.error('[ERROR] Server error:', err.message);
    }
    process.exit(1);
});
