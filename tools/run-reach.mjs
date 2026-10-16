// 2-MIN RUN checks, one browser at a time, no rendering.
// 1. Reachability: for each letter, tools/sim.mjs starts a run, teleports to the nearest
//    teleport and drives or flies there; the letter must be collected.
// 2. Layout: the run strip must not overlap other HUD panels, and the results panel must
//    fit, at 1280x720 and phone sizes (touch emulated, and plain keyboard windows).
// node tools/run-reach.mjs [--dist dist] [--only R1,O,...] [--no-layout] [--no-reach]
import { execFileSync } from "child_process";
import http from "http";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const args = process.argv.slice(2),
  opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null),
  dist = path.resolve(opt("--dist") || "dist"),
  only = opt("--only") ? opt("--only").split(",") : null;
const RUN = "js:__rd.startRun()";
// [id, letter index, nearest teleport, steps after the teleport]
const REACH = [
  ["R1", 0, "ramp", "700:KeyW,60:"], // ride the wall to the top edge
  ["O", 1, "loop", "480:KeyW,60:"], // drive the loop
  ["A", 2, "lineup", "205:KeyW,36:KeyW+Space,150:"], // hop over the lineup, lift held
  ["D", 3, "massdriver", "250:KeyW,640:"], // the default Mass Driver shot
  ["S", 4, "halfpipe", "130:KeyW,40:KeyW+KeyD,200:KeyW"], // vertical air off the far coping
  ["T", 5, "donut", "83:KeyW+KeyA,27:KeyW,30:KeyW+Space,120:KeyW"], // left out of the donut, hop through ring 5
  ["E", 6, "massdriver", "150:KeyW,800:"], // short shot (coast onto the rail), roll through the centre
  ["R2", 7, "lineup", "178:KeyW,6:KeyW+Space,150:"], // low hop that skims the Cybertruck roof
];
let fail = 0;
if (!args.includes("--no-reach"))
  for (const [id, i, tp, steps] of REACH) {
    if (only && !only.includes(id)) continue;
    const script = `${RUN},tp:${tp},${steps}`,
      ev = `(()=>{const r=__rd.run,it=r.items[${i}],l=r.log.find(x=>x.index===${i});return {got:it.got,t:l?l.t:null,near:+it.near.toFixed(2),where:it.where,pos:[it.pos.x,it.pos.y,it.pos.z].map(v=>+v.toFixed(2))}})()`;
    let res = null;
    try {
      const out = execFileSync("node", ["tools/sim.mjs", "--dist", dist, "--script", script, "--quiet", "--eval", ev], { encoding: "utf8", timeout: 240000 });
      const m = out.match(/^eval: (.*)$/m);
      res = m && JSON.parse(m[1]);
    } catch (e) {
      res = { error: String(e.message).slice(0, 120) };
    }
    const ok = res && res.got;
    ok || fail++;
    console.log(`${ok ? "PASS" : "FAIL"} ${id.padEnd(2)} ${res && res.where ? res.where.padEnd(26) : ""} tp:${tp.padEnd(10)} ${ok ? `collected at run t=${res.t}s` : `closest ${res && res.near} m`}  [${steps}]${res && res.error ? " " + res.error : ""}`);
  }

if (!args.includes("--no-layout")) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".json": "application/json", ".glb": "model/gltf-binary", ".webp": "image/webp" };
  const server = http
    .createServer((req, res) => {
      const u = decodeURIComponent(req.url.split("?")[0]),
        f = path.join(dist, u === "/" ? "index.html" : u);
      if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404), res.end();
      res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }), fs.createReadStream(f).pipe(res);
    })
    .listen(0);
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const sizes = [["1280x720", !1], ["844x390", !0], ["390x844", !0], ["844x390", !1], ["390x844", !1]];
  for (const [size, touch] of sizes) {
    const [width, height] = size.split("x").map(Number),
      ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch }),
      page = await ctx.newPage();
    await page.addInitScript(() => {
      let now = 0;
      performance.now = () => now;
      const cbs = [];
      window.requestAnimationFrame = (cb) => (cbs.push(cb), cbs.length);
      window.__step = (n) => {
        for (let i = 0; i < n; i++) {
          now += 1000 / 60;
          for (const cb of cbs.splice(0)) cb(now);
        }
      };
    });
    await page.goto(url, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => window.__rd && window.__step, null, { timeout: 120000 });
    await page.evaluate(() => {
      const r = window.__rd, n = () => {};
      r.composer && (r.composer.render = n), r.renderer && (r.renderer.render = n);
      window.__step(20), r.startRun(), window.__step(30);
      const h = r.game.hud;
      h.toast("MISSION COMPLETE", "Fly over all five vehicles in one jump, close to the roofs", !0);
      h.toast("TELEPORT", "LINEUP");
      r.game.callTrick("DOUBLE KICKFLIP", 1600), window.__step(5);
    });
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
    await page.waitForTimeout(400); // resize observers and fonts settle on real frames
    const rep = await page.evaluate(() => {
      const vis = (e) => {
          const s = getComputedStyle(e), b = e.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05 ? b : null;
        },
        run = vis(document.getElementById("run")),
        sel = "#scorebox,#missions,#toasts .toast,#center .combo,#trick-feed > *,#dash,#hints,#dev,#touch .t-top,#touch .t-btns,#touch .t-stick,.rd-combo,#launch,#flash,#drift,#minimap",
        hits = [];
      for (const e of document.querySelectorAll(sel)) {
        const b = vis(e);
        if (!b || !run) continue;
        const ix = Math.min(b.right, run.right) - Math.max(b.left, run.left), iy = Math.min(b.bottom, run.bottom) - Math.max(b.top, run.top);
        ix > 0.5 && iy > 0.5 && hits.push(`${e.id || e.className.split(" ")[0]} ${Math.round(ix)}x${Math.round(iy)}`);
      }
      const inView = run && run.left >= 0 && run.top >= 0 && run.right <= innerWidth && run.bottom <= innerHeight;
      return { run: run && [run.left, run.top, run.width, run.height].map(Math.round), hits, inView };
    });
    // results panel: end the run now
    const res = await page.evaluate(() => {
      const r = window.__rd;
      (r.run.left = 0.001), window.__step(400); // the combo banks, then the results open
      const box = document.querySelector("#results .r-box"), b = box && box.getBoundingClientRect(),
        btns = [...document.querySelectorAll("#results .ui-btn")].map((x) => Math.round(x.getBoundingClientRect().height));
      return { open: !document.getElementById("results").hidden, fits: !!b && b.top >= 0 && b.bottom <= innerHeight && b.right <= innerWidth && box.scrollHeight <= box.clientHeight + 1, btns };
    });
    const ok = rep.run && rep.inView && !rep.hits.length && res.open && res.fits && res.btns.every((h) => h >= 44);
    ok || fail++;
    console.log(`${ok ? "PASS" : "FAIL"} layout ${size} ${touch ? "touch" : "keys "} strip ${JSON.stringify(rep.run)} overlaps [${rep.hits.join(", ")}] results open ${res.open} fits ${res.fits} buttons ${res.btns.join("/")}`);
    await ctx.close();
  }
  await browser.close(), server.close();
}
console.log(fail ? `${fail} check(s) failed` : "all run checks passed");
process.exit(fail ? 1 : 0);
