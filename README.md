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
- **Pasang di HP seperti aplikasi** (Chrome Android: menu ⋮ → *Instal aplikasi* / *Tambahkan ke layar utama*):
  `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`
  ada di samping `index.html` dan **wajib ikut di-upload saat deploy**. Ikon Android dibuat dari `src/logo-kotak-sumber.png`
  dengan `node scripts/buat-ikon-aplikasi.cjs` (tanpa bingkai merah agar rapi saat dipotong bulat). `sw.js` selalu
  mengambil halaman dari server dulu (versi baru langsung terpakai); hanya saat tanpa internet halaman terakhir dipakai.
  Link share (`#rekap-gaji=`, `#invoice-share=`, dll.) tidak ditawari pasang & tidak memasang service worker.
- **SIJEK & Google Maps (opsional)**: Admin menempel kode API Google Maps di SIJEK → tab **🗺️ Google Maps** (disimpan di
  Pengaturan `googleMapsKey`), lalu **Tes kode**. Bila aktif, cari tempat (Places API New) & jarak jalan (Routes API) di
  Driver & Tarif memakai Google; bila kode kosong/ditolak/kuota habis otomatis kembali ke OpenStreetMap (gratis). Di Google
  Cloud aktifkan Maps JavaScript API, Places API (New), Routes API; batasi kode ke `https://konveksisimpati.com/*`.
  Link driver punya tombol **🧭 Rute ke ambil / tujuan** (link Google Maps biasa, tanpa kode & kuota).
- **Pengaman link share**: semua kode link baru dibuat acak & panjang (tidak bisa ditebak). Link Tracking Instansi memakai
  kode `#customer-tracking=TI-…` (disimpan di baris `app_data` **`trackingLinks`**); link lama yang berisi nama sekolah
  tidak berlaku lagi. Tombol **🔄 Ganti link** (Tracking Instansi, invoice, marketing, investor, bagi hasil promosi,
  dana operasional, nota vendor) membuat kode baru — link lama langsung tidak bisa dibuka.
- **Dana Operasional sebagai sumber bayar**: selain Biaya, Pembelian Bahan, Laporan Kinerja & Bagi Hasil Promosi,
  kini **SIJEK Bayar gaji driver**, **SIJEK Kasbon driver** dan **Data Karyawan → Kasbon** bisa dibayar dari dana
  operasional seorang karyawan (`operasionalKaryawanId` pada pembayaran / kasbon, `dari: 'dana'`). Sisa dana karyawan
  berkurang, muncul di *Penggunaan dana* (Gaji Driver / Kasbon Driver / Kasbon Karyawan + **Lihat ›**), dan **tidak**
  dikurangi lagi dari Posisi Uang (uangnya sudah keluar saat transfer dana). Kasbon karyawan tidak bisa diambil dari
  dana miliknya sendiri. Data lama tidak berubah.
- **Link Laporan Marketing** (`#marketing-share=`): tab bawaan **Perlu ditagih** — kotak atas sisa tagihan + Total
  tagihan / Sudah dibayar / Sisa + bilah persen terbayar + pembagian umur (> 60 / 31–60 / ≤ 30 hari). Kartu per customer
  (urut sisa terbesar / paling lama / A–Z): kepala hijau tua (nama, jumlah invoice, umur, sisa), lalu tiap invoice di kartu
  terpisah bernomor 1, 2, … dengan keterangan pesanan (jenis pertama + jenis lain · total pcs) dan hitungan seperti nota:
  total − DP / saldo DP dipakai / bayar ke-n (tanggal, cara) = sisa, lalu ringkasan & tombol kirim di bawah. Tombol **Kirim tagihan ke customer (WA)** + **Salin** (pesan berisi total, sudah dibayar, sisa
  per invoice + link tagihan). Tab **Semua invoice** tetap ada (kotak Termin = sisa).
- **Link tagihan invoice otomatis**: invoice baru langsung punya `invoiceShareToken`; invoice lama yang belum pernah
  dibuatkan link diberi kode sekali di latar belakang saat Admin membuka aplikasi. Kode `null` (link sengaja dicabut)
  tidak dibuatkan lagi; saat diedit kode lama tetap.
- **Komisi invoice tanpa marketing = Rp 0** (`getKomisiInvoiceBerlaku`) di Laporan Marketing ("—"), daftar invoice,
  Laporan Keuangan (laba, komisi belum dibayar di Posisi Uang) dan Untung/Rugi. Rekap komisi marketing tidak berubah.
- **Untung / Rugi di Posisi Uang**: periode bawaan **"Sejak awal pakai aplikasi"** — dari bulan data PERTAMA KALI
  DIINPUT (waktu di kode otomatis tiap catatan: order, invoice, pembelian bahan, biaya, SIJEK, rekap gaji) sampai bulan
  ini; transaksi bertanggal sebelum itu (diinput belakangan) ditampilkan di kotak info + tombol **Sertakan sejak …**.
  Bila tidak ada kode berwaktu (data lama), dipakai bulan transaksi pertama. Rangkaian bulan berdata
  dianggap bersambung bila jedanya ≤ 2 bulan kosong; catatan yang jauh lebih awal (mis. salah ketik tahun) tidak menggeser
  awal periode, tetapi ditampilkan sebagai tanda + tombol **Sertakan sejak …**. Pilihan Tahun / 3–6–12 bulan / satu bulan
  / dari–sampai tetap ada.
