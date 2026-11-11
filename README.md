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
| Frontend | React 18.3.1 (CDN) + Tailwind CSS 3.4.17 (CSS dibuat saat build); JSX diterjemahkan saat build (tanpa Babel di browser) |
| Backend / DB | Supabase (PostgreSQL) |
| Cache Offline | localStorage |
| AI (opsional) | Google Gemini API |

### Build `index.html`

`index.html` adalah **file hasil build** — jangan diedit langsung, perubahan akan tertimpa.

- Kode aplikasi: `src/app.jsx`
- Kerangka HTML (head, library CDN, layar loading): `src/index.template.html`

Setelah mengubah salah satu file di atas, rakit ulang:

```bash
npm install --no-save @babel/core@8 @babel/preset-react@8 tailwindcss@3.4.17 terser@5.31.6   # sekali saja
node scripts/build.cjs
```

Commit `src/` **dan** `index.html` hasil build bersama-sama.

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

### 4. Fungsi untuk Link Share (agar cepat dibuka di HP)

Link share (tracking customer, invoice, slip gaji, link driver, laporan marketing/investor/promosi) memakai fungsi kecil
ini supaya hanya mengunduh data yang diperlukan, bukan seluruh daftar. Jalankan **sekali** di Supabase → **SQL Editor** →
tempel semua teks di bawah → **Run**. Aman dijalankan ulang. Sebelum fungsi ini dipasang, link share tetap berjalan
dengan cara lama (lebih lambat).

```sql
-- Isi daftar <koleksi> yang kolom <kolom> = <nilai>
create or replace function public.share_cocok(koleksi text, kolom text, nilai text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(e), '[]'::jsonb)
  from app_data a
  cross join lateral jsonb_array_elements(case when jsonb_typeof(a.data) = 'array' then a.data else '[]'::jsonb end) e
  where a.id = koleksi and e ->> kolom = nilai;
$$;

-- Isi daftar <koleksi> dengan id tertentu
create or replace function public.share_ids(koleksi text, ids text[])
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(e), '[]'::jsonb)
  from app_data a
  cross join lateral jsonb_array_elements(case when jsonb_typeof(a.data) = 'array' then a.data else '[]'::jsonb end) e
  where a.id = koleksi and e ->> 'id' = any(ids);
$$;

-- Order satu instansi (nama sudah huruf kecil & spasi dirapikan)
create or replace function public.share_order_instansi(nama text[])
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(e), '[]'::jsonb)
  from app_data a
  cross join lateral jsonb_array_elements(case when jsonb_typeof(a.data) = 'array' then a.data else '[]'::jsonb end) e
  where a.id = 'orders'
    and btrim(regexp_replace(lower(coalesce(e ->> 'client', '')), '\s+', ' ', 'g')) = any(nama);
$$;

-- Invoice milik seorang marketing (id karyawan atau nama)
create or replace function public.share_invoice_marketing(emp_id text, nama text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(e), '[]'::jsonb)
  from app_data a
  cross join lateral jsonb_array_elements(case when jsonb_typeof(a.data) = 'array' then a.data else '[]'::jsonb end) e
  where a.id = 'invoices'
    and (e ->> 'marketingEmpId' = emp_id
         or lower(regexp_replace(coalesce(e ->> 'marketing', ''), '^\s+|\s+$', '', 'g')) = nama);
$$;

grant execute on function public.share_cocok(text, text, text) to anon, authenticated;
grant execute on function public.share_ids(text, text[]) to anon, authenticated;
grant execute on function public.share_order_instansi(text[]) to anon, authenticated;
grant execute on function public.share_invoice_marketing(text, text) to anon, authenticated;
```

Hasil fungsi tetap disaring ulang oleh aplikasi dengan aturan yang sama seperti sebelumnya, jadi isi halaman share tidak berubah.

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

## Akun Login

Aplikasi **tidak lagi punya akun bawaan** (admin/123 dll. sudah dihapus). Login hanya memakai akun yang tersimpan di Supabase (`app_data`, id `accounts`). Jika data akun belum termuat (koneksi bermasalah), login ditolak dengan pesan untuk memuat ulang.

Untuk instalasi baru (database kosong), buat baris akun pertama secara manual di Supabase:

```sql
insert into app_data (id, data) values ('accounts', '[{"id": 1, "username": "admin", "password": "GANTI-PASSWORD-KUAT", "role": "Admin", "name": "Super Admin"}]');
```

Password disimpan **teracak** (SHA-256 + salt, kolom `passwordHash`/`passwordSalt`), bukan teks asli. Akun lama yang masih teks asli otomatis diacak saat ada pengguna login. Instalasi baru di atas tetap boleh memakai `password` teks asli — akan diacak otomatis setelah login pertama.

Kelola akun lain di: **Master Akun**. Admin juga bisa mengunduh **Backup Data** (seluruh tabel `app_data`) dari menu tersebut.

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

- **Sync**: Perubahan dari perangkat lain diterima lewat Supabase Realtime (catatan `_timestamps`). Kabar pertama diproses
  ±1 detik; kabar beruntun sesudahnya digabung menjadi satu unduhan (±5 detik); tab yang tersembunyi/diminimalkan tidak
  mengunduh dan langsung memperbarui datanya saat dibuka lagi. Simpan order / nota pembelian langsung dikirim (tanpa jeda).
