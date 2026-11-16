// Remote MCP gateway — what the Cloudflare tunnel points at, for ChatGPT, Gemini and claude.ai.
//
// A separate listener from the app: it only knows /mcp, /oauth/* and /.well-known/*, so even a
// misconfigured tunnel can never reach /api or the app pages. AI apps sign in with OAuth 2.1
// (PKCE S256, dynamic client registration, rotating refresh tokens).
//
// The "login" is pairing: when the AI app opens the consent page, the Sub360 window comes up with a
// one-time 6-digit code (or the person presses "connect a new AI app"), and the person types it on
// that page. The code travels from the window to the person's own browser, never the other way
// round, so a stranger who knows the tunnel address and opens the consent page gets nowhere unless
// someone reads the code out to them — there is no "Allow" button to trick anyone into pressing.
// Ten wrong codes close the pairing and stop automatic pairing for ten minutes (no brute force).
//
// Lessons kept from the webapp-mcp-connector kit (proven with the three apps):
//   - every /mcp method without a token answers 401 + resource_metadata (Gemini probes GET/HEAD)
//   - /.well-known/openid-configuration is served too, at the root and after /mcp (Gemini)
//   - state can be ~1,700 characters (Gemini) → accept up to 8,000
//   - the consent page never answers a form POST with 302 (Chrome blocks it under CSP form-action):
//     the page posts with fetch and navigates itself
import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { readBody, sendJson, serveMcp } from "./http.mjs";

const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 30 * 86_400_000;
const CODE_TTL_MS = 5 * 60_000;
const PAIRING_TTL_MS = 10 * 60_000;
const PAIRING_MAX_FAILURES = 10;
const AUTO_PAIRING_LOCK_MS = 10 * 60_000;
const FILE_LINK_TTL_MS = 3 * 86_400_000;
const ROTATE_GRACE_MS = 60_000;
const REUSE_WATCH_MS = 86_400_000; // a rotated refresh token is kept a day to catch reuse
const MAX_CLIENTS = 300;
const REGISTER_PER_IP_HOUR = 20;

const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");
const pkce = (verifier) => createHash("sha256").update(String(verifier)).digest("base64url");
const secret = (bytes = 32) => randomBytes(bytes).toString("base64url");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sameText = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, accept",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-expose-headers": "www-authenticate",
};

function isLoopback(host) {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host);
}

/** https anywhere, or http only back to this computer (Claude Code, MCP Inspector) */
function validRedirect(raw) {
  if (typeof raw !== "string" || raw.length > 500) return false;
  let url;
  try { url = new URL(raw); } catch { return false; }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && isLoopback(url.hostname);
}

/** Where the AI app's redirect goes, named for the consent page. Not proof of anything — only a hint. */
export function knownApp(redirectUri) {
  let url;
  try { url = new URL(redirectUri); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (isLoopback(host)) return "แอปบนเครื่องนี้ (เช่น Claude Code)";
  if (["chatgpt.com", "chat.openai.com"].includes(host)) return "ChatGPT";
  if (["claude.ai", "claude.com"].includes(host)) return "Claude";
  if (host.endsWith(".googleusercontent.com") || host === "gemini.google.com") return "Gemini";
  return null;
}

function withParams(base, params) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  return url.toString();
}

