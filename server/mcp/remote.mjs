// การเชื่อมต่อ AI ทั้งหมดของ Sub360 — สวิตช์หลัก, ดูได้อย่างเดียว, ทางเข้าจากอินเทอร์เน็ต, กิจกรรม, ลิงก์ดูคลิป
// (หลักการเดียวกับ Clip360 v0.5.13–v0.5.18 · รายละเอียด docs/MCP_PLAN.md)
//
//   ปิดเป็นค่าเริ่มต้น: ปิดแล้วไม่มีแอป AI ใดทำอะไรได้ และทางเข้าจากอินเทอร์เน็ตหยุดทันที
//   ทางเข้าจากอินเทอร์เน็ต 2 แบบ:
//     quick   ปุ่ม Cloudflare — ไม่ต้องสมัคร แต่ที่อยู่สุ่มใหม่ทุกครั้ง จึงไม่เปิดเองตอนเปิดแอป
//     custom  URL ของฉัน — tunnel ของผู้ใช้เอง (เช่น Cloudflare Tunnel ที่ผูกโดเมน) ชี้มาที่ gateway ที่อยู่ไม่เปลี่ยน
//   การเชื่อมที่ผูกกับที่อยู่ที่ใช้ไม่ได้แล้ว ถูกยกเลิกให้เอง พร้อมแถบแจ้งในหน้าตั้งค่า
import http from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { createAccessStore } from "./access.mjs";
import { createGateway } from "./gateway.mjs";
import { createTunnel } from "./tunnel.mjs";
import { createVideoLinks } from "./video-links.mjs";
import { ToolError } from "./protocol.mjs";

export const DEFAULT_GATEWAY_PORT = 4370;
const LINK_TTL_MS = 7 * 86_400_000;

/** ที่อยู่ https สาธารณะของ tunnel → origin ("https://host") หรือ null ถ้าไม่ใช่ที่อยู่ที่ใช้ได้ */
export function normalizePublicUrl(raw) {
  let url;
  try { url = new URL(String(raw || "").trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || /^[\d.]+$/.test(host) || host.includes(":") || !host.includes(".")) return null;
  return `https://${url.host.toLowerCase()}`;
}

/** callback ของแอปบนคลาวด์ที่ grant รุ่นเก่า (ก่อนจำที่อยู่) น่าจะมาจาก quick tunnel */
const hostedApp = (uri) => /^https:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai|claude\.com|[^/]*\.googleusercontent\.com|gemini\.google\.com)\//i.test(String(uri));

const TOOL_LABELS = {
  create_project_from_file: "สร้างโปรเจกต์จากไฟล์",
  update_project_settings: "เปลี่ยนการตั้งค่าโปรเจกต์",
  edit_subtitles: "แก้ซับ",
  import_subtitles: "นำเข้าไฟล์ซับ",
  regroup_subtitles: "แบ่งท่อนซับใหม่",
  transcribe_video: "ถอดเสียง",
  refine_subtitles_with_ai: "ให้ Gemini แก้คำ",
  translate_subtitles: "แปลซับ",
  render_video: "เรนเดอร์วิดีโอ",
  cancel_job: "ยกเลิกงาน",
  get_video_link: "สร้างลิงก์ดูคลิป",
};

/**
 * createRemote({ home, mcp, findCloudflared, files, notify, log })
 *   findCloudflared()        → { ready, path, version }
 *   files.resolve(id, kind)  → { path, name } ของไฟล์ผลลัพธ์ หรือ null
 *   notify(event)            แอป AI รอรหัสจับคู่ → แจ้งเตือน (ไม่สลับหน้าเอง กันงานที่ทำค้างหาย)
 *   localBase()              "http://127.0.0.1:<port>" ของหน้าต่าง Sub360 (ลิงก์ดูคลิปบนเครื่องนี้)
 */
