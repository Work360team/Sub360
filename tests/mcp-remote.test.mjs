// Remote MCP gateway end to end, without a tunnel: OAuth 2.1 the way ChatGPT/Gemini/claude.ai do it,
// with the person starting the pairing in the Sub360 window (here: the window's local API) and typing
// the code on the page the AI app opened.
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
  const { status, body } = await appApi("POST", "/mcp/remote/pairing");
  assert.equal(status, 200);
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
function rawGet(p, host) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: GW_PORT, path: p, headers: { host } }, (res) => { res.resume(); resolve(res.statusCode); }).on("error", reject);
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

test("ปิดเป็นค่าเริ่มต้น: gateway ไม่ฟังจนกว่าผู้ใช้เปิดในแอป", async () => {
  const { body } = await appApi("GET", "/mcp/remote");
  assert.equal(body.enabled, false);
  await assert.rejects(fetch(`${GW}/mcp`));
  assert.equal((await appApi("POST", "/mcp/remote/pairing")).status, 409, "ยังเริ่มจับคู่ไม่ได้ตอนปิดอยู่");
  const on = await appApi("PUT", "/mcp/remote", { enabled: true, mode: "quick" });
  assert.equal(on.body.enabled, true);
  assert.equal(on.body.gateway.running, true);
  assert.equal(on.body.mcpUrl, `${GW}/mcp`);
  assert.equal(on.body.pairing.open, null);
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
  assert.equal(await rawGet("/.well-known/oauth-protected-resource", "evil.example"), 421);
  assert.equal(await rawGet("/.well-known/oauth-protected-resource", `127.0.0.1:${GW_PORT}`), 200);
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
  assert.equal((await appApi("DELETE", "/mcp/remote/connections/__proto__")).status, 200);
  assert.equal(({}).revokedAt, undefined, "ไม่มี prototype pollution");
});

test("ไม่ได้กดเริ่มใน Sub360 → หน้าขออนุญาตใช้ไม่ได้ ไม่มีอะไรรอให้ใครกด", async () => {
  const clientId = await register("ChatGPT");
  const c = await consent(clientId);
  assert.match(c.html, /ChatGPT/);
  assert.match(c.html, /chatgpt\.com/);
  assert.match(c.csp, /form-action 'none'/);
  assert.doesNotMatch(c.html, /ไม่ใช่แอป AI ที่ Sub360 รู้จัก/);
  const r = await submit(c, { code: "123456" });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /เชื่อมแอป AI ใหม่/);
  assert.equal((await appApi("GET", "/mcp/remote")).body.connections.length, 0);
});

