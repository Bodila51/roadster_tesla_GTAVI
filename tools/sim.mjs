// Deterministic, fast game simulation for testing physics, scoring and missions.
// Seeded Math.random, a virtual clock (exactly 1/60 s per frame), manual requestAnimationFrame,
// and by default no rendering at all (software WebGL is the slow part). Same inputs => same numbers.
//
// node tools/sim.mjs [--dist dist | --url http://...] [--script "STEPS"] [--every 20] [--render]
//                    [--size 960x540] [--shot out.png] [--out state.json] [--eval "js run at the end"] [--quiet]
// STEPS, comma separated:
//   120:KeyW+Space   hold these keys for 120 frames (keys are KeyboardEvent.code, joined with +)
//   60:              hold nothing for 60 frames
//   tp:lineup        teleport (spawn|ramp|lineup|runway|donut|halfpipe|loop|massdriver)
//   js:CODE          run CODE in the page (no commas inside; use ; and semicolons)
// Prints one line per record: frame, mode, pos, speed (mph), gas, score, missions done.
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
let url = args.url, server;
if (!url) {
  const dist = path.resolve(args.dist || 'dist');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.json': 'application/json', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm' };
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(dist, u === '/' ? 'index.html' : u);
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  url = `http://127.0.0.1:${server.address().port}/index.html`;
}
const [W, H] = (args.size || '960x540').split('x').map(Number);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
await page.addInitScript(() => {
  let s = 12345;
  Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let now = 0; const t0 = 1760000000000;
  performance.now = () => now; Date.now = () => t0 + now;
  const cbs = []; window.requestAnimationFrame = cb => { cbs.push(cb); return cbs.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, dt = 1000 / 60) => { for (let i = 0; i < n; i++) { now += dt; const list = cbs.splice(0); for (const cb of list) cb(now); } };
  window.__key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
});
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__rd && window.__step, null, { timeout: 120000 });
if (!args.render) await page.evaluate(() => { const r = window.__rd; const noop = () => {}; if (r.composer) r.composer.render = noop; if (r.renderer) r.renderer.render = noop; });
await page.evaluate(() => window.__step(30));
await page.evaluate(() => window.__rd.startGame());
const every = Number(args.every || 20);
const snap = f => page.evaluate(f => {
  const r = window.__rd, p = r.phys, g = r.game, n = v => +(+v).toFixed(4);
  const sp = p.vel ? Math.hypot(p.vel.x, p.vel.y, p.vel.z) * 2.236936 : 0;
  return { f, mode: p.mode, pos: [p.pos.x, p.pos.y, p.pos.z].map(n), vel: p.vel ? [p.vel.x, p.vel.y, p.vel.z].map(n) : null,
    quat: p.quat ? [p.quat.x, p.quat.y, p.quat.z, p.quat.w].map(n) : null, mph: n(sp), gas: n(p.gas), score: g.score,
    done: g.done ? [...g.done].join(' ') : '', cam: [r.camera.position.x, r.camera.position.y, r.camera.position.z].map(n) };
}, f);
const rec = []; let frame = 0; const held = new Set();
const steps = String(args.script || '60:,120:KeyW,40:KeyW+Space,90:').split(',').filter(Boolean);
for (const st of steps) {
  const i = st.indexOf(':'); const head = st.slice(0, i), rest = st.slice(i + 1);
  if (head === 'tp') { await page.evaluate(t => window.__rd.teleport(t), rest); continue; }
  if (head === 'js') { await page.evaluate(c => (0, eval)(c), rest); continue; }
  const n = Number(head), keys = rest ? rest.split('+') : [];
  for (const k of [...held]) if (!keys.includes(k)) { await page.evaluate(k => window.__key(k, false), k); held.delete(k); }
  for (const k of keys) if (!held.has(k)) { await page.evaluate(k => window.__key(k, true), k); held.add(k); }
  for (let j = 0; j < n; j += every) { const m = Math.min(every, n - j); await page.evaluate(m => window.__step(m), m); frame += m; rec.push(await snap(frame)); }
}
if (args.eval) console.log('eval:', JSON.stringify(await page.evaluate(c => (0, eval)(c), args.eval)));
if (args.shot) { await page.evaluate(() => { const r = window.__rd; delete r.composer.render; delete r.renderer.render; }); await page.evaluate(() => window.__step(1)); await page.screenshot({ path: args.shot }); }
if (!args.quiet) for (const r of rec) console.log(`${String(r.f).padStart(5)} ${String(r.mode).padEnd(7)} pos ${r.pos.map(v => v.toFixed(1)).join(' ')}  ${r.mph.toFixed(1)} mph  gas ${(+r.gas).toFixed(1)}  score ${r.score}  done [${r.done}]`);
if (args.out) fs.writeFileSync(args.out, JSON.stringify({ rec, errs }));
console.log(`frames ${frame}, records ${rec.length}, errors ${errs.length}${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await browser.close(); if (server) server.close();
