// Membuat gambar kartu link WhatsApp (og:image) dari logo kotak Simpati: kartu-wa.jpg (1200×630, logo Simpati saja di latar putih polos).
// Logo berada di zona tengah (630 px) agar tetap utuh saat WhatsApp memotong menjadi kotak kecil.
// Latar putih logo dibuat transparan (tanpa kotak putih). Jalankan bila logo berubah: node scripts/buat-kartu-wa.cjs (butuh Playwright + Chromium)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const sumber = path.join(root, 'src', 'logo-kotak-sumber.png');
if (!fs.existsSync(sumber)) { console.error('src/logo-kotak-sumber.png tidak ada'); process.exit(1); }

(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const logo = 'data:image/png;base64,' + fs.readFileSync(sumber).toString('base64');
  await p.setContent('<html><body></body></html>');
  const out = await p.evaluate(async (logo) => {
    const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = logo; });
    const t = document.createElement('canvas'); t.width = img.width; t.height = img.height; const tg = t.getContext('2d'); tg.drawImage(img, 0, 0);
    const id = tg.getImageData(0, 0, img.width, img.height); const d = id.data; const m = Math.round(img.width * 0.085);
    let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0;
    for (let y = m; y < img.height - m; y++) for (let x = m; x < img.width - m; x++) { const i = (y * img.width + x) * 4; if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    const pad = 12; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const lw = x1 - x0, lh = y1 - y0;
    // logo transparan: putih → tembus pandang (tepi halus), warna asli dipertahankan
    const mk = (mode) => {
      const c = document.createElement('canvas'); c.width = lw; c.height = lh; const g = c.getContext('2d');
      const src = tg.getImageData(x0, y0, lw, lh); const s = src.data;
      for (let i = 0; i < s.length; i += 4) {
        const r = s[i], gg = s[i + 1], bb = s[i + 2]; const minc = Math.min(r, gg, bb);
        let a = Math.max(0, Math.min(1, (232 - minc) / 70)); // makin putih makin transparan (garis tepi abu-abu tipis ikut hilang)
        if (a <= 0.02) { s[i + 3] = 0; continue; }
        // kembalikan warna asli tanpa campuran putih
        const un = (v) => Math.max(0, Math.min(255, Math.round((v - 255 * (1 - Math.min(1, (255 - minc) / 255 * 2.2))) / Math.max(0.05, Math.min(1, (255 - minc) / 255 * 2.2)))));
        let R = un(r), G = un(gg), B = un(bb);
        if (mode === 'putih') { R = G = B = 255; }
        s[i] = R; s[i + 1] = G; s[i + 2] = B; s[i + 3] = Math.round(a * 255);
      }
      g.putImageData(src, 0, 0); return c;
    };
    const W = 1200, H = 630;
    const desain = {};
    const gambar = (nama, latar, logoMode) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      latar(g);
      // logo saja, di tengah: lebar 560 px (muat di potongan kotak 630 px dengan sisa tepi)
      const L = mk(logoMode); const tw = 560, th = tw * lh / lw, ty = Math.round((H - th) / 2);
      g.imageSmoothingQuality = 'high'; g.drawImage(L, (W - tw) / 2, ty, tw, th);
      desain[nama] = c.toDataURL('image/jpeg', 0.88).split(',')[1];
    };
    // Latar putih polos, tanpa pita/garis
    gambar('A', (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); }, 'asli');
    return desain;
  }, logo);
  fs.writeFileSync(path.join(root, 'kartu-wa.jpg'), Buffer.from(out.A, 'base64'));
  console.log('dibuat kartu-wa.jpg', fs.statSync(path.join(root, 'kartu-wa.jpg')).size, 'byte');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