test("OAuth ครบวงจร: กดเริ่มในแอป → พิมพ์รหัส → โทเค็น → tools → refresh → ยกเลิกในแอป", async () => {
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
  const after = (await appApi("GET", "/mcp/remote")).body;
  assert.equal(after.pairing.open, null, "รหัสใช้ได้ครั้งเดียว");
  assert.equal(after.pairing.lastConnected.clientName, "ChatGPT");
  assert.equal(after.connections.length, 0, "ยังไม่เป็นการเชื่อมจนกว่าแอปแลกโทเค็น");
  assert.equal((await submit(c, { code })).status, 409, "ใช้รหัสเดิมซ้ำไม่ได้");

  const authCode = back.searchParams.get("code");
  assert.equal((await tokenCall({ grant_type: "authorization_code", code: authCode, redirect_uri: REDIRECT, client_id: clientId, code_verifier: "x".repeat(43) })).status, 400);
  const tokens = await (await tokenCall({ grant_type: "authorization_code", code: authCode, redirect_uri: REDIRECT, client_id: clientId, code_verifier: c.verifier })).json();
  assert.equal(tokens.token_type, "Bearer");
  assert.ok(tokens.access_token && tokens.refresh_token);

  const init = await (await mcpCall(tokens.access_token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "chatgpt", version: "1" } } })).json();
  assert.equal(init.result.serverInfo.name, "sub360");
  const list = await (await mcpCall(tokens.access_token, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_projects", arguments: {} } })).json();
  assert.equal(list.result.isError, false);

  // แอปบนคลาวด์นำเข้าไฟล์จากเครื่องไม่ได้ และไม่รู้ด้วยซ้ำว่าไฟล์มีอยู่ไหม
  const fake = path.join(HOME, "clip.mp4");
  fs.writeFileSync(fake, "not really a video");
  for (const file_path of [fake, path.join(HOME, "missing.mp4"), "\\\\attacker\\share\\a.mp4"]) {
    const res = await (await mcpCall(tokens.access_token, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_project_from_file", arguments: { file_path } } })).json();
    assert.equal(res.result.isError, true);
    assert.match(res.result.content[0].text, /ลากวิดีโอเข้าไป/);
  }
  const batch = await (await mcpCall(tokens.access_token, Array.from({ length: 21 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" })))).json();
  assert.equal(batch.error.code, -32600, "batch ใหญ่เกินถูกปฏิเสธ");

  // refresh หมุนโทเค็น · ใช้ซ้ำในช่วงผ่อนผันไม่ยืดช่วงนั้น
  const refreshed = await (await tokenCall({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId })).json();
  assert.ok(refreshed.access_token && refreshed.refresh_token !== tokens.refresh_token);
  assert.equal((await mcpCall(refreshed.access_token, { jsonrpc: "2.0", id: 4, method: "ping" })).status, 200);
  const oldHash = createHash("sha256").update(tokens.refresh_token).digest("hex");
  const firstRotated = JSON.parse(fs.readFileSync(path.join(HOME, "mcp-remote.json"), "utf8")).tokens[oldHash].rotatedAt;
  assert.ok(firstRotated);
  await tokenCall({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId });
  assert.equal(JSON.parse(fs.readFileSync(path.join(HOME, "mcp-remote.json"), "utf8")).tokens[oldHash].rotatedAt, firstRotated);

  // ผู้ใช้ยกเลิกในแอป → ใช้ไม่ได้ทันที
  const conn = (await appApi("GET", "/mcp/remote")).body.connections.find((x) => x.clientName === "ChatGPT");
  assert.ok(conn.lastUsedAt);
  await appApi("DELETE", `/mcp/remote/connections/${conn.id}`);
  assert.equal((await mcpCall(refreshed.access_token, { jsonrpc: "2.0", id: 5, method: "ping" })).status, 401);
  assert.equal((await tokenCall({ grant_type: "refresh_token", refresh_token: refreshed.refresh_token, client_id: clientId })).status, 400);
});

test("refresh เก่าถูกใช้หลังพ้นช่วงผ่อนผัน = มีคนอื่นถือสำเนา → ยกเลิกการเชื่อมนั้น", async () => {
  // รอให้พ้น 60 วินาทีจริงไม่ได้ จึงเรียก gateway ตรง ๆ กับ token ที่หมุนไปแล้ว 5 นาที
  const { createRemoteStore } = await import("../server/mcp/remote-store.mjs");
  const { createGateway } = await import("../server/mcp/gateway.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-reuse-"));
  try {
    const store = createRemoteStore(path.join(dir, "r.json"));
    store.addGrant("g1", { clientId: "c1", clientName: "x", redirectHost: "x" });
    const hash = createHash("sha256").update("old-refresh").digest("hex");
    store.addTokens([[hash, { grantId: "g1", clientId: "c1", kind: "refresh", expiresAt: Date.now() + 86_400_000, rotatedAt: Date.now() - 5 * 60_000 }]]);
    const gw = createGateway({ store, mcp: null, publicUrl: () => "http://gw.test" });
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: "old-refresh" }).toString();
    const req = Object.assign(Readable.from([Buffer.from(body)]), {
      method: "POST", url: "/oauth/token", headers: { host: "gw.test", "content-type": "application/x-www-form-urlencoded" },
    });
    const res = await new Promise((resolve) => {
      gw.handle(req, {
        statusCode: 0,
        headersSent: false,
        writeHead(status) { this.statusCode = status; this.headersSent = true; },
        setHeader() {},
        end(data) { resolve({ status: this.statusCode, body: JSON.parse(data) }); },
      });
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error_description, /cancelled/);
    assert.ok(store.grant("g1").revokedAt, "การเชื่อมถูกยกเลิก");
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

test("รหัสผิดเกิน 10 ครั้ง → ปิดการจับคู่ ต้องเริ่มใหม่ในแอป", async () => {
  const clientId = await register("Guess");
  const c = await consent(clientId);
  const code = await startPairing();
  const wrong = code === "999999" ? "999998" : "999999";
  let last;
  for (let i = 0; i < 10; i += 1) last = await submit(c, { code: wrong });
  assert.match(last.body.error, /หลายครั้งเกินไป/);
  assert.equal((await submit(c, { code })).status, 409, "รหัสถูกก็ใช้ไม่ได้แล้ว");
  assert.equal((await appApi("GET", "/mcp/remote")).body.pairing.open, null);
});

test("code ใช้ซ้ำ = รั่ว → ยกเลิกการเชื่อมนั้นทั้งหมด", async () => {
  const { clientId, c, back, tokens } = await connect("claude.ai");
  assert.ok(tokens.access_token);
  const again = await tokenCall({ grant_type: "authorization_code", code: back.searchParams.get("code"), redirect_uri: REDIRECT, client_id: clientId, code_verifier: c.verifier });
  assert.equal(again.status, 400);
  assert.equal((await mcpCall(tokens.access_token, { jsonrpc: "2.0", id: 1, method: "ping" })).status, 401);
});

test("ปิดในแอป → gateway หยุดฟังทันที และปิดการจับคู่ที่ค้าง", async () => {
  await startPairing();
  const off = await appApi("PUT", "/mcp/remote", { enabled: false });
  assert.equal(off.body.gateway.running, false);
  assert.equal(off.body.pairing.open, null);
  await assert.rejects(fetch(`${GW}/.well-known/oauth-protected-resource`));
});
