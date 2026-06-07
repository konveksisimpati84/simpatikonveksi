# Simpati Konveksi — Sistem Manajemen Produksi

Aplikasi web manajemen operasional pabrik konveksi, dibangun sebagai Single-Page Application (SPA) berbasis React 18 + Supabase.

---

## Fitur Utama

| Menu | Deskripsi |
|------|-----------|
| Dashboard | Ringkasan status order, progres produksi, dan AI Insight |
| Input Order | Form order baru: ukuran, desain, alur tahap produksi |
| Monitor Antrean | Antrean produksi terurut deadline, Mode Layar TV |
| Pembelian Bahan | Manajemen bahan baku per order, rekap vendor, pembayaran |
| Proses Produksi | Log kerja per tahap (Cutting, Sablon, Jahit, Kancing, Finishing) |
| Pengiriman | Surat Jalan otomatis, accordion per instansi, riwayat |
| Biaya | Pencatatan biaya operasional |
| Invoice | Invoice multi jenis/size, saldo klien, komisi marketing |
| Klien / Instansi | Database klien, riwayat transaksi, saldo DP |
| Tracking Instansi | Status order per instansi untuk customer |
| Laporan Kinerja | Rekap gaji produksi/harian/lembur/komisi, summary siap rekap |
| Laporan Keuangan | Dashboard keuangan, Laba Rugi, Buku Kas (standar akuntansi) |
| Laporan Per Order | Detail biaya dan keuntungan per order |
| Data Karyawan | Manajemen karyawan, kasbon, gaji harian, filter divisi |
| Pengaturan Cetak | Kop surat, tanda tangan, logo perusahaan |
| Master Akun | Akun pengguna dan hak akses menu per role |

---

## Arsitektur

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 18 (CDN) + Tailwind CSS (CDN) + Babel Standalone |
| Backend / DB | Supabase (PostgreSQL) |
| Cache Offline | localStorage |
| AI (opsional) | Google Gemini API |

---

## Setup Supabase

### 1. Buat Tabel `app_data`

```sql
create table app_data (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);
```

### 2. Konfigurasi RLS

Untuk **single-organisasi** (satu tim internal), opsi paling aman adalah membatasi anon key hanya bisa read/write ke tabel ini dengan restrict pada kolom `id` yang dikenal:

```sql
-- Aktifkan RLS
alter table app_data enable row level security;

-- Izinkan anon key hanya akses row dengan id yang dikenal aplikasi
create policy "allow_anon_access" on app_data
  for all
  using (id in (
    'accounts','employees','orders','rekapKinerja',
    'riwayatPengiriman','expenses','invoices','clients','templates'
  ))
  with check (id in (
    'accounts','employees','orders','rekapKinerja',
    'riwayatPengiriman','expenses','invoices','clients','templates'
  ));
```

> **Catatan:** Jika ingin lebih sederhana (tim kecil terpercaya), bisa nonaktifkan RLS dan batasi akses via Supabase Dashboard → API → Allowed Origins (whitelist domain Netlify Anda).

### 3. Edit Konfigurasi di `index.html`

Cari dan ganti dua baris ini di bagian atas `index.html`:

```js
const SUPABASE_URL = 'https://XXXXX.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
```

---

## Deploy ke Netlify

### Cara Termudah: Netlify Drop

1. Buka **[netlify.com/drop](https://netlify.com/drop)**
2. Seret **folder proyek** (berisi `index.html`, `netlify.toml`, `_redirects`, `README.md`) ke halaman tersebut
3. Selesai — aplikasi langsung online

### Cara 2: GitHub + Netlify (Auto-Deploy)

1. Push repository ini ke GitHub
2. Login ke Netlify → **Add new site** → **Import an existing project**
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

---

## Checklist Sebelum Go-Live

- [ ] Ganti `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `index.html`
- [ ] Buat tabel `app_data` di Supabase
- [ ] Konfigurasi RLS atau Allowed Origins di Supabase
- [ ] Login pertama dan ganti **semua password default** di menu Master Akun
- [ ] Upload logo perusahaan di menu Pengaturan Cetak
- [ ] Isi nama perusahaan, subtitle, dan kontak di Pengaturan Cetak
- [ ] Test buka di 2 perangkat berbeda dan pastikan data sync
- [ ] Test cetak invoice dan surat jalan (pastikan pop-up browser diizinkan)

---

## Akun Default

> **WAJIB DIGANTI segera setelah login pertama!**

| Username | Password | Role |
|----------|----------|------|
| admin    | 123      | Admin |
| mandor   | 123      | Mandor |
| kasir    | 123      | Kasir |

Ganti password di: **Master Akun → pilih akun → Edit**

---

## Hak Akses Per Role

| Menu | Admin | Mandor | Kasir | Karyawan |
|------|:-----:|:------:|:-----:|:--------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Input Order | ✅ | ✅ | ✅ | — |
| Monitor Antrean | ✅ | ✅ | ✅ | ✅ |
| Pembelian Bahan | ✅ | ✅ | ✅ | — |
| Proses Produksi | ✅ | ✅ | — | ✅ |
| Pengiriman | ✅ | ✅ | ✅ | — |
| Biaya | ✅ | — | ✅ | — |
| Invoice | ✅ | — | ✅ | — |
| Klien / Instansi | ✅ | — | ✅ | — |
| Laporan Kinerja | ✅ | ✅ | ✅ | ✅* |
| Laporan Keuangan | ✅ | — | ✅ | — |
| Data Karyawan | ✅ | ✅ | — | — |
| Master Akun | ✅ | — | — | — |

*Karyawan hanya melihat rekap gaji mereka sendiri

---

## Fitur AI (Opsional)

Fitur **AI Insight** di Dashboard menggunakan Google Gemini API:

1. Buka [Google AI Studio](https://aistudio.google.com/) → Get API Key
2. Masukkan API Key saat diminta di halaman Dashboard
3. API Key tersimpan di localStorage (tidak dikirim ke server selain Google)

---

## Catatan Teknis

- **Sync**: Data otomatis tersync setiap 15 detik dan saat tab browser aktif kembali
- **Offline**: Aplikasi tetap bisa digunakan saat offline; data tersimpan di localStorage dan sync saat kembali online
- **Print**: Fitur cetak menggunakan `window.open()` — pastikan browser mengizinkan pop-up dari domain Netlify Anda
- **Browser**: Chrome/Edge 90+, Firefox 88+, Safari 14+. Tidak mendukung Internet Explorer

---

## Changelog Versi Terbaru

- ✅ Fix: Komisi marketing tidak lagi menghitung saldo klien yang di-link ke invoice
- ✅ Fix: ID record menggunakan suffix random untuk mencegah collision multi-user
- ✅ Fix: Guard anti-double-rekap di Laporan Kinerja
- ✅ Tambah: Summary Cards "Gaji Siap Direkap" di tab Input Laporan Kinerja
- ✅ Tambah: Accordion expand/collapse per instansi di menu Pengiriman
- ✅ Tambah: Pagination di Invoice, Pembelian Bahan, Riwayat Produksi, Rekap Kinerja
- ✅ Tambah: Filter Divisi di menu Karyawan
- ✅ Redesign: Tampilan Invoice lebih modern dengan gradient cards dan progress bar
- ✅ Fix: Cetak invoice — catatan & tanda tangan mengikuti panjang tabel
- ✅ Redesign: Laporan Keuangan standar akuntansi (DP = Kewajiban, bukan Pendapatan)