- **Tanggal Mulai Pembukuan** (`templates.pembukuan = { mulai: 'YYYY-MM-01', rekening, tunai, dana, oleh, at }`,
  bawaan **1 Mei 2026** lewat `bacaMulaiBuku`; `mulai: ''` = tanpa tanggal mulai, perilaku lama "Sejak awal pakai
  aplikasi"). Untung/Rugi hanya menghitung bulan ≥ tanggal mulai ("Sejak mulai pembukuan"); data lama tetap tersimpan,
  diringkas per menu + tombol **Tampilkan data lama** (dengan banner peringatan). Selisih lama titik mulai Posisi Uang
  tidak lagi dibagi ke Untung/Rugi. **Neraca ringkas** di tab Posisi Uang: saldo awal (rekening + tunai + dana diisi
  Admin; piutang invoice lama, kasbon, hutang nota/biaya/gaji/komisi/bagi hasil/DP titipan dihitung otomatis = nilai −
  pembayaran sebelum tanggal mulai) vs hari ini (angka Posisi Uang), lalu **cek "pas"**: kenaikan kekayaan bersih −
  untung sejak tanggal mulai − upah belum direkap = selisih belum tercatat (✅ bila ≤ 1% pendapatan / Rp 100 rb).
  Menu Invoice & link marketing tidak berubah (invoice lama yang belum lunas tetap ditagih).
- **Price List customer** (menu Invoice → tab **Price List**, `PriceListCustomer` / `susunPriceList`, hanya membaca
  invoice): per customer (nama klien / nama di invoice, beda huruf besar/spasi digabung) jenis pesanan dari semua invoice
  digabung, per ukuran harga dari invoice TERBARU (harga/pcs setelah diskon per pcs & diskon %; diskon total & ongkir
  tidak dihitung). Bila harga pernah beda: ▲ naik / ▼ turun + harga lama & bulannya. Ukuran berurutan yang harga &
  riwayatnya sama digabung (mis. "S – XL"). Cari customer/jenis, **Salin (WA)** tanpa riwayat, **Cetak** A5 per customer
  atau semua (pilihan dengan/tanpa kolom perubahan).
- **Sumber dana pembayaran gaji (Laporan Kinerja)**: Riwayat Pembayaran rekap memakai kolom **Sumber dana**
  (`operasionalKaryawanId` → "👤 Dana <nama>", kosong → "🏦 Kas perusahaan") + ringkasan "Dibayar dari"; daftar rekap
  memberi tanda bila ada pembayaran dari dana karyawan. Hanya tampilan.
- **Menu Biaya — cari & total**: kata yang dicari dicocokkan per baris rincian (semua kata harus ada, urutan bebas).
  Kotak **Total pencarian** menjumlah hanya baris yang cocok (qty × harga, diskon dibagi rata); bila kata ada di
  judul/kategori/penerima/catatan, seluruh transaksi dihitung. Uang masuk & keluar dijumlah terpisah, ada rincian per
  bulan. Periode: Semua / Bulan ini / Bulan lalu / per bulan / **Pilih tanggal** (dari–sampai). Filter **Sumber dana**:
  Kas perusahaan / semua dana operasional / per karyawan (yang dihitung hanya bagian yang dibayar dari sumber itu).
- **Menu Biaya — foto & link**: foto nota/struk per biaya (`fotoNota`) dan foto bukti per pembayaran
  (`payments[].proofImage`), dipindah otomatis ke baris `img:b:…` / `img:bp:…` seperti Pembelian Bahan. Link status
  pembayaran untuk penerima `#biaya=BY-…` (`shareToken`, lewat `share_cocok`) + pesan WhatsApp + **🔄 Ganti link**.
  Halaman link tidak menampilkan kategori, catatan, maupun nama karyawan pemegang dana. Uang Masuk & catatan selisih
  kas tidak punya link.
- **Kartu link WhatsApp**: `kartu-wa.jpg` (1200×630, logo Simpati saja) ada di samping `index.html`
  dan **wajib ikut di-upload saat deploy** — dipakai sebagai gambar pratinjau (og:image) saat link dibagikan di WhatsApp.
  Dibuat dari `src/logo-kotak-sumber.png` dengan `node scripts/buat-kartu-wa.cjs`. WhatsApp menyimpan pratinjau lama
  beberapa hari, jadi kartu baru muncul bertahap.
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

## Nomor Versi

- Nomor versi dibuat otomatis oleh `node scripts/build.cjs`: `vTAHUN.BULAN.TANGGAL-URUTAN` (tanggal WIB), mis. `v2026.11.13-1`. Urutan = jumlah pembaruan bernomor versi hari itu + 1 (dibaca dari riwayat git `index.html`), jadi build ulang sebelum commit tidak menaikkan nomor.
- Disimpan di `<meta name="app-versi">` dan tampil di bawah menu samping, menu ☰ HP, dan layar login.
- Saat dibuka dari hosting, aplikasi mengecek bagian awal `index.html` di hosting tiap 30 menit & saat dibuka kembali; bila nomornya lebih baru muncul pita **"Versi baru tersedia"** + tombol **Muat ulang** (tidak muncul saat ada jendela/form terbuka).

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
