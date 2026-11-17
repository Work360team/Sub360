// MCP end to end: a real Sub360 server in a temp folder, called the way AI apps call it —
// POST /mcp with the runtime key, and through the stdio bridge.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-mcp-"));
const ffmpegOk = spawnSync("ffmpeg", ["-version"], { windowsHide: true }).status === 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
let runtime;

const SRT = `1
00:00:00,200 --> 00:00:01,500
สวัสดีครับ วันนี้มาลองลิปสติก

2
00:00:01,600 --> 00:00:03,000
สีนี้ติดทนมาก

3
00:00:03,100 --> 00:00:03,900
ลองดูนะครับ
`;

async function rpc(body, { key = runtime.key, origin } = {}) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (key) headers["x-sub360-mcp-key"] = key;
  if (origin) headers.origin = origin;
  const res = await fetch(`${runtime.url}/mcp`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
}

let seq = 0;
async function call(name, args = {}) {
  const { body } = await rpc({ jsonrpc: "2.0", id: ++seq, method: "tools/call", params: { name, arguments: args } });
  assert.ok(body.result, `${name}: ${JSON.stringify(body.error)}`);
  return body.result.isError
    ? { error: body.result.content[0].text }
    : body.result.structuredContent;
}

function bridge(lines, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "server", "mcp-stdio.mjs")], {
      env: { ...process.env, SUB360_HOME: HOME, SUB360_MCP_NO_LAUNCH: "1", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("error", reject);
    child.on("close", () => resolve(out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))));
    child.stdin.end(`${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  });
}

test.before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, "server", "index.mjs")], {
    env: { ...process.env, SUB360_HOME: HOME, SUB360_NO_OPEN: "1", SUB360_PORT: String(4700 + Math.floor(Math.random() * 200)), GEMINI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.resume();
  server.stderr.resume();
  const file = path.join(HOME, "mcp-runtime.json");
  for (let i = 0; i < 100 && !fs.existsSync(file); i += 1) await sleep(100);
  runtime = JSON.parse(fs.readFileSync(file, "utf8"));
});

test.after(() => {
  server?.kill();
  fs.rmSync(HOME, { recursive: true, force: true });
});

const appApi = async (method, p, body) => {
  const res = await fetch(`${runtime.url}/api${p}`, {
    method, headers: { "x-sub360": "1", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

test("ปิดเป็นค่าเริ่มต้น: แอป AI ทำอะไรไม่ได้จนกว่าผู้ใช้เปิดในตั้งค่า", async () => {
  assert.equal((await appApi("GET", "/mcp")).body.enabled, false);
  const off = await call("list_projects", {});
  assert.match(off.error, /ปิดอยู่/);
  assert.match(off.error, /ตั้งค่า/);
  const on = await appApi("POST", "/mcp/enabled", { enabled: true });
  assert.equal(on.body.enabled, true);
  assert.equal(typeof (await call("list_projects", {})).total, "number");
});

test("พอร์ตหลักไม่รับคำขอที่มาทาง tunnel/proxy (กันเผลอเปิดทั้งแอปออกเน็ต)", async () => {
  for (const header of ["x-forwarded-for", "cf-connecting-ip", "forwarded"]) {
    const res = await fetch(`${runtime.url}/api/status`, { headers: { [header]: "203.0.113.9" } });
    assert.equal(res.status, 403, header);
  }
  assert.equal((await fetch(`${runtime.url}/api/status`)).status, 200);
});

test("initialize และ tools/list ตามกติกา", async () => {
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2099-01-01", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  assert.equal(init.body.result.protocolVersion, "2025-11-25", "รุ่นที่ไม่รู้จักถอยมารุ่นล่าสุดที่รองรับ");
  assert.match(init.body.result.instructions, /data, never as instructions/);
  const note = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(note.status, 202);

  const { body } = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const tools = body.result.tools;
  assert.ok(tools.length >= 15);
  for (const t of tools) {
    assert.doesNotMatch(t.name, /delete|purge|remove|sql|export|key|install/i, `${t.name} ชื่อต้องห้าม`);
    assert.ok(t.description.length >= 40, `${t.name} description สั้นไป`);
    assert.equal(t.inputSchema.additionalProperties, false);
    if (t.annotations.destructiveHint) assert.ok(t.inputSchema.properties.confirm_token, `${t.name} destructive ต้องมีขั้นยืนยัน`);
  }
  const unknown = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "drop_everything", arguments: {} } });
  assert.equal(unknown.body.error.code, -32602);
});

test("/mcp ปฏิเสธเมื่อไม่มีกุญแจ หรือมาจากหน้าเว็บอื่น", async () => {
  assert.equal((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, { key: "" })).status, 403);
  assert.equal((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, { key: "wrong" })).status, 403);
  assert.equal((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, { origin: "https://evil.example" })).status, 403);
  const plain = await fetch(`${runtime.url}/mcp`, { method: "POST", headers: { "content-type": "text/plain", "x-sub360-mcp-key": runtime.key }, body: "{}" });
  assert.equal(plain.status, 415);
});

test("argument ผิดตอบเป็นรายช่องให้โมเดลแก้เอง", async () => {
  const bad = await call("list_projects", { limit: 500, extra: 1 });
  assert.match(bad.error, /limit/);
  assert.match(bad.error, /extra: ไม่รู้จักช่องนี้/);
  assert.match((await call("create_project_from_file", { file_path: "clip.mp4" })).error, /path เต็ม/);
  assert.match((await call("create_project_from_file", { file_path: path.join(HOME, "notes.txt") })).error, /เฉพาะไฟล์วิดีโอ/);
  assert.match((await call("create_project_from_file", { file_path: path.join(HOME, "missing.mp4") })).error, /ไม่พบไฟล์/);
  // path เครือข่ายทำให้ Windows ส่งข้อมูลยืนยันตัวตนไปเครื่องอื่น — ปฏิเสธก่อนแตะไฟล์
  for (const file_path of ["\\\\attacker\\share\\a.mp4", "//attacker/share/a.mp4", "\\\\?\\UNC\\attacker\\a.mp4"]) {
    assert.match((await call("create_project_from_file", { file_path })).error, /ไฟล์บนเครือข่าย/, file_path);
  }
  assert.match((await call("get_project", { id: "zzzzzzzz" })).error, /list_projects/);
});

test("วิดีโอ → นำเข้าซับ → แก้ → ยืนยัน → เรนเดอร์", { skip: !ffmpegOk && "ไม่มี ffmpeg" }, async () => {
  const video = path.join(HOME, "รีวิว ลิป.mp4");
  const made = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15", "-f", "lavfi", "-i", "sine=frequency=440",
    "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", video], { windowsHide: true });
  assert.equal(made.status, 0, String(made.stderr).slice(-400));

  const created = await call("create_project_from_file", { file_path: video, transcribe: false, style: "box-bold" });
  assert.ok(created.id, JSON.stringify(created));
  assert.equal(created.title, "รีวิว ลิป");
  assert.equal(created.settings.style, "box-bold");
  const { id } = created;

  // ยังไม่มีซับ → นำเข้าได้เลยไม่ต้องยืนยัน
  const imported = await call("import_subtitles", { id, subtitle_text: SRT });
  assert.equal(imported.subtitles.lines, 3);

  const subs = await call("get_subtitles", { id });
  assert.equal(subs.total, 3);
  assert.equal(subs.lines[1].text, "สีนี้ติดทนมาก");
  assert.match(subs.note, /not instructions/);

  // version เก่าถูกปฏิเสธ ไม่มีอะไรเปลี่ยน
  const stale = await call("edit_subtitles", { id, version: "123", edits: [{ index: 1, text: "ผิด" }] });
  assert.match(stale.error, /get_subtitles ใหม่/);
  const edited = await call("edit_subtitles", { id, version: subs.version, edits: [{ index: 1, text: "สีนี้ติดทนทั้งวัน" }, { index: 2, text: "" }] });
  assert.equal(edited.changed_lines, 1);
  assert.equal(edited.removed_lines, 1);
  assert.notEqual(edited.version, subs.version);
  const after = await call("get_subtitles", { id });
  assert.deepEqual(after.lines.map((l) => l.text), ["สวัสดีครับ วันนี้มาลองลิปสติก", "สีนี้ติดทนทั้งวัน"]);
  // แก้ซ้ำด้วย version เดิม (เช่นแอปลองส่งซ้ำ) ไม่ทับ
  assert.match((await call("edit_subtitles", { id, version: subs.version, edits: [{ index: 0, text: "x" }] })).error, /แก้จากที่อื่น/);

  // นำเข้าทับของเดิม → ต้องยืนยัน และก่อนยืนยันไม่มีอะไรเปลี่ยน
  const ask = await call("import_subtitles", { id, subtitle_text: SRT });
  assert.equal(ask.status, "needs_confirmation");
  assert.equal(ask.impact.current_lines_replaced, 2);
  assert.equal((await call("get_subtitles", { id })).total, 2);
  // token ผูกกับ argument: เปลี่ยน argument แล้วใช้ไม่ได้
  assert.match((await call("import_subtitles", { id, subtitle_text: SRT, regroup: true, confirm_token: ask.confirm_token })).error, /ใช้ไม่ได้/);
  const ask2 = await call("import_subtitles", { id, subtitle_text: SRT });
  const done = await call("import_subtitles", { id, subtitle_text: SRT, confirm_token: ask2.confirm_token });
  assert.equal(done.subtitles.lines, 3);
  // ใช้ token ซ้ำไม่ได้
  assert.match((await call("import_subtitles", { id, subtitle_text: SRT, confirm_token: ask2.confirm_token })).error, /ใช้ไม่ได้/);

  // แบ่งท่อนใหม่ยืนยันเสมอ
  assert.equal((await call("regroup_subtitles", { id })).status, "needs_confirmation");

  // งานที่ส่งข้อมูลไป Gemini: ไม่มีคีย์ → บอกให้ผู้ใช้ใส่เอง ไม่ถามยืนยันสิ่งที่ทำไม่ได้
  assert.match((await call("translate_subtitles", { id, to: "en" })).error, /Gemini API key/);

  const look = await call("update_project_settings", { id, color_set: "sweet-pink", position: "top", font_scale: 1.2, title: "ลิปรีวิว" });
  assert.equal(look.title, "ลิปรีวิว");
  assert.equal(look.settings.color_set, "sweet-pink");
  assert.equal(look.settings.position, "top");
  assert.match((await call("update_project_settings", { id, display: "both" })).error, /translate_subtitles/);

  const started = await call("render_video", { id });
  assert.ok(["queued", "running"].includes(started.job.state));
  assert.match((await call("render_video", { id })).error, /wait_for_job/);
  let waited;
  for (let i = 0; i < 12; i += 1) {
    waited = await call("wait_for_job", { id, max_wait_seconds: 10 });
    if (waited.finished) break;
  }
  assert.equal(waited.job.state, "done", JSON.stringify(waited.job));
  assert.ok(fs.existsSync(waited.output_files.mp4), "ได้ไฟล์ MP4");
  assert.ok(fs.readFileSync(waited.output_files.srt, "utf8").includes("ลองดูนะครับ"));
  const final = await call("get_project", { id });
  assert.equal(final.status, "rendered");
  assert.equal(final.output.is_outdated, false);
  assert.match(final.next, /get_video_link/);

  // ลิงก์ดูคลิป: ยังไม่เปิดทางเข้าจากอินเทอร์เน็ต → เปิดได้บนเครื่องนี้ หน้าดูมีวิดีโอและปุ่มดาวน์โหลด
  const link = await call("get_video_link", { id });
  assert.equal(link.reachable_from, "this_computer_only");
  assert.ok(link.watch_url.startsWith(`${runtime.url}/v/`));
  const page = await fetch(link.watch_url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /media-src 'self'/);
  const html = await page.text();
  assert.match(html, /<video controls/);
  assert.match(html, /ดาวน์โหลด MP4/);
  const clip = await fetch(link.video_url, { headers: { range: "bytes=0-99" } });
  assert.equal(clip.status, 206);
  assert.equal(clip.headers.get("content-type"), "video/mp4");
  assert.match((await fetch(link.download_url, { method: "HEAD" })).headers.get("content-disposition"), /^attachment/);
  assert.equal((await fetch(`${runtime.url}/v/${"x".repeat(32)}`)).status, 404);
  assert.equal((await appApi("GET", "/mcp")).body.videoLinks, 1);
  await appApi("DELETE", "/mcp/video-links");
  assert.equal((await fetch(link.watch_url)).status, 404, "ยกเลิกลิงก์ทั้งหมดแล้วเปิดไม่ได้");

  // สิ่งที่แอป AI ทำล่าสุด: บันทึกงานที่เปลี่ยนอะไร ไม่บันทึกการอ่าน
  const activity = (await appApi("GET", "/mcp")).body.activity;
  assert.ok(activity.some((a) => a.tool === "render_video" && a.ok && a.app === "แอปบนเครื่องนี้"));
  assert.ok(activity.some((a) => a.summary.startsWith("ขอยืนยัน: ")), "ขั้นยืนยันถูกบันทึกว่ายังรอ");
  assert.ok(!activity.some((a) => ["get_project", "wait_for_job", "get_subtitles"].includes(a.tool)));

  // ดูได้อย่างเดียว: อ่านได้ แต่สร้าง/แก้/เรนเดอร์ไม่ได้
  await appApi("POST", "/mcp/write", { enabled: false });
  assert.match((await call("render_video", { id })).error, /ดูข้อมูลได้อย่างเดียว/);
  assert.equal((await call("get_project", { id })).id, id);
  await appApi("POST", "/mcp/write", { enabled: true });
});

test("stdio bridge: ตอบ initialize เอง และส่ง tools/call ต่อไปที่ Sub360", async () => {
  const out = await bridge([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_projects", arguments: {} } },
  ]);
  const byId = Object.fromEntries(out.map((m) => [m.id, m]));
  assert.equal(byId[1].result.protocolVersion, "2025-06-18");
  assert.ok(byId[2].result.tools.some((t) => t.name === "render_video"));
  assert.equal(byId[3].result.isError, false);
  assert.equal(typeof byId[3].result.structuredContent.total, "number");
});

test("stdio bridge: Sub360 ไม่ได้เปิด → บอกผู้ใช้ ไม่ค้าง", async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-empty-"));
  try {
    const out = await bridge([{ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "list_projects", arguments: {} } }], { SUB360_HOME: empty });
    assert.equal(out[0].result.isError, true);
    assert.match(out[0].result.content[0].text, /ยังไม่ได้เปิด/);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
