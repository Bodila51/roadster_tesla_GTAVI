// Capture-mode hook. main.js imports this first; without ?capture in the URL it does nothing.
// With ?capture it freezes time before the game is built (seeded random, virtual clock, manual frames),
// keeps the player's saved progress out of the take, catches window.__rd and lazily loads the capture tools.
import { installCaptureEnv } from "./env.js";

const q = new URLSearchParams(location.search);
if (q.has("capture")) {
  const env = installCaptureEnv(window, { seed: 12345 });

  // Saved progress must not change a take: game keys live in memory for this page only (rdcap.* is ours).
  try {
    const P = Storage.prototype;
    const get = P.getItem;
    const set = P.setItem;
    const del = P.removeItem;
    const mem = new Map();
    const ours = (k) => String(k).startsWith("rdcap.");
    const def = (name, fn) =>
      Object.defineProperty(P, name, { configurable: true, writable: true, value: fn });
    def("getItem", function (k) {
      return ours(k) ? get.call(this, k) : mem.has(String(k)) ? mem.get(String(k)) : null;
    });
    def("setItem", function (k, v) {
      ours(k) ? set.call(this, k, v) : mem.set(String(k), String(v));
    });
    def("removeItem", function (k) {
      ours(k) ? del.call(this, k) : mem.delete(String(k));
    });
  } catch (e) {
    console.warn("[capture] storage sandbox failed", e);
  }

  // main.js publishes its debug handle as window.__rd; grab it the moment it is assigned.
  let rd = null;
  const waiting = [];
  Object.defineProperty(window, "__rd", {
    configurable: true,
    enumerable: true,
    get: () => rd,
    set: (v) => {
      rd = v;
      waiting.splice(0).forEach((f) => f(v));
    },
  });
  env.rdReady = new Promise((resolve) => (rd ? resolve(rd) : waiting.push(resolve)));

  import("./index.js")
    .then((m) => m.start(env, q))
    .catch((e) => {
      console.error("[capture] failed to start", e);
      window.__capError = String((e && e.stack) || e);
    });
}
