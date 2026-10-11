// Merakit index.html dari src/app.jsx + src/index.template.html.
// JSX diterjemahkan sekali di sini, sehingga browser tidak perlu memuat Babel (±2,3 MB) dan menerjemahkan ulang tiap kali aplikasi dibuka.
// Jalankan: node scripts/build.cjs
const fs = require('fs');
const path = require('path');

let babel;
try {
    babel = require('@babel/core');
    require.resolve('@babel/preset-react');
    require.resolve('tailwindcss/lib/lib/expandTailwindAtRules.js');
    require.resolve('postcss');
} catch (e) {
    console.error('Babel/Tailwind belum terpasang. Jalankan dulu:\n  npm install --no-save @babel/core@8 @babel/preset-react@8 tailwindcss@3.4.17');
    process.exit(1);
}

const root = path.join(__dirname, '..');
const PLACEHOLDER = '<script>/*__APP_JS__*/</script>';
const TW_PLACEHOLDER = '/*__TAILWIND_CSS__*/';
const source = fs.readFileSync(path.join(root, 'src/app.jsx'), 'utf8');
const template = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');

const fail = (msg) => { console.error('BUILD GAGAL: ' + msg); process.exit(1); };

if (template.split(PLACEHOLDER).length !== 2) fail(`template harus berisi tepat satu ${PLACEHOLDER}`);
if (template.split(TW_PLACEHOLDER).length !== 2) fail(`template harus berisi tepat satu ${TW_PLACEHOLDER}`);

// Tailwind: CSS dibuat sekali di sini dari kelas yang dipakai di src/app.jsx & template (pengganti Tailwind CDN yang menyusun CSS di browser).
// Tailwind CDN menyusun aturan sesuai urutan kelas pertama kali muncul; Tailwind biasa mengurutkan abjad. Pada elemen dengan dua kelas
// yang bertabrakan (mis. bg-white + bg-blue-50) urutan ini menentukan mana yang menang, jadi urutan abjad dimatikan agar hasilnya
// mengikuti urutan kemunculan di kode seperti Tailwind CDN. Versi Tailwind dikunci (3.4.17); bila kodenya berubah, build berhenti.
const buildTailwindCss = async () => {
    const Module = require('module');
    const expPath = require.resolve('tailwindcss/lib/lib/expandTailwindAtRules.js');
    const twVersion = require('tailwindcss/package.json').version;
    if (twVersion !== '3.4.17') fail(`Tailwind harus versi 3.4.17 (terpasang ${twVersion}). Jalankan: npm install --no-save @babel/core@8 @babel/preset-react@8 tailwindcss@3.4.17`);
    const sortRx = /let sortedCandidates = new Set\(\[\s*\.\.\.candidates\s*\]\.sort\(\(a, z\)=>\{[\s\S]*?\}\)\);/;
    let expSrc = fs.readFileSync(expPath, 'utf8');
    if (!sortRx.test(expSrc)) fail('bagian pengurutan kelas Tailwind tidak ditemukan (versi Tailwind berubah?)');
    expSrc = expSrc.replace(sortRx, 'let sortedCandidates = new Set([...candidates]);');
    const patched = new Module(expPath, module);
    patched.filename = expPath;
    patched.paths = Module._nodeModulePaths(path.dirname(expPath));
    patched._compile(expSrc, expPath);
    patched.loaded = true;
    require.cache[expPath] = patched;
    const postcss = require('postcss');
    const tailwindcss = require('tailwindcss');
    const result = await postcss([tailwindcss({ content: [{ raw: source, extension: 'jsx' }, { raw: template, extension: 'html' }] })])
        .process('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n', { from: undefined });
    // Ringkas tanpa mengubah isi aturan: buang komentar & baris baru
    return result.css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*/g, '').replace(/\s*\{\s*/g, '{').replace(/;\s*\}/g, '}');
};

(async () => {
const twCss = await buildTailwindCss();
if (twCss.length < 5000) fail('CSS Tailwind terlalu kecil, kemungkinan kelas tidak terbaca');
if (/<\/style/i.test(twCss)) fail('CSS Tailwind mengandung "</style"');

const { code } = babel.transformSync(source, {
    filename: 'app.jsx',
    babelrc: false,
    configFile: false,
    // Sama dengan preset yang dulu dipakai Babel di browser (app-react-classic)
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
    comments: false,
    compact: true,
});

// "</script" di dalam kode akan memotong tag <script> di HTML
if (/<\/script/i.test(code)) fail('hasil terjemahan mengandung "</script" — tulis sebagai "<\\/script" di src/app.jsx');

const out = template.replace(PLACEHOLDER, () => `<script>\n${code}\n</script>`).replace(TW_PLACEHOLDER, () => twCss);
fs.writeFileSync(path.join(root, 'index.html'), out);
console.log(`index.html dibuat: ${(out.length / 1048576).toFixed(2)} MB (kode sumber ${(source.length / 1048576).toFixed(2)} MB, CSS Tailwind ${(twCss.length / 1024).toFixed(0)} KB)`);
})().catch(e => fail(e && e.stack || String(e)));
