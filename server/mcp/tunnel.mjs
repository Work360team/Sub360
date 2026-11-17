// Cloudflare Quick Tunnel (cloudflared tunnel --url) — the "เปิดทางเข้าด้วย Cloudflare" button.
//
// No account needed, but the address (https://<random>.trycloudflare.com) changes every start and the
// tunnel stops when Sub360 closes, so it is never reopened by itself. People who want a fixed address
// run their own tunnel and use "ใช้ URL ของฉัน" instead (remote.mjs), which needs nothing from here.
import { spawn, spawnSync } from "node:child_process";

const QUICK_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const CONNECTED = /Registered tunnel connection|Connection [0-9a-f-]+ registered/i;
const MAX_RESTARTS = 5;

export function createTunnel({ log = console.error, onChange = () => {} } = {}) {
  let child = null;
  let want = null; // { binary, port }
  let state = { state: "off", url: null, error: null };
  let restarts = 0;
  let restartTimer = null;
  let tail = [];

  const set = (patch) => {
    state = { ...state, ...patch };
    try { onChange(state); } catch { /* a listener must not stop the tunnel */ }
  };

  function kill(proc) {
    if (!proc || proc.exitCode !== null) return;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { windowsHide: true });
    else proc.kill();
  }

  function launch() {
    if (!want) return;
    const { binary, port } = want;
    tail = [];
    set({ state: "starting", url: null, error: null });
    let proc;
    try {
      // --no-autoupdate: the copy Sub360 installed is pinned by SHA-256 and must not replace itself
      proc = spawn(binary, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      set({ state: "error", error: `เปิด cloudflared ไม่ได้: ${error.message}` });
      return;
    }
    child = proc;
    const onData = (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (!line.trim()) continue;
        tail.push(line.slice(0, 300));
        if (tail.length > 30) tail.shift();
        if (!state.url) {
          const m = QUICK_URL.exec(line);
          if (m) state = { ...state, url: m[0].toLowerCase() };
        }
        if (CONNECTED.test(line) && state.url && state.state !== "connected") {
          restarts = 0;
          set({ state: "connected", error: null });
        }
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("error", (error) => set({ state: "error", error: `เปิด cloudflared ไม่ได้: ${error.message}` }));
    proc.on("exit", (code) => {
      if (child !== proc) return; // replaced or stopped on purpose
      child = null;
      const reason = tail.filter((l) => /ERR|error|failed/i.test(l)).slice(-2).join(" · ") || `cloudflared หยุดทำงาน (code ${code})`;
      log(`[tunnel] exited ${code}: ${reason}`);
      if (want && restarts < MAX_RESTARTS) {
        restarts += 1;
        set({ state: "starting", url: null, error: `กำลังต่อใหม่ (${restarts}/${MAX_RESTARTS}) — ${reason}` });
        restartTimer = setTimeout(launch, Math.min(30_000, 2000 * 2 ** restarts));
      } else {
        set({ state: "error", url: null, error: reason });
      }
    });
  }

  return {
    status: () => ({ ...state }),
    /** start({ binary, port }) — restarts if already running (and so gets a new address) */
    start(options) {
      this.stop();
      want = options;
      restarts = 0;
      launch();
    },
    stop() {
      want = null;
      clearTimeout(restartTimer);
      const proc = child;
      child = null;
      kill(proc);
      if (state.state !== "off") set({ state: "off", url: null, error: null });
    },
    log: () => tail.slice(),
  };
}
