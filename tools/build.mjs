// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Reproducible build without third-party packages (Node.js >= 20).
//   node tools/build.mjs [--with-sources]
// --with-sources also embeds the demo programs' assembler sources (gzip, base64); by default only
// the assembled programs go in, see tools/program-assets.mjs for why.
// Output: dist/web/ (static site) and dist/Wolf80-offline.html (one file, also for the desktop EXE).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { embedPrograms } from './program-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(root, ...p);
const read = p => fs.readFileSync(rel(p), 'utf8');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

// Dependency order; imports and exports are stripped and the result is one IIFE.
const MODULES = [
  'src/core/i8080.js', 'src/core/i8080-disasm.js', 'src/core/z80.js', 'src/core/z80-disasm.js', 'src/asm/asm8080.js',
  'src/machine/i8255.js', 'src/machine/display.js', 'src/machine/audio-render.js',
  'src/machine/memfile.js', 'src/machine/programs.js',
  'src/board/pmi80.js', 'src/board/pmi80-tape.js', 'src/board/savia84.js', 'src/board/stone1.js', 'src/board/profiles.js',
  'src/ui/i18n.js', 'src/ui/audio.js', 'src/ui/app.js',
];

const ROMS = {
  pmi80: { file: 'roms/pmi80/pmi80_monitor.bin', sha256: '1717e466e24054ea52722476a82dcc3d471ac218dc144898f376030c64bd12fa' },
  pmi80c: { file: 'roms/pmi80/pmi80c_monitor.bin', sha256: '1440557a1ccc7669321ddadc8e4313936a73dcea4575a3e22114337f7a360aea' },
  pmi80cgames: { file: 'roms/pmi80/pmi80c_games.bin', sha256: '2fbec278bef7fc05c683f8a4e4ad7fcc533f08eb79f57e7003987da893e25fc0' },
  savia84: { file: 'roms/savia84/savia84_monitor.bin', sha256: '3caf3ed02f7fd8bc2484bbfb48df788ef1db01a8098146f9f8bd9e8f61efd031' },
  // the Stone 1's own monitor, withheld (docs/stone1.md, "The own monitor, withheld")
  // stone1: { file: 'roms/stone1/stone1_monitor.bin', sha256: 'c040cfc4fb211b21a459e5740e3abb119621aac8535c03a6993ce5004d3e3d7b' },
  stonepmi: { file: 'roms/stone1/stone_pmi.bin', sha256: '528c9d1fc581859daae033d953bac0ddad007cddebccc8789c2a1de5625b26ca' },
};

// A syntax error would only show in the browser, as a page that does nothing; stop the build instead.
// Each module is compiled, not run, as it stands in the bundle (strict, without imports and exports),
// so the message names its own file and line.
function checkSyntax(src, file) {
  try {
    new vm.Script(`'use strict';${src}`, { filename: file });
  } catch (e) {
    // the stack starts with "file:line", the line itself and a caret under the fault
    throw new Error(`${file}: ${e.message}\n${String(e.stack).split('\n').slice(0, 3).join('\n')}`);
  }
}

