#!/usr/bin/env node
// Sub360 MCP over stdio — the command AI apps on this computer start
// (Claude Desktop, Claude Code, Codex, Gemini CLI, Cursor …).
//
//   Sub360.exe  server/mcp-stdio.mjs   with ELECTRON_RUN_AS_NODE=1 and SUB360_HOME=<app data>
//   node        server/mcp-stdio.mjs   when running from source
//
// initialize / tools/list / ping are answered here, so an AI app that starts this at launch does
// not pop the Sub360 window open. Every tools/call is forwarded to the running Sub360 server
// (POST /mcp with the key from mcp-runtime.json); when Sub360 is not running it is opened first.
// stdout carries JSON-RPC only — every log line goes to stderr.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createMcp } from "./mcp/protocol.mjs";
import { createTools, INSTRUCTIONS } from "./mcp/tools.mjs";
import { readRuntime } from "./mcp/runtime.mjs";
import { listStyles, CAPTION_COLOR_SETS } from "../pipeline/styles.mjs";
import { TRANSLATE_LANGS } from "../pipeline/translate.mjs";

console.log = console.error; // a stray log on stdout would break the protocol

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.SUB360_HOME ? path.resolve(process.env.SUB360_HOME) : ROOT;
const NO_LAUNCH = process.env.SUB360_MCP_NO_LAUNCH === "1";
const LAUNCH_WAIT_MS = Number(process.env.SUB360_MCP_LAUNCH_WAIT_MS || 120_000);
const CALL_TIMEOUT_MS = 35 * 60_000; // copying an 8 GB video into a project takes a while

let version = "0";
try { version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version || version; } catch { /* keep 0 */ }

// Same tool list and instructions as the server, built from the same code — but nothing here runs a tool.
const offline = createMcp({
  version,
  instructions: INSTRUCTIONS,
  tools: createTools({
    api: null,
    catalog: { styles: listStyles, colorSets: CAPTION_COLOR_SETS, languages: TRANSLATE_LANGS },
    projectDir: () => HOME,
    showProject: async () => ({ shown: false }),
  }),
});

/* ---------- talking to the running server ---------- */

function post(info, body, timeoutMs = CALL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), "utf8");
    const req = http.request(new URL("/mcp", info.url), {
      method: "POST",
      timeout: timeoutMs,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "content-length": data.length,
        "x-sub360-mcp-key": info.key,
      },
    }, (res) => {
      const parts = [];
      res.on("data", (part) => parts.push(part));
      res.on("end", () => {
        const text = Buffer.concat(parts).toString("utf8");
        if (res.statusCode === 403) return reject(Object.assign(new Error("stale key"), { code: "STALE" }));
        if (res.statusCode === 202) return resolve(null);
        try { resolve(JSON.parse(text)); } catch { reject(new Error(`Sub360 ตอบ HTTP ${res.statusCode}`)); }
      });
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "TIMEOUT" })));
    req.on("error", reject);
    req.end(data);
  });
}

const notRunning = (error) => ["ECONNREFUSED", "ECONNRESET", "STALE", "EHOSTUNREACH"].includes(error?.code);

async function reachable(info, timeoutMs = 3000) {
  if (!info) return false;
  try {
    const out = await post(info, { jsonrpc: "2.0", id: "probe", method: "ping" }, timeoutMs);
    return Boolean(out?.result);
  } catch {
    return false;
  }
}

/** Opens Sub360 the way the user would: the app window when installed, the browser when run from source. */
function launchApp() {
  const exe = process.execPath;
  const base = path.basename(exe).toLowerCase();
  const env = { ...process.env, SUB360_HOME: HOME };
  delete env.ELECTRON_RUN_AS_NODE;
  let args;
  if (/^node(\.exe)?$/.test(base)) args = [path.join(ROOT, "server", "index.mjs"), "--open"];
  else if (base.startsWith("electron")) args = [ROOT];
  else args = []; // Sub360.exe / Sub360.app
  console.error(`[sub360-mcp] opening Sub360: ${exe} ${args.join(" ")}`);
  spawn(exe, args, { cwd: HOME, env, detached: true, stdio: "ignore" }).unref();
}

let launching = null;
async function ensureServer() {
  const info = readRuntime(HOME);
  if (await reachable(info)) return info;
  if (NO_LAUNCH) throw new Error("not running");
  launching ||= (async () => {
    launchApp();
    const until = Date.now() + LAUNCH_WAIT_MS;
    while (Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const next = readRuntime(HOME);
      if (await reachable(next)) return next;
    }
    throw new Error("launch timeout");
  })().finally(() => { launching = null; });
  return launching;
}

const toolError = (id, text) => ({
  jsonrpc: "2.0",
  id,
  result: { content: [{ type: "text", text }], isError: true },
});

async function forwardCall(msg) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let info;
    try {
      info = await ensureServer();
    } catch (error) {
      return toolError(msg.id, error.message === "launch timeout"
        ? "เปิด Sub360 แล้วแต่ยังไม่พร้อมภายใน 2 นาที — ให้ผู้ใช้ดูหน้าต่าง Sub360 (อาจกำลังอัปเดตหรือรอตั้งค่าครั้งแรก) แล้วสั่งใหม่"
        : "Sub360 ยังไม่ได้เปิด — ให้ผู้ใช้เปิดโปรแกรม Sub360 แล้วสั่งใหม่");
    }
    try {
      return await post(info, msg);
    } catch (error) {
      if (notRunning(error) && attempt === 0) continue; // closed or restarted meanwhile: find it again
      if (error.code === "TIMEOUT") return toolError(msg.id, "Sub360 ใช้เวลานานเกินไปกับคำสั่งนี้ — ดูความคืบหน้าในหน้าต่าง Sub360 หรือเรียก get_project");
      return toolError(msg.id, `ติดต่อ Sub360 ไม่ได้ (${String(error.message).slice(0, 120)}) — ให้ผู้ใช้ตรวจว่าโปรแกรมเปิดอยู่`);
    }
  }
  return toolError(msg.id, "ติดต่อ Sub360 ไม่ได้ — ให้ผู้ใช้เปิดโปรแกรมใหม่แล้วสั่งอีกครั้ง");
}

async function handle(msg) {
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map(handle))).flat().filter(Boolean);
    return out.length ? out : null;
  }
  if (msg && msg.method === "tools/call" && msg.id !== undefined && msg.id !== null) return forwardCall(msg);
  return offline.handle(msg);
}

/* ---------- stdio: one JSON-RPC message per line ---------- */

const write = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
const inFlight = new Set();
let closed = false;
const exitWhenDone = () => { if (closed && !inFlight.size) process.stdout.write("", () => process.exit(0)); };

async function onLine(line) {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  try {
    const out = await handle(msg);
    if (out) write(out);
  } catch (error) {
    console.error(`[sub360-mcp] ${error?.stack || error}`);
    if (msg?.id !== undefined) write({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "Internal error" } });
  }
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  const work = onLine(line).finally(() => { inFlight.delete(work); exitWhenDone(); });
  inFlight.add(work);
});
// The AI app closed our stdin: finish what is in flight, then exit.
lines.on("close", () => { closed = true; exitWhenDone(); });
