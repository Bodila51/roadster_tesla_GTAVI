// Cinematic capture: render a shot file from the game, frame by frame, to a PNG sequence and an H.264 MP4.
// Every frame is computed on a virtual clock, so the result is identical and perfectly smooth on any machine,
// however slow (the cloud's software WebGL included). Build the game first: npm run build.
//
//   node tools/capture.mjs shots/launch-low.json                 render the shot (size, fps, blur from the file)
//   node tools/capture.mjs shots/x.json --size 1080x1920 --fps 60 --blur 8 --shutter 0.5 --crf 14
//   node tools/capture.mjs shots/x.json --scale 0.5 --blur 0     quick low-res draft
//   node tools/capture.mjs shots/x.json --frames 30-45           part of a shot (no MP4 unless --mp4)
//   node tools/capture.mjs shots/x.json --still 1.5              one PNG at shot time 1.5 s (--still 0: the exact first frame)
//   node tools/capture.mjs shots/x.json --stills 0,1.2,2.5       several PNGs from one page load
//   node tools/capture.mjs shots/x.json --probe 0.1 --until 6    no rendering: print the car's path and events
//   node tools/capture.mjs shots/x.json --gpu                    use this machine's GPU (Mac) instead of SwiftShader
// Other options: --out DIR (default capture-out/<name>), --aa N (jitter samples when blur is off),
//   --shadows frame (shadow maps once per frame: faster blur in software WebGL),
//   --dur S, --in T|EVENT (override the shot's in-point), --query "tod=golden" (extra game URL parameters,
//   added to the shot's "query"), --dist DIR | --url URL (e.g. a vite dev server),
//   --browser PATH, --headed, --keep (keep old frames), --mp4 / --no-mp4, --preset slow, --timing, --seed N.
// An in-point anchored on an event ("in": "launch-0.1") is found by simulating the take once; the page then
// reloads and renders from a clean start, so the shot begins on that exact tick.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { parseAnchor } from "../src/capture/timeline.js";
import { ROOT, fmtTime, launch, openGame, reloadGame, serve } from "./capture/lib.mjs";

const argv = process.argv.slice(2);
const args = { _: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v !== undefined && !v.startsWith("--")) {
      args[k] = v;
      i++;
    } else args[k] = true;
  } else args._.push(a);
}
if (!args._[0]) {
  console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
  process.exit(1);
}

