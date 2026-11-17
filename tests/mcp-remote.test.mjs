// Remote MCP gateway end to end, without a tunnel: OAuth 2.1 the way ChatGPT/Gemini/claude.ai do it,
// with the pairing code shown in the Sub360 window (here: the window's local API) and typed on the page
// the AI app opened. Plus the Clip360-style rules: master switch, internet access modes, connections
// retired when their address stops leading here, and watch links.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-remote-"));
const GW_PORT = 5100 + Math.floor(Math.random() * 300);
const GW = `http://127.0.0.1:${GW_PORT}`;
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
let app; // main server (the window's API)

const appApi = async (method, p, body) => {
  const res = await fetch(`${app}/api${p}`, {
    method,
    headers: { "x-sub360": "1", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};
const form = (data) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(data).toString(),
});
const mcpCall = (token, body) => fetch(`${GW}/mcp`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify(body),
});
const toolCall = async (token, name, args) => (await (await mcpCall(token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })).json()).result;
const tokenCall = (data) => fetch(`${GW}/oauth/token`, form(data));

async function register(name = "ChatGPT", redirect = REDIRECT) {
  const res = await fetch(`${GW}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: name, redirect_uris: [redirect], token_endpoint_auth_method: "none" }),
  });
  assert.equal(res.status, 201);
  return (await res.json()).client_id;
}

/** Opens the consent page like the user's browser would; returns what the page sends back. */
async function consent(clientId, state = "s".repeat(1700), redirect = REDIRECT) {
  const verifier = randomBytes(40).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(`${GW}/oauth/authorize`);
  for (const [k, v] of Object.entries({
    response_type: "code", client_id: clientId, redirect_uri: redirect, code_challenge: challenge,
    code_challenge_method: "S256", state, scope: "sub360", resource: `${GW}/mcp`,
  })) url.searchParams.set(k, v);
  const res = await fetch(url);
  assert.equal(res.status, 200);
  const html = await res.text();
  const fields = JSON.parse(/const f=(\{.*?\});/s.exec(html)[1]);
  return { verifier, state, fields, html, csp: res.headers.get("content-security-policy") };
}

/** What the consent page's script posts when the person types a code (or cancels). */
async function submit(c, extra) {
  const res = await fetch(`${GW}/oauth/authorize/pair`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...c.fields, ...extra }),
  });
  return { status: res.status, body: await res.json() };
}

async function startPairing() {
  const { status, body } = await appApi("POST", "/mcp/pairing");
  assert.equal(status, 200, JSON.stringify(body));
  return body.pairing.open.code;
}

async function connect(name = "claude.ai") {
  const clientId = await register(name);
  const c = await consent(clientId);
  const ok = await submit(c, { code: await startPairing() });
  const back = new URL(ok.body.redirect);
  const tokens = await (await tokenCall({
    grant_type: "authorization_code", code: back.searchParams.get("code"), redirect_uri: REDIRECT, client_id: clientId, code_verifier: c.verifier,
  })).json();
  return { clientId, c, back, tokens };
}

/** Raw request with a chosen Host header (fetch does not allow setting it). */
function rawGet(p, headers) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: GW_PORT, path: p, headers }, (res) => { res.resume(); resolve(res.statusCode); }).on("error", reject);
  });
}

/** Calls a gateway object directly with a fake request (for cases a real server cannot set up). */
function direct(gw, { method = "GET", url, headers = {}, body = "" }) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), { method, url, headers });
  return new Promise((resolve) => {
    gw.handle(req, {
      statusCode: 0, headersSent: false,
      writeHead(status) { this.statusCode = status; this.headersSent = true; },
      setHeader() {},
      end(data) { resolve({ status: this.statusCode, body: data ? String(data) : "" }); },
    });
  });
}

test.before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, "server", "index.mjs")], {
    env: {
      ...process.env, SUB360_HOME: HOME, SUB360_NO_OPEN: "1", SUB360_PORT: String(4900 + Math.floor(Math.random() * 150)),
      SUB360_MCP_GATEWAY_PORT: String(GW_PORT), SUB360_MCP_PUBLIC_URL: GW,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.resume();
  server.stderr.resume();
  const file = path.join(HOME, "mcp-runtime.json");
  for (let i = 0; i < 100 && !fs.existsSync(file); i += 1) await sleep(100);
  app = JSON.parse(fs.readFileSync(file, "utf8")).url;
});

test.after(() => {
  server?.kill();
  fs.rmSync(HOME, { recursive: true, force: true });
});

test("ปิดเป็นค่าเริ่มต้น: ไม่มีทางเข้าจากอินเทอร์เน็ตจนกว่าผู้ใช้เปิดสวิตช์และเลือกทางเข้า", async () => {
  const { body } = await appApi("GET", "/mcp");
  assert.equal(body.enabled, false);
  assert.equal(body.remote.mode, "off");
  await assert.rejects(fetch(`${GW}/mcp`));
  assert.equal((await appApi("PUT", "/mcp/remote", { mode: "quick" })).status, 409, "ต้องเปิดสวิตช์หลักก่อน");
  assert.equal((await appApi("POST", "/mcp/pairing")).status, 409);
  await appApi("POST", "/mcp/enabled", { enabled: true });
  await assert.rejects(fetch(`${GW}/mcp`), "เปิดสวิตช์หลักอย่างเดียวยังไม่เปิดทางเข้า");
  const on = await appApi("PUT", "/mcp/remote", { mode: "quick" });
  assert.equal(on.body.remote.mode, "quick");
  assert.equal(on.body.remote.publicMcpUrl, `${GW}/mcp`);
});

test("ไม่มีโทเค็น → 401 ทุก method พร้อม resource_metadata (Gemini ลอง GET/HEAD ก่อน)", async () => {
  for (const method of ["POST", "GET", "HEAD", "DELETE"]) {
    const res = await fetch(`${GW}/mcp`, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined });
    assert.equal(res.status, 401, method);
    assert.match(res.headers.get("www-authenticate"), /resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource\/mcp"/);
  }
  const bad = await mcpCall("nope", { jsonrpc: "2.0", id: 1, method: "ping" });
  assert.equal(bad.status, 401);
  assert.match(bad.headers.get("www-authenticate"), /invalid_token/);
});

test("metadata ครบ · gateway ไม่เปิด /api · ตอบเฉพาะชื่อโฮสต์สาธารณะ (กัน DNS rebinding)", async () => {
  const pr = await (await fetch(`${GW}/.well-known/oauth-protected-resource/mcp`)).json();
  assert.equal(pr.resource, `${GW}/mcp`);
  for (const p of ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration", "/.well-known/openid-configuration/mcp", "/mcp/.well-known/openid-configuration"]) {
    const as = await (await fetch(`${GW}${p}`)).json();
    assert.equal(as.issuer, GW, p);
    assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  }
  for (const p of ["/api/status", "/api/projects", "/index.html", "/app.js"]) {
    assert.equal((await fetch(`${GW}${p}`)).status, 404, p);
  }
  assert.equal(await rawGet("/.well-known/oauth-protected-resource", { host: "evil.example" }), 421);
  assert.equal(await rawGet("/.well-known/oauth-protected-resource", { host: `127.0.0.1:${GW_PORT}` }), 200);
});

test("tunnel ที่เปลี่ยน Host เป็น 127.0.0.1 ใช้ได้เฉพาะเมื่อบอก X-Forwarded-Host ที่ตรงกับที่อยู่สาธารณะ", async () => {
  const { createGateway } = await import("../server/mcp/gateway.mjs");
  const { createAccessStore } = await import("../server/mcp/access.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-host-"));
  try {
    const gw = createGateway({ store: createAccessStore(dir), mcp: null, publicUrl: () => "https://sub360.example.com" });
    const p = "/.well-known/oauth-protected-resource";
    assert.equal((await direct(gw, { url: p, headers: { host: "sub360.example.com" } })).status, 200);
    assert.equal((await direct(gw, { url: p, headers: { host: "127.0.0.1:4370", "x-forwarded-host": "sub360.example.com" } })).status, 200);
    assert.equal((await direct(gw, { url: p, headers: { host: "127.0.0.1:4370" } })).status, 421);
    assert.equal((await direct(gw, { url: p, headers: { host: "127.0.0.1:4370", "x-forwarded-host": "evil.example" } })).status, 421);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ลงทะเบียน: รับเฉพาะ https หรือ localhost · id แปลก ๆ ไม่ทำให้พัง", async () => {
  const bad = await fetch(`${GW}/oauth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "x", redirect_uris: ["http://evil.example/cb"] }),
  });
  assert.equal(bad.status, 400);
  assert.ok(await register());
  for (const id of ["__proto__", "toString", "constructor"]) {
    const res = await fetch(`${GW}/oauth/authorize?client_id=${id}&response_type=code`);
    assert.equal(res.status, 400, id);
  }
  assert.equal((await appApi("DELETE", "/mcp/connections/__proto__")).status, 200);
  assert.equal(({}).revokedAt, undefined, "ไม่มี prototype pollution");
});

