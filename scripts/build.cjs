// Merakit index.html dari src/app.jsx + src/index.template.html.
// JSX diterjemahkan sekali di sini, sehingga browser tidak perlu memuat Babel (±2,3 MB) dan menerjemahkan ulang tiap kali aplikasi dibuka.
// Jalankan: node scripts/build.cjs
const fs = require('fs');
const path = require('path');

let babel;
try {
    babel = require('@babel/core');
    require.resolve('@babel/preset-react');
} catch (e) {
    console.error('Babel belum terpasang. Jalankan dulu:\n  npm install --no-save @babel/core@8 @babel/preset-react@8');
    process.exit(1);
}

const root = path.join(__dirname, '..');
const PLACEHOLDER = '<script>/*__APP_JS__*/</script>';
const source = fs.readFileSync(path.join(root, 'src/app.jsx'), 'utf8');
const template = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');

const fail = (msg) => { console.error('BUILD GAGAL: ' + msg); process.exit(1); };

if (template.split(PLACEHOLDER).length !== 2) fail(`template harus berisi tepat satu ${PLACEHOLDER}`);

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

const out = template.replace(PLACEHOLDER, () => `<script>\n${code}\n</script>`);
fs.writeFileSync(path.join(root, 'index.html'), out);
console.log(`index.html dibuat: ${(out.length / 1048576).toFixed(2)} MB (kode sumber ${(source.length / 1048576).toFixed(2)} MB)`);
