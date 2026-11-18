// Service worker Simpati Konveksi — syarat agar aplikasi bisa dipasang di HP ("Instal aplikasi" di Chrome).
// Aturan: SELALU ambil halaman dari server dulu, jadi versi terbaru langsung terpakai seperti di browser biasa.
// Hanya bila tidak ada internet, halaman terakhir yang tersimpan dipakai agar aplikasi tetap terbuka
// (data tetap butuh internet). Data (Supabase), gambar, dan file lain TIDAK disentuh sama sekali.
const CACHE = 'simpati-halaman-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const kunci = await caches.keys();
        await Promise.all(kunci.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || req.mode !== 'navigate') return; // hanya saat membuka halaman aplikasi
    if (new URL(req.url).origin !== self.location.origin) return;
    event.respondWith((async () => {
        try {
            const res = await fetch(req);
            if (res && res.ok && res.type === 'basic') {
                const salinan = res.clone();
                caches.open(CACHE).then((c) => c.put('/', salinan)).catch(() => {});
            }
            return res;
        } catch (err) {
            const lama = await caches.match('/', { cacheName: CACHE });
            if (lama) return lama;
            throw err;
        }
    })());
});