test("แอป AI เปิดหน้าขอเชื่อมต่อ → รหัสขึ้นในหน้าต่าง Sub360 เอง (ไม่อยู่ในหน้าเว็บ) แล้วพิมพ์ต่อได้เลย", async () => {
  const clientId = await register("Claude");
  const c = await consent(clientId, "st", REDIRECT);
  assert.match(c.csp, /form-action 'none'/);
  const { body: p } = await appApi("GET", "/mcp/pairing");
  assert.ok(p.open, "เปิดรอบจับคู่ให้เอง");
  assert.equal(p.open.auto, true);
  assert.deepEqual(p.open.requesters.map((x) => [x.clientName, x.redirectHost]), [["Claude", "chatgpt.com"]]);
  assert.ok(!c.html.includes(p.open.code), "รหัสต้องไม่อยู่ในหน้าเว็บที่ใครก็เปิดได้");
  await consent(clientId);
  assert.equal((await appApi("GET", "/mcp/pairing")).body.open.code, p.open.code, "รีเฟรชหน้าไม่เปลี่ยนรหัส");
  const ok = await submit(c, { code: p.open.code });
  assert.ok(ok.body.redirect, JSON.stringify(ok.body));
  assert.equal((await appApi("GET", "/mcp/pairing")).body.open, null, "ใช้แล้วปิด");
});