export function createRemote({ home, findCloudflared, files = null, notify = () => {}, localBase = () => null, log = console.error }) {
  const access = createAccessStore(home);
  const tunnel = createTunnel({ log, onChange: (state) => {
    if (state.state === "connected" && access.remote.mode === "quick" && state.url) activateOrigin(state.url);
  } });
  const fixedPort = Number(process.env.SUB360_MCP_GATEWAY_PORT || DEFAULT_GATEWAY_PORT);
  const videoLinks = createVideoLinks({ access, files });
  let mcp = null; // ตั้งทีหลังด้วย attachMcp (server สร้าง MCP หลังจากนี้)
  let listener = null;
  let port = null;
  let problem = null; // สิ่งที่ผู้ใช้ต้องแก้เอง (ยังไม่ได้ติดตั้ง cloudflared, พอร์ตไม่ว่าง …)

  /** ที่อยู่สาธารณะที่ใช้ได้ตอนนี้ หรือ null */
  function publicOrigin() {
    if (!access.enabled || !listener) return null;
    if (process.env.SUB360_MCP_PUBLIC_URL) return process.env.SUB360_MCP_PUBLIC_URL.replace(/\/+$/, "");
    const remote = access.remote;
    if (remote.mode === "custom") return normalizePublicUrl(remote.customUrl);
    if (remote.mode === "quick") {
      const t = tunnel.status();
      return t.state === "connected" && t.url ? normalizePublicUrl(t.url) : null;
    }
    return null;
  }

  /* ---------- การเชื่อมที่ใช้ไม่ได้แล้ว ---------- */

  /** ที่อยู่ที่ยังพามาที่นี่ได้หลังเปิดแอปใหม่: URL ของผู้ใช้ (แม้ปิดอยู่ชั่วคราว) */
  function keptOrigins(extra = null) {
    const kept = new Set();
    const custom = normalizePublicUrl(access.remote.customUrl);
    if (custom) kept.add(custom);
    if (extra) kept.add(extra);
    return kept;
  }

  /** ยกเลิกการเชื่อมที่ทำผ่านที่อยู่ที่ไม่อยู่ใน keep · การเชื่อมรุ่นเก่าที่ไม่มีที่อยู่ นับเป็นของ quick tunnel ถ้า legacyHosted */
  function retireExcept(keep, { legacyHosted = false } = {}) {
    return access.retireGrants((grant, client) => {
      if (grant.issuer) return !keep.has(grant.issuer);
      return legacyHosted && Boolean(client?.redirectUris?.some(hostedApp));
    });
  }

  function noteAddressChange({ oldOrigin, newOrigin = null, apps, reason }) {
    if (!oldOrigin && !apps.length) return;
    access.setRemote({ notice: { reason, oldUrl: oldOrigin ? `${oldOrigin}/mcp` : null, newUrl: newOrigin ? `${newOrigin}/mcp` : null, apps, at: Date.now() } });
  }

  /** ทางเข้าเปิดได้ที่ origin ใหม่: การเชื่อมของที่อยู่ก่อนหน้า (ถ้าไม่ใช่ที่อยู่คงที่) ใช้ไม่ได้แล้ว */
  function activateOrigin(raw) {
    const origin = normalizePublicUrl(raw);
    if (!origin) return;
    const previous = access.remote.lastPublicOrigin;
    const keep = keptOrigins(origin);
    if (previous && previous !== origin && !keep.has(previous)) {
      const apps = retireExcept(keep);
      noteAddressChange({ oldOrigin: previous, newOrigin: origin, apps, reason: "changed" });
    }
    if (previous !== origin) access.setRemote({ lastPublicOrigin: origin });
  }

  /* ---------- gateway ---------- */

  const gateway = createGateway({
    store: access,
    mcp: { handle: (msg, session) => mcp.handle(msg, session) },
    publicUrl: publicOrigin,
    videoLinks,
    onPairing: (status) => {
      const open = status.open;
      const asking = open?.requesters?.[open.requesters.length - 1];
      notify({ type: "pairing", code: open?.code, app: asking?.clientName || "แอป AI", host: asking?.redirectHost || "" });
    },
    log,
  });

  function listen(at) {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => gateway.handle(req, res));
      srv.once("error", reject);
      srv.listen(at, "127.0.0.1", () => resolve(srv));
    });
  }

  async function ensureGateway(exact) {
    if (listener && (!exact || port === fixedPort)) return true;
    await closeGateway();
    // URL ของฉัน: tunnel ของผู้ใช้ชี้มาที่พอร์ตนี้ จึงต้องได้พอร์ตนี้พอดี · ปุ่ม Cloudflare: พอร์ตไหนก็ได้
    for (let at = fixedPort; at < fixedPort + (exact ? 1 : 20); at += 1) {
      try {
        listener = await listen(at);
        port = at;
        return true;
      } catch { /* พอร์ตไม่ว่าง */ }
    }
    problem = `พอร์ต ${fixedPort} ถูกโปรแกรมอื่นใช้อยู่ — ปิดโปรแกรมนั้น หรือตั้ง SUB360_MCP_GATEWAY_PORT ใน .env ให้ตรงกับที่ tunnel ของคุณชี้มา`;
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

  /** ทำให้ gateway/tunnel ตรงกับค่าที่ตั้งไว้ */
  async function apply() {
    problem = null;
    const mode = access.remote.mode;
    if (!access.enabled || mode === "off") {
      gateway.cancelPairing();
      tunnel.stop();
      await closeGateway();
      return;
    }
    if (!(await ensureGateway(mode === "custom"))) {
      tunnel.stop();
      return;
    }
    if (mode === "custom" || process.env.SUB360_MCP_PUBLIC_URL) {
      tunnel.stop();
      return;
    }
    if (["starting", "connected"].includes(tunnel.status().state)) return;
    const cf = await findCloudflared();
    if (!cf.ready) {
      problem = "ยังไม่ได้ติดตั้ง cloudflared — กดติดตั้งในหน้านี้ (ครั้งแรกครั้งเดียว)";
      return;
    }
    tunnel.start({ binary: cf.path, port });
  }

  /* ---------- สิ่งที่หน้าตั้งค่าและ MCP ใช้ ---------- */

  function status() {
    const t = tunnel.status();
    const origin = publicOrigin();
    const remote = access.remote;
    return {
      enabled: access.enabled,
      writeEnabled: access.writeEnabled,
      remote: {
        mode: remote.mode,
        customUrl: remote.customUrl,
        gatewayPort: port || fixedPort,
        tunnel: { state: process.env.SUB360_MCP_PUBLIC_URL && listener ? "connected" : t.state, error: t.error },
        problem,
        publicMcpUrl: origin ? `${origin}/mcp` : null,
        notice: remote.notice || null,
      },
      pairing: access.enabled && listener ? gateway.pairingStatus() : { open: null, lastConnected: null, autoLockedUntil: null },
      connections: access.activeGrants().map((g) => ({
        id: g.id, clientName: g.clientName, redirectHost: g.redirectHost, issuer: g.issuer || null, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt,
      })),
      videoLinks: access.videoLinkCount(),
      activity: access.activity(),
    };
  }

  /** ด่านของทุก tool: ปิดอยู่ → ไม่มีอะไรทำได้ · ดูได้อย่างเดียว → tool ที่เปลี่ยนอะไรถูกปฏิเสธ */
  function gate(tool) {
    if (!access.enabled) {
      return new ToolError("การเชื่อมต่อ AI ของ Sub360 ปิดอยู่ — ให้ผู้ใช้เปิดที่ Sub360 → ตั้งค่า → เชื่อมแอป AI แล้วสั่งใหม่", { status: 403 });
    }
    if (tool.kind !== "read" && !access.writeEnabled) {
      return new ToolError("ตอนนี้ Sub360 ตั้งให้แอป AI ดูข้อมูลได้อย่างเดียว — ถ้าจะให้สร้างหรือแก้ไข ให้ผู้ใช้ปิดตัวเลือก \"ดูได้อย่างเดียว\" ใน Sub360 → ตั้งค่า → เชื่อมแอป AI", { status: 403 });
    }
    return null;
  }

  /** บันทึกสิ่งที่แอป AI เปลี่ยน (ไม่บันทึกการอ่าน — wait_for_job ถามถี่ ทำให้รายการไม่มีประโยชน์) */
  function recordCall({ tool, ok, session, args, result }) {
    if (tool.kind === "read") return;
    const grantId = String(session.client || "").startsWith("grant:") ? session.client.slice(6) : null;
    const app = grantId ? access.grant(grantId)?.clientName || "แอป AI" : "แอปบนเครื่องนี้";
    const label = TOOL_LABELS[tool.name] || tool.name;
    const waiting = result?.status === "needs_confirmation";
    access.addActivity({ tool: tool.name, ok, app, summary: `${waiting ? "ขอยืนยัน: " : ""}${label}${args?.id ? ` (${args.id})` : ""}` });
  }

  /** ลิงก์ดูคลิปที่แอป AI ส่งให้ผู้ใช้ — ผ่านอินเทอร์เน็ตถ้าทางเข้าเปิดอยู่ ไม่งั้นเปิดได้บนเครื่องนี้ */
  function createVideoLink(projectId) {
    const token = randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + LINK_TTL_MS;
    access.addVideoLink(createHash("sha256").update(token).digest("hex"), { projectId, expiresAt });
    const origin = publicOrigin();
    const base = origin || localBase();
    return {
      watch_url: `${base}/v/${token}`,
      video_url: `${base}/v/${token}/video.mp4`,
      download_url: `${base}/v/${token}/video.mp4?download=1`,
      expires_at: new Date(expiresAt).toISOString(),
      reachable_from: origin ? "anywhere" : "this_computer_only",
    };
  }

  return {
    access,
    attachMcp(instance) { mcp = instance; },
    status,
    gate,
    recordCall,
    createVideoLink,
    /** หน้าดูคลิปบนเครื่องนี้ (พอร์ตหลัก) ใช้ตัวเดียวกับที่ผ่าน tunnel */
    serveVideoLink: (req, res, url) => videoLinks.serve(req, res, url),

    async setEnabled(on) {
      access.setEnabled(on);
      await apply();
    },
    setWriteEnabled: (on) => access.setWriteEnabled(on),
    /** mode: off | quick | custom (+ url) */
    async setRemote(mode, url) {
      if (mode === "custom") {
        const origin = normalizePublicUrl(url);
        if (!origin) throw new ToolError("ใส่ที่อยู่ https ของ tunnel เช่น https://sub360.example.com (ไม่ใช่ localhost หรือ IP ในวงแลน)", { status: 400 });
        const previousCustom = normalizePublicUrl(access.remote.customUrl);
        access.setRemote({ mode: "custom", customUrl: origin });
        // เปลี่ยน URL ของฉันเป็นที่อยู่ใหม่: การเชื่อมผ่านที่อยู่เดิมใช้ไม่ได้แล้ว
        if (previousCustom && previousCustom !== origin) {
          const apps = retireExcept(keptOrigins(origin));
          noteAddressChange({ oldOrigin: previousCustom, newOrigin: origin, apps, reason: "changed" });
        }
        await apply();
        activateOrigin(origin);
        return;
      }
      if (!["off", "quick"].includes(mode)) throw new ToolError("เลือก quick, custom หรือ off", { status: 400 });
      access.setRemote({ mode });
      if (mode === "quick") tunnel.stop(); // เริ่มใหม่ให้ได้ที่อยู่ปัจจุบัน
      await apply();
    },
    retry: () => { tunnel.stop(); return apply(); },
    dismissNotice: () => access.setRemote({ notice: null }),

    startPairing: () => (access.enabled && listener ? gateway.startPairing() : null),
    cancelPairing: () => gateway.cancelPairing(),
    pairingStatus: () => (access.enabled && listener ? gateway.pairingStatus() : { open: null, lastConnected: null, autoLockedUntil: null }),
    revoke: (id) => access.revokeGrant(id),
    revokeAll: () => access.revokeAll(),
    clearVideoLinks: () => access.clearVideoLinks(),

    /**
     * ตอนเปิดแอป: การเชื่อมผ่านที่อยู่ที่ไม่ใช่ URL ของผู้ใช้ใช้ไม่ได้แล้ว (quick tunnel เดิม) → ยกเลิกและแจ้ง
     * และ quick tunnel ไม่เปิดเอง เพราะที่อยู่จะเปลี่ยนอยู่ดี
     */
    async start() {
      const remote = access.remote;
      const keep = keptOrigins();
      const apps = retireExcept(keep, { legacyHosted: remote.mode !== "custom" });
      const lost = remote.lastPublicOrigin && !keep.has(remote.lastPublicOrigin) ? remote.lastPublicOrigin : null;
      if (lost || apps.length) noteAddressChange({ oldOrigin: lost, apps, reason: "restart" });
      if (lost) access.setRemote({ lastPublicOrigin: null });
      if (remote.mode === "quick" && !process.env.SUB360_MCP_PUBLIC_URL) access.setRemote({ mode: "off" });
      await apply();
    },
    async stop() {
      tunnel.stop();
      await closeGateway();
    },
    stopSync: () => tunnel.stop(),
    port: () => port,
  };
}
