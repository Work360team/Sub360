// แอป AI บนคลาวด์ (ChatGPT, Gemini, claude.ai) — เปิด/ปิด gateway + Cloudflare Tunnel ตามที่ผู้ใช้ตั้งในแอป
//
// ปิดเป็นค่าเริ่มต้น · เปิดแล้ว gateway ฟังที่ 127.0.0.1 อีกพอร์ตหนึ่ง และ cloudflared ต่อพอร์ตนั้นออกเน็ต
// ปิดเมื่อไร ทั้งสองหยุดทันที (การเชื่อมที่อนุมัติไว้ยังอยู่ เปิดใหม่ด้วยที่อยู่เดิมก็ใช้ต่อได้)
import http from "node:http";
import path from "node:path";
import { createHash } from "node:crypto";
import { createGateway } from "./gateway.mjs";
import { createRemoteStore } from "./remote-store.mjs";
import { createTunnel } from "./tunnel.mjs";

export const DEFAULT_GATEWAY_PORT = 4370;
const HOSTNAME = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** "sub360.example.com" / "https://sub360.example.com/" → "https://sub360.example.com" */
export function normalizeHostname(raw) {
  const text = String(raw || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  return HOSTNAME.test(text) ? text : null;
}

/** รับทั้งโทเค็นเปล่า ๆ และคำสั่งเต็มที่คัดลอกมาจากหน้า Cloudflare (… service install eyJ…) */
export function extractTunnelToken(raw) {
  const m = /eyJ[A-Za-z0-9+/=_-]{40,4000}/.exec(String(raw || ""));
  return m ? m[0] : null;
}

/**
 * createRemote({ home, mcp, findCloudflared, getToken, log })
 *   findCloudflared()  → { ready, path, version }
 *   getToken()         → named-tunnel token from .env (or "")
 */
export function createRemote({ home, mcp, findCloudflared, getToken, log = console.error }) {
  const store = createRemoteStore(path.join(home, "mcp-remote.json"));
  const tunnel = createTunnel({ log });
  const fixedPort = Number(process.env.SUB360_MCP_GATEWAY_PORT || DEFAULT_GATEWAY_PORT);
  let listener = null;
  let port = null;
  let problem = null; // ข้อความที่ผู้ใช้ต้องแก้เอง (ยังไม่ติดตั้ง cloudflared, พอร์ตไม่ว่าง …)
  let signature = "";

  function publicUrl() {
    if (process.env.SUB360_MCP_PUBLIC_URL) return process.env.SUB360_MCP_PUBLIC_URL.replace(/\/+$/, "");
    const s = store.settings();
    if (!s.enabled || !port) return null;
    if (s.mode === "named") return s.hostname ? `https://${s.hostname}` : null;
    return tunnel.status().url;
  }

  // การเชื่อมใหม่เริ่มจากหน้าต่าง Sub360 เท่านั้น (gateway.startPairing) — คำขอจากเน็ตไม่ดึงหน้าต่างขึ้นมาเอง
  const gateway = createGateway({ store, mcp, publicUrl, log });

  function listen(at) {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => gateway.handle(req, res));
      srv.once("error", reject);
      srv.listen(at, "127.0.0.1", () => resolve(srv));
    });
  }

  async function ensureGateway(exactPort) {
    if (listener && (!exactPort || port === fixedPort)) return true;
    await closeGateway();
    // named tunnel: หน้า Cloudflare ชี้ไปที่พอร์ตนี้ จึงต้องได้พอร์ตนี้พอดี · quick: พอร์ตไหนก็ได้
    for (let at = fixedPort; at < fixedPort + (exactPort ? 1 : 20); at += 1) {
      try {
        listener = await listen(at);
        port = at;
        return true;
      } catch { /* พอร์ตไม่ว่าง */ }
    }
    problem = `พอร์ต ${fixedPort} ถูกโปรแกรมอื่นใช้อยู่ — ปิดโปรแกรมนั้น หรือตั้ง SUB360_MCP_GATEWAY_PORT ให้ตรงกับที่ตั้งไว้ใน Cloudflare`;
    return false;
  }

  function closeGateway() {
    return new Promise((resolve) => {
      if (!listener) return resolve();
      const srv = listener;
      listener = null;
      port = null;
      srv.close(() => resolve());
      srv.closeAllConnections?.();
    });
  }

  async function apply({ force = false } = {}) {
    const s = store.settings();
    const token = getToken() || "";
    const next = [s.enabled, s.mode, s.hostname, createHash("sha256").update(token).digest("hex")].join("|");
    const tunnelDown = ["off", "error"].includes(tunnel.status().state);
    if (!force && next === signature && !(s.enabled && tunnelDown)) return;
    signature = next;
    problem = null;
    if (!s.enabled) {
      gateway.cancelPairing();
      tunnel.stop();
      await closeGateway();
      return;
    }
    if (!(await ensureGateway(s.mode === "named"))) {
      tunnel.stop();
      return;
    }
    if (process.env.SUB360_MCP_PUBLIC_URL) return; // ทดสอบ/ใช้ตรงโดยไม่มี tunnel
    const cf = await findCloudflared();
    if (!cf.ready) {
      tunnel.stop();
      problem = "ยังไม่ได้ติดตั้ง cloudflared — กดติดตั้งในหน้านี้";
      return;
    }
    if (s.mode === "named") {
      if (!token || !s.hostname) {
        tunnel.stop();
        problem = "โหมดที่อยู่ถาวรต้องมีทั้งโทเค็น tunnel และชื่อโดเมน";
        return;
      }
      tunnel.start({ binary: cf.path, mode: "named", port, token, hostname: `https://${s.hostname}` });
    } else {
      tunnel.start({ binary: cf.path, mode: "quick", port });
    }
  }

  function status() {
    const s = store.settings();
    const t = tunnel.status();
    const url = publicUrl();
    return {
      enabled: Boolean(s.enabled),
      mode: s.mode,
      hostname: s.hostname || "",
      hasToken: Boolean(getToken()),
      gateway: { running: Boolean(listener), port },
      tunnel: { state: process.env.SUB360_MCP_PUBLIC_URL && listener ? "connected" : t.state, error: t.error },
      problem,
      mcpUrl: url && (t.state === "connected" || process.env.SUB360_MCP_PUBLIC_URL) ? `${url}/mcp` : null,
      connections: store.activeGrants().map((g) => ({
        id: g.id, clientName: g.clientName, redirectHost: g.redirectHost, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt,
      })),
      pairing: s.enabled ? gateway.pairingStatus() : { open: null, lastConnected: null },
    };
  }

  return {
    status,
    /** patch: { enabled?, mode? } (hostname/token ตรวจและบันทึกโดยผู้เรียก) */
    async update(patch) {
      store.setSettings(patch);
      await apply();
      return status();
    },
    restart: () => apply({ force: true }),
    start: () => apply({ force: true }),
    /** คนกด "เชื่อมแอป AI ใหม่" ในหน้าต่าง — เปิดรับรหัส 6 หลักครั้งเดียว 10 นาที */
    startPairing: () => (store.settings().enabled && listener ? gateway.startPairing() : null),
    cancelPairing: () => gateway.cancelPairing(),
    revoke: (id) => store.revokeGrant(id),
    revokeAll: () => store.revokeAll(),
    async stop() {
      tunnel.stop();
      await closeGateway();
    },
    stopSync: () => tunnel.stop(),
    /** สำหรับเทสต์: เรียก gateway ตรง ๆ */
    handle: (req, res) => gateway.handle(req, res),
    port: () => port,
  };
}
