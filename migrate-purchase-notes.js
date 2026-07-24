/**
 * MIGRATION SCRIPT — purchaseNotes: paymentStatus → payments[]
 * ============================================================
 * Tujuan: Mengkonversi nota pembelian lama (format `paymentStatus`)
 *         ke format baru (format `payments[]`).
 *
 * CARA PAKAI:
 *   1. Buka aplikasi di browser (simpatikonveksi)
 *   2. Pastikan sudah login dan app sudah load penuh
 *   3. Buka DevTools → Console (F12 → Console)
 *   4. Paste SELURUH isi file ini ke console, tekan Enter
 *   5. Baca laporan dry-run yang muncul
 *   6. Jika setuju, klik OK di dialog konfirmasi
 *
 * KEAMANAN:
 *   - Dry-run DULU sebelum ada perubahan apapun
 *   - Backup JSON ditampilkan di console sebelum save
 *   - Jika Supabase gagal, localStorage TIDAK diubah
 *   - Script idempotent: aman dijalankan berkali-kali
 *   - Nota "Dibayar Sebagian" tanpa rincian TIDAK diubah otomatis
 *     (jumlah bayar tidak diketahui, perlu edit manual)
 *
 * YANG DIMIGRASI:
 *   - paymentStatus: 'Lunas'        → payments: [{ amount: total nota }]
 *   - paymentStatus: 'Belum Dibayar' → payments: []
 *   - paymentStatus: 'Dibayar Sebagian' → SKIP (manual review)
 *   - nota dengan payments[] sudah ada → SKIP (sudah migrasi)
 *   - nota isDeleted → SKIP
 */

