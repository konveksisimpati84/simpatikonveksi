/**
 * SERVER TERPADU — ABSENSI FINGER (AT-620 ADMS) + SIMPATI KONVEKSI
 *
 * Cara menjalankan:
 *   node backend_terpadu_absensi_konveksi.js
 *
 * Konfigurasi mesin AT-620:
 *   - Server Address : IP PC ini (contoh: 192.168.1.10)
 *   - Server Port    : 8081
 *   - Protocol       : HTTP
 *
 * Data log disimpan ke file "absensi_logs.json" di folder yang sama.
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = 8081;
const LOG_FILE = path.join(__dirname, 'absensi_logs.json');

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

let attendanceLogs = loadLogs();
console.log(`[Storage] ${attendanceLogs.length} log dimuat dari file.`);

// ── Middleware ──────────────────────────────────────────────────────────────

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.text({ type: '*/*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Mesin polling perintah dari server
let cmdCounter = 1;
let lastQueryTime = 0;

app.get('/iclock/getrequest', (req, res) => {
    const now = Date.now();
    // Setiap 30 detik kirim perintah upload data ke mesin
    if (now - lastQueryTime > 30000) {
        lastQueryTime = now;
        const today = new Date();
        const start = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')} 00:00:00`;
        const cmd = `C:${cmdCounter++}:DATA QUERY attlog StartTime=${start}`;
        console.log(`[CMD] Minta upload data: ${cmd}`);
        res.type('text').send(cmd);
    } else {
        res.type('text').send('OK');
    }
});

// Mesin kirim hasil eksekusi perintah
app.post('/iclock/devicecmd', (req, res) => {
    res.type('text').send('OK');
});

// Terima push data absensi dari mesin
app.post('/iclock/cdata', (req, res) => {
    const table   = req.query.table;
    let rawData   = req.body;
    if (typeof rawData !== 'string') rawData = '';

    console.log(`[ATTLOG] table=${table} | panjang data: ${rawData.length} karakter`);
    if (rawData.length > 0) console.log(`[ATTLOG] isi: ${rawData.substring(0, 200)}`);

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
            const isDuplicate = attendanceLogs.some(
                l => l.pin === pin && l.tanggal === tanggal && l.jam === jam && !l.isDeleted
            );
            if (isDuplicate) return;

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

        if (newCount > 0) saveLogs(attendanceLogs);
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
    saveLogs(attendanceLogs);
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

    saveLogs(attendanceLogs);
    res.json({ success: true, data: attendanceLogs[idx] });
});

// DELETE /api/logs/:id — soft delete
app.delete('/api/logs/:id', (req, res) => {
    const { id } = req.params;
    const idx    = attendanceLogs.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Log tidak ditemukan' });

    attendanceLogs[idx].isDeleted  = true;
    attendanceLogs[idx].deletedAt  = new Date().toISOString();
    saveLogs(attendanceLogs);
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
