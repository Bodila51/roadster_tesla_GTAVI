// Render gameplay scenarios through the real engine (OfflineAudioContext in headless Chromium).
// usage: node src/audio/tools/render_scenarios.mjs OUT_DIR [scenario,scenario...] [--raw] [--solo=motor,tyre,...]
// Writes OUT_DIR/<name>[-tag].wav (32-bit float), .events.json and .trace.json (compressor/limiter reduction per 0.1 s).
// --raw bypasses the master dynamics; --solo keeps only the named groups (see harness.html).
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const pos = args.filter((a) => !a.startsWith('--'));
const out = path.resolve(pos[0] || 'scenarios');
const only = (pos[1] || '').split(',').filter(Boolean);
const raw = flags.includes('--raw');
const soloF = flags.find((a) => a.startsWith('--solo='));
const solo = soloF ? soloF.slice(7).split(',').filter(Boolean) : null;
const tag = (raw ? '-raw' : '') + (solo ? '-' + solo.join('+') : '');
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.mp3': 'audio/mpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => logs.push('requestfailed: ' + r.url()));
await page.goto(`http://127.0.0.1:${port}/src/audio/tools/harness.html`);
await page.waitForFunction(() => window.harnessReady === true);
const names = only.length ? only : await page.evaluate(() => window.SCENARIOS);

function wav(pcmB64, sr) {
  // stereo IEEE float WAV
  const data = Buffer.from(pcmB64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

for (const name of names) {
  const t0 = Date.now();
  const r = await page.evaluate(([n, o]) => window.run(n, 48000, o), [name, { raw, solo }]);
  fs.writeFileSync(path.join(out, name + tag + '.wav'), wav(r.b64, r.sr));
  fs.writeFileSync(path.join(out, name + tag + '.events.json'), JSON.stringify(r.events));
  fs.writeFileSync(path.join(out, name + tag + '.trace.json'), JSON.stringify(r.trace));
  const tr = r.trace.filter((x) => x[0] > 1.2); // the reduction meters start from a bogus value and release over ~1 s
  const maxComp = Math.min(...tr.map((x) => x[1]));
  const maxLim = Math.min(...tr.map((x) => x[2]));
  const maxV = Math.max(...r.trace.map((x) => x[3]));
  console.log(`${name.padEnd(10)} peak ${(20 * Math.log10(r.peak + 1e-9)).toFixed(1)} dBFS  comp ${maxComp.toFixed(1)} dB  lim ${maxLim.toFixed(1)} dB  voices<=${maxV}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
console.log(logs.length ? logs.slice(0, 30).join('\n') : 'no console errors');
await browser.close();
server.close();
