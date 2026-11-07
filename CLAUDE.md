# Catatan untuk Claude

- `index.html` adalah file hasil build. Jangan edit langsung.
- Edit `src/app.jsx` (kode React/JSX) atau `src/index.template.html` (head/CDN/loading), lalu jalankan `node scripts/build.cjs` dan commit `src/` beserta `index.html`.
- Jika Babel/Tailwind/Terser belum terpasang (pasang keempatnya sekaligus): `npm install --no-save @babel/core@8 @babel/preset-react@8 tailwindcss@3.4.17 terser@5.31.6`. Build juga memperkecil kode (minify) dengan Terser.
- CSS Tailwind dibuat saat build (bukan Tailwind CDN). Hindari dua kelas sejenis yang bertabrakan pada satu elemen (mis. `bg-white` + `bg-blue-50`); taruh salah satunya di kondisi. Komponen `Card` sudah otomatis membuang kelas bawaan yang ditimpa `className`.
- jsPDF, Chart.js, Font Awesome dimuat saat dibutuhkan (`loadJsPdf`, `loadChartJs`, `loadFontAwesome`), jangan ditambahkan kembali ke `<head>`.
- Teks `</script` di dalam `src/app.jsx` harus ditulis `<\/script` (build akan gagal jika tidak).
