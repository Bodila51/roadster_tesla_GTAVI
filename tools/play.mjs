// Headless play-test: builds nothing, serves ./dist, drives the game, saves a screenshot.
// node tools/play.mjs --out shot.png [--dist dist] [--size 1280x720] [--wait 6000]
//   [--tp spawn|ramp|lineup|runway|donut|halfpipe|loop|massdriver] [--keys "KeyW:3000,KeyW+Space:800,wait:500"]
//   [--eval "js expression run in page before screenshot"] [--title] (stay on title screen) [--page index.html|viewer.html]
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const dist = path.resolve(args.dist || 'dist');
const [W, H] = (args.size || '1280x720').split('x').map(Number);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.json': 'application/json', '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(dist, u === '/' ? 'index.html' : u);
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
page.on('requestfailed', r => logs.push('requestfailed: ' + r.url()));
await page.goto(`http://127.0.0.1:${port}/${args.page || 'index.html'}`, { waitUntil: 'load', timeout: 180000 });
await page.waitForTimeout(Number(args.wait || 6000));
if ((args.page || 'index.html') === 'index.html' && !args.title) {
  await page.evaluate(() => window.__rd && window.__rd.startGame());
  await page.waitForTimeout(1200);
  if (args.tp) { await page.evaluate(t => window.__rd.teleport(t), args.tp); await page.waitForTimeout(800); }
  for (const step of String(args.keys || '').split(',').filter(Boolean)) {
    const [k, ms] = step.split(':'); const keys = k.split('+');
    if (k !== 'wait') for (const kk of keys) await page.keyboard.down(kk);
    await page.waitForTimeout(Number(ms || 500));
    if (k !== 'wait') for (const kk of keys) await page.keyboard.up(kk);
  }
}
if (args.eval) console.log('eval:', JSON.stringify(await page.evaluate(args.eval)));
const state = await page.evaluate(() => { const r = window.__rd; if (!r || !r.phys) return null; const p = r.phys.pos; return { pos: [p.x, p.y, p.z].map(v => +v.toFixed(2)), mode: r.phys.mode, fps: r.renderer && r.renderer.info ? r.renderer.info.render.calls + ' draw calls' : '' }; });
await page.screenshot({ path: args.out || 'shot.png' });
console.log('state:', JSON.stringify(state));
console.log(logs.length ? logs.slice(0, 20).join('\n') : 'no console errors');
await browser.close(); server.close();