test("พิมพ์รหัสผิดเกิน 10 ครั้ง → หยุดเปิดรหัสอัตโนมัติชั่วคราว ปุ่มในแอปยังใช้ได้", async () => {
  const clientId = await register("Guesser");
  const c = await consent(clientId);
  const { code } = (await appApi("GET", "/mcp/pairing")).body.open;
  const wrong = code === "999999" ? "999998" : "999999";
  let last;
  for (let i = 0; i < 10; i += 1) last = await submit(c, { code: wrong });
  assert.match(last.body.error, /หลายครั้งเกินไป/);
  await consent(clientId);
  const locked = (await appApi("GET", "/mcp/pairing")).body;
  assert.equal(locked.open, null, "เปิดหน้าใหม่ก็ไม่ได้รหัสใหม่");
  assert.ok(locked.autoLockedUntil > Date.now());
  assert.equal((await submit(c, { code })).status, 409);
  const manual = await startPairing();
  assert.ok((await submit(c, { code: manual })).body.redirect, "คนกดเริ่มเองในแอปได้เสมอ");
  assert.equal((await appApi("GET", "/mcp/pairing")).body.autoLockedUntil, null);
});

test("OAuth ครบวงจร: รหัส → โทเค็น → tools → refresh → ยกเลิกในแอป · การเชื่อมจำที่อยู่ที่ใช้เชื่อม", async () => {
  const clientId = await register("ChatGPT");
  const c = await consent(clientId);
  const code = await startPairing();
  const wrong = await submit(c, { code: code === "000000" ? "111111" : "000000" });
  assert.equal(wrong.status, 403);
  assert.match(wrong.body.error, /ลองได้อีก 9 ครั้ง/);

  const ok = await submit(c, { code });
  const back = new URL(ok.body.redirect);
  assert.equal(back.origin + back.pathname, REDIRECT);
  assert.equal(back.searchParams.get("state").length, 1700, "state ยาวแบบ Gemini กลับไปครบ");
  assert.equal(back.searchParams.get("iss"), GW);
  assert.equal((await appApi("GET", "/mcp")).body.pairing.lastConnected.clientName, "ChatGPT");

  const authCode = back.searchParams.get("code");
  assert.equal((await tokenCall({ grant_type: "authorization_code", code: authCode, redirect_uri: REDIRECT, client_id: clientId, code_verifier: "x".repeat(43) })).status, 400);
  const tokens = await (await tokenCall({ grant_type: "authorization_code", code: authCode, redirect_uri: REDIRECT, client_id: clientId, code_verifier: c.verifier })).json();
  assert.equal(tokens.token_type, "Bearer");
  const conn = (await appApi("GET", "/mcp")).body.connections.find((x) => x.clientName === "ChatGPT");
  assert.equal(conn.issuer, GW, "จำที่อยู่ที่ใช้เชื่อมไว้ เผื่อที่อยู่เปลี่ยน");

  const list = await toolCall(tokens.access_token, "list_projects", {});
  assert.equal(list.isError, false);
  // แอปบนคลาวด์นำเข้าไฟล์จากเครื่องไม่ได้ และไม่รู้ด้วยซ้ำว่าไฟล์มีอยู่ไหม
  for (const file_path of [path.join(HOME, "missing.mp4"), "\\\\attacker\\share\\a.mp4"]) {
    const res = await toolCall(tokens.access_token, "create_project_from_file", { file_path });
    assert.match(res.content[0].text, /ลากวิดีโอเข้าไป/);
  }
  const batch = await (await mcpCall(tokens.access_token, Array.from({ length: 21 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" })))).json();
  assert.equal(batch.error.code, -32600, "batch ใหญ่เกินถูกปฏิเสธ");

  // สวิตช์หลักปิด → แอปบนคลาวด์ก็ทำอะไรไม่ได้ (tunnel หยุดด้วย)
  const refreshed = await (await tokenCall({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId })).json();
  assert.ok(refreshed.access_token && refreshed.refresh_token !== tokens.refresh_token);
  await appApi("DELETE", `/mcp/connections/${conn.id}`);
  assert.equal((await mcpCall(refreshed.access_token, { jsonrpc: "2.0", id: 5, method: "ping" })).status, 401);
  assert.equal((await tokenCall({ grant_type: "refresh_token", refresh_token: refreshed.refresh_token, client_id: clientId })).status, 400);
});

test("ลิงก์ดูคลิปผ่านอินเทอร์เน็ต: หน้าดู + วิดีโอเลื่อนได้ · ลิงก์ปลอม/ยกเลิกแล้วเปิดไม่ได้ · ดูได้อย่างเดียวหยุดการสร้างลิงก์", async () => {
  const id = "fakeproj01";
  const dir = path.join(HOME, "data", "projects", id);
  fs.mkdirSync(path.join(dir, "out"), { recursive: true });
  const video = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251));
  fs.writeFileSync(path.join(dir, "out", "final.mp4"), video);
  const now = Date.now();
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({
    id, title: "คลิปทดสอบ", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), status: "rendered",
    settings: { style: "karaoke-pop", colorSet: null, anchor: null, fontScale: 1, language: "th" },
    source: { file: "source.mp4", name: "x.mp4", size: 10 }, meta: { durationMs: 4000, width: 320, height: 240, hasAudio: true },
    timeline: { chunks: [{ id: "c1", text: "ทดสอบ", startMs: 0, endMs: 1000, words: [] }] }, job: null, editedAt: now - 5000,
    result: { files: { mp4: "final.mp4" }, at: now, warnings: [] },
  }));

  const { tokens } = await connect("Links");
  const link = (await toolCall(tokens.access_token, "get_video_link", { id })).structuredContent;
  assert.equal(link.reachable_from, "anywhere");
  assert.ok(link.watch_url.startsWith(`${GW}/v/`));
  const page = await fetch(link.watch_url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /คลิปทดสอบ/);
  const full = await fetch(link.video_url);
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), video);
  const part = await fetch(link.video_url, { headers: { range: "bytes=100-199" } });
  assert.equal(part.status, 206);
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), video.subarray(100, 200));
  assert.equal((await fetch(`${GW}/v/${"A".repeat(32)}`)).status, 404, "ลิงก์ที่ไม่ได้สร้างเปิดไม่ได้");
  assert.equal(await rawGet(new URL(link.watch_url).pathname, { host: "evil.example" }), 421);

  await appApi("DELETE", "/mcp/video-links");
  assert.equal((await fetch(link.watch_url)).status, 404, "ยกเลิกลิงก์ทั้งหมดแล้วเปิดไม่ได้");

  await appApi("POST", "/mcp/write", { enabled: false });
  assert.match((await toolCall(tokens.access_token, "get_video_link", { id })).content[0].text, /ดูข้อมูลได้อย่างเดียว/);
  await appApi("POST", "/mcp/write", { enabled: true });
});