// ---------------------------------------------------------------- shot file
const shotPath = path.resolve(args._[0]);
const shot = JSON.parse(fs.readFileSync(shotPath, "utf8"));
shot.name = shot.name || path.basename(shotPath, ".json");
if (typeof shot.take === "string") {
  const tp = path.resolve(path.dirname(shotPath), shot.take);
  shot.take = JSON.parse(fs.readFileSync(tp, "utf8"));
}
const num = (v) => (v === undefined || v === true ? undefined : Number(v));
if (args.size) shot.size = String(args.size).split("x").map(Number);
shot.size = shot.size || [1920, 1080];
if (args.scale) shot.size = shot.size.map((v) => Math.round((v * Number(args.scale)) / 2) * 2);
shot.size = shot.size.map((v) => Math.max(2, Math.round(v / 2) * 2)); // yuv420p wants even sizes
if (num(args.fps)) shot.fps = num(args.fps);
if (num(args.dur)) shot.duration = num(args.dur);
if (args.blur !== undefined) shot.blur = { ...(typeof shot.blur === "object" ? shot.blur : {}), samples: num(args.blur) || 0 };
if (args.shutter !== undefined) shot.blur = { samples: 8, ...(typeof shot.blur === "object" ? shot.blur : { samples: shot.blur || 0 }), shutter: num(args.shutter) };
if (args.aa !== undefined) shot.aa = num(args.aa);
if (args.shadows !== undefined) shot.shadows = String(args.shadows);
if (args.dof === "off") delete shot.dof;
if (args.in !== undefined && args.in !== true) shot.in = Number.isFinite(+args.in) ? +args.in : String(args.in);
let anchor = null;
try {
  anchor = parseAnchor(shot.in);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const toQuery = (q) => (!q ? "" : typeof q === "string" ? q.replace(/^[?&]+/, "") : new URLSearchParams(q).toString());
const query = [toQuery(shot.query), toQuery(args.query === true ? "" : args.query)].filter(Boolean).join("&");
const fps = shot.fps || 30;
const duration = shot.duration || 3;
const frameCount = Math.max(1, Math.round(duration * fps));

const outDir = path.resolve(args.out || path.join("capture-out", shot.name));
const framesDir = path.join(outDir, "frames");

// ---------------------------------------------------------------- browser
let url = args.url;
let server = null;
if (!url) {
  const dist = path.resolve(args.dist || path.join(ROOT, "dist"));
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    console.error(`no build in ${dist}: run npm run build first (or pass --url of a running dev server)`);
    process.exit(1);
  }
  const s = await serve(dist);
  server = s.server;
  url = `http://127.0.0.1:${s.port}/index.html`;
}
const [W, H] = shot.size;
const t0 = Date.now();
const browser = await launch({ gpu: !!args.gpu, browser: args.browser || null, headed: !!args.headed });
let exitCode = 0;
try {
  const { page, errors } = await openGame(browser, { url, width: W, height: H, seed: num(args.seed), query });
  const car = await page.evaluate(() => (window.__rd && window.__rd.car && window.__rd.car.source) || "built-in");
  console.log(`game loaded in ${fmtTime((Date.now() - t0) / 1000)} (${args.gpu ? "GPU" : "software WebGL"}, car: ${car}${query ? ", " + query : ""})`);

  if (args.probe) {
    const step = num(args.probe) || 0.1;
    const until = num(args.until) || (shot.in || 0) + duration + 1;
    const r = await page.evaluate(([take, step, until, a]) => window.__cap.probe(take, step, until, a), [shot.take || {}, step, until, shot.in ?? null]);
    console.log(`take at ${r.hz} Hz, ${r.rows.length} samples` + (r.checked ? `, replay drift vs recording: ${r.drift.toFixed(4)} m over ${r.checked} checks` : ""));
    if (r.anchor) console.log(r.anchor.error ? `in-point ${r.anchor.label}: not found before ${until} s` : `in-point ${r.anchor.label}: event at ${r.anchor.at.toFixed(4)} s, shot starts at game time ${r.anchor.in.toFixed(4)} s`);
    for (const w of r.warnings) console.log("warning: " + w);
    console.log("   t  mode     x       y       z     mph    alt   yaw   upY   gas");
    for (const row of r.rows)
      console.log(
        `${row.t.toFixed(2).padStart(5)} ${row.mode.padEnd(7)} ${row.pos.map((v) => v.toFixed(1).padStart(7)).join(" ")} ${row.mph.toFixed(0).padStart(5)} ${row.alt.toFixed(1).padStart(6)} ${row.yaw.toFixed(0).padStart(5)} ${row.upY.toFixed(2).padStart(5)} ${row.gas.toFixed(0).padStart(5)}`,
      );
    const ev = r.events.filter((e) => e.type !== "scrape" && e.type !== "collide" && e.type !== "mode");
    const tag = (e) => (e.value ? `:${e.value}` : "") + (e.surface ? `(${e.surface})` : "") + (e.axis ? `(${e.axis})` : "");
    console.log("events: " + (ev.length ? ev.map((e) => `${e.t.toFixed(2)} ${e.type}${tag(e)}`).join(", ") : "none"));
    if (errors.length) console.log("page errors:\n  " + errors.slice(0, 8).join("\n  "));
  } else {
    if (anchor) {
      const r = await page.evaluate(([take, a]) => window.__cap.resolve(take, a), [shot.take || {}, shot.in]);
      if (r.error) throw new Error(r.error);
      console.log(`in-point ${r.label}: ${r.type} at game time ${r.at.toFixed(4)} s, shot starts at ${r.in.toFixed(4)} s (reloading)`);
      shot.in = r.in;
      await reloadGame(page);
    }
    const info = await page.evaluate((s) => window.__cap.load(s), shot);
    for (const w of info.warnings || []) console.log("warning: " + w);
    let first = 0;
    let last = info.frames - 1;
    let stills = null; // [[frame, shot time], ...]
    if (args.frames) {
      const [a, b] = String(args.frames).split("-").map(Number);
      first = Math.max(0, a || 0);
      last = Math.min(info.frames - 1, Number.isFinite(b) ? b : first);
    }
    const stillArg = args.stills ?? args.still;
    if (stillArg !== undefined) {
      const ts = String(stillArg === true ? 0 : stillArg).split(",").map(Number).filter(Number.isFinite).sort((x, y) => x - y);
      stills = ts.map((t) => [Math.min(info.frames - 1, Math.max(0, Math.round(t * info.fps))), t]).filter((x, k, a) => k === 0 || x[0] !== a[k - 1][0]);
      first = stills[0][0];
      last = stills[stills.length - 1][0];
    }
    console.log(
      `${info.name}: ${W}x${H}, ${info.fps} fps, ${info.frames} frames (${info.duration} s), ` +
        `${info.samples} sample${info.samples > 1 ? "s" : ""}/frame${info.blur ? `, motion blur shutter ${info.blur.shutter}` : ""}, ` +
        `game time ${info.gameIn.toFixed(2)}-${info.gameOut.toFixed(2)} s, sim ${info.simHz} Hz, cameras ${info.rigs.join(" ")}`,
    );
    fs.mkdirSync(framesDir, { recursive: true });
    if (!args.keep && !stills && first === 0)
      for (const f of fs.readdirSync(framesDir)) if (/^\d{5}\.png$/.test(f)) fs.unlinkSync(path.join(framesDir, f));
    if (first > 0) await page.evaluate((i) => window.__cap.skipTo(i), first);
    const log = [];
    const times = [];
    const todo = stills || Array.from({ length: last - first + 1 }, (_, k) => [first + k, null]);
    for (const [i, still] of todo) {
      const a = Date.now();
      const r = await page.evaluate((i) => window.__cap.frame(i), i);
      const png = Buffer.from(r.png.slice(r.png.indexOf(",") + 1), "base64");
      delete r.png;
      const file = still !== null ? path.join(outDir, `${shot.name}-still-${still.toFixed(2)}.png`) : path.join(framesDir, String(i).padStart(5, "0") + ".png");
      fs.writeFileSync(file, png);
      const sec = (Date.now() - a) / 1000;
      times.push(sec);
      r.sec = +sec.toFixed(3);
      log.push(r);
      const done = times.length;
      const avg = times.reduce((x, y) => x + y, 0) / times.length;
      if (args.timing || done === 1 || done % 10 === 0 || i === last)
        console.log(
          `frame ${String(i).padStart(4)} / ${info.frames - 1}  ${sec.toFixed(2)} s  t ${r.t.toFixed(2)}  game ${r.game.toFixed(2)}  ${r.mode} ${r.mph.toFixed(0)} mph  ${r.rig}` +
            (i < last ? `  eta ${fmtTime(avg * (todo.length - done))}` : "") + (still !== null ? `  -> ${path.relative(process.cwd(), file)}` : ""),
        );
    }
    const avg = times.reduce((x, y) => x + y, 0) / times.length;
    const steady = times.length > 2 ? times.slice(1).reduce((x, y) => x + y, 0) / (times.length - 1) : avg;
    console.log(`rendered ${times.length} frame(s): ${avg.toFixed(2)} s/frame average, ${steady.toFixed(2)} s/frame after the first`);
    fs.writeFileSync(path.join(outDir, `${shot.name}.log.json`), JSON.stringify({ shot: { ...shot, take: shot.take ? "(inline)" : undefined }, info, secPerFrame: +steady.toFixed(3), frames: log }, null, 1));
    const wantMp4 = !stills && (args.mp4 || (!args["no-mp4"] && first === 0 && last === info.frames - 1));
    if (wantMp4) {
      const mp4 = path.join(outDir, `${shot.name}.mp4`);
      const crf = String(num(args.crf) || 16);
      execFileSync(
        "ffmpeg",
        [
          "-y", "-hide_banner", "-loglevel", "error",
          "-framerate", String(info.fps), "-start_number", String(first), "-i", path.join(framesDir, "%05d.png"),
          "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
          "-c:v", "libx264", "-preset", args.preset || "slow", "-crf", crf, "-profile:v", "high",
          "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
          "-movflags", "+faststart", "-r", String(info.fps), mp4,
        ],
        { stdio: "inherit" },
      );
      console.log(`wrote ${mp4} (${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB)`);
    }
    console.log(`frames in ${framesDir}`);
    if (errors.length) console.log("page errors:\n  " + errors.slice(0, 8).join("\n  "));
  }
} catch (e) {
  console.error(String((e && e.message) || e));
  exitCode = 1;
} finally {
  await browser.close();
  if (server) server.close();
}
console.log(`total ${fmtTime((Date.now() - t0) / 1000)}`);
process.exit(exitCode);
