# Catatan untuk Claude

- `index.html` adalah file hasil build. Jangan edit langsung.
- Edit `src/app.jsx` (kode React/JSX) atau `src/index.template.html` (head/CDN/loading), lalu jalankan `node scripts/build.cjs` dan commit `src/` beserta `index.html`.
- Jika Babel/Tailwind belum terpasang (pasang ketiganya sekaligus): `npm install --no-save @babel/core@8 @babel/preset-react@8 tailwindcss@3.4.17`.
- CSS Tailwind dibuat saat build (bukan Tailwind CDN). Hindari dua kelas sejenis yang bertabrakan pada satu elemen (mis. `bg-white` + `bg-blue-50`); taruh salah satunya di kondisi. Komponen `Card` sudah otomatis membuang kelas bawaan yang ditimpa `className`.
- jsPDF, Chart.js, Font Awesome dimuat saat dibutuhkan (`loadJsPdf`, `loadChartJs`, `loadFontAwesome`), jangan ditambahkan kembali ke `<head>`.
- Teks `</script` di dalam `src/app.jsx` harus ditulis `<\/script` (build akan gagal jika tidak).
