// Shared helpers for tools/capture.mjs: static server for dist/, browser launch, capture-env injection.
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".json": "application/json", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream",
  ".hdr": "application/octet-stream", ".exr": "application/octet-stream", ".ktx2": "image/ktx2", ".wasm": "application/wasm",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".woff2": "font/woff2",
};

// serve a built game folder on a free localhost port
export function serve(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    const f = path.join(root, u === "/" ? "index.html" : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

const CLOUD_SHELL = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

// gpu=false: software WebGL (SwiftShader), identical everywhere. gpu=true: the machine's GPU (much faster).
export async function launch({ gpu = false, browser = null, headed = false } = {}) {
  const args = ["--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"];
  if (!gpu) args.push("--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader");
  else args.push("--enable-gpu", "--enable-gpu-rasterization");
  const opts = { args, headless: !headed };
  if (browser) opts.executablePath = browser;
  else if (!gpu && fs.existsSync(CLOUD_SHELL)) opts.executablePath = CLOUD_SHELL;
  else if (gpu) opts.channel = "chromium"; // full Chromium, new headless mode, uses the GPU
  return chromium.launch(opts);
}

// the exact source of src/capture/env.js, installed before any page script runs
export function envScript(seed = 12345) {
  const src = fs.readFileSync(path.join(ROOT, "src/capture/env.js"), "utf8").replace(/^export\s*\{[^}]*\};?\s*$/m, "");
  return `${src}\ninstallCaptureEnv(window, { seed: ${Number(seed) | 0} });`;
}

export async function openGame(browser, { url, width, height, seed, mode = "", query = "" }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300));
  });
  await page.addInitScript({ content: envScript(seed) });
  const sep = url.includes("?") ? "&" : "?";
  await page.goto(`${url}${sep}capture${mode ? "=" + mode : ""}&desktop&cine&pr=1${query ? "&" + query : ""}`, { waitUntil: "load", timeout: 900000 });
  await waitReady(page);
  return { page, errors };
}

// a fresh copy of the same page (the capture env is installed again before the game's scripts)
export async function reloadGame(page) {
  await page.reload({ waitUntil: "load", timeout: 900000 });
  await waitReady(page);
}

async function waitReady(page) {
  await page.waitForFunction(() => (window.__cap && window.__cap.ready) || window.__capError, null, { timeout: 600000, polling: 250 });
  const err = await page.evaluate(() => window.__capError || null);
  if (err) throw new Error("capture mode failed to start: " + err);
  // let late assets (textures, sounds, a car model) finish before the take starts
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
}

export function fmtTime(s) {
  if (!Number.isFinite(s)) return "?";
  if (s < 90) return s.toFixed(1) + " s";
  const m = Math.floor(s / 60);
  return m < 90 ? `${m}m${String(Math.round(s % 60)).padStart(2, "0")}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}
