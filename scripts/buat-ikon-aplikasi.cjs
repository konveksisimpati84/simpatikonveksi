// Membuat ikon aplikasi Android (dipasang dari Chrome) dari logo kotak Simpati resolusi tinggi.
// Gaya "B": tanpa bingkai merah — tulisan "Konveksi Simpati" di atas putih.
//   icon-192.png, icon-512.png                 → purpose "any"
//   apple-touch-icon.png (180 px)             → ikon layar utama iPhone / iPad
//   icon-maskable-192.png, icon-maskable-512.png → purpose "maskable" (isi diperkecil 85% agar tetap utuh
//                                                 saat HP memotong ikon menjadi bulat / kotak tumpul)
// Jalankan sekali bila logo berubah: node scripts/buat-ikon-aplikasi.cjs  (butuh Playwright + Chromium)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const sumber = path.join(root, 'src', 'logo-kotak-sumber.png');
if (!fs.existsSync(sumber)) { console.error('src/logo-kotak-sumber.png tidak ada'); process.exit(1); }
const dataUri = 'data:image/png;base64,' + fs.readFileSync(sumber).toString('base64');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    const hasil = await page.evaluate(async (dataUri) => {
        const img = new Image();
        await new Promise((ok, gagal) => { img.onload = ok; img.onerror = gagal; img.src = dataUri; });
        // Warna latar = warna putih di dalam logo (agak krem), supaya tidak ada garis tepi samar
        const cc = document.createElement('canvas'); cc.width = img.width; cc.height = img.height;
        const gg = cc.getContext('2d'); gg.drawImage(img, 0, 0);
        const px = gg.getImageData(Math.round(img.width / 2), Math.round(img.height * 0.12), 1, 1).data;
        const latar = `rgb(${px[0]},${px[1]},${px[2]})`;
        const buat = (S, skala) => {
            const c = document.createElement('canvas'); c.width = S; c.height = S;
            const g = c.getContext('2d');
            g.fillStyle = latar; g.fillRect(0, 0, S, S);
            g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
            const sisi = S * skala, o = (S - sisi) / 2;
            // Buang bingkai merah: hanya bagian dalam logo (3,4% dari tiap tepi) yang digambar
            const tepi = sisi * 0.034;
            g.save(); g.beginPath(); g.roundRect(o + tepi, o + tepi, sisi - 2 * tepi, sisi - 2 * tepi, sisi * 0.13); g.clip(); // sudut bingkai melengkung
            g.drawImage(img, o, o, sisi, sisi);
            g.restore();
            return c.toDataURL('image/png').split(',')[1];
        };
        return {
            'icon-192.png': buat(192, 1), 'icon-512.png': buat(512, 1),
            'icon-maskable-192.png': buat(192, 0.85), 'icon-maskable-512.png': buat(512, 0.85),
            // Ikon layar utama iPhone / iPad (Safari): gaya sama dengan Android, sudut dibulatkan sendiri oleh iOS
            'apple-touch-icon.png': buat(180, 1),
            latar,
        };
    }, dataUri);
    console.log('warna latar ikon', hasil.latar); delete hasil.latar;
    for (const [nama, b64] of Object.entries(hasil)) {
        fs.writeFileSync(path.join(root, nama), Buffer.from(b64, 'base64'));
        console.log('dibuat', nama);
    }
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