test("refresh เก่าถูกใช้หลังพ้นช่วงผ่อนผัน = มีคนอื่นถือสำเนา → ยกเลิกการเชื่อมนั้น", async () => {
  const { createAccessStore } = await import("../server/mcp/access.mjs");
  const { createGateway } = await import("../server/mcp/gateway.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-reuse-"));
  try {
    const store = createAccessStore(dir);
    store.addGrant("g1", { clientId: "c1", clientName: "x", redirectHost: "x", issuer: "http://gw.test" });
    const hash = createHash("sha256").update("old-refresh").digest("hex");
    store.addTokens([[hash, { grantId: "g1", clientId: "c1", kind: "refresh", expiresAt: Date.now() + 86_400_000, rotatedAt: Date.now() - 5 * 60_000 }]]);
    const gw = createGateway({ store, mcp: null, publicUrl: () => "http://gw.test" });
    const res = await direct(gw, {
      method: "POST", url: "/oauth/token", headers: { host: "gw.test", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "old-refresh" }).toString(),
    });
    assert.equal(res.status, 400);
    assert.match(JSON.parse(res.body).error_description, /cancelled/);
    assert.ok(store.grant("g1").revokedAt, "การเชื่อมถูกยกเลิก");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ที่อยู่เปลี่ยน/เปิดแอปใหม่ → การเชื่อมของที่อยู่ที่ใช้ไม่ได้แล้วถูกยกเลิกพร้อมแถบแจ้ง · URL ของฉันไม่ถูกยกเลิก", async () => {
  const { createRemote, normalizePublicUrl } = await import("../server/mcp/remote.mjs");
  const { createAccessStore } = await import("../server/mcp/access.mjs");
  assert.equal(normalizePublicUrl("https://Sub360.Example.com/mcp"), "https://sub360.example.com");
  for (const bad of ["http://sub360.example.com", "https://localhost", "https://192.168.1.5", "ftp://x.y", "nonsense"]) {
    assert.equal(normalizePublicUrl(bad), null, bad);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-retire-"));
  const saved = { port: process.env.SUB360_MCP_GATEWAY_PORT, url: process.env.SUB360_MCP_PUBLIC_URL };
  process.env.SUB360_MCP_GATEWAY_PORT = String(5600 + Math.floor(Math.random() * 200));
  delete process.env.SUB360_MCP_PUBLIC_URL;
  try {
    // เตรียมข้อมูลเหมือนแอปที่เคยเปิดปุ่ม Cloudflare ไว้: การเชื่อม 2 แบบ + 1 แบบรุ่นเก่าที่ไม่มีที่อยู่
    const seed = createAccessStore(dir);
    seed.setEnabled(true);
    seed.setRemote({ mode: "quick", lastPublicOrigin: "https://old-quick.trycloudflare.com" });
    seed.addClient("c1", { name: "ChatGPT", redirectUris: [REDIRECT] });
    seed.addClient("c2", { name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] });
    seed.addClient("c3", { name: "Gemini", redirectUris: ["https://oauth-redirect.googleusercontent.com/r/x"] });
    seed.addGrant("quick", { clientId: "c1", clientName: "ChatGPT", redirectHost: "chatgpt.com", issuer: "https://old-quick.trycloudflare.com" });
    seed.addGrant("legacy", { clientId: "c3", clientName: "Gemini", redirectHost: "oauth-redirect.googleusercontent.com" });
    seed.addGrant("mine", { clientId: "c2", clientName: "Claude", redirectHost: "claude.ai", issuer: "https://sub360.example.com" });
    seed.setRemote({ customUrl: "https://sub360.example.com" });

    const remote = createRemote({ home: dir, findCloudflared: async () => ({ ready: false }) });
    await remote.start();
    let st = remote.status();
    assert.equal(st.remote.mode, "off", "ปุ่ม Cloudflare ไม่เปิดเองตอนเปิดแอป");
    assert.deepEqual(st.connections.map((c) => c.clientName), ["Claude"], "เหลือเฉพาะการเชื่อมผ่าน URL ของฉัน");
    assert.equal(st.remote.notice.reason, "restart");
    assert.deepEqual(st.remote.notice.apps.sort(), ["ChatGPT", "Gemini"]);
    assert.match(st.remote.notice.oldUrl, /old-quick/);

    // เปลี่ยนไปใช้ URL ของฉันที่อยู่ใหม่: การเชื่อมของที่อยู่เดิม (ที่ไม่ใช่ที่อยู่คงที่ปัจจุบัน) ถูกยกเลิก
    remote.dismissNotice();
    await remote.setRemote("custom", "https://new.example.org/");
    st = remote.status();
    assert.equal(st.remote.publicMcpUrl, "https://new.example.org/mcp");
    assert.equal(st.connections.length, 0);
    assert.equal(st.remote.notice.reason, "changed");
    await assert.rejects(remote.setRemote("custom", "http://insecure.example.org"), /https/);
    await remote.stop();
  } finally {
    if (saved.port === undefined) delete process.env.SUB360_MCP_GATEWAY_PORT; else process.env.SUB360_MCP_GATEWAY_PORT = saved.port;
    if (saved.url !== undefined) process.env.SUB360_MCP_PUBLIC_URL = saved.url;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ไฟล์ของ v0.5.x (mcp-remote.json) ย้ายมาเป็น mcp-access.json โดยไม่เสียการเชื่อม", async () => {
  const { createAccessStore } = await import("../server/mcp/access.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-migrate-"));
  try {
    fs.writeFileSync(path.join(dir, "mcp-remote.json"), JSON.stringify({
      settings: { enabled: true, mode: "named", hostname: "sub360.example.com" },
      clients: { c1: { name: "ChatGPT", redirectUris: [REDIRECT], createdAt: Date.now() } },
      grants: { g1: { clientId: "c1", clientName: "ChatGPT", redirectHost: "chatgpt.com", createdAt: Date.now(), revokedAt: null } },
      tokens: {},
    }));
    const store = createAccessStore(dir);
    assert.equal(store.enabled, true, "เคยใช้หน้าแอป AI แล้ว จึงเปิดไว้เหมือนเดิม");
    assert.equal(store.remote.mode, "custom");
    assert.equal(store.remote.customUrl, "https://sub360.example.com");
    assert.equal(store.activeGrants().length, 1);
    assert.ok(fs.existsSync(path.join(dir, "mcp-access.json")));
    assert.ok(!fs.existsSync(path.join(dir, "mcp-remote.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ผู้ใช้กดยกเลิกในหน้าขออนุญาต → แอป AI ได้ access_denied", async () => {
  const clientId = await register("Gemini");
  const c = await consent(clientId, "abc");
  const r = await submit(c, { cancel: true });
  assert.equal(new URL(r.body.redirect).searchParams.get("error"), "access_denied");
  assert.equal(new URL(r.body.redirect).searchParams.get("state"), "abc");
});

test("ปลายทางที่ไม่รู้จัก → หน้าขออนุญาตเตือน", async () => {
  const { knownApp } = await import("../server/mcp/gateway.mjs");
  assert.equal(knownApp("https://claude.ai/api/mcp/auth_callback"), "Claude");
  assert.equal(knownApp("https://oauth-redirect.googleusercontent.com/r/abc"), "Gemini");
  assert.equal(knownApp("https://claude.ai.evil.example/cb"), null);
  const clientId = await register("Something", "https://evil.example/cb");
  const c = await consent(clientId, "s", "https://evil.example/cb");
  assert.match(c.html, /ไม่ใช่แอป AI ที่ Sub360 รู้จัก/);
});

test("code ใช้ซ้ำ = รั่ว → ยกเลิกการเชื่อมนั้นทั้งหมด", async () => {
  const { clientId, c, back, tokens } = await connect("claude.ai");
  assert.ok(tokens.access_token);
  const again = await tokenCall({ grant_type: "authorization_code", code: back.searchParams.get("code"), redirect_uri: REDIRECT, client_id: clientId, code_verifier: c.verifier });
  assert.equal(again.status, 400);
  assert.equal((await mcpCall(tokens.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status, 401);
});

test("ปิดทางเข้า → gateway หยุดฟังทันที · ปิดสวิตช์หลัก → แอปบนเครื่องก็ทำอะไรไม่ได้", async () => {
  await startPairing();
  const off = await appApi("PUT", "/mcp/remote", { mode: "off" });
  assert.equal(off.body.remote.publicMcpUrl, null);
  assert.equal(off.body.pairing.open, null);
  await assert.rejects(fetch(`${GW}/.well-known/oauth-protected-resource`));
  const disabled = await appApi("POST", "/mcp/enabled", { enabled: false });
  assert.equal(disabled.body.enabled, false);
});
