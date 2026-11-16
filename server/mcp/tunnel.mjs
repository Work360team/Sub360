// Cloudflare Tunnel (cloudflared) — gives the remote MCP gateway a public https address.
//
//   quick  cloudflared tunnel --url http://127.0.0.1:<gateway>   no account; a new *.trycloudflare.com
//          address every start, so the AI app connection must be added again each time (for trying out)
//   named  cloudflared tunnel run   with TUNNEL_TOKEN from the Cloudflare dashboard; the public
//          hostname set there must point to http://localhost:<gateway> — the address never changes
import { spawn, spawnSync } from "node:child_process";

const QUICK_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const CONNECTED = /Registered tunnel connection|Connection [0-9a-f-]+ registered/i;
const MAX_RESTARTS = 5;

export function createTunnel({ log = console.error, onChange = () => {} } = {}) {
  let child = null;
  let want = null; // { binary, mode, port, token, hostname }
  let state = { state: "off", url: null, error: null, mode: null };
  let restarts = 0;
  let restartTimer = null;
  let tail = [];

  const set = (patch) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  function kill(proc) {
    if (!proc || proc.exitCode !== null) return;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { windowsHide: true });
    else proc.kill();
  }

  function launch() {
    if (!want) return;
    const { binary, mode, port, token, hostname } = want;
    const args = mode === "named"
      ? ["tunnel", "--no-autoupdate", "run"]
      : ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`];
    // The token goes through the environment, so it never shows up in the process list.
    const env = { ...process.env };
    if (mode === "named") env.TUNNEL_TOKEN = token;
    else delete env.TUNNEL_TOKEN;
    tail = [];
    set({ state: "starting", url: mode === "named" ? hostname : null, error: null, mode });
    let proc;
    try {
      proc = spawn(binary, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
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
        if (mode === "quick" && !state.url) {
          const m = QUICK_URL.exec(line);
          if (m) set({ url: m[0].toLowerCase() });
        }
        if (CONNECTED.test(line) && (mode === "named" || state.url)) {
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
        set({ state: "starting", error: `กำลังต่อใหม่ (${restarts}/${MAX_RESTARTS}) — ${reason}`, url: mode === "named" ? hostname : null });
        restartTimer = setTimeout(launch, Math.min(30_000, 2000 * 2 ** restarts));
      } else {
        set({ state: "error", error: reason, url: mode === "named" ? hostname : null });
      }
    });
  }

  return {
    status: () => ({ ...state }),
    /** start({ binary, mode: "quick"|"named", port, token, hostname }) — restarts if already running */
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
      set({ state: "off", url: null, error: null, mode: null });
    },
    log: () => tail.slice(),
  };
}