function bundle() {
  const seen = new Map();
  const parts = MODULES.map(file => {
    let src = read(file);
    src = src.replace(/^import\s[^;]*;\s*$/gm, '');
    if (/^\s*import\s/m.test(src)) throw new Error(`${file}: unsupported import syntax`);
    src = src.replace(/^export\s+(?=(const|let|function|class|async)\b)/gm, '');
    if (/^\s*export\b/m.test(src)) throw new Error(`${file}: unsupported export syntax`);
    for (const m of src.matchAll(/^(?:const|let|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (seen.has(m[1])) throw new Error(`Duplicate top-level name ${m[1]} in ${file} and ${seen.get(m[1])}`);
      seen.set(m[1], file);
    }
    checkSyntax(src, file);
    return `// ---- ${file} ----\n${src}`;
  });
  return `/* Wolf80 - emulator of Czechoslovak single-board computers. SPDX-License-Identifier: GPL-3.0-or-later.\n   ROM images and third-party demo programs in WOLF80_ASSETS are not covered by this license. */\n(() => {\n'use strict';\n${parts.join('\n')}\n})();\n`;
}

function assets(withSources) {
  const roms = {};
  for (const [id, r] of Object.entries(ROMS)) {
    const data = fs.readFileSync(rel(r.file));
    if (sha256(data) !== r.sha256) throw new Error(`${r.file}: unexpected SHA-256`);
    roms[id] = data.toString('base64');
  }
  const catalog = JSON.parse(read('programs/catalog.json'));
  // The assembler sources of the demo programs are not embedded by default (471 kB of 834 kB, read by
  // nothing but the assembler at load time): an 'asm' entry goes in as its Intel HEX, format 'ihex',
  // and the build fails when that HEX is stale. --with-sources adds the gzipped source of each as
  // `source`. The maintainer's decision and its background: CLAUDE.md (Demo programs), programs/README.md.
  const programs = embedPrograms(catalog, { withSources });
  return `globalThis.WOLF80_ASSETS = ${JSON.stringify({ roms, programs })};\n`;
}

// Version from git: the last vX.Y.Z tag plus commits since, e.g. 0.1.0+3-g1a2b3c4; before the
// first release 0.0.0+<commits>-g<hash>. "-dirty" marks uncommitted changes.
function version() {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const dirty = git('status', '--porcelain') ? '-dirty' : '';
    let tag = '';
    try { tag = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*'); } catch { /* no release yet */ }
    const base = tag ? tag.slice(1) : '0.0.0';
    const count = git('rev-list', '--count', tag ? `${tag}..HEAD` : 'HEAD');
    const hash = git('rev-parse', '--short', 'HEAD');
    return (count === '0' ? base : `${base}+${count}-g${hash}`) + dirty;
  } catch {
    return 'unknown';
  }
}

const ver = version();
// the full GPL text travels inside the page, shown under "About the emulator" (app.js fills #licGplText)
const licenseBlock = `<script type="text/plain" id="licenseGpl">\n${read('LICENSE').replace(/<\//g, '<\\/')}</script>`;
const html = read('src/ui/index.html')
  .replace('<!--LICENSE-->', () => licenseBlock)
  .replace(/\{\{VERSION\}\}/g, ver);
const css = read('src/ui/style.css');
const js = bundle();
const withSources = process.argv.includes('--with-sources');
const assetJs = assets(withSources);
const safe = s => s.replace(/<\/script/gi, '<\\/script');

fs.mkdirSync(rel('dist/web'), { recursive: true });
for (const f of fs.readdirSync(rel('dist/web'))) {
  if (!['index.html', 'style.css', 'wolf80.js', 'assets.js'].includes(f)) fs.rmSync(rel('dist/web', f), { recursive: true, force: true });
}
fs.writeFileSync(rel('dist/web/index.html'), html
  .replace('<!--STYLE-->', '<link rel="stylesheet" href="style.css">')
  .replace('<!--SCRIPT-->', '<script src="assets.js"></script>\n<script src="wolf80.js"></script>'));
fs.writeFileSync(rel('dist/web/style.css'), css);
fs.writeFileSync(rel('dist/web/wolf80.js'), js);
fs.writeFileSync(rel('dist/web/assets.js'), assetJs);

const single = html
  .replace('<!--STYLE-->', () => `<style>\n${css}</style>`)
  .replace('<!--SCRIPT-->', () => `<script>\n${safe(assetJs)}</script>\n<script>\n${safe(js)}</script>`);
fs.writeFileSync(rel('dist/Wolf80-offline.html'), single);
fs.writeFileSync(rel('dist/version.txt'), ver + '\n'); // for tools/build-desktop.mjs

console.log(`built ${ver}: dist/web (${(js.length / 1024).toFixed(1)} kB js), dist/Wolf80-offline.html (${(single.length / 1024).toFixed(1)} kB), program sources ${withSources ? 'included' : 'not included'}`);
