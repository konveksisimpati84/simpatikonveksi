# Catatan untuk Claude

- `index.html` adalah file hasil build. Jangan edit langsung.
- Edit `src/app.jsx` (kode React/JSX) atau `src/index.template.html` (head/CDN/loading), lalu jalankan `node scripts/build.cjs` dan commit `src/` beserta `index.html`.
- Jika Babel belum terpasang: `npm install --no-save @babel/core@8 @babel/preset-react@8`.
- Teks `</script` di dalam `src/app.jsx` harus ditulis `<\/script` (build akan gagal jika tidak).
