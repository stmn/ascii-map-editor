// Buduje dist/standalone.html - jeden plik HTML dzialajacy z file://
//
// Dlaczego: przegladarki blokuja <script type="module" src="...">
// ladowany z file:// (CORS na schemacie file), wiec zwykly build dziala
// tylko przez serwer HTTP. Skrypt modulowy WPISANY inline wykonuje sie
// z file:// bez problemu, dlatego wciagamy JS i CSS do HTML-a, a wszystkie
// assety (font, kursory, dzwiek) zamieniamy na data: URI.
//
// Zero zaleznosci - czysty node, uruchamiany po `vite build`.

import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const assetsDir = join(dist, 'assets');

const MIME = {
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

function fail(message) {
  console.error(`build-standalone: ${message}`);
  process.exit(1);
}

function extname(name) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Zamienia odwolania do plikow assetow (z opcjonalnym prefiksem ./) na data: URI.
 * Podmiana funkcja, nie stringiem - w stringu $&, $', $1 itd. sa specjalne.
 */
function inlineAssetUrls(text, assets) {
  let out = text;
  for (const [name, dataUri] of assets) {
    out = out.replace(new RegExp(`(\\./)?${escapeRegExp(name)}`, 'g'), () => dataUri);
  }
  return out;
}

const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) {
  fail('dist/index.html not found - run `npm run build` first');
}

const html = readFileSync(indexPath, 'utf8');
const files = readdirSync(assetsDir);

const jsFiles = files.filter((f) => f.endsWith('.js'));
const cssFiles = files.filter((f) => f.endsWith('.css'));
if (jsFiles.length !== 1) {
  fail(`expected exactly 1 JS chunk in dist/assets, found ${jsFiles.length} (${jsFiles.join(', ')}). `
    + 'Code splitting breaks single-file inlining - remove the dynamic import or extend this script.');
}
if (cssFiles.length > 1) fail(`expected at most 1 CSS file, found ${cssFiles.length}`);

// binarne assety -> data: URI (mapa nazwa pliku -> data URI)
const assets = [];
for (const name of files) {
  if (name.endsWith('.js') || name.endsWith('.css')) continue;
  const mime = MIME[extname(name)];
  if (!mime) fail(`unknown asset type: ${name} - add its MIME type to build-standalone.mjs`);
  const base64 = readFileSync(join(assetsDir, name)).toString('base64');
  assets.push([name, `data:${mime};base64,${base64}`]);
}

let js = inlineAssetUrls(readFileSync(join(assetsDir, jsFiles[0]), 'utf8'), assets);
// `</script` w tresci JS zakonczyloby tag wczesniej; w literalach stringow
// backslash przed / nic nie zmienia, wiec podmiana jest bezpieczna
js = js.replace(/<\/script/gi, '<\\/script');

let css = cssFiles.length ? inlineAssetUrls(readFileSync(join(assetsDir, cssFiles[0]), 'utf8'), assets) : '';
if (/<\/style/i.test(css)) fail('CSS contains "</style>" - cannot inline safely');

// wywalamy tagi ladujace zewnetrzne pliki i wstawiamy tresc inline.
// Liczymy usuniecia: jesli Vite zmieni ksztalt HTML-a, standalone cicho
// zostalby z zewnetrznym <script src>, ktory z file:// sie nie zaladuje.
let scriptTagsRemoved = 0;
let linkTagsRemoved = 0;
let out = html
  .replace(/\s*<script[^>]*src="[^"]*"[^>]*><\/script>/g, () => {
    scriptTagsRemoved += 1;
    return '';
  })
  .replace(/\s*<link[^>]*rel="stylesheet"[^>]*>/g, () => {
    linkTagsRemoved += 1;
    return '';
  });

if (scriptTagsRemoved !== 1) {
  fail(`expected to remove exactly 1 external <script src> from dist/index.html, removed ${scriptTagsRemoved}. `
    + "Vite's HTML output changed - update the tag stripping in build-standalone.mjs.");
}
if (linkTagsRemoved !== cssFiles.length) {
  fail(`expected to remove ${cssFiles.length} <link rel="stylesheet"> tag(s) from dist/index.html, removed ${linkTagsRemoved}. `
    + "Vite's HTML output changed - update the tag stripping in build-standalone.mjs.");
}

const inlined = `${css ? `\n    <style>\n${css}\n    </style>` : ''}\n    <script type="module">\n${js}\n    </script>`;
if (!out.includes('</head>')) fail('dist/index.html has no </head>');
// funkcja zamiast stringa: w stringu zastepujacym $&, $', $$ maja znaczenie
// specjalne i cicho zepsulyby wklejany bundle
out = out.replace('</head>', () => `${inlined}\n  </head>`);

const target = join(dist, 'standalone.html');
writeFileSync(target, out);
console.log(`build-standalone: dist/standalone.html (${(out.length / 1024).toFixed(0)} kB)`);

// LICENSES.md jedzie razem z paczka - zip/standalone rozprowadzaja assety
// na licencjach MIT i OFL, ktore wymagaja dolaczenia tekstu licencji
const licenses = join(root, 'LICENSES.md');
if (existsSync(licenses)) {
  copyFileSync(licenses, join(dist, 'LICENSES.md'));
  console.log('build-standalone: dist/LICENSES.md');
} else {
  console.warn('build-standalone: LICENSES.md not found at repo root - the zip will ship without license texts');
}