- **Cetak data terbaru**: sebelum mencetak SPK/Lembar Kerja, Surat Pesanan Bahan, dan Checklist Belanja, aplikasi mengecek
  `_timestamps`; bila ada data lebih baru dari perangkat lain, data dimuat dulu baru dicetak.
- **Daftar Belanja**: isian (vendor, jumlah dibeli, catatan, tanda dicetak) disimpan per bahan per order sebagai baris kecil
  `belanja:<isian>:<order>:<kunci>`. Semua tampilan memakai satu sinkronisasi bersama: unduhan penuh paling sering 6 jam
  sekali, di antaranya hanya isian yang berubah. Tanda `belanja:p:` (dicetak) dipakai untuk 🆕 BARU / 🖨 Dicetak / ⚠ Berubah
  dan mencegah dobel pesan saat mencetak.
- **Status bahan order** ("Pembelian Bahan" / "Bahan Sudah Dibeli") hanya tampilan, dihitung dari Daftar Belanja selama
  produksi belum mulai; status di data order tidak diubah. Link customer membaca isian Daftar Belanja order instansi itu saja.
- **Samakan nama bahan**: aturan nama baku (Admin, di Database Bahan) disimpan di `masterBahan` sebagai catatan
  `jenis: 'aliasNama'` (dan `aliasAbaikan` untuk "bukan bahan sama"). Data order, nota & stok asli tidak diubah; aturan
  dipakai saat menghitung stok, rekomendasi bahan, dan Daftar Belanja, dan bisa dibatalkan.
- **Simpan order hemat kuota**: bila versi order di cloud sama dengan yang dipegang perangkat, order langsung disimpan
  tanpa diunduh dulu; beberapa detik kemudian dicek bahwa perubahan benar-benar ada di cloud (bila tidak, digabung ulang).
- **Arsip order lama**: order Riwayat yang tidak berubah lebih dari 3 bulan (bisa diubah di Pengaturan) dipindah otomatis
  oleh perangkat Admin ke baris `ordersArsip:<tahun>`, dicatat di `ordersArsipIndex`, dengan cadangan terakhir di
  `ordersCadangan`. Semua menu tetap menampilkan order arsip. **Jangan menghapus baris-baris ini di Supabase.**
- **Link slip gaji (karyawan & driver)**: tampilan kartu berwarna dengan urutan sama seperti nota, status bayar
  (Belum dibayar / Dibayar sebagian / Lunas) dan satu tombol **Simpan PDF**. PDF berisi nota struk yang sama dengan cetakan
  admin (fungsi `htmlSlipGajiKaryawan` / `htmlStrukRekapGaji`), dibuat di HP dengan jsPDF + html2canvas yang baru diunduh
  saat tombol ditekan. Skrip kecil di `<head>` (src/index.template.html) mulai mengambil data rekap & pengaturan sejak
  halaman dibuka; alamat & kunci publik Supabase diisi otomatis saat build. Salinan kecil link terakhir (maks. 6, 30 hari)
  disimpan di HP agar dibuka ulang langsung tampil, lalu diperbarui dari server.
  Alur PDF: Simpan PDF → Menyiapkan PDF… → ✓ PDF siap: **💾 Simpan ke HP** / **📤 Bagikan** (menu bagikan HP; di iPhone/iPad
  "Simpan ke HP" membuka menu Apple berisi "Simpan ke File"). Bila lebih dari 25 detik, tombol kembali "Coba lagi".
- **Ikon aplikasi**: `favicon.ico`, `favicon-32.png` dan `apple-touch-icon.png` (logo kotak Simpati) ada di samping `index.html`
  dan **wajib ikut di-upload saat deploy** — dipakai tab browser (termasuk Safari/Chrome iPhone & iPad) dan ikon layar utama HP.
- **Offline**: Aplikasi tetap bisa digunakan saat offline; data tersimpan di perangkat (IndexedDB) dan sync saat kembali online
- **Print**: Fitur cetak menggunakan `window.open()` — pastikan browser mengizinkan pop-up dari domain Netlify Anda
- **Browser**: Chrome/Edge 90+, Firefox 88+, Safari 14+. Tidak mendukung Internet Explorer

---

## Server Absensi Finger (PC konveksi)

File `server-absensi/backend_terpadu_absensi_konveksi.js` adalah program server yang berjalan di PC konveksi
(folder `C:\AbsensiServer`). Mesin AT-620 mengirim scan ke server ini, lalu server mengirimnya ke Supabase
(`app_data` id `absensiRawLogs`) dan memperbarui `_timestamps.absensiRawLogs` (paling sering 1x per 5 menit)
agar aplikasi di semua perangkat tahu ada scan baru.

Cara memperbarui di PC: tutup server dengan Ctrl+C (scan yang belum terkirim dikirim dulu), cadangkan file lama,
salin file baru dengan nama yang sama ke `C:\AbsensiServer`, lalu jalankan `start_absensi_server.bat`.
Jangan mengganti/menghapus `absensi_logs.json`.

Program berjalan di Express 4 maupun 5 (isi kiriman dibaca sendiri, tanpa body-parser). `package.json` mencatat
versi yang dipakai; untuk pemasangan di PC baru jalankan `npm install` di folder tersebut (Node.js 18 ke atas).

Pengaturan jaringan mesin (menu Ethernet): IP mesin harus berbeda dari IP modem (mis. 192.168.1.201),
Gateway & DNS = IP modem. Menu Cloud Server Setting: Server Address = IP PC server, port 8081.

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