(async () => {
    'use strict';

    // ──────────────────────────────────────────────────────────────
    // UTILITAS (self-contained, tidak bergantung scope app)
    // ──────────────────────────────────────────────────────────────
    const safeArr = (v) => Array.isArray(v) ? v : [];

    const genId = (prefix = '') =>
        `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const lineTotal = (item) => {
        const qty   = parseFloat(String(item?.qty   ?? 0).replace(',', '.')) || 0;
        const price = parseFloat(String(item?.price ?? 0).replace(',', '.')) || 0;
        return qty * price;
    };

    const noteTotal = (note) =>
        safeArr(note?.items).reduce((s, it) => s + lineTotal(it), 0);

    const formatRp = (v) =>
        new Intl.NumberFormat('id-ID', {
            style: 'currency', currency: 'IDR', minimumFractionDigits: 0
        }).format(v || 0);

    const today = () => new Date().toISOString().slice(0, 10);
    const now   = () => new Date().toISOString();

    // ──────────────────────────────────────────────────────────────
    // STEP 0: Pastikan supabaseClient tersedia
    // ──────────────────────────────────────────────────────────────
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;

    if (!client) {
        console.error([
            '❌ supabaseClient tidak ditemukan.',
            '   Pastikan:',
            '   1. Aplikasi sudah dibuka dan loading selesai',
            '   2. Supabase berhasil terhubung (tidak ada error di console)',
            '   3. Anda menjalankan script ini di halaman yang benar',
        ].join('\n'));
        return;
    }

    console.log('✅ supabaseClient ditemukan.');

    // ──────────────────────────────────────────────────────────────
    // STEP 1: Ambil data dari Supabase
    // ──────────────────────────────────────────────────────────────
    console.log('\n🔍 Mengambil purchaseNotes dari Supabase...');

    const { data: row, error: fetchError } = await client
        .from('app_data')
        .select('data')
        .eq('id', 'purchaseNotes')
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('❌ Gagal mengambil data dari Supabase:', fetchError);
        return;
    }

    const allNotes = Array.isArray(row?.data) ? row.data : [];
    console.log(`📋 Total purchaseNotes di Supabase: ${allNotes.length}`);

    if (allNotes.length === 0) {
        console.log('ℹ️  Tidak ada data purchaseNotes. Tidak ada yang perlu dimigrasi.');
        return;
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 2: Klasifikasi setiap nota
    // ──────────────────────────────────────────────────────────────
    const groups = {
        alreadyNew:   [],  // sudah punya payments[]
        migrateLunas: [],  // paymentStatus: Lunas  → bisa otomatis
        migrateBelum: [],  // paymentStatus: Belum / null → bisa otomatis
        needManual:   [],  // paymentStatus: Dibayar Sebagian → tidak bisa otomatis
        deleted:      [],  // isDeleted: true
    };

    for (const note of allNotes) {
        if (note.isDeleted) {
            groups.deleted.push(note);
            continue;
        }
        if (Array.isArray(note.payments)) {
            groups.alreadyNew.push(note);
            continue;
        }
        if (note.paymentStatus === 'Dibayar Sebagian') {
            groups.needManual.push(note);
            continue;
        }
        if (note.paymentStatus === 'Lunas') {
            groups.migrateLunas.push(note);
            continue;
        }
        // paymentStatus: 'Belum Dibayar' atau tidak ada sama sekali
        groups.migrateBelum.push(note);
    }

    const totalToMigrate = groups.migrateLunas.length + groups.migrateBelum.length;

    // ──────────────────────────────────────────────────────────────
    // STEP 3: Laporan Dry-Run
    // ──────────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(65));
    console.log('  📊 DRY-RUN REPORT  (belum ada perubahan)');
    console.log('═'.repeat(65));

    console.log(`\n✅ Sudah format baru (ada payments[]):  ${groups.alreadyNew.length} nota`);
    console.log(`🔄 Akan dimigrasi otomatis:             ${totalToMigrate} nota`);
    console.log(`   ├─ paymentStatus "Lunas":            ${groups.migrateLunas.length} nota`);
    console.log(`   └─ paymentStatus "Belum Dibayar":    ${groups.migrateBelum.length} nota`);
    console.log(`⚠️  Perlu edit MANUAL (Dibayar Sebagian): ${groups.needManual.length} nota`);
    console.log(`🗑️  Deleted (dilewati):                 ${groups.deleted.length} nota`);

    if (groups.migrateLunas.length > 0) {
        console.log('\n--- LUNAS → akan dibuat payments[] dengan nominal penuh ---');
        for (const n of groups.migrateLunas) {
            const tot = noteTotal(n);
            console.log(`  ${n.id} | ${n.vendor || '(tanpa vendor)'} | ${n.date || '(tanpa tgl)'} | ${formatRp(tot)}`);
        }
    }

    if (groups.migrateBelum.length > 0) {
        console.log('\n--- BELUM DIBAYAR → akan dibuat payments: [] ---');
        for (const n of groups.migrateBelum) {
            const tot = noteTotal(n);
            console.log(`  ${n.id} | ${n.vendor || '(tanpa vendor)'} | ${n.date || '(tanpa tgl)'} | ${formatRp(tot)}`);
        }
    }

    if (groups.needManual.length > 0) {
        console.log('\n⚠️  --- TIDAK DIMIGRASI OTOMATIS (Dibayar Sebagian) ---');
        console.log('   Nota ini memiliki status "Dibayar Sebagian" tapi tidak ada');
        console.log('   rincian jumlah yang dibayar — tidak bisa dimigrasi otomatis.');
        console.log('   TINDAKAN: Buka app → Edit setiap nota ini → isi rincian pembayaran:');
        for (const n of groups.needManual) {
            const tot = noteTotal(n);
            console.log(`  ➤ ${n.id} | ${n.vendor || '(tanpa vendor)'} | ${n.date || '(tanpa tgl)'} | Total: ${formatRp(tot)}`);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 4: Cek apakah ada yang perlu dimigrasi
    // ──────────────────────────────────────────────────────────────
    if (totalToMigrate === 0) {
        console.log('\n✅ Tidak ada yang perlu dimigrasi otomatis.');
        if (groups.needManual.length > 0) {
            console.log('⚠️  Masih ada nota "Dibayar Sebagian" yang perlu edit manual (lihat di atas).');
        }
        return;
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 5: Konfirmasi
    // ──────────────────────────────────────────────────────────────
    const msg = [
        `Migrasi ${totalToMigrate} nota ke format payments[]?`,
        '',
        `• ${groups.migrateLunas.length} nota "Lunas" → payments dengan nominal penuh`,
        `• ${groups.migrateBelum.length} nota "Belum Dibayar" → payments: []`,
        '',
        `${groups.needManual.length} nota "Dibayar Sebagian" TIDAK diubah (manual).`,
        '',
        'Backup akan ditampilkan di console sebelum save.',
        'Lanjutkan?'
    ].join('\n');

    const confirmed = window.confirm(msg);
    if (!confirmed) {
        console.log('\n❌ Dibatalkan. Tidak ada yang diubah.');
        return;
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 6: Backup (tampilkan di console)
    // ──────────────────────────────────────────────────────────────
    console.log('\n💾 BACKUP data asli (simpan jika perlu rollback):');
    console.log('window.__MIGRATION_BACKUP_PURCHASE_NOTES__ =', JSON.stringify(allNotes));
    // Juga simpan di window supaya mudah diakses
    window.__MIGRATION_BACKUP_PURCHASE_NOTES__ = allNotes;
    console.log('   Untuk rollback: jalankan window.__MIGRATION_ROLLBACK__()');

    // ──────────────────────────────────────────────────────────────
    // STEP 7: Bangun data yang sudah dimigrasi
    // ──────────────────────────────────────────────────────────────
    const migratedNotes = allNotes.map(note => {
        // Skip: sudah baru, deleted, atau Dibayar Sebagian (tidak bisa otomatis)
        if (Array.isArray(note.payments)) return note;
        if (note.isDeleted) return note;
        if (note.paymentStatus === 'Dibayar Sebagian') return note;

        const total = noteTotal(note);

        if (note.paymentStatus === 'Lunas') {
            return {
                ...note,
                payments: total > 0
                    ? [{
                        id: genId('PAY-'),
                        date: note.date || today(),
                        amount: total,
                        method: note.method || 'Transfer',
                        note: 'Migrasi dari data lama'
                    }]
                    : [],
                _syncUpdatedAt: now()
            };
        }

        // Belum Dibayar (atau status kosong)
        return {
            ...note,
            payments: [],
            _syncUpdatedAt: now()
        };
    });

    // Verifikasi: jumlah nota tidak berubah
    if (migratedNotes.length !== allNotes.length) {
        console.error(`❌ BUG: jumlah nota berubah (${allNotes.length} → ${migratedNotes.length}). Dibatalkan.`);
        return;
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 8: Simpan ke Supabase DULU
    // ──────────────────────────────────────────────────────────────
    console.log('\n💾 Menyimpan ke Supabase...');
    const { error: saveError } = await client
        .from('app_data')
        .upsert({ id: 'purchaseNotes', data: migratedNotes });

    if (saveError) {
        console.error('❌ GAGAL menyimpan ke Supabase:', saveError);
        console.log('⚠️  localStorage TIDAK diubah karena Supabase gagal.');
        console.log('   Data asli tetap aman.');
        return;
    }

    console.log('✅ Supabase berhasil diupdate.');

    // ──────────────────────────────────────────────────────────────
    // STEP 9: Update localStorage (setelah Supabase sukses)
    // ──────────────────────────────────────────────────────────────
    try {
        localStorage.setItem('simpati_purchaseNotes_sync', JSON.stringify(migratedNotes));
        console.log('✅ localStorage berhasil diupdate.');
    } catch (e) {
        console.warn('⚠️  localStorage gagal diupdate (mungkin data terlalu besar):', e.message);
        console.log('   Tidak masalah — app akan sync dari Supabase saat reload.');
    }

    // ──────────────────────────────────────────────────────────────
    // STEP 10: Daftarkan fungsi rollback
    // ──────────────────────────────────────────────────────────────
    window.__MIGRATION_ROLLBACK__ = async () => {
        const backup = window.__MIGRATION_BACKUP_PURCHASE_NOTES__;
        if (!backup) {
            console.error('❌ Backup tidak ditemukan. Tidak bisa rollback.');
            return;
        }
        const ok = window.confirm(`Rollback ${backup.length} nota ke data asli?\n\nSemua hasil migrasi akan dibatalkan!`);
        if (!ok) { console.log('Rollback dibatalkan.'); return; }

        const { error } = await client.from('app_data').upsert({ id: 'purchaseNotes', data: backup });
        if (error) { console.error('❌ Rollback Supabase gagal:', error); return; }

        try { localStorage.setItem('simpati_purchaseNotes_sync', JSON.stringify(backup)); } catch(e) {}

        console.log('✅ Rollback selesai. Reload halaman untuk melihat hasilnya.');
    };

    // ──────────────────────────────────────────────────────────────
    // STEP 11: Ringkasan akhir
    // ──────────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(65));
    console.log('  ✅ MIGRASI SELESAI');
    console.log('═'.repeat(65));
    console.log(`✅ Berhasil dimigrasi: ${totalToMigrate} nota`);
    console.log(`⚠️  Perlu edit manual: ${groups.needManual.length} nota`);

    if (groups.needManual.length > 0) {
        console.log('\n📝 LANGKAH SELANJUTNYA (manual):');
        console.log('   Buka app → Menu Pembelian Bahan → cari nota berikut → klik Edit:');
        for (const n of groups.needManual) {
            const tot = noteTotal(n);
            console.log(`   ➤ ID: ${n.id} | Vendor: ${n.vendor || '-'} | Tgl: ${n.date || '-'} | Total: ${formatRp(tot)}`);
        }
        console.log('   Masukkan rincian pembayaran yang benar di tab "Pembayaran", lalu simpan.');
    }

    console.log('\n🔄 Reload halaman untuk melihat perubahan di app.');
    console.log('   (Jika perlu rollback: jalankan window.__MIGRATION_ROLLBACK__())');
})();