async function readForm(req, limit = 64 * 1024) {
  const text = await readBody(req, limit);
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/json")) {
    try {
      const body = JSON.parse(text || "{}");
      return body && typeof body === "object" && !Array.isArray(body) ? body : {};
    } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

/** The visitor's address as Cloudflare saw it; requests from this computer have none. */
const clientIp = (req) => String(req.headers["cf-connecting-ip"] || "local").slice(0, 64);

/**
 * createGateway({ store, mcp, publicUrl, onPairing, files, log })
 *   publicUrl()       "https://<tunnel host>" or null while the tunnel is not up
 *   onPairing(status) an AI app opened the consent page: show the code in the Sub360 window
 *   files.resolve(projectId, kind) → { path, name } of a rendered output, or null
 */
export function createGateway({ store, mcp, publicUrl, onPairing = () => {}, files = null, log = console.error }) {
  const codes = new Map(); // sha256(code) → authorization code record
  const registrations = new Map(); // ip → { since, count }
  let pairing = null; // { code, expiresAt, failures, auto, requesters: [{ clientName, redirectHost, at }] }
  let lastConnected = null; // { clientName, at } — the window shows "connected" after pairing
  let autoLockedUntil = 0; // after too many wrong codes, consent visits stop opening pairings for a while

  const base = () => publicUrl();
  const resourceUrl = () => `${base()}/mcp`;
  const challenge = (extra = "") => `Bearer resource_metadata="${base()}/.well-known/oauth-protected-resource/mcp"${extra}`;

  function sweep() {
    const now = Date.now();
    for (const [hash, c] of codes) if (c.expiresAt < now && !c.used) codes.delete(hash);
    for (const [hash, c] of codes) if (c.used && c.expiresAt < now - 3_600_000) codes.delete(hash);
    for (const [ip, r] of registrations) if (now - r.since > 3_600_000) registrations.delete(ip);
    if (pairing && pairing.expiresAt < now) pairing = null;
  }

  /* ---------- pairing ---------- */

  const newPairing = (auto) => ({
    code: String(randomInt(0, 1_000_000)).padStart(6, "0"),
    expiresAt: Date.now() + PAIRING_TTL_MS,
    failures: 0,
    auto,
    requesters: [],
  });

  /** The person pressed "connect a new AI app" in the window (also lifts the automatic-pairing lock). */
  function startPairing() {
    pairing = newPairing(false);
    lastConnected = null;
    autoLockedUntil = 0;
    return pairingStatus();
  }

  /**
   * An AI app opened the consent page: open a pairing (or reuse the open one) and note who asked,
   * so the window can show the code with the app's name. → true when the window should come up.
   */
  function pairingForRequest(r) {
    sweep();
    if (!pairing) {
      if (Date.now() < autoLockedUntil) return false;
      pairing = newPairing(true);
      lastConnected = null;
    }
    const seen = pairing.requesters.find((x) => x.clientName === r.clientName && x.redirectHost === r.redirectHost);
    if (seen) seen.at = Date.now();
    else pairing.requesters = [...pairing.requesters, { clientName: r.clientName, redirectHost: r.redirectHost, at: Date.now() }].slice(-5);
    return true;
  }

  function cancelPairing() {
    pairing = null;
  }

  function pairingStatus() {
    sweep();
    return {
      open: pairing ? { code: pairing.code, expiresAt: pairing.expiresAt, auto: pairing.auto, requesters: pairing.requesters } : null,
      lastConnected,
      autoLockedUntil: autoLockedUntil > Date.now() ? autoLockedUntil : null,
    };
  }

  /* ---------- metadata ---------- */

  const protectedResource = () => ({
    resource: resourceUrl(),
    authorization_servers: [base()],
    scopes_supported: ["sub360"],
    bearer_methods_supported: ["header"],
    resource_name: "Sub360",
  });

  const authServer = () => ({
    issuer: base(),
    authorization_endpoint: `${base()}/oauth/authorize`,
    token_endpoint: `${base()}/oauth/token`,
    registration_endpoint: `${base()}/oauth/register`,
    revocation_endpoint: `${base()}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["sub360"],
    subject_types_supported: ["public"],
    authorization_response_iss_parameter_supported: true,
  });

  /* ---------- registration ---------- */

  async function register(req, res) {
    sweep();
    const ip = clientIp(req);
    const seen = registrations.get(ip) || { since: Date.now(), count: 0 };
    if (seen.count >= REGISTER_PER_IP_HOUR) {
      return sendJson(res, 429, { error: "temporarily_unavailable", error_description: "Too many registrations, try again later" }, CORS);
    }
    const body = await readForm(req);
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) {
      return sendJson(res, 400, { error: "invalid_redirect_uri", error_description: "redirect_uris must be https URLs (or http on localhost)" }, CORS);
    }
    // Count only real registrations, and make room by dropping the oldest unused one.
    registrations.set(ip, { since: seen.since, count: seen.count + 1 });
    if (store.clientCount() >= MAX_CLIENTS && !store.dropOldestUnusedClient()) {
      return sendJson(res, 429, { error: "temporarily_unavailable", error_description: "Too many registered apps" }, CORS);
    }
    // No client secrets here: every client is public and proves itself with PKCE (answered as "none").
    const id = secret(18);
    const name = String(body.client_name || "AI app").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80) || "AI app";
    store.addClient(id, { name, redirectUris: uris });
    return sendJson(res, 201, {
      client_id: id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }, CORS);
  }

  /* ---------- consent ---------- */

  /**
   * Checks an authorization request (from the query, or re-sent by the consent page).
   * → { error: page text } when nothing may be redirected · { fail(error, text) } · { ok: request }
   */
  function checkRequest(q) {
    const client = store.client(String(q.client_id || ""));
    if (!client) return { page: "แอปนี้ยังไม่ได้ลงทะเบียนกับ Sub360 — ลองเพิ่มการเชื่อมต่อใหม่ในแอป AI" };
    const redirectUri = String(q.redirect_uri || (client.redirectUris.length === 1 ? client.redirectUris[0] : ""));
    if (!client.redirectUris.includes(redirectUri)) return { page: "ที่อยู่ปลายทางไม่ตรงกับที่แอปลงทะเบียนไว้" };
    const state = String(q.state || "");
    const fail = (error, description) => ({ redirect: withParams(redirectUri, { error, error_description: description, state, iss: base() }) });
    if (q.response_type !== "code") return fail("unsupported_response_type", "Only code is supported");
    if (q.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(String(q.code_challenge || ""))) {
      return fail("invalid_request", "PKCE with S256 is required");
    }
    if (state.length > 8000) return fail("invalid_request", "state too long");
    const resource = q.resource ? String(q.resource).replace(/\/$/, "") : "";
    if (resource && resource !== resourceUrl() && resource !== base()) return fail("invalid_target", "Unknown resource");
    return {
      ok: {
        client_id: String(q.client_id),
        clientName: client.name,
        redirect_uri: redirectUri,
        redirectHost: new URL(redirectUri).host,
        code_challenge: String(q.code_challenge),
        state,
        resource,
      },
    };
  }

  function authorize(res, url) {
    const checked = checkRequest(Object.fromEntries(url.searchParams));
    if (checked.page) return errorPage(res, 400, "เชื่อมต่อไม่ได้", checked.page);
    if (checked.redirect) {
      res.writeHead(302, { location: checked.redirect, "cache-control": "no-store" });
      return res.end();
    }
    // Bring the Sub360 window up with the code (the caller throttles how often the window pops up).
    if (pairingForRequest(checked.ok)) onPairing(pairingStatus());
    const nonce = secret(12);
    res.writeHead(200, pageHeaders(nonce));
    return res.end(consentPage(checked.ok, nonce));
  }

  /** The consent page sends the code the person read in the Sub360 window (or cancels). */
  async function pair(req, res) {
    sweep();
    const body = await readForm(req, 32 * 1024);
    const checked = checkRequest(body);
    if (checked.page) return sendJson(res, 400, { error: checked.page });
    if (checked.redirect) return sendJson(res, 200, { redirect: checked.redirect });
    const r = checked.ok;
    if (body.cancel === true) {
      return sendJson(res, 200, { redirect: withParams(r.redirect_uri, { error: "access_denied", error_description: "The user cancelled", state: r.state, iss: base() }) });
    }
    if (!pairing) {
      return sendJson(res, 409, { error: "ยังไม่ได้เริ่มเชื่อมแอปใหม่ใน Sub360 หรือรหัสหมดอายุแล้ว — เปิด Sub360 → เชื่อมต่อ AI → กด \"เชื่อมแอป AI ใหม่\" แล้วพิมพ์รหัสที่ขึ้นมา" });
    }
    if (!sameText(String(body.code || "").replace(/\D/g, ""), pairing.code)) {
      pairing.failures += 1;
      if (pairing.failures >= PAIRING_MAX_FAILURES) {
        pairing = null;
        autoLockedUntil = Date.now() + AUTO_PAIRING_LOCK_MS;
        return sendJson(res, 403, { error: "รหัสผิดหลายครั้งเกินไป — กด \"เชื่อมแอป AI ใหม่\" ในหน้าต่าง Sub360 เพื่อรับรหัสใหม่" });
      }
      return sendJson(res, 403, { error: `รหัสไม่ถูกต้อง — ดูรหัสในหน้าต่าง Sub360 อีกครั้ง (ลองได้อีก ${PAIRING_MAX_FAILURES - pairing.failures} ครั้ง)` });
    }
    pairing = null; // one code, one connection
    lastConnected = { clientName: r.clientName, redirectHost: r.redirectHost, at: Date.now() };
    const code = secret(32);
    codes.set(sha256(code), {
      clientId: r.client_id,
      clientName: r.clientName,
      redirectHost: r.redirectHost,
      redirectUri: r.redirect_uri,
      codeChallenge: r.code_challenge,
      expiresAt: Date.now() + CODE_TTL_MS,
      used: false,
      grantId: null,
    });
    return sendJson(res, 200, { redirect: withParams(r.redirect_uri, { code, state: r.state, iss: base() }) });
  }

  function errorPage(res, status, title, text) {
    res.writeHead(status, pageHeaders());
    res.end(page(title, `<p>${esc(text)}</p>`));
  }

  /* ---------- tokens ---------- */

  function issueTokens(grantId, clientId) {
    const access = secret(32);
    const refresh = secret(32);
    const now = Date.now();
    store.addTokens([
      [sha256(access), { grantId, clientId, kind: "access", expiresAt: now + ACCESS_TTL_S * 1000 }],
      [sha256(refresh), { grantId, clientId, kind: "refresh", expiresAt: now + REFRESH_TTL_MS }],
    ]);
    return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: "sub360" };
  }

  const tokenError = (res, error, description, status = 400) => sendJson(res, status, { error, error_description: description }, CORS);

  async function tokenEndpoint(req, res) {
    sweep();
    const body = await readForm(req);
    if (body.grant_type === "authorization_code") {
      const hash = sha256(body.code || "");
      const c = codes.get(hash);
      if (c?.used) {
        // A code used twice means it leaked: drop the whole connection.
        if (c.grantId) store.revokeGrant(c.grantId);
        return tokenError(res, "invalid_grant", "Code already used");
      }
      if (!c || c.expiresAt < Date.now()) return tokenError(res, "invalid_grant", "Code is invalid or expired");
      if (body.client_id && body.client_id !== c.clientId) return tokenError(res, "invalid_grant", "Code was issued to another client");
      if (body.redirect_uri && body.redirect_uri !== c.redirectUri) return tokenError(res, "invalid_grant", "redirect_uri does not match");
      if (!body.code_verifier || pkce(body.code_verifier) !== c.codeChallenge) return tokenError(res, "invalid_grant", "PKCE verification failed");
      // The connection exists from the first successful exchange (an unused code leaves nothing behind).
      const grantId = secret(12);
      store.addGrant(grantId, { clientId: c.clientId, clientName: c.clientName, redirectHost: c.redirectHost });
      c.used = true;
      c.grantId = grantId;
      return sendJson(res, 200, issueTokens(grantId, c.clientId), CORS);
    }
    if (body.grant_type === "refresh_token") {
      const hash = sha256(body.refresh_token || "");
      const t = store.token(hash);
      const grant = t && store.grant(t.grantId);
      if (!t || t.kind !== "refresh" || !grant || grant.revokedAt) {
        return tokenError(res, "invalid_grant", "Refresh token is invalid or the connection was cancelled in Sub360");
      }
      if (body.client_id && body.client_id !== t.clientId) return tokenError(res, "invalid_grant", "Token was issued to another client");
      if (t.rotatedAt && Date.now() - t.rotatedAt > ROTATE_GRACE_MS) {
        // Reuse after rotation: someone else holds a copy. Cancel the connection (OAuth 2.1 reuse detection).
        store.revokeGrant(t.grantId);
        return tokenError(res, "invalid_grant", "Refresh token was already used; the connection was cancelled for safety");
      }
      if (t.expiresAt < Date.now()) return tokenError(res, "invalid_grant", "Refresh token expired");
      // A short grace lets an app that retried a refresh in parallel keep working.
      store.rotate(hash, REUSE_WATCH_MS);
      return sendJson(res, 200, issueTokens(t.grantId, t.clientId), CORS);
    }
    return tokenError(res, "unsupported_grant_type", "Use authorization_code or refresh_token");
  }

  async function revokeEndpoint(req, res) {
    const body = await readForm(req);
    const hash = sha256(body.token || "");
    const t = store.token(hash);
    if (t?.kind === "refresh") store.revokeGrant(t.grantId);
    else if (t) store.dropToken(hash);
    res.writeHead(200, { ...CORS, "cache-control": "no-store" });
    res.end();
  }

  /** Bearer → grant, or null */
  function authenticate(req) {
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ""));
    if (!m) return { grant: null, given: false };
    const t = store.token(sha256(m[1]));
    const grant = t && t.kind === "access" && t.expiresAt > Date.now() ? store.grant(t.grantId) : null;
    if (!grant || grant.revokedAt) return { grant: null, given: true };
    store.touchGrant(t.grantId);
    return { grant: { id: t.grantId, ...grant }, given: true };
  }

  /* ---------- online links to rendered files ---------- */
  // /files/<project>/<kind>?e=<expiry>&s=<HMAC> — anyone with the link can watch or download that one
  // file until it expires (3 days), and only while Sub360 and the tunnel are running. The key lives in
  // mcp-remote.json; changing it (store.resetLinkKey) kills every link at once.

  const FILE_TYPES = {
    ".mp4": "video/mp4", ".srt": "text/plain; charset=utf-8", ".ass": "text/plain; charset=utf-8",
    ".vtt": "text/vtt; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  };
  const signFile = (id, kind, exp) => createHmac("sha256", store.linkKey()).update(`${id}\n${kind}\n${exp}`).digest("base64url");

  /** A link to a rendered file, or null while there is no public address. */
  function fileLink(id, kind, ttlMs = FILE_LINK_TTL_MS) {
    if (!base()) return null;
    const exp = Math.floor((Date.now() + ttlMs) / 1000);
    return `${base()}/files/${encodeURIComponent(id)}/${encodeURIComponent(kind)}?e=${exp}&s=${signFile(id, kind, exp)}`;
  }

  function serveFile(req, res, id, kind, url) {
    const exp = Number(url.searchParams.get("e"));
    const valid = /^[a-z0-9]{6,32}$/.test(id) && /^[A-Za-z0-9]{2,20}$/.test(kind) && Number.isInteger(exp)
      && exp * 1000 > Date.now() && sameText(url.searchParams.get("s") || "", signFile(id, kind, exp));
    if (!valid) return sendJson(res, 403, { error: "ลิงก์นี้หมดอายุหรือไม่ถูกต้อง — ขอลิงก์ใหม่จากแอป AI (get_project)" });
    const file = files?.resolve(id, kind);
    let stat = null;
    try { stat = file && fs.statSync(file.path); } catch { /* gone */ }
    if (!stat?.isFile()) return sendJson(res, 404, { error: "ไม่พบไฟล์นี้แล้ว — อาจถูกลบหรือเรนเดอร์ใหม่" });
    const headers = {
      "content-type": FILE_TYPES[path.extname(file.path).toLowerCase()] || "application/octet-stream",
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    };
    // Subtitle text came from the video's speech: never let a browser treat it as a page.
    if (!headers["content-type"].startsWith("video/")) headers["content-security-policy"] = "default-src 'none'; sandbox";
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || start > end) {
        res.writeHead(416, { "content-range": `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${stat.size}`, "content-length": end - start + 1 });
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(file.path, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, "content-length": stat.size });
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(file.path).pipe(res);
  }

  /* ---------- routing ---------- */

  async function handle(req, res) {
    const url = new URL(req.url, "http://gateway");
    const p = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (!base()) return sendJson(res, 503, { error: "Sub360 tunnel is starting" });
      // Only the public address is served: blocks DNS rebinding from web pages on this computer.
      if (String(req.headers.host || "").toLowerCase() !== new URL(base()).host) {
        return sendJson(res, 421, { error: "misdirected request" });
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS);
        return res.end();
      }
      if (req.method === "GET" || req.method === "HEAD") {
        if (p === "/.well-known/oauth-protected-resource" || p === "/.well-known/oauth-protected-resource/mcp") {
          return sendJson(res, 200, protectedResource(), CORS);
        }
        if ([
          "/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/mcp",
          "/.well-known/openid-configuration", "/.well-known/openid-configuration/mcp", "/mcp/.well-known/openid-configuration",
        ].includes(p)) {
          return sendJson(res, 200, authServer(), CORS);
        }
        if (p === "/oauth/authorize") return authorize(res, url);
        const fileRoute = /^\/files\/([^/]+)\/([^/]+)$/.exec(p);
        if (fileRoute) return serveFile(req, res, decodeURIComponent(fileRoute[1]), decodeURIComponent(fileRoute[2]), url);
      }
      if (req.method === "POST" && p === "/oauth/authorize/pair") return await pair(req, res);
      if (req.method === "POST" && p === "/oauth/register") return await register(req, res);
      if (req.method === "POST" && p === "/oauth/token") return await tokenEndpoint(req, res);
      if (req.method === "POST" && p === "/oauth/revoke") return await revokeEndpoint(req, res);
      if (p === "/mcp") {
        const { grant, given } = authenticate(req);
        if (!grant) {
          res.writeHead(401, { ...CORS, "www-authenticate": challenge(given ? ', error="invalid_token"' : ""), "cache-control": "no-store" });
          return res.end();
        }
        if (req.method === "GET" || req.method === "HEAD" || req.method === "DELETE") {
          res.writeHead(405, { ...CORS, allow: "POST" });
          return res.end();
        }
        res.setHeader("access-control-allow-origin", "*");
        return await serveMcp(req, res, mcp, { remote: true, client: `grant:${grant.id}` });
      }
      if (p === "/") {
        res.writeHead(200, pageHeaders());
        return res.end(page("Sub360", `<p>ที่อยู่นี้ใช้เชื่อม Sub360 กับแอป AI — วาง <code>${esc(resourceUrl())}</code> ในหน้าเพิ่มการเชื่อมต่อของแอป AI</p>`));
      }
      return sendJson(res, 404, { error: "not found" });
    } catch (error) {
      log(`[mcp-gateway] ${error?.stack || error}`);
      if (!res.headersSent) sendJson(res, error.status || 500, { error: "server_error" });
      else res.destroy();
    }
  }

  return { handle, startPairing, cancelPairing, pairingStatus, fileLink };
}

/* ---------- pages ---------- */

function pageHeaders(nonce = "") {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; ${nonce ? `script-src 'nonce-${nonce}'; ` : ""}connect-src 'self'; img-src data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`,
  };
}

function page(title, body, script = "", nonce = "") {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{--bg:#f5f4ef;--card:#fff;--ink:#1c201d;--muted:#5d6259;--line:#d9d7cd;--accent:#ffd23f;--warn:#9d4f46;--warn-bg:#fff0ed}
@media (prefers-color-scheme:dark){:root{--bg:#111412;--card:#1c201d;--ink:#f5f4ef;--muted:#b7bab2;--line:#3a403a;--warn:#ffb4a8;--warn-bg:#3a2522}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--ink);font:16px/1.65 "Leelawadee UI","Noto Sans Thai",Tahoma,sans-serif}
.card{width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px 24px;text-align:center}
.mark{width:52px;height:52px}h1{font-size:21px;margin:12px 0 6px}p{margin:8px 0;color:var(--muted)}b{color:var(--ink)}
.warn{margin:12px 0;padding:10px 12px;border-radius:12px;background:var(--warn-bg);color:var(--warn);font-size:14px;text-align:left}
input{width:100%;margin:14px 0 10px;padding:12px;border:2px solid var(--line);border-radius:14px;background:var(--bg);color:var(--ink);font:700 32px/1.2 ui-monospace,Consolas,monospace;letter-spacing:.3em;text-align:center}
input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(255,210,63,.35)}
button{width:100%;min-height:46px;margin-top:6px;border:0;border-radius:12px;font:600 16px "Leelawadee UI",Tahoma,sans-serif;cursor:pointer}
.go{background:var(--accent);color:#1c201d}.go:disabled{opacity:.6;cursor:wait}.cancel{background:transparent;color:var(--muted)}
.state{min-height:1.6em;margin-top:10px;font-weight:600;color:var(--ink)}.state.err{color:var(--warn)}code{word-break:break-all}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
</style></head><body><main class="card">
<svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="#ffd23f"/><rect x="7" y="23" width="26" height="8" rx="4" fill="#1c201d"/><rect x="11" y="12" width="18" height="5.5" rx="2.75" fill="#1c201d"/></svg>
<h1>${esc(title)}</h1>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body></html>`;
}

function consentPage(r, nonce) {
  const app = knownApp(r.redirect_uri);
  const body = `<p><b>${esc(r.clientName)}</b> ขอเชื่อมต่อกับ Sub360 บนคอมพิวเตอร์ของคุณ<br>แล้วจะพากลับไปที่ <b>${esc(r.redirectHost)}</b></p>
${app ? "" : `<div class="warn">ปลายทางนี้ไม่ใช่แอป AI ที่ Sub360 รู้จัก — ทำต่อเฉพาะเมื่อคุณตั้งใจเชื่อมแอปนี้เอง</div>`}
<p>หน้าต่าง Sub360 บนเครื่องของคุณจะขึ้นมาพร้อม<b>รหัส 6 หลัก</b> พิมพ์รหัสนั้นที่นี่<br><small>ถ้าไม่ขึ้น: เปิด Sub360 → เชื่อมต่อ AI → กด เชื่อมแอป AI ใหม่</small></p>
<label for="code" class="sr">รหัสจาก Sub360</label>
<input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" aria-describedby="state" autofocus>
<button class="go" id="go">เชื่อมต่อ</button><button class="cancel" id="cancel">ยกเลิก</button>
<p class="state" id="state" role="status" aria-live="polite"></p>
<p style="font-size:13px">อย่าพิมพ์รหัสนี้ในเว็บที่คนอื่นส่งมาให้ — ใช้เฉพาะหน้าที่แอป AI ของคุณเปิดขึ้นมา</p>`;
  // Request fields go back with the code; the server checks them again (nothing is kept per request).
  const fields = JSON.stringify({
    response_type: "code", client_id: r.client_id, redirect_uri: r.redirect_uri, code_challenge: r.code_challenge,
    code_challenge_method: "S256", state: r.state, resource: r.resource,
  }).replace(/</g, "\\u003c");
  const script = `const f=${fields};const s=document.getElementById("state"),c=document.getElementById("code"),g=document.getElementById("go");
async function send(extra){g.disabled=true;s.className="state";s.textContent="กำลังตรวจรหัส…";
try{const res=await fetch("/oauth/authorize/pair",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...f,...extra})});
const d=await res.json();if(d.redirect){s.textContent=extra.cancel?"ยกเลิกแล้ว กำลังพากลับ…":"เชื่อมต่อแล้ว กำลังพากลับ…";location.replace(d.redirect);return;}
s.className="state err";s.textContent=d.error||"เชื่อมต่อไม่สำเร็จ";}catch(e){s.className="state err";s.textContent="ติดต่อ Sub360 ไม่ได้ ลองอีกครั้ง";}
g.disabled=false;c.focus();}
g.addEventListener("click",()=>send({code:c.value}));c.addEventListener("keydown",(e)=>{if(e.key==="Enter")send({code:c.value});});
document.getElementById("cancel").addEventListener("click",()=>send({cancel:true}));`;
  return page("เชื่อมต่อแอป AI กับ Sub360", body, script, nonce);
}
