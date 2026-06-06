# Simpati Konveksi — Sistem Manajemen Produksi

Aplikasi web untuk manajemen operasional pabrik konveksi, dibangun sebagai Single-Page Application (SPA) berbasis React.

## Fitur Utama

| Menu | Deskripsi |
|------|-----------|
| Dashboard | Ringkasan status order, progres produksi, dan AI Insight |
| Input Order | Form input order baru dengan rincian ukuran, desain, dan alur proses |
| Monitor Antrean | Tampilan antrean produksi terurut deadline, support Mode Layar TV (fullscreen) |
| Pembelian Bahan | Manajemen kebutuhan bahan baku per order, rekap vendor, dan pembayaran |
| Proses Produksi | Log kerja per tahap (Cutting, Sablon, Jahit, Kancing, Finishing) |
| Pengiriman | Surat Jalan otomatis, riwayat pengiriman, dan pembatalan |
| Biaya | Pencatatan biaya operasional |
| Invoice | Pembuatan dan pengelolaan invoice klien dengan termin pembayaran |
| Klien / Instansi | Database klien dan riwayat transaksi |
| Tracking Instansi | Status order per instansi untuk customer tracking |
| Laporan Kinerja | Rekap gaji karyawan per produksi, unduh PDF |
| Laporan Keuangan | Ringkasan pemasukan, pengeluaran, dan laba rugi |
| Laporan Per Order | Detail biaya dan keuntungan per order |
| Data Karyawan | Manajemen karyawan, kasbon, dan gaji harian |
| Pengaturan Cetak | Kustomisasi kop surat, tanda tangan, dan logo perusahaan |
| Master Akun | Manajemen akun pengguna dan hak akses menu |

## Arsitektur

- **Frontend**: React 18 (via CDN) + Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL) — sync real-time antar perangkat
- **Storage lokal**: localStorage sebagai cache offline
- **Transpiler**: Babel Standalone (browser-side JSX)
- **AI**: Google Gemini API (opsional, untuk fitur AI Insight)

## Struktur Tabel Supabase

Buat satu tabel dengan nama `app_data`:

```sql
create table app_data (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

-- Nonaktifkan RLS agar aplikasi bisa akses langsung dengan anon key
alter table app_data disable row level security;
```

Data yang disimpan di tabel ini (berdasarkan kolom `id`):
- `accounts` — data akun pengguna
- `employees` — data karyawan
- `orders` — data order produksi
- `rekapKinerja` — rekap kinerja karyawan
- `riwayatPengiriman` — riwayat surat jalan
- `expenses` — biaya operasional
- `invoices` — invoice klien
- `clients` — data klien/instansi
- `templates` — pengaturan cetak & kop surat

## Deploy ke Netlify

### Cara 1: Netlify Drop

1. Buka [netlify.com/drop](https://netlify.com/drop)
2. Seret folder proyek ke halaman tersebut
3. Selesai — aplikasi langsung online

### Cara 2: GitHub + Netlify

1. Push repository ini ke GitHub
2. Login ke Netlify > **Add new site** > **Import an existing project**
3. Pilih repository ini
4. Build settings:
   - **Build command**: *(kosongkan)*
   - **Publish directory**: `.`
5. Klik **Deploy site**

### Cara 3: Netlify CLI

```bash
npm install -g netlify-cli
netlify deploy --prod --dir .
```

## Konfigurasi Supabase

Edit bagian berikut di dalam `index.html`:

```js
const SUPABASE_URL = 'https://XXXXX.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
```

Ganti dengan URL dan anon key dari project Supabase Anda.

## Akun Default (Ganti Setelah Login Pertama!)

| Username | Password | Role |
|----------|----------|------|
| admin    | 123      | Admin |
| mandor   | 123      | Mandor |
| kasir    | 123      | Kasir |

> **PENTING**: Segera ganti password default melalui menu **Master Akun** setelah deploy pertama.

## Fitur AI (Opsional)

Fitur AI Insight di Dashboard menggunakan Google Gemini API. Untuk mengaktifkannya:

1. Buka Google AI Studio dan buat API Key baru
2. Masukkan API Key saat diminta oleh aplikasi (tersimpan di localStorage)

## Keamanan Produksi

- Ganti semua password default segera setelah deploy
- Aktifkan HTTPS (Netlify menyediakan ini secara otomatis)
- Jaga kerahasiaan Supabase Anon Key
- Review hak akses menu per role di Master Akun

## Browser yang Didukung

Chrome / Edge 90+, Firefox 88+, Safari 14+. Tidak mendukung Internet Explorer.
